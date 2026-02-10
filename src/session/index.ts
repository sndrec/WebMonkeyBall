import type { GameCore } from '../sim/game_core.js';
import type { SessionController } from './session_controller.js';
import { MultiplayerSession } from './multiplayer.js';
import { SingleplayerSession } from './singleplayer.js';

class SessionRouter implements SessionController {
  public id: 'singleplayer' | 'multiplayer' = 'singleplayer';
  private single = new SingleplayerSession();
  private multi = new MultiplayerSession();

  private select(game: GameCore): SessionController {
    if (game.players.length > 1) {
      return this.multi;
    }
    return this.single;
  }

  isSinglePlayer(game: GameCore): boolean {
    const active = this.select(game);
    this.id = active.id;
    return active.isSinglePlayer(game);
  }

  isMultiplayer(game: GameCore): boolean {
    const active = this.select(game);
    this.id = active.id;
    return active.isMultiplayer(game);
  }

  supportsResultReplay(game: GameCore): boolean {
    const active = this.select(game);
    this.id = active.id;
    return active.supportsResultReplay(game);
  }

  supportsGoalReplay(game: GameCore): boolean {
    const active = this.select(game);
    this.id = active.id;
    return active.supportsGoalReplay(game);
  }
}

export function createSessionController(): SessionController {
  return new SessionRouter();
}
