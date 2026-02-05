import { lzssDecompress } from './lzs.js';
import { fetchPackBuffer } from './pack.js';
import ArrayBufferSlice from './noclip/ArrayBufferSlice.js';
import { CommonNlModelID } from './noclip/SuperMonkeyBall/NlModelInfo.js';
import { parseObj as parseNlObj } from './noclip/SuperMonkeyBall/NaomiLib.js';
import { decompressLZ } from './noclip/SuperMonkeyBall/AVLZ.js';
import {
  BUMPER_BOUND_CENTER,
  BUMPER_BOUND_RADIUS,
  BUMPER_MODEL_RADIUS,
  DEG_TO_S16,
  GOAL_BAG_BASE_CENTER,
  GOAL_BAG_BASE_RADIUS,
  GOAL_BAG_GUIDE_DIR,
  GOAL_BAG_GUIDE_POS,
  GOAL_BAG_OFFSET,
  GOAL_BAG_OPEN_SCALE,
  STAGE_BASE_PATHS,
  goalTypeFromValue,
} from './constants.js';
import {
  MatrixStack,
  atan2S16,
  atan2S16Safe,
  floor,
  sinS16,
  sqrt,
  sumSq2,
  toS16,
  vecDot,
  vecNormalizeLen,
} from './math.js';
import { interpolateKeyframes } from './animation.js';
import { raycastStageDown } from './collision.js';
import { updateBallEffects } from './effects.js';
import { parseGma } from './gma.js';
import { parseAVTpl } from './tpl.js';
import { DeterministicRng } from './rng.js';

const TEXT_DECODER = new TextDecoder('utf-8');
const STAGE_START_POS_SIZE = 0x14;
const STAGE_ANIM_GROUP_SIZE = 0xc4;
const STAGE_TRIANGLE_SIZE = 0x40;
const STAGE_GOAL_SIZE = 0x14;
const STAGE_BUMPER_SIZE = 0x20;
const STAGE_JAMABAR_SIZE = 0x20;
const STAGE_BANANA_SIZE = 0x10;
const STAGE_CONE_SIZE = 0x20;
const STAGE_SPHERE_SIZE = 0x14;
const STAGE_CYLINDER_SIZE = 0x1c;
const STAGE_ANIM_GROUP_MODEL_SIZE = 0x0c;
const STAGE_FALLOUT_BOX_SIZE = 0x20;
const STAGE_BG_OBJECT_SIZE = 0x38;
const STAGE2_BG_OBJECT_SIZE = 0x38;
const STAGE_BG_ANIM_SIZE = 0x60;
const STAGE_FLIPBOOK_SIZE = 0x10;
const STAGE_NIGHT_WINDOW_SIZE = 0x14;
const STAGE_STORM_FIRE_SIZE = 0x10;
const STAGE_KEYFRAME_SIZE = 0x14;
const STAGE2_ANIM_GROUP_SIZE = 0x49c;
const STAGE_SWITCH_SIZE = 0x18;
const STAGE_WORMHOLE_SIZE = 0x1c;
const STAGE2_MODEL_INSTANCE_SIZE = 0x24;
const STAGE2_MAGIC_A = 0x00000000;
const STAGE2_MAGIC_B = 0x447a0000;
const STAGE2_MAGIC_B_ALT = 0x42c80000;
const ANIM_LOOP = 0;
const ANIM_PLAY_ONCE = 1;
const ANIM_SEESAW = 2;
const SMB2_STAGE_LOADIN_FRAMES = 0x168;
const JAMABAR_BOUND_RADIUS = sqrt((1.75 * 1.75) + (0.5 * 0.5) + (0.5 * 0.5));
const GOAL_BAG_LOCAL_START = { x: 0, y: -1, z: 0.1 };
const CONFETTI_GRAVITY_SCALE = 0.004;
const CONFETTI_VEL_DAMP = 0.95;
const CONFETTI_ROT_SPEED_SCALE = 2560;
const CONFETTI_GROUND_CHECK = 1.0;
const CONFETTI_BOUNCE = -0.7;
const CONFETTI_LIFE_BASE = 210;
const CONFETTI_LIFE_RANGE = 60;
const CONFETTI_MODEL_COUNT = 5;
const GOAL_TAPE_SEGMENT_COUNT = 8;
const GOAL_TAPE_SEGMENT_LEN = 0.225;
const GOAL_TAPE_GRAVITY_SCALE = 0.004;
const GOAL_TAPE_GROUND_OFFSET = 0.002;
const GOAL_TAPE_ANCHOR_Y = 0.7400003672;
const GOAL_TAPE_Y_STEP = 0.016666668;
const GOAL_TAPE_X_SCALE = 1.75;
const GOAL_TAPE_X_OFFSET = 0.875;
const BANANA_COLLECT_WAIT_FRAMES = 15;
const BANANA_SHRINK_STEP = 1 / BANANA_COLLECT_WAIT_FRAMES;
const BANANA_BASE_SCALES = [0.5, 0.75, 0.5, 0.75];
const BANANA_ROT_VEL_Y = [1024, 768, 1024, 1024];
const BANANA_STATE_HOLDING = 7;
const BANANA_STATE_FLY = 8;
const BANANA_HOLD_FRAMES = 30;
const BANANA_HOLD_DAMP = 0.8;
const BANANA_HOLD_Y_BASE = 0.75;
const BANANA_HOLD_Y_RANGE = 0.5;
const BANANA_HOLD_Y_LERP = 0.2;
const BANANA_HOLD_ROT_TARGET = 0x1000;
const BANANA_HOLD_SCALE_FACTOR = 0.5;
const BANANA_TILT_FADE_FRAMES = 30;
const BANANA_FLY_FRAMES = 32;
const BANANA_FLY_SCALE_TARGET = 0;
const BANANA_HUD_TARGET_X = 1.0583333;
const BANANA_HUD_TARGET_Y = 0.84166664;
const BANANA_HUD_TARGET_Z = -2.0;
const BANANA_FOV_Y = Math.PI / 3;
const BANANA_FOV_TAN = Math.tan(BANANA_FOV_Y * 0.5);
const FLY_IN_MIN_RADIUS = 31.25;
const STAGE_FLY_IN_OVERRIDES = new Map([
  [4, { pos: { x: 0, y: 0, z: 0 }, radius: 50 }],
  [14, { pos: { x: 0, y: 0, z: 0 }, radius: 50 }],
  [144, { pos: { x: 0, y: 0, z: 0 }, radius: 31.25 }],
]);
const SWITCH_MODEL_SUFFIXES = [
  'BUTTON_P',
  'BUTTON_S',
  'BUTTON_R',
  'BUTTON_FF',
  'BUTTON_FR',
];

function randS16(rng) {
  return rng.nextS16();
}

function randFloat(rng) {
  return rng.nextFloat();
}

function formatStageId(stageId) {
  return String(stageId).padStart(3, '0');
}

function degToS16(degrees) {
  return toS16(Math.trunc(degrees * DEG_TO_S16));
}

class StageParser {
  constructor(data) {
    this.data = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  readU8(offset) {
    return this.view.getUint8(offset);
  }

  readS16(offset) {
    return this.view.getInt16(offset, false);
  }

  readU16(offset) {
    return this.view.getUint16(offset, false);
  }

  readS32(offset) {
    return this.view.getInt32(offset, false);
  }

  readU32(offset) {
    return this.view.getUint32(offset, false);
  }

  readF32(offset) {
    return this.view.getFloat32(offset, false);
  }

  readPtr(offset) {
    if (offset === null) {
      return null;
    }
    if (offset < 0 || offset + 4 > this.data.length) {
      return null;
    }
    const value = this.readU32(offset);
    if (value === 0 || value < 0 || value >= this.data.length) {
      return null;
    }
    return value;
  }

  readVec3(offset) {
    return {
      x: this.readF32(offset),
      y: this.readF32(offset + 4),
      z: this.readF32(offset + 8),
    };
  }

  readVec2(offset) {
    return {
      x: this.readF32(offset),
      y: this.readF32(offset + 4),
    };
  }

  readS16Vec(offset) {
    return {
      x: this.readS16(offset),
      y: this.readS16(offset + 2),
      z: this.readS16(offset + 4),
    };
  }

  readString(offset) {
    let end = offset;
    while (end < this.data.length && this.data[end] !== 0) {
      end += 1;
    }
    return TEXT_DECODER.decode(this.data.subarray(offset, end));
  }

  parseTextureScroll(offset) {
    if (offset === null) {
      return null;
    }
    if (offset < 0 || offset + 8 > this.data.length) {
      return null;
    }
    return { speed: this.readVec2(offset) };
  }

  readStringList(offset) {
    if (offset === null) {
      return [];
    }
    const names = [];
    let cursor = offset;
    while (true) {
      const ptr = this.readPtr(cursor);
      if (ptr === null) {
        break;
      }
      names.push(this.readString(ptr));
      cursor += 4;
    }
    return names;
  }

  parseKeyframes(offset, count) {
    if (offset === null || count <= 0) {
      return null;
    }
    const frames = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const base = offset + i * STAGE_KEYFRAME_SIZE;
      frames[i] = {
        easeType: this.readS32(base),
        timeSeconds: this.readF32(base + 4),
        value: this.readF32(base + 8),
        tangentIn: this.readF32(base + 0xc),
        tangentOut: this.readF32(base + 0x10),
      };
    }
    return frames;
  }

  parseAnimHeader(offset) {
    if (offset === null) {
      return null;
    }
    const anim = {
      rotXKeyframeCount: this.readU32(offset),
      rotXKeyframes: null,
      rotYKeyframeCount: this.readU32(offset + 0x08),
      rotYKeyframes: null,
      rotZKeyframeCount: this.readU32(offset + 0x10),
      rotZKeyframes: null,
      posXKeyframeCount: this.readU32(offset + 0x18),
      posXKeyframes: null,
      posYKeyframeCount: this.readU32(offset + 0x20),
      posYKeyframes: null,
      posZKeyframeCount: this.readU32(offset + 0x28),
      posZKeyframes: null,
    };

    anim.rotXKeyframes = this.parseKeyframes(this.readPtr(offset + 0x04), anim.rotXKeyframeCount);
    anim.rotYKeyframes = this.parseKeyframes(this.readPtr(offset + 0x0c), anim.rotYKeyframeCount);
    anim.rotZKeyframes = this.parseKeyframes(this.readPtr(offset + 0x14), anim.rotZKeyframeCount);
    anim.posXKeyframes = this.parseKeyframes(this.readPtr(offset + 0x1c), anim.posXKeyframeCount);
    anim.posYKeyframes = this.parseKeyframes(this.readPtr(offset + 0x24), anim.posYKeyframeCount);
    anim.posZKeyframes = this.parseKeyframes(this.readPtr(offset + 0x2c), anim.posZKeyframeCount);
    return anim;
  }

  parseBgAnim(offset) {
    if (offset === null) {
      return null;
    }
    if (offset < 0 || offset + STAGE_BG_ANIM_SIZE > this.data.length) {
      return null;
    }
    const anim = {
      loopStartSeconds: this.readF32(offset),
      loopEndSeconds: this.readF32(offset + 0x04),
      scaleXKeyframeCount: this.readU32(offset + 0x08),
      scaleXKeyframes: null,
      scaleYKeyframeCount: this.readU32(offset + 0x10),
      scaleYKeyframes: null,
      scaleZKeyframeCount: this.readU32(offset + 0x18),
      scaleZKeyframes: null,
      rotXKeyframeCount: this.readU32(offset + 0x20),
      rotXKeyframes: null,
      rotYKeyframeCount: this.readU32(offset + 0x28),
      rotYKeyframes: null,
      rotZKeyframeCount: this.readU32(offset + 0x30),
      rotZKeyframes: null,
      posXKeyframeCount: this.readU32(offset + 0x38),
      posXKeyframes: null,
      posYKeyframeCount: this.readU32(offset + 0x40),
      posYKeyframes: null,
      posZKeyframeCount: this.readU32(offset + 0x48),
      posZKeyframes: null,
      visibleKeyframeCount: this.readU32(offset + 0x50),
      visibleKeyframes: null,
      translucencyKeyframeCount: this.readU32(offset + 0x58),
      translucencyKeyframes: null,
    };

    anim.scaleXKeyframes = this.parseKeyframes(this.readPtr(offset + 0x0c), anim.scaleXKeyframeCount);
    anim.scaleYKeyframes = this.parseKeyframes(this.readPtr(offset + 0x14), anim.scaleYKeyframeCount);
    anim.scaleZKeyframes = this.parseKeyframes(this.readPtr(offset + 0x1c), anim.scaleZKeyframeCount);
    anim.rotXKeyframes = this.parseKeyframes(this.readPtr(offset + 0x24), anim.rotXKeyframeCount);
    anim.rotYKeyframes = this.parseKeyframes(this.readPtr(offset + 0x2c), anim.rotYKeyframeCount);
    anim.rotZKeyframes = this.parseKeyframes(this.readPtr(offset + 0x34), anim.rotZKeyframeCount);
    anim.posXKeyframes = this.parseKeyframes(this.readPtr(offset + 0x3c), anim.posXKeyframeCount);
    anim.posYKeyframes = this.parseKeyframes(this.readPtr(offset + 0x44), anim.posYKeyframeCount);
    anim.posZKeyframes = this.parseKeyframes(this.readPtr(offset + 0x4c), anim.posZKeyframeCount);
    anim.visibleKeyframes = this.parseKeyframes(this.readPtr(offset + 0x54), anim.visibleKeyframeCount);
    anim.translucencyKeyframes = this.parseKeyframes(
      this.readPtr(offset + 0x5c),
      anim.translucencyKeyframeCount,
    );
    return anim;
  }

  parseFlipbooks(offset) {
    if (offset === null) {
      return null;
    }
    if (offset < 0 || offset + STAGE_FLIPBOOK_SIZE > this.data.length) {
      return null;
    }
    const nightWindowAnimCount = this.readS32(offset);
    const nightWindowAnimsPtr = this.readPtr(offset + 0x04);
    const stormFireAnimCount = this.readS32(offset + 0x08);
    const stormFireAnimsPtr = this.readPtr(offset + 0x0c);
    const nightWindowAnims = [];
    if (nightWindowAnimsPtr && nightWindowAnimCount > 0) {
      for (let i = 0; i < nightWindowAnimCount; i += 1) {
        const base = nightWindowAnimsPtr + i * STAGE_NIGHT_WINDOW_SIZE;
        nightWindowAnims.push({
          pos: this.readVec3(base),
          rotX: this.readS16(base + 0x0c),
          rotY: this.readS16(base + 0x0e),
          rotZ: this.readS16(base + 0x10),
          id: this.readU8(base + 0x12),
        });
      }
    }
    const stormFireAnims = [];
    if (stormFireAnimsPtr && stormFireAnimCount > 0) {
      for (let i = 0; i < stormFireAnimCount; i += 1) {
        const base = stormFireAnimsPtr + i * STAGE_STORM_FIRE_SIZE;
        stormFireAnims.push({
          pos: this.readVec3(base),
          frameOffset: this.readU8(base + 0x0c),
        });
      }
    }
    return {
      nightWindowAnimCount,
      nightWindowAnims,
      stormFireAnimCount,
      stormFireAnims,
    };
  }

