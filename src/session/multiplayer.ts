import type { GameCore } from '../sim/game_core.js';
import type { SessionController } from './session_controller.js';

export class MultiplayerSession implements SessionController {
  public id: 'multiplayer' = 'multiplayer';

  isSinglePlayer(_game: GameCore): boolean {
    return false;
  }

  isMultiplayer(_game: GameCore): boolean {
    return true;
  }

  supportsResultReplay(_game: GameCore): boolean {
    return false;
  }

  supportsGoalReplay(_game: GameCore): boolean {
    return false;
  }
}
