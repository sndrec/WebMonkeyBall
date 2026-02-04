export interface Env {
  LOBBY: DurableObjectNamespace;
  ROOM: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string;
}

type RoomSettings = {
  maxPlayers: number;
  collisionEnabled: boolean;
  locked: boolean;
};

type RoomMeta = {
  status: "lobby" | "in_game";
  gameSource?: "smb1" | "smb2" | "mb2ws";
  courseLabel?: string;
  stageLabel?: string;
  stageId?: number;
  roomName?: string;
};

type PlayerRecord = {
  playerId: number;
  token: string;
  joinedAt: number;
  lastActiveAt: number;
  connected: boolean;
};

type RoomRecord = {
  roomId: string;
  roomCode?: string;
  isPublic: boolean;
  hostId: number;
  hostToken: string;
  courseId: string;
  settings: RoomSettings;
  meta?: RoomMeta;
  createdAt: number;
  lastActiveAt: number;
  players: Record<string, PlayerRecord>;
};

type LobbyState = {
  rooms: Record<string, RoomRecord>;
  codes: Record<string, string>;
};

const ROOM_TTL_MS = 1000 * 60;
const PLAYER_TTL_MS = 1000 * 30;
const PLAYER_JOIN_GRACE_MS = 1000 * 20;
const MAX_PLAYERS = 8;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CREATE_RATE_LIMIT = { windowMs: 60_000, max: 10 };
const JOIN_RATE_LIMIT = { windowMs: 60_000, max: 30 };
const SIGNAL_MAX_MESSAGE_BYTES = 32 * 1024;
const SIGNAL_RATE_WINDOW_MS = 1000;
const SIGNAL_RATE_MAX_MESSAGES = 30;
const SIGNAL_RATE_MAX_BYTES = 64 * 1024;

type RateLimit = { count: number; resetAt: number };

function getCorsOrigin(request: Request, env: Env): string | null {
  const allowlist = env.ALLOWED_ORIGINS?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [];
  if (allowlist.length === 0) {
    return "*";
  }
  const origin = request.headers.get("origin");
  if (!origin) {
    return null;
  }
  return allowlist.includes(origin) ? origin : null;
}

function jsonResponse(data: any, status = 200, origin: string | null = "*"): Response {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) {
    headers["access-control-allow-origin"] = origin;
  }
  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

function parseJson<T>(req: Request): Promise<T> {
  return req.json() as Promise<T>;
}

function randomCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

function nowMs() {
  return Date.now();
}

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function randomToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function randomPlayerId(existing: Set<number>): number {
  for (let i = 0; i < 10; i += 1) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const id = buf[0] >>> 0;
    if (id === 0 || existing.has(id)) {
      continue;
    }
    return id;
  }
  let fallback = 1;
  while (existing.has(fallback)) {
    fallback += 1;
  }
  return fallback;
}

function playerKey(playerId: number): string {
  return String(playerId);
}

function sanitizeSettings(input?: Partial<RoomSettings>): RoomSettings {
  const maxPlayers = clampInt(Number(input?.maxPlayers ?? MAX_PLAYERS), 1, MAX_PLAYERS);
  return {
    maxPlayers,
    collisionEnabled: !!(input?.collisionEnabled ?? true),
    locked: !!(input?.locked ?? false),
  };
}

function sanitizeMeta(input?: Partial<RoomMeta>): RoomMeta {
  const status = input?.status === "in_game" ? "in_game" : "lobby";
  const source =
    input?.gameSource === "smb2" || input?.gameSource === "mb2ws" ? input.gameSource : "smb1";
  const courseLabelRaw = typeof input?.courseLabel === "string" ? input.courseLabel.slice(0, 64) : "";
  const stageLabelRaw = typeof input?.stageLabel === "string" ? input.stageLabel.slice(0, 64) : "";
  const roomNameRaw = typeof input?.roomName === "string" ? input.roomName.slice(0, 64) : "";
  const courseLabel = courseLabelRaw.trim() ? courseLabelRaw.trim() : undefined;
  const stageLabel = stageLabelRaw.trim() ? stageLabelRaw.trim() : undefined;
  const roomName = roomNameRaw.trim() ? roomNameRaw.trim() : undefined;
  const stageId = Number.isFinite(input?.stageId) ? Number(input?.stageId) : undefined;
  return {
    status,
    gameSource: source,
    courseLabel,
    stageLabel,
    stageId,
    roomName,
  };
}

function publicRoomInfo(room: RoomRecord) {
  const { hostToken: _hostToken, players: _players, ...rest } = room;
  return {
    ...rest,
    settings: room.settings ?? sanitizeSettings(),
    playerCount: Object.keys(room.players ?? {}).length,
    meta: room.meta ?? sanitizeMeta({}),
  };
}