  parseBgObjects(offset, count) {
    if (offset === null || count <= 0) {
      return [];
    }
    const objs = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const base = offset + i * STAGE_BG_OBJECT_SIZE;
      const namePtr = this.readPtr(base + 0x04);
      objs[i] = {
        flags: this.readU32(base),
        name: namePtr ? this.readString(namePtr) : '',
        pos: this.readVec3(base + 0x0c),
        rotX: this.readS16(base + 0x18),
        rotY: this.readS16(base + 0x1a),
        rotZ: this.readS16(base + 0x1c),
        scale: this.readVec3(base + 0x20),
        translucency: this.readF32(base + 0x2c),
        anim: this.parseBgAnim(this.readPtr(base + 0x30)),
        flipbooks: this.parseFlipbooks(this.readPtr(base + 0x34)),
      };
    }
    return objs;
  }

  parseGoals(offset, count) {
    if (offset === null || count <= 0) {
      return [];
    }
    const goals = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const base = offset + i * STAGE_GOAL_SIZE;
      const typeValue = this.readU16(base + 0x12);
      goals[i] = {
        pos: this.readVec3(base),
        rot: this.readS16Vec(base + 0x0c),
        typeValue,
        type: goalTypeFromValue(typeValue),
      };
    }
    return goals;
  }

  parseBumpers(offset, count) {
    if (offset === null || count <= 0) {
      return [];
    }
    const bumpers = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const base = offset + i * STAGE_BUMPER_SIZE;
      bumpers[i] = {
        pos: this.readVec3(base),
        rot: this.readS16Vec(base + 0x0c),
        scale: this.readVec3(base + 0x14),
      };
    }
    return bumpers;
  }

  parseJamabars(offset, count) {
    if (offset === null || count <= 0) {
      return [];
    }
    const jamabars = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const base = offset + i * STAGE_JAMABAR_SIZE;
      jamabars[i] = {
        pos: this.readVec3(base),
        rot: this.readS16Vec(base + 0x0c),
        scale: this.readVec3(base + 0x14),
      };
    }
    return jamabars;
  }

  parseBananas(offset, count) {
    if (offset === null || count <= 0) {
      return [];
    }
    const bananas = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const base = offset + i * STAGE_BANANA_SIZE;
      bananas[i] = {
        pos: this.readVec3(base),
        type: this.readS32(base + 0x0c),
      };
    }
    return bananas;
  }

  parseCones(offset, count) {
    if (offset === null || count <= 0) {
      return [];
    }
    const cones = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const base = offset + i * STAGE_CONE_SIZE;
      cones[i] = {
        pos: this.readVec3(base),
        rot: this.readS16Vec(base + 0x0c),
        flags: this.readU16(base + 0x12),
        scale: this.readVec3(base + 0x14),
      };
    }
    return cones;
  }

  parseSpheres(offset, count) {
    if (offset === null || count <= 0) {
      return [];
    }
    const spheres = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const base = offset + i * STAGE_SPHERE_SIZE;
      spheres[i] = {
        pos: this.readVec3(base),
        radius: this.readF32(base + 0x0c),
        flags: this.readU16(base + 0x10),
      };
    }
    return spheres;
  }

  parseCylinders(offset, count) {
    if (offset === null || count <= 0) {
      return [];
    }
    const cylinders = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const base = offset + i * STAGE_CYLINDER_SIZE;
      cylinders[i] = {
        pos: this.readVec3(base),
        radius: this.readF32(base + 0x0c),
        height: this.readF32(base + 0x10),
        rot: this.readS16Vec(base + 0x14),
        flags: this.readU16(base + 0x1a),
      };
    }
    return cylinders;
  }

  parseAnimGroupModels(offset, count) {
    if (offset === null || count <= 0) {
      return [];
    }
    const models = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const base = offset + i * STAGE_ANIM_GROUP_MODEL_SIZE;
      const namePtr = this.readPtr(base + 0x04);
      models[i] = {
        flags: this.readU32(base),
        name: namePtr ? this.readString(namePtr) : '',
        value: this.readF32(base + 0x08),
      };
    }
    return models;
  }

  parseGridCellTris(offset, countX, countZ) {
    if (offset === null || countX <= 0 || countZ <= 0) {
      return { cells: null, maxIndex: -1 };
    }
    const cellCount = countX * countZ;
    if (offset < 0 || offset + cellCount * 4 > this.data.length) {
      return { cells: null, maxIndex: -1 };
    }
    const cells = new Array(cellCount);
    let maxIndex = -1;
    for (let i = 0; i < cellCount; i += 1) {
      const listPtr = this.readPtr(offset + i * 4);
      if (listPtr === null) {
        cells[i] = null;
        continue;
      }
      const indices = [];
      let cursor = listPtr;
      while (true) {
        const idx = this.readS16(cursor);
        cursor += 2;
        if (idx < 0) {
          break;
        }
        indices.push(idx);
        if (idx > maxIndex) {
          maxIndex = idx;
        }
      }
      cells[i] = indices;
    }
    return { cells, maxIndex };
  }

  parseTriangles(offset, count) {
    if (offset === null || count <= 0) {
      return [];
    }
    const triangles = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const base = offset + i * STAGE_TRIANGLE_SIZE;
      triangles[i] = {
        pos: this.readVec3(base),
        normal: this.readVec3(base + 0x0c),
        rot: this.readS16Vec(base + 0x18),
        flags: this.readU16(base + 0x1e),
        vert2: this.readVec2(base + 0x20),
        vert3: this.readVec2(base + 0x28),
        edge2Normal: this.readVec2(base + 0x30),
        edge3Normal: this.readVec2(base + 0x38),
      };
    }
    return triangles;
  }

  parseAnimGroup(offset) {
    const initPos = this.readVec3(offset);
    const initRot = this.readS16Vec(offset + 0x0c);
    const unk12 = this.readU16(offset + 0x12);
    const animPtr = this.readPtr(offset + 0x14);
    const modelNamesPtr = this.readPtr(offset + 0x18);
    const trianglesPtr = this.readPtr(offset + 0x1c);
    const gridCellTrisPtr = this.readPtr(offset + 0x20);
    const gridOriginX = this.readF32(offset + 0x24);
    const gridOriginZ = this.readF32(offset + 0x28);
    const gridStepX = this.readF32(offset + 0x2c);
    const gridStepZ = this.readF32(offset + 0x30);
    const gridCellCountX = this.readS32(offset + 0x34);
    const gridCellCountZ = this.readS32(offset + 0x38);
    const goalCount = this.readS32(offset + 0x3c);
    const goalsPtr = this.readPtr(offset + 0x40);
    const unk48 = this.readPtr(offset + 0x48);
    const bumperCount = this.readS32(offset + 0x4c);
    const bumpersPtr = this.readPtr(offset + 0x50);
    const jamabarCount = this.readS32(offset + 0x54);
    const jamabarsPtr = this.readPtr(offset + 0x58);
    const bananaCount = this.readS32(offset + 0x5c);
    const bananasPtr = this.readPtr(offset + 0x60);
    const coliConeCount = this.readS32(offset + 0x64);
    const coliConesPtr = this.readPtr(offset + 0x68);
    const coliSphereCount = this.readS32(offset + 0x6c);
    const coliSpheresPtr = this.readPtr(offset + 0x70);
    const coliCylinderCount = this.readS32(offset + 0x74);
    const coliCylindersPtr = this.readPtr(offset + 0x78);
    const animGroupModelCount = this.readS32(offset + 0x7c);
    const animGroupModelsPtr = this.readPtr(offset + 0x80);
    const fallOutBoxCount = this.readS32(offset + 0x84);
    const fallOutBoxesPtr = this.readPtr(offset + 0x88);
    const unk8C = this.readS32(offset + 0x8c);
    const unk90 = this.readPtr(offset + 0x90);
    const unkB8 = this.readVec3(offset + 0xb8);

    const gridData = this.parseGridCellTris(gridCellTrisPtr, gridCellCountX, gridCellCountZ);
    const triangleCount = gridData.maxIndex + 1;
    const fallOutBoxes = this.parseFalloutBoxes(fallOutBoxesPtr, fallOutBoxCount);

    return {
      initPos,
      initRot,
      unk12,
      anim: this.parseAnimHeader(animPtr),
      modelNames: this.readStringList(modelNamesPtr),
      triangles: this.parseTriangles(trianglesPtr, triangleCount),
      gridCellTris: gridData.cells,
      gridOriginX,
      gridOriginZ,
      gridStepX,
      gridStepZ,
      gridCellCountX,
      gridCellCountZ,
      goalCount,
      goals: this.parseGoals(goalsPtr, goalCount),
      unk48,
      bumperCount,
      bumpers: this.parseBumpers(bumpersPtr, bumperCount),
      jamabarCount,
      jamabars: this.parseJamabars(jamabarsPtr, jamabarCount),
      bananaCount,
      bananas: this.parseBananas(bananasPtr, bananaCount),
      coliConeCount,
      coliCones: this.parseCones(coliConesPtr, coliConeCount),
      coliSphereCount,
      coliSpheres: this.parseSpheres(coliSpheresPtr, coliSphereCount),
      coliCylinderCount,
      coliCylinders: this.parseCylinders(coliCylindersPtr, coliCylinderCount),
      animGroupModelCount,
      animGroupModels: this.parseAnimGroupModels(animGroupModelsPtr, animGroupModelCount),
      unk84: fallOutBoxCount,
      unk88: fallOutBoxes,
      fallOutBoxCount,
      fallOutBoxes,
      unk8C,
      unk90,
      unkB8,
    };
  }

  parseStartPositions(offset, fallOutOffset) {
    if (offset === null) {
      return [];
    }
    let count = 1;
    if (fallOutOffset !== null && fallOutOffset > offset) {
      const diff = fallOutOffset - offset;
      if (diff >= STAGE_START_POS_SIZE) {
        count = Math.max(1, Math.floor(diff / STAGE_START_POS_SIZE));
      }
    }
    const starts = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const base = offset + i * STAGE_START_POS_SIZE;
      starts[i] = {
        pos: this.readVec3(base),
        rot: this.readS16Vec(base + 0x0c),
      };
    }
    return starts;
  }

  parseFalloutBoxes(offset, count) {
    if (offset === null || count <= 0) {
      return [];
    }
    const boxes = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const base = offset + i * STAGE_FALLOUT_BOX_SIZE;
      boxes[i] = {
        pos: this.readVec3(base),
        scale: this.readVec3(base + 0x0c),
        rot: {
          x: this.readS16(base + 0x18),
          y: this.readS16(base + 0x1a),
          z: this.readS16(base + 0x1c),
        },
      };
    }
    return boxes;
  }

  parseStage() {
    const loopStartSeconds = this.readS32(0x00);
    const loopEndSeconds = this.readS32(0x04);
    const animGroupCount = this.readS32(0x08);
    const animGroupsPtr = this.readPtr(0x0c);
    const startPosOffset = this.readPtr(0x10);
    const fallOutOffset = this.readPtr(0x14);
    const goalsCount = this.readS32(0x18);
    const goalsPtr = this.readPtr(0x1c);
    const bumperCount = this.readS32(0x28);
    const bumpersPtr = this.readPtr(0x2c);
    const jamabarCount = this.readS32(0x30);
    const jamabarsPtr = this.readPtr(0x34);
    const bananaCount = this.readS32(0x38);
    const bananasPtr = this.readPtr(0x3c);
    const coliConeCount = this.readS32(0x40);
    const coliConesPtr = this.readPtr(0x44);
    const coliSphereCount = this.readS32(0x48);
    const coliSpheresPtr = this.readPtr(0x4c);
    const coliCylinderCount = this.readS32(0x50);
    const coliCylindersPtr = this.readPtr(0x54);
    const animGroupModelCount = this.readS32(0x58);
    const animGroupModelsPtr = this.readPtr(0x5c);
    const bgObjectCount = this.readS32(0x68);
    const bgObjectsPtr = this.readPtr(0x6c);
    const fgObjectCount = this.readS32(0x70);
    const fgObjectsPtr = this.readPtr(0x74);
    const unk78 = this.readPtr(0x78);
    const unk7C = this.readS32(0x7c);
    const mirrorCount = this.readS32(0x80);
    const mirrorsPtr = this.readPtr(0x84);
    const unk88 = this.readPtr(0x88);
    const unk90 = this.readPtr(0x90);

    const animGroups = [];
    if (animGroupsPtr !== null) {
      for (let i = 0; i < animGroupCount; i += 1) {
        animGroups.push(this.parseAnimGroup(animGroupsPtr + i * STAGE_ANIM_GROUP_SIZE));
      }
    }

    const startPositions = this.parseStartPositions(startPosOffset, fallOutOffset);
    const fallOutY = fallOutOffset !== null ? this.readF32(fallOutOffset) : 0;

    return {
      loopStartSeconds,
      loopEndSeconds,
      animGroupCount,
      animGroups,
      startPositions,
      fallOutY,
      goalsCount,
      goals: this.parseGoals(goalsPtr, goalsCount),
      bumperCount,
      bumpers: this.parseBumpers(bumpersPtr, bumperCount),
      jamabarCount,
      jamabars: this.parseJamabars(jamabarsPtr, jamabarCount),
      bananaCount,
      bananas: this.parseBananas(bananasPtr, bananaCount),
      coliConeCount,
      coliCones: this.parseCones(coliConesPtr, coliConeCount),
      coliSphereCount,
      coliSpheres: this.parseSpheres(coliSpheresPtr, coliSphereCount),
      coliCylinderCount,
      coliCylinders: this.parseCylinders(coliCylindersPtr, coliCylinderCount),
      animGroupModelCount,
      animGroupModels: this.parseAnimGroupModels(animGroupModelsPtr, animGroupModelCount),
      bgObjectCount,
      bgObjects: this.parseBgObjects(bgObjectsPtr, bgObjectCount),
      fgObjectCount,
      fgObjects: this.parseBgObjects(fgObjectsPtr, fgObjectCount),
      unk78,
      unk7C,
      mirrorCount,
      mirrorsPtr,
      unk88,
      unk90,
    };
  }
}

class StageParserSmb2 extends StageParser {
  constructor(data) {
    super(data);
    this.stageModelNameCache = new Map();
  }

  parseStartPositions(offset) {
    if (offset === null) {
      return [];
    }
    return [{
      pos: this.readVec3(offset),
      rot: this.readS16Vec(offset + 0x0c),
    }];
  }

  parseSwitches(offset, count) {
    if (offset === null || count <= 0) {
      return [];
    }
    const switches = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const base = offset + i * STAGE_SWITCH_SIZE;
      switches[i] = {
        pos: this.readVec3(base),
        rot: this.readS16Vec(base + 0x0c),
        type: this.readS16(base + 0x12),
        animGroupId: this.readS16(base + 0x14),
        cooldown: 0,
      };
    }
    return switches;
  }

  parseWormholes(offset, count) {
    if (offset === null || count <= 0) {
      return [];
    }
    if (offset < 0 || offset >= this.data.length) {
      return [];
    }
    const maxCount = Math.floor((this.data.length - offset) / STAGE_WORMHOLE_SIZE);
    if (maxCount <= 0) {
      return [];
    }
    const safeCount = Math.min(count, maxCount);
    const wormholes = new Array(safeCount);
    for (let i = 0; i < safeCount; i += 1) {
      const base = offset + i * STAGE_WORMHOLE_SIZE;
      wormholes[i] = {
        _fileOffset: base,
        pos: this.readVec3(base + 0x04),
        rot: this.readS16Vec(base + 0x10),
        destOffset: this.readPtr(base + 0x18),
        dest: null,
      };
    }
    return wormholes;
  }

  resolveStageModelName(ptrA) {
    if (ptrA === null) {
      return '';
    }
    if (this.stageModelNameCache.has(ptrA)) {
      return this.stageModelNameCache.get(ptrA);
    }
    const stageModelPtr = this.readPtr(ptrA + 0x08);
    if (stageModelPtr === null) {
      this.stageModelNameCache.set(ptrA, '');
      return '';
    }
    const namePtr = this.readPtr(stageModelPtr + 0x04);
    const name = namePtr ? this.readString(namePtr) : '';
    this.stageModelNameCache.set(ptrA, name);
    return name;
  }

  parseStageModelInstances(offset, count) {
    if (offset === null || count <= 0) {
      return [];
    }
    const instances = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const base = offset + i * STAGE2_MODEL_INSTANCE_SIZE;
      const stageModelPtrA = this.readPtr(base);
      instances[i] = {
        modelName: this.resolveStageModelName(stageModelPtrA),
        pos: this.readVec3(base + 0x04),
        rot: this.readS16Vec(base + 0x10),
        flags: this.readU16(base + 0x16),
        scale: this.readVec3(base + 0x18),
        stageModelPtrA,
      };
    }
    return instances;
  }

  parseStageModelNames(offset, count) {
    if (offset === null || count <= 0) {
      return [];
    }
    const names = [];
    for (let i = 0; i < count; i += 1) {
      const ptrA = this.readPtr(offset + i * 4);
      const name = this.resolveStageModelName(ptrA);
      if (name) {
        names.push(name);
      }
    }
    return names;
  }

  parseBgObjects(offset, count) {
    if (offset === null || count <= 0) {
      return [];
    }
    if (offset < 0 || offset >= this.data.length) {
      return [];
    }
    const maxCount = Math.floor((this.data.length - offset) / STAGE2_BG_OBJECT_SIZE);
    const safeCount = Math.min(count, maxCount);
    const objs = new Array(safeCount);
    for (let i = 0; i < safeCount; i += 1) {
      const base = offset + i * STAGE2_BG_OBJECT_SIZE;
      const namePtr = this.readPtr(base + 0x04);
      const effectHeaderPtr = this.readPtr(base + 0x34);
      const textureScroll = effectHeaderPtr !== null
        ? this.parseTextureScroll(this.readPtr(effectHeaderPtr + 0x10))
        : null;
      objs[i] = {
        flags: this.readU32(base),
        name: namePtr ? this.readString(namePtr) : '',
        pos: this.readVec3(base + 0x0c),
        rotX: this.readS16(base + 0x18),
        rotY: this.readS16(base + 0x1a),
        rotZ: this.readS16(base + 0x1c),
        scale: this.readVec3(base + 0x20),
        translucency: this.readF32(base + 0x2c),
        anim: this.parseBgAnim(this.readPtr(base + 0x30)),
        flipbooks: this.parseFlipbooks(this.readPtr(base + 0x34)),
        textureScroll,
      };
    }
    return objs;
  }

  parseAnimGroup(offset) {
    const origin = this.readVec3(offset);
    const initRot = this.readS16Vec(offset + 0x0c);
    const animLoopType = this.readU16(offset + 0x12);
    const hasSeesaw = animLoopType === ANIM_SEESAW;
    const animPtr = this.readPtr(offset + 0x14);
    const conveyorSpeed = this.readVec3(offset + 0x18);
    const trianglesPtr = this.readPtr(offset + 0x24);
    const gridCellTrisPtr = this.readPtr(offset + 0x28);
    const gridOriginX = this.readF32(offset + 0x2c);
    const gridOriginZ = this.readF32(offset + 0x30);
    const gridStepX = this.readF32(offset + 0x34);
    const gridStepZ = this.readF32(offset + 0x38);
    const gridCellCountX = this.readS32(offset + 0x3c);
    const gridCellCountZ = this.readS32(offset + 0x40);
    const goalCount = this.readS32(offset + 0x44);
    const goalsPtr = this.readPtr(offset + 0x48);
    const bumperCount = this.readS32(offset + 0x4c);
    const bumpersPtr = this.readPtr(offset + 0x50);
    const jamabarCount = this.readS32(offset + 0x54);
    const jamabarsPtr = this.readPtr(offset + 0x58);
    const bananaCount = this.readS32(offset + 0x5c);
    const bananasPtr = this.readPtr(offset + 0x60);
    const coliConeCount = this.readS32(offset + 0x64);
    const coliConesPtr = this.readPtr(offset + 0x68);
    const coliSphereCount = this.readS32(offset + 0x6c);
    const coliSpheresPtr = this.readPtr(offset + 0x70);
    const coliCylinderCount = this.readS32(offset + 0x74);
    const coliCylindersPtr = this.readPtr(offset + 0x78);
    const falloutVolumeCount = this.readS32(offset + 0x7c);
    const falloutVolumePtr = this.readPtr(offset + 0x80);
    const reflectiveCount = this.readS32(offset + 0x84);
    const reflectivePtr = this.readPtr(offset + 0x88);
    const stageModelInstanceCount = this.readS32(offset + 0x8c);
    const stageModelInstancePtr = this.readPtr(offset + 0x90);
    const stageModelCount = this.readS32(offset + 0x94);
    const stageModelPtrB = this.readPtr(offset + 0x98);
    const animGroupId = this.readS16(offset + 0xa4);
    const switchCount = this.readS32(offset + 0xa8);
    const switchesPtr = this.readPtr(offset + 0xac);
    const seesawSensitivity = this.readF32(offset + 0xb8);
    const seesawFriction = this.readF32(offset + 0xbc);
    const seesawSpring = this.readF32(offset + 0xc0);
    const wormholeCount = this.readS32(offset + 0xc4);
    const wormholesPtr = this.readPtr(offset + 0xc8);
    const initialPlaybackState = this.readS32(offset + 0xcc);
    const loopStartSeconds = this.readF32(offset + 0xd0);
    const loopEndSeconds = this.readF32(offset + 0xd4);
    const textureScrollPtr = this.readPtr(offset + 0xd8);
    const textureScroll = this.parseTextureScroll(textureScrollPtr);

    const gridData = this.parseGridCellTris(gridCellTrisPtr, gridCellCountX, gridCellCountZ);
    const triangleCount = gridData.maxIndex + 1;
    const wormholes = this.parseWormholes(wormholesPtr, wormholeCount);
    const stageModelInstances = this.parseStageModelInstances(stageModelInstancePtr, stageModelInstanceCount);
    const stageModelNames = this.parseStageModelNames(stageModelPtrB, stageModelCount);

    return {
      origin,
      initPos: origin,
      initRot,
      animLoopType,
      hasSeesaw,
      anim: this.parseAnimHeader(animPtr),
      conveyorSpeed,
      triangles: this.parseTriangles(trianglesPtr, triangleCount),
      gridCellTris: gridData.cells,
      gridOriginX,
      gridOriginZ,
      gridStepX,
      gridStepZ,
      gridCellCountX,
      gridCellCountZ,
      goalCount,
      goals: this.parseGoals(goalsPtr, goalCount),
      bumperCount,
      bumpers: this.parseBumpers(bumpersPtr, bumperCount),
      jamabarCount,
      jamabars: this.parseJamabars(jamabarsPtr, jamabarCount),
      bananaCount,
      bananas: this.parseBananas(bananasPtr, bananaCount),
      coliConeCount,
      coliCones: this.parseCones(coliConesPtr, coliConeCount),
      coliSphereCount,
      coliSpheres: this.parseSpheres(coliSpheresPtr, coliSphereCount),
      coliCylinderCount,
      coliCylinders: this.parseCylinders(coliCylindersPtr, coliCylinderCount),
      falloutVolumeCount,
      falloutVolumes: this.parseFalloutBoxes(falloutVolumePtr, falloutVolumeCount),
      reflectiveCount,
      reflectivePtr,
      stageModelInstanceCount,
      stageModelInstancePtr,
      stageModelInstances,
      stageModelCount,
      stageModelPtrB,
      stageModelNames,
      animGroupId,
      switchCount,
      switches: this.parseSwitches(switchesPtr, switchCount),
      seesawSensitivity,
      seesawFriction,
      seesawSpring,
      wormholeCount,
      wormholes,
      initialPlaybackState,
      loopStartSeconds,
      loopEndSeconds,
      textureScroll,
    };
  }

  parseStage() {
    const animGroupCount = this.readS32(0x08);
    const animGroupsPtr = this.readPtr(0x0c);
    const startPosOffset = this.readPtr(0x10);
    const fallOutOffset = this.readPtr(0x14);
    const goalsCount = this.readS32(0x18);
    const goalsPtr = this.readPtr(0x1c);
    const bumperCount = this.readS32(0x20);
    const bumpersPtr = this.readPtr(0x24);
    const jamabarCount = this.readS32(0x28);
    const jamabarsPtr = this.readPtr(0x2c);
    const bananaCount = this.readS32(0x30);
    const bananasPtr = this.readPtr(0x34);
    const coliConeCount = this.readS32(0x38);
    const coliConesPtr = this.readPtr(0x3c);
    const coliSphereCount = this.readS32(0x40);
    const coliSpheresPtr = this.readPtr(0x44);
    const coliCylinderCount = this.readS32(0x48);
    const coliCylindersPtr = this.readPtr(0x4c);
    const falloutVolumeCount = this.readS32(0x50);
    const falloutVolumePtr = this.readPtr(0x54);
    const bgObjectCount = this.readS32(0x58);
    const bgObjectsPtr = this.readPtr(0x5c);
    const fgObjectCount = this.readS32(0x60);
    const fgObjectsPtr = this.readPtr(0x64);
    const reflectiveCount = this.readS32(0x70);
    const reflectivePtr = this.readPtr(0x74);
    const stageModelInstanceCount = this.readS32(0x84);
    const stageModelInstancePtr = this.readPtr(0x88);
    const stageModelCount = this.readS32(0x8c);
    const stageModelPtrA = this.readPtr(0x90);
    const stageModelBCount = this.readS32(0x94);
    const stageModelPtrB = this.readPtr(0x98);
    const switchCount = this.readS32(0xa8);
    const switchesPtr = this.readPtr(0xac);
    const fogAnimPtr = this.readPtr(0xb0);
    const wormholeCount = this.readS32(0xb4);
    const wormholesPtr = this.readPtr(0xb8);
    const fogPtr = this.readPtr(0xbc);
    const mystery3Ptr = this.readPtr(0xd4);

    const animGroups = [];
    const wormholeMap = new Map();
    if (animGroupsPtr !== null) {
      for (let i = 0; i < animGroupCount; i += 1) {
        const animGroup = this.parseAnimGroup(animGroupsPtr + i * STAGE2_ANIM_GROUP_SIZE);
        for (const wormhole of animGroup.wormholes) {
          wormholeMap.set(wormhole._fileOffset, wormhole);
          wormhole.animGroupIndex = i;
        }
        animGroups.push(animGroup);
      }
    }

    const stageWormholes = this.parseWormholes(wormholesPtr, wormholeCount);
    for (const wormhole of stageWormholes) {
      wormholeMap.set(wormhole._fileOffset, wormhole);
      wormhole.animGroupIndex = 0;
    }

    for (const animGroup of animGroups) {
      for (const wormhole of animGroup.wormholes) {
        if (wormhole.destOffset !== null) {
          wormhole.dest = wormholeMap.get(wormhole.destOffset) ?? null;
        }
      }
    }
    for (const wormhole of stageWormholes) {
      if (wormhole.destOffset !== null) {
        wormhole.dest = wormholeMap.get(wormhole.destOffset) ?? null;
      }
    }

    const startPositions = this.parseStartPositions(startPosOffset);
    const fallOutY = fallOutOffset !== null ? this.readF32(fallOutOffset) : 0;
    const stageModelInstances = this.parseStageModelInstances(stageModelInstancePtr, stageModelInstanceCount);
    const stageModelNames = this.parseStageModelNames(stageModelPtrB, stageModelBCount);

    return {
      format: 'smb2',
      loopStartSeconds: 0,
      loopEndSeconds: 0,
      animGroupCount,
      animGroups,
      startPositions,
      fallOutY,
      goalsCount,
      goals: this.parseGoals(goalsPtr, goalsCount),
      bumperCount,
      bumpers: this.parseBumpers(bumpersPtr, bumperCount),
      jamabarCount,
      jamabars: this.parseJamabars(jamabarsPtr, jamabarCount),
      bananaCount,
      bananas: this.parseBananas(bananasPtr, bananaCount),
      coliConeCount,
      coliCones: this.parseCones(coliConesPtr, coliConeCount),
      coliSphereCount,
      coliSpheres: this.parseSpheres(coliSpheresPtr, coliSphereCount),
      coliCylinderCount,
      coliCylinders: this.parseCylinders(coliCylindersPtr, coliCylinderCount),
      falloutVolumeCount,
      falloutVolumes: this.parseFalloutBoxes(falloutVolumePtr, falloutVolumeCount),
      bgObjectCount,
      bgObjects: this.parseBgObjects(bgObjectsPtr, bgObjectCount),
      fgObjectCount,
      fgObjects: this.parseBgObjects(fgObjectsPtr, fgObjectCount),
      reflectiveCount,
      reflectivePtr,
      stageModelInstanceCount,
      stageModelInstancePtr,
      stageModelInstances,
      stageModelCount,
      stageModelPtrA,
      stageModelBCount,
      stageModelPtrB,
      stageModelNames,
      switchCount,
      switches: this.parseSwitches(switchesPtr, switchCount),
      fogAnimPtr,
      wormholeCount,
      wormholes: stageWormholes,
      fogPtr,
      mystery3Ptr,
    };
  }
}

