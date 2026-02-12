import type { Game } from '../../game.js';

type NetplayPerfState = {
  enabled: boolean;
  logEveryMs: number;
  lastLogMs: number;
  tickMs: number;
  tickCount: number;
  simTicks: number;
  rollbackMs: number;
  rollbackFrames: number;
  rollbackCount: number;
  resimMs: number;
  resimFrames: number;
  resimCount: number;
  preMs: number;
  hostRollbackApplyMs: number;
  stepMs: number;
  postMs: number;
};

type NetplayDebugOptions = {
  enabled: boolean;
  storageKey: string;
  game: Game;
};

export function createNetplayDebugState(options: NetplayDebugOptions) {
  const netplayPerf: NetplayPerfState = {
    enabled: options.enabled,
    logEveryMs: 1000,
    lastLogMs: performance.now(),
    tickMs: 0,
    tickCount: 0,
    simTicks: 0,
    rollbackMs: 0,
    rollbackFrames: 0,
    rollbackCount: 0,
    resimMs: 0,
    resimFrames: 0,
    resimCount: 0,
    preMs: 0,
    hostRollbackApplyMs: 0,
    stepMs: 0,
    postMs: 0,
  };

  function logNetplayPerf(nowMs: number) {
    if (!netplayPerf.enabled) {
      return;
    }
    if (nowMs - netplayPerf.lastLogMs < netplayPerf.logEveryMs) {
      return;
    }
    const avgTick = netplayPerf.tickMs / Math.max(1, netplayPerf.tickCount);
    const avgRollback = netplayPerf.rollbackMs / Math.max(1, netplayPerf.rollbackCount);
    const avgResim = netplayPerf.resimMs / Math.max(1, netplayPerf.resimCount);
    const rollbackPerFrame = netplayPerf.rollbackMs / Math.max(1, netplayPerf.rollbackFrames);
    const resimPerFrame = netplayPerf.resimMs / Math.max(1, netplayPerf.resimFrames);
    console.log(
      '[perf] netplay tick avg=%sms over=%d simTicks=%d rollback avg=%sms frames=%d perFrame=%sms resim avg=%sms frames=%d perFrame=%sms',
      avgTick.toFixed(3),
      netplayPerf.tickCount,
      netplayPerf.simTicks,
      avgRollback.toFixed(3),
      netplayPerf.rollbackFrames,
      rollbackPerFrame.toFixed(3),
      avgResim.toFixed(3),
      netplayPerf.resimFrames,
      resimPerFrame.toFixed(3),
    );
    const avgPre = netplayPerf.preMs / Math.max(1, netplayPerf.tickCount);
    const avgHostRollbackApply = netplayPerf.hostRollbackApplyMs / Math.max(1, netplayPerf.tickCount);
    const avgStep = netplayPerf.stepMs / Math.max(1, netplayPerf.tickCount);
    const avgPost = netplayPerf.postMs / Math.max(1, netplayPerf.tickCount);
    const stepPerSimTick = netplayPerf.stepMs / Math.max(1, netplayPerf.simTicks);
    console.log(
      '[perf] netplay-breakdown avg pre=%sms hostRb=%sms step=%sms post=%sms stepPerTick=%sms',
      avgPre.toFixed(3),
      avgHostRollbackApply.toFixed(3),
      avgStep.toFixed(3),
      avgPost.toFixed(3),
      stepPerSimTick.toFixed(3),
    );
    if (options.game.rollbackPerf.enabled) {
      const avgSave = options.game.rollbackPerf.saveMs / Math.max(1, options.game.rollbackPerf.saveCount);
      const avgLoad = options.game.rollbackPerf.loadMs / Math.max(1, options.game.rollbackPerf.loadCount);
      const avgAdvance = options.game.rollbackPerf.advanceMs / Math.max(1, options.game.rollbackPerf.advanceCount);
      console.log(
        '[perf] rollback save avg=%sms last=%sms load avg=%sms last=%sms advance avg=%sms last=%sms over=%d',
        avgSave.toFixed(3),
        options.game.rollbackPerf.lastSaveMs.toFixed(3),
        avgLoad.toFixed(3),
        options.game.rollbackPerf.lastLoadMs.toFixed(3),
        avgAdvance.toFixed(3),
        options.game.rollbackPerf.lastAdvanceMs.toFixed(3),
        options.game.rollbackPerf.saveCount,
      );
      options.game.rollbackPerf.saveMs = 0;
      options.game.rollbackPerf.saveCount = 0;
      options.game.rollbackPerf.loadMs = 0;
      options.game.rollbackPerf.loadCount = 0;
      options.game.rollbackPerf.advanceMs = 0;
      options.game.rollbackPerf.advanceCount = 0;
    }
    netplayPerf.lastLogMs = nowMs;
    netplayPerf.tickMs = 0;
    netplayPerf.tickCount = 0;
    netplayPerf.simTicks = 0;
    netplayPerf.rollbackMs = 0;
    netplayPerf.rollbackFrames = 0;
    netplayPerf.rollbackCount = 0;
    netplayPerf.resimMs = 0;
    netplayPerf.resimFrames = 0;
    netplayPerf.resimCount = 0;
    netplayPerf.preMs = 0;
    netplayPerf.hostRollbackApplyMs = 0;
    netplayPerf.stepMs = 0;
    netplayPerf.postMs = 0;
  }

  function recordNetplayPerf(
    startMs: number,
    simTicks = 0,
    breakdown?: { preMs?: number; hostRollbackApplyMs?: number; stepMs?: number; postMs?: number },
  ) {
    if (!netplayPerf.enabled) {
      return;
    }
    const nowMs = performance.now();
    netplayPerf.tickMs += nowMs - startMs;
    netplayPerf.tickCount += 1;
    netplayPerf.simTicks += simTicks;
    netplayPerf.preMs += breakdown?.preMs ?? 0;
    netplayPerf.hostRollbackApplyMs += breakdown?.hostRollbackApplyMs ?? 0;
    netplayPerf.stepMs += breakdown?.stepMs ?? 0;
    netplayPerf.postMs += breakdown?.postMs ?? 0;
    logNetplayPerf(nowMs);
  }

  function isNetplayDebugEnabled() {
    const globalFlag = (window as any).NETPLAY_DEBUG;
    if (globalFlag !== undefined) {
      return !!globalFlag;
    }
    try {
      return localStorage.getItem(options.storageKey) === '1';
    } catch {
      return false;
    }
  }

  function setNetplayDebugEnabled(enabled: boolean) {
    (window as any).NETPLAY_DEBUG = enabled;
    try {
      localStorage.setItem(options.storageKey, enabled ? '1' : '0');
    } catch {
      // Ignore storage issues.
    }
  }

  (window as any).setNetplayDebug = setNetplayDebugEnabled;

  return {
    netplayPerf,
    recordNetplayPerf,
    isNetplayDebugEnabled,
    setNetplayDebugEnabled,
  };
}
