import { vec2, vec3 } from 'gl-matrix';
import { GAME_SOURCES, type GameSource } from './shared/constants/index.js';
import {
  AnimType,
  BananaType,
  GoalType,
  type BgAnim,
  type BgObject,
  type FlipbookAnims,
  type Stage,
  type StageModelInstance,
} from './noclip/SuperMonkeyBall/Stagedef.js';
import { BgInfos, type StageInfo } from './noclip/SuperMonkeyBall/StageInfo.js';
import { colorNewFromRGBA } from './noclip/Color.js';
import { getPackStageEnv, hasPackForGameSource } from './pack.js';

const SMB2_STAGE_THEME_IDS = [
  0, // 0
  19, // 1
  19, // 2
  19, // 3
  19, // 4
  19, // 5
  19, // 6
  17, // 7
  17, // 8
  17, // 9
  17, // 10
  17, // 11
  17, // 12
  17, // 13
  17, // 14
  17, // 15
  17, // 16
  18, // 17
  32, // 18
  32, // 19
  32, // 20
  32, // 21
  32, // 22
  32, // 23
  32, // 24
  32, // 25
  32, // 26
  32, // 27
  20, // 28
  20, // 29
  20, // 30
  20, // 31
  20, // 32
  20, // 33
  20, // 34
  20, // 35
  20, // 36
  20, // 37
  21, // 38
  21, // 39
  21, // 40
  21, // 41
  21, // 42
  21, // 43
  21, // 44
  21, // 45
  21, // 46
  21, // 47
  25, // 48
  24, // 49
  24, // 50
  24, // 51
  24, // 52
  24, // 53
  24, // 54
  24, // 55
  24, // 56
  24, // 57
  24, // 58
  22, // 59
  22, // 60
  22, // 61
  22, // 62
  22, // 63
  22, // 64
  22, // 65
  22, // 66
  22, // 67
  22, // 68
  1, // 69
  19, // 70
  1, // 71
  1, // 72
  1, // 73
  1, // 74
  1, // 75
  1, // 76
  1, // 77
  1, // 78
  1, // 79
  1, // 80
  1, // 81
  1, // 82
  1, // 83
  1, // 84
  1, // 85
  1, // 86
  1, // 87
  1, // 88
  1, // 89
  1, // 90
  1, // 91
  1, // 92
  1, // 93
  1, // 94
  1, // 95
  1, // 96
  1, // 97
  1, // 98
  1, // 99
  1, // 100
  27, // 101
  27, // 102
  1, // 103
  1, // 104
  1, // 105
  1, // 106
  1, // 107
  1, // 108
  1, // 109
  1, // 110
  1, // 111
  1, // 112
  1, // 113
  1, // 114
  1, // 115
  1, // 116
  1, // 117
  1, // 118
  1, // 119
  1, // 120
  19, // 121
  18, // 122
  22, // 123
  1, // 124
  1, // 125
  1, // 126
  1, // 127
  1, // 128
  1, // 129
  1, // 130
  19, // 131
  20, // 132
  24, // 133
  17, // 134
  22, // 135
  18, // 136
  4, // 137
  31, // 138
  31, // 139
  31, // 140
  6, // 141
  3, // 142
  19, // 143
  20, // 144
  34, // 145
  20, // 146
  21, // 147
  6, // 148
  6, // 149
  19, // 150
  11, // 151
  29, // 152
  26, // 153
  23, // 154
  29, // 155
  29, // 156
  29, // 157
  29, // 158
  28, // 159
  30, // 160
  33, // 161
  33, // 162
  33, // 163
  33, // 164
  33, // 165
  33, // 166
  33, // 167
  33, // 168
  33, // 169
  33, // 170
  33, // 171
  33, // 172
  33, // 173
  33, // 174
  33, // 175
  33, // 176
  33, // 177
  33, // 178
  14, // 179
  12, // 180
  3, // 181
  3, // 182
  3, // 183
  1, // 184
  1, // 185
  1, // 186
  1, // 187
  1, // 188
  1, // 189
  1, // 190
  1, // 191
  1, // 192
  1, // 193
  1, // 194
  19, // 195
  1, // 196
  10, // 197
  16, // 198
  2, // 199
  20, // 200
  19, // 201
  19, // 202
  19, // 203
  19, // 204
  26, // 205
  20, // 206
  20, // 207
  20, // 208
  20, // 209
  20, // 210
  22, // 211
  22, // 212
  22, // 213
  22, // 214
  22, // 215
  23, // 216
  23, // 217
  23, // 218
  23, // 219
  23, // 220
  19, // 221
  19, // 222
  19, // 223
  19, // 224
  26, // 225
  20, // 226
  20, // 227
  20, // 228
  20, // 229
  26, // 230
  18, // 231
  18, // 232
  18, // 233
  18, // 234
  18, // 235
  18, // 236
  18, // 237
  18, // 238
  18, // 239
  26, // 240
  21, // 241
  21, // 242
  21, // 243
  21, // 244
  21, // 245
  21, // 246
  21, // 247
  21, // 248
  21, // 249
  21, // 250
  22, // 251
  22, // 252
  22, // 253
  22, // 254
  22, // 255
  23, // 256
  23, // 257
  23, // 258
  23, // 259
  23, // 260
  19, // 261
  19, // 262
  19, // 263
  19, // 264
  26, // 265
  21, // 266
  21, // 267
  21, // 268
  21, // 269
  26, // 270
  24, // 271
  24, // 272
  24, // 273
  24, // 274
  24, // 275
  24, // 276
  24, // 277
  24, // 278
  24, // 279
  26, // 280
  25, // 281
  25, // 282
  25, // 283
  25, // 284
  25, // 285
  25, // 286
  25, // 287
  25, // 288
  25, // 289
  26, // 290
  17, // 291
  17, // 292
  17, // 293
  17, // 294
  17, // 295
  17, // 296
  17, // 297
  17, // 298
  17, // 299
  26, // 300
  32, // 301
  32, // 302
  32, // 303
  32, // 304
  32, // 305
  32, // 306
  32, // 307
  32, // 308
  32, // 309
  32, // 310
  22, // 311
  22, // 312
  22, // 313
  22, // 314
  22, // 315
  22, // 316
  22, // 317
  22, // 318
  22, // 319
  22, // 320
  22, // 321
  22, // 322
  22, // 323
  22, // 324
  22, // 325
  23, // 326
  23, // 327
  23, // 328
  23, // 329
  23, // 330
  23, // 331
  23, // 332
  23, // 333
  23, // 334
  23, // 335
  23, // 336
  23, // 337
  23, // 338
  23, // 339
  23, // 340
  23, // 341
  23, // 342
  23, // 343
  23, // 344
  23, // 345
  23, // 346
  23, // 347
  23, // 348
  23, // 349
  23, // 350
  1, // 351
  1, // 352
  1, // 353
  1, // 354
  1, // 355
  1, // 356
  1, // 357
  1, // 358
  1, // 359
  1, // 360
  1, // 361
  1, // 362
  1, // 363
  1, // 364
  1, // 365
  1, // 366
  1, // 367
  1, // 368
  1, // 369
  1, // 370
  1, // 371
  1, // 372
  1, // 373
  1, // 374
  1, // 375
  1, // 376
  1, // 377
  1, // 378
  1, // 379
  1, // 380
  1, // 381
  1, // 382
  1, // 383
  1, // 384
  1, // 385
  1, // 386
  1, // 387
  1, // 388
  1, // 389
  1, // 390
  1, // 391
  1, // 392
  1, // 393
  1, // 394
  1, // 395
  1, // 396
  29, // 397
  23, // 398
  35, // 399
  22, // 400
  29, // 401
  35, // 402
  19, // 403
  29, // 404
  17, // 405
  40, // 406
  39, // 407
  35, // 408
  32, // 409
  37, // 410
  37, // 411
  35, // 412
  38, // 413
  21, // 414
  36, // 415
  41, // 416
  22, // 417
  23, // 418
  35, // 419
  32, // 420
];

