import { DEFAULT_STAGE_TIME, stageLabelFromName, INFO_FLAGS } from './shared/constants/index.js';
import { getPackStageRules } from './pack.js';

const DEFAULT_SMB1_PARSER_ID = 'smb1_stagedef';
const DEFAULT_SMB1_RULESET_ID = 'smb1';

export type CourseStageEntry = {
  id: number;
  name: string;
  label: string;
  parserId: string;
  rulesetId: string;
  timeLimitFrames?: number;
  warpDefault?: number;
  warpDistances?: Partial<Record<'B' | 'G' | 'R', number>>;
};

type CourseDefinition = {
  stages: Array<Omit<CourseStageEntry, 'parserId' | 'rulesetId'>>;
};

const courseDefinitions: Record<string, CourseDefinition> = {
  "beginner": {
    "stages": [
      { "id": 1, "name": "ST_001_PLAIN", "label": "PLAIN", "warpDefault": 1 },
      { "id": 2, "name": "ST_002_DIAMOND", "label": "DIAMOND", "warpDistances": { "B": 1, "G": 3 } },
      { "id": 3, "name": "ST_003_HAIRPIN", "label": "HAIRPIN", "warpDefault": 1 },
      { "id": 4, "name": "ST_004_WIDE_BRIDGE", "label": "WIDE BRIDGE", "warpDefault": 1 },
      { "id": 91, "name": "ST_091_BONUS_BASIC", "label": "BONUS BASIC", "warpDefault": 1 },
      { "id": 5, "name": "ST_005_SLOPES", "label": "SLOPES", "warpDefault": 1 },
      { "id": 6, "name": "ST_006_STEPS", "label": "STEPS", "warpDefault": 1 },
      { "id": 7, "name": "ST_007_BLOCKS", "label": "BLOCKS", "warpDefault": 1 },
      { "id": 8, "name": "ST_008_JUMP_SINGLE", "label": "JUMP SINGLE", "warpDefault": 1 },
      { "id": 9, "name": "ST_009_EXAM_A", "label": "EXAM A" }
    ]
  },
  "advanced": {
    "stages": [
      { "id": 11, "name": "ST_011_BUMP", "label": "BUMP", "warpDefault": 1 },
      { "id": 12, "name": "ST_012_WALKING", "label": "WALKING", "warpDefault": 1 },
      { "id": 13, "name": "ST_013_REPULSE", "label": "REPULSE", "warpDefault": 1 },
      { "id": 14, "name": "ST_014_NARROW_BRIDGE", "label": "NARROW BRIDGE", "warpDefault": 1 },
      { "id": 91, "name": "ST_091_BONUS_BASIC", "label": "BONUS BASIC", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 15, "name": "ST_015_BREAK", "label": "BREAK", "warpDistances": { "B": 1, "G": 4 } },
      { "id": 16, "name": "ST_016_CURVES", "label": "CURVES", "warpDefault": 1 },
      { "id": 17, "name": "ST_017_DOWNHILL", "label": "DOWNHILL", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 18, "name": "ST_018_BLOCKS_SLIM", "label": "BLOCKS SLIM", "warpDefault": 1 },
      { "id": 92, "name": "ST_092_BONUS_WAVE", "label": "BONUS WAVE", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 21, "name": "ST_021_CHOICE", "label": "CHOICE", "timeLimitFrames": 1800, "warpDistances": { "B": 1, "G": 3 } },
      { "id": 22, "name": "ST_022_BOWL", "label": "BOWL", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 23, "name": "ST_023_JUMPIES", "label": "JUMPIES", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 24, "name": "ST_024_STOPPERS", "label": "STOPPERS", "warpDefault": 1 },
      { "id": 25, "name": "ST_025_FLOOR_BENT", "label": "FLOOR BENT", "warpDefault": 1 },
      { "id": 26, "name": "ST_026_CONVEYOR", "label": "CONVEYOR", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 27, "name": "ST_027_EXAM_B", "label": "EXAM B", "warpDefault": 1 },
      { "id": 28, "name": "ST_028_CHASER", "label": "CHASER", "warpDistances": { "B": 1, "G": 2, "R": 7 } },
      { "id": 29, "name": "ST_029_JUMP_DOUBLE", "label": "JUMP DOUBLE", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 93, "name": "ST_093_BONUS_GRID", "label": "BONUS GRID", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 31, "name": "ST_031_MIDDLE_JAM", "label": "MIDDLE JAM", "warpDefault": 1 },
      { "id": 32, "name": "ST_032_ANTLION", "label": "ANTLION", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 33, "name": "ST_033_COLLAPSE", "label": "COLLAPSE", "warpDefault": 1 },
      { "id": 34, "name": "ST_034_SWING_BAR", "label": "SWING BAR", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 35, "name": "ST_035_LABYRINTH", "label": "LABYRINTH", "warpDistances": { "B": 1, "G": 3 } },
      { "id": 36, "name": "ST_036_SPIRAL", "label": "SPIRAL", "warpDefault": 1 },
      { "id": 37, "name": "ST_037_WAVY_JUMP", "label": "WAVY JUMP", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 38, "name": "ST_038_SPIKY", "label": "SPIKY", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 39, "name": "ST_039_UNREST", "label": "UNREST", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 40, "name": "ST_040_POLAR", "label": "POLAR", "timeLimitFrames": 1800 }
    ]
  },
  "expert": {
    "stages": [
      { "id": 41, "name": "ST_041_RUIN", "label": "RUIN", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 42, "name": "ST_042_BRANCH", "label": "BRANCH", "timeLimitFrames": 1800, "warpDistances": { "B": 1, "R": 3 } },
      { "id": 43, "name": "ST_043_OVERTURN", "label": "OVERTURN", "timeLimitFrames": 1800, "warpDistances": { "B": 1, "G": 2 } },
      { "id": 44, "name": "ST_044_EXCURSION", "label": "EXCURSION", "warpDefault": 1 },
      { "id": 91, "name": "ST_091_BONUS_BASIC", "label": "BONUS BASIC", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 45, "name": "ST_045_DODECAGON", "label": "DODECAGON", "warpDefault": 1 },
      { "id": 46, "name": "ST_046_EXAM_C", "label": "EXAM C", "warpDefault": 1 },
      { "id": 47, "name": "ST_047_SKELETON", "label": "SKELETON", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 48, "name": "ST_048_TRACKS", "label": "TRACKS", "warpDefault": 1 },
      { "id": 92, "name": "ST_092_BONUS_WAVE", "label": "BONUS WAVE", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 51, "name": "ST_051_DOWNHILL_HARD", "label": "DOWNHILL HARD", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 52, "name": "ST_052_GEARS", "label": "GEARS", "warpDefault": 1 },
      { "id": 53, "name": "ST_053_DESTRUCTION", "label": "DESTRUCTION", "warpDefault": 1 },
      { "id": 54, "name": "ST_054_INVASION", "label": "INVASION", "warpDefault": 1 },
      { "id": 55, "name": "ST_055_DIVING", "label": "DIVING", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 56, "name": "ST_056_FLOOR_SLANT", "label": "FLOOR SLANT", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 57, "name": "ST_057_TRAM", "label": "TRAM", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 58, "name": "ST_058_SWING_BAR_LONG", "label": "SWING BAR LONG", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 59, "name": "ST_059_PAPERWORK", "label": "PAPERWORK", "warpDefault": 1 },
      { "id": 93, "name": "ST_093_BONUS_GRID", "label": "BONUS GRID", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 61, "name": "ST_061_TWIN_ATTACKER", "label": "TWIN ATTACKER", "warpDefault": 1 },
      { "id": 62, "name": "ST_062_SEGA_LOGO", "label": "SEGA LOGO", "warpDefault": 1 },
      { "id": 63, "name": "ST_063_SNAKE", "label": "SNAKE", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 64, "name": "ST_064_WIND", "label": "WIND", "warpDefault": 1 },
      { "id": 65, "name": "ST_065_WINDY_SLIDE", "label": "WINDY SLIDE", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 66, "name": "ST_066_FALL_DOWN", "label": "FALL DOWN", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 67, "name": "ST_067_TWIN_CROSS", "label": "TWIN CROSS", "warpDefault": 1 },
      { "id": 68, "name": "ST_068_SPIRAL_HARD", "label": "SPIRAL HARD", "warpDefault": 1 },
      { "id": 69, "name": "ST_069_CONVEYOR_PARTS", "label": "CONVEYOR PARTS", "warpDefault": 1 },
      { "id": 94, "name": "ST_094_BONUS_BUMPY", "label": "BONUS BUMPY", "warpDefault": 1 },
      { "id": 71, "name": "ST_071_GAPS", "label": "GAPS", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 72, "name": "ST_072_CURVATURE", "label": "CURVATURE", "warpDefault": 1 },
      { "id": 73, "name": "ST_073_ANT_LION_SUPER", "label": "ANT LION SUPER", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 74, "name": "ST_074_DRUM", "label": "DRUM", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 75, "name": "ST_075_TWIST_AND_SPIN", "label": "TWIST AND SPIN", "warpDefault": 1 },
      { "id": 76, "name": "ST_076_SPEEDY_JAM", "label": "SPEEDY JAM", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 77, "name": "ST_077_QUAKE", "label": "QUAKE", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 78, "name": "ST_078_CASSIOPEIA", "label": "CASSIOPEIA", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 79, "name": "ST_079_PIRATES", "label": "PIRATES", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 95, "name": "ST_095_BONUS_HUNTING", "label": "BONUS HUNTING", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 81, "name": "ST_081_BOWL_OPEN", "label": "BOWL OPEN", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 82, "name": "ST_082_CHECKER", "label": "CHECKER", "warpDistances": { "B": 1, "G": 2, "R": 3 } },
      { "id": 83, "name": "ST_083_CARPET", "label": "CARPET", "warpDefault": 1 },
      { "id": 84, "name": "ST_084_RIDGE", "label": "RIDGE", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 85, "name": "ST_085_MIXER", "label": "MIXER", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 86, "name": "ST_086_RINGS", "label": "RINGS", "timeLimitFrames": 1800, "warpDistances": { "B": 1, "G": 2 } },
      { "id": 87, "name": "ST_087_STAIRS", "label": "STAIRS", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 88, "name": "ST_088_CLOVER", "label": "CLOVER", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 89, "name": "ST_089_COFFEE_CUP", "label": "COFFEE CUP", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 90, "name": "ST_090_METAMORPHASIS", "label": "METAMORPHASIS", "timeLimitFrames": 1800 }
    ]
  },
  "beginner-extra": {
    "stages": [
      { "id": 101, "name": "ST_101_BLUR_BRIDGE", "label": "BLUR BRIDGE", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 102, "name": "ST_102_HITTER", "label": "HITTER", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 103, "name": "ST_103_AV_LOGO", "label": "AV LOGO", "timeLimitFrames": 1800 }
    ]
  },
  "advanced-extra": {
    "stages": [
      { "id": 101, "name": "ST_101_BLUR_BRIDGE", "label": "BLUR BRIDGE", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 104, "name": "ST_104_HARD_HITTER", "label": "HARD HITTER", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 105, "name": "ST_105_PUZZLE", "label": "PUZZLE", "warpDefault": 1 },
      { "id": 103, "name": "ST_103_AV_LOGO", "label": "AV LOGO", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 106, "name": "ST_106_POLAR_LARGE", "label": "POLAR LARGE" }
    ]
  },
  "expert-extra": {
    "stages": [
      { "id": 101, "name": "ST_101_BLUR_BRIDGE", "label": "BLUR BRIDGE", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 107, "name": "ST_107_BREATHE", "label": "BREATHE", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 104, "name": "ST_104_HARD_HITTER", "label": "HARD HITTER", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 108, "name": "ST_108_FERRIS_WHEEL", "label": "FERRIS WHEEL", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 109, "name": "ST_109_FACTORY", "label": "FACTORY", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 110, "name": "ST_110_CURL_PIPE", "label": "CURL PIPE", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 111, "name": "ST_111_MAGIC_HAND", "label": "MAGIC HAND", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 103, "name": "ST_103_AV_LOGO", "label": "AV LOGO", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 112, "name": "ST_112_SANCTUARY", "label": "SANCTUARY", "timeLimitFrames": 1800, "warpDefault": 1 },
      { "id": 113, "name": "ST_113_DAA_LOO_MAA", "label": "DAA LOO MAA", "timeLimitFrames": 1800 }
    ]
  },
  "master": {
    "stages": [
      { "id": 121, "name": "ST_121_WAVE_MASTER", "label": "WAVE MASTER", "warpDefault": 1 },
      { "id": 122, "name": "ST_122_FAN_MASTER", "label": "FAN MASTER", "warpDefault": 1 },
      { "id": 123, "name": "ST_123_STAMINA_MASTER", "label": "STAMINA MASTER", "warpDefault": 1 },
      { "id": 124, "name": "ST_124_SPRING_MASTER", "label": "SPRING MASTER", "warpDefault": 1 },
      { "id": 125, "name": "ST_125_DANCE_MASTER", "label": "DANCE MASTER", "warpDefault": 1 },
      { "id": 126, "name": "ST_126_ROLL_MASTER", "label": "ROLL MASTER", "warpDefault": 1 },
      { "id": 127, "name": "ST_127_EDGE_MASTER", "label": "EDGE MASTER", "warpDefault": 1 },
      { "id": 128, "name": "ST_128_DODGE_MASTER", "label": "DODGE MASTER", "warpDefault": 1 },
      { "id": 129, "name": "ST_129_BRIDGE_MASTER", "label": "BRIDGE MASTER", "warpDefault": 1 },
      { "id": 130, "name": "ST_130_MONKEY_MASTER", "label": "MONKEY MASTER" }
    ]
  }
};

