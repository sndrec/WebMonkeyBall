import { DEFAULT_STAGE_TIME, GAME_SOURCES } from './constants.js';
import { getPackCourseData, getPackStageTimeOverride, hasPackForGameSource } from './pack.js';

export const SMB2_CHALLENGE_ORDER = {
  'beginner': [201, 202, 203, 204, 205, 206, 207, 208, 209, 210],
  'advanced': [
    221, 222, 223, 224, 225, 226, 227, 228, 229, 230,
    231, 232, 233, 234, 235, 236, 237, 238, 239, 240,
    241, 242, 243, 244, 245, 246, 247, 248, 249, 250,
  ],
  'expert': [
    261, 262, 263, 264, 265, 266, 267, 268, 269, 270,
    271, 272, 273, 274, 275, 276, 277, 278, 279, 280,
    281, 282, 283, 284, 285, 286, 287, 288, 289, 290,
    291, 292, 293, 294, 295, 296, 297, 298, 299, 300,
    301, 302, 303, 304, 305, 306, 307, 308, 309, 310,
  ],
  'beginner-extra': [211, 212, 213, 214, 215, 216, 217, 218, 219, 220],
  'advanced-extra': [251, 252, 253, 254, 255, 256, 257, 258, 259, 260],
  'expert-extra': [311, 312, 313, 314, 315, 316, 317, 318, 319, 320],
  'master': [321, 322, 323, 324, 325, 326, 327, 328, 329, 330],
  'master-extra': [331, 332, 333, 334, 335, 336, 337, 338, 339, 340],
} as const;

