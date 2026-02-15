export interface Env {
  LOBBY: DurableObjectNamespace;
  ROOM: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string;
  LEADERBOARDS_DB: D1Database;
  REPLAYS: R2Bucket;
  ADMIN_PASSWORD_HASH?: string;
  ADMIN_SESSION_SECRET?: string;
  LEADERBOARD_ALLOWLIST?: string;
}

type RoomSettings = {
  maxPlayers: number;
  collisionEnabled: boolean;
  infiniteTimeEnabled: boolean;
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

const ROOM_TTL_MS = 1000 * 60 * 5;
const PLAYER_JOIN_GRACE_MS = 1000 * 20;
const PLAYER_CONNECTED_STALE_MS = 1000 * 35;
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

function textResponse(text: string, status = 200, origin: string | null = "*"): Response {
  const headers: Record<string, string> = { "content-type": "text/plain; charset=utf-8" };
  if (origin) {
    headers["access-control-allow-origin"] = origin;
  }
  return new Response(text, { status, headers });
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let out = "";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

async function signToken(payload: Record<string, any>, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const encoder = new TextEncoder();
  const headerBytes = encoder.encode(JSON.stringify(header));
  const payloadBytes = encoder.encode(JSON.stringify(payload));
  const headerPart = base64UrlEncode(headerBytes);
  const payloadPart = base64UrlEncode(payloadBytes);
  const data = `${headerPart}.${payloadPart}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const sigPart = base64UrlEncode(new Uint8Array(signature));
  return `${data}.${sigPart}`;
}

async function verifyToken(token: string, secret: string): Promise<Record<string, any> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [headerPart, payloadPart, sigPart] = parts;
  const data = `${headerPart}.${payloadPart}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signature = base64UrlDecode(sigPart);
  const valid = await crypto.subtle.verify("HMAC", key, signature, encoder.encode(data));
  if (!valid) {
    return null;
  }
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart)));
  if (payload?.exp && typeof payload.exp === "number" && Date.now() > payload.exp) {
    return null;
  }
  return payload;
}

