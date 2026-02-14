import { BALL_FLAGS } from '../shared/constants/index.js';
import { GOAL_FLOAT_FRAMES } from '../physics.js';
import type { Ruleset } from './ruleset.js';

export const smb2Ruleset: Ruleset = {
  id: 'smb2',
  label: 'SMB2',
  supportsResultReplay: true,
  supportsGoalReplay: true,
  resetFalloutReplayCamera: false,
  shouldCaptureResultReplayHistory(game) {
    return game.session.supportsResultReplay(game);
  },
  canStartResultReplay(game) {
    return game.session.supportsResultReplay(game);
  },
  shouldArmGoalReplay(game) {
    return game.session.supportsGoalReplay(game);
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
    if (
      game.goalReplayStartArmed
      && game.session.supportsGoalReplay(game)
      && (localBall.flags & BALL_FLAGS.FLAG_09)
      && localPlayer.goalTimerFrames > 60
      && localPlayer.goalTimerFrames < 240
    ) {
      // Match SMB1 goal-main behavior: clamp to the final 60-frame window.
      localPlayer.goalTimerFrames = 60;
    }
    if (localPlayer.goalTimerFrames <= 0) {
      localPlayer.goalTimerFrames = 0;
      const shouldStartGoalReplay = game.goalReplayStartArmed
        && !resultReplayActive
        && game.session.supportsGoalReplay(game)
        && (localBall.flags & BALL_FLAGS.FLAG_09);
      if (shouldStartGoalReplay) {
        const startedReplay = game.startResultReplay('goal', {
          goalHit: localPlayer.goalInfo,
          deferGoalTapeBreak: false,
        });
        if (startedReplay) {
          game.goalReplayStartArmed = false;
          game.accumulator = 0;
          return 'break';
        }
      }
      if (!resultReplayActive) {
        game.accumulator = 0;
        void game.finishGoalSequence();
        return 'break';
      }
    }
    return 'continue';
  },
};
