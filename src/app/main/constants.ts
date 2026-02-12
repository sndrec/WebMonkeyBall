import type { MultiplayerGameMode } from '../../game.js';

export const STAGE_FADE_MS = 333;

const NAOMI_STAGE_IDS = new Set([
  10, 19, 20, 30, 49, 50, 60, 70, 80, 92, 96, 97, 98, 99, 100, 114, 115, 116, 117, 118, 119, 120,
]);

export function isNaomiStage(stageId: number): boolean {
  return NAOMI_STAGE_IDS.has(stageId);
}

export function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export const profileTiming = {
  broadcastCooldownMs: 1200,
  remoteCooldownMs: 1500,
  lobbyNameUpdateCooldownMs: 1200,
};

export const chatTiming = {
  maxMessages: 160,
  sendCooldownMs: 800,
  ingameVisibleMs: 5000,
  ingameFadeMs: 1000,
};

export const multiplayerLimits = {
  lobbyMaxPlayers: 8,
  chainedMaxPlayers: 4,
};

export const multiplayerModes: {
  standard: MultiplayerGameMode;
  chained: MultiplayerGameMode;
} = {
  standard: 'standard',
  chained: 'chained_together',
};

export const netplayDebugStorageKey = 'smb_netplay_debug';

export const lobbyHeartbeatTiming = {
  intervalMs: 15000,
  fallbackMs: 12000,
};

export const netplayConstants = {
  maxFrameDelta: 5,
  clientLead: 2,
  clientAheadSlack: 2,
  clientRateMin: 0.9,
  clientRateMax: 1.1,
  clientDriftRate: 0.05,
  driftForceTick: 3,
  driftExtraTicks: 6,
  clientMaxExtraLead: 12,
  syncRateMin: 0.85,
  syncRateMax: 1.35,
  syncDriftRate: 0.1,
  syncForceTick: 1,
  syncExtraTicks: 2,
  syncMaxTicks: 6,
  stageReadyResendMs: 2000,
  stageReadyTimeoutMs: 12000,
  lagFuseFrames: 24,
  lagFuseMs: 500,
  snapshotCooldownMs: 1000,
  pingIntervalMs: 1000,
  hostStallMs: 3000,
  hostSnapshotBehindFrames: 120,
  hostSnapshotCooldownMs: 1500,
  snapshotMismatchCooldownMs: 250,
  maxInputAhead: 60,
  maxInputBehind: 60,
  hostMaxInputRollback: 16,
};
