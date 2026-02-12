import type { Game } from '../../game.js';
import type { RoomInfo, RoomMeta } from '../../netcode_protocol.js';

type HeartbeatDeps = {
  game: Game;
  getLobbyClient: () => any;
  getLobbyRoom: () => RoomInfo | null;
  getLobbySelfId: () => number | null;
  getLobbyPlayerToken: () => string | null;
  getNetplayRole: () => 'host' | 'client' | null;
  getHostRelay: () => any | null;
  getLastLobbyHeartbeatMs: () => number | null;
  setLastLobbyHeartbeatMs: (value: number | null) => void;
  getLastRoomMetaKey: () => string | null;
  setLastRoomMetaKey: (value: string | null) => void;
  getLastRoomPlayerCount: () => number | null;
  setLastRoomPlayerCount: (value: number | null) => void;
  heartbeatFallbackMs: number;
  buildRoomMeta: () => RoomMeta | null;
};

export class LobbyHeartbeatController {
  private readonly deps: HeartbeatDeps;

  constructor(deps: HeartbeatDeps) {
    this.deps = deps;
  }

  broadcastRoomUpdate() {
    const lobbyRoom = this.deps.getLobbyRoom();
    if (!lobbyRoom || this.deps.getNetplayRole() !== 'host') {
      return;
    }
    lobbyRoom.playerCount = this.deps.game.players.length;
    this.deps.getHostRelay()?.broadcast({ type: 'room_update', room: lobbyRoom });
    this.deps.setLastRoomPlayerCount(lobbyRoom.playerCount);
  }

  sendLobbyHeartbeat(
    nowMs: number,
    force = false,
    roomId = this.deps.getLobbyRoom()?.roomId,
    playerId = this.deps.getLobbySelfId(),
    token = this.deps.getLobbyPlayerToken(),
  ) {
    const lobbyClient = this.deps.getLobbyClient();
    if (!lobbyClient || !roomId || playerId === null || !token) {
      return;
    }
    const lastLobbyHeartbeatMs = this.deps.getLastLobbyHeartbeatMs();
    if (!force && lastLobbyHeartbeatMs !== null && (nowMs - lastLobbyHeartbeatMs) < this.deps.heartbeatFallbackMs) {
      return;
    }
    this.deps.setLastLobbyHeartbeatMs(nowMs);
    let meta: RoomMeta | undefined;
    let settings: RoomInfo['settings'] | undefined;
    const lobbyRoom = this.deps.getLobbyRoom();
    if (this.deps.getNetplayRole() === 'host' && lobbyRoom) {
      meta = this.deps.buildRoomMeta() ?? lobbyRoom.meta;
      settings = lobbyRoom.settings;
      const playerCount = this.deps.game.players.length;
      lobbyRoom.playerCount = playerCount;
      if (playerCount !== this.deps.getLastRoomPlayerCount()) {
        this.deps.setLastRoomPlayerCount(playerCount);
        this.broadcastRoomUpdate();
      }
      if (meta) {
        lobbyRoom.meta = meta;
        const metaKey = JSON.stringify(meta);
        if (metaKey !== this.deps.getLastRoomMetaKey()) {
          this.deps.setLastRoomMetaKey(metaKey);
          this.broadcastRoomUpdate();
        }
      }
    }
    void lobbyClient.heartbeat(roomId, playerId, token, meta, settings);
  }
}
