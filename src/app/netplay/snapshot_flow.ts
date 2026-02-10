import type { Game } from '../../game.js';

type SnapshotFlowDeps = {
  game: Game;
  getNetplayState: () => any | null;
  getClientPeer: () => { send: (msg: any) => void } | null;
  getHostRelay: () => { sendTo: (playerId: number, msg: any) => void } | null;
  rollbackAndResim: (startFrame: number) => boolean;
  snapshotCooldownMs: number;
  snapshotMismatchCooldownMs: number;
};

export class SnapshotFlowController {
  private readonly deps: SnapshotFlowDeps;

  constructor(deps: SnapshotFlowDeps) {
    this.deps = deps;
  }

  requestSnapshot(reason: 'mismatch' | 'lag', frame?: number, force = false) {
    const clientPeer = this.deps.getClientPeer();
    const state = this.deps.getNetplayState();
    if (!clientPeer || !state) {
      return;
    }
    const nowMs = performance.now();
    const lastRequest = state.lastSnapshotRequestTimeMs ?? 0;
    const cooldownMs = reason === 'mismatch'
      ? this.deps.snapshotMismatchCooldownMs
      : this.deps.snapshotCooldownMs;
    const cooldownOk = state.lastSnapshotRequestTimeMs === null
      || (nowMs - lastRequest) >= cooldownMs;
    if (state.awaitingSnapshot && !force && !cooldownOk) {
      return;
    }
    if (!cooldownOk) {
      return;
    }
    state.lastSnapshotRequestTimeMs = nowMs;
    state.awaitingSnapshot = true;
    const targetFrame = frame ?? state.session.getFrame();
    clientPeer.send({
      type: 'snapshot_request',
      stageSeq: state.stageSeq,
      frame: targetFrame,
      reason,
    });
  }

  hostApplyPendingRollback() {
    const state = this.deps.getNetplayState();
    if (!state || state.role !== 'host') {
      return;
    }
    const rollbackFrame = state.pendingHostRollbackFrame;
    if (rollbackFrame === null) {
      return;
    }
    const snapshotTargets = Array.from(state.pendingHostRollbackPlayers);
    state.pendingHostRollbackFrame = null;
    state.pendingHostRollbackPlayers.clear();
    if (!this.deps.rollbackAndResim(rollbackFrame)) {
      for (const playerId of snapshotTargets) {
        this.sendSnapshotToClient(playerId, rollbackFrame);
      }
      return;
    }
    state.pendingHostUpdates.add(rollbackFrame);
  }

  sendSnapshotToClient(playerId: number, frame?: number) {
    const hostRelay = this.deps.getHostRelay();
    const state = this.deps.getNetplayState();
    if (!hostRelay || !state) {
      return;
    }
    const session = state.session;
    let snapshotFrame = frame ?? session.getFrame();
    if (snapshotFrame > session.getFrame()) {
      snapshotFrame = session.getFrame();
    }
    let snapshotState = session.getState(snapshotFrame);
    if (!snapshotState) {
      snapshotFrame = session.getFrame();
      snapshotState = this.deps.game.saveRollbackState();
    }
    if (!snapshotState) {
      return;
    }
    hostRelay.sendTo(playerId, {
      type: 'snapshot',
      stageSeq: state.stageSeq,
      frame: snapshotFrame,
      state: snapshotState,
      stageId: this.deps.game.stage?.stageId,
      gameSource: this.deps.game.gameSource,
    });
  }
}
