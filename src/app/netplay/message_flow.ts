import type { Game, MultiplayerGameMode } from '../../game.js';
import type { GameSource } from '../../shared/constants/index.js';
import type { ClientToHostMessage, HostToClientMessage, PlayerProfile, RoomInfo } from '../../netcode_protocol.js';

type MessageFlowDeps = {
  game: Game;
  lobbyStatus: HTMLElement | null;
  getNetplayState: () => any | null;
  setSuppressHostDisconnectUntil: (value: number) => void;
  setLobbySignalShouldReconnect: (enabled: boolean) => void;
  setLobbySignalReconnectFn: (fn: (() => void) | null) => void;
  clearLobbySignalRetry: () => void;
  resetNetplayConnections: () => void;
  setActiveMenu: (menu: string) => void;
  requestSnapshot: (reason: 'mismatch' | 'lag', frame?: number, force?: boolean) => void;
  coerceFrame: (value: unknown) => number | null;
  normalizeInput: (input: any) => any | null;
  recordInputForFrame: (frame: number, playerId: number, input: any) => boolean;
  rollbackAndResim: (startFrame: number) => boolean;
  setPendingSnapshot: (snapshot: any | null) => void;
  tryApplyPendingSnapshot: (stageId: number) => void;
  markPlayerPendingSpawn: (playerId: number, stageSeq: number) => void;
  promotePendingSpawns: (stageSeq: number) => void;
  pendingSpawnStageSeq: Map<number, number>;
  lobbyProfiles: Map<number, PlayerProfile>;
  pendingAvatarByPlayer: Map<number, string>;
  profileFallbackForPlayer: (playerId: number) => PlayerProfile;
  updateLobbyUi: () => void;
  appendChatMessage: (playerId: number, text: string) => void;
  endMatchToLobby: () => void;
  getRoomGameMode: (room: RoomInfo | null | undefined) => MultiplayerGameMode;
  modeChained: MultiplayerGameMode;
  chainedMaxPlayers: number;
  normalizeMultiplayerGameMode: (mode: unknown) => MultiplayerGameMode;
  setLobbyRoom: (room: RoomInfo) => void;
  setActiveGameSource: (source: GameSource) => void;
  getStageBasePath: (source: GameSource) => string;
  setCurrentSmb2LikeMode: (mode: string | null) => void;
  startStage: (course: any) => Promise<void>;
  sendSnapshotToClient: (playerId: number, frame?: number) => void;
  hostRelay: () => any | null;
  rejectHostConnection: (playerId: number, reason?: string) => void;
  shouldJoinAsSpectator: () => boolean;
  sendStageSyncToClient: (playerId: number) => void;
  maybeSendStageSync: () => void;
  profileUpdateThrottle: Map<number, number>;
  profileRemoteCooldownMs: number;
  sanitizeProfile: (profile: PlayerProfile) => PlayerProfile;
  getAvatarValidationCached: (dataUrl: string) => Promise<boolean>;
  sanitizeChatText: (text: string) => string;
  chatRateLimitByPlayer: Map<number, number>;
  chatSendCooldownMs: number;
  maxInputAhead: number;
  maxInputBehind: number;
  hostMaxInputRollback: number;
  hostSnapshotCooldownMs: number;
  snapshotCooldownMs: number;
};

export class NetplayMessageFlowController {
  private readonly deps: MessageFlowDeps;

  constructor(deps: MessageFlowDeps) {
    this.deps = deps;
  }