export const SMB2_STORY_ORDER = [
  [201, 202, 203, 204, 1, 2, 3, 4, 5, 6],
  [7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  [231, 232, 233, 234, 235, 236, 237, 238, 239, 17],
  [18, 19, 20, 21, 22, 23, 24, 25, 26, 27],
  [28, 29, 30, 31, 32, 33, 34, 35, 36, 37],
  [38, 39, 40, 41, 42, 43, 44, 45, 46, 47],
  [281, 282, 283, 284, 285, 286, 287, 288, 289, 48],
  [49, 50, 51, 52, 53, 54, 55, 56, 57, 58],
  [59, 60, 61, 62, 63, 64, 65, 66, 67, 68],
  [341, 342, 343, 344, 345, 346, 347, 348, 349, 350],
] as const;

export type Smb2ChallengeDifficulty = keyof typeof SMB2_CHALLENGE_ORDER | string;

export const SMB2_CHALLENGE_BONUS = Object.fromEntries(
  Object.entries(SMB2_CHALLENGE_ORDER).map(([key, list]) => [
    key,
    list.map((_id, index) => {
      const stageNumber = index + 1;
      if (stageNumber === 5) {
        return true;
      }
      if (stageNumber % 10 === 0) {
        return stageNumber !== list.length;
      }
      return false;
    }),
  ])
) as Record<Smb2ChallengeDifficulty, boolean[]>;

export type Smb2CourseConfig =
  | {
      mode: 'challenge';
      difficulty: Smb2ChallengeDifficulty;
      stageIndex: number;
    }
  | {
      mode: 'story';
      worldIndex: number;
      stageIndex: number;
    };

function computeChallengeBonusFlags(list: number[]) {
  return list.map((_id, index) => {
    const stageNumber = index + 1;
    if (stageNumber === 5) {
      return true;
    }
    if (stageNumber % 10 === 0) {
      return stageNumber !== list.length;
    }
    return false;
  });
}

function normalizeBonusFlags(list: number[], flags: boolean[] | null | undefined) {
  if (!flags || flags.length === 0) {
    return computeChallengeBonusFlags(list);
  }
  const normalized = flags.slice(0, list.length);
  while (normalized.length < list.length) {
    normalized.push(false);
  }
  return normalized;
}

function getPackCourses() {
  if (!hasPackForGameSource(GAME_SOURCES.SMB2)) {
    return null;
  }
  return getPackCourseData();
}

function flattenStoryOrder(order: number[][]) {
  return order.reduce<number[]>((acc, list) => acc.concat(list), []);
}

function getStoryIndex(order: number[][], worldIndex: number, stageIndex: number) {
  if (order.length === 0) {
    return 0;
  }
  const safeWorld = clampIndex(worldIndex, order.length);
  const worldStages = order[safeWorld] ?? [];
  const safeStage = clampIndex(stageIndex, worldStages.length);
  let index = safeStage;
  for (let i = 0; i < safeWorld; i += 1) {
    index += order[i]?.length ?? 0;
  }
  return index;
}

function clampIndex(value: number, max: number) {
  if (max <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(max - 1, value));
}

function titleCaseDifficulty(difficulty: string) {
  return difficulty
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export class Smb2Course {
  public currentStageId: number;

  private mode: 'challenge' | 'story';
  private stageList: number[];
  private bonusFlags: boolean[];
  private currentIndex: number;
  private difficultyLabel: string | null;

  constructor(config: Smb2CourseConfig) {
    this.mode = config.mode;
    this.difficultyLabel = null;
    const packCourses = getPackCourses();
    if (config.mode === 'challenge') {
      const packOrder = packCourses?.challenge?.order?.[config.difficulty];
      const list = packOrder ?? SMB2_CHALLENGE_ORDER[config.difficulty] ?? [];
      this.stageList = list.slice();
      const packBonus = packCourses?.challenge?.bonus?.[config.difficulty];
      const defaultBonus = SMB2_CHALLENGE_BONUS[config.difficulty as keyof typeof SMB2_CHALLENGE_ORDER];
      this.bonusFlags = normalizeBonusFlags(this.stageList, packBonus ?? defaultBonus);
      this.currentIndex = clampIndex(config.stageIndex, this.stageList.length);
      this.difficultyLabel = titleCaseDifficulty(config.difficulty);
    } else {
      const storyOrder = packCourses?.story ?? SMB2_STORY_ORDER;
      this.stageList = flattenStoryOrder(storyOrder);
      this.bonusFlags = [];
      const storyIndex = getStoryIndex(storyOrder, config.worldIndex, config.stageIndex);
      this.currentIndex = clampIndex(storyIndex, this.stageList.length);
    }

    this.currentStageId = this.stageList[this.currentIndex] ?? 0;
  }

  getTimeLimitFrames() {
    if (hasPackForGameSource(GAME_SOURCES.SMB2)) {
      const override = getPackStageTimeOverride(this.currentStageId);
      if (override !== null) {
        return override;
      }
    }
    return DEFAULT_STAGE_TIME;
  }

  getStageLabel() {
    if (this.mode === 'challenge') {
      const label = this.difficultyLabel ?? 'Challenge';
      return `Challenge ${label} ${this.currentIndex + 1}`;
    }
    const world = Math.floor(this.currentIndex / 10) + 1;
    const stage = (this.currentIndex % 10) + 1;
    return `Story W${world}-${stage}`;
  }

  getFloorInfo() {
    const total = this.stageList.length;
    const current = this.currentIndex + 1;
    return {
      current,
      total,
      prefix: 'FLOOR',
      difficultyIndex: 2,
      difficultyIconIndex: 3,
      showDifficultyIcon: false,
      isFinal: current >= total,
    };
  }

  getNextStageIds() {
    const nextIndex = this.currentIndex + 1;
    if (nextIndex >= this.stageList.length) {
      return [];
    }
    const ids = new Set<number>();
    const nextStageId = this.stageList[nextIndex];
    if (nextStageId) {
      ids.add(nextStageId);
    }
    if (this.mode === 'challenge') {
      const greenIndex = nextIndex + 1;
      const redIndex = nextIndex + 2;
      const greenStageId = this.stageList[greenIndex];
      const redStageId = this.stageList[redIndex];
      if (greenStageId) {
        ids.add(greenStageId);
      }
      if (redStageId) {
        ids.add(redStageId);
      }
    }
    return Array.from(ids.values());
  }

  isBonusStage() {
    if (this.mode !== 'challenge') {
      return false;
    }
    return this.bonusFlags[this.currentIndex] ?? false;
  }

  advance(_info?: {
    flags: number;
    goalType: string | null;
    timerCurr: number;
    u_currStageId: number;
  }) {
    if (this.currentIndex + 1 >= this.stageList.length) {
      return false;
    }
    let step = 1;
    if (this.mode === 'challenge' && _info?.goalType) {
      const goalType = _info.goalType;
      if (goalType === 'G' || goalType === 'g') {
        step = 2;
      } else if (goalType === 'R' || goalType === 'r') {
        step = 3;
      }
    }
    if (this.currentIndex + step >= this.stageList.length) {
      return false;
    }
    this.currentIndex += step;
    this.currentStageId = this.stageList[this.currentIndex] ?? this.currentStageId;
    return true;
  }
}
