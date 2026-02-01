export interface Env {
  LOBBY: DurableObjectNamespace;
  ROOM: DurableObjectNamespace;
}

type RoomSettings = {
  maxPlayers: number;
  collisionEnabled: boolean;
};

type RoomRecord = {
  roomId: string;
  roomCode?: string;
  isPublic: boolean;
  hostId: number;
  courseId: string;
  settings: RoomSettings;
  createdAt: number;
  lastActiveAt: number;
};

type LobbyState = {
  rooms: Record<string, RoomRecord>;
  codes: Record<string, string>;
};

const ROOM_TTL_MS = 1000 * 60;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
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

export class Lobby implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private data: LobbyState = { rooms: {}, codes: {} };

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

  private cleanupExpired(): void {
    const now = nowMs();
    for (const roomId of Object.keys(this.data.rooms)) {
      const room = this.data.rooms[roomId];
      if (!room) {
        continue;
      }
      if (now - room.lastActiveAt > ROOM_TTL_MS) {
        delete this.data.rooms[roomId];
        if (room.roomCode) {
          delete this.data.codes[room.roomCode];
        }
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    await this.load();
    this.cleanupExpired();
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/rooms") {
      const list = Object.values(this.data.rooms).filter((room) => room.isPublic);
      return jsonResponse({ rooms: list });
    }

    if (request.method === "POST" && url.pathname === "/rooms") {
      const body = await parseJson<Partial<RoomRecord>>(request);
      const roomId = this.env.ROOM.newUniqueId().toString();
      const isPublic = !!body.isPublic;
      let roomCode: string | undefined;
      if (!isPublic) {
        for (let i = 0; i < 10; i += 1) {
          const code = randomCode();
          if (!this.data.codes[code]) {
            roomCode = code;
            this.data.codes[code] = roomId;
            break;
          }
        }
      }
      const createdAt = nowMs();
      const record: RoomRecord = {
        roomId,
        roomCode,
        isPublic,
        hostId: body.hostId ?? 0,
        courseId: body.courseId ?? "smb1-main",
        settings: body.settings ?? { maxPlayers: 8, collisionEnabled: true },
        createdAt,
        lastActiveAt: createdAt,
      };
      this.data.rooms[roomId] = record;
      await this.save();
      return jsonResponse({ room: record });
    }

    if (request.method === "POST" && url.pathname === "/rooms/join") {
      const body = await parseJson<{ roomCode?: string; roomId?: string }>(request);
      const roomId = body.roomId ?? (body.roomCode ? this.data.codes[body.roomCode] : null);
      if (!roomId || !this.data.rooms[roomId]) {
        return jsonResponse({ error: "room_not_found" }, 404);
      }
      const room = this.data.rooms[roomId];
      room.lastActiveAt = nowMs();
      this.data.rooms[roomId] = room;
      await this.save();
      return jsonResponse({ room });
    }

    if (request.method === "POST" && url.pathname === "/rooms/heartbeat") {
      const body = await parseJson<{ roomId?: string }>(request);
      const roomId = body.roomId ?? null;
      if (!roomId || !this.data.rooms[roomId]) {
        return jsonResponse({ ok: false, error: "room_not_found" }, 404);
      }
      const room = this.data.rooms[roomId];
      room.lastActiveAt = nowMs();
      this.data.rooms[roomId] = room;
      await this.save();
      return jsonResponse({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/rooms/close") {
      const body = await parseJson<{ roomId?: string }>(request);
      const roomId = body.roomId ?? null;
      if (!roomId || !this.data.rooms[roomId]) {
        return jsonResponse({ ok: false, error: "room_not_found" }, 404);
      }
      const room = this.data.rooms[roomId];
      delete this.data.rooms[roomId];
      if (room.roomCode) {
        delete this.data.codes[room.roomCode];
      }
      await this.save();
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "not_found" }, 404);
  }
}

type Connection = {
  socket: WebSocket;
  playerId: number;
};

export class Room implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private connections = new Map<string, Connection>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  private async heartbeat(roomId: string): Promise<void> {
    const id = this.env.LOBBY.idFromName("lobby");
    const stub = this.env.LOBBY.get(id);
    await stub.fetch("https://lobby.internal/rooms/heartbeat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId }),
    });
  }

  private async closeRoom(roomId: string): Promise<void> {
    const id = this.env.LOBBY.idFromName("lobby");
    const stub = this.env.LOBBY.get(id);
    await stub.fetch("https://lobby.internal/rooms/close", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId }),
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.get("upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 400 });
    }
    const playerId = Number(url.searchParams.get("playerId") ?? "0");
    const [client, server] = new WebSocketPair();
    server.accept();

    const connId = crypto.randomUUID();
    this.connections.set(connId, { socket: server, playerId });
    const roomId = this.state.id.toString();
    void this.heartbeat(roomId);

    server.addEventListener("message", (event) => {
      const payload = event.data;
      void this.heartbeat(roomId);
      for (const [id, conn] of this.connections.entries()) {
        if (id === connId) {
          continue;
        }
        conn.socket.send(payload);
      }
    });

    server.addEventListener("close", () => {
      this.connections.delete(connId);
      if (this.connections.size === 0) {
        this.state.storage.deleteAll();
        void this.closeRoom(roomId);
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