const MB2WS_STAGE_THEME_IDS = [
  0, 2, 2, 2, 2, 10, 5, 5, 5, 5,
  10, 4, 4, 4, 4, 4, 4, 4, 4, 4,
  4, 19, 6, 6, 6, 6, 6, 6, 6, 6,
  6, 2, 2, 2, 2, 10, 5, 5, 5, 5,
  10, 4, 4, 4, 4, 4, 4, 4, 4, 4,
  10, 3, 3, 3, 3, 3, 3, 3, 3, 3,
  10, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 6, 6, 6, 6, 6, 6, 6, 6, 6,
  6, 2, 2, 2, 2, 10, 5, 5, 5, 5,
  10, 4, 4, 4, 4, 4, 4, 4, 4, 4,
  10, 19, 19, 1, 1, 1, 1, 1, 1, 1,
  1, 25, 25, 25, 25, 25, 25, 25, 25, 25,
  19, 19, 19, 19, 20, 20, 20, 20, 20, 20,
  1, 19, 19, 19, 19, 19, 17, 17, 31, 31,
  31, 6, 3, 19, 20, 34, 20, 21, 6, 6,
  17, 11, 29, 19, 23, 29, 29, 29, 29, 28,
  30, 17, 17, 17, 17, 17, 17, 17, 18, 18,
  18, 18, 18, 18, 18, 18, 18, 18, 32, 14,
  12, 7, 7, 7, 7, 7, 7, 7, 7, 7, 19,
  4, 32, 32, 32, 32, 1, 10, 16, 2, 20, 8,
  8, 8, 8, 8, 8, 8, 8, 8, 10, 9, 9, 9,
  9, 9, 9, 9, 9, 9, 9, 6, 6, 6, 6, 6,
  6, 6, 6, 6, 6, 15, 15, 15, 15, 15, 15, 15,
  15, 15, 15, 10, 10, 10, 10, 10, 10, 10, 10, 10,
  10, 32, 32, 32, 32, 20, 20, 20, 20, 20, 20, 20,
  20, 20, 20, 21, 21, 21, 21, 21, 21, 21, 21, 21,
  21, 25, 25, 25, 25, 25, 19, 25, 25, 25, 25, 25,
  24, 24, 24, 24, 19, 24, 24, 24, 24, 24, 24, 22,
  22, 22, 19, 22, 22, 22, 22, 22, 22, 22, 23, 23,
  23, 23, 23, 23, 23, 23, 23, 23, 22, 22, 22, 32,
  22, 22, 22, 22, 23, 23, 23, 23, 23, 23, 23, 23,
  23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23,
  23, 23, 23, 23, 23, 1, 1, 1, 1, 1, 1, 1, 1,
  17, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 10, 18, 18,
  18, 18, 4, 18, 18, 18, 18, 1, 6, 25, 25, 7, 25,
  25, 25, 25, 6, 23, 1, 1, 1, 1, 1, 10, 29, 23,
  35, 22, 29, 35, 19, 29, 17, 40, 39, 35, 32, 37, 37,
  35, 38, 21, 36, 41, 22, 23, 35, 32, 0,
];

