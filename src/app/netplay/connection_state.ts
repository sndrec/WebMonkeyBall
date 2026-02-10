import type { Game } from '../../game.js';

type ConnectionStateDeps = {
  game: Game;
  getRunning: () => boolean;
  getLobbyClient: () => any;
  getLobbyRoom: () => any;
  setLobbyRoom: (room: any | null) => void;
  getLobbySelfId: () => number | null;
  setLobbySelfId: (id: number | null) => void;
  getLobbyPlayerToken: () => string | null;
  setLobbyPlayerToken: (token: string | null) => void;
  setLobbyHostToken: (token: string | null) => void;
  getLobbyHeartbeatTimer: () => number | null;
  setLobbyHeartbeatTimer: (id: number | null) => void;
  getLastLobbyHeartbeatMs: () => number | null;
  setLastLobbyHeartbeatMs: (value: number | null) => void;
  getLobbySignalRetryTimer: () => number | null;
  setLobbySignalRetryTimer: (id: number | null) => void;
  getLobbySignalRetryMs: () => number;
  setLobbySignalRetryMs: (value: number) => void;
  getLobbySignalShouldReconnect: () => boolean;
  getLobbySignalReconnectFn: () => (() => void) | null;
  getLobbySignal: () => { close: () => void } | null;
  setLobbySignal: (signal: any | null) => void;
  setLobbySignalShouldReconnect: (enabled: boolean) => void;
  setLobbySignalReconnectFn: (fn: (() => void) | null) => void;
  getHostRelay: () => any | null;
  setHostRelay: (relay: any | null) => void;
  getClientPeer: () => any | null;
  setClientPeer: (peer: any | null) => void;
  setNetplayEnabled: (enabled: boolean) => void;
  setNetplayState: (state: any | null) => void;
  setPendingSnapshot: (snapshot: any | null) => void;
  setNetplayAccumulator: (value: number) => void;
  setLastRoomMetaKey: (value: string | null) => void;
  setLastRoomPlayerCount: (value: number | null) => void;
  setLastProfileBroadcastMs: (value: number | null) => void;
  setLastLobbyNameUpdateMs: (value: number | null) => void;
  lobbyProfiles: Map<number, any>;
  pendingAvatarByPlayer: Map<number, string>;
  profileUpdateThrottle: Map<number, number>;
  setChatMessages: (messages: any[]) => void;
  chatRateLimitByPlayer: Map<number, number>;
  setLastLocalChatSentMs: (value: number) => void;
  pendingSpawnStageSeq: Map<number, number>;
  clearNameplates: () => void;
  resetLocalPlayersAfterNetplay: () => void;
  updateLobbyUi: () => void;
  updateChatUi: () => void;
  setIngameChatOpen: (open: boolean) => void;
  modeStandard: any;
  heartbeatIntervalMs: number;
  heartbeatFallbackMs: number;
  sendLobbyHeartbeat: (nowMs: number, force?: boolean, roomId?: string, playerId?: number | null, token?: string | null) => void;
};

export class NetplayConnectionStateController {
  private readonly deps: ConnectionStateDeps;

  constructor(deps: ConnectionStateDeps) {
    this.deps = deps;
  }

  startLobbyHeartbeat(roomId: string) {
    if (!this.deps.getLobbyClient()) {
      return;
    }
    const timer = this.deps.getLobbyHeartbeatTimer();
    if (timer !== null) {
      window.clearInterval(timer);
    }
    this.deps.setLastLobbyHeartbeatMs(null);
    const id = window.setInterval(() => {
      this.deps.sendLobbyHeartbeat(performance.now(), false, roomId);
    }, this.deps.heartbeatIntervalMs);
    this.deps.setLobbyHeartbeatTimer(id);
    this.deps.sendLobbyHeartbeat(performance.now(), true, roomId);
  }

  stopLobbyHeartbeat() {
    const timer = this.deps.getLobbyHeartbeatTimer();
    if (timer !== null) {
      window.clearInterval(timer);
      this.deps.setLobbyHeartbeatTimer(null);
    }
    this.deps.setLastLobbyHeartbeatMs(null);
  }

  clearLobbySignalRetry() {
    const timer = this.deps.getLobbySignalRetryTimer();
    if (timer !== null) {
      window.clearTimeout(timer);
      this.deps.setLobbySignalRetryTimer(null);
    }
    this.deps.setLobbySignalRetryMs(1000);
  }

