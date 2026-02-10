import { GOAL_FLOAT_FRAMES } from '../physics.js';
import type { Ruleset } from './ruleset.js';

export const smb2Ruleset: Ruleset = {
  id: 'smb2',
  label: 'SMB2',
  supportsResultReplay: false,
  supportsGoalReplay: false,
  resetFalloutReplayCamera: false,
  shouldCaptureResultReplayHistory() {
    return false;
  },
  canStartResultReplay() {
    return false;
  },
  shouldArmGoalReplay() {
    return false;
  },
  updateGoalSequence({ game, localPlayer, localBall, resultReplayActive }) {
    localPlayer.goalTimerFrames -= 1;
    localPlayer.goalSkipTimerFrames -= 1;
    if (!game.goalWooshPlayed && localBall.goalTimer >= GOAL_FLOAT_FRAMES) {
      if (!game.suppressAudioEffects) {
        void game.audio?.playSfx('ball_woosh', game.gameSource, 0.85);
      }
      game.goalWooshPlayed = true;
    }
    if (localPlayer.goalTimerFrames <= 0) {
      localPlayer.goalTimerFrames = 0;
      if (!resultReplayActive) {
        game.accumulator = 0;
        void game.finishGoalSequence();
        return 'break';
      }
    }
    return 'continue';
  },
};