export class StageRuntime {
  constructor(stage, seed = stage.stageId ?? 0) {
    this.stage = stage;
    this.format = stage.format ?? 'smb1';
    this.timerFrames = 0;
    this.animGroups = [];
    this.bumpers = [];
    this.jamabars = [];
    this.goals = [];
    this.goalBags = [];
    this.goalBagsByGroup = [];
    this.goalTapes = [];
    this.goalTapesByGroup = [];
    this.bananas = [];
    this.confetti = [];
    this.confettiSpawnedGoals = new Set();
    this.effects = [];
    this.switches = [];
    this.switchesByGroup = [];
    this.switchModelBounds = null;
    this.switchPressCount = 0;
    this.wormholes = [];
    this.seesaws = [];
    this.animGroupIdMap = new Map();
    this.boundSphere = {
      pos: { x: 0, y: 0, z: 0 },
      radius: 50,
    };
    this.matrixStack = new MatrixStack();
    this.animBaseTransform = new Float32Array(12);
    this.animBasePrevTransform = new Float32Array(12);
    this.goalHoldOpen = false;
    this.switchesEnabled = true;
    this.simRng = new DeterministicRng(seed);
    this.visualRng = new DeterministicRng((seed ^ 0x9e3779b9) >>> 0);
    this.initAnimGroups();
    this.initObjects();
  }

  resetTimer() {
    this.timerFrames = 0;
  }

  initAnimGroups() {
    const count = this.stage.animGroupCount;
    this.animGroups.length = count;
    this.animGroupIdMap.clear();
    if (this.format === 'smb2') {
      for (let i = 0; i < count; i += 1) {
        const stageAg = this.stage.animGroups[i];
        const info = {
          pos: { x: stageAg.origin.x, y: stageAg.origin.y, z: stageAg.origin.z },
          prevPos: {
            x: stageAg.origin.x - stageAg.conveyorSpeed.x,
            y: stageAg.origin.y - stageAg.conveyorSpeed.y,
            z: stageAg.origin.z - stageAg.conveyorSpeed.z,
          },
          rot: { x: stageAg.initRot.x, y: stageAg.initRot.y, z: stageAg.initRot.z },
          prevRot: { x: stageAg.initRot.x, y: stageAg.initRot.y, z: stageAg.initRot.z },
          transform: new Float32Array(12),
          prevTransform: new Float32Array(12),
          animFrame: 0,
          playbackState: stageAg.initialPlaybackState ?? 0,
          seesawState: null,
        };
        this.matrixStack.fromIdentity();
        this.matrixStack.toMtx(info.transform);
        this.matrixStack.translateNeg(stageAg.conveyorSpeed);
        this.matrixStack.toMtx(info.prevTransform);
        this.animGroups[i] = info;
        if (stageAg.animGroupId !== undefined) {
          const existing = this.animGroupIdMap.get(stageAg.animGroupId);
          if (existing) {
            existing.push(i);
          } else {
            this.animGroupIdMap.set(stageAg.animGroupId, [i]);
          }
        }
        if (stageAg.hasSeesaw) {
          info.seesawState = createSeesawState(stageAg, this.matrixStack);
          this.seesaws.push(info.seesawState);
        }
      }
      return;
    }
    for (let i = 0; i < count; i += 1) {
      const stageAg = this.stage.animGroups[i];
      const info = {
        pos: { x: stageAg.initPos.x, y: stageAg.initPos.y, z: stageAg.initPos.z },
        prevPos: {
          x: stageAg.initPos.x - stageAg.unkB8.x,
          y: stageAg.initPos.y - stageAg.unkB8.y,
          z: stageAg.initPos.z - stageAg.unkB8.z,
        },
        rot: { x: stageAg.initRot.x, y: stageAg.initRot.y, z: stageAg.initRot.z },
        prevRot: { x: stageAg.initRot.x, y: stageAg.initRot.y, z: stageAg.initRot.z },
        transform: new Float32Array(12),
        prevTransform: new Float32Array(12),
      };
      this.matrixStack.fromIdentity();
      this.matrixStack.toMtx(info.transform);
      this.matrixStack.translateNeg(stageAg.unkB8);
      this.matrixStack.toMtx(info.prevTransform);
      this.animGroups[i] = info;
    }
  }

  initObjects() {
    const count = this.stage.animGroupCount;
    const stack = this.matrixStack;
    this.bumpers.length = count;
    this.jamabars.length = count;
    this.goals.length = 0;
    this.goalBags.length = 0;
    this.goalBagsByGroup.length = count;
    this.goalTapes.length = 0;
    this.goalTapesByGroup.length = count;
    this.bananas.length = 0;
    this.confetti.length = 0;
    this.effects.length = 0;
    this.switches.length = 0;
    this.switchesByGroup.length = count;
    this.wormholes.length = 0;
    for (let i = 0; i < count; i += 1) {
      this.switchesByGroup[i] = [];
    }
    for (let i = 0; i < count; i += 1) {
      const stageAg = this.stage.animGroups[i];
      const bumperStates = [];
      for (const bumper of stageAg.bumpers) {
        const basePos = { x: bumper.pos.x, y: bumper.pos.y, z: bumper.pos.z };
        const centerOffset = {
          x: BUMPER_BOUND_CENTER.x,
          y: BUMPER_BOUND_CENTER.y,
          z: BUMPER_BOUND_CENTER.z,
        };
        stack.fromIdentity();
        stack.rotateZ(bumper.rot.z);
        stack.rotateY(bumper.rot.y);
        stack.rotateX(bumper.rot.x);
        stack.tfPoint(centerOffset, centerOffset);
        const coliPos = {
          x: basePos.x + centerOffset.x,
          y: basePos.y + centerOffset.y,
          z: basePos.z + centerOffset.z,
        };
        bumperStates.push({
          animGroupId: i,
          basePos,
          pos: { x: coliPos.x, y: coliPos.y, z: coliPos.z },
          prevPos: { x: coliPos.x, y: coliPos.y, z: coliPos.z },
          rot: { x: bumper.rot.x, y: bumper.rot.y, z: bumper.rot.z },
          scale: { x: bumper.scale.x, y: bumper.scale.y, z: bumper.scale.z },
          radius: BUMPER_BOUND_RADIUS,
          modelRadius: BUMPER_MODEL_RADIUS,
          state: 0,
          spin: 0,
          spinVel: 0,
          pulseX: 1,
          pulseZ: 1,
          counter: 0,
          transform: new Float32Array(12),
        });
      }
      const jamabarStates = [];
      for (const jamabar of stageAg.jamabars) {
        jamabarStates.push({
          animGroupId: i,
          basePos: { x: jamabar.pos.x, y: jamabar.pos.y, z: jamabar.pos.z },
          pos: { x: jamabar.pos.x, y: jamabar.pos.y, z: jamabar.pos.z },
          prevPos: { x: jamabar.pos.x, y: jamabar.pos.y, z: jamabar.pos.z },
          rot: { x: jamabar.rot.x, y: jamabar.rot.y, z: jamabar.rot.z },
          scale: { x: jamabar.scale.x, y: jamabar.scale.y, z: jamabar.scale.z },
          localPos: { x: 0, y: 0, z: 0 },
          localVel: { x: 0, y: 0, z: 0 },
          radius: JAMABAR_BOUND_RADIUS,
          transform: new Float32Array(12),
        });
      }
      this.bumpers[i] = bumperStates;
      this.jamabars[i] = jamabarStates;
      const bagStates = [];
      const tapeStates = [];
      for (const goal of stageAg.goals) {
        this.goals.push({
          animGroupId: i,
          pos: { x: goal.pos.x, y: goal.pos.y, z: goal.pos.z },
          rot: { x: goal.rot.x, y: goal.rot.y, z: goal.rot.z },
          type: goal.type,
          transform: new Float32Array(12),
        });
        const tape = createGoalTapeState(goal, i, this, stack);
        this.goalTapes.push(tape);
        tapeStates.push(tape);
        const bag = createGoalBagState(goal, i, stack);
        this.goalBags.push(bag);
        bagStates.push(bag);
      }
      this.goalBagsByGroup[i] = bagStates;
      this.goalTapesByGroup[i] = tapeStates;
      for (const banana of stageAg.bananas) {
        const bananaType = banana.type & 3;
        const rotVelY = BANANA_ROT_VEL_Y[bananaType] ?? BANANA_ROT_VEL_Y[0];
        const baseScale = BANANA_BASE_SCALES[bananaType] ?? BANANA_BASE_SCALES[0];
        this.bananas.push({
          animGroupId: i,
          localPos: { x: banana.pos.x, y: banana.pos.y, z: banana.pos.z },
          prevLocalPos: { x: banana.pos.x, y: banana.pos.y, z: banana.pos.z },
          pos: { x: banana.pos.x, y: banana.pos.y, z: banana.pos.z },
          type: banana.type,
          flags: 0x22,
          cooldown: 0,
          collected: false,
          state: 2,
          collectTimer: 0,
          holdTimer: 0,
          holdOffset: { x: 0, y: 0, z: 0 },
          holdScaleTarget: 1,
          holdRotVel: 0,
          flyTimer: 0,
          flyScaleTarget: BANANA_FLY_SCALE_TARGET,
          flyStartPos: { x: banana.pos.x, y: banana.pos.y, z: banana.pos.z },
          flyStartScale: 1,
          tiltTimer: 0,
          baseScale,
          scale: 1,
          prevScale: 1,
          vel: { x: 0, y: 0, z: 0 },
          rotX: 0,
          rotY: 0,
          rotZ: 0,
          prevRotX: 0,
          prevRotY: 0,
          prevRotZ: 0,
          rotVelX: 0,
          rotVelY,
          rotVelZ: 0,
        });
      }
      if (stageAg.switches) {
        for (const stageSwitch of stageAg.switches) {
          const basePos = { x: stageSwitch.pos.x, y: stageSwitch.pos.y, z: stageSwitch.pos.z };
          const runtimeSwitch = {
            ...stageSwitch,
            animGroupIndex: i,
            basePos,
            pos: { x: basePos.x, y: basePos.y, z: basePos.z },
            prevPos: { x: basePos.x, y: basePos.y, z: basePos.z },
            localPos: { x: 0, y: 0, z: 0 },
            localVel: { x: 0, y: 0, z: 0 },
            state: 0,
            pressImpulse: false,
            triggered: false,
          };
          this.switches.push(runtimeSwitch);
          this.switchesByGroup[i].push(runtimeSwitch);
        }
      }
      if (stageAg.wormholes) {
        for (const wormhole of stageAg.wormholes) {
          this.wormholes.push(wormhole);
        }
      }
    }
    if (this.stage.wormholes) {
      for (const wormhole of this.stage.wormholes) {
        this.wormholes.push(wormhole);
      }
    }
    if (this.stage.switches) {
      for (const stageSwitch of this.stage.switches) {
        const basePos = { x: stageSwitch.pos.x, y: stageSwitch.pos.y, z: stageSwitch.pos.z };
        const runtimeSwitch = {
          ...stageSwitch,
          animGroupIndex: 0,
          basePos,
          pos: { x: basePos.x, y: basePos.y, z: basePos.z },
          prevPos: { x: basePos.x, y: basePos.y, z: basePos.z },
          localPos: { x: 0, y: 0, z: 0 },
          localVel: { x: 0, y: 0, z: 0 },
          state: 0,
          pressImpulse: false,
          triggered: false,
        };
        this.switches.push(runtimeSwitch);
        if (this.switchesByGroup[0]) {
          this.switchesByGroup[0].push(runtimeSwitch);
        }
      }
    }
    this.syncObjectTransforms();
  }

  applySwitchModelBounds(boundsByType) {
    this.switchModelBounds = boundsByType ?? null;
    if (!boundsByType) {
      return;
    }
    for (const stageSwitch of this.switches) {
      const modelBounds = boundsByType[stageSwitch.type & 7];
      if (!modelBounds) {
        continue;
      }
      stageSwitch.modelBoundCenter = {
        x: modelBounds.center.x,
        y: modelBounds.center.y,
        z: modelBounds.center.z,
      };
      stageSwitch.modelBoundRadius = modelBounds.radius;
    }
  }

  isAnimGroupInPlaybackState(animGroupId, playbackState) {
    const targetIndices = this.animGroupIdMap.get(animGroupId) ?? [animGroupId];
    for (const index of targetIndices) {
      const group = this.animGroups[index];
      if (!group || (group.playbackState & 7) !== playbackState) {
        return false;
      }
    }
    return true;
  }

