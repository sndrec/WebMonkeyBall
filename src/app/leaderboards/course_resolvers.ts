import { getStageListForDifficulty } from '../../course.js';
import {
  SMB2_CHALLENGE_ORDER,
  SMB2_STORY_ORDER,
  type Smb2ChallengeDifficulty,
} from '../../course_smb2.js';
import {
  MB2WS_CHALLENGE_ORDER,
  MB2WS_STORY_ORDER,
  type Mb2wsChallengeDifficulty,
} from '../../course_mb2ws.js';
import { GAME_SOURCES, type GameSource } from '../../shared/constants/index.js';

function getSmb2LikeStoryOrder(gameSource: GameSource) {
  return gameSource === GAME_SOURCES.MB2WS ? MB2WS_STORY_ORDER : SMB2_STORY_ORDER;
}

function getSmb2LikeChallengeOrder(gameSource: GameSource) {
  return gameSource === GAME_SOURCES.MB2WS ? MB2WS_CHALLENGE_ORDER : SMB2_CHALLENGE_ORDER;
}

export function getSmb1StageIdByIndex(difficulty: string, index: number): number | null {
  const stages = getStageListForDifficulty(difficulty);
  return stages[index]?.id ?? null;
}

export function getSmb2StoryStageId(gameSource: GameSource, worldIndex: number, stageIndex: number): number | null {
  const storyOrder = getSmb2LikeStoryOrder(gameSource);
  const stageList = storyOrder[worldIndex] ?? [];
  return stageList[stageIndex] ?? null;
}

export function getSmb2ChallengeStageId(
  gameSource: GameSource,
  difficulty: string,
  stageIndex: number,
): number | null {
  const order = getSmb2LikeChallengeOrder(gameSource);
  const stages = order[difficulty as Smb2ChallengeDifficulty | Mb2wsChallengeDifficulty] ?? [];
  return stages[stageIndex] ?? null;
}
