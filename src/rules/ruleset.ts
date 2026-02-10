import type { GameCore } from '../sim/game_core.js';
import type { PlayerState } from '../sim/state.js';
import type { RulesetId } from '../shared/ids.js';

export type GoalSequenceContext = {
  game: GameCore;
  localPlayer: PlayerState;
  localBall: ReturnType<typeof import('../physics.js').createBallState>;
  resultReplayActive: boolean;
};

export type GoalSequenceOutcome = 'continue' | 'break';

export interface Ruleset {
  id: RulesetId;
  label: string;
  supportsResultReplay: boolean;
  supportsGoalReplay: boolean;
  resetFalloutReplayCamera: boolean;
  shouldCaptureResultReplayHistory(game: GameCore, localPlayer: PlayerState): boolean;
  canStartResultReplay(game: GameCore): boolean;
  shouldArmGoalReplay(game: GameCore): boolean;
  updateGoalSequence(ctx: GoalSequenceContext): GoalSequenceOutcome;
}
