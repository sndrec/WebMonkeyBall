import { DEG_TO_S16 } from '../shared/constants/index.js';
import { sqrt, toS16 } from '../math.js';

export const STAGE_START_POS_SIZE = 0x14;
export const STAGE_ANIM_GROUP_SIZE = 0xc4;
export const STAGE_TRIANGLE_SIZE = 0x40;
export const STAGE_GOAL_SIZE = 0x14;
export const STAGE_BUMPER_SIZE = 0x20;
export const STAGE_JAMABAR_SIZE = 0x20;
export const STAGE_BANANA_SIZE = 0x10;
export const STAGE_CONE_SIZE = 0x20;
export const STAGE_SPHERE_SIZE = 0x14;
export const STAGE_CYLINDER_SIZE = 0x1c;
export const STAGE_ANIM_GROUP_MODEL_SIZE = 0x0c;
export const STAGE_FALLOUT_BOX_SIZE = 0x20;
export const STAGE_BG_OBJECT_SIZE = 0x38;
export const STAGE2_BG_OBJECT_SIZE = 0x38;
export const STAGE_BG_ANIM_SIZE = 0x60;
export const STAGE_FLIPBOOK_SIZE = 0x10;
export const STAGE_NIGHT_WINDOW_SIZE = 0x14;
export const STAGE_STORM_FIRE_SIZE = 0x10;
export const STAGE_KEYFRAME_SIZE = 0x14;
export const STAGE2_ANIM_GROUP_SIZE = 0x49c;
export const STAGE_SWITCH_SIZE = 0x18;
export const STAGE_WORMHOLE_SIZE = 0x1c;
export const STAGE2_MODEL_INSTANCE_SIZE = 0x24;
export const STAGE2_MAGIC_A = 0x00000000;
export const STAGE2_MAGIC_B = 0x447a0000;
export const STAGE2_MAGIC_B_ALT = 0x42c80000;
export const ANIM_LOOP = 0;
export const ANIM_PLAY_ONCE = 1;
export const ANIM_SEESAW = 2;
export const SMB2_STAGE_LOADIN_FRAMES = 0x168;
export const JAMABAR_BOUND_RADIUS = sqrt((1.75 * 1.75) + (0.5 * 0.5) + (0.5 * 0.5));
export const GOAL_BAG_LOCAL_START = { x: 0, y: -1, z: 0.1 };
export const CONFETTI_GRAVITY_SCALE = 0.004;
export const CONFETTI_VEL_DAMP = 0.95;
export const CONFETTI_ROT_SPEED_SCALE = 2560;
export const CONFETTI_GROUND_CHECK = 1.0;
export const CONFETTI_BOUNCE = -0.7;
export const CONFETTI_LIFE_BASE = 210;
export const CONFETTI_LIFE_RANGE = 60;
export const CONFETTI_MODEL_COUNT = 5;
export const GOAL_TAPE_SEGMENT_COUNT = 8;
export const GOAL_TAPE_SEGMENT_LEN = 0.225;
export const GOAL_TAPE_GRAVITY_SCALE = 0.004;
export const GOAL_TAPE_GROUND_OFFSET = 0.002;
export const GOAL_TAPE_ANCHOR_Y = 0.7400003672;
export const GOAL_TAPE_Y_STEP = 0.016666668;
export const GOAL_TAPE_X_SCALE = 1.75;
export const GOAL_TAPE_X_OFFSET = 0.875;
export const BANANA_COLLECT_WAIT_FRAMES = 15;
export const BANANA_SHRINK_STEP = 1 / BANANA_COLLECT_WAIT_FRAMES;
export const BANANA_BASE_SCALES = [0.5, 0.75, 0.5, 0.75];
export const BANANA_ROT_VEL_Y = [1024, 768, 1024, 1024];
export const BANANA_STATE_HOLDING = 7;
export const BANANA_STATE_FLY = 8;
export const BANANA_HOLD_FRAMES = 30;
export const BANANA_HOLD_DAMP = 0.8;
export const BANANA_HOLD_Y_BASE = 0.75;
export const BANANA_HOLD_Y_RANGE = 0.5;
export const BANANA_HOLD_Y_LERP = 0.2;
export const BANANA_HOLD_ROT_TARGET = 0x1000;
export const BANANA_HOLD_SCALE_FACTOR = 0.5;
export const BANANA_TILT_FADE_FRAMES = 30;
export const BANANA_FLY_FRAMES = 32;
export const BANANA_FLY_SCALE_TARGET = 0;
export const BANANA_HUD_TARGET_X = 1.0583333;
export const BANANA_HUD_TARGET_Y = 0.84166664;
export const BANANA_HUD_TARGET_Z = -2.0;
export const BANANA_FOV_Y = Math.PI / 3;
export const BANANA_FOV_TAN = Math.tan(BANANA_FOV_Y * 0.5);
export const FLY_IN_MIN_RADIUS = 31.25;
export const STAGE_FLY_IN_OVERRIDES = new Map([
  [4, { pos: { x: 0, y: 0, z: 0 }, radius: 50 }],
  [14, { pos: { x: 0, y: 0, z: 0 }, radius: 50 }],
  [144, { pos: { x: 0, y: 0, z: 0 }, radius: 31.25 }],
]);
export const SWITCH_MODEL_SUFFIXES = [
  'BUTTON_P',
  'BUTTON_S',
  'BUTTON_R',
  'BUTTON_FF',
  'BUTTON_FR',
];

export function randS16(rng: { nextS16: () => number }): number {
  return rng.nextS16();
}

export function randFloat(rng: { nextFloat: () => number }): number {
  return rng.nextFloat();
}

export function formatStageId(stageId: number): string {
  return String(stageId).padStart(3, '0');
}

export function degToS16(degrees: number): number {
  return toS16(Math.trunc(degrees * DEG_TO_S16));
}
