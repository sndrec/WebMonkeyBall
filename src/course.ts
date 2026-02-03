import { DEFAULT_STAGE_TIME, stageIdFromName, stageLabelFromName, INFO_FLAGS } from './constants.js';

const CMD_FLOOR = 'CMD_FLOOR';
const CMD_IF = 'CMD_IF';
const CMD_THEN = 'CMD_THEN';
const CMD_COURSE_END = 'CMD_COURSE_END';

const IF_FLOOR_CLEAR = 'IF_FLOOR_CLEAR';
const IF_GOAL_TYPE = 'IF_GOAL_TYPE';
const IF_TIME_ELAPSED = 'IF_TIME_ELAPSED';

const THEN_JUMP_FLOOR = 'THEN_JUMP_FLOOR';

const FLOOR_STAGE_ID = 'FLOOR_STAGE_ID';
const FLOOR_TIME = 'FLOOR_TIME';

// beginnerMain
const beginnerMainScript = [
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_001_PLAIN' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_002_DIAMOND' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_IF', type: 'IF_GOAL_TYPE', value: 'B' },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_IF', type: 'IF_GOAL_TYPE', value: 'G' },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 3 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_003_HAIRPIN' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_004_WIDE_BRIDGE' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_091_BONUS_BASIC' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_005_SLOPES' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_006_STEPS' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_007_BLOCKS' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_008_JUMP_SINGLE' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_009_EXAM_A' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: '2', value: 0 },
  { op: 'CMD_COURSE_END', type: '0', value: 0 },
];

// advancedMain
const advancedMainScript = [
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_011_BUMP' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_012_WALKING' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_013_REPULSE' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_014_NARROW_BRIDGE' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_091_BONUS_BASIC' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_015_BREAK' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_IF', type: 'IF_GOAL_TYPE', value: 'B' },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_IF', type: 'IF_GOAL_TYPE', value: 'G' },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 4 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_016_CURVES' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_017_DOWNHILL' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_018_BLOCKS_SLIM' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_092_BONUS_WAVE' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_021_CHOICE' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_IF', type: 'IF_GOAL_TYPE', value: 'B' },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_IF', type: 'IF_GOAL_TYPE', value: 'G' },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 3 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_022_BOWL' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_023_JUMPIES' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_024_STOPPERS' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_025_FLOOR_BENT' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_026_CONVEYOR' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_027_EXAM_B' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_028_CHASER' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_IF', type: 'IF_GOAL_TYPE', value: 'B' },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_IF', type: 'IF_GOAL_TYPE', value: 'G' },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 2 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_IF', type: 'IF_GOAL_TYPE', value: 'R' },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 7 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_029_JUMP_DOUBLE' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_093_BONUS_GRID' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_031_MIDDLE_JAM' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_032_ANTLION' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_033_COLLAPSE' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_034_SWING_BAR' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_035_LABYRINTH' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_IF', type: 'IF_GOAL_TYPE', value: 'B' },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_IF', type: 'IF_GOAL_TYPE', value: 'G' },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 3 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_036_SPIRAL' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_037_WAVY_JUMP' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_038_SPIKY' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_039_UNREST' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_040_POLAR' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: '2', value: 0 },
  { op: 'CMD_COURSE_END', type: '0', value: 0 },
];

const expertMainScript = [
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_041_RUIN' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_042_BRANCH' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_IF', type: 'IF_GOAL_TYPE', value: 'B' },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_IF', type: 'IF_GOAL_TYPE', value: 'R' },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 3 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_043_OVERTURN' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_IF', type: 'IF_GOAL_TYPE', value: 'B' },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_IF', type: 'IF_GOAL_TYPE', value: 'G' },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 2 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_044_EXCURSION' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_091_BONUS_BASIC' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_045_DODECAGON' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_046_EXAM_C' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_047_SKELETON' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_048_TRACKS' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_092_BONUS_WAVE' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_051_DOWNHILL_HARD' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_052_GEARS' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_053_DESTRUCTION' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_054_INVASION' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_055_DIVING' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_056_FLOOR_SLANT' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_057_TRAM' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_058_SWING_BAR_LONG' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_059_PAPERWORK' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_093_BONUS_GRID' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_061_TWIN_ATTACKER' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_062_SEGA_LOGO' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_063_SNAKE' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_064_WIND' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_065_WINDY_SLIDE' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_066_FALL_DOWN' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_067_TWIN_CROSS' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_068_SPIRAL_HARD' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_069_CONVEYOR_PARTS' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_094_BONUS_BUMPY' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_071_GAPS' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_072_CURVATURE' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_073_ANT_LION_SUPER' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_074_DRUM' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_075_TWIST_AND_SPIN' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_076_SPEEDY_JAM' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_077_QUAKE' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_078_CASSIOPEIA' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_079_PIRATES' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_095_BONUS_HUNTING' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_081_BOWL_OPEN' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_082_CHECKER' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_IF', type: 'IF_GOAL_TYPE', value: 'B' },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_IF', type: 'IF_GOAL_TYPE', value: 'G' },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 2 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_IF', type: 'IF_GOAL_TYPE', value: 'R' },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 3 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_083_CARPET' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_084_RIDGE' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_085_MIXER' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_086_RINGS' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_IF', type: 'IF_GOAL_TYPE', value: 'B' },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_IF', type: 'IF_GOAL_TYPE', value: 'G' },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 2 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_087_STAIRS' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_088_CLOVER' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_089_COFFEE_CUP' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_090_METAMORPHASIS' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: '2', value: 0 },
  { op: 'CMD_COURSE_END', type: '0', value: 0 },
];