const SMB2_THEME_BG_NAMES: Record<number, string> = {
  2: 'bg_jun',
  3: 'bg_wat',
  4: 'bg_nig',
  5: 'bg_sun',
  6: 'bg_spa',
  7: 'bg_snd',
  8: 'bg_ice',
  9: 'bg_stm',
  10: 'bg_bns',
  11: 'bg_pil',
  13: 'bg_gol',
  14: 'bg_bow',
  15: 'bg_mst',
  16: 'bg_ending',
  17: 'bg_lav2',
  18: 'bg_wat2',
  19: 'bg_jun2',
  20: 'bg_par2',
  21: 'bg_pot2',
  22: 'bg_spa2',
  23: 'bg_ele2',
  24: 'bg_gea2',
  25: 'bg_bub2',
  26: 'bg_bns2',
  27: 'bg_fut2',
  28: 'bg_bow2',
  29: 'bg_tar2',
  32: 'bg_wha2',
  33: 'bg_gol2',
  34: 'bg_pot2',
  35: 'bg_vil2',
  36: 'bg_au_bub2',
  37: 'bg_au_par2',
  38: 'bg_au_gea2',
  39: 'bg_au_wat2',
  40: 'bg_au_tar2',
  41: 'bg_bow2',
};

const SMB2_BG_INFO_BY_NAME = {
  'bg_jun': BgInfos.Jungle,
  'bg_jun2': BgInfos.Jungle,
  'bg_wat': BgInfos.Water,
  'bg_wat2': BgInfos.Water,
  'bg_nig': BgInfos.Night,
  'bg_sun': BgInfos.Sunset,
  'bg_spa': BgInfos.Space,
  'bg_spa2': BgInfos.Space,
  'bg_snd': BgInfos.Sand,
  'bg_ice': BgInfos.Ice,
  'bg_stm': BgInfos.Storm,
  'bg_bns': BgInfos.Bonus,
  'bg_bns2': BgInfos.Bonus,
  'bg_pil': BgInfos.Target,
  'bg_gol': BgInfos.Golf,
  'bg_gol2': BgInfos.Golf,
  'bg_bow': BgInfos.Bowling,
  'bg_bow2': BgInfos.Bowling,
  'bg_mst': BgInfos.Master,
  'bg_ending': BgInfos.Ending,
} as const;