function resolveStageRules(stageId: number) {
  const packRules = getPackStageRules(stageId);
  return {
    parserId: packRules?.parserId ?? DEFAULT_SMB1_PARSER_ID,
    rulesetId: packRules?.rulesetId ?? DEFAULT_SMB1_RULESET_ID,
  };
}

function isBonusStage(stageId) {
  return stageId >= 91 && stageId <= 95;
}

function getDefaultWarpDistance(goalType: string | null) {
  if (goalType === 'G') {
    return 1;
  }
  if (goalType === 'R') {
    return 2;
  }
  return 0;
}

function getWarpDistance(entry: CourseStageEntry, goalType: string | null) {
  const normalized = (goalType === 'G' || goalType === 'R' || goalType === 'B') ? goalType : 'B';
  const direct = entry.warpDistances?.[normalized];
  if (typeof direct === 'number') {
    return direct;
  }
  if (typeof entry.warpDefault === 'number') {
    return entry.warpDefault;
  }
  return getDefaultWarpDistance(normalized);
}

function isFloorClear(info) {
  if ((info.flags & INFO_FLAGS.GOAL) || (info.flags & INFO_FLAGS.BONUS_CLEAR)) {
    return true;
  }
  if (isBonusStage(info.u_currStageId)
    && ((info.flags & INFO_FLAGS.TIMEOVER) || (info.flags & INFO_FLAGS.FALLOUT))) {
    return true;
  }
  return false;
}

