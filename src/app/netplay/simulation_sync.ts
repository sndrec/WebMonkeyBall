import type { Game } from '../../game.js';
import type { QuantizedInput } from '../../determinism.js';

type SimulationDeps = {
  game: Game;
  getNetplayState: () => any | null;
  getPendingSnapshot: () => any | null;
  setPendingSnapshot: (snapshot: any | null) => void;
  getSimHash: () => number;
  resetNetplaySession: () => void;
  quantizedEqual: (a: QuantizedInput, b: QuantizedInput) => boolean;
  netplayPerf: {
    enabled: boolean;
    rollbackMs: number;
    rollbackFrames: number;
    rollbackCount: number;
    resimMs: number;
    resimFrames: number;
    resimCount: number;
  };
};

export class NetplaySimulationSyncController {
  private readonly deps: SimulationDeps;

  constructor(deps: SimulationDeps) {
    this.deps = deps;
  }

  recordInputForFrame(frame: number, playerId: number, input: QuantizedInput) {
    const state = this.deps.getNetplayState();
    if (!state) {
      return false;
    }
    let frameInputs = state.inputHistory.get(frame);
    if (!frameInputs) {
      frameInputs = new Map();
      state.inputHistory.set(frame, frameInputs);
    }
    const prev = frameInputs.get(playerId);
    if (prev && this.deps.quantizedEqual(prev, input)) {
      return false;
    }
    frameInputs.set(playerId, input);
    state.lastInputs.set(playerId, input);
    return true;
  }

  buildInputsForFrame(frame: number) {
    const state = this.deps.getNetplayState();
    if (!state) {
      return new Map<number, QuantizedInput>();
    }
    let frameInputs = state.inputHistory.get(frame);
    if (!frameInputs) {
      frameInputs = new Map();
      state.inputHistory.set(frame, frameInputs);
    }
    for (const player of this.deps.game.players) {
      if (!frameInputs.has(player.id)) {
        const last = state.lastInputs.get(player.id) ?? { x: 0, y: 0, buttons: 0 };
        frameInputs.set(player.id, last);
      }
    }
    return frameInputs;
  }

  trimNetplayHistory(frame: number) {
    const state = this.deps.getNetplayState();
    if (!state) {
      return;
    }
    const minFrame = frame - state.maxRollback;
    for (const key of Array.from(state.inputHistory.keys())) {
      if (key < minFrame) {
        state.inputHistory.delete(key);
      }
    }
    for (const key of Array.from(state.hashHistory.keys())) {
      if (key < minFrame) {
        state.hashHistory.delete(key);
      }
    }
    for (const key of Array.from(state.expectedHashes.keys())) {
      if (key < minFrame) {
        state.expectedHashes.delete(key);
      }
    }
  }

  rollbackAndResim(startFrame: number) {
    const state = this.deps.getNetplayState();
    if (!state) {
      return false;
    }
    const perfStart = this.deps.netplayPerf.enabled ? performance.now() : 0;
    const session = state.session;
    const current = session.getFrame();
    const rollbackFrame = Math.max(0, startFrame - 1);
    if (!session.rollbackTo(rollbackFrame)) {
      return false;
    }
    const resimFrames = current - rollbackFrame;
    const prevSuppress = session.suppressVisuals;
    session.suppressVisuals = true;
    try {
      for (let frame = rollbackFrame + 1; frame <= current; frame += 1) {
        const inputs = this.buildInputsForFrame(frame);
        session.advanceTo(frame, inputs);
        let hash: number | undefined;
        if (state.hashInterval > 0 && frame % state.hashInterval === 0) {
          hash = this.deps.getSimHash();
          state.hashHistory.set(frame, hash);
        }
        if (state.role === 'host') {
          const bundleInputs: Record<number, QuantizedInput> = {};
          for (const [playerId, input] of inputs.entries()) {
            bundleInputs[playerId] = input;
          }
          state.hostFrameBuffer.set(frame, {
            type: 'frame',
            stageSeq: state.stageSeq,
            frame,
            inputs: bundleInputs,
          });
        }
        this.trimNetplayHistory(frame);
      }
    } finally {
      session.suppressVisuals = prevSuppress;
    }
    if (this.deps.netplayPerf.enabled) {
      const dt = performance.now() - perfStart;
      this.deps.netplayPerf.rollbackMs += dt;
      this.deps.netplayPerf.rollbackFrames += resimFrames;
      this.deps.netplayPerf.rollbackCount += 1;
    }
    return true;
  }

  private resimFromSnapshot(snapshotFrame: number, targetFrame: number) {
    const state = this.deps.getNetplayState();
    if (!state) {
      return;
    }
    if (targetFrame <= snapshotFrame) {
      return;
    }
    const perfStart = this.deps.netplayPerf.enabled ? performance.now() : 0;
    const session = state.session;
    const resimFrames = targetFrame - snapshotFrame;
    const prevSuppress = session.suppressVisuals;
    session.suppressVisuals = true;
    try {
      for (let frame = snapshotFrame + 1; frame <= targetFrame; frame += 1) {
        const inputs = this.buildInputsForFrame(frame);
        session.advanceTo(frame, inputs);
        if (state.hashInterval > 0 && frame % state.hashInterval === 0) {
          state.hashHistory.set(frame, this.deps.getSimHash());
        }
        this.trimNetplayHistory(frame);
      }
    } finally {
      session.suppressVisuals = prevSuppress;
    }
    if (this.deps.netplayPerf.enabled) {
      const dt = performance.now() - perfStart;
      this.deps.netplayPerf.resimMs += dt;
      this.deps.netplayPerf.resimFrames += resimFrames;
      this.deps.netplayPerf.resimCount += 1;
    }
  }

  tryApplyPendingSnapshot(stageId: number) {
    const pendingSnapshot = this.deps.getPendingSnapshot();
    if (!pendingSnapshot) {
      return;
    }
    const state = this.deps.getNetplayState();
    if (state && pendingSnapshot.stageSeq !== undefined && pendingSnapshot.stageSeq !== state.stageSeq) {
      this.deps.setPendingSnapshot(null);
      return;
    }
    if (pendingSnapshot.stageId !== undefined && pendingSnapshot.stageId !== stageId) {
      return;
    }
    const targetFrame = state?.session.getFrame() ?? this.deps.game.simTick;
    const snapshotFrame = pendingSnapshot.frame;
    this.deps.game.loadRollbackState(pendingSnapshot.state);
    this.deps.resetNetplaySession();
    if (state) {
      state.lastReceivedHostFrame = Math.max(state.lastReceivedHostFrame, snapshotFrame);
      state.awaitingSnapshot = false;
      state.hashHistory.clear();
      for (const key of Array.from(state.expectedHashes.keys())) {
        if (key <= snapshotFrame) {
          state.expectedHashes.delete(key);
        }
      }
    }
    this.resimFromSnapshot(snapshotFrame, targetFrame);
    if (state) {
      state.lagBehindSinceMs = null;
    }
    this.deps.setPendingSnapshot(null);
  }
}
