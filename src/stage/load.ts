import { lzssDecompress } from '../lzs.js';
import { fetchPackBuffer } from '../pack.js';
import ArrayBufferSlice from '../noclip/ArrayBufferSlice.js';
import { CommonNlModelID } from '../noclip/SuperMonkeyBall/NlModelInfo.js';
import { parseObj as parseNlObj } from '../noclip/SuperMonkeyBall/NaomiLib.js';
import { decompressLZ } from '../noclip/SuperMonkeyBall/AVLZ.js';
import { STAGE_BASE_PATHS } from '../shared/constants/index.js';
import { sqrt } from '../math.js';
import { parseGma } from '../gma.js';
import { parseAVTpl } from '../tpl.js';
import { parseStageDef } from './parse/index.js';
import { FLY_IN_MIN_RADIUS, SWITCH_MODEL_SUFFIXES, formatStageId } from './stage_constants.js';

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

export async function loadStageDef(
  stageId,
  basePath = STAGE_BASE_PATHS.smb1,
  gameSource = 'smb1',
  parserId = null
) {
  const id = formatStageId(stageId);
  const path = `${basePath}/st${id}/STAGE${id}.lz`;
  const buffer = await fetchPackBuffer(path);
  const decompressed = lzssDecompress(buffer);
  const view = new Uint8Array(decompressed.buffer, decompressed.byteOffset, decompressed.byteLength);
  const stage = parseStageDef(view, { gameSource, parserId });
  stage.stageId = stageId;
  stage.gameSource = gameSource;
  return stage;
}
