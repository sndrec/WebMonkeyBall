import { GameCore } from './sim/game_core.js';

export type { GameCoreOptions as GameOptions } from './sim/game_core.js';
export type { MultiplayerGameMode, PlayerState } from './sim/state.js';

export class Game extends GameCore {}
