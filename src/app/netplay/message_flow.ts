import type { Game, MultiplayerGameMode } from '../../game.js';
import type { GameSource } from '../../shared/constants/index.js';
import type {
  ClientToHostMessage,
  HostToClientMessage,
  KickReasonCode,
  PlayerProfile,
  RoomGameModeOptions,
  RoomInfo,
} from '../../netcode_protocol.js';
import {
  formatLobbyDisconnectStatus,
  resolveKickDisconnectReason,
  resolveMatchEndReason,
} from './disconnect_reasons.js';

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
  getLobbyRoom: () => RoomInfo | null;
  getRoomGameMode: (room: RoomInfo | null | undefined) => MultiplayerGameMode;
  getRoomGameModeOptions: (room: RoomInfo | null | undefined, mode: MultiplayerGameMode) => RoomGameModeOptions;
  applyGameModeOptionsToGame: (mode: MultiplayerGameMode, raw: unknown) => RoomGameModeOptions;
  modeChained: MultiplayerGameMode;
  lobbyMaxPlayers: number;
  chainedMaxPlayers: number;
  normalizeMultiplayerGameMode: (mode: unknown) => MultiplayerGameMode;
  setLobbyRoom: (room: RoomInfo) => void;
  setActiveGameSource: (source: GameSource) => void;
  getStageBasePath: (source: GameSource) => string;
  setCurrentSmb2LikeMode: (mode: string | null) => void;
  startStage: (course: any) => Promise<void>;
  sendSnapshotToClient: (playerId: number, frame?: number) => void;
  hostRelay: () => any | null;
  rejectHostConnection: (playerId: number, reasonCode?: KickReasonCode, reason?: string) => void;
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
  snapshotMismatchCooldownMs: number;
};

export class NetplayMessageFlowController {
  private readonly deps: MessageFlowDeps;

  constructor(deps: MessageFlowDeps) {
    this.deps = deps;
  }

  private getContiguousBaseFrame(state: any) {
    const sessionFrame = state?.session?.getFrame?.();
    if (Number.isFinite(sessionFrame)) {
      return Math.max(-1, Math.floor(sessionFrame));
    }
    const lastReceived = state?.lastReceivedHostFrame;
    if (Number.isFinite(lastReceived)) {
      return Math.max(-1, Math.floor(lastReceived));
    }
    return -1;
  }