  scheduleLobbySignalReconnect() {
    if (!this.deps.getLobbyClient() || !this.deps.getLobbySignalShouldReconnect() || !this.deps.getLobbySignalReconnectFn()) {
      return;
    }
    if (this.deps.getLobbySignalRetryTimer() !== null) {
      return;
    }
    const delay = this.deps.getLobbySignalRetryMs();
    this.deps.setLobbySignalRetryMs(Math.min(delay * 2, 15000));
    const id = window.setTimeout(() => {
      this.deps.setLobbySignalRetryTimer(null);
      this.deps.getLobbySignalReconnectFn()?.();
    }, delay);
    this.deps.setLobbySignalRetryTimer(id);
  }

  shouldJoinAsSpectator() {
    return this.deps.getRunning()
      && !!this.deps.game.stageRuntime
      && !this.deps.game.loadingStage
      && this.deps.game.stageTimerFrames > 0;
  }

  markPlayerPendingSpawn(playerId: number, stageSeq: number) {
    const player = this.deps.game.players.find((entry) => entry.id === playerId);
    if (!player) {
      return;
    }
    player.pendingSpawn = true;
    player.isSpectator = true;
    this.deps.pendingSpawnStageSeq.set(playerId, stageSeq);
    if (player.id === this.deps.game.localPlayerId) {
      this.deps.game.enterLocalSpectatorFreeFly();
    }
  }

  promotePendingSpawns(stageSeq: number) {
    if (this.deps.pendingSpawnStageSeq.size === 0) {
      return;
    }
    for (const [playerId, joinStageSeq] of this.deps.pendingSpawnStageSeq) {
      if (joinStageSeq >= stageSeq) {
        continue;
      }
      const player = this.deps.game.players.find((entry) => entry.id === playerId);
      if (player) {
        player.pendingSpawn = false;
        player.isSpectator = false;
        player.freeFly = false;
      }
      this.deps.pendingSpawnStageSeq.delete(playerId);
    }
  }

  resetNetplayConnections({ preserveLobby = false }: { preserveLobby?: boolean } = {}) {
    this.deps.getLobbySignal()?.close();
    this.deps.setLobbySignal(null);
    this.deps.setLobbySignalShouldReconnect(false);
    this.deps.setLobbySignalReconnectFn(null);
    this.clearLobbySignalRetry();
    this.deps.getHostRelay()?.closeAll();
    this.deps.setHostRelay(null);
    this.deps.getClientPeer()?.close();
    this.deps.setClientPeer(null);
    this.deps.setNetplayEnabled(false);
    this.deps.setNetplayState(null);
    this.deps.setPendingSnapshot(null);
    this.deps.setNetplayAccumulator(0);
    this.deps.game.netplayRttMs = null;
    this.deps.game.setInputFeed(null);
    for (const player of this.deps.game.players) {
      this.deps.game.setPlayerInputFeed(player.id, null);
    }
    this.deps.game.allowCourseAdvance = true;
    this.deps.game.setMultiplayerGameMode(this.deps.modeStandard);
    this.stopLobbyHeartbeat();
    if (!preserveLobby) {
      this.deps.setLobbyRoom(null);
      this.deps.setLobbySelfId(null);
      this.deps.setLobbyPlayerToken(null);
      this.deps.setLobbyHostToken(null);
      this.deps.setLastLobbyHeartbeatMs(null);
      this.deps.lobbyProfiles.clear();
      this.deps.pendingAvatarByPlayer.clear();
      this.deps.profileUpdateThrottle.clear();
      this.deps.setChatMessages([]);
      this.deps.chatRateLimitByPlayer.clear();
      this.deps.setLastLocalChatSentMs(0);
      this.deps.clearNameplates();
      this.deps.setLastProfileBroadcastMs(null);
      this.deps.setLastLobbyNameUpdateMs(null);
      this.deps.setLastRoomMetaKey(null);
      this.deps.setLastRoomPlayerCount(null);
      this.deps.resetLocalPlayersAfterNetplay();
    }
    this.deps.pendingSpawnStageSeq.clear();
    this.deps.updateLobbyUi();
    this.deps.updateChatUi();
    this.deps.setIngameChatOpen(false);
  }
}