  applyIncomingProfile(
    playerId: number,
    incoming: PlayerProfile,
    { broadcast }: { broadcast?: boolean } = {},
  ) {
    const sanitized = this.deps.sanitizeProfile(incoming);
    const baseProfile: PlayerProfile = { name: sanitized.name };
    this.deps.lobbyProfiles.set(playerId, baseProfile);
    if (broadcast) {
      this.deps.hostRelay()?.broadcast({ type: 'player_profile', playerId, profile: baseProfile });
    }
    this.deps.updateLobbyUi();
    if (!sanitized.avatarData) {
      this.deps.pendingAvatarByPlayer.delete(playerId);
      return;
    }
    const avatarData = sanitized.avatarData;
    this.deps.pendingAvatarByPlayer.set(playerId, avatarData);
    void this.deps.getAvatarValidationCached(avatarData).then((ok) => {
      if (!ok) {
        if (this.deps.pendingAvatarByPlayer.get(playerId) === avatarData) {
          this.deps.pendingAvatarByPlayer.delete(playerId);
        }
        return;
      }
      if (this.deps.pendingAvatarByPlayer.get(playerId) !== avatarData) {
        return;
      }
      this.deps.pendingAvatarByPlayer.delete(playerId);
      const current = this.deps.lobbyProfiles.get(playerId);
      const finalProfile: PlayerProfile = { name: current?.name ?? sanitized.name, avatarData };
      this.deps.lobbyProfiles.set(playerId, finalProfile);
      if (broadcast) {
        this.deps.hostRelay()?.broadcast({ type: 'player_profile', playerId, profile: finalProfile });
      }
      this.deps.updateLobbyUi();
    });
  }