export function getStageListForDifficulty(difficulty) {
  const course = courseDefinitions[difficulty];
  if (!course) {
    return [];
  }
  return course.stages.map((entry) => {
    const rules = resolveStageRules(entry.id);
    return {
      id: entry.id,
      name: entry.name,
      label: entry.label,
      parserId: rules.parserId,
      rulesetId: rules.rulesetId,
    };
  });
}

export class Course {
  constructor(difficulty, stageIndex = 0) {
    this.difficulty = difficulty;
    this.definition = courseDefinitions[difficulty];
    if (!this.definition || this.definition.stages.length === 0) {
      throw new Error(`Missing course data for ${difficulty}`);
    }
    this.stageList = this.definition.stages.map((entry) => {
      const rules = resolveStageRules(entry.id);
      return {
        ...entry,
        parserId: rules.parserId,
        rulesetId: rules.rulesetId,
      };
    });
    this.stageIndex = 0;
    this.currentFloor = 1;
    this.currentStageName = '';
    this.currentStageId = 0;
    this.currentStageParserId = DEFAULT_SMB1_PARSER_ID;
    this.currentStageRulesetId = DEFAULT_SMB1_RULESET_ID;
    this.init();
    if (stageIndex > 0) {
      this.setStageIndex(stageIndex);
    }
  }