export class Lobby implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private data: LobbyState = { rooms: {}, codes: {} };
  private rateLimits = new Map<string, RateLimit>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  private async load(): Promise<void> {
    const stored = await this.state.storage.get<LobbyState>("lobby");
    if (stored) {
      this.data = stored;
    }
  }

  private async save(): Promise<void> {
    await this.state.storage.put("lobby", this.data);
  }

  private cleanupExpired(): boolean {
    const now = nowMs();
    let dirty = false;
    for (const roomId of Object.keys(this.data.rooms)) {
      const room = this.data.rooms[roomId];
      if (!room) {
        continue;
      }
      let roomDirty = false;
      for (const [playerKey, player] of Object.entries(room.players ?? {})) {
        const staleJoin = !player.connected && (now - player.joinedAt > PLAYER_JOIN_GRACE_MS);
        const staleActive = now - player.lastActiveAt > PLAYER_TTL_MS;
        if (staleJoin || staleActive) {
          delete room.players[playerKey];
          roomDirty = true;
        }
      }
      if (roomDirty) {
        this.data.rooms[roomId] = room;
        dirty = true;
      }
      if (Object.keys(room.players ?? {}).length === 0) {
        delete this.data.rooms[roomId];
        if (room.roomCode) {
          delete this.data.codes[room.roomCode];
        }
        dirty = true;
        continue;
      }
      if (now - room.lastActiveAt > ROOM_TTL_MS) {
        delete this.data.rooms[roomId];
        if (room.roomCode) {
          delete this.data.codes[room.roomCode];
        }
        dirty = true;
      }
    }
    return dirty;
  }

  private isRateLimited(key: string, limit: { windowMs: number; max: number }): boolean {
    const now = nowMs();
    const existing = this.rateLimits.get(key);
    if (!existing || now >= existing.resetAt) {
      this.rateLimits.set(key, { count: 1, resetAt: now + limit.windowMs });
      return false;
    }
    if (existing.count >= limit.max) {
      return true;
    }
    existing.count += 1;
    this.rateLimits.set(key, existing);
    return false;
  }

  async fetch(request: Request): Promise<Response> {
    await this.load();
    const origin = getCorsOrigin(request, this.env);
    const cleaned = this.cleanupExpired();
    if (cleaned) {
      await this.save();
    }
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      const headers: Record<string, string> = {
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
      };
      if (origin) {
        headers["access-control-allow-origin"] = origin;
      }
      return new Response(null, {
        status: 204,
        headers,
      });
    }

    if (request.method === "GET" && url.pathname === "/rooms") {
      const list = Object.values(this.data.rooms).filter((room) => room.isPublic);
      return jsonResponse({ rooms: list.map(publicRoomInfo) }, 200, origin);
    }

    if (request.method === "POST" && url.pathname === "/rooms") {
      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      if (this.isRateLimited(`create:${ip}`, CREATE_RATE_LIMIT)) {
        return jsonResponse({ error: "rate_limited" }, 429, origin);
      }
      const body = await parseJson<Partial<RoomRecord>>(request);
      const roomId = this.env.ROOM.newUniqueId().toString();
      const isPublic = !!body.isPublic;
      let roomCode: string | undefined;
      if (!isPublic) {
        for (let i = 0; i < 10; i += 1) {
          const code = randomCode(6);
          if (!this.data.codes[code]) {
            roomCode = code;
            this.data.codes[code] = roomId;
            break;
          }
        }
      }
      const settings = sanitizeSettings(body.settings);
      const courseId = typeof body.courseId === "string" ? body.courseId.slice(0, 64) : "smb1-main";
      const existingPlayers = new Set<number>();
      const hostId = randomPlayerId(existingPlayers);
      existingPlayers.add(hostId);
      const hostToken = randomToken();
      const hostPlayerToken = randomToken();
      const createdAt = nowMs();
      const record: RoomRecord = {
        roomId,
        roomCode,
        isPublic,
        hostId,
        hostToken,
        courseId,
        settings,
        meta: sanitizeMeta({ status: "lobby", gameSource: "smb1", courseLabel: courseId }),
        createdAt,
        lastActiveAt: createdAt,
        players: {
          [playerKey(hostId)]: {
            playerId: hostId,
            token: hostPlayerToken,
            joinedAt: createdAt,
            lastActiveAt: createdAt,
            connected: false,
          },
        },
      };
      this.data.rooms[roomId] = record;
      await this.save();
      return jsonResponse({
        room: publicRoomInfo(record),
        hostToken,
        playerId: hostId,
        playerToken: hostPlayerToken,
      }, 200, origin);
    }

    if (request.method === "POST" && url.pathname === "/rooms/join") {
      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      if (this.isRateLimited(`join:${ip}`, JOIN_RATE_LIMIT)) {
        return jsonResponse({ error: "rate_limited" }, 429, origin);
      }
      const body = await parseJson<{
        roomCode?: string;
        roomId?: string;
        playerId?: number;
        token?: string;
      }>(request);
      const roomCode = body.roomCode ? body.roomCode.trim().toUpperCase() : null;
      const roomId = body.roomId ?? (roomCode ? this.data.codes[roomCode] : null);
      if (!roomId || !this.data.rooms[roomId]) {
        return jsonResponse({ error: "room_not_found" }, 404, origin);
      }
      const room = this.data.rooms[roomId];
      room.players = room.players ?? {};
      room.settings = room.settings ?? sanitizeSettings();
      const requestedPlayerId = Number(body.playerId ?? 0);
      const requestedToken = typeof body.token === "string" ? body.token : null;
      if (requestedPlayerId && requestedToken) {
        const existing = room.players?.[playerKey(requestedPlayerId)];
        if (!existing || existing.token !== requestedToken) {
          return jsonResponse({ error: "unauthorized" }, 401, origin);
        }
        const now = nowMs();
        existing.connected = true;
        existing.lastActiveAt = now;
        room.lastActiveAt = now;
        room.players[playerKey(requestedPlayerId)] = existing;
        this.data.rooms[roomId] = room;
        await this.save();
        return jsonResponse({
          room: publicRoomInfo(room),
          playerId: existing.playerId,
          playerToken: existing.token,
          hostToken: room.hostId === existing.playerId ? room.hostToken : undefined,
        }, 200, origin);
      }
      if (room.settings.locked) {
        return jsonResponse({ error: "room_locked" }, 403, origin);
      }
      const playerCount = Object.keys(room.players ?? {}).length;
      if (playerCount >= room.settings.maxPlayers) {
        return jsonResponse({ error: "room_full" }, 409, origin);
      }
      const existingIds = new Set<number>(Object.keys(room.players ?? {}).map((id) => Number(id)));
      const playerId = randomPlayerId(existingIds);
      const playerToken = randomToken();
      const joinedAt = nowMs();
      const joinKey = playerKey(playerId);
      room.players[joinKey] = {
        playerId,
        token: playerToken,
        joinedAt,
        lastActiveAt: joinedAt,
        connected: false,
      };
      room.lastActiveAt = nowMs();
      this.data.rooms[roomId] = room;
      await this.save();
      return jsonResponse({ room: publicRoomInfo(room), playerId, playerToken }, 200, origin);
    }

    if (request.method === "POST" && url.pathname === "/rooms/heartbeat") {
      const body = await parseJson<{
        roomId?: string;
        playerId?: number;
        token?: string;
        meta?: Partial<RoomMeta>;
        settings?: Partial<RoomSettings>;
      }>(request);
      const roomId = body.roomId ?? null;
      if (!roomId || !this.data.rooms[roomId]) {
        return jsonResponse({ ok: false, error: "room_not_found" }, 404, origin);
      }
      const room = this.data.rooms[roomId];
      room.players = room.players ?? {};
      const playerId = Number(body.playerId ?? 0);
      const token = body.token ?? "";
      const player = room.players?.[playerKey(playerId)];
      if (!player || player.token !== token) {
        return jsonResponse({ ok: false, error: "unauthorized" }, 401, origin);
      }
      const now = nowMs();
      player.connected = true;
      player.lastActiveAt = now;
      room.lastActiveAt = now;
      if (playerId === room.hostId) {
        if (body.settings) {
          room.settings = sanitizeSettings(body.settings);
        }
        if (body.meta) {
          room.meta = sanitizeMeta(body.meta);
        }
      }
      room.players[playerKey(playerId)] = player;
      this.data.rooms[roomId] = room;
      await this.save();
      return jsonResponse({ ok: true }, 200, origin);
    }

    if (request.method === "POST" && url.pathname === "/rooms/close") {
      const body = await parseJson<{ roomId?: string; hostToken?: string }>(request);
      const roomId = body.roomId ?? null;
      if (!roomId || !this.data.rooms[roomId]) {
        return jsonResponse({ ok: false, error: "room_not_found" }, 404, origin);
      }
      const room = this.data.rooms[roomId];
      room.players = room.players ?? {};
      if (body.hostToken !== room.hostToken) {
        return jsonResponse({ ok: false, error: "unauthorized" }, 401, origin);
      }
      delete this.data.rooms[roomId];
      if (room.roomCode) {
        delete this.data.codes[room.roomCode];
      }
      await this.save();
      return jsonResponse({ ok: true }, 200, origin);
    }

    if (request.method === "POST" && url.pathname === "/rooms/verify") {
      const body = await parseJson<{ roomId?: string; playerId?: number; token?: string }>(request);
      const roomId = body.roomId ?? null;
      if (!roomId || !this.data.rooms[roomId]) {
        return jsonResponse({ ok: false, error: "room_not_found" }, 404, origin);
      }
      const room = this.data.rooms[roomId];
      room.players = room.players ?? {};
      const playerId = Number(body.playerId ?? 0);
      const token = body.token ?? "";
      const player = room.players?.[playerKey(playerId)];
      if (!player || player.token !== token) {
        return jsonResponse({ ok: false, error: "unauthorized" }, 401, origin);
      }
      const now = nowMs();
      player.connected = true;
      player.lastActiveAt = now;
      room.lastActiveAt = now;
      room.players[playerKey(playerId)] = player;
      this.data.rooms[roomId] = room;
      await this.save();
      return jsonResponse({ ok: true }, 200, origin);
    }

    if (request.method === "POST" && url.pathname === "/rooms/kick") {
      const body = await parseJson<{ roomId?: string; hostToken?: string; playerId?: number }>(request);
      const roomId = body.roomId ?? null;
      if (!roomId || !this.data.rooms[roomId]) {
        return jsonResponse({ ok: false, error: "room_not_found" }, 404, origin);
      }
      const room = this.data.rooms[roomId];
      room.players = room.players ?? {};
      if (body.hostToken !== room.hostToken) {
        return jsonResponse({ ok: false, error: "unauthorized" }, 401, origin);
      }
      const playerId = Number(body.playerId ?? 0);
      if (!playerId) {
        return jsonResponse({ ok: false, error: "bad_request" }, 400, origin);
      }
      if (playerId === room.hostId) {
        return jsonResponse({ ok: false, error: "cannot_kick_host" }, 400, origin);
      }
      if (!room.players?.[playerKey(playerId)]) {
        return jsonResponse({ ok: false, error: "player_not_found" }, 404, origin);
      }
      delete room.players[playerKey(playerId)];
      room.lastActiveAt = nowMs();
      this.data.rooms[roomId] = room;
      await this.save();
      return jsonResponse({ ok: true }, 200, origin);
    }

    if (request.method === "POST" && url.pathname === "/rooms/leave") {
      const body = await parseJson<{ roomId?: string; playerId?: number; token?: string }>(request);
      const roomId = body.roomId ?? null;
      if (!roomId || !this.data.rooms[roomId]) {
        return jsonResponse({ ok: false, error: "room_not_found" }, 404, origin);
      }
      const room = this.data.rooms[roomId];
      room.players = room.players ?? {};
      const playerId = Number(body.playerId ?? 0);
      const token = body.token ?? "";
      const player = room.players?.[playerKey(playerId)];
      if (!player || player.token !== token) {
        return jsonResponse({ ok: false, error: "unauthorized" }, 401, origin);
      }
      delete room.players[playerKey(playerId)];
      if (Object.keys(room.players ?? {}).length === 0) {
        delete this.data.rooms[roomId];
        if (room.roomCode) {
          delete this.data.codes[room.roomCode];
        }
      } else {
        this.data.rooms[roomId] = room;
      }
      await this.save();
      return jsonResponse({ ok: true }, 200, origin);
    }

    if (request.method === "POST" && url.pathname === "/rooms/promote") {
      const body = await parseJson<{ roomId?: string; playerId?: number; token?: string }>(request);
      const roomId = body.roomId ?? null;
      if (!roomId || !this.data.rooms[roomId]) {
        return jsonResponse({ ok: false, error: "room_not_found" }, 404, origin);
      }
      const room = this.data.rooms[roomId];
      room.players = room.players ?? {};
      const playerId = Number(body.playerId ?? 0);
      const token = body.token ?? "";
      const caller = room.players?.[playerKey(playerId)];
      if (!caller || caller.token !== token) {
        return jsonResponse({ ok: false, error: "unauthorized" }, 401, origin);
      }
      if (room.players?.[playerKey(room.hostId)]) {
        return jsonResponse({ ok: false, error: "host_present" }, 409, origin);
      }
      const connected = Object.values(room.players ?? {}).filter((entry) => entry.connected);
      const pool = connected.length > 0 ? connected : Object.values(room.players ?? {});
      if (pool.length === 0) {
        return jsonResponse({ ok: false, error: "no_candidates" }, 409, origin);
      }
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      room.hostId = chosen.playerId;
      room.hostToken = randomToken();
      room.lastActiveAt = nowMs();
      this.data.rooms[roomId] = room;
      await this.save();
      return jsonResponse({
        ok: true,
        room: publicRoomInfo(room),
        hostToken: room.hostId === playerId ? room.hostToken : undefined,
      }, 200, origin);
    }

    return jsonResponse({ error: "not_found" }, 404, origin);
  }
}