function applyPackBgInfo(stageId: number, gameSource: GameSource, baseInfo: BgInfos[keyof typeof BgInfos], fileName: string) {
  if (!hasPackForGameSource(gameSource)) {
    return { ...baseInfo, fileName };
  }
  const packEnv = getPackStageEnv(stageId);
  const packBg = packEnv?.bgInfo;
  if (!packBg) {
    return { ...baseInfo, fileName };
  }
  const packFileName = packBg.fileName || fileName;
  const mapped =
    (packFileName ? SMB2_BG_INFO_BY_NAME[packFileName as keyof typeof SMB2_BG_INFO_BY_NAME] : null) ??
    baseInfo;
  return {
    ...mapped,
    fileName: packFileName,
    clearColor: packBg.clearColor
      ? colorNewFromRGBA(packBg.clearColor[0], packBg.clearColor[1], packBg.clearColor[2], packBg.clearColor[3])
      : mapped.clearColor,
    ambientColor: packBg.ambientColor
      ? colorNewFromRGBA(packBg.ambientColor[0], packBg.ambientColor[1], packBg.ambientColor[2], 1)
      : mapped.ambientColor,
    infLightColor: packBg.infLightColor
      ? colorNewFromRGBA(packBg.infLightColor[0], packBg.infLightColor[1], packBg.infLightColor[2], 1)
      : mapped.infLightColor,
    infLightRotX: packBg.infLightRotX ?? mapped.infLightRotX,
    infLightRotY: packBg.infLightRotY ?? mapped.infLightRotY,
  };
}

function toVec3(input: { x: number; y: number; z: number }) {
  return vec3.fromValues(input.x, input.y, input.z);
}

function toVec2(input: { x: number; y: number }) {
  return vec2.fromValues(input.x, input.y);
}

function keyframesOrEmpty(list: any[] | null) {
  return list ?? [];
}

function mapAnimType(value: number) {
  switch (value) {
    case 1:
      return AnimType.Once;
    case 0:
    default:
      return AnimType.Loop;
  }
}

function mapGoalType(type: string | number) {
  if (type === 1 || type === '1' || type === 'G' || type === 'g') {
    return GoalType.Green;
  }
  if (type === 2 || type === '2' || type === 'R' || type === 'r') {
    return GoalType.Red;
  }
  return GoalType.Blue;
}

function mapBananaType(type: number) {
  return (type & 1) === 1 ? BananaType.Bunch : BananaType.Single;
}

function convertBgAnim(anim: any): BgAnim | null {
  if (!anim) {
    return null;
  }
  return {
    loopStartSeconds: anim.loopStartSeconds ?? 0,
    loopEndSeconds: anim.loopEndSeconds ?? 0,
    scaleXKeyframes: keyframesOrEmpty(anim.scaleXKeyframes),
    scaleYKeyframes: keyframesOrEmpty(anim.scaleYKeyframes),
    scaleZKeyframes: keyframesOrEmpty(anim.scaleZKeyframes),
    rotXKeyframes: keyframesOrEmpty(anim.rotXKeyframes),
    rotYKeyframes: keyframesOrEmpty(anim.rotYKeyframes),
    rotZKeyframes: keyframesOrEmpty(anim.rotZKeyframes),
    posXKeyframes: keyframesOrEmpty(anim.posXKeyframes),
    posYKeyframes: keyframesOrEmpty(anim.posYKeyframes),
    posZKeyframes: keyframesOrEmpty(anim.posZKeyframes),
    visibleKeyframes: keyframesOrEmpty(anim.visibleKeyframes),
    translucencyKeyframes: keyframesOrEmpty(anim.translucencyKeyframes),
  };
}

function convertFlipbookAnims(flipbooks: any): FlipbookAnims | null {
  if (!flipbooks) {
    return null;
  }
  return {
    nightWindowAnims: flipbooks.nightWindowAnims.map((windowAnim: any) => ({
      pos: toVec3(windowAnim.pos),
      rot: vec3.fromValues(windowAnim.rotX, windowAnim.rotY, windowAnim.rotZ),
      id: windowAnim.id,
    })),
    stormFireAnims: flipbooks.stormFireAnims.map((fireAnim: any) => ({
      pos: toVec3(fireAnim.pos),
      frameOffset: fireAnim.frameOffset,
    })),
  };
}