  init() {
    const first = this.stageList[0];
    if (!first) {
      return;
    }
    this.currentStageName = first.name;
    this.currentStageId = first.id;
    this.currentStageParserId = first.parserId ?? DEFAULT_SMB1_PARSER_ID;
    this.currentStageRulesetId = first.rulesetId ?? DEFAULT_SMB1_RULESET_ID;
    this.stageIndex = 0;
    this.currentFloor = 1;
  }

  getTimeLimitFrames() {
    const entry = this.stageList[this.stageIndex];
    return entry?.timeLimitFrames ?? DEFAULT_STAGE_TIME;
  }

  getStageLabel() {
    return stageLabelFromName(this.currentStageName);
  }

  getFloorInfo() {
    const total = this.stageList.length;
    const current = this.currentFloor;
    let prefix = 'FLOOR';
    if (typeof this.difficulty === 'string') {
      if (this.difficulty === 'master') {
        prefix = 'MASTER';
      } else if (this.difficulty.includes('extra')) {
        prefix = 'EXTRA';
      }
    }
    const difficultyIndex = this.difficulty === 'beginner' || this.difficulty === 'beginner-extra'
      ? 0
      : this.difficulty === 'advanced' || this.difficulty === 'advanced-extra'
        ? 1
        : 2;
    const difficultyIconIndex = prefix === 'MASTER' ? 4 : difficultyIndex + 1;
    return {
      current,
      total,
      prefix,
      difficultyIndex,
      difficultyIconIndex,
      showDifficultyIcon: prefix !== 'MASTER',
      isFinal: current >= total,
    };
  }

