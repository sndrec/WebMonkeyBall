import { DEFAULT_STAGE_TIME, GAME_SOURCES } from './shared/constants/index.js';
import { getPackCourseData, getPackStageRules, getPackStageTimeOverride, hasPackForGameSource } from './pack.js';

const DEFAULT_MB2WS_PARSER_ID = 'smb2_stagedef';
const DEFAULT_MB2WS_RULESET_ID = 'smb2';

type ChallengeEntry = {
  id: number;
  time?: number;
};

const MB2WS_CHALLENGE_ENTRIES: Record<string, ChallengeEntry[]> = {
  'beginner': [
    { id: 1 },
    { id: 2, time: 1800 },
    { id: 3 },
    { id: 4 },
    { id: 5, time: 12000 },
    { id: 6 },
    { id: 7, time: 1800 },
    { id: 8 },
    { id: 9 },
    { id: 10, time: 12000 },
    { id: 11, time: 1800 },
    { id: 12 },
    { id: 13 },
    { id: 14 },
    { id: 375 },
    { id: 16 },
    { id: 17 },
    { id: 18, time: 1800 },
    { id: 19 },
    { id: 20 },
  ],
  'advanced': [
    { id: 31, time: 1800 },
    { id: 32, time: 1800 },
    { id: 33 },
    { id: 34 },
    { id: 35, time: 12000 },
    { id: 36, time: 1800 },
    { id: 37 },
    { id: 38 },
    { id: 39 },
    { id: 40, time: 12000 },
    { id: 41 },
    { id: 42 },
    { id: 43, time: 1800 },
    { id: 44, time: 1800 },
    { id: 45 },
    { id: 46 },
    { id: 47 },
    { id: 48, time: 1800 },
    { id: 49, time: 1800 },
    { id: 50, time: 12000 },
    { id: 51 },
    { id: 52 },
    { id: 53, time: 7200 },
    { id: 54 },
    { id: 55 },
    { id: 56 },
    { id: 57 },
    { id: 58, time: 1800 },
    { id: 59, time: 1800 },
    { id: 60, time: 12000 },
    { id: 61, time: 1800 },
    { id: 62, time: 1800 },
    { id: 63 },
    { id: 64 },
    { id: 65 },
    { id: 66, time: 1800 },
    { id: 67 },
    { id: 68 },
    { id: 69 },
    { id: 70 },
  ],
  'expert': [
    { id: 81, time: 1800 },
    { id: 82, time: 1800 },
    { id: 83, time: 1800 },
    { id: 84, time: 1800 },
    { id: 85, time: 12000 },
    { id: 86, time: 1800 },
    { id: 87, time: 1800 },
    { id: 88 },
    { id: 89 },
    { id: 90, time: 12000 },
    { id: 91, time: 1800 },
    { id: 191 },
    { id: 93, time: 1800 },
    { id: 94, time: 1800 },
    { id: 95 },
    { id: 96, time: 1800 },
    { id: 97, time: 1800 },
    { id: 98, time: 1800 },
    { id: 99 },
    { id: 100, time: 12000 },
    { id: 361, time: 1800 },
    { id: 362 },
    { id: 363 },
    { id: 364, time: 1800 },
    { id: 365, time: 1800 },
    { id: 366, time: 1800 },
    { id: 367 },
    { id: 368, time: 1800 },
    { id: 369 },
    { id: 370, time: 12000 },
    { id: 181 },
    { id: 182, time: 1800 },
    { id: 183 },
    { id: 384 },
    { id: 185, time: 7200 },
    { id: 186 },
    { id: 187, time: 1800 },
    { id: 188, time: 1800 },
    { id: 189, time: 1800 },
    { id: 396, time: 12000 },
    { id: 201 },
    { id: 202 },
    { id: 203 },
    { id: 204 },
    { id: 205 },
    { id: 206 },
    { id: 207 },
    { id: 208, time: 1800 },
    { id: 209 },
    { id: 210, time: 12000 },
    { id: 211, time: 1800 },
    { id: 212 },
    { id: 213, time: 1800 },
    { id: 214, time: 1800 },
    { id: 215 },
    { id: 216, time: 1800 },
    { id: 217 },
    { id: 218 },
    { id: 219 },
    { id: 220 },
  ],
  'beginner-extra': [
    { id: 381, time: 1800 },
    { id: 22, time: 1800 },
    { id: 23, time: 1800 },
    { id: 24, time: 1800 },
    { id: 25, time: 1800 },
    { id: 26, time: 1800 },
    { id: 27, time: 1800 },
    { id: 28, time: 1800 },
    { id: 29, time: 1800 },
    { id: 30 },
  ],
  'advanced-extra': [
    { id: 71, time: 1800 },
    { id: 72, time: 1800 },
    { id: 73, time: 1800 },
    { id: 74, time: 1800 },
    { id: 75, time: 1800 },
    { id: 76, time: 1800 },
    { id: 77, time: 1800 },
    { id: 78, time: 1800 },
    { id: 79, time: 1800 },
    { id: 80 },
  ],
  'expert-extra': [
    { id: 221, time: 1800 },
    { id: 222, time: 1800 },
    { id: 223, time: 1800 },
    { id: 224, time: 1800 },
    { id: 225, time: 1800 },
    { id: 226, time: 1800 },
    { id: 227, time: 1800 },
    { id: 228, time: 1800 },
    { id: 389, time: 1800 },
    { id: 230 },
  ],
  'master': [
    { id: 231, time: 7200 },
    { id: 232, time: 7200 },
    { id: 233, time: 7200 },
    { id: 234, time: 7200 },
    { id: 235, time: 7200 },
    { id: 236, time: 7200 },
    { id: 237, time: 7200 },
    { id: 238, time: 7200 },
    { id: 239, time: 7200 },
    { id: 240, time: 7200 },
  ],
  'master-extra': [
    { id: 241, time: 7200 },
    { id: 242, time: 7200 },
    { id: 243, time: 7200 },
    { id: 244, time: 7200 },
    { id: 245, time: 7200 },
    { id: 246, time: 7200 },
    { id: 247, time: 7200 },
    { id: 248, time: 7200 },
    { id: 249, time: 7200 },
    { id: 250, time: 7200 },
  ],
} as const;

