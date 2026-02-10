import type { GamemodeId, ModId, PackId, ParserId, RulesetId } from '../shared/ids.js';

export type ModHooks = {
  onStageLoad?: (ctx: {
    game: unknown;
    stageId: number;
    stage: unknown;
    stageRuntime: unknown;
  }) => void;
  onSaveState?: (ctx: { game: unknown; state: any; modState: Record<string, unknown> }) => void;
  onLoadState?: (ctx: { game: unknown; state: any; modState: Record<string, unknown> }) => void;
  onDeterminismHash?: (ctx: { game: unknown }) => number | void;
  onResolveSpawnPosition?: (ctx: {
    game: unknown;
    player: unknown;
    activePlayers: unknown[];
    startPos: { x: number; y: number; z: number };
    startRotY: number;
    defaultPos: { x: number; y: number; z: number };
  }) => { x: number; y: number; z: number } | null | void;
  onAfterBallStep?: (ctx: {
    game: unknown;
    players: unknown[];
    isMultiplayer: boolean;
    isSinglePlayer: boolean;
    isBonusStage: boolean;
    stageInputEnabled: boolean;
    resultReplayActive: boolean;
    ringoutActive: boolean;
  }) => { ringoutActive?: boolean; skipStandardRingout?: boolean } | void;
  onGoalHit?: (ctx: {
    game: unknown;
    player: unknown;
    goalHit: unknown;
    resultReplayActive: boolean;
    isMultiplayer: boolean;
  }) => boolean | void;
  onRingoutComplete?: (ctx: { game: unknown; isBonusStage: boolean }) => boolean | void;
  onAppendEffectRender?: (ctx: { game: unknown; effects: unknown[]; alpha: number }) => void;
  onBeforeSimTick?: (ctx: { game: unknown; tick: number }) => void;
  onAfterSimTick?: (ctx: { game: unknown; tick: number }) => void;
  onBallUpdate?: (ctx: { game: unknown; playerId: number; ball: unknown }) => void;
  onCameraUpdate?: (ctx: { game: unknown; playerId: number; camera: unknown }) => void;
  onSessionEvent?: (ctx: { game: unknown; type: string; data?: unknown }) => void;
};

export type ModManifest = {
  id: ModId;
  name: string;
  version: string;
  description?: string;
  entry?: string;
  wasm?: string[];
  packs?: PackId[];
};

export type RulesetRegistration = {
  id: RulesetId;
  label: string;
  description?: string;
};

export type ParserRegistration = {
  id: ParserId;
  label: string;
  description?: string;
};

export type GamemodeRegistration = {
  id: GamemodeId;
  label: string;
  description?: string;
};

export type ModModule = {
  manifest: ModManifest;
  module?: Record<string, unknown>;
  wasm?: Record<string, ArrayBuffer>;
};
