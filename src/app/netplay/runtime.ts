import type { Game } from '../../game.js';
import type { QuantizedInput } from '../../determinism.js';
import type { FrameBundleMessage } from '../../netcode_protocol.js';

type RuntimeConstants = {
  maxFrameDelta: number;
  clientAheadSlack: number;
  clientRateMin: number;
  clientRateMax: number;
  clientDriftRate: number;
  driftForceTick: number;
  driftExtraTicks: number;
  syncRateMin: number;
  syncRateMax: number;
  syncDriftRate: number;
  syncForceTick: number;
  syncExtraTicks: number;
  syncMaxTicks: number;
  pingIntervalMs: number;
  hostStallMs: number;
  lagFuseFrames: number;
  lagFuseMs: number;
  snapshotCooldownMs: number;
  hostSnapshotBehindFrames: number;
  hostSnapshotCooldownMs: number;
};

type RuntimeDeps = {
  game: Game;
  netplayEnabled: () => boolean;
  getNetplayState: () => any | null;
  getClientPeer: () => any | null;
  getHostRelay: () => any | null;
  getNetplayAccumulator: () => number;
  setNetplayAccumulator: (value: number) => void;
  buildInputsForFrame: (frame: number) => Map<number, QuantizedInput>;
  recordInputForFrame: (frame: number, playerId: number, input: QuantizedInput) => boolean;
  trimNetplayHistory: (frame: number) => void;
  getSimHash: () => number;
  requestSnapshot: (reason: 'mismatch' | 'lag', frame?: number, force?: boolean) => void;
  hostApplyPendingRollback: () => void;
  sendSnapshotToClient: (playerId: number, frame?: number) => void;
  maybeResendStageReady: (nowMs: number) => void;
  maybeForceStageSync: (nowMs: number) => void;
  getAuthoritativeHashFrame: (state: any) => number | null;
  getEstimatedHostFrame: (state: any) => number;
  getClientLeadFrames: (state: any) => number;
  recordNetplayPerf: (startMs: number, simTicks?: number) => void;
  isNetplayDebugEnabled: () => boolean;
  netplayDebugOverlay: { show: (warning: string | null, lines: string[]) => void; hide: () => void };
  constants: RuntimeConstants;
};

