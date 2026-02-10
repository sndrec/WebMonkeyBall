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
  goalTypeFromValue,
} from '../../shared/constants/index.js';
import {
  ANIM_SEESAW,
  STAGE_ANIM_GROUP_MODEL_SIZE,
  STAGE_ANIM_GROUP_SIZE,
  STAGE_BANANA_SIZE,
  STAGE_BG_ANIM_SIZE,
  STAGE_BG_OBJECT_SIZE,
  STAGE_BUMPER_SIZE,
  STAGE_CONE_SIZE,
  STAGE_CYLINDER_SIZE,
  STAGE_FALLOUT_BOX_SIZE,
  STAGE_FLIPBOOK_SIZE,
  STAGE_GOAL_SIZE,
  STAGE_JAMABAR_SIZE,
  STAGE_KEYFRAME_SIZE,
  STAGE_NIGHT_WINDOW_SIZE,
  STAGE_SPHERE_SIZE,
  STAGE_START_POS_SIZE,
  STAGE_STORM_FIRE_SIZE,
  STAGE_SWITCH_SIZE,
  STAGE_TRIANGLE_SIZE,
  STAGE_WORMHOLE_SIZE,
  STAGE2_ANIM_GROUP_SIZE,
  STAGE2_BG_OBJECT_SIZE,
  STAGE2_MAGIC_A,
  STAGE2_MAGIC_B,
  STAGE2_MAGIC_B_ALT,
  STAGE2_MODEL_INSTANCE_SIZE,
} from '../stage_constants.js';
import {
  atan2S16,
  atan2S16Safe,
  floor,
  sinS16,
  sqrt,
  sumSq2,
  toS16,
  vecDot,
  vecNormalizeLen,
} from '../../math.js';
import type { StageDef } from './stage_def.js';

const TEXT_DECODER = new TextDecoder('utf-8');

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



export function detectStageFormat(data, gameSource) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magicA = view.getUint32(0, false);
  const magicB = view.getUint32(4, false);
  if (gameSource === 'smb2' || gameSource === 'mb2ws') {
    return 'smb2';
  }
  if (magicA === STAGE2_MAGIC_A && (magicB === STAGE2_MAGIC_B || magicB === STAGE2_MAGIC_B_ALT)) {
    return 'smb2';
  }
  return 'smb1';
}

export function parseSmb1StageDef(data): StageDef {
  const parser = new StageParser(data);
  const stage = parser.parseStage();
  stage.format = 'smb1';
  return stage;
}

export function parseSmb2StageDef(data): StageDef {
  const parser = new StageParserSmb2(data);
  const stage = parser.parseStage();
  stage.format = 'smb2';
  return stage;
}

export function parseStageDef(data, gameSource): StageDef {
  const format = detectStageFormat(data, gameSource);
  return format === 'smb2' ? parseSmb2StageDef(data) : parseSmb1StageDef(data);
}