  applySwitchPlayback(stageSwitch, countSound = true) {
    const nextState = stageSwitch.type & 7;
    if (countSound && stageSwitch.state < 2) {
      this.switchPressCount = (this.switchPressCount ?? 0) + 1;
    }
    const targetIndices = this.animGroupIdMap.get(stageSwitch.animGroupId)
      ?? [stageSwitch.animGroupId];
    for (const targetIndex of targetIndices) {
      const targetInfo = this.animGroups[targetIndex];
      const targetAg = this.stage.animGroups[targetIndex];
      if (!targetInfo || !targetAg) {
        continue;
      }
      const prevState = targetInfo.playbackState & 7;
      if (targetAg.animLoopType === ANIM_PLAY_ONCE && prevState === 1 && (nextState === 0 || nextState === 3)) {
        targetInfo.animFrame = Math.trunc((targetAg.loopStartSeconds ?? 0) * 60);
      }
      targetInfo.playbackState = (targetInfo.playbackState & ~7) | nextState;
      if (nextState === 1) {
        targetInfo.prevTransform.set(targetInfo.transform);
      }
    }
  }

  advance(
    frameDelta,
    paused,
    world,
    animTimerOverride = null,
    smb2LoadInFrames = null,
    ball = null,
    camera = null,
    includeVisuals = true,
  ) {
    if (paused) {
      return;
    }
    if (animTimerOverride !== null) {
      this.timerFrames = animTimerOverride;
    } else {
      this.timerFrames += frameDelta;
    }
    if (this.format === 'smb2') {
      this.updateSwitchesSmb2PreAnim();
    }
    this.updateAnimGroups(this.timerFrames / 60, frameDelta, smb2LoadInFrames);
    if (world) {
      this.updateObjects(world, ball, camera, includeVisuals);
    }
  }