export const MB2WS_CHALLENGE_ORDER = Object.fromEntries(
  Object.entries(MB2WS_CHALLENGE_ENTRIES).map(([key, list]) => [key, list.map((entry) => entry.id)])
) as Record<keyof typeof MB2WS_CHALLENGE_ENTRIES, number[]>;

export const MB2WS_CHALLENGE_BONUS = Object.fromEntries(
  Object.entries(MB2WS_CHALLENGE_ORDER).map(([key, list]) => [
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
) as Record<keyof typeof MB2WS_CHALLENGE_ORDER, boolean[]>;

export const MB2WS_CHALLENGE_TIMERS = Object.fromEntries(
  Object.entries(MB2WS_CHALLENGE_ENTRIES).map(([key, list]) => [
    key,
    list.map((entry) => entry.time ?? null),
  ])
) as Record<keyof typeof MB2WS_CHALLENGE_ENTRIES, (number | null)[]>;

export const MB2WS_STORY_ORDER = [
  [21, 102, 121, 122, 123, 131, 132, 133, 134, 135],
  [136, 137, 150, 161, 162, 163, 164, 165, 166, 167],
  [168, 169, 170, 171, 172, 173, 174, 175, 176, 177],
  [178, 192, 193, 194, 195, 321, 251, 252, 253, 254],
  [255, 256, 257, 258, 259, 260, 261, 262, 263, 264],
  [265, 266, 267, 268, 269, 270, 271, 272, 273, 274],
  [275, 276, 277, 278, 279, 281, 282, 283, 284, 285],
  [286, 287, 288, 289, 291, 292, 293, 294, 295, 296],
  [297, 298, 299, 301, 302, 303, 304, 305, 306, 307],
  [308, 309, 310, 311, 312, 313, 314, 315, 316, 317],
] as const;

type StageEntry = {
  id: number;
  parserId?: string;
  rulesetId?: string;
};

function normalizeStageEntry(entry: number | StageEntry): StageEntry {
  if (typeof entry === 'number') {
    return { id: entry };
  }
  return { ...entry };
}

function resolveStageEntry(entry: StageEntry): StageEntry {
  const packRules = getPackStageRules(entry.id);
  return {
    id: entry.id,
    parserId: entry.parserId ?? packRules?.parserId ?? DEFAULT_MB2WS_PARSER_ID,
    rulesetId: entry.rulesetId ?? packRules?.rulesetId ?? DEFAULT_MB2WS_RULESET_ID,
  };
}

export type Mb2wsChallengeDifficulty = keyof typeof MB2WS_CHALLENGE_ORDER | string;

export type Mb2wsCourseConfig =
  | {
      mode: 'challenge';
      difficulty: Mb2wsChallengeDifficulty;
      stageIndex: number;
    }
  | {
      mode: 'story';
      worldIndex: number;
      stageIndex: number;
    };

function computeChallengeBonusFlags(list: StageEntry[]) {
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

function normalizeBonusFlags(list: StageEntry[], flags: boolean[] | null | undefined) {
  if (!flags || flags.length === 0) {
    return computeChallengeBonusFlags(list);
  }
  const normalized = flags.slice(0, list.length);
  while (normalized.length < list.length) {
    normalized.push(false);
  }
  return normalized;
}

function normalizeTimers(list: StageEntry[], timers: (number | null)[] | null | undefined) {
  if (!timers || timers.length === 0) {
    return list.map(() => null);
  }
  const normalized = timers.slice(0, list.length);
  while (normalized.length < list.length) {
    normalized.push(null);
  }
  return normalized;
}

function getPackCourses() {
  if (!hasPackForGameSource(GAME_SOURCES.MB2WS)) {
    return null;
  }
  return getPackCourseData();
}

function flattenStoryOrder(order: Array<Array<number | StageEntry>>) {
  return order.reduce<StageEntry[]>((acc, list) => {
    list.forEach((entry) => acc.push(normalizeStageEntry(entry)));
    return acc;
  }, []);
}

function getStoryIndex(order: Array<Array<number | StageEntry>>, worldIndex: number, stageIndex: number) {
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

export class Mb2wsCourse {
  public currentStageId: number;
  public currentStageParserId: string;
  public currentStageRulesetId: string;

  private mode: 'challenge' | 'story';
  private stageList: StageEntry[];
  private timeList: (number | null)[];
  private bonusFlags: boolean[];
  private currentIndex: number;
  private difficultyLabel: string | null;

  constructor(config: Mb2wsCourseConfig) {
    this.mode = config.mode;
    this.difficultyLabel = null;
    const packCourses = getPackCourses();
    if (config.mode === 'challenge') {
      const packOrder = packCourses?.challenge?.order?.[config.difficulty];
      const list = packOrder ?? MB2WS_CHALLENGE_ORDER[config.difficulty] ?? [];
      const packTimers = packCourses?.challenge?.timers?.[config.difficulty];
      const times = packTimers ?? MB2WS_CHALLENGE_TIMERS[config.difficulty] ?? [];
      this.stageList = list.map((entry) => resolveStageEntry(normalizeStageEntry(entry)));
      this.timeList = normalizeTimers(this.stageList, times);
      const packBonus = packCourses?.challenge?.bonus?.[config.difficulty];
      const defaultBonus = MB2WS_CHALLENGE_BONUS[config.difficulty as keyof typeof MB2WS_CHALLENGE_ORDER];
      this.bonusFlags = normalizeBonusFlags(this.stageList, packBonus ?? defaultBonus);
      this.currentIndex = clampIndex(config.stageIndex, this.stageList.length);
      this.difficultyLabel = titleCaseDifficulty(config.difficulty);
    } else {
      const storyOrder = packCourses?.story ?? MB2WS_STORY_ORDER;
      this.stageList = flattenStoryOrder(storyOrder).map((entry) => resolveStageEntry(entry));
      this.timeList = [];
      this.bonusFlags = [];
      const storyIndex = getStoryIndex(storyOrder, config.worldIndex, config.stageIndex);
      this.currentIndex = clampIndex(storyIndex, this.stageList.length);
    }

    const entry = this.stageList[this.currentIndex];
    this.currentStageId = entry?.id ?? 0;
    this.currentStageParserId = entry?.parserId ?? DEFAULT_MB2WS_PARSER_ID;
    this.currentStageRulesetId = entry?.rulesetId ?? DEFAULT_MB2WS_RULESET_ID;
  }

  getTimeLimitFrames() {
    if (hasPackForGameSource(GAME_SOURCES.MB2WS)) {
      const override = getPackStageTimeOverride(this.currentStageId);
      if (override !== null) {
        return override;
      }
    }
    if (this.mode === 'challenge') {
      const override = this.timeList[this.currentIndex];
      if (override !== null && override !== undefined) {
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
    const nextStageId = this.stageList[nextIndex]?.id;
    if (nextStageId) {
      ids.add(nextStageId);
    }
    if (this.mode === 'challenge') {
      const greenIndex = nextIndex + 1;
      const redIndex = nextIndex + 2;
      const greenStageId = this.stageList[greenIndex]?.id;
      const redStageId = this.stageList[redIndex]?.id;
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
    const entry = this.stageList[this.currentIndex];
    this.currentStageId = entry?.id ?? this.currentStageId;
    this.currentStageParserId = entry?.parserId ?? this.currentStageParserId;
    this.currentStageRulesetId = entry?.rulesetId ?? this.currentStageRulesetId;
    return true;
  }
}