function clamp(value: number, min: number, max: number) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export class NetplayRuntimeController {
  private readonly deps: RuntimeDeps;

  constructor(deps: RuntimeDeps) {
    this.deps = deps;
  }

  private getNetplayTargetFrame(state: any, currentFrame: number) {
    if (state.role === 'client') {
      return this.deps.getEstimatedHostFrame(state) + this.deps.getClientLeadFrames(state);
    }
    return currentFrame;
  }

  private hostResendFrames(currentFrame: number) {
    const hostRelay = this.deps.getHostRelay();
    const state = this.deps.getNetplayState();
    if (!hostRelay || !state) {
      return;
    }
    const pendingFrames = state.pendingHostUpdates.size > 0
      ? Array.from(state.pendingHostUpdates).sort((a, b) => a - b)
      : null;
    for (const [playerId, clientState] of state.clientStates.entries()) {
      const ackedHostFrame = Math.min(clientState.lastAckedHostFrame, currentFrame);
      const start = Math.max(ackedHostFrame + 1, currentFrame - state.maxResend + 1);
      const framesToSend = new Set<number>();
      if (pendingFrames) {
        for (const frame of pendingFrames) {
          framesToSend.add(frame);
        }
      }
      for (let frame = start; frame <= currentFrame; frame += 1) {
        framesToSend.add(frame);
      }
      const bundles: FrameBundleMessage[] = [];
      for (const frame of Array.from(framesToSend).sort((a, b) => a - b)) {
        const bundle = state.hostFrameBuffer.get(frame);
        if (!bundle) {
          continue;
        }
        bundles.push(bundle);
      }
      if (bundles.length > 0) {
        hostRelay.sendFrameBatch(playerId, clientState.lastAckedClientInput, bundles);
      }
    }
    if (pendingFrames) {
      state.pendingHostUpdates.clear();
    }
  }

  private hostMaybeSendSnapshots(nowMs: number) {
    const hostRelay = this.deps.getHostRelay();
    const state = this.deps.getNetplayState();
    if (!hostRelay || !state || state.role !== 'host') {
      return;
    }
    const currentFrame = state.session.getFrame();
    for (const [playerId, clientState] of state.clientStates.entries()) {
      const ackedHostFrame = Math.min(clientState.lastAckedHostFrame, currentFrame);
      if (ackedHostFrame < 0) {
        continue;
      }
      const behind = currentFrame - ackedHostFrame;
      if (behind < this.deps.constants.hostSnapshotBehindFrames) {
        continue;
      }
      const lastSnap = clientState.lastSnapshotMs;
      if (lastSnap !== null && (nowMs - lastSnap) < this.deps.constants.hostSnapshotCooldownMs) {
        continue;
      }
      clientState.lastSnapshotMs = nowMs;
      this.deps.sendSnapshotToClient(playerId, currentFrame);
    }
  }

  private clientSendInputBuffer(currentFrame: number) {
    const clientPeer = this.deps.getClientPeer();
    const state = this.deps.getNetplayState();
    if (!clientPeer || !state) {
      return;
    }
    const start = state.lastAckedLocalFrame + 1;
    const end = currentFrame;
    const minFrame = Math.max(start, end - state.maxResend + 1);
    const batchEntries: Array<{ frame: number; input: QuantizedInput }> = [];
    for (let frame = minFrame; frame <= end; frame += 1) {
      const input = state.pendingLocalInputs.get(frame);
      if (!input) {
        continue;
      }
      batchEntries.push({ frame, input });
    }
    if (batchEntries.length > 0) {
      clientPeer.sendInputBatch(state.stageSeq, state.lastReceivedHostFrame, batchEntries);
    }
    if (start > end) {
      clientPeer.send({
        type: 'ack',
        stageSeq: state.stageSeq,
        playerId: this.deps.game.localPlayerId,
        frame: state.lastReceivedHostFrame,
      });
    }
  }

  private netplayStep() {
    const state = this.deps.getNetplayState();
    if (!state) {
      return;
    }
    const session = state.session;
    const currentFrame = session.getFrame();
    const targetFrame = this.getNetplayTargetFrame(state, currentFrame);
    const drift = targetFrame - currentFrame;
    if (state.role === 'client' && drift < -this.deps.constants.clientAheadSlack) {
      this.clientSendInputBuffer(currentFrame);
      return;
    }
    const frame = session.getFrame() + 1;
    const localInput = this.deps.game.sampleLocalInput();
    this.deps.recordInputForFrame(frame, this.deps.game.localPlayerId, localInput);
    if (state.role === 'client') {
      state.pendingLocalInputs.set(frame, localInput);
    }
    const inputs = this.deps.buildInputsForFrame(frame);
    session.advanceTo(frame, inputs);
    let hash: number | undefined;
    if (state.hashInterval > 0 && frame % state.hashInterval === 0) {
      hash = this.deps.getSimHash();
      state.hashHistory.set(frame, hash);
      const expected = state.expectedHashes.get(frame);
      if (expected !== undefined && expected !== hash) {
        this.deps.requestSnapshot('mismatch', frame);
      }
    }
    if (state.role === 'host') {
      let hashFrame: number | null = null;
      let authHash: number | undefined;
      const authHashFrame = this.deps.getAuthoritativeHashFrame(state);
      if (authHashFrame !== null) {
        const value = state.hashHistory.get(authHashFrame);
        if (value !== undefined) {
          hashFrame = authHashFrame;
          authHash = value;
          state.lastAuthHashFrameSent = authHashFrame;
        }
      }
      const bundleInputs: Record<number, QuantizedInput> = {};
      for (const [playerId, input] of inputs.entries()) {
        bundleInputs[playerId] = input;
      }
      const bundle: FrameBundleMessage = {
        type: 'frame',
        stageSeq: state.stageSeq,
        frame,
        inputs: bundleInputs,
      };
      if (hashFrame !== null && authHash !== undefined) {
        bundle.hashFrame = hashFrame;
        bundle.hash = authHash;
      }
      state.hostFrameBuffer.set(frame, bundle);
      const minFrame = frame - Math.max(state.maxRollback, state.maxResend);
      for (const key of Array.from(state.hostFrameBuffer.keys())) {
        if (key < minFrame) {
          state.hostFrameBuffer.delete(key);
        }
      }
    }
    this.deps.trimNetplayHistory(frame);
    if (state.role === 'host') {
      this.hostResendFrames(session.getFrame());
    } else {
      this.clientSendInputBuffer(session.getFrame());
    }
  }

  netplayTick(dtSeconds: number) {
    const state = this.deps.getNetplayState();
    if (!state) {
      return;
    }
    const perfStart = performance.now();
    if (!this.deps.game.stageRuntime || this.deps.game.loadingStage) {
      this.deps.game.update(0);
      this.deps.recordNetplayPerf(perfStart, 0);
      return;
    }
    const nowMs = performance.now();
    if (state.role === 'client' && state.awaitingStageSync) {
      this.deps.maybeResendStageReady(nowMs);
      this.deps.game.accumulator = 0;
      this.deps.recordNetplayPerf(perfStart, 0);
      return;
    }
    if (state.role === 'host' && state.awaitingStageReady) {
      this.deps.maybeForceStageSync(nowMs);
      if (state.awaitingStageReady) {
        this.deps.game.accumulator = 0;
        this.deps.recordNetplayPerf(perfStart, 0);
        return;
      }
    }
    if (state.role === 'host') {
      this.deps.hostApplyPendingRollback();
    }
    let netplayAccumulator = this.deps.getNetplayAccumulator();
    if (netplayAccumulator < 0) {
      netplayAccumulator = 0;
    }
    const session = state.session;
    const currentFrame = session.getFrame();
    const targetFrame = this.getNetplayTargetFrame(state, currentFrame);
    const simFrame = currentFrame + (netplayAccumulator / this.deps.game.fixedStep);
    const drift = targetFrame - simFrame;
    const introSync = this.deps.game.introTimerFrames > 0;
    if (state.role === 'client') {
      const clientPeer = this.deps.getClientPeer();
      if (clientPeer && nowMs - state.lastPingTimeMs >= this.deps.constants.pingIntervalMs) {
        const pingId = (state.pingSeq += 1);
        state.pendingPings.set(pingId, nowMs);
        state.lastPingTimeMs = nowMs;
        clientPeer.send({ type: 'ping', id: pingId });
      }
      const hostAge = state.lastHostFrameTimeMs === null ? null : nowMs - state.lastHostFrameTimeMs;
      const lastRequest = state.lastSnapshotRequestTimeMs ?? 0;
      const canRequest = state.lastSnapshotRequestTimeMs === null
        || (nowMs - lastRequest) >= this.deps.constants.snapshotCooldownMs;
      if (hostAge !== null && hostAge >= this.deps.constants.hostStallMs && canRequest) {
        this.deps.requestSnapshot('lag', state.lastReceivedHostFrame, true);
      }
      if (drift > this.deps.constants.lagFuseFrames) {
        if (state.lagBehindSinceMs === null) {
          state.lagBehindSinceMs = nowMs;
        }
        const timeBehind = nowMs - state.lagBehindSinceMs;
        if (timeBehind >= this.deps.constants.lagFuseMs && canRequest) {
          this.deps.requestSnapshot('lag', state.lastReceivedHostFrame, true);
        }
      } else {
        state.lagBehindSinceMs = null;
      }
    }
    if (state.role === 'client' && drift < -this.deps.constants.clientAheadSlack) {
      this.clientSendInputBuffer(currentFrame);
      this.deps.recordNetplayPerf(perfStart, 0);
      return;
    }
    let rateScale = 1;
    if (state.role === 'client') {
      const driftRate = introSync ? this.deps.constants.syncDriftRate : this.deps.constants.clientDriftRate;
      const desired = 1 + drift * driftRate;
      const minRate = introSync ? this.deps.constants.syncRateMin : this.deps.constants.clientRateMin;
      const maxRate = introSync ? this.deps.constants.syncRateMax : this.deps.constants.clientRateMax;
      rateScale = clamp(desired, minRate, maxRate);
    }
    netplayAccumulator = Math.min(
      netplayAccumulator + dtSeconds * rateScale,
      this.deps.game.fixedStep * this.deps.constants.maxFrameDelta,
    );
    let ticks = Math.floor(netplayAccumulator / this.deps.game.fixedStep);
    const forceTick = introSync ? this.deps.constants.syncForceTick : this.deps.constants.driftForceTick;
    if (ticks <= 0 && drift > forceTick) {
      ticks = 1;
    }
    const extraTick = introSync ? this.deps.constants.syncExtraTicks : this.deps.constants.driftExtraTicks;
    if (drift > extraTick) {
      const maxTicks = introSync ? this.deps.constants.syncMaxTicks : 3;
      const add = introSync ? 2 : 1;
      ticks = Math.min(maxTicks, Math.max(1, ticks + add));
    }
    for (let i = 0; i < ticks; i += 1) {
      this.netplayStep();
      netplayAccumulator -= this.deps.game.fixedStep;
    }
    if (netplayAccumulator < 0) {
      netplayAccumulator = 0;
    }
    this.deps.setNetplayAccumulator(netplayAccumulator);
    if (state.role === 'host') {
      this.hostMaybeSendSnapshots(nowMs);
    }
    this.deps.game.accumulator = Math.max(0, Math.min(this.deps.game.fixedStep, netplayAccumulator));
    this.deps.recordNetplayPerf(perfStart, ticks);
  }

  updateNetplayDebugOverlay(nowMs: number) {
    const state = this.deps.getNetplayState();
    if (!this.deps.netplayEnabled() || !state) {
      this.deps.game.netplayDebugLines = null;
      this.deps.game.netplayWarning = null;
      this.deps.netplayDebugOverlay.hide();
      return;
    }
    const localPlayer = this.deps.game.getLocalPlayer?.() ?? null;
    let warning: string | null = null;
    if (state.role === 'client') {
      const hostAge = state.lastHostFrameTimeMs === null ? null : nowMs - state.lastHostFrameTimeMs;
      if (hostAge !== null && hostAge > this.deps.constants.hostStallMs) {
        warning = `NET: host frames stale ${(hostAge / 1000).toFixed(1)}s`;
      } else if (state.awaitingStageSync) {
        warning = 'NET: awaiting stage sync';
      }
    }
    if (!warning && localPlayer) {
      if (localPlayer.isSpectator) {
        warning = 'NET: local spectator';
      } else if (localPlayer.pendingSpawn) {
        warning = 'NET: local pending spawn';
      }
    }
    this.deps.game.netplayWarning = warning;

    if (!this.deps.isNetplayDebugEnabled()) {
      this.deps.game.netplayDebugLines = null;
      if (!warning) {
        this.deps.netplayDebugOverlay.hide();
        return;
      }
      this.deps.netplayDebugOverlay.show(warning, []);
      return;
    }

    const sessionFrame = state.session.getFrame();
    const simFrame = sessionFrame + (this.deps.getNetplayAccumulator() / this.deps.game.fixedStep);
    const targetFrame = this.getNetplayTargetFrame(state, sessionFrame);
    const drift = targetFrame - simFrame;
    const lines: string[] = [];
    lines.push(`net ${state.role} id=${this.deps.game.localPlayerId}`);
    lines.push(`stage=${state.currentStageId ?? this.deps.game.stage?.stageId ?? 0} seq=${state.stageSeq}`);
    lines.push(`frame=${sessionFrame} host=${state.lastReceivedHostFrame} ack=${state.lastAckedLocalFrame}`);
    lines.push(`drift=${drift.toFixed(2)} acc=${this.deps.getNetplayAccumulator().toFixed(3)}`);
    lines.push(`sync=${state.awaitingStageSync ? 1 : 0} ready=${state.awaitingStageReady ? 1 : 0} snap=${state.awaitingSnapshot ? 1 : 0}`);
    if (state.role === 'client') {
      const chanState = this.deps.getClientPeer()?.getChannelState?.() ?? 'none';
      const hostAge = state.lastHostFrameTimeMs === null ? 'n/a' : `${((nowMs - state.lastHostFrameTimeMs) / 1000).toFixed(1)}s`;
      lines.push(`peer=${chanState} hostAge=${hostAge}`);
    } else {
      const peers = this.deps.getHostRelay()?.getChannelStates?.() ?? [];
      const peerText = peers.length
        ? peers.map((peer: any) => `${peer.playerId}:${peer.readyState}`).join(' ')
        : 'none';
      lines.push(`peers=${peerText}`);
      if (state.clientStates.size > 0) {
        const currentFrame = state.session.getFrame();
        const behind = Array.from(state.clientStates.entries())
          .map(([playerId, clientState]: [number, any]) => {
            const ackedHostFrame = Math.min(clientState.lastAckedHostFrame, currentFrame);
            return `${playerId}:${currentFrame - ackedHostFrame}`;
          })
          .join(' ');
        lines.push(`behind=${behind}`);
      }
    }
    if (localPlayer) {
      lines.push(`local spec=${localPlayer.isSpectator ? 1 : 0} spawn=${localPlayer.pendingSpawn ? 1 : 0} state=${localPlayer.ball?.state ?? 0}`);
    }
    lines.push(`intro=${this.deps.game.introTimerFrames} timeover=${this.deps.game.timeoverTimerFrames}`);
    this.deps.game.netplayDebugLines = lines;
    this.deps.netplayDebugOverlay.show(warning, lines);
  }
}