  getState({ includeVisual = true } = {}) {
    const num = (value, fallback = 0) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    };
    const cloneVec3 = (value) => ({
      x: num(value?.x),
      y: num(value?.y),
      z: num(value?.z),
    });
    const cloneMat12 = (value, identityFallback = false) => {
      const out = new Float32Array(12);
      if (value) {
        const src = value as any;
        for (let i = 0; i < 12; i += 1) {
          out[i] = num(src[i]);
        }
      }
      if (
        identityFallback
        && out[0] === 0 && out[1] === 0 && out[2] === 0
        && out[4] === 0 && out[5] === 0 && out[6] === 0
        && out[8] === 0 && out[9] === 0 && out[10] === 0
      ) {
        out[0] = 1;
        out[5] = 1;
        out[10] = 1;
      }
      return out;
    };
    const animGroups = this.animGroups.map((group) => {
      const out: any = {
        pos: cloneVec3(group.pos),
        prevPos: cloneVec3(group.prevPos),
        rot: cloneVec3(group.rot),
        prevRot: cloneVec3(group.prevRot),
        transform: cloneMat12(group.transform, true),
        prevTransform: cloneMat12(group.prevTransform, true),
      };
      if (group.animFrame !== undefined) {
        out.animFrame = num(group.animFrame);
      }
      if (group.playbackState !== undefined) {
        out.playbackState = num(group.playbackState) | 0;
      }
      if (group.seesawState) {
        out.seesawState = {
          angle: num(group.seesawState.angle),
          prevAngle: num(group.seesawState.prevAngle),
          angleVel: num(group.seesawState.angleVel),
        };
      }
      return out;
    });
    const bumpers = this.bumpers.map((group) => group.map((bumper) => ({
      pos: cloneVec3(bumper.pos),
      prevPos: cloneVec3(bumper.prevPos),
      state: num(bumper.state) | 0,
      spin: num(bumper.spin) | 0,
      spinVel: num(bumper.spinVel) | 0,
      pulseX: num(bumper.pulseX, 1),
      pulseZ: num(bumper.pulseZ, 1),
      counter: num(bumper.counter) | 0,
    })));
    const jamabars = this.jamabars.map((group) => group.map((jamabar) => ({
      pos: cloneVec3(jamabar.pos),
      prevPos: cloneVec3(jamabar.prevPos),
      localPos: cloneVec3(jamabar.localPos),
      localVel: cloneVec3(jamabar.localVel),
    })));
    const goalBags = this.goalBags.map((bag) => ({
      state: num(bag.state) | 0,
      counter: num(bag.counter) | 0,
      flags: num(bag.flags) | 0,
      openness: num(bag.openness),
      prevOpenness: num(bag.prevOpenness),
      unk8: num(bag.unk8),
      openFrame: num(bag.openFrame) | 0,
      rotX: num(bag.rotX) | 0,
      rotY: num(bag.rotY) | 0,
      rotZ: num(bag.rotZ) | 0,
      prevRotX: num(bag.prevRotX) | 0,
      prevRotY: num(bag.prevRotY) | 0,
      prevRotZ: num(bag.prevRotZ) | 0,
      uSomePos: cloneVec3(bag.uSomePos),
      localPos: cloneVec3(bag.localPos),
      localVel: cloneVec3(bag.localVel),
      modelOrigin: cloneVec3(bag.modelOrigin),
      boundSphereRadius: num(bag.boundSphereRadius),
      position: cloneVec3(bag.position),
      prevPos: cloneVec3(bag.prevPos),
    }));
    const goalTapes = this.goalTapes.map((tape) => ({
      flags: num(tape.flags) | 0,
      breakFrame: num(tape.breakFrame) | 0,
      groundY: num(tape.groundY),
      anchorY: num(tape.anchorY),
      targetY: num(tape.targetY),
      points: Array.isArray(tape.points) ? tape.points.map((point) => ({
        pos: cloneVec3(point.pos),
        prevPos: cloneVec3(point.prevPos),
        normal: cloneVec3(point.normal),
        prevNormal: cloneVec3(point.prevNormal),
        vel: cloneVec3(point.vel),
        flags: num(point.flags) | 0,
        len: num(point.len),
      })) : [],
    }));
    const bananas = this.bananas.map((banana) => ({
      localPos: cloneVec3(banana.localPos),
      prevLocalPos: cloneVec3(banana.prevLocalPos),
      pos: cloneVec3(banana.pos),
      flags: num(banana.flags) | 0,
      cooldown: num(banana.cooldown) | 0,
      collected: !!banana.collected,
      state: num(banana.state) | 0,
      collectTimer: num(banana.collectTimer) | 0,
      holdTimer: num(banana.holdTimer) | 0,
      holdOffset: cloneVec3(banana.holdOffset),
      holdScaleTarget: num(banana.holdScaleTarget),
      holdRotVel: num(banana.holdRotVel) | 0,
      flyTimer: num(banana.flyTimer) | 0,
      flyScaleTarget: num(banana.flyScaleTarget),
      flyStartPos: cloneVec3(banana.flyStartPos),
      flyStartScale: num(banana.flyStartScale),
      tiltTimer: num(banana.tiltTimer) | 0,
      scale: num(banana.scale, 1),
      prevScale: num(banana.prevScale, 1),
      vel: cloneVec3(banana.vel),
      rotX: num(banana.rotX) | 0,
      rotY: num(banana.rotY) | 0,
      rotZ: num(banana.rotZ) | 0,
      prevRotX: num(banana.prevRotX) | 0,
      prevRotY: num(banana.prevRotY) | 0,
      prevRotZ: num(banana.prevRotZ) | 0,
      rotVelX: num(banana.rotVelX) | 0,
      rotVelY: num(banana.rotVelY) | 0,
      rotVelZ: num(banana.rotVelZ) | 0,
    }));
    const switches = this.switches.map((stageSwitch) => ({
      pos: cloneVec3(stageSwitch.pos),
      prevPos: cloneVec3(stageSwitch.prevPos),
      localPos: cloneVec3(stageSwitch.localPos),
      localVel: cloneVec3(stageSwitch.localVel),
      state: num(stageSwitch.state) | 0,
      pressImpulse: !!stageSwitch.pressImpulse,
      triggered: !!stageSwitch.triggered,
      cooldown: num(stageSwitch.cooldown) | 0,
    }));
    const visualState = includeVisual
      ? {
        confetti: structuredClone(this.confetti),
        effects: structuredClone(this.effects),
        visualRngState: this.visualRng?.state ?? 0,
      }
      : {};
    return {
      timerFrames: this.timerFrames,
      animGroups,
      bumpers,
      jamabars,
      goalBags,
      goalTapes,
      bananas,
      switches,
      switchPressCount: this.switchPressCount ?? 0,
      goalHoldOpen: this.goalHoldOpen,
      switchesEnabled: this.switchesEnabled,
      simRngState: this.simRng?.state ?? 0,
      ...visualState,
    };
  }

  setState(state) {
    if (!state) {
      return;
    }
    const num = (value, fallback = 0) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    };
    const copyVec3 = (target, source) => {
      if (!target || !source) {
        return;
      }
      target.x = num(source.x, target.x ?? 0);
      target.y = num(source.y, target.y ?? 0);
      target.z = num(source.z, target.z ?? 0);
    };
    const copyMat12 = (target, source, identityFallback = false) => {
      if (!source) {
        return target;
      }
      const dest = target instanceof Float32Array && target.length === 12
        ? target
        : new Float32Array(12);
      const src = source as any;
      for (let i = 0; i < 12; i += 1) {
        dest[i] = num(src[i]);
      }
      if (
        identityFallback
        && dest[0] === 0 && dest[1] === 0 && dest[2] === 0
        && dest[4] === 0 && dest[5] === 0 && dest[6] === 0
        && dest[8] === 0 && dest[9] === 0 && dest[10] === 0
      ) {
        dest[0] = 1;
        dest[5] = 1;
        dest[10] = 1;
      }
      return dest;
    };

    this.timerFrames = num(state.timerFrames, this.timerFrames ?? 0);

    const srcAnimGroups = Array.isArray(state.animGroups) ? state.animGroups : [];
    const animCount = Math.min(this.animGroups.length, srcAnimGroups.length);
    for (let i = 0; i < animCount; i += 1) {
      const target = this.animGroups[i];
      const source = srcAnimGroups[i];
      if (!target || !source) {
        continue;
      }
      copyVec3(target.pos, source.pos);
      copyVec3(target.prevPos, source.prevPos);
      copyVec3(target.rot, source.rot);
      copyVec3(target.prevRot, source.prevRot);
      target.transform = copyMat12(target.transform, source.transform, true);
      target.prevTransform = copyMat12(target.prevTransform, source.prevTransform, true);
      if (source.animFrame !== undefined) {
        target.animFrame = num(source.animFrame, target.animFrame ?? 0);
      }
      if (source.playbackState !== undefined) {
        target.playbackState = num(source.playbackState, target.playbackState ?? 0) | 0;
      }
      if (target.seesawState && source.seesawState) {
        target.seesawState.angle = num(source.seesawState.angle, target.seesawState.angle ?? 0);
        target.seesawState.prevAngle = num(source.seesawState.prevAngle, target.seesawState.prevAngle ?? 0);
        target.seesawState.angleVel = num(source.seesawState.angleVel, target.seesawState.angleVel ?? 0);
        if (source.seesawState.transform) {
          target.seesawState.transform = copyMat12(
            target.seesawState.transform,
            source.seesawState.transform,
            true,
          );
        }
        if (source.seesawState.invTransform) {
          target.seesawState.invTransform = copyMat12(
            target.seesawState.invTransform,
            source.seesawState.invTransform,
            true,
          );
        }
      }
    }

    const srcBumpers = Array.isArray(state.bumpers) ? state.bumpers : [];
    const bumperGroupCount = Math.min(this.bumpers.length, srcBumpers.length);
    for (let groupIndex = 0; groupIndex < bumperGroupCount; groupIndex += 1) {
      const targetGroup = this.bumpers[groupIndex] ?? [];
      const sourceGroup = Array.isArray(srcBumpers[groupIndex]) ? srcBumpers[groupIndex] : [];
      const bumperCount = Math.min(targetGroup.length, sourceGroup.length);
      for (let i = 0; i < bumperCount; i += 1) {
        const target = targetGroup[i];
        const source = sourceGroup[i];
        if (!target || !source) {
          continue;
        }
        copyVec3(target.pos, source.pos);
        copyVec3(target.prevPos, source.prevPos);
        target.state = num(source.state, target.state ?? 0) | 0;
        target.spin = num(source.spin, target.spin ?? 0) | 0;
        target.spinVel = num(source.spinVel, target.spinVel ?? 0) | 0;
        target.pulseX = num(source.pulseX, target.pulseX ?? 1);
        target.pulseZ = num(source.pulseZ, target.pulseZ ?? 1);
        target.counter = num(source.counter, target.counter ?? 0) | 0;
      }
    }

    const srcJamabars = Array.isArray(state.jamabars) ? state.jamabars : [];
    const jamabarGroupCount = Math.min(this.jamabars.length, srcJamabars.length);
    for (let groupIndex = 0; groupIndex < jamabarGroupCount; groupIndex += 1) {
      const targetGroup = this.jamabars[groupIndex] ?? [];
      const sourceGroup = Array.isArray(srcJamabars[groupIndex]) ? srcJamabars[groupIndex] : [];
      const jamabarCount = Math.min(targetGroup.length, sourceGroup.length);
      for (let i = 0; i < jamabarCount; i += 1) {
        const target = targetGroup[i];
        const source = sourceGroup[i];
        if (!target || !source) {
          continue;
        }
        copyVec3(target.pos, source.pos);
        copyVec3(target.prevPos, source.prevPos);
        copyVec3(target.localPos, source.localPos);
        copyVec3(target.localVel, source.localVel);
      }
    }

    const srcGoalBags = Array.isArray(state.goalBags) ? state.goalBags : [];
    const goalBagCount = Math.min(this.goalBags.length, srcGoalBags.length);
    for (let i = 0; i < goalBagCount; i += 1) {
      const target = this.goalBags[i];
      const source = srcGoalBags[i];
      if (!target || !source) {
        continue;
      }
      target.state = num(source.state, target.state ?? 0) | 0;
      target.counter = num(source.counter, target.counter ?? 0) | 0;
      target.flags = num(source.flags, target.flags ?? 0) | 0;
      target.openness = num(source.openness, target.openness ?? 0);
      target.prevOpenness = num(source.prevOpenness, target.prevOpenness ?? 0);
      target.unk8 = num(source.unk8, target.unk8 ?? 0);
      target.openFrame = num(source.openFrame, target.openFrame ?? -1) | 0;
      target.rotX = num(source.rotX, target.rotX ?? 0) | 0;
      target.rotY = num(source.rotY, target.rotY ?? 0) | 0;
      target.rotZ = num(source.rotZ, target.rotZ ?? 0) | 0;
      target.prevRotX = num(source.prevRotX, target.prevRotX ?? 0) | 0;
      target.prevRotY = num(source.prevRotY, target.prevRotY ?? 0) | 0;
      target.prevRotZ = num(source.prevRotZ, target.prevRotZ ?? 0) | 0;
      target.boundSphereRadius = num(source.boundSphereRadius, target.boundSphereRadius ?? GOAL_BAG_BASE_RADIUS);
      copyVec3(target.uSomePos, source.uSomePos);
      copyVec3(target.localPos, source.localPos);
      copyVec3(target.localVel, source.localVel);
      copyVec3(target.modelOrigin, source.modelOrigin);
      copyVec3(target.position, source.position);
      copyVec3(target.prevPos, source.prevPos);
    }

    const srcGoalTapes = Array.isArray(state.goalTapes) ? state.goalTapes : [];
    const goalTapeCount = Math.min(this.goalTapes.length, srcGoalTapes.length);
    for (let i = 0; i < goalTapeCount; i += 1) {
      const target = this.goalTapes[i];
      const source = srcGoalTapes[i];
      if (!target || !source) {
        continue;
      }
      target.flags = num(source.flags, target.flags ?? 0) | 0;
      target.breakFrame = num(source.breakFrame, target.breakFrame ?? -1) | 0;
      target.groundY = num(source.groundY, target.groundY ?? GOAL_TAPE_GROUND_OFFSET);
      target.anchorY = num(source.anchorY, target.anchorY ?? GOAL_TAPE_ANCHOR_Y);
      target.targetY = num(source.targetY, target.targetY ?? target.anchorY ?? GOAL_TAPE_ANCHOR_Y);
      const sourcePoints = Array.isArray(source.points) ? source.points : [];
      const pointCount = Math.min(target.points?.length ?? 0, sourcePoints.length);
      for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
        const targetPoint = target.points[pointIndex];
        const sourcePoint = sourcePoints[pointIndex];
        if (!targetPoint || !sourcePoint) {
          continue;
        }
        copyVec3(targetPoint.pos, sourcePoint.pos);
        copyVec3(targetPoint.prevPos, sourcePoint.prevPos);
        copyVec3(targetPoint.normal, sourcePoint.normal);
        copyVec3(targetPoint.prevNormal, sourcePoint.prevNormal);
        copyVec3(targetPoint.vel, sourcePoint.vel);
        targetPoint.flags = num(sourcePoint.flags, targetPoint.flags ?? 0) | 0;
        if (sourcePoint.len !== undefined) {
          targetPoint.len = num(sourcePoint.len, targetPoint.len ?? GOAL_TAPE_SEGMENT_LEN);
        }
      }
    }

    const srcBananas = Array.isArray(state.bananas) ? state.bananas : [];
    const bananaCount = Math.min(this.bananas.length, srcBananas.length);
    for (let i = 0; i < bananaCount; i += 1) {
      const target = this.bananas[i];
      const source = srcBananas[i];
      if (!target || !source) {
        continue;
      }
      copyVec3(target.localPos, source.localPos);
      copyVec3(target.prevLocalPos, source.prevLocalPos);
      copyVec3(target.pos, source.pos);
      target.flags = num(source.flags, target.flags ?? 0) | 0;
      target.cooldown = num(source.cooldown, target.cooldown ?? 0) | 0;
      target.collected = !!source.collected;
      target.state = num(source.state, target.state ?? 0) | 0;
      target.collectTimer = num(source.collectTimer, target.collectTimer ?? 0) | 0;
      target.holdTimer = num(source.holdTimer, target.holdTimer ?? 0) | 0;
      copyVec3(target.holdOffset, source.holdOffset);
      target.holdScaleTarget = num(source.holdScaleTarget, target.holdScaleTarget ?? 1);
      target.holdRotVel = num(source.holdRotVel, target.holdRotVel ?? 0) | 0;
      target.flyTimer = num(source.flyTimer, target.flyTimer ?? 0) | 0;
      target.flyScaleTarget = num(source.flyScaleTarget, target.flyScaleTarget ?? BANANA_FLY_SCALE_TARGET);
      copyVec3(target.flyStartPos, source.flyStartPos);
      target.flyStartScale = num(source.flyStartScale, target.flyStartScale ?? 1);
      target.tiltTimer = num(source.tiltTimer, target.tiltTimer ?? 0) | 0;
      target.scale = num(source.scale, target.scale ?? 1);
      target.prevScale = num(source.prevScale, target.prevScale ?? 1);
      copyVec3(target.vel, source.vel);
      target.rotX = num(source.rotX, target.rotX ?? 0) | 0;
      target.rotY = num(source.rotY, target.rotY ?? 0) | 0;
      target.rotZ = num(source.rotZ, target.rotZ ?? 0) | 0;
      target.prevRotX = num(source.prevRotX, target.prevRotX ?? 0) | 0;
      target.prevRotY = num(source.prevRotY, target.prevRotY ?? 0) | 0;
      target.prevRotZ = num(source.prevRotZ, target.prevRotZ ?? 0) | 0;
      target.rotVelX = num(source.rotVelX, target.rotVelX ?? 0) | 0;
      target.rotVelY = num(source.rotVelY, target.rotVelY ?? 0) | 0;
      target.rotVelZ = num(source.rotVelZ, target.rotVelZ ?? 0) | 0;
    }

    const srcSwitches = Array.isArray(state.switches) ? state.switches : [];
    const switchCount = Math.min(this.switches.length, srcSwitches.length);
    for (let i = 0; i < switchCount; i += 1) {
      const target = this.switches[i];
      const source = srcSwitches[i];
      if (!target || !source) {
        continue;
      }
      copyVec3(target.pos, source.pos);
      copyVec3(target.prevPos, source.prevPos);
      copyVec3(target.localPos, source.localPos);
      copyVec3(target.localVel, source.localVel);
      target.state = num(source.state, target.state ?? 0) | 0;
      target.pressImpulse = !!source.pressImpulse;
      target.triggered = !!source.triggered;
      target.cooldown = num(source.cooldown, target.cooldown ?? 0) | 0;
    }

    if (Array.isArray(state.confetti)) {
      this.confetti = structuredClone(state.confetti);
    }
    if (Array.isArray(state.effects)) {
      this.effects = structuredClone(state.effects);
    }

    this.switchPressCount = num(state.switchPressCount, this.switchPressCount ?? 0) | 0;
    if (state.goalHoldOpen !== undefined) {
      this.goalHoldOpen = !!state.goalHoldOpen;
    }
    if (state.switchesEnabled !== undefined) {
      this.switchesEnabled = !!state.switchesEnabled;
    }

    if (this.simRng && state.simRngState !== undefined) {
      this.simRng.state = num(state.simRngState, this.simRng.state);
    }
    if (this.visualRng && state.visualRngState !== undefined) {
      this.visualRng.state = num(state.visualRngState, this.visualRng.state);
    }

    this.seesaws.length = 0;
    for (const group of this.animGroups) {
      if (group?.seesawState) {
        this.seesaws.push(group.seesawState);
      }
    }
  }

  updateSwitchesSmb2PreAnim() {
    const stack = this.matrixStack;
    for (const stageSwitch of this.switches) {
      stageSwitch.prevPos.x = stageSwitch.pos.x;
      stageSwitch.prevPos.y = stageSwitch.pos.y;
      stageSwitch.prevPos.z = stageSwitch.pos.z;
      const playbackState = stageSwitch.type & 7;
      const groupMatches = this.isAnimGroupInPlaybackState(stageSwitch.animGroupId, playbackState);
      if (stageSwitch.state === 2) {
        stageSwitch.state = 3;
      }
      if (stageSwitch.state < 2) {
        if (stageSwitch.state === 0) {
          stageSwitch.state = 1;
          stageSwitch.pressImpulse = false;
          stageSwitch.triggered = false;
        }
        stageSwitch.localVel.y += -stageSwitch.localPos.y * 0.1;
        stageSwitch.localVel.y *= 0.95;
        stageSwitch.localPos.y += stageSwitch.localVel.y;
        if (stageSwitch.localPos.y < -0.1) {
          stageSwitch.localPos.y = -0.1;
          if (stageSwitch.localVel.y < 0) {
            stageSwitch.localVel.y *= -0.8;
          }
        } else if (stageSwitch.localPos.y > 0.1) {
          stageSwitch.localPos.y = 0.1;
          if (stageSwitch.localVel.y > 0) {
            stageSwitch.localVel.y *= -0.8;
          }
        }
        if (groupMatches) {
          stageSwitch.state = 2;
          if (!stageSwitch.triggered) {
            this.applySwitchPlayback(stageSwitch, false);
            stageSwitch.triggered = true;
          }
        }
        if (stageSwitch.pressImpulse && stageSwitch.localPos.y < -0.025) {
          stageSwitch.state = 2;
          if (!stageSwitch.triggered) {
            this.switchPressCount = (this.switchPressCount ?? 0) + 1;
            this.applySwitchPlayback(stageSwitch, false);
            stageSwitch.triggered = true;
          }
        }
      } else if (!groupMatches) {
        stageSwitch.state = 0;
      }
      if (stageSwitch.state >= 2) {
        stageSwitch.localVel.y += (-0.1 - stageSwitch.localPos.y) * 0.1;
        stageSwitch.localVel.y *= 0.9;
        stageSwitch.localPos.y += stageSwitch.localVel.y;
        if (stageSwitch.localPos.y < -0.1) {
          stageSwitch.localPos.y = -0.1;
          if (stageSwitch.localVel.y < 0) {
            stageSwitch.localVel.y *= -0.8;
          }
        } else if (stageSwitch.localPos.y > 0) {
          stageSwitch.localPos.y = 0;
          if (stageSwitch.localVel.y > 0) {
            stageSwitch.localVel.y *= -0.8;
          }
        }
      }
      stack.fromIdentity();
      stack.rotateZ(stageSwitch.rot.z);
      stack.rotateY(stageSwitch.rot.y);
      stack.rotateX(stageSwitch.rot.x);
      const localPos = {
        x: stageSwitch.localPos.x,
        y: stageSwitch.localPos.y,
        z: stageSwitch.localPos.z,
      };
      stack.tfPoint(localPos, localPos);
      stageSwitch.pos.x = stageSwitch.basePos.x + localPos.x;
      stageSwitch.pos.y = stageSwitch.basePos.y + localPos.y;
      stageSwitch.pos.z = stageSwitch.basePos.z + localPos.z;
    }
  }

  updateAnimGroups(timeSeconds, frameDelta = 1, smb2LoadInFrames = null) {
    const stage = this.stage;
    if (this.format === 'smb2') {
      this.updateAnimGroupsSmb2(frameDelta, smb2LoadInFrames);
      return;
    }
    const loopSpan = stage.loopEndSeconds - stage.loopStartSeconds;
    let animTime = timeSeconds + stage.loopStartSeconds;
    if (loopSpan > 0) {
      animTime -= loopSpan * floor(animTime / loopSpan);
      animTime += stage.loopStartSeconds;
    }

    for (let i = 0; i < stage.animGroupCount; i += 1) {
      const stageAg = stage.animGroups[i];
      const info = this.animGroups[i];
      const anim = stageAg.anim;

      if (anim) {
        if (anim.rotXKeyframes) {
          info.prevRot.x = info.rot.x;
          info.rot.x = degToS16(interpolateKeyframes(anim.rotXKeyframeCount, anim.rotXKeyframes, animTime));
        }
        if (anim.rotYKeyframes) {
          info.prevRot.y = info.rot.y;
          info.rot.y = degToS16(interpolateKeyframes(anim.rotYKeyframeCount, anim.rotYKeyframes, animTime));
        }
        if (anim.rotZKeyframes) {
          info.prevRot.z = info.rot.z;
          info.rot.z = degToS16(interpolateKeyframes(anim.rotZKeyframeCount, anim.rotZKeyframes, animTime));
        }
        if (anim.posXKeyframes) {
          info.prevPos.x = info.pos.x - stageAg.unkB8.x;
          info.pos.x = interpolateKeyframes(anim.posXKeyframeCount, anim.posXKeyframes, animTime);
        }
        if (anim.posYKeyframes) {
          info.prevPos.y = info.pos.y - stageAg.unkB8.y;
          info.pos.y = interpolateKeyframes(anim.posYKeyframeCount, anim.posYKeyframes, animTime);
        }
        if (anim.posZKeyframes) {
          info.prevPos.z = info.pos.z - stageAg.unkB8.z;
          info.pos.z = interpolateKeyframes(anim.posZKeyframeCount, anim.posZKeyframes, animTime);
        }
      }

      this.matrixStack.fromTranslate(info.pos);
      this.matrixStack.rotateZ(info.rot.z);
      this.matrixStack.rotateY(info.rot.y);
      this.matrixStack.rotateX(info.rot.x - stageAg.initRot.x);
      this.matrixStack.rotateY(-stageAg.initRot.y);
      this.matrixStack.rotateZ(-stageAg.initRot.z);
      this.matrixStack.translateNeg(stageAg.initPos);
      this.matrixStack.toMtx(info.transform);

      this.matrixStack.fromTranslate(info.prevPos);
      this.matrixStack.rotateZ(info.prevRot.z);
      this.matrixStack.rotateY(info.prevRot.y);
      this.matrixStack.rotateX(info.prevRot.x - stageAg.initRot.x);
      this.matrixStack.rotateY(-stageAg.initRot.y);
      this.matrixStack.rotateZ(-stageAg.initRot.z);
      this.matrixStack.translateNeg(stageAg.initPos);
      this.matrixStack.toMtx(info.prevTransform);
    }
  }

  updateAnimGroupsSmb2(frameDelta, smb2LoadInFrames = null) {
    const stage = this.stage;
    const stack = this.matrixStack;
    for (let i = 0; i < stage.animGroupCount; i += 1) {
      const stageAg = stage.animGroups[i];
      const info = this.animGroups[i];
      const anim = stageAg.anim;
      const playbackState = info.playbackState & 7;
      let animTime = null;

      if (smb2LoadInFrames !== null && smb2LoadInFrames >= 0 && smb2LoadInFrames <= SMB2_STAGE_LOADIN_FRAMES) {
        if (playbackState === 1) {
          animTime = 0;
        } else {
          let animFrame = SMB2_STAGE_LOADIN_FRAMES - smb2LoadInFrames;
          animTime = animFrame / 60;
          if (playbackState === 3) {
            animTime *= 2;
            animFrame <<= 1;
          } else if (playbackState === 2) {
            animTime = -animTime;
          } else if (playbackState === 4) {
            animTime *= -2;
            animFrame *= -2;
          }
          info.animFrame = animFrame;
        }
      }

      if (animTime === null && anim) {
        let delta = 0;
        if (playbackState === 0) delta = frameDelta;
        else if (playbackState === 2) delta = -frameDelta;
        else if (playbackState === 3) delta = frameDelta * 2;
        else if (playbackState === 4) delta = -frameDelta * 2;
        info.animFrame += delta;

        if (stageAg.animLoopType === ANIM_PLAY_ONCE) {
          const startFrame = Math.trunc((stageAg.loopStartSeconds ?? 0) * 60);
          const endFrame = Math.trunc((stageAg.loopEndSeconds ?? 0) * 60);
          if (delta < 0 && info.animFrame < startFrame) {
            info.animFrame = startFrame;
            info.playbackState = (info.playbackState & ~7) | 1;
          } else if (delta > 0 && info.animFrame > endFrame) {
            info.animFrame = endFrame;
            info.playbackState = (info.playbackState & ~7) | 1;
          }
        }
      }

      if (animTime === null) {
        animTime = info.animFrame / 60;
      }
      if (stageAg.animLoopType === ANIM_LOOP || stageAg.animLoopType === ANIM_SEESAW) {
        const loopSpan = stageAg.loopEndSeconds - stageAg.loopStartSeconds;
        if (loopSpan > 0) {
          animTime -= loopSpan * Math.trunc(animTime / loopSpan);
          animTime += stageAg.loopStartSeconds;
        }
      }

      info.prevPos.x = info.pos.x - stageAg.conveyorSpeed.x;
      info.prevPos.y = info.pos.y - stageAg.conveyorSpeed.y;
      info.prevPos.z = info.pos.z - stageAg.conveyorSpeed.z;

      if (anim) {
        if (anim.rotXKeyframes) {
          info.prevRot.x = info.rot.x;
          info.rot.x = degToS16(interpolateKeyframes(anim.rotXKeyframeCount, anim.rotXKeyframes, animTime));
        }
        if (anim.rotYKeyframes) {
          info.prevRot.y = info.rot.y;
          info.rot.y = degToS16(interpolateKeyframes(anim.rotYKeyframeCount, anim.rotYKeyframes, animTime));
        }
        if (anim.rotZKeyframes) {
          info.prevRot.z = info.rot.z;
          info.rot.z = degToS16(interpolateKeyframes(anim.rotZKeyframeCount, anim.rotZKeyframes, animTime));
        }
        if (anim.posXKeyframes) {
          info.pos.x = interpolateKeyframes(anim.posXKeyframeCount, anim.posXKeyframes, animTime);
        }
        if (anim.posYKeyframes) {
          info.pos.y = interpolateKeyframes(anim.posYKeyframeCount, anim.posYKeyframes, animTime);
        }
        if (anim.posZKeyframes) {
          info.pos.z = interpolateKeyframes(anim.posZKeyframeCount, anim.posZKeyframes, animTime);
        }
      }

      const baseTransform = this.animBaseTransform;
      const basePrevTransform = this.animBasePrevTransform;

      stack.fromTranslate(info.pos);
      stack.rotateZ(info.rot.z);
      stack.rotateY(info.rot.y);
      stack.rotateX(info.rot.x - stageAg.initRot.x);
      stack.rotateY(-stageAg.initRot.y);
      stack.rotateZ(-stageAg.initRot.z);
      stack.translateNeg(stageAg.origin);
      stack.toMtx(baseTransform);

      stack.fromTranslate(info.prevPos);
      stack.rotateZ(info.prevRot.z);
      stack.rotateY(info.prevRot.y);
      stack.rotateX(info.prevRot.x - stageAg.initRot.x);
      stack.rotateY(-stageAg.initRot.y);
      stack.rotateZ(-stageAg.initRot.z);
      stack.translateNeg(stageAg.origin);
      stack.toMtx(basePrevTransform);

      if (info.seesawState) {
        tickSeesawState(info.seesawState);
        stack.fromMtx(baseTransform);
        stack.multRight(info.seesawState.transform);
        stack.rotateZ(toS16(info.seesawState.angle));
        stack.multRight(info.seesawState.invTransform);
        stack.toMtx(info.transform);

        stack.fromMtx(basePrevTransform);
        stack.multRight(info.seesawState.transform);
        stack.rotateZ(toS16(info.seesawState.prevAngle));
        stack.multRight(info.seesawState.invTransform);
        stack.toMtx(info.prevTransform);
      } else {
        info.transform.set(baseTransform);
        info.prevTransform.set(basePrevTransform);
      }
    }
  }

  updateObjects(world, ball = null, camera = null, includeVisuals = true) {
    const animGroups = this.animGroups;
    const gravity = world.gravity ?? { x: 0, y: -1, z: 0 };
    const stack = this.matrixStack;
    const ballWorldPos = ball ? { x: ball.pos.x, y: ball.pos.y, z: ball.pos.z } : null;
    const ballLocalByGroup = ball ? new Array(animGroups.length) : null;
    let flyTargetWorld = null;
    const getBallLocalPos = (groupId) => {
      if (!ballLocalByGroup || !ballWorldPos) {
        return null;
      }
      if (ballLocalByGroup[groupId]) {
        return ballLocalByGroup[groupId];
      }
      const localPos = { x: ballWorldPos.x, y: ballWorldPos.y, z: ballWorldPos.z };
      if (groupId !== 0 && animGroups[groupId]) {
        stack.fromMtx(animGroups[groupId].transform);
        stack.rigidInvTfPoint(localPos, localPos);
      }
      ballLocalByGroup[groupId] = localPos;
      return localPos;
    };
    if (camera) {
      const fov2 = BANANA_FOV_TAN * 2;
      flyTargetWorld = {
        x: BANANA_HUD_TARGET_X * fov2,
        y: BANANA_HUD_TARGET_Y * fov2,
        z: BANANA_HUD_TARGET_Z,
      };
      stack.fromTranslate(camera.eye);
      stack.rotateY(camera.rotY);
      stack.rotateX(camera.rotX);
      stack.rotateZ(camera.rotZ);
      stack.tfPoint(flyTargetWorld, flyTargetWorld);
    }
    for (const tape of this.goalTapes) {
      updateGoalTape(tape, animGroups, gravity, stack);
    }
    for (const bag of this.goalBags) {
      updateGoalBag(bag, animGroups, gravity, this.goalHoldOpen, stack, this.simRng);
    }
    if (includeVisuals) {
      updateConfetti(this, gravity);
      updateBallEffects(this.effects, gravity, this, this.visualRng);
    }
    for (let i = 0; i < animGroups.length; i += 1) {
      const bumperStates = this.bumpers[i];
      for (const bumper of bumperStates) {
        bumper.prevPos.x = bumper.pos.x;
        bumper.prevPos.y = bumper.pos.y;
        bumper.prevPos.z = bumper.pos.z;
        if (bumper.state === 0) {
          bumper.spinVel += (0x100 - bumper.spinVel) >> 6;
          if (bumper.pulseX > 1) {
            bumper.pulseX -= 0.06666666666666667;
            if (bumper.pulseX < 1) {
              bumper.pulseX = 1;
            }
          }
          bumper.pulseZ = bumper.pulseX;
        } else if (bumper.state === 1) {
          bumper.state = 2;
          bumper.counter = 7;
        }
        if (bumper.state === 2) {
          bumper.counter -= 1;
          if (bumper.counter < 0) {
            bumper.state = 0;
          }
          bumper.spinVel += 0x100;
          bumper.pulseX += 0.5 * (2.0 - bumper.pulseX);
          bumper.pulseZ = bumper.pulseX;
        }
        bumper.spin = toS16(bumper.spin + bumper.spinVel);
      }
      const jamabarStates = this.jamabars[i];
      for (const jamabar of jamabarStates) {
        jamabar.prevPos.x = jamabar.pos.x;
        jamabar.prevPos.y = jamabar.pos.y;
        jamabar.prevPos.z = jamabar.pos.z;

        stack.fromTranslate(jamabar.basePos);
        stack.rotateZ(jamabar.rot.z);
        stack.rotateY(jamabar.rot.y);
        stack.rotateX(jamabar.rot.x);
        stack.push();
        if (animGroups[i]) {
          stack.multLeft(animGroups[i].transform);
        }
        const gravityLocal = { x: gravity.x, y: gravity.y, z: gravity.z };
        stack.rigidInvTfVec(gravityLocal, gravityLocal);
        stack.pop();

        jamabar.localVel.z += gravityLocal.z * 0.016;
        jamabar.localVel.z *= 0.97;
        jamabar.localPos.z += jamabar.localVel.z;
        if (jamabar.localPos.z < -2.5) {
          jamabar.localPos.z = -2.5;
          if (jamabar.localVel.z < 0) {
            jamabar.localVel.z = -jamabar.localVel.z;
          }
        } else if (jamabar.localPos.z > 0) {
          jamabar.localPos.z = 0;
          if (jamabar.localVel.z > 0) {
            jamabar.localVel.z = -jamabar.localVel.z;
          }
        }
        stack.tfPoint(jamabar.localPos, jamabar.pos);
      }
    }
    for (const banana of this.bananas) {
      banana.prevLocalPos.x = banana.localPos.x;
      banana.prevLocalPos.y = banana.localPos.y;
      banana.prevLocalPos.z = banana.localPos.z;
      banana.prevScale = banana.scale;
      banana.prevRotX = banana.rotX;
      banana.prevRotY = banana.rotY;
      banana.prevRotZ = banana.rotZ;
      if (banana.cooldown > 0) {
        banana.cooldown -= 1;
      }
      const ballLocalPos =
        banana.state === BANANA_STATE_HOLDING || banana.state === BANANA_STATE_FLY
          ? getBallLocalPos(banana.animGroupId)
          : null;
      let flyTargetLocal = null;
      if (banana.state === BANANA_STATE_FLY && flyTargetWorld) {
        flyTargetLocal = { x: flyTargetWorld.x, y: flyTargetWorld.y, z: flyTargetWorld.z };
        if (banana.animGroupId !== 0 && animGroups[banana.animGroupId]) {
          stack.fromMtx(animGroups[banana.animGroupId].transform);
          stack.rigidInvTfPoint(flyTargetLocal, flyTargetLocal);
        }
      }
      const allowFlyToHud = !!flyTargetLocal;
      updateBanana(banana, ballLocalPos, flyTargetLocal, allowFlyToHud);
    }
    for (const stageSwitch of this.switches) {
      if (stageSwitch.cooldown > 0) {
        stageSwitch.cooldown -= 1;
      }
    }
    if (this.format !== 'smb2') {
      for (const stageSwitch of this.switches) {
        stageSwitch.prevPos.x = stageSwitch.pos.x;
        stageSwitch.prevPos.y = stageSwitch.pos.y;
        stageSwitch.prevPos.z = stageSwitch.pos.z;
        const playbackState = stageSwitch.type & 7;
        const groupMatches = this.isAnimGroupInPlaybackState(stageSwitch.animGroupId, playbackState);
        if (stageSwitch.state === 2) {
          stageSwitch.state = 3;
        }
        if (stageSwitch.state < 2) {
          if (stageSwitch.state === 0) {
            stageSwitch.state = 1;
            stageSwitch.pressImpulse = false;
            stageSwitch.triggered = false;
          }
          stageSwitch.localVel.y += -stageSwitch.localPos.y * 0.1;
          stageSwitch.localVel.y *= 0.95;
          stageSwitch.localPos.y += stageSwitch.localVel.y;
          if (stageSwitch.localPos.y < -0.1) {
            stageSwitch.localPos.y = -0.1;
            if (stageSwitch.localVel.y < 0) {
              stageSwitch.localVel.y *= -0.8;
            }
          } else if (stageSwitch.localPos.y > 0.1) {
            stageSwitch.localPos.y = 0.1;
            if (stageSwitch.localVel.y > 0) {
              stageSwitch.localVel.y *= -0.8;
            }
          }
          if (groupMatches) {
            stageSwitch.state = 2;
            if (!stageSwitch.triggered) {
              this.applySwitchPlayback(stageSwitch, false);
              stageSwitch.triggered = true;
            }
          }
          if (stageSwitch.pressImpulse && stageSwitch.localPos.y < -0.025) {
            stageSwitch.state = 2;
            if (!stageSwitch.triggered) {
              this.switchPressCount = (this.switchPressCount ?? 0) + 1;
              this.applySwitchPlayback(stageSwitch, false);
              stageSwitch.triggered = true;
            }
          }
        } else if (!groupMatches) {
          stageSwitch.state = 0;
        }
        if (stageSwitch.state >= 2) {
          stageSwitch.localVel.y += (-0.1 - stageSwitch.localPos.y) * 0.1;
          stageSwitch.localVel.y *= 0.9;
          stageSwitch.localPos.y += stageSwitch.localVel.y;
          if (stageSwitch.localPos.y < -0.1) {
            stageSwitch.localPos.y = -0.1;
            if (stageSwitch.localVel.y < 0) {
              stageSwitch.localVel.y *= -0.8;
            }
          } else if (stageSwitch.localPos.y > 0) {
            stageSwitch.localPos.y = 0;
            if (stageSwitch.localVel.y > 0) {
              stageSwitch.localVel.y *= -0.8;
            }
          }
        }
        stack.fromIdentity();
        stack.rotateZ(stageSwitch.rot.z);
        stack.rotateY(stageSwitch.rot.y);
        stack.rotateX(stageSwitch.rot.x);
        const localPos = {
          x: stageSwitch.localPos.x,
          y: stageSwitch.localPos.y,
          z: stageSwitch.localPos.z,
        };
        stack.tfPoint(localPos, localPos);
        stageSwitch.pos.x = stageSwitch.basePos.x + localPos.x;
        stageSwitch.pos.y = stageSwitch.basePos.y + localPos.y;
        stageSwitch.pos.z = stageSwitch.basePos.z + localPos.z;
      }
    }
    this.syncObjectTransforms();
  }

  syncObjectTransforms() {
    const animGroups = this.animGroups;
    const stack = this.matrixStack;

    for (const goal of this.goals) {
      stack.fromTranslate(goal.pos);
      stack.rotateZ(goal.rot.z);
      stack.rotateY(goal.rot.y);
      stack.rotateX(goal.rot.x);
      if (animGroups[goal.animGroupId]) {
        stack.multLeft(animGroups[goal.animGroupId].transform);
      }
      stack.toMtx(goal.transform);
    }

    for (let i = 0; i < this.bumpers.length; i += 1) {
      const bumperStates = this.bumpers[i];
      for (const bumper of bumperStates) {
        const drawPos = bumper.basePos ?? bumper.pos;
        stack.fromTranslate(drawPos);
        stack.rotateZ(bumper.rot.z);
        stack.rotateY(bumper.rot.y);
        stack.rotateX(bumper.rot.x);
        stack.rotateY(bumper.spin);
        stack.scaleXYZ(bumper.scale.x * bumper.pulseX, bumper.scale.y, bumper.scale.z * bumper.pulseZ);
        if (animGroups[i]) {
          stack.multLeft(animGroups[i].transform);
        }
        stack.toMtx(bumper.transform);
      }
    }

    for (let i = 0; i < this.jamabars.length; i += 1) {
      const jamabarStates = this.jamabars[i];
      for (const jamabar of jamabarStates) {
        stack.fromTranslate(jamabar.pos);
        stack.rotateZ(jamabar.rot.z);
        stack.rotateY(jamabar.rot.y);
        stack.rotateX(jamabar.rot.x);
        stack.scaleXYZ(jamabar.scale.x, jamabar.scale.y, jamabar.scale.z);
        if (animGroups[i]) {
          stack.multLeft(animGroups[i].transform);
        }
        stack.toMtx(jamabar.transform);
      }
    }

    for (const banana of this.bananas) {
      if (animGroups[banana.animGroupId]) {
        stack.fromMtx(animGroups[banana.animGroupId].transform);
        stack.tfPoint(banana.localPos, banana.pos);
      } else {
        banana.pos.x = banana.localPos.x;
        banana.pos.y = banana.localPos.y;
        banana.pos.z = banana.localPos.z;
      }
    }
  }

  openGoalBag(goalId, ball) {
    const bag = this.goalBags[goalId];
    if (!bag || bag.flags !== 0) {
      return;
    }
    bag.flags = 1;
    bag.state = 2;
    bag.boundSphereRadius = GOAL_BAG_BASE_RADIUS * GOAL_BAG_OPEN_SCALE;
    bag.modelOrigin.x = GOAL_BAG_BASE_CENTER.x * GOAL_BAG_OPEN_SCALE;
    bag.modelOrigin.y = GOAL_BAG_BASE_CENTER.y * GOAL_BAG_OPEN_SCALE;
    bag.modelOrigin.z = GOAL_BAG_BASE_CENTER.z * GOAL_BAG_OPEN_SCALE;
    bag.localVel.x += 0.5 * ball.vel.x;
    bag.localVel.y += 0.5 * ball.vel.y;
    bag.localVel.z += 0.5 * ball.vel.z;
    if (bag.openFrame < 0) {
      bag.openFrame = this.timerFrames;
    }
    updateGoalBagTransform(bag, this.matrixStack);
    if (!this.confettiSpawnedGoals.has(goalId)) {
      this.confettiSpawnedGoals.add(goalId);
      spawnGoalBagConfetti(this, bag, ball, this.visualRng);
    }
  }

  breakGoalTape(goalId, ball) {
    this.openGoalBag(goalId, ball);
    const tape = this.goalTapes[goalId];
    if (!tape || tape.flags !== 0) {
      return;
    }

    const stack = this.matrixStack;
    const localPos = { x: ball.pos.x, y: ball.pos.y, z: ball.pos.z };
    const localVel = { x: ball.vel.x, y: ball.vel.y, z: ball.vel.z };
    stack.fromIdentity();
    stack.translate(tape.goal.pos);
    stack.rotateZ(tape.goal.rot.z);
    stack.rotateY(tape.goal.rot.y);
    stack.rotateX(tape.goal.rot.x);
    stack.rigidInvTfPoint(localPos, localPos);
    stack.rigidInvTfVec(localVel, localVel);

    let nearestIndex = -1;
    let nearestDist = 17.5;
    for (let i = 0; i < tape.points.length; i += 1) {
      const point = tape.points[i];
      if ((point.flags & 4) === 0) {
        continue;
      }
      const dx = point.pos.x - localPos.x;
      const dy = point.pos.y - localPos.y;
      const dz = point.pos.z - localPos.z;
      const dist = sqrt((dx * dx) + (dy * dy) + (dz * dz));
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIndex = i;
      }
    }

    if (nearestIndex < 0 || nearestIndex + 1 >= tape.points.length) {
      return;
    }
    const pointA = tape.points[nearestIndex];
    const pointB = tape.points[nearestIndex + 1];
    pointA.flags &= ~4;
    pointB.flags &= ~2;
    pointA.vel.x += localVel.x;
    pointA.vel.y += localVel.y;
    pointA.vel.z += localVel.z;
    pointB.vel.x += localVel.x;
    pointB.vel.y += localVel.y;
    pointB.vel.z += localVel.z;
    tape.flags = 1;
    if (tape.breakFrame < 0) {
      tape.breakFrame = this.timerFrames;
    }
  }

  computeBoundSphere() {
    const animGroups = this.animGroups;
    const stack = new MatrixStack();
    const localStack = new MatrixStack();
    let hasBounds = false;
    const min = { x: 0, y: 0, z: 0 };
    const max = { x: 0, y: 0, z: 0 };

    for (let i = 0; i < this.stage.animGroupCount; i += 1) {
      const stageAg = this.stage.animGroups[i];
      if (!stageAg.triangles || stageAg.triangles.length === 0) {
        continue;
      }
      let localHas = false;
      const localMin = { x: 0, y: 0, z: 0 };
      const localMax = { x: 0, y: 0, z: 0 };

      for (const tri of stageAg.triangles) {
        localStack.fromTranslate(tri.pos);
        localStack.rotateY(tri.rot.y);
        localStack.rotateX(tri.rot.x);
        localStack.rotateZ(tri.rot.z);

        const v1 = { x: tri.pos.x, y: tri.pos.y, z: tri.pos.z };
        const v2 = { x: tri.vert2.x, y: tri.vert2.y, z: 0 };
        const v3 = { x: tri.vert3.x, y: tri.vert3.y, z: 0 };
        localStack.tfPoint(v2, v2);
        localStack.tfPoint(v3, v3);

        if (!localHas) {
          localHas = true;
          localMin.x = v1.x;
          localMin.y = v1.y;
          localMin.z = v1.z;
          localMax.x = v1.x;
          localMax.y = v1.y;
          localMax.z = v1.z;
        }
        const verts = [v1, v2, v3];
        for (const v of verts) {
          if (v.x < localMin.x) localMin.x = v.x;
          if (v.y < localMin.y) localMin.y = v.y;
          if (v.z < localMin.z) localMin.z = v.z;
          if (v.x > localMax.x) localMax.x = v.x;
          if (v.y > localMax.y) localMax.y = v.y;
          if (v.z > localMax.z) localMax.z = v.z;
        }
      }

      if (!localHas) {
        continue;
      }
      const corners = [
        { x: localMin.x, y: localMin.y, z: localMin.z },
        { x: localMin.x, y: localMin.y, z: localMax.z },
        { x: localMin.x, y: localMax.y, z: localMin.z },
        { x: localMin.x, y: localMax.y, z: localMax.z },
        { x: localMax.x, y: localMin.y, z: localMin.z },
        { x: localMax.x, y: localMin.y, z: localMax.z },
        { x: localMax.x, y: localMax.y, z: localMin.z },
        { x: localMax.x, y: localMax.y, z: localMax.z },
      ];
      stack.fromMtx(animGroups[i].transform);
      for (const corner of corners) {
        stack.tfPoint(corner, corner);
        if (!hasBounds) {
          hasBounds = true;
          min.x = corner.x;
          min.y = corner.y;
          min.z = corner.z;
          max.x = corner.x;
          max.y = corner.y;
          max.z = corner.z;
        } else {
          if (corner.x < min.x) min.x = corner.x;
          if (corner.y < min.y) min.y = corner.y;
          if (corner.z < min.z) min.z = corner.z;
          if (corner.x > max.x) max.x = corner.x;
          if (corner.y > max.y) max.y = corner.y;
          if (corner.z > max.z) max.z = corner.z;
        }
      }
    }

    if (!hasBounds) {
      this.boundSphere.pos.x = 0;
      this.boundSphere.pos.y = 0;
      this.boundSphere.pos.z = 0;
      this.boundSphere.radius = 50;
      return;
    }

    this.boundSphere.pos.x = (max.x + min.x) * 0.5;
    this.boundSphere.pos.y = (max.y + min.y) * 0.5;
    this.boundSphere.pos.z = (max.z + min.z) * 0.5;
    const half = {
      x: (max.x - min.x) * 0.5,
      y: (max.y - min.y) * 0.5,
      z: (max.z - min.z) * 0.5,
    };
    this.boundSphere.radius = sqrt((half.x * half.x) + (half.y * half.y) + (half.z * half.z));
    if (this.boundSphere.radius < FLY_IN_MIN_RADIUS) {
      this.boundSphere.radius = FLY_IN_MIN_RADIUS;
    }
  }

  getFlyInSphere() {
    const override = STAGE_FLY_IN_OVERRIDES.get(this.stage.stageId);
    if (override) {
      return {
        pos: { x: override.pos.x, y: override.pos.y, z: override.pos.z },
        radius: override.radius,
      };
    }
    const radius = Math.max(this.boundSphere.radius, FLY_IN_MIN_RADIUS);
    return {
      pos: { x: this.boundSphere.pos.x, y: this.boundSphere.pos.y, z: this.boundSphere.pos.z },
      radius,
    };
  }
}