  handleHostMessage(msg: HostToClientMessage) {
    if (msg.type === 'kick') {
      this.deps.setSuppressHostDisconnectUntil(performance.now() + 1500);
      this.deps.setLobbySignalShouldReconnect(false);
      this.deps.setLobbySignalReconnectFn(null);
      this.deps.clearLobbySignalRetry();
      this.deps.resetNetplayConnections();
      this.deps.game.pause();
      this.deps.setActiveMenu('multiplayer');
      if (this.deps.lobbyStatus) {
        this.deps.lobbyStatus.textContent = msg.reason ? `Lobby: ${msg.reason}` : 'Lobby: removed by host';
      }
      return;
    }
    const state = this.deps.getNetplayState();
    if (!state) {
      return;
    }
    if (msg.type === 'pong') {
      const sentAt = state.pendingPings.get(msg.id);
      if (sentAt !== undefined) {
        state.pendingPings.delete(msg.id);
        const rtt = Math.max(0, performance.now() - sentAt);
        state.rttMs = rtt;
        this.deps.game.netplayRttMs = rtt;
      }
      return;
    }
    const msgStageSeq = (msg as { stageSeq?: number }).stageSeq;
    if (
      msgStageSeq !== undefined
      && msg.type !== 'start'
      && msg.type !== 'player_join'
      && msg.type !== 'player_leave'
      && msgStageSeq !== state.stageSeq
    ) {
      return;
    }
    if (msg.type === 'stage_sync') {
      if (state.currentStageId === null) {
        state.currentStageId = msg.stageId;
      }
      if (state.currentStageId !== null && msg.stageId !== state.currentStageId) {
        return;
      }
      state.awaitingStageSync = false;
      state.lastReceivedHostFrame = msg.frame;
      state.lastHostFrameTimeMs = performance.now();
      state.awaitingSnapshot = false;
      state.lagBehindSinceMs = null;
      state.lastAckedLocalFrame = 0;
      if (msg.frame > state.session.getFrame()) {
        this.deps.requestSnapshot('lag', msg.frame, true);
      }
      return;
    }
    if (msg.type === 'frame') {
      if (state.awaitingStageSync) {
        return;
      }
      const frame = this.deps.coerceFrame(msg.frame);
      if (frame === null) {
        return;
      }
      if (msg.lastAck !== undefined) {
        const ackFrame = this.deps.coerceFrame(msg.lastAck);
        if (ackFrame !== null) {
          state.lastAckedLocalFrame = Math.max(state.lastAckedLocalFrame, ackFrame);
        }
        for (const pendingFrame of state.pendingLocalInputs.keys()) {
          if (pendingFrame <= state.lastAckedLocalFrame) {
            state.pendingLocalInputs.delete(pendingFrame);
          }
        }
      }
      state.lastReceivedHostFrame = Math.max(state.lastReceivedHostFrame, frame);
      state.lastHostFrameTimeMs = performance.now();
      let changed = false;
      for (const [id, input] of Object.entries(msg.inputs)) {
        const playerId = Number(id);
        if (state.role === 'client' && playerId === this.deps.game.localPlayerId) {
          continue;
        }
        const normalized = this.deps.normalizeInput(input);
        if (!normalized) {
          continue;
        }
        if (this.deps.recordInputForFrame(frame, playerId, normalized)) {
          changed = true;
        }
      }
      if (msg.hash !== undefined && msg.hashFrame !== undefined) {
        const hashFrame = this.deps.coerceFrame(msg.hashFrame);
        if (hashFrame !== null && Number.isFinite(msg.hash)) {
          state.expectedHashes.set(hashFrame, msg.hash);
          const localHash = state.hashHistory.get(hashFrame);
          if (localHash !== undefined && localHash !== msg.hash) {
            this.deps.requestSnapshot('mismatch', hashFrame);
          }
        }
      }
      const currentFrame = state.session.getFrame();
      if (changed && frame <= currentFrame) {
        if (!this.deps.rollbackAndResim(frame)) {
          this.deps.requestSnapshot('lag');
        }
      }
      if (state.lastReceivedHostFrame - currentFrame > state.maxRollback) {
        this.deps.requestSnapshot('lag');
      }
      return;
    }
    if (msg.type === 'snapshot') {
      this.deps.setPendingSnapshot(msg);
      const currentState = this.deps.getNetplayState();
      if (currentState) {
        currentState.lastReceivedHostFrame = Math.max(currentState.lastReceivedHostFrame, msg.frame);
        currentState.lastHostFrameTimeMs = performance.now();
      }
      if (!msg.stageId || this.deps.game.stage?.stageId === msg.stageId) {
        this.deps.tryApplyPendingSnapshot(this.deps.game.stage?.stageId ?? 0);
      }
      return;
    }
    if (msg.type === 'player_join') {
      this.deps.game.addPlayer(msg.playerId, { spectator: msg.spectator });
      const player = this.deps.game.players.find((p) => p.id === msg.playerId);
      if (player) {
        player.isSpectator = msg.spectator;
        if (msg.pendingSpawn || msg.spectator) {
          this.deps.markPlayerPendingSpawn(msg.playerId, msg.stageSeq ?? this.deps.getNetplayState()?.stageSeq ?? 0);
        } else {
          player.pendingSpawn = false;
          this.deps.pendingSpawnStageSeq.delete(msg.playerId);
        }
      }
      if (!this.deps.lobbyProfiles.has(msg.playerId)) {
        this.deps.lobbyProfiles.set(msg.playerId, this.deps.profileFallbackForPlayer(msg.playerId));
      }
      this.deps.updateLobbyUi();
      return;
    }
    if (msg.type === 'player_leave') {
      this.deps.game.removePlayer(msg.playerId);
      this.deps.lobbyProfiles.delete(msg.playerId);
      this.deps.pendingAvatarByPlayer.delete(msg.playerId);
      this.deps.pendingSpawnStageSeq.delete(msg.playerId);
      this.deps.updateLobbyUi();
      return;
    }
    if (msg.type === 'player_profile') {
      this.applyIncomingProfile(msg.playerId, msg.profile);
      return;
    }
    if (msg.type === 'chat') {
      this.deps.appendChatMessage(msg.playerId, msg.text);
      return;
    }
    if (msg.type === 'match_end') {
      this.deps.endMatchToLobby();
      return;
    }
    if (msg.type === 'room_update') {
      const mode = this.deps.getRoomGameMode(msg.room);
      const cappedMaxPlayers = mode === this.deps.modeChained
        ? Math.min(msg.room.settings.maxPlayers, this.deps.chainedMaxPlayers)
        : msg.room.settings.maxPlayers;
      msg.room.settings.maxPlayers = cappedMaxPlayers;
      this.deps.game.maxPlayers = cappedMaxPlayers;
      this.deps.game.playerCollisionEnabled = msg.room.settings.collisionEnabled;
      this.deps.game.setMultiplayerGameMode(mode);
      if (this.deps.getNetplayState()) {
        this.deps.getNetplayState().currentGameMode = mode;
      }
      this.deps.setLobbyRoom(msg.room);
      this.deps.updateLobbyUi();
      return;
    }
    if (msg.type === 'start') {
      const currentState = this.deps.getNetplayState();
      if (currentState) {
        currentState.stageSeq = msg.stageSeq;
        currentState.currentCourse = msg.course;
        currentState.currentGameSource = msg.gameSource;
        currentState.currentGameMode = this.deps.normalizeMultiplayerGameMode(msg.gameMode);
        currentState.awaitingSnapshot = false;
        currentState.expectedHashes.clear();
        currentState.hashHistory.clear();
      }
      if (msg.lateJoin && Number.isFinite(this.deps.game.localPlayerId) && this.deps.game.localPlayerId > 0) {
        this.deps.markPlayerPendingSpawn(this.deps.game.localPlayerId, msg.stageSeq);
      }
      this.deps.promotePendingSpawns(msg.stageSeq);
      this.deps.setPendingSnapshot(null);
      this.deps.setActiveGameSource(msg.gameSource);
      this.deps.game.setGameSource(msg.gameSource);
      this.deps.game.setMultiplayerGameMode(this.deps.normalizeMultiplayerGameMode(msg.gameMode));
      this.deps.game.stageBasePath = msg.stageBasePath ?? this.deps.getStageBasePath(msg.gameSource);
      this.deps.setCurrentSmb2LikeMode(msg.gameSource !== 'smb1' && msg.course?.mode ? msg.course.mode : null);
      void this.deps.startStage(msg.course);
    }
  }

