import type { Game, MultiplayerGameMode } from '../../game.js';
import type { QuantizedInput } from '../../determinism.js';
import type { FrameBundleMessage } from '../../netcode_protocol.js';
import type { GameSource } from '../../shared/constants/index.js';
import { hashSimState } from '../../sim_hash.js';

type NetplayRole = 'host' | 'client';

type NetplayStateDeps = {
  game: Game;
  setNetplayState: (state: any | null) => void;
  getNetplayState: () => any | null;
  getHostRelay: () => any | null;
  getClientPeer: () => any | null;
  setNetplayAccumulator: (value: number) => void;
  normalizeMultiplayerGameMode: (mode: unknown) => MultiplayerGameMode;
  getActiveGameSource: () => GameSource;
  getStageBasePath: (gameSource: GameSource) => string;
  getLobbyRoom: () => any;
  maxRollback: number;
  maxResend: number;
  hashInterval: number;
  netplayClientLead: number;
  netplayClientMaxExtraLead: number;
  stageReadyResendMs: number;
  stageReadyTimeoutMs: number;
};

export class NetplayStateSyncController {
  private readonly deps: NetplayStateDeps;

  constructor(deps: NetplayStateDeps) {
    this.deps = deps;
  }

  private clampInt(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, Math.trunc(value)));
  }

  private createNetplayId() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] >>> 0;
  }

  quantizedEqual(a: QuantizedInput, b: QuantizedInput) {
    return a.x === b.x && a.y === b.y && (a.buttons ?? 0) === (b.buttons ?? 0);
  }

  coerceFrame(value: unknown): number | null {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return null;
    }
    return Math.max(0, Math.floor(num));
  }

  private clampQuantizedAxis(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return 0;
    }
    return this.clampInt(Math.round(num), -127, 127);
  }

  normalizeInput(input: any): QuantizedInput | null {
    if (!input || typeof input !== 'object') {
      return null;
    }
    const buttonsNum = Number(input.buttons ?? 0);
    return {
      x: this.clampQuantizedAxis(input.x),
      y: this.clampQuantizedAxis(input.y),
      buttons: Number.isFinite(buttonsNum) ? (buttonsNum | 0) : 0,
    };
  }

  ensureNetplayState(role: NetplayRole) {
    const current = this.deps.getNetplayState();
    if (current && current.role === role) {
      return current;
    }
    const session = this.deps.game.ensureRollbackSession();
    session.prime(this.deps.game.simTick);
    this.deps.game.netplayRttMs = null;
    const next = {
      role,
      session,
      inputHistory: new Map<number, Map<number, QuantizedInput>>(),
      lastInputs: new Map<number, QuantizedInput>(),
      pendingLocalInputs: new Map<number, QuantizedInput>(),
      lastAckedLocalFrame: -1,
      lastReceivedHostFrame: this.deps.game.simTick,
      hostFrameBuffer: new Map<number, FrameBundleMessage>(),
      clientStates: new Map(),
      maxRollback: this.deps.maxRollback,
      maxResend: this.deps.maxResend,
      hashInterval: this.deps.hashInterval,
      hashHistory: new Map<number, number>(),
      expectedHashes: new Map<number, number>(),
      lastAuthHashFrameSent: -1,
      pendingHostUpdates: new Set<number>(),
      lastHostFrameTimeMs: null,
      lagBehindSinceMs: null,
      lastSnapshotRequestTimeMs: null,
      rttMs: null,
      pingSeq: 0,
      pendingPings: new Map<number, number>(),
      lastPingTimeMs: 0,
      currentStageId: null,
      readyPlayers: new Set<number>(),
      awaitingStageReady: false,
      awaitingStageSync: false,
      stageSeq: this.createNetplayId(),
      stageReadySentMs: null,
      stageReadyTimeoutMs: null,
      currentCourse: null,
      currentGameSource: null,
      currentGameMode: null,
      awaitingSnapshot: false,
      pendingHostRollbackFrame: null,
      pendingHostRollbackPlayers: new Set<number>(),
    };
    this.deps.setNetplayState(next);
    return next;
  }

  resetNetplaySession() {
    this.deps.game.rollbackSession = null;
    const session = this.deps.game.ensureRollbackSession();
    session.prime(this.deps.game.simTick);
    const state = this.deps.getNetplayState();
    if (state) {
      state.session = session;
    }
  }

  resetNetplayForStage() {
    const state = this.deps.getNetplayState();
    if (!state) {
      return;
    }
    state.inputHistory.clear();
    state.lastInputs.clear();
    state.pendingLocalInputs.clear();
    state.hashHistory.clear();
    state.expectedHashes.clear();
    state.lastAuthHashFrameSent = -1;
    state.pendingHostUpdates.clear();
    state.pendingPings.clear();
    state.lastPingTimeMs = 0;
    state.rttMs = null;
    this.deps.game.netplayRttMs = null;
    state.lastSnapshotRequestTimeMs = null;
    state.lastHostFrameTimeMs = null;
    state.lagBehindSinceMs = null;
    state.awaitingSnapshot = false;
    state.pendingHostRollbackFrame = null;
    state.pendingHostRollbackPlayers.clear();
    state.currentStageId = null;
    state.readyPlayers.clear();
    state.awaitingStageReady = false;
    state.awaitingStageSync = false;
    state.stageReadySentMs = null;
    state.stageReadyTimeoutMs = null;
    state.lastAckedLocalFrame = -1;
    state.lastReceivedHostFrame = this.deps.game.simTick;
    state.hostFrameBuffer.clear();
    for (const clientState of state.clientStates.values()) {
      clientState.lastAckedHostFrame = -1;
      clientState.lastAckedClientInput = -1;
      clientState.lastSnapshotMs = null;
      clientState.lastSnapshotRequestMs = null;
    }
    state.session.prime(this.deps.game.simTick);
    this.deps.setNetplayAccumulator(0);
  }

  private getExpectedStageReadyPlayers() {
    return this.deps.game.players
      .filter((player) => !player.pendingSpawn)
      .map((player) => player.id);
  }

  maybeSendStageSync() {
    const state = this.deps.getNetplayState();
    const hostRelay = this.deps.getHostRelay();
    if (!state || state.role !== 'host' || !hostRelay || !state.awaitingStageReady) {
      return;
    }
    const expectedPlayers = this.getExpectedStageReadyPlayers();
    if (!expectedPlayers.every((id) => state.readyPlayers.has(id))) {
      return;
    }
    state.awaitingStageReady = false;
    state.stageReadyTimeoutMs = null;
    state.stageReadySentMs = null;
    const frame = state.session.getFrame();
    hostRelay.broadcast({
      type: 'stage_sync',
      stageSeq: state.stageSeq,
      stageId: state.currentStageId ?? this.deps.game.stage?.stageId ?? 0,
      frame,
    });
  }

  sendStageSyncToClient(playerId: number) {
    const state = this.deps.getNetplayState();
    const hostRelay = this.deps.getHostRelay();
    if (!state || state.role !== 'host' || !hostRelay || state.currentStageId === null) {
      return;
    }
    hostRelay.sendTo(playerId, {
      type: 'stage_sync',
      stageSeq: state.stageSeq,
      stageId: state.currentStageId,
      frame: state.session.getFrame(),
    });
  }

  initStageSync(stageId: number) {
    const state = this.deps.getNetplayState();
    if (!state) {
      return;
    }
    state.currentStageId = stageId;
    state.readyPlayers.clear();
    state.readyPlayers.add(this.deps.game.localPlayerId);
    state.awaitingStageReady = state.role === 'host';
    state.awaitingStageSync = state.role === 'client';
    const nowMs = performance.now();
    state.stageReadySentMs = state.role === 'client' ? nowMs : null;
    state.stageReadyTimeoutMs = state.role === 'host' ? nowMs : null;
    if (state.role === 'client') {
      this.deps.getClientPeer()?.send({
        type: 'stage_ready',
        stageSeq: state.stageSeq,
        playerId: this.deps.game.localPlayerId,
        stageId,
      });
    }
    this.maybeSendStageSync();
  }

  markStageReady(stageId: number) {
    const state = this.deps.getNetplayState();
    if (!state) {
      return;
    }
    state.currentStageId = stageId;
    state.readyPlayers.add(this.deps.game.localPlayerId);
    state.awaitingStageSync = false;
    if (state.role === 'client') {
      const nowMs = performance.now();
      state.stageReadySentMs = nowMs;
      this.deps.getClientPeer()?.send({
        type: 'stage_ready',
        stageSeq: state.stageSeq,
        playerId: this.deps.game.localPlayerId,
        stageId,
      });
    }
    this.maybeSendStageSync();
  }

  maybeResendStageReady(nowMs: number) {
    const state = this.deps.getNetplayState();
    if (!state || state.role !== 'client' || !state.awaitingStageSync || state.currentStageId === null) {
      return;
    }
    const lastSent = state.stageReadySentMs ?? 0;
    if ((nowMs - lastSent) < this.deps.stageReadyResendMs) {
      return;
    }
    state.stageReadySentMs = nowMs;
    this.deps.getClientPeer()?.send({
      type: 'stage_ready',
      stageSeq: state.stageSeq,
      playerId: this.deps.game.localPlayerId,
      stageId: state.currentStageId,
    });
  }

  maybeForceStageSync(nowMs: number) {
    const state = this.deps.getNetplayState();
    const hostRelay = this.deps.getHostRelay();
    if (!state || state.role !== 'host' || !state.awaitingStageReady || !hostRelay) {
      return;
    }
    const startedAt = state.stageReadyTimeoutMs ?? nowMs;
    state.stageReadyTimeoutMs = startedAt;
    if ((nowMs - startedAt) < this.deps.stageReadyTimeoutMs) {
      return;
    }
    state.awaitingStageReady = false;
    state.stageReadyTimeoutMs = null;
    state.stageReadySentMs = null;
    const frame = state.session.getFrame();
    hostRelay.broadcast({
      type: 'stage_sync',
      stageSeq: state.stageSeq,
      stageId: state.currentStageId ?? this.deps.game.stage?.stageId ?? 0,
      frame,
    });
  }

  getSimHash() {
    if (!this.deps.game.stageRuntime || !this.deps.game.world) {
      return 0;
    }
    const players = this.deps.game.getPlayersSortedCached();
    const balls = players.map((player) => player.ball);
    const worlds = [this.deps.game.world, ...players.map((player) => player.world)];
    const baseHash = hashSimState(balls, worlds, this.deps.game.stageRuntime);
    return (baseHash ^ this.deps.game.getMultiplayerDeterminismHash()) >>> 0;
  }

  private getAuthoritativeFrame(state: any) {
    let authFrame = state.session.getFrame();
    for (const player of this.deps.game.players) {
      if (player.isSpectator || player.pendingSpawn || player.id === this.deps.game.localPlayerId) {
        continue;
      }
      const clientState = state.clientStates.get(player.id);
      if (!clientState) {
        return -1;
      }
      authFrame = Math.min(authFrame, clientState.lastAckedClientInput);
    }
    return authFrame;
  }

  getAuthoritativeHashFrame(state: any) {
    if (state.hashInterval <= 0) {
      return null;
    }
    const authFrame = this.getAuthoritativeFrame(state);
    if (authFrame < 0) {
      return null;
    }
    const hashFrame = authFrame - (authFrame % state.hashInterval);
    if (hashFrame < 0 || hashFrame <= state.lastAuthHashFrameSent) {
      return null;
    }
    if (!state.hashHistory.has(hashFrame)) {
      return null;
    }
    return hashFrame;
  }

  getEstimatedHostFrame(state: any) {
    if (state.role !== 'client') {
      return state.lastReceivedHostFrame;
    }
    if (state.lastHostFrameTimeMs === null) {
      return state.lastReceivedHostFrame;
    }
    const elapsedSeconds = (performance.now() - state.lastHostFrameTimeMs) / 1000;
    const maxAdvance = Math.max(1, state.maxRollback);
    const advance = Math.min(elapsedSeconds / this.deps.game.fixedStep, maxAdvance);
    return state.lastReceivedHostFrame + Math.max(0, advance);
  }

  private getIntroLeadScale() {
    const total = this.deps.game.introTotalFrames ?? 0;
    const remaining = this.deps.game.introTimerFrames ?? 0;
    if (total <= 0 || remaining <= 0) {
      return 1;
    }
    return Math.max(0, Math.min(1, 1 - (remaining / total)));
  }

  getClientLeadFrames(state: any) {
    let lead = this.deps.netplayClientLead;
    if (state.rttMs && state.rttMs > 0) {
      const rttFrames = (state.rttMs / 1000) / this.deps.game.fixedStep;
      const extra = Math.min(this.deps.netplayClientMaxExtraLead, Math.max(0, Math.floor(rttFrames * 0.5)));
      lead += extra;
    }
    const scale = this.getIntroLeadScale();
    if (scale >= 1) {
      return lead;
    }
    return Math.max(0, Math.floor(lead * scale));
  }
}