function createSeesawState(stageAg, stack) {
  const seesaw = {
    angle: 0,
    prevAngle: 0,
    angleVel: 0,
    sensitivity: stageAg.seesawSensitivity * 40.0,
    friction: 1.0 - stageAg.seesawFriction * 0.02,
    spring: stageAg.seesawSpring * -2.0,
    transform: new Float32Array(12),
    invTransform: new Float32Array(12),
  };

  stack.fromTranslate(stageAg.origin);
  stack.rotateZ(stageAg.initRot.z);
  stack.rotateY(stageAg.initRot.y);
  stack.rotateX(stageAg.initRot.x);
  stack.toMtx(seesaw.transform);

  stack.fromRotateX(-stageAg.initRot.x);
  stack.rotateY(-stageAg.initRot.y);
  stack.rotateZ(-stageAg.initRot.z);
  stack.translateNeg(stageAg.origin);
  stack.toMtx(seesaw.invTransform);

  return seesaw;
}

function tickSeesawState(seesaw) {
  if (!seesaw) {
    return;
  }
  if (!Number.isFinite(seesaw.angle)) {
    seesaw.angle = 0;
  }
  if (!Number.isFinite(seesaw.prevAngle)) {
    seesaw.prevAngle = seesaw.angle;
  }
  if (!Number.isFinite(seesaw.angleVel)) {
    seesaw.angleVel = 0;
  }
  if (!Number.isFinite(seesaw.spring) || !Number.isFinite(seesaw.friction)) {
    seesaw.prevAngle = seesaw.angle;
    return;
  }
  const sinAngle = sinS16(toS16(seesaw.angle));
  seesaw.angleVel += seesaw.spring * sinAngle;
  seesaw.angleVel *= seesaw.friction;
  seesaw.prevAngle = seesaw.angle;
  seesaw.angle += seesaw.angleVel;
}