  handleClientMessage(playerId: number, msg: ClientToHostMessage) {
    const state = this.deps.getNetplayState();
    if (!state) {
      return;
    }
    const msgStageSeq = (msg as { stageSeq?: number }).stageSeq;
    if (msgStageSeq !== undefined && msgStageSeq !== state.stageSeq) {
      return;
    }
    let clientState = state.clientStates.get(playerId);
    if (!clientState) {
      clientState = {
        lastAckedHostFrame: -1,
        lastAckedClientInput: -1,
        lastSnapshotMs: null,
        lastSnapshotRequestMs: null,
      };
      state.clientStates.set(playerId, clientState);
    }
    if (!this.deps.game.players.some((player) => player.id === playerId)) {
      if (this.deps.game.players.length >= this.deps.game.maxPlayers) {
        state.clientStates.delete(playerId);
        this.deps.rejectHostConnection(playerId, 'Room is full');
        return;
      }
      const joinAsSpectator = this.deps.shouldJoinAsSpectator();
      this.deps.game.addPlayer(playerId, { spectator: joinAsSpectator });
      if (joinAsSpectator) {
        this.deps.markPlayerPendingSpawn(playerId, state.stageSeq);
      }
      this.deps.updateLobbyUi();
    }
    if (msg.type === 'input') {
      const frame = this.deps.coerceFrame(msg.frame);
      const input = this.deps.normalizeInput(msg.input);
      if (frame === null || !input) {
        return;
      }
      const player = this.deps.game.players.find((entry) => entry.id === playerId);
      const awaitingSpawn = !!player?.pendingSpawn || !!player?.isSpectator;
      if (msg.lastAck !== undefined) {
        const ackFrame = this.deps.coerceFrame(msg.lastAck);
        if (ackFrame !== null) {
          clientState.lastAckedHostFrame = Math.max(
            clientState.lastAckedHostFrame,
            Math.min(ackFrame, state.session.getFrame()),
          );
        }
      }
      clientState.lastAckedClientInput = Math.max(clientState.lastAckedClientInput, frame);
      if (awaitingSpawn) {
        return;
      }
      const currentFrame = state.session.getFrame();
      const minFrame = Math.max(0, currentFrame - Math.min(state.maxRollback, this.deps.maxInputBehind));
      const maxFrame = currentFrame + this.deps.maxInputAhead;
      if (frame < minFrame || frame > maxFrame) {
        return;
      }
      if (frame <= currentFrame && (currentFrame - frame) > this.deps.hostMaxInputRollback) {
        const nowMs = performance.now();
        const lastSnap = clientState.lastSnapshotMs;
        if (lastSnap === null || (nowMs - lastSnap) >= this.deps.hostSnapshotCooldownMs) {
          clientState.lastSnapshotMs = nowMs;
          this.deps.sendSnapshotToClient(playerId, currentFrame);
        }
        return;
      }
      const changed = this.deps.recordInputForFrame(frame, playerId, input);
      if (changed && frame <= currentFrame) {
        state.pendingHostRollbackFrame = state.pendingHostRollbackFrame === null
          ? frame
          : Math.min(state.pendingHostRollbackFrame, frame);
        state.pendingHostRollbackPlayers.add(playerId);
      }
      return;
    }
    if (msg.type === 'ack') {
      const frame = this.deps.coerceFrame(msg.frame);
      if (frame !== null) {
        clientState.lastAckedHostFrame = Math.max(
          clientState.lastAckedHostFrame,
          Math.min(frame, state.session.getFrame()),
        );
      }
      return;
    }
    if (msg.type === 'ping') {
      this.deps.hostRelay()?.sendTo(playerId, { type: 'pong', id: msg.id });
      return;
    }
    if (msg.type === 'stage_ready') {
      if (state.currentStageId === null) {
        state.currentStageId = msg.stageId;
      }
      if (state.currentStageId !== null && msg.stageId !== state.currentStageId) {
        return;
      }
      state.readyPlayers.add(playerId);
      if (!state.awaitingStageReady) {
        this.deps.sendStageSyncToClient(playerId);
        return;
      }
      this.deps.maybeSendStageSync();
      return;
    }
    if (msg.type === 'snapshot_request') {
      const nowMs = performance.now();
      const lastRequest = clientState.lastSnapshotRequestMs ?? 0;
      if (clientState.lastSnapshotRequestMs !== null
        && (nowMs - lastRequest) < this.deps.snapshotCooldownMs) {
        return;
      }
      clientState.lastSnapshotRequestMs = nowMs;
      const currentFrame = state.session.getFrame();
      const frame = this.deps.coerceFrame(msg.frame) ?? currentFrame;
      const minFrame = Math.max(0, currentFrame - state.maxRollback);
      const clampedFrame = Math.min(currentFrame, Math.max(minFrame, frame));
      this.deps.sendSnapshotToClient(playerId, clampedFrame);
      return;
    }
    if (msg.type === 'player_profile') {
      const nowMs = performance.now();
      const lastMs = this.deps.profileUpdateThrottle.get(playerId) ?? 0;
      if ((nowMs - lastMs) < this.deps.profileRemoteCooldownMs) {
        return;
      }
      this.deps.profileUpdateThrottle.set(playerId, nowMs);
      this.applyIncomingProfile(playerId, msg.profile, { broadcast: true });
      return;
    }
    if (msg.type === 'chat') {
      const sanitized = this.deps.sanitizeChatText(msg.text);
      if (!sanitized) {
        return;
      }
      const nowMs = performance.now();
      const lastMs = this.deps.chatRateLimitByPlayer.get(playerId) ?? 0;
      if ((nowMs - lastMs) < this.deps.chatSendCooldownMs) {
        return;
      }
      this.deps.chatRateLimitByPlayer.set(playerId, nowMs);
      this.deps.appendChatMessage(playerId, sanitized);
      this.deps.hostRelay()?.broadcast({ type: 'chat', playerId, text: sanitized });
      return;
    }
  }
}
