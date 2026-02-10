import type { GameCore } from '../sim/game_core.js';

export interface SessionController {
  id: 'singleplayer' | 'multiplayer';
  isSinglePlayer(game: GameCore): boolean;
  isMultiplayer(game: GameCore): boolean;
  supportsResultReplay(game: GameCore): boolean;
  supportsGoalReplay(game: GameCore): boolean;
}