function createGoalTapeState(goal, animGroupId, stageRuntime, stack) {
  const anchorY = stageRuntime.stage.goalTapeAnchorY ?? GOAL_TAPE_ANCHOR_Y;
  const points = new Array(GOAL_TAPE_SEGMENT_COUNT);
  for (let i = 0; i < GOAL_TAPE_SEGMENT_COUNT; i += 1) {
    const t = (GOAL_TAPE_SEGMENT_COUNT - 1 - i) / (GOAL_TAPE_SEGMENT_COUNT - 1);
    points[i] = {
      pos: {
        x: (GOAL_TAPE_X_SCALE * t) - GOAL_TAPE_X_OFFSET,
        y: anchorY,
        z: 0,
      },
      prevPos: { x: (GOAL_TAPE_X_SCALE * t) - GOAL_TAPE_X_OFFSET, y: anchorY, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      prevNormal: { x: 0, y: 0, z: 1 },
      t,
      vel: { x: 0, y: 0, z: 0 },
      flags: 6,
      len: GOAL_TAPE_SEGMENT_LEN,
    };
  }
  points[0].flags = (points[0].flags & ~2) | 1;
  points[GOAL_TAPE_SEGMENT_COUNT - 1].flags = (points[GOAL_TAPE_SEGMENT_COUNT - 1].flags & ~4) | 1;

  const goalPos = { x: goal.pos.x, y: goal.pos.y, z: goal.pos.z };
  const goalRot = { x: goal.rot.x, y: goal.rot.y, z: goal.rot.z };
  const anchorPos = { x: 0, y: anchorY, z: 0 };
  const animGroup = stageRuntime.animGroups[animGroupId];
  stack.fromTranslate(goalPos);
  stack.rotateZ(goalRot.z);
  stack.rotateY(goalRot.y);
  stack.rotateX(goalRot.x);
  if (animGroup) {
    stack.multLeft(animGroup.transform);
  }
  stack.tfPoint(anchorPos, anchorPos);

  let floorY = GOAL_TAPE_GROUND_OFFSET;
  const hit = raycastStageDown(anchorPos, stageRuntime);
  if (hit?.flags) {
    const localHit = { x: hit.pos.x, y: hit.pos.y, z: hit.pos.z };
    stack.rigidInvTfPoint(localHit, localHit);
    if (anchorY > localHit.y) {
      floorY = localHit.y + GOAL_TAPE_GROUND_OFFSET;
    }
  }

  return {
    animGroupId,
    flags: 0,
    breakFrame: -1,
    groundY: floorY,
    anchorY,
    targetY: anchorY,
    goal: {
      pos: goalPos,
      rot: goalRot,
    },
    points,
  };
}

function createGoalBagState(goal, animGroupId, stack) {
  const localOffset = { x: GOAL_BAG_OFFSET.x, y: GOAL_BAG_OFFSET.y, z: GOAL_BAG_OFFSET.z };
  stack.fromTranslate(goal.pos);
  stack.rotateZ(goal.rot.z);
  stack.rotateY(goal.rot.y);
  stack.rotateX(goal.rot.x);
  stack.tfPoint(localOffset, localOffset);

  const localPos = { x: GOAL_BAG_LOCAL_START.x, y: GOAL_BAG_LOCAL_START.y, z: GOAL_BAG_LOCAL_START.z };
  vecNormalizeLen(localPos);

  const bag = {
    animGroupId,
    state: 1,
    counter: 0,
    flags: 0,
    openness: 0,
    prevOpenness: 0,
    unk8: 0,
    openFrame: -1,
    goal: {
      pos: { x: goal.pos.x, y: goal.pos.y, z: goal.pos.z },
      rot: { x: goal.rot.x, y: goal.rot.y, z: goal.rot.z },
    },
    rotX: goal.rot.x,
    rotY: goal.rot.y,
    rotZ: goal.rot.z,
    prevRotX: goal.rot.x,
    prevRotY: goal.rot.y,
    prevRotZ: goal.rot.z,
    uSomePos: localOffset,
    localPos,
    localVel: { x: 0, y: 0, z: 0 },
    modelOrigin: { x: GOAL_BAG_BASE_CENTER.x, y: GOAL_BAG_BASE_CENTER.y, z: GOAL_BAG_BASE_CENTER.z },
    boundSphereRadius: GOAL_BAG_BASE_RADIUS,
    position: { x: 0, y: 0, z: 0 },
    prevPos: { x: 0, y: 0, z: 0 },
  };

  updateGoalBagTransform(bag, stack);
  bag.prevPos.x = bag.position.x;
  bag.prevPos.y = bag.position.y;
  bag.prevPos.z = bag.position.z;
  return bag;
}

function updateGoalBagTransform(bag, stack) {
  bag.prevPos.x = bag.position.x;
  bag.prevPos.y = bag.position.y;
  bag.prevPos.z = bag.position.z;
  stack.fromTranslate(bag.uSomePos);
  stack.rotateY(bag.rotY);
  stack.rotateX(bag.rotX);
  stack.rotateZ(bag.rotZ);
  stack.tfPoint(bag.modelOrigin, bag.position);
}

function updateGoalBag(bag, animGroups, gravity, holdOpen, stack, rng) {
  bag.prevOpenness = bag.openness;
  bag.prevRotX = bag.rotX;
  bag.prevRotY = bag.rotY;
  bag.prevRotZ = bag.rotZ;
  switch (bag.state) {
    case 1:
      break;
    case 2:
    case 3:
      bag.state = 4;
      bag.counter = -1;
      bag.unk8 = 0.05 + 0.1 * randFloat(rng);
    // fall through
    case 4:
      if (bag.counter > 0) {
        bag.counter -= 1;
        if (bag.counter === 0 && !holdOpen) {
          bag.state = 5;
        }
      }
      bag.unk8 += 0.005;
      bag.unk8 *= 0.99;
      bag.openness += bag.unk8;
      if (bag.openness < 0) {
        bag.openness = 0;
        if (bag.unk8 < 0) {
          bag.unk8 = 0.5 * -bag.unk8;
        }
      } else if (bag.openness > 1) {
        bag.openness = 1;
        if (bag.unk8 > 0) {
          bag.unk8 = 0.5 * -bag.unk8;
        }
      }
      break;
    case 5:
    case 6:
      bag.state = 7;
      bag.counter = 60;
      bag.unk8 = 0.05 + 0.1 * randFloat(rng);
    // fall through
    case 7:
      bag.counter -= 1;
      bag.unk8 -= 0.005;
      bag.unk8 *= 0.99;
      bag.openness += bag.unk8;
      if (bag.openness < 0) {
        bag.openness = 0;
        bag.flags = 0;
        bag.openFrame = -1;
        if (bag.counter < 0) {
          bag.state = 1;
          bag.unk8 = 0;
          bag.boundSphereRadius = GOAL_BAG_BASE_RADIUS;
          bag.modelOrigin.x = GOAL_BAG_BASE_CENTER.x;
          bag.modelOrigin.y = GOAL_BAG_BASE_CENTER.y;
          bag.modelOrigin.z = GOAL_BAG_BASE_CENTER.z;
        } else if (bag.unk8 < 0) {
          bag.unk8 = 0.5 * -bag.unk8;
        }
      } else if (bag.openness > 1) {
        bag.openness = 1;
        if (bag.unk8 > 0) {
          bag.unk8 = 0.5 * -bag.unk8;
        }
      }
      break;
    default:
      break;
  }

  const sp3C = { x: 0.008 * gravity.x, y: 0.008 * gravity.y, z: 0.008 * gravity.z };
  if (bag.animGroupId > 0) {
    stack.fromMtx(animGroups[bag.animGroupId].transform);
    stack.rigidInvTfVec(sp3C, sp3C);
  }
  bag.localVel.x += sp3C.x;
  bag.localVel.y += sp3C.y;
  bag.localVel.z += sp3C.z;

  if (bag.animGroupId > 0) {
    const animGroup = animGroups[bag.animGroupId];
    const prevWorld = { x: 0, y: 0, z: 0 };
    const currWorld = { x: 0, y: 0, z: 0 };
    stack.fromMtx(animGroup.prevTransform);
    stack.tfPoint(bag.position, prevWorld);
    stack.fromMtx(animGroup.transform);
    stack.tfPoint(bag.position, currWorld);
    prevWorld.x -= currWorld.x;
    prevWorld.y -= currWorld.y;
    prevWorld.z -= currWorld.z;
    stack.rigidInvTfVec(prevWorld, prevWorld);
    bag.localVel.x += 0.02 * (prevWorld.x - bag.localVel.x);
    bag.localVel.y += 0.02 * (prevWorld.y - bag.localVel.y);
    bag.localVel.z += 0.02 * (prevWorld.z - bag.localVel.z);
  } else {
    bag.localVel.x *= 0.98;
    bag.localVel.y *= 0.98;
    bag.localVel.z *= 0.98;
  }

  const sp30 = { x: GOAL_BAG_GUIDE_POS.x, y: GOAL_BAG_GUIDE_POS.y, z: GOAL_BAG_GUIDE_POS.z };
  const sp24 = { x: GOAL_BAG_GUIDE_DIR.x, y: GOAL_BAG_GUIDE_DIR.y, z: GOAL_BAG_GUIDE_DIR.z };
  stack.fromTranslate(bag.goal.pos);
  stack.rotateZ(bag.goal.rot.z);
  stack.rotateY(bag.goal.rot.y);
  stack.rotateX(bag.goal.rot.x);
  stack.tfPoint(sp30, sp30);
  stack.tfVec(sp24, sp24);

  const temp_f31 = bag.boundSphereRadius;
  const sp18 = {
    x: bag.uSomePos.x + temp_f31 * bag.localPos.x,
    y: bag.uSomePos.y + temp_f31 * bag.localPos.y,
    z: bag.uSomePos.z + temp_f31 * bag.localPos.z,
  };
  const axisDelta = {
    x: sp18.x - sp30.x,
    y: sp18.y - sp30.y,
    z: sp18.z - sp30.z,
  };
  const temp_f12 = vecDot(axisDelta, sp24);
  if (axisDelta.x * axisDelta.x + axisDelta.y * axisDelta.y + axisDelta.z * axisDelta.z
    - temp_f12 * temp_f12 < temp_f31 * temp_f31) {
    const projected = {
      x: sp30.x + sp24.x * temp_f12,
      y: sp30.y + sp24.y * temp_f12,
      z: sp30.z + sp24.z * temp_f12,
    };
    const spC = {
      x: sp18.x - projected.x,
      y: sp18.y - projected.y,
      z: sp18.z - projected.z,
    };
    vecNormalizeLen(spC);
    bag.localPos.x = projected.x + spC.x * temp_f31 - bag.uSomePos.x;
    bag.localPos.y = projected.y + spC.y * temp_f31 - bag.uSomePos.y;
    bag.localPos.z = projected.z + spC.z * temp_f31 - bag.uSomePos.z;
    vecNormalizeLen(bag.localPos);
    let temp_f2_4 = spC.x * bag.localVel.x + spC.y * bag.localVel.y + spC.z * bag.localVel.z;
    if (temp_f2_4 < 0) {
      temp_f2_4 *= -1.5;
      bag.localVel.x += temp_f2_4 * spC.x;
      bag.localVel.y += temp_f2_4 * spC.y;
      bag.localVel.z += temp_f2_4 * spC.z;
    }
  }

  const temp_f2_6 = -vecDot(bag.localPos, bag.localVel);
  bag.localVel.x += temp_f2_6 * bag.localPos.x;
  bag.localVel.y += temp_f2_6 * bag.localPos.y;
  bag.localVel.z += temp_f2_6 * bag.localPos.z;
  bag.localPos.x += bag.localVel.x;
  bag.localPos.y += bag.localVel.y;
  bag.localPos.z += bag.localVel.z;
  vecNormalizeLen(bag.localPos);

  const rotVec = { x: bag.localPos.x, y: bag.localPos.y, z: bag.localPos.z };
  stack.fromRotateY(-bag.rotY);
  stack.rotateX(0);
  stack.tfVec(rotVec, rotVec);
  bag.rotX = atan2S16Safe(rotVec.z, rotVec.y) - 0x8000;
  bag.rotZ = atan2S16Safe(rotVec.x, sqrt(sumSq2(rotVec.z, rotVec.y)));

  updateGoalBagTransform(bag, stack);
}

function updateBanana(banana, ballLocalPos, flyTargetLocal, allowFlyToHud) {
  if (banana.state === 0) {
    return;
  }
  if (banana.tiltTimer > 0) {
    banana.tiltTimer -= 1;
  }
  if (banana.state === BANANA_STATE_HOLDING) {
    banana.holdTimer -= 1;
    if (banana.holdTimer <= 0) {
      banana.state = BANANA_STATE_FLY;
      banana.flyTimer = BANANA_FLY_FRAMES;
      if (ballLocalPos) {
        banana.flyStartPos.x = ballLocalPos.x + banana.holdOffset.x;
        banana.flyStartPos.y = ballLocalPos.y + banana.holdOffset.y;
        banana.flyStartPos.z = ballLocalPos.z + banana.holdOffset.z;
      } else {
        banana.flyStartPos.x = banana.localPos.x;
        banana.flyStartPos.y = banana.localPos.y;
        banana.flyStartPos.z = banana.localPos.z;
      }
      banana.flyStartScale = banana.scale;
      return;
    }
    if (ballLocalPos) {
      banana.holdOffset.x *= BANANA_HOLD_DAMP;
      banana.holdOffset.z *= BANANA_HOLD_DAMP;
      const t = (BANANA_HOLD_FRAMES - banana.holdTimer) / BANANA_HOLD_FRAMES;
      const targetY = BANANA_HOLD_Y_BASE + (BANANA_HOLD_Y_RANGE * t);
      banana.holdOffset.y += (targetY - banana.holdOffset.y) * BANANA_HOLD_Y_LERP;
      banana.localPos.x = ballLocalPos.x + banana.holdOffset.x;
      banana.localPos.y = ballLocalPos.y + banana.holdOffset.y;
      banana.localPos.z = ballLocalPos.z + banana.holdOffset.z;
    }
    const rotDelta = toS16(BANANA_HOLD_ROT_TARGET - banana.holdRotVel);
    banana.holdRotVel = toS16(banana.holdRotVel + (rotDelta >> 3));
    banana.rotY = toS16(banana.rotY + banana.holdRotVel);
    banana.scale += (banana.holdScaleTarget - banana.scale) * 0.2;
    return;
  }
  if (banana.state === BANANA_STATE_FLY) {
    if (!allowFlyToHud) {
      banana.localPos.y += 0.02;
      banana.scale -= 0.01;
      if (banana.scale <= 0) {
        banana.scale = 0;
        banana.state = 0;
        banana.collected = true;
      }
      return;
    }
    banana.flyTimer -= 1;
    const t = 1 - Math.max(0, banana.flyTimer) / BANANA_FLY_FRAMES;
    const eased = 1 - Math.cos((t * Math.PI) / 2);
    let startPos = banana.flyStartPos;
    if (ballLocalPos) {
      banana.localPos.x = ballLocalPos.x + banana.holdOffset.x;
      banana.localPos.y = ballLocalPos.y + banana.holdOffset.y;
      banana.localPos.z = ballLocalPos.z + banana.holdOffset.z;
      startPos = banana.localPos;
    }
    banana.localPos.x = startPos.x + (flyTargetLocal.x - startPos.x) * eased;
    banana.localPos.y = startPos.y + (flyTargetLocal.y - startPos.y) * eased;
    banana.localPos.z = startPos.z + (flyTargetLocal.z - startPos.z) * eased;
    banana.scale = banana.flyStartScale + (banana.flyScaleTarget - banana.flyStartScale) * eased;
    banana.rotY = toS16(banana.rotY + banana.holdRotVel);
    if (banana.flyTimer <= 0) {
      banana.state = 0;
      banana.collected = true;
    }
    return;
  }
  switch (banana.state) {
    case 1:
      banana.state = 2;
      break;
    case 3:
      banana.state = 4;
    // fall through
    case 4:
      banana.state = 5;
      banana.collectTimer = BANANA_COLLECT_WAIT_FRAMES;
    // fall through
    case 5:
      banana.collectTimer -= 1;
      if (banana.collectTimer < 0) {
        banana.state = 6;
      }
      break;
    case 6:
      banana.scale -= BANANA_SHRINK_STEP;
      if (banana.scale <= 0) {
        banana.scale = 0;
        banana.state = 0;
        banana.collected = true;
      }
      break;
    default:
      break;
  }

  banana.localPos.x += banana.vel.x;
  banana.localPos.y += banana.vel.y;
  banana.localPos.z += banana.vel.z;
  banana.rotX = toS16(banana.rotX + banana.rotVelX);
  banana.rotY = toS16(banana.rotY + banana.rotVelY);
  banana.rotZ = toS16(banana.rotZ + banana.rotVelZ);
}

function updateGoalTape(tape, animGroups, gravity, stack) {
  const points = tape.points;
  const motionDelta = { x: 0, y: 0, z: 0 };
  const prevWorld = { x: 0, y: 0, z: 0 };
  const currWorld = { x: 0, y: 0, z: 0 };
  let hasGroupMotion = false;
  if (tape.animGroupId !== 0 && animGroups[tape.animGroupId]) {
    const animGroup = animGroups[tape.animGroupId];
    hasGroupMotion = true;
    stack.fromMtx(animGroup.prevTransform);
    stack.tfPoint(tape.goal.pos, prevWorld);
    stack.fromMtx(animGroup.transform);
    stack.tfPoint(tape.goal.pos, currWorld);
    motionDelta.x = prevWorld.x - currWorld.x;
    motionDelta.y = prevWorld.y - currWorld.y;
    motionDelta.z = prevWorld.z - currWorld.z;
    stack.fromRotateZ(tape.goal.rot.z);
    stack.rotateY(tape.goal.rot.y);
    stack.rotateX(tape.goal.rot.x);
    stack.rigidInvTfVec(motionDelta, motionDelta);
  }

  const gravityLocal = {
    x: GOAL_TAPE_GRAVITY_SCALE * gravity.x,
    y: GOAL_TAPE_GRAVITY_SCALE * gravity.y,
    z: GOAL_TAPE_GRAVITY_SCALE * gravity.z,
  };
  const animGroup = animGroups[tape.animGroupId];
  if (animGroup) {
    stack.fromMtx(animGroup.transform);
  } else {
    stack.fromIdentity();
  }
  stack.translate(tape.goal.pos);
  stack.rotateZ(tape.goal.rot.z);
  stack.rotateY(tape.goal.rot.y);
  stack.rotateX(tape.goal.rot.x);
  stack.rigidInvTfVec(gravityLocal, gravityLocal);

  for (const point of points) {
    point.prevPos.x = point.pos.x;
    point.prevPos.y = point.pos.y;
    point.prevPos.z = point.pos.z;
    point.prevNormal.x = point.normal.x;
    point.prevNormal.y = point.normal.y;
    point.prevNormal.z = point.normal.z;
  }

  const neighborSum = { x: 0, y: 0, z: 0 };
  const delta = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (point.flags & 1) {
      continue;
    }
    neighborSum.x = 0;
    neighborSum.y = 0;
    neighborSum.z = 0;
    if (point.flags & 2) {
      const prev = points[i - 1];
      neighborSum.x += prev.normal.x;
      neighborSum.y += prev.normal.y;
      neighborSum.z += prev.normal.z;
      delta.x = prev.pos.x - point.pos.x;
      delta.y = prev.pos.y - point.pos.y;
      delta.z = prev.pos.z - point.pos.z;
      const len = vecNormalizeLen(delta);
      let target = prev.len;
      if (len > target) {
        target = 1.05 * (len - target);
        point.vel.x += delta.x * target;
        point.vel.y += delta.y * target;
        point.vel.z += delta.z * target;
      } else {
        target = -target;
        point.pos.x = prev.pos.x + delta.x * target;
        point.pos.y = prev.pos.y + delta.y * target;
        point.pos.z = prev.pos.z + delta.z * target;
        const dot = -vecDot(point.vel, delta);
        point.vel.x += delta.x * dot;
        point.vel.y += delta.y * dot;
        point.vel.z += delta.z * dot;
      }
    }
    if (point.flags & 4) {
      const next = points[i + 1];
      neighborSum.x += next.normal.x;
      neighborSum.y += next.normal.y;
      neighborSum.z += next.normal.z;
      delta.x = next.pos.x - point.pos.x;
      delta.y = next.pos.y - point.pos.y;
      delta.z = next.pos.z - point.pos.z;
      const len = vecNormalizeLen(delta);
      let target = point.len;
      if (len > target) {
        target = 1.05 * (len - target);
        point.vel.x += delta.x * target;
        point.vel.y += delta.y * target;
        point.vel.z += delta.z * target;
      } else {
        target = -target;
        point.pos.x = next.pos.x + delta.x * target;
        point.pos.y = next.pos.y + delta.y * target;
        point.pos.z = next.pos.z + delta.z * target;
        const dot = -vecDot(point.vel, delta);
        point.vel.x += delta.x * dot;
        point.vel.y += delta.y * dot;
        point.vel.z += delta.z * dot;
      }
    }

    point.vel.x += gravityLocal.x;
    point.vel.y += gravityLocal.y;
    point.vel.z += gravityLocal.z;
    stack.fromRotateY(toS16(49152 * (point.vel.x + point.vel.z)));
    stack.rotateX(toS16(98304 * point.vel.y));
    stack.tfVec(point.normal, point.normal);
    point.normal.x += 0.075 * (neighborSum.x - point.normal.x);
    point.normal.y += 0.075 * (neighborSum.y - point.normal.y);
    point.normal.z += 0.075 * (neighborSum.z - point.normal.z);
    vecNormalizeLen(point.normal);
  }

  if (tape.anchorY > tape.targetY) {
    tape.anchorY -= GOAL_TAPE_Y_STEP;
    if (tape.anchorY < tape.targetY) {
      tape.anchorY = tape.targetY;
    }
  } else if (tape.anchorY < tape.targetY) {
    tape.anchorY += GOAL_TAPE_Y_STEP;
    if (tape.anchorY > tape.targetY) {
      tape.anchorY = tape.targetY;
    }
  }

  points[0].pos.y = tape.anchorY;
  points[points.length - 1].pos.y = tape.anchorY;

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (point.flags & 1) {
      continue;
    }
    if (hasGroupMotion && (point.flags & 6) !== 6) {
      point.vel.x += 0.15 * (motionDelta.x - point.vel.x);
      point.vel.y += 0.15 * (motionDelta.y - point.vel.y);
      point.vel.z += 0.15 * (motionDelta.z - point.vel.z);
    } else {
      point.vel.x *= 0.85;
      point.vel.y *= 0.85;
      point.vel.z *= 0.85;
    }
    point.pos.x += point.vel.x;
    point.pos.y += point.vel.y;
    point.pos.z += point.vel.z;
    if (point.pos.y < tape.groundY) {
      point.pos.y = tape.groundY;
      point.vel.y = 0;
      point.normal.x *= 0.9;
      point.normal.y += 0.1 * (1 - point.normal.y);
      point.normal.z *= 0.9;
      vecNormalizeLen(point.normal);
    }
  }
}