function convertBgObject(obj: any): BgObject {
  return {
    flags: obj.flags,
    modelName: obj.name,
    pos: toVec3(obj.pos),
    rot: vec3.fromValues(obj.rotX, obj.rotY, obj.rotZ),
    scale: toVec3(obj.scale),
    translucency: obj.translucency ?? 0,
    anim: convertBgAnim(obj.anim),
    flipbookAnims: convertFlipbookAnims(obj.flipbooks),
    textureScroll: obj.textureScroll ? { speed: toVec2(obj.textureScroll.speed) } : undefined,
  };
}

function convertStageModelInstances(list: any[]): StageModelInstance[] {
  if (!list || list.length === 0) {
    return [];
  }
  return list.map((instance) => ({
    modelName: instance.modelName ?? '',
    flags: instance.flags ?? 0,
    pos: toVec3(instance.pos),
    rot: toVec3(instance.rot),
    scale: toVec3(instance.scale),
  }));
}

export function getSmb2StageInfo(stageId: number): StageInfo {
  const themeId = SMB2_STAGE_THEME_IDS[stageId] ?? 0;
  const fileName = SMB2_THEME_BG_NAMES[themeId] ?? '';
  const baseInfo =
    (fileName ? SMB2_BG_INFO_BY_NAME[fileName as keyof typeof SMB2_BG_INFO_BY_NAME] : null) ??
    BgInfos.Jungle;
  return {
    id: stageId as any,
    bgInfo: applyPackBgInfo(stageId, GAME_SOURCES.SMB2, baseInfo, fileName),
  };
}

export function getMb2wsStageInfo(stageId: number): StageInfo {
  const themeId = MB2WS_STAGE_THEME_IDS[stageId] ?? 0;
  const fileName = SMB2_THEME_BG_NAMES[themeId] ?? '';
  const baseInfo =
    (fileName ? SMB2_BG_INFO_BY_NAME[fileName as keyof typeof SMB2_BG_INFO_BY_NAME] : null) ??
    BgInfos.Jungle;
  return {
    id: stageId as any,
    bgInfo: applyPackBgInfo(stageId, GAME_SOURCES.MB2WS, baseInfo, fileName),
  };
}