type Connection = {
  socket: WebSocket;
  playerId: number;
  token: string;
  windowStart: number;
  windowCount: number;
  windowBytes: number;
};

export class Room implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private connections = new Map<string, Connection>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  private async verifyPlayer(roomId: string, playerId: number, token: string): Promise<boolean> {
    try {
      const id = this.env.LOBBY.idFromName("lobby");
      const stub = this.env.LOBBY.get(id);
      const res = await stub.fetch("https://lobby.internal/rooms/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId, playerId, token }),
      });
      if (!res.ok) {
        return false;
      }
      const data = await res.json<{ ok?: boolean }>();
      return !!data?.ok;
    } catch {
      return false;
    }
  }

  private async leavePlayer(roomId: string, playerId: number, token: string): Promise<void> {
    const id = this.env.LOBBY.idFromName("lobby");
    const stub = this.env.LOBBY.get(id);
    await stub.fetch("https://lobby.internal/rooms/leave", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId, playerId, token }),
    });
  }

  private shouldAcceptMessage(conn: Connection, size: number): boolean {
    const now = nowMs();
    if (now - conn.windowStart >= SIGNAL_RATE_WINDOW_MS) {
      conn.windowStart = now;
      conn.windowCount = 0;
      conn.windowBytes = 0;
    }
    conn.windowCount += 1;
    conn.windowBytes += size;
    if (conn.windowCount > SIGNAL_RATE_MAX_MESSAGES || conn.windowBytes > SIGNAL_RATE_MAX_BYTES) {
      return false;
    }
    return true;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.get("upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 400 });
    }
    const allowlist = this.env.ALLOWED_ORIGINS?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [];
    if (allowlist.length > 0) {
      const origin = request.headers.get("origin");
      if (!origin || !allowlist.includes(origin)) {
        return new Response("Forbidden", { status: 403 });
      }
    }
    const playerId = Number(url.searchParams.get("playerId") ?? "0");
    const token = url.searchParams.get("token") ?? "";
    if (!Number.isFinite(playerId) || playerId <= 0 || !token) {
      return new Response("Unauthorized", { status: 401 });
    }
    const roomId = this.state.id.toString();
    const verified = await this.verifyPlayer(roomId, playerId, token);
    if (!verified) {
      return new Response("Unauthorized", { status: 401 });
    }
    const [client, server] = new WebSocketPair();
    server.accept();

    const connId = crypto.randomUUID();
    this.connections.set(connId, {
      socket: server,
      playerId,
      token,
      windowStart: nowMs(),
      windowCount: 0,
      windowBytes: 0,
    });

    server.addEventListener("message", (event) => {
      const payload = event.data;
      let size = 0;
      if (typeof payload === "string") {
        size = payload.length;
      } else if (payload instanceof ArrayBuffer) {
        size = payload.byteLength;
      } else {
        server.close(1003, "Unsupported payload");
        return;
      }
      if (size > SIGNAL_MAX_MESSAGE_BYTES) {
        server.close(1009, "Message too large");
        return;
      }
      const sender = this.connections.get(connId);
      if (!sender || !this.shouldAcceptMessage(sender, size)) {
        server.close(1011, "Rate limit");
        return;
      }
      for (const [id, conn] of this.connections.entries()) {
        if (id === connId) {
          continue;
        }
        try {
          conn.socket.send(payload);
        } catch {
          // Ignore.
        }
      }
    });

    server.addEventListener("close", () => {
      const conn = this.connections.get(connId);
      this.connections.delete(connId);
      if (conn) {
        void this.leavePlayer(roomId, conn.playerId, conn.token);
      }
      if (this.connections.size === 0) {
        this.state.storage.deleteAll();
      }
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/room/")) {
      const roomId = url.pathname.slice("/room/".length);
      const id = env.ROOM.idFromString(roomId);
      const stub = env.ROOM.get(id);
      return stub.fetch(request);
    }

    if (url.pathname.startsWith("/rooms")) {
      const id = env.LOBBY.idFromName("lobby");
      const stub = env.LOBBY.get(id);
      return stub.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};