function createConfettiParticle(modelIndex, pos, vel, rotX, rotY, rotZ, scale, life) {
  return {
    modelIndex,
    pos: { x: pos.x, y: pos.y, z: pos.z },
    prevPos: { x: pos.x, y: pos.y, z: pos.z },
    vel: { x: vel.x, y: vel.y, z: vel.z },
    rotX,
    rotY,
    rotZ,
    prevRotX: rotX,
    prevRotY: rotY,
    prevRotZ: rotZ,
    rotVelX: 0,
    rotVelY: 0,
    rotVelZ: 0,
    scale,
    life,
    onGround: false,
    groundPos: { x: 0, y: 0, z: 0 },
    groundNormal: { x: 0, y: 1, z: 0 },
    groundVel: { x: 0, y: 0, z: 0 },
    groundBias: 0,
  };
}

function spawnGoalBagConfetti(stageRuntime, bag, ball, rng) {
  const animGroup = stageRuntime.animGroups[bag.animGroupId];
  const stack = stageRuntime.matrixStack;
  const vel = { x: ball.vel.x, y: ball.vel.y, z: ball.vel.z };
  const worldPos = { x: 0, y: 0, z: 0 };
  const prevWorldPos = { x: 0, y: 0, z: 0 };

  if (animGroup) {
    stack.fromMtx(animGroup.transform);
    stack.tfVec(vel, vel);
  }

  if (animGroup) {
    stack.fromMtx(animGroup.transform);
    stack.tfPoint(bag.position, worldPos);
    stack.fromMtx(animGroup.prevTransform);
    stack.tfPoint(bag.position, prevWorldPos);
    vel.x += worldPos.x - prevWorldPos.x;
    vel.y += worldPos.y - prevWorldPos.y;
    vel.z += worldPos.z - prevWorldPos.z;
  } else {
    vel.x += bag.position.x - bag.prevPos.x;
    vel.y += bag.position.y - bag.prevPos.y;
    vel.z += bag.position.z - bag.prevPos.z;
  }

  const baseRadius = bag.boundSphereRadius;
  const modelIndexBase = 0;

  if (animGroup) {
    stack.fromMtx(animGroup.transform);
  } else {
    stack.fromIdentity();
  }
  stack.translate(bag.position);

  const localPos = { x: 0, y: 0, z: 0 };
  const spawnPos = { x: 0, y: 0, z: 0 };
  const spawnCount = 160;
  for (let i = 0; i < spawnCount; i += 1) {
    localPos.z = 0.5 * (baseRadius * (1.0 + randFloat(rng)));
    stack.rotateY(randS16(rng));
    stack.rotateX(randS16(rng));
    localPos.x = 0;
    localPos.y = 0;
    stack.tfPoint(localPos, spawnPos);

    const rotX = randS16(rng);
    const rotY = randS16(rng);
    const rotZ = randS16(rng);
    const scale = 0.5 + 0.5 * randFloat(rng);
    const life = Math.trunc(CONFETTI_LIFE_BASE + CONFETTI_LIFE_RANGE * randFloat(rng));
    const modelIndex = (modelIndexBase + (i % CONFETTI_MODEL_COUNT)) % CONFETTI_MODEL_COUNT;

    const frag = createConfettiParticle(modelIndex, spawnPos, vel, rotX, rotY, rotZ, scale, life);
    frag.groundBias = 0.0001 * randFloat(rng);
    stageRuntime.confetti.push(frag);
  }
}

function updateConfetti(stageRuntime, gravity) {
  const stack = stageRuntime.matrixStack;
  const confetti = stageRuntime.confetti;
  for (let i = confetti.length - 1; i >= 0; i -= 1) {
    const frag = confetti[i];
    frag.prevPos.x = frag.pos.x;
    frag.prevPos.y = frag.pos.y;
    frag.prevPos.z = frag.pos.z;
    frag.prevRotX = frag.rotX;
    frag.prevRotY = frag.rotY;
    frag.prevRotZ = frag.rotZ;
    frag.life -= 1;
    if (frag.life <= 0) {
      confetti.splice(i, 1);
      continue;
    }

    frag.vel.x += gravity.x * CONFETTI_GRAVITY_SCALE;
    frag.vel.y += gravity.y * CONFETTI_GRAVITY_SCALE;
    frag.vel.z += gravity.z * CONFETTI_GRAVITY_SCALE;

    const dir = { x: 0, y: 1, z: 0 };
    stack.fromIdentity();
    stack.rotateY(frag.rotY);
    stack.rotateX(frag.rotX);
    stack.rotateZ(frag.rotZ);
    stack.tfVec(dir, dir);
    const dot = (dir.x * frag.vel.x) + (dir.y * frag.vel.y) + (dir.z * frag.vel.z);
    const align = CONFETTI_BOUNCE * dot;
    frag.vel.x += dir.x * align;
    frag.vel.y += dir.y * align;
    frag.vel.z += dir.z * align;

    frag.vel.x *= CONFETTI_VEL_DAMP;
    frag.vel.y *= CONFETTI_VEL_DAMP;
    frag.vel.z *= CONFETTI_VEL_DAMP;

    frag.pos.x += frag.vel.x;
    frag.pos.y += frag.vel.y;
    frag.pos.z += frag.vel.z;

    const rotScale = CONFETTI_ROT_SPEED_SCALE / Math.max(frag.scale, 0.001);
    frag.rotVelX = (frag.rotVelX + Math.trunc(rotScale * (frag.vel.x + frag.vel.y))) | 0;
    frag.rotVelY = (frag.rotVelY + Math.trunc(rotScale * (frag.vel.y + frag.vel.z))) | 0;
    frag.rotVelZ = (frag.rotVelZ + Math.trunc(rotScale * (frag.vel.z + frag.vel.x))) | 0;

    frag.rotVelX -= frag.rotVelX >> 5;
    frag.rotVelY -= frag.rotVelY >> 5;
    frag.rotVelZ -= frag.rotVelZ >> 5;

    frag.rotX = toS16(frag.rotX + frag.rotVelX);
    frag.rotY = toS16(frag.rotY + frag.rotVelY);
    frag.rotZ = toS16(frag.rotZ + frag.rotVelZ);

    if ((frag.life & 0x0f) === 0) {
      frag.onGround = false;
      const hit = raycastStageDown(frag.pos, stageRuntime);
      if (hit && hit.pos.y > frag.pos.y - CONFETTI_GROUND_CHECK) {
        frag.onGround = true;
        frag.groundPos.x = hit.pos.x;
        frag.groundPos.y = hit.pos.y;
        frag.groundPos.z = hit.pos.z;
        if (hit.normal) {
          frag.groundNormal.x = hit.normal.x;
          frag.groundNormal.y = hit.normal.y;
          frag.groundNormal.z = hit.normal.z;
        } else {
          frag.groundNormal.x = 0;
          frag.groundNormal.y = 1;
          frag.groundNormal.z = 0;
        }
        if (hit.surfaceVel) {
          frag.groundVel.x = hit.surfaceVel.x;
          frag.groundVel.y = hit.surfaceVel.y;
          frag.groundVel.z = hit.surfaceVel.z;
        } else {
          frag.groundVel.x = 0;
          frag.groundVel.y = 0;
          frag.groundVel.z = 0;
        }
      }
    }

    if (frag.onGround) {
      let nx = frag.groundNormal.x;
      let ny = frag.groundNormal.y;
      let nz = frag.groundNormal.z;
      const groundDir = { x: 0, y: 1, z: 0 };
      stack.fromIdentity();
      stack.rotateY(frag.rotY);
      stack.rotateX(frag.rotX);
      stack.rotateZ(frag.rotZ);
      stack.tfVec(groundDir, groundDir);
      const normalDot = (groundDir.x * nx) + (groundDir.y * ny) + (groundDir.z * nz);
      const contactEps = frag.groundBias + (1.0 - Math.abs(normalDot)) * 0.1;
      const dist = nx * (frag.pos.x - frag.groundPos.x)
        + ny * (frag.pos.y - frag.groundPos.y)
        + nz * (frag.pos.z - frag.groundPos.z);
      if (dist < contactEps + 0.05) {
        const push = (contactEps + 0.05) - dist;
        frag.pos.x += push * nx;
        frag.pos.y += push * ny;
        frag.pos.z += push * nz;
        let normalSpeed = (frag.vel.x * nx) + (frag.vel.y * ny) + (frag.vel.z * nz);
        if (normalSpeed < 0) {
          normalSpeed = -normalSpeed;
          frag.vel.x += normalSpeed * nx;
          frag.vel.y += normalSpeed * ny;
          frag.vel.z += normalSpeed * nz;
          const surfaceBlend = Math.abs(normalDot) * 0.125;
          frag.vel.x += surfaceBlend * (frag.groundVel.x - frag.vel.x);
          frag.vel.y += surfaceBlend * (frag.groundVel.y - frag.vel.y);
          frag.vel.z += surfaceBlend * (frag.groundVel.z - frag.vel.z);
          normalSpeed *= 0.5;
          frag.vel.x += normalSpeed * nx;
          frag.vel.y += normalSpeed * ny;
          frag.vel.z += normalSpeed * nz;
        }
        if (normalDot < 0) {
          nx = -nx;
          ny = -ny;
          nz = -nz;
        }
        groundDir.x = nx * 0.05 + groundDir.x * 0.95;
        groundDir.y = ny * 0.05 + groundDir.y * 0.95;
        groundDir.z = nz * 0.05 + groundDir.z * 0.95;
        vecNormalizeLen(groundDir);
        const prevRotX = frag.rotX;
        const prevRotZ = frag.rotZ;
        const rotVec = { x: groundDir.x, y: groundDir.y, z: groundDir.z };
        stack.fromRotateY(-frag.rotY);
        stack.rotateX(0);
        stack.tfVec(rotVec, rotVec);
        frag.rotX = atan2S16(rotVec.z, rotVec.y);
        frag.rotZ = -atan2S16(rotVec.x, sqrt(sumSq2(rotVec.z, rotVec.y)));
        frag.rotVelX = (frag.rotVelX >> 2) + ((frag.rotX - prevRotX) >> 2);
        frag.rotVelY -= frag.rotVelY >> 4;
        frag.rotVelZ = (frag.rotVelZ >> 2) + ((frag.rotZ - prevRotZ) >> 2);
      }
    }
  }
}

export function parseStageDef(data, gameSource = 'smb1') {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magicA = view.getUint32(0, false);
  const magicB = view.getUint32(4, false);
  if (
    gameSource === 'smb2' ||
    (magicA === STAGE2_MAGIC_A && (magicB === STAGE2_MAGIC_B || magicB === STAGE2_MAGIC_B_ALT))
  ) {
    const parser = new StageParserSmb2(data);
    return parser.parseStage();
  }
  const parser = new StageParser(data);
  const stage = parser.parseStage();
  stage.format = 'smb1';
  return stage;
}

function computeGmaBoundSphere(gma, modelNames = null) {
  let hasBounds = false;
  const min = { x: 0, y: 0, z: 0 };
  const max = { x: 0, y: 0, z: 0 };
  const nameSet = modelNames && modelNames.length ? new Set(modelNames) : null;
  const modelIter = nameSet ? gma.nameMap.entries() : gma.idMap.values();
  for (const entry of modelIter) {
    const model = nameSet ? entry[1] : entry;
    const name = nameSet ? entry[0] : null;
    if (!model || (nameSet && !nameSet.has(name))) {
      continue;
    }
    const r = model.boundSphereRadius;
    const center = model.boundSphereCenter;
    const minX = center.x - r;
    const minY = center.y - r;
    const minZ = center.z - r;
    const maxX = center.x + r;
    const maxY = center.y + r;
    const maxZ = center.z + r;
    if (!hasBounds) {
      hasBounds = true;
      min.x = minX;
      min.y = minY;
      min.z = minZ;
      max.x = maxX;
      max.y = maxY;
      max.z = maxZ;
    } else {
      if (minX < min.x) min.x = minX;
      if (minY < min.y) min.y = minY;
      if (minZ < min.z) min.z = minZ;
      if (maxX > max.x) max.x = maxX;
      if (maxY > max.y) max.y = maxY;
      if (maxZ > max.z) max.z = maxZ;
    }
  }
  if (!hasBounds) {
    return null;
  }
  const pos = {
    x: (max.x + min.x) * 0.5,
    y: (max.y + min.y) * 0.5,
    z: (max.z + min.z) * 0.5,
  };
  const half = {
    x: (max.x - min.x) * 0.5,
    y: (max.y - min.y) * 0.5,
    z: (max.z - min.z) * 0.5,
  };
  const radius = sqrt((half.x * half.x) + (half.y * half.y) + (half.z * half.z));
  return { pos, radius: Math.max(radius, FLY_IN_MIN_RADIUS) };
}

function findModelBySuffix(gma, suffix) {
  for (const [name, model] of gma.nameMap) {
    if (name.endsWith(suffix)) {
      return model;
    }
  }
  return null;
}

function extractSwitchModelBounds(gma) {
  const bounds = new Array(SWITCH_MODEL_SUFFIXES.length).fill(null);
  let fallbackModel = null;
  for (const [name, model] of gma.nameMap) {
    if (!name.startsWith('BUTTON_')) {
      continue;
    }
    if (name.endsWith('BASE')) {
      continue;
    }
    fallbackModel = fallbackModel ?? model;
  }
  for (let i = 0; i < SWITCH_MODEL_SUFFIXES.length; i += 1) {
    const model = findModelBySuffix(gma, SWITCH_MODEL_SUFFIXES[i]) ?? fallbackModel;
    if (!model) {
      continue;
    }
    bounds[i] = {
      center: model.boundSphereCenter,
      radius: model.boundSphereRadius,
    };
  }
  return bounds;
}

export async function loadStageModelBounds(stageId, basePath = STAGE_BASE_PATHS.smb1, modelNames = null) {
  const id = formatStageId(stageId);
  const gmaPath = `${basePath}/st${id}/st${id}.gma`;
  const tplPath = `${basePath}/st${id}/st${id}.tpl`;
  let gmaBuffer;
  let tplBuffer;
  try {
    [gmaBuffer, tplBuffer] = await Promise.all([fetchPackBuffer(gmaPath), fetchPackBuffer(tplPath)]);
  } catch {
    return null;
  }
  const tpl = parseAVTpl(tplBuffer, `st${id}`);
  const gma = parseGma(gmaBuffer, tpl);
  const boundSphere = computeGmaBoundSphere(gma, modelNames) ?? computeGmaBoundSphere(gma);
  return {
    boundSphere,
    switchModelBounds: extractSwitchModelBounds(gma),
  };
}

export async function loadGoalTapeAnchorY(basePath = STAGE_BASE_PATHS.smb1, gameSource = 'smb1') {
  const commonNlPath = `${basePath}/init/common_p.lz`;
  const commonNlTplPath = `${basePath}/init/common.lz`;
  let nlBuffer;
  let tplBuffer;
  try {
    [nlBuffer, tplBuffer] = await Promise.all([fetchPackBuffer(commonNlPath), fetchPackBuffer(commonNlTplPath)]);
  } catch {
    return null;
  }
  const tplSlice = decompressLZ(new ArrayBufferSlice(tplBuffer));
  const nlSlice = decompressLZ(new ArrayBufferSlice(nlBuffer));
  if (!tplSlice.byteLength || !nlSlice.byteLength) {
    return null;
  }
  const tpl = parseAVTpl(tplSlice.arrayBuffer, 'common-nl');
  const nlObj = parseNlObj(nlSlice, tpl);
  let model = nlObj.get(CommonNlModelID.GOAL_TAPE);
  if (!model && (gameSource === 'smb2' || gameSource === 'mb2ws')) {
    model = nlObj.get(CommonNlModelID.GOAL_TAPE_SMB2);
  }
  if (!model) {
    return null;
  }
  return model.boundSphereCenter[1];
}

export async function loadStageDef(stageId, basePath = STAGE_BASE_PATHS.smb1, gameSource = 'smb1') {
  const id = formatStageId(stageId);
  const path = `${basePath}/st${id}/STAGE${id}.lz`;
  const buffer = await fetchPackBuffer(path);
  const decompressed = lzssDecompress(buffer);
  const view = new Uint8Array(decompressed.buffer, decompressed.byteOffset, decompressed.byteLength);
  const stage = parseStageDef(view, gameSource);
  stage.stageId = stageId;
  stage.gameSource = gameSource;
  return stage;
}