const beginnerExtraScript = [
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_101_BLUR_BRIDGE' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_102_HITTER' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_103_AV_LOGO' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: '2', value: 0 },
  { op: 'CMD_COURSE_END', type: '0', value: 0 },
];

const advancedExtraScript = [
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_101_BLUR_BRIDGE' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_104_HARD_HITTER' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_105_PUZZLE' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_103_AV_LOGO' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_106_POLAR_LARGE' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: '2', value: 0 },
  { op: 'CMD_COURSE_END', type: '0', value: 0 },
];

const expertExtraScript = [
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_101_BLUR_BRIDGE' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_107_BREATHE' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_104_HARD_HITTER' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_108_FERRIS_WHEEL' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_109_FACTORY' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_110_CURL_PIPE' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_111_MAGIC_HAND' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_103_AV_LOGO' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_112_SANCTUARY' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_113_DAA_LOO_MAA' },
  { op: 'CMD_FLOOR', type: 'FLOOR_TIME', value: 1800 },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: '2', value: 0 },
  { op: 'CMD_COURSE_END', type: '0', value: 0 },
];

const masterScript = [
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_121_WAVE_MASTER' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_122_FAN_MASTER' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_123_STAMINA_MASTER' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_124_SPRING_MASTER' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_125_DANCE_MASTER' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_126_ROLL_MASTER' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_127_EDGE_MASTER' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_128_DODGE_MASTER' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_129_BRIDGE_MASTER' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: 'THEN_JUMP_FLOOR', value: 1 },
  { op: 'CMD_FLOOR', type: 'FLOOR_STAGE_ID', value: 'ST_130_MONKEY_MASTER' },
  { op: 'CMD_IF', type: 'IF_FLOOR_CLEAR', value: 0 },
  { op: 'CMD_THEN', type: '2', value: 0 },
  { op: 'CMD_COURSE_END', type: '0', value: 0 },
];

const scripts = {
  beginner: beginnerMainScript,
  advanced: advancedMainScript,
  expert: expertMainScript,
  'beginner-extra': beginnerExtraScript,
  'advanced-extra': advancedExtraScript,
  'expert-extra': expertExtraScript,
  master: masterScript,
};

function isBonusStage(stageId) {
  return stageId >= 91 && stageId <= 95;
}

function buildStageList(script) {
  const list = [];
  for (let i = 0; i < script.length; i += 1) {
    const cmd = script[i];
    if (cmd.op === CMD_FLOOR && cmd.type === FLOOR_STAGE_ID) {
      const name = cmd.value;
      list.push({
        id: stageIdFromName(name),
        name,
        label: stageLabelFromName(name),
        nextIndex: i + 1,
      });
    }
  }
  return list;
}

export function getStageListForDifficulty(difficulty) {
  const script = scripts[difficulty];
  if (!script) {
    return [];
  }
  return buildStageList(script).map((entry) => ({
    id: entry.id,
    name: entry.name,
    label: entry.label,
  }));
}

export class Course {
  constructor(difficulty, stageIndex = 0) {
    this.difficulty = difficulty;
    this.script = scripts[difficulty];
    if (!this.script || this.script.length === 0) {
      throw new Error(`Missing course script for ${difficulty}`);
    }
    this.stageList = buildStageList(this.script);
    this.scriptIndex = 0;
    this.currentFloor = 1;
    this.currentStageName = '';
    this.currentStageId = 0;
    this.jumpFloors = -1;
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
    this.scriptIndex = first.nextIndex;
    this.currentFloor = 1;
  }