  getNextStageIds() {
    const entry = this.stageList[this.stageIndex];
    if (!entry) {
      return [];
    }
    const ids = new Set<number>();
    const goalTypes = ['B', 'G', 'R'];
    for (const goalType of goalTypes) {
      const warpDistance = getWarpDistance(entry, goalType);
      const nextIndex = this.stageIndex + warpDistance;
      if (nextIndex >= 0 && nextIndex < this.stageList.length) {
        ids.add(this.stageList[nextIndex].id);
      }
    }
    return Array.from(ids.values());
  }

  setStageIndex(stageIndex) {
    if (!this.stageList.length) {
      return;
    }
    const clamped = Math.max(0, Math.min(stageIndex, this.stageList.length - 1));
    const entry = this.stageList[clamped];
    if (!entry) {
      return;
    }
    this.currentStageName = entry.name;
    this.currentStageId = entry.id;
    this.currentStageParserId = entry.parserId ?? DEFAULT_SMB1_PARSER_ID;
    this.currentStageRulesetId = entry.rulesetId ?? DEFAULT_SMB1_RULESET_ID;
    this.stageIndex = clamped;
    this.currentFloor = clamped + 1;
  }

  advance(info) {
    const entry = this.stageList[this.stageIndex];
    if (!entry) {
      return false;
    }
    if (!isFloorClear(info)) {
      return false;
    }
    const goalType = info.goalType ?? 'B';
    const warpDistance = getWarpDistance(entry, goalType);
    const nextIndex = this.stageIndex + warpDistance;
    if (nextIndex < 0 || nextIndex >= this.stageList.length) {
      return false;
    }
    const nextEntry = this.stageList[nextIndex];
    this.currentStageName = nextEntry.name;
    this.currentStageId = nextEntry.id;
    this.currentStageParserId = nextEntry.parserId ?? DEFAULT_SMB1_PARSER_ID;
    this.currentStageRulesetId = nextEntry.rulesetId ?? DEFAULT_SMB1_RULESET_ID;
    this.currentFloor = nextIndex + 1;
    this.stageIndex = nextIndex;
    return true;
  }
}
