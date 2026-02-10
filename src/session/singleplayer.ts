import type { GameCore } from '../sim/game_core.js';
import type { SessionController } from './session_controller.js';

export class SingleplayerSession implements SessionController {
  public id: 'singleplayer' = 'singleplayer';

  isSinglePlayer(_game: GameCore): boolean {
    return true;
  }

  isMultiplayer(_game: GameCore): boolean {
    return false;
  }

  supportsResultReplay(_game: GameCore): boolean {
    return true;
  }

  supportsGoalReplay(_game: GameCore): boolean {
    return true;
  }
}