  getTimeLimitFrames() {
    const next = this.script[this.scriptIndex];
    if (next && next.op === CMD_FLOOR && next.type === FLOOR_TIME) {
      return next.value;
    }
    return DEFAULT_STAGE_TIME;
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
    const ids = new Set<number>();
    const next = this.findStageAfterFloors(this.scriptIndex, 1);
    if (next) {
      ids.add(next.id);
    }
    const goalTypes = ['B', 'G', 'R'];
    const timerCandidates = [0, DEFAULT_STAGE_TIME];
    for (const goalType of goalTypes) {
      for (const timerCurr of timerCandidates) {
        const jumpCount = this.peekJumpCount({
          flags: INFO_FLAGS.GOAL,
          goalType,
          timerCurr,
          u_currStageId: this.currentStageId,
        });
        if (typeof jumpCount === 'number' && jumpCount > 0) {
          const jumpStage = this.findStageAfterFloors(this.scriptIndex, jumpCount);
          if (jumpStage) {
            ids.add(jumpStage.id);
          }
        }
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
    this.scriptIndex = entry.nextIndex;
    this.currentFloor = clamped + 1;
  }

  advance(info) {
    let prevOpcode = null;
    let condResult = 0;
    this.jumpFloors = -1;

    for (let i = this.scriptIndex; i < this.script.length; i += 1) {
      const cmd = this.script[i];
      if (cmd.op === CMD_COURSE_END) {
        return false;
      }
      if (cmd.op === CMD_FLOOR && cmd.type === FLOOR_STAGE_ID) {
        break;
      }

      if (cmd.op === CMD_IF) {
        const result = this.evalIf(cmd, info);
        if (prevOpcode !== CMD_IF) {
          condResult = result ? 1 : 0;
        } else if (condResult) {
          condResult = result ? 1 : 0;
        }
      }

      if (cmd.op === CMD_THEN && condResult) {
        this.evalThen(cmd);
      }

      if (this.jumpFloors !== -1) {
        const jumped = this.performJump(i);
        if (!jumped) {
          return false;
        }
        return true;
      }

      prevOpcode = cmd.op;
    }

    return false;
  }

  peekJumpCount(info) {
    let prevOpcode = null;
    let condResult = 0;
    let jumpFloors = -1;

    for (let i = this.scriptIndex; i < this.script.length; i += 1) {
      const cmd = this.script[i];
      if (cmd.op === CMD_COURSE_END) {
        return null;
      }
      if (cmd.op === CMD_FLOOR && cmd.type === FLOOR_STAGE_ID) {
        break;
      }

      if (cmd.op === CMD_IF) {
        const result = this.evalIf(cmd, info);
        if (prevOpcode !== CMD_IF) {
          condResult = result ? 1 : 0;
        } else if (condResult) {
          condResult = result ? 1 : 0;
        }
      }

      if (cmd.op === CMD_THEN && condResult && cmd.type === THEN_JUMP_FLOOR) {
        jumpFloors = cmd.value;
      }

      if (jumpFloors !== -1) {
        let jumpCount = 0;
        for (let j = i; j < this.script.length; j += 1) {
          const jumpCmd = this.script[j];
          if (jumpCmd.op === CMD_COURSE_END) {
            return null;
          }
          if (jumpCmd.op === CMD_FLOOR && jumpCmd.type === FLOOR_STAGE_ID) {
            jumpCount += 1;
            if (jumpCount === jumpFloors) {
              return jumpCount;
            }
          }
        }
        return null;
      }

      prevOpcode = cmd.op;
    }

    return null;
  }

  evalIf(cmd, info) {
    switch (cmd.type) {
      case IF_FLOOR_CLEAR:
        if ((info.flags & INFO_FLAGS.GOAL) || (info.flags & INFO_FLAGS.BONUS_CLEAR)) {
          return true;
        }
        if (isBonusStage(info.u_currStageId)
          && ((info.flags & INFO_FLAGS.TIMEOVER) || (info.flags & INFO_FLAGS.FALLOUT))) {
          return true;
        }
        return false;
      case IF_GOAL_TYPE:
        return info.goalType === cmd.value;
      case IF_TIME_ELAPSED:
        return info.timerCurr >= cmd.value;
      default:
        return false;
    }
  }

  evalThen(cmd) {
    if (cmd.type === THEN_JUMP_FLOOR) {
      this.jumpFloors = cmd.value;
    }
  }

  performJump(fromIndex) {
    let jumpCount = 0;
    for (let i = fromIndex; i < this.script.length; i += 1) {
      const cmd = this.script[i];
      if (cmd.op === CMD_COURSE_END) {
        return false;
      }
      if (cmd.op === CMD_FLOOR && cmd.type === FLOOR_STAGE_ID) {
        jumpCount += 1;
        if (jumpCount === this.jumpFloors) {
          const stageName = cmd.value;
          const stageId = stageIdFromName(stageName);
          this.currentStageName = stageName;
          this.currentStageId = stageId;
          this.currentFloor += jumpCount;
          this.scriptIndex = i + 1;
          this.jumpFloors = -1;
          return true;
        }
      }
    }
    return false;
  }

  findNextStage(startIndex) {
    for (let i = startIndex; i < this.script.length; i += 1) {
      const cmd = this.script[i];
      if (cmd.op === CMD_FLOOR && cmd.type === FLOOR_STAGE_ID) {
        return {
          id: stageIdFromName(cmd.value),
          name: cmd.value,
          nextIndex: i + 1,
        };
      }
    }
    return null;
  }

  findStageAfterFloors(startIndex, floors) {
    if (floors <= 0) {
      return null;
    }
    let count = 0;
    for (let i = startIndex; i < this.script.length; i += 1) {
      const cmd = this.script[i];
      if (cmd.op === CMD_FLOOR && cmd.type === FLOOR_STAGE_ID) {
        count += 1;
        if (count === floors) {
          return {
            id: stageIdFromName(cmd.value),
            name: cmd.value,
            nextIndex: i + 1,
          };
        }
      }
    }
    return null;
  }
}