  private coerceAckFrame(value: unknown): number | null {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return null;
    }
    if (num < 0) {
      return -1;
    }
    return Math.floor(num);
  }

  private recordHashMismatch(state: any, frame: number, expectedHash: number, localHash: number, nowMs: number) {
    const normalizedExpected = expectedHash >>> 0;
    const normalizedLocal = localHash >>> 0;
    const sameSignature = state.lastMismatchSignatureFrame === frame
      && (Number(state.lastMismatchSignatureExpectedHash) >>> 0) === normalizedExpected
      && (Number(state.lastMismatchSignatureLocalHash) >>> 0) === normalizedLocal;
    if (sameSignature) {
      return false;
    }
    state.lastMismatchSignatureFrame = frame;
    state.lastMismatchSignatureExpectedHash = normalizedExpected;
    state.lastMismatchSignatureLocalHash = normalizedLocal;
    state.lastMismatchSignatureAtMs = nowMs;
    state.debugHashMismatchCount = (state.debugHashMismatchCount ?? 0) + 1;
    state.debugLastMismatchFrame = frame;
    state.debugLastMismatchExpectedHash = normalizedExpected;
    state.debugLastMismatchLocalHash = normalizedLocal;
    state.debugLastMismatchAtMs = nowMs;
    const localParts = state.hashBreakdownHistory?.get?.(frame) ?? null;
    const expectedParts = state.expectedHashProbeByFrame?.get?.(frame) ?? null;
    if (!localParts || !expectedParts) {
      state.debugLastMismatchParts = null;
      return true;
    }
    state.debugLastMismatchParts = {
      ballsLocal: localParts.ballsHash >>> 0,
      ballsHost: expectedParts.ballsHash >>> 0,
      worldsLocal: localParts.worldsHash >>> 0,
      worldsHost: expectedParts.worldsHash >>> 0,
      stageLocal: localParts.stageHash >>> 0,
      stageHost: expectedParts.stageHash >>> 0,
      detLocal: localParts.detHash >>> 0,
      detHost: expectedParts.detHash >>> 0,
    };
    return true;
  }

  private markHostFrameReceived(state: any, frame: number) {
    if (state.role !== 'client') {
      return;
    }
    state.receivedHostFrames?.add?.(frame);
    const pending = state.pendingHostFrameReceipts;
    if (!pending?.add || !pending?.has || !pending?.delete) {
      return;
    }
    pending.add(frame);
    let contiguous = Number.isFinite(state.highestContiguousHostFrame)
      ? Math.floor(state.highestContiguousHostFrame)
      : this.getContiguousBaseFrame(state);
    while (pending.has(contiguous + 1)) {
      contiguous += 1;
      pending.delete(contiguous);
    }
    state.highestContiguousHostFrame = contiguous;
  }

  private markClientInputFrameReceived(state: any, clientState: any, frame: number) {
    if (!clientState) {
      return;
    }
    if (!clientState.pendingClientInputReceipts?.add) {
      clientState.pendingClientInputReceipts = new Set<number>();
    }
    const pending = clientState.pendingClientInputReceipts;
    pending.add(frame);
    let contiguous = Number.isFinite(clientState.lastAckedClientInput)
      ? Math.floor(clientState.lastAckedClientInput)
      : this.getContiguousBaseFrame(state);
    while (pending.has(contiguous + 1)) {
      contiguous += 1;
      pending.delete(contiguous);
    }
    clientState.lastAckedClientInput = contiguous;
  }

  private canValidateHashFrame(state: any, frame: number) {
    if (state.role !== 'client') {
      return true;
    }
    const contiguous = Number.isFinite(state.highestContiguousHostFrame)
      ? Math.floor(state.highestContiguousHostFrame)
      : this.getContiguousBaseFrame(state);
    return frame <= contiguous;
  }

  private maybeValidateExpectedHashes(state: any, nowMs: number) {
    for (const [frame, expected] of state.expectedHashes.entries()) {
      if (!this.canValidateHashFrame(state, frame)) {
        continue;
      }
      const localHash = state.hashHistory.get(frame);
      if (localHash === undefined || localHash === expected) {
        continue;
      }
      state.expectedHashes.delete(frame);
      if (this.recordHashMismatch(state, frame, expected, localHash, nowMs)) {
        this.deps.requestSnapshot('mismatch', frame);
      }
      return;
    }
  }

  applyIncomingProfile(
    playerId: number,
    incoming: PlayerProfile,
    { broadcast }: { broadcast?: boolean } = {},
  ) {
    const sanitized = this.deps.sanitizeProfile(incoming);
    const baseProfile: PlayerProfile = {
      name: sanitized.name,
      ball: sanitized.ball,
      playerBillboardTexture: sanitized.playerBillboardTexture,
    };
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
      const finalProfile: PlayerProfile = {
        name: current?.name ?? sanitized.name,
        ball: current?.ball,
        avatarData,
        playerBillboardTexture: current?.playerBillboardTexture ?? sanitized.playerBillboardTexture,
      };
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
        this.deps.lobbyStatus.textContent = formatLobbyDisconnectStatus(
          resolveKickDisconnectReason(msg.reasonCode, msg.reason),
        );
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
      state.lastAckedLocalFrame = Math.max(0, Math.floor(msg.frame));
      state.receivedHostFrames?.clear?.();
      state.pendingHostFrameReceipts?.clear?.();
      state.highestContiguousHostFrame = Math.max(-1, Math.floor(msg.frame));
      // Don't immediately snapshot just because stage_sync arrives a few frames late.
      // Under high RTT/loss, the client can often catch up deterministically during intro.
      // Reserve forced snapshot for gaps beyond rollback reach.
      if ((msg.frame - state.session.getFrame()) > Math.max(0, Math.floor(state.maxRollback ?? 0))) {
        this.deps.requestSnapshot('lag', msg.frame, true);
      }
      return;
    }
    if (msg.type === 'hash_probe') {
      const frame = this.deps.coerceFrame(msg.frame);
      if (frame === null || !Number.isFinite(msg.hash)) {
        return;
      }
      const expected = Number(msg.hash) >>> 0;
      state.expectedHashProbeByFrame?.set?.(frame, {
        hash: expected,
        ballsHash: Number(msg.ballsHash) >>> 0,
        worldsHash: Number(msg.worldsHash) >>> 0,
        stageHash: Number(msg.stageHash) >>> 0,
        detHash: Number(msg.detHash) >>> 0,
      });
      const localHash = state.hashHistory.get(frame);
      if (localHash !== undefined && localHash !== expected && this.canValidateHashFrame(state, frame)) {
        if (this.recordHashMismatch(state, frame, expected, localHash, performance.now())) {
          this.deps.requestSnapshot('mismatch', frame);
        }
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
        const ackFrame = this.coerceAckFrame(msg.lastAck);
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
      this.markHostFrameReceived(state, frame);
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
          state.expectedHashes.set(hashFrame, Number(msg.hash) >>> 0);
        }
      }
      const currentFrame = state.session.getFrame();
      if (changed && frame <= currentFrame) {
        if (!this.deps.rollbackAndResim(frame)) {
          this.deps.requestSnapshot('lag');
          return;
        }
      }
      this.maybeValidateExpectedHashes(state, performance.now());
      const postFrame = state.session.getFrame();
      if (state.lastReceivedHostFrame - postFrame > state.maxRollback) {
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
        currentState.debugSnapshotsReceived = (currentState.debugSnapshotsReceived ?? 0) + 1;
        currentState.debugLastSnapshotReceivedFrame = msg.frame;
        const localStageId = this.deps.game.stage?.stageId;
        if (msg.stageId !== undefined && localStageId !== msg.stageId) {
          currentState.debugSnapshotsDeferredStageId = (currentState.debugSnapshotsDeferredStageId ?? 0) + 1;
          currentState.debugLastSnapshotApplyResult = 'deferred_stage_id';
        }
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
      const reason = resolveMatchEndReason(msg.reason);
      this.deps.endMatchToLobby();
      if (this.deps.lobbyStatus) {
        this.deps.lobbyStatus.textContent = formatLobbyDisconnectStatus(reason);
      }
      return;
    }
    if (msg.type === 'room_update') {
      const mode = this.deps.getRoomGameMode(msg.room);
      const modeOptions = this.deps.getRoomGameModeOptions(msg.room, mode);
      const maxPlayersCap = mode === this.deps.modeChained
        ? this.deps.chainedMaxPlayers
        : this.deps.lobbyMaxPlayers;
      const cappedMaxPlayers = Math.min(msg.room.settings.maxPlayers, maxPlayersCap);
      msg.room.settings.maxPlayers = cappedMaxPlayers;
      this.deps.game.maxPlayers = cappedMaxPlayers;
      this.deps.game.playerCollisionEnabled = msg.room.settings.collisionEnabled;
      this.deps.game.infiniteTimeEnabled = !!(msg.room.settings.infiniteTimeEnabled ?? false);
      this.deps.game.setMultiplayerGameMode(mode);
      this.deps.applyGameModeOptionsToGame(mode, modeOptions);
      if (this.deps.getNetplayState()) {
        this.deps.getNetplayState().currentGameMode = mode;
      }
      this.deps.setLobbyRoom(msg.room);
      this.deps.updateLobbyUi();
      return;
    }
    if (msg.type === 'start') {
      const mode = this.deps.normalizeMultiplayerGameMode(msg.gameMode);
      const fallbackRoom = this.deps.getLobbyRoom();
      const modeOptions = msg.gameModeOptions
        ?? this.deps.getRoomGameModeOptions(fallbackRoom, mode);
      const currentState = this.deps.getNetplayState();
      if (currentState) {
        currentState.stageSeq = msg.stageSeq;
        currentState.currentCourse = msg.course;
        currentState.currentGameSource = msg.gameSource;
        currentState.currentGameMode = mode;
        currentState.awaitingSnapshot = false;
        currentState.expectedHashes.clear();
        currentState.hashHistory.clear();
        currentState.hashBreakdownHistory?.clear?.();
        currentState.expectedHashProbeByFrame?.clear?.();
        currentState.lastMismatchSignatureFrame = null;
        currentState.lastMismatchSignatureExpectedHash = null;
        currentState.lastMismatchSignatureLocalHash = null;
        currentState.lastMismatchSignatureAtMs = null;
        currentState.receivedHostFrames?.clear?.();
        currentState.pendingHostFrameReceipts?.clear?.();
        currentState.highestContiguousHostFrame = this.getContiguousBaseFrame(currentState);
        currentState.debugSnapshotsReceived = 0;
        currentState.debugSnapshotsApplied = 0;
        currentState.debugSnapshotsDroppedStageSeq = 0;
        currentState.debugSnapshotsDeferredStageId = 0;
        currentState.debugLastSnapshotReceivedFrame = null;
        currentState.debugLastSnapshotAppliedFrame = null;
        currentState.debugLastSnapshotApplyResult = null;
      }
      if (msg.lateJoin && Number.isFinite(this.deps.game.localPlayerId) && this.deps.game.localPlayerId > 0) {
        this.deps.markPlayerPendingSpawn(this.deps.game.localPlayerId, msg.stageSeq);
      }
      this.deps.promotePendingSpawns(msg.stageSeq);
      this.deps.setPendingSnapshot(null);
      this.deps.setActiveGameSource(msg.gameSource);
      this.deps.game.setGameSource(msg.gameSource);
      this.deps.game.setMultiplayerGameMode(mode);
      this.deps.applyGameModeOptionsToGame(mode, modeOptions);
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
    const nowMs = performance.now();
    let clientState = state.clientStates.get(playerId);
    if (!clientState) {
      const baseFrame = this.getContiguousBaseFrame(state);
      clientState = {
        lastAckedHostFrame: -1,
        lastAckedClientInput: baseFrame,
        pendingClientInputReceipts: new Set<number>(),
        lastSnapshotMs: null,
        lastSnapshotRequestMs: null,
        lastInboundMessageMs: nowMs,
        timeoutKickSentMs: null,
      };
      state.clientStates.set(playerId, clientState);
    }
    if (!Number.isFinite(clientState.lastInboundMessageMs)) {
      clientState.lastInboundMessageMs = nowMs;
    }
    if (clientState.timeoutKickSentMs === undefined) {
      clientState.timeoutKickSentMs = null;
    }
    clientState.lastInboundMessageMs = nowMs;
    const msgStageSeq = (msg as { stageSeq?: number }).stageSeq;
    if (msgStageSeq !== undefined && msgStageSeq !== state.stageSeq) {
      return;
    }
    if (!this.deps.game.players.some((player) => player.id === playerId)) {
      if (this.deps.game.players.length >= this.deps.game.maxPlayers) {
        state.clientStates.delete(playerId);
        this.deps.rejectHostConnection(playerId, 'kick_room_full', 'Room is full');
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
        const ackFrame = this.coerceAckFrame(msg.lastAck);
        if (ackFrame !== null) {
          clientState.lastAckedHostFrame = Math.max(
            clientState.lastAckedHostFrame,
            Math.min(ackFrame, state.session.getFrame()),
          );
        }
      }
      if (awaitingSpawn) {
        this.markClientInputFrameReceived(state, clientState, frame);
        return;
      }
      const currentFrame = state.session.getFrame();
      const minFrame = Math.max(0, currentFrame - Math.min(state.maxRollback, this.deps.maxInputBehind));
      const maxFrame = currentFrame + this.deps.maxInputAhead;
      if (frame > maxFrame) {
        return;
      }
      if (frame < minFrame) {
        this.markClientInputFrameReceived(state, clientState, frame);
        return;
      }
      if (frame <= currentFrame && (currentFrame - frame) > this.deps.hostMaxInputRollback) {
        this.markClientInputFrameReceived(state, clientState, frame);
        const nowMs = performance.now();
        const lastSnap = clientState.lastSnapshotMs;
        if (lastSnap === null || (nowMs - lastSnap) >= this.deps.hostSnapshotCooldownMs) {
          clientState.lastSnapshotMs = nowMs;
          this.deps.sendSnapshotToClient(playerId, currentFrame);
        }
        return;
      }
      this.markClientInputFrameReceived(state, clientState, frame);
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
      const frame = this.coerceAckFrame(msg.frame);
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
      const reason = msg.reason === 'mismatch' ? 'mismatch' : 'lag';
      const cooldownMs = reason === 'mismatch'
        ? this.deps.snapshotMismatchCooldownMs
        : this.deps.snapshotCooldownMs;
      const lastRequest = clientState.lastSnapshotRequestMs ?? 0;
      if (clientState.lastSnapshotRequestMs !== null
        && (nowMs - lastRequest) < cooldownMs) {
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