function parseAllowlistEnv(raw?: string | null): Array<{ packId: string; label: string }> {
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [packId, label] = entry.split("|").map((part) => part.trim());
      return { packId, label: label || packId };
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

function delayMs(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
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

async function ensureAllowlistSeed(db: D1Database, env: Env): Promise<void> {
  const seed = parseAllowlistEnv(env.LEADERBOARD_ALLOWLIST);
  if (seed.length === 0) {
    return;
  }
  const existing = await db.prepare("SELECT COUNT(*) as count FROM allowlist").first<any>();
  if ((existing?.count ?? 0) > 0) {
    return;
  }
  const now = nowMs();
  const batch = seed.map((entry) =>
    db.prepare("INSERT INTO allowlist (pack_id, label, created_at) VALUES (?, ?, ?)")
      .bind(entry.packId, entry.label, now),
  );
  if (batch.length > 0) {
    await db.batch(batch);
  }
}

async function loadAllowlist(db: D1Database, env: Env): Promise<Array<{ packId: string; label: string }>> {
  await ensureAllowlistSeed(db, env);
  const result = await db.prepare("SELECT pack_id as packId, label FROM allowlist ORDER BY pack_id ASC").all<any>();
  return (result?.results ?? []).map((row) => ({ packId: row.packId, label: row.label ?? row.packId }));
}

function normalizePackId(raw?: string | null): string | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed ? trimmed.slice(0, 64) : null;
}

function normalizeName(raw?: string | null): string {
  const trimmed = (raw ?? "").trim().slice(0, 64);
  return trimmed || "Anonymous";
}

function normalizeMetric(raw?: string | null): string | null {
  if (raw === "time" || raw === "score") {
    return raw;
  }
  return null;
}

function normalizeGoalType(raw?: string | null): string | null {
  if (raw === "B" || raw === "G" || raw === "R") {
    return raw;
  }
  return null;
}

function normalizeWarpFlag(raw?: string | null): string | null {
  if (raw === "warped" || raw === "warpless") {
    return raw;
  }
  return null;
}

function normalizeMode(raw?: string | null): string | null {
  if (raw === "story" || raw === "challenge" || raw === "smb1") {
    return raw;
  }
  return null;
}

function playerOccupiesSlot(player: PlayerRecord, now = nowMs()): boolean {
  if (player.connected) {
    return (now - player.lastActiveAt) <= PLAYER_CONNECTED_STALE_MS;
  }
  return (now - player.lastActiveAt) <= PLAYER_JOIN_GRACE_MS;
}

function roomPlayerCount(room: RoomRecord, now = nowMs()): number {
  return Object.values(room.players ?? {}).filter((player) => playerOccupiesSlot(player, now)).length;
}

function sanitizeSettings(input?: Partial<RoomSettings>): RoomSettings {
  const maxPlayers = clampInt(Number(input?.maxPlayers ?? MAX_PLAYERS), 1, MAX_PLAYERS);
  return {
    maxPlayers,
    collisionEnabled: !!(input?.collisionEnabled ?? true),
    infiniteTimeEnabled: !!(input?.infiniteTimeEnabled ?? false),
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
    settings: sanitizeSettings(room.settings),
    playerCount: roomPlayerCount(room),
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
        const neverConnected = !player.connected && player.lastActiveAt <= player.joinedAt;
        const staleJoin = neverConnected && (now - player.joinedAt > PLAYER_JOIN_GRACE_MS);
        const staleWindow = player.connected ? PLAYER_CONNECTED_STALE_MS : PLAYER_JOIN_GRACE_MS;
        const staleActive = now - player.lastActiveAt > staleWindow;
        if (staleJoin || staleActive) {
          delete room.players[playerKey];
          roomDirty = true;
        }
      }
      if (roomDirty) {
        this.data.rooms[roomId] = room;
        dirty = true;
      }
      const hostPlayer = room.players?.[playerKey(room.hostId)];
      const hostMissing = !hostPlayer;
      const hostInactive = !!hostPlayer
        && !hostPlayer.connected
        && (now - hostPlayer.lastActiveAt > PLAYER_JOIN_GRACE_MS);
      if (hostMissing || hostInactive) {
        delete this.data.rooms[roomId];
        if (room.roomCode) {
          delete this.data.codes[room.roomCode];
        }
        dirty = true;
        continue;
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
      room.settings = sanitizeSettings(room.settings);
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
      const playerCount = roomPlayerCount(room);
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
      const leavingHost = playerId === room.hostId;
      delete room.players[playerKey(playerId)];
      if (leavingHost || Object.keys(room.players ?? {}).length === 0) {
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

    if (request.method === "POST" && url.pathname === "/rooms/disconnect") {
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
      if (playerId === room.hostId) {
        delete this.data.rooms[roomId];
        if (room.roomCode) {
          delete this.data.codes[room.roomCode];
        }
        await this.save();
        return jsonResponse({ ok: true }, 200, origin);
      }
      const now = nowMs();
      player.connected = false;
      player.lastActiveAt = now;
      room.lastActiveAt = now;
      room.players[playerKey(playerId)] = player;
      this.data.rooms[roomId] = room;
      await this.save();
      return jsonResponse({ ok: true }, 200, origin);
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

  private async disconnectPlayer(roomId: string, playerId: number, token: string): Promise<void> {
    const id = this.env.LOBBY.idFromName("lobby");
    const stub = this.env.LOBBY.get(id);
    const body = JSON.stringify({ roomId, playerId, token });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await stub.fetch("https://lobby.internal/rooms/disconnect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        });
        if (res.ok || res.status === 401 || res.status === 404) {
          return;
        }
      } catch {
        // Retry below.
      }
      if (attempt < 2) {
        await delayMs(100 * (attempt + 1));
      }
    }
    try {
      await stub.fetch("https://lobby.internal/rooms/leave", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
    } catch {
      // Ignore.
    }
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
        void this.disconnectPlayer(roomId, conn.playerId, conn.token);
      }
      if (this.connections.size === 0) {
        this.state.storage.deleteAll();
      }
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}

function getAuthToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  return null;
}

async function requireAdmin(request: Request, env: Env): Promise<Record<string, any> | null> {
  const secret = env.ADMIN_SESSION_SECRET ?? "";
  if (!secret) {
    return null;
  }
  const token = getAuthToken(request);
  if (!token) {
    return null;
  }
  return verifyToken(token, secret);
}

async function logAdminAction(
  env: Env,
  action: string,
  actorIp: string,
  targetId?: string | null,
  metadata?: Record<string, any>,
) {
  const db = env.LEADERBOARDS_DB;
  const auditId = crypto.randomUUID();
  const now = nowMs();
  await db.prepare(
    "INSERT INTO admin_audit (audit_id, action, target_id, metadata, actor_ip, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(
    auditId,
    action,
    targetId ?? null,
    metadata ? JSON.stringify(metadata) : null,
    actorIp || "unknown",
    now,
  ).run();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = getCorsOrigin(request, env);

    if (url.pathname.startsWith("/leaderboards") || url.pathname.startsWith("/admin")) {
      if (request.method === "OPTIONS") {
        const headers: Record<string, string> = {
          "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
          "access-control-allow-headers": "content-type,authorization",
        };
        if (origin) {
          headers["access-control-allow-origin"] = origin;
        }
        return new Response(null, { status: 204, headers });
      }
    }

    if (url.pathname === "/leaderboards/allowlist" && request.method === "GET") {
      const list = await loadAllowlist(env.LEADERBOARDS_DB, env);
      return jsonResponse({ packs: list }, 200, origin);
    }

    if (url.pathname === "/leaderboards/submit" && request.method === "POST") {
      const body = await parseJson<any>(request);
      const type = body?.type === "course" ? "course" : "stage";
      const playerId = typeof body?.playerId === "string" ? body.playerId.slice(0, 64) : "";
      const displayName = normalizeName(body?.displayName);
      const gameSource = body?.gameSource === "smb2" || body?.gameSource === "mb2ws" ? body.gameSource : "smb1";
      const packId = normalizePackId(body?.packId);
      if (packId) {
        const allowlist = await loadAllowlist(env.LEADERBOARDS_DB, env);
        const allowed = allowlist.some((entry) => entry.packId === packId);
        if (!allowed) {
          return jsonResponse({ error: "pack_not_allowed" }, 403, origin);
        }
      }
      if (!playerId) {
        return jsonResponse({ error: "missing_player" }, 400, origin);
      }
      const submissionId = crypto.randomUUID();
      const now = nowMs();
      const replay = body?.replay ?? null;
      if (!replay) {
        return jsonResponse({ error: "missing_replay" }, 400, origin);
      }
      const replayKey = `replays/${submissionId}.json`;
      await env.REPLAYS.put(replayKey, JSON.stringify(replay), {
        httpMetadata: { contentType: "application/json" },
      });

      let stageId: number | null = null;
      let goalType: string | null = null;
      let metric: string | null = null;
      let courseId: string | null = null;
      let mode: string | null = null;
      let warpFlag: string | null = null;

      if (type === "stage") {
        stageId = Number.isFinite(body?.stageId) ? Number(body.stageId) : null;
        goalType = normalizeGoalType(body?.goalType);
        metric = normalizeMetric(body?.metric);
        if (!stageId || !goalType || !metric) {
          return jsonResponse({ error: "invalid_stage_payload" }, 400, origin);
        }
      } else {
        courseId = typeof body?.courseId === "string" ? body.courseId.slice(0, 64) : null;
        mode = normalizeMode(body?.mode);
        warpFlag = normalizeWarpFlag(body?.warpFlag);
        if (!courseId || !mode || !warpFlag) {
          return jsonResponse({ error: "invalid_course_payload" }, 400, origin);
        }
      }

      const clientValue = Number.isFinite(body?.value) ? Math.trunc(body.value) : null;
      const clientMeta = body?.clientMeta ? JSON.stringify(body.clientMeta) : null;

      await env.LEADERBOARDS_DB.prepare(
        `INSERT INTO submissions (
          submission_id, type, status, player_id, display_name, game_source,
          stage_id, goal_type, metric, course_id, mode, warp_flag, pack_id,
          replay_key, client_value, client_meta, submitted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        submissionId,
        type,
        "pending",
        playerId,
        displayName,
        gameSource,
        stageId,
        goalType,
        metric,
        courseId,
        mode,
        warpFlag,
        packId,
        replayKey,
        clientValue,
        clientMeta,
        now,
      ).run();

      return jsonResponse({ submissionId, status: "pending" }, 200, origin);
    }

    if (url.pathname === "/leaderboards/stage" && request.method === "GET") {
      const stageId = Number(url.searchParams.get("stageId") ?? "");
      const gameSource = url.searchParams.get("gameSource") ?? "smb1";
      const goalType = normalizeGoalType(url.searchParams.get("goalType"));
      const metric = normalizeMetric(url.searchParams.get("metric"));
      const packId = normalizePackId(url.searchParams.get("packId"));
      if (!stageId || !goalType || !metric) {
        return jsonResponse({ error: "invalid_query" }, 400, origin);
      }
      const order = metric === "score" ? "DESC" : "ASC";
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
      const query = `
        SELECT entry_id as entryId, player_id as playerId, display_name as displayName, value, created_at as createdAt
        FROM entries
        WHERE type = 'stage'
          AND game_source = ?
          AND stage_id = ?
          AND goal_type = ?
          AND metric = ?
          AND (pack_id IS ? OR pack_id = ?)
        ORDER BY value ${order}
        LIMIT ?`;
      const rows = await env.LEADERBOARDS_DB.prepare(query)
        .bind(gameSource, stageId, goalType, metric, packId, packId, limit)
        .all<any>();
      return jsonResponse({ entries: rows.results ?? [] }, 200, origin);
    }

    if (url.pathname === "/leaderboards/course" && request.method === "GET") {
      const courseId = url.searchParams.get("courseId") ?? "";
      const gameSource = url.searchParams.get("gameSource") ?? "smb1";
      const mode = normalizeMode(url.searchParams.get("mode"));
      const warpFlag = normalizeWarpFlag(url.searchParams.get("warpFlag"));
      const packId = normalizePackId(url.searchParams.get("packId"));
      if (!courseId || !mode || !warpFlag) {
        return jsonResponse({ error: "invalid_query" }, 400, origin);
      }
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
      const query = `
        SELECT entry_id as entryId, player_id as playerId, display_name as displayName, value, created_at as createdAt
        FROM entries
        WHERE type = 'course'
          AND game_source = ?
          AND course_id = ?
          AND mode = ?
          AND warp_flag = ?
          AND (pack_id IS ? OR pack_id = ?)
        ORDER BY value ASC
        LIMIT ?`;
      const rows = await env.LEADERBOARDS_DB.prepare(query)
        .bind(gameSource, courseId, mode, warpFlag, packId, packId, limit)
        .all<any>();
      return jsonResponse({ entries: rows.results ?? [] }, 200, origin);
    }

    if (url.pathname.startsWith("/leaderboards/replay/") && request.method === "GET") {
      const replayId = url.pathname.slice("/leaderboards/replay/".length).trim();
      if (!replayId) {
        return jsonResponse({ error: "missing_replay_id" }, 400, origin);
      }
      const key = `replays/${replayId}.json`;
      const obj = await env.REPLAYS.get(key);
      if (!obj) {
        return jsonResponse({ error: "replay_not_found" }, 404, origin);
      }
      const headers = new Headers();
      headers.set("content-type", "application/json");
      if (origin) {
        headers.set("access-control-allow-origin", origin);
      }
      return new Response(obj.body, { status: 200, headers });
    }

    if (url.pathname === "/admin/login" && request.method === "POST") {
      const secret = env.ADMIN_SESSION_SECRET ?? "";
      const hash = env.ADMIN_PASSWORD_HASH ?? "";
      if (!secret || !hash) {
        return jsonResponse({ error: "admin_unconfigured" }, 500, origin);
      }
      const body = await parseJson<any>(request);
      const password = typeof body?.password === "string" ? body.password : "";
      const candidateHash = await sha256Hex(password);
      if (candidateHash !== hash) {
        return jsonResponse({ error: "unauthorized" }, 401, origin);
      }
      const payload = { sub: "admin", exp: Date.now() + 1000 * 60 * 120 };
      const token = await signToken(payload, secret);
      return jsonResponse({ token, expiresIn: 7200 }, 200, origin);
    }

    if (url.pathname.startsWith("/admin/")) {
      const admin = await requireAdmin(request, env);
      if (!admin) {
        return jsonResponse({ error: "unauthorized" }, 401, origin);
      }
    }

    if (url.pathname === "/admin/leaderboards" && request.method === "GET") {
      const type = url.searchParams.get("type") ?? "stage";
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));
      const rows = await env.LEADERBOARDS_DB.prepare(
        `SELECT entry_id as entryId, submission_id as submissionId, type, player_id as playerId, display_name as displayName,
                game_source as gameSource, stage_id as stageId, goal_type as goalType, metric, course_id as courseId,
                mode, warp_flag as warpFlag, pack_id as packId, value, created_at as createdAt
         FROM entries WHERE type = ? ORDER BY created_at DESC LIMIT ?`,
      ).bind(type, limit).all<any>();
      return jsonResponse({ entries: rows.results ?? [] }, 200, origin);
    }

    if (url.pathname.startsWith("/admin/entries/") && request.method === "DELETE") {
      const entryId = url.pathname.slice("/admin/entries/".length).trim();
      if (!entryId) {
        return jsonResponse({ error: "missing_entry" }, 400, origin);
      }
      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      await env.LEADERBOARDS_DB.prepare("DELETE FROM entries WHERE entry_id = ?").bind(entryId).run();
      await logAdminAction(env, "entry_delete", ip, entryId);
      return jsonResponse({ ok: true }, 200, origin);
    }

    if (url.pathname === "/admin/allowlist" && request.method === "GET") {
      const list = await loadAllowlist(env.LEADERBOARDS_DB, env);
      return jsonResponse({ packs: list }, 200, origin);
    }

    if (url.pathname === "/admin/allowlist" && request.method === "PUT") {
      const body = await parseJson<any>(request);
      const packs = Array.isArray(body?.packs) ? body.packs : [];
      const normalized = packs
        .map((entry) => ({
          packId: normalizePackId(entry?.packId),
          label: typeof entry?.label === "string" && entry.label.trim()
            ? entry.label.trim().slice(0, 64)
            : (typeof entry?.packId === "string" ? entry.packId.trim().slice(0, 64) : "pack"),
        }))
        .filter((entry) => !!entry.packId);
      const now = nowMs();
      await env.LEADERBOARDS_DB.prepare("DELETE FROM allowlist").run();
      if (normalized.length > 0) {
        const batch = normalized.map((entry) =>
          env.LEADERBOARDS_DB.prepare(
            "INSERT INTO allowlist (pack_id, label, created_at) VALUES (?, ?, ?)",
          ).bind(entry.packId, entry.label, now),
        );
        await env.LEADERBOARDS_DB.batch(batch);
      }
      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      await logAdminAction(env, "allowlist_update", ip, null, { count: normalized.length });
      return jsonResponse({ ok: true }, 200, origin);
    }

    if (url.pathname === "/admin/audit" && request.method === "GET") {
      const rows = await env.LEADERBOARDS_DB.prepare(
        "SELECT audit_id as auditId, action, target_id as targetId, metadata, actor_ip as actorIp, created_at as createdAt FROM admin_audit ORDER BY created_at DESC LIMIT 200",
      ).all<any>();
      return jsonResponse({ entries: rows.results ?? [] }, 200, origin);
    }

    if (url.pathname === "/admin/submissions/pending" && request.method === "GET") {
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));
      const rows = await env.LEADERBOARDS_DB.prepare(
        `SELECT submission_id as submissionId, type, player_id as playerId, display_name as displayName,
                game_source as gameSource, stage_id as stageId, goal_type as goalType, metric,
                course_id as courseId, mode, warp_flag as warpFlag, pack_id as packId,
                replay_key as replayKey, submitted_at as submittedAt
         FROM submissions WHERE status = 'pending' ORDER BY submitted_at ASC LIMIT ?`,
      ).bind(limit).all<any>();
      return jsonResponse({ submissions: rows.results ?? [] }, 200, origin);
    }

    if (url.pathname.startsWith("/admin/submissions/") && request.method === "GET") {
      const parts = url.pathname.split("/").filter(Boolean);
      const submissionId = parts[2] ?? "";
      if (!submissionId) {
        return jsonResponse({ error: "invalid_request" }, 400, origin);
      }
      const submission = await env.LEADERBOARDS_DB.prepare(
        `SELECT submission_id as submissionId, type, player_id as playerId, display_name as displayName,
                game_source as gameSource, stage_id as stageId, goal_type as goalType, metric,
                course_id as courseId, mode, warp_flag as warpFlag, pack_id as packId,
                replay_key as replayKey, submitted_at as submittedAt
         FROM submissions WHERE submission_id = ?`,
      ).bind(submissionId).first<any>();
      if (!submission) {
        return jsonResponse({ error: "submission_not_found" }, 404, origin);
      }
      return jsonResponse({ submission }, 200, origin);
    }

    if (url.pathname.startsWith("/admin/submissions/") && request.method === "POST") {
      const parts = url.pathname.split("/").filter(Boolean);
      const submissionId = parts[2] ?? "";
      const action = parts[3] ?? "";
      if (!submissionId || (action !== "verify" && action !== "reject")) {
        return jsonResponse({ error: "invalid_request" }, 400, origin);
      }
      const body = await parseJson<any>(request);
      const now = nowMs();
      if (action === "reject") {
        await env.LEADERBOARDS_DB.prepare(
          "UPDATE submissions SET status = 'rejected', verified_at = ?, verified_details = ? WHERE submission_id = ?",
        ).bind(now, body?.reason ? JSON.stringify({ reason: body.reason }) : null, submissionId).run();
      } else {
        const value = Number.isFinite(body?.value) ? Math.trunc(body.value) : null;
        if (value === null) {
          return jsonResponse({ error: "missing_value" }, 400, origin);
        }
        const submission = await env.LEADERBOARDS_DB.prepare(
          "SELECT * FROM submissions WHERE submission_id = ?",
        ).bind(submissionId).first<any>();
        if (!submission) {
          return jsonResponse({ error: "submission_not_found" }, 404, origin);
        }
        const entryId = crypto.randomUUID();
        await env.LEADERBOARDS_DB.prepare(
          `INSERT INTO entries (
            entry_id, submission_id, type, player_id, display_name, game_source,
            stage_id, goal_type, metric, course_id, mode, warp_flag, pack_id,
            value, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          entryId,
          submissionId,
          submission.type,
          submission.player_id,
          submission.display_name,
          submission.game_source,
          submission.stage_id,
          submission.goal_type,
          submission.metric,
          submission.course_id,
          submission.mode,
          submission.warp_flag,
          submission.pack_id,
          value,
          now,
        ).run();
        await env.LEADERBOARDS_DB.prepare(
          "UPDATE submissions SET status = 'verified', verified_value = ?, verified_at = ?, verified_details = ? WHERE submission_id = ?",
        ).bind(value, now, body?.details ? JSON.stringify(body.details) : null, submissionId).run();
      }
      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      await logAdminAction(env, `submission_${action}`, ip, submissionId);
      return jsonResponse({ ok: true }, 200, origin);
    }

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