export function convertSmb2StageDef(stage: any): Stage {
  const wormholeIdMap = new Map<any, number>();
  let nextWormholeId = 1;
  const getWormholeId = (wormhole: any): number => {
    if (!wormhole) {
      return 0;
    }
    const existing = wormholeIdMap.get(wormhole);
    if (existing !== undefined) {
      return existing;
    }
    const id = nextWormholeId++;
    wormholeIdMap.set(wormhole, id);
    return id;
  };
  const convertWormhole = (wormhole: any, defaultAnimGroupIndex: number) => ({
    pos: toVec3(wormhole.pos),
    rot: toVec3(wormhole.rot),
    wormholeId: getWormholeId(wormhole),
    destWormholeId: wormhole.dest ? getWormholeId(wormhole.dest) : null,
    animGroupIndex: wormhole.animGroupIndex ?? defaultAnimGroupIndex,
  });

  const animGroups = stage.animGroups.map((group: any, groupIndex: number) => ({
    originPos: toVec3(group.origin ?? group.initPos),
    originRot: toVec3(group.initRot),
    animType: mapAnimType(group.animLoopType ?? 0),
    anim: group.anim
      ? {
          rotXKeyframes: keyframesOrEmpty(group.anim.rotXKeyframes),
          rotYKeyframes: keyframesOrEmpty(group.anim.rotYKeyframes),
          rotZKeyframes: keyframesOrEmpty(group.anim.rotZKeyframes),
          posXKeyframes: keyframesOrEmpty(group.anim.posXKeyframes),
          posYKeyframes: keyframesOrEmpty(group.anim.posYKeyframes),
          posZKeyframes: keyframesOrEmpty(group.anim.posZKeyframes),
        }
      : null,
    textureScroll: group.textureScroll ? { speed: toVec2(group.textureScroll.speed) } : undefined,
    coliTris: group.triangles.map((tri: any) => ({
      pos: toVec3(tri.pos),
      normal: toVec3(tri.normal),
      rot: toVec3(tri.rot),
      vert2: toVec2(tri.vert2),
      vert3: toVec2(tri.vert3),
      edge2Normal: toVec2(tri.edge2Normal),
      edge3Normal: toVec2(tri.edge3Normal),
    })),
    gridCellTris: group.gridCellTris ?? [],
    gridOriginX: group.gridOriginX ?? 0,
    gridOriginZ: group.gridOriginZ ?? 0,
    gridStepX: group.gridStepX ?? 0,
    gridStepZ: group.gridStepZ ?? 0,
    gridCellCountX: group.gridCellCountX ?? 0,
    gridCellCountZ: group.gridCellCountZ ?? 0,
    goals: group.goals.map((goal: any) => ({
      pos: toVec3(goal.pos),
      rot: toVec3(goal.rot),
      type: mapGoalType(goal.type),
    })),
    bumpers: group.bumpers.map((bumper: any) => ({
      pos: toVec3(bumper.pos),
      rot: toVec3(bumper.rot),
      scale: toVec3(bumper.scale),
    })),
    jamabars: group.jamabars.map((jamabar: any) => ({
      pos: toVec3(jamabar.pos),
      rot: toVec3(jamabar.rot),
      scale: toVec3(jamabar.scale),
    })),
    wormholes: (group.wormholes ?? []).map((wormhole: any) => convertWormhole(wormhole, groupIndex)),
    bananas: group.bananas.map((banana: any) => ({
      pos: toVec3(banana.pos),
      type: mapBananaType(banana.type),
    })),
    coliCones: group.coliCones.map((cone: any) => ({
      pos: toVec3(cone.pos),
      rot: toVec3(cone.rot),
      scale: toVec3(cone.scale),
    })),
    coliSpheres: group.coliSpheres.map((sphere: any) => ({
      pos: toVec3(sphere.pos),
      radius: sphere.radius,
    })),
    coliCylinders: group.coliCylinders.map((cylinder: any) => ({
      pos: toVec3(cylinder.pos),
      radius: cylinder.radius,
      height: cylinder.height,
      rot: toVec3(cylinder.rot),
    })),
    animGroupModels: (group.stageModelNames ?? []).map((modelName: string) => ({
      flags: 0,
      modelName,
    })),
    stageModelInstances: convertStageModelInstances(group.stageModelInstances),
    loopStartSeconds: group.loopStartSeconds ?? 0,
    loopEndSeconds: group.loopEndSeconds ?? 0,
  }));

  const stageWormholes = (stage.wormholes ?? []).map((wormhole: any) => convertWormhole(wormhole, 0));
  if (stage.wormholes?.length) {
    const ag0Wormholes = animGroups[0]?.wormholes ?? [];
    const ag0WormholeIds = new Set<number>(ag0Wormholes.map((wormhole: any) => wormhole.wormholeId ?? 0));
    animGroups[0].wormholes.push(
      ...stageWormholes.filter((wormhole: any) => !ag0WormholeIds.has(wormhole.wormholeId ?? 0))
    );
  }

  const start = stage.startPositions?.[0];
  return {
    loopStartSeconds: stage.loopStartSeconds ?? 0,
    loopEndSeconds: stage.loopEndSeconds ?? 0,
    animGroups,
    initBallPose: {
      pos: toVec3(start?.pos ?? { x: 0, y: 0, z: 0 }),
      rot: toVec3(start?.rot ?? { x: 0, y: 0, z: 0 }),
    },
    falloutPlane: { y: stage.fallOutY ?? 0 },
    goals: stage.goals.map((goal: any) => ({
      pos: toVec3(goal.pos),
      rot: toVec3(goal.rot),
      type: mapGoalType(goal.type),
    })),
    bumpers: stage.bumpers.map((bumper: any) => ({
      pos: toVec3(bumper.pos),
      rot: toVec3(bumper.rot),
      scale: toVec3(bumper.scale),
    })),
    jamabars: stage.jamabars.map((jamabar: any) => ({
      pos: toVec3(jamabar.pos),
      rot: toVec3(jamabar.rot),
      scale: toVec3(jamabar.scale),
    })),
    bananas: stage.bananas.map((banana: any) => ({
      pos: toVec3(banana.pos),
      type: mapBananaType(banana.type),
    })),
    wormholes: stageWormholes,
    levelModels: [],
    bgObjects: stage.bgObjects.map(convertBgObject),
    fgObjects: stage.fgObjects.map(convertBgObject),
  };
}
