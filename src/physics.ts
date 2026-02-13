import { mat3, mat4, vec3 } from 'gl-matrix';
import { BALL_FLAGS, BALL_STATES, COLI_FLAGS } from './shared/constants/index.js';
import {
  MatrixStack,
  atan2S16,
  quatFromDirs,
  quatFromAxisAngle,
  quatMul,
  quatNormalize,
  sqrt,
  sumSq2,
  toS16,
  vecCross,
  vecDotNormalized,
  vecLen,
  vecNormalizeLen,
  vecSetLen,
} from './math.js';
import {
  applySeesawCollision,
  collideBallWithStage,
  collideBallWithStageObjects,
  collideBallWithBonusWave,
  raycastStageDown,
  testLineIntersectsRect,
  tfPhysballToAnimGroupSpace,
} from './collision.js';
import {
  spawnCollisionStars,
  spawnMovementSparks,
  spawnPostGoalSparkle,
} from './effects.js';

const RAD_TO_S16 = 0x8000 / Math.PI;
const FLT_EPSILON = 1.1920929e-7;
export const GOAL_FLOAT_FRAMES = 90;
const WORMHOLE_TRIGGER_HEIGHT = 4;
const WORMHOLE_TRIGGER_WIDTH = 4;
const WORMHOLE_TRIGGER_OFFSET_Y = 2;
const WORMHOLE_OFFSET_Y = 2.2;
const WORMHOLE_COOLDOWN_FRAMES = 30;
const stack = new MatrixStack();
const rotYTmp = { value: 0 };
const rotXTmp = { value: 0 };
const rotZTmp = { value: 0 };
const adjustPlanePoint = { x: 0, y: 0, z: 0 };
const adjustPlaneNormal = { x: 0, y: 0, z: 0 };
const adjustSp38 = { x: 0, y: 0, z: 0 };
const adjustSp44 = { x: 0, y: 0, z: 0 };
const adjustSp2C = { x: 0, y: 0, z: 0 };
const adjustSp20 = { x: 0, y: 0, z: 0 };
const adjustSp14 = { x: 0, y: 0, z: 0 };
const movementTmp = { x: 0, y: 0, z: 0 };
const planeNormalWorldTmp = { x: 0, y: 0, z: 0 };
const contactOffsetTmp = { x: 0, y: 0, z: 0 };
const movementLocalTmp = { x: 0, y: 0, z: 0 };
const axisTmp = { x: 0, y: 0, z: 0 };
const accelTmp = { x: 0, y: 0, z: 0 };
const wormholeUnitY = { x: 0, y: 1, z: 0 };
const wormholeForwardPoint = { x: 0, y: 0, z: -1 };
const wormholeBackwardPoint = { x: 0, y: 0, z: 1 };
const wormholeEye = { x: 0, y: 0, z: 0 };
const wormholeUp = { x: 0, y: 0, z: 0 };
const wormholeTarget = { x: 0, y: 0, z: 0 };
const wormholeVecA = vec3.create();
const wormholeVecB = vec3.create();
const wormholeVecC = vec3.create();
const wormholeMatA = mat4.create();
const wormholeMatB = mat4.create();
const wormholeMatC = mat4.create();
const wormholeMat3 = mat3.create();
const wormholeTfScratch = mat4.create();
const wormholeDestPosScratch = { x: 0, y: 0, z: 0 };
const wormholeTriggerScratch = {
  pos: { x: 0, y: WORMHOLE_TRIGGER_OFFSET_Y, z: 0 },
  rot: { x: 0, y: 0, z: 0 },
  width: WORMHOLE_TRIGGER_WIDTH,
  height: WORMHOLE_TRIGGER_HEIGHT,
};
const goalTriggerScratch = {
  pos: { x: 0, y: 1, z: 0 },
  rot: { x: 0, y: 0, z: 0 },
  width: 2,
  height: 2,
};
const apeForwardScratch = { x: 0, y: 0, z: -1 };
const apeBasis64 = { x: 0, y: 0, z: 0 };
const apeBasis58 = { x: 0, y: 0, z: 0 };
const apeBasis4C = { x: 0, y: 0, z: 0 };
const apeBasis40 = { x: 0, y: 0, z: 0 };
const apeBasis34 = { x: 0, y: 0, z: 0 };
const apeBasis28 = { x: 0, y: 0, z: 0 };
const apeBasis1C = { x: 0, y: 0, z: 0 };
const apeBaseTmpQuat = { x: 0, y: 0, z: 0, w: 1 };
const apeBaseUpA = { x: 0, y: 1, z: 0 };
const apeBaseUpB = { x: 0, y: 1, z: 0 };
const apeBaseQuat = { x: 0, y: 0, z: 0, w: 1 };
const apeBaseCross = { x: 0, y: 1, z: 0 };
const unitVecX = { x: 1, y: 0, z: 0 };
const unitVecY = { x: 0, y: 1, z: 0 };
const unitVecZ = { x: 0, y: 0, z: 1 };
const apeForwardSmb1 = { x: -1, y: 0, z: 0 };
const apeForwardSmb2 = { x: 0, y: 0, z: -1 };
const apeVelDir = { x: 0, y: 0, z: 0 };
const apeVelAxis = { x: 0, y: 0, z: 0 };
const apeVelQuat = { x: 0, y: 0, z: 0, w: 1 };
const apeSpinMtx = new Float32Array(12);
const apeSpinDir = { x: 0, y: 0, z: 0 };
const apeSpinQuat = { x: 0, y: 0, z: 0, w: 1 };
const apeSpinUp = { x: 0, y: 1, z: 0 };
const seesawBall = {
  pos: { x: 0, y: 0, z: 0 },
  prevPos: { x: 0, y: 0, z: 0 },
  vel: { x: 0, y: 0, z: 0 },
  animGroupId: 0,
};
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export const stepBallPerf = {
  enabled: false,
  logEvery: 120,
  callCount: 0,
  totalMs: 0,
  integrateMs: 0,
  stageMeshMs: 0,
  effectsMs: 0,
  orientationMs: 0,
  stageObjectsMs: 0,
  wormholeMs: 0,
  lastTotalMs: 0,
  lastIntegrateMs: 0,
  lastStageMeshMs: 0,
  lastEffectsMs: 0,
  lastOrientationMs: 0,
  lastStageObjectsMs: 0,
  lastWormholeMs: 0,
};

export function createBallState() {
  return {
    playerId: 0,
    pos: { x: 0, y: 0, z: 0 },
    prevPos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    flags: 0,
    state: BALL_STATES.READY,
    startPos: { x: 0, y: 0, z: 0 },
    startRotY: 0,
    goalTimer: 0,
    currRadius: 0.5,
    accel: 0.009799992,
    restitution: 0.5,
    unk60: 0,
    unk62: 0,
    unk64: 0,
    unk80: 0,
    unk92: 0,
    apeYaw: 0,
    unkA8: { x: 0, y: 0, z: 0, w: 1 },
    unkB8: { x: 0, y: 0, z: 0 },
    unkC4: 0,
    unkF8: 0,
    apeQuat: { x: 0, y: 0, z: 0, w: 1 },
    apeFlags: 0,
    transform: new Float32Array(12),
    prevTransform: new Float32Array(12),
    unk114: { x: 0, y: 1, z: 0 },
    deltaQuat: { x: 0, y: 0, z: 0, w: 1 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    prevOrientation: { x: 0, y: 0, z: 0, w: 1 },
    speed: 0,
    bananas: 0,
    audio: {
      lastImpactFrame: -9999,
      rollingVol: 0,
      rollingPitch: 0,
      bumperHit: false,
      lastColiSpeed: 0,
      lastColiFlags: 0,
    },
    wormholeCooldown: 0,
    wormholeTransform: null,
    wormholeTraversal: null,
    physBall: createPhysicsBall(),
  };
}

function getInitApeYaw(startRotY, stageFormat = 'smb1') {
  if (stageFormat === 'smb2') {
    return toS16(startRotY);
  }
  return toS16(startRotY - 0x4000);
}

function createPhysicsBall() {
  return {
    flags: 0,
    pos: { x: 0, y: 0, z: 0 },
    prevPos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    radius: 0.5,
    gravityAccel: 0.009799992,
    restitution: 0.5,
    hardestColiSpeed: 0,
    hardestColiPlane: {
      point: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
    },
    hardestColiAnimGroupId: 0,
    friction: 0.01,
    frictionMode: 'smb1',
    animGroupId: 0,
  };
}

export function resetBall(ball, startPos, startRotY = ball.startRotY, stageFormat = 'smb1') {
  ball.pos.x = startPos.x;
  ball.pos.y = startPos.y;
  ball.pos.z = startPos.z;
  ball.prevPos.x = startPos.x;
  ball.prevPos.y = startPos.y;
  ball.prevPos.z = startPos.z;
  ball.vel.x = 0;
  ball.vel.y = 0;
  ball.vel.z = 0;
  ball.rotX = 0;
  ball.rotY = 0;
  ball.rotZ = 0;
  ball.flags = 0;
  ball.state = BALL_STATES.PLAY;
  ball.goalTimer = 0;
  ball.startRotY = startRotY;
  const initApeYaw = getInitApeYaw(startRotY, stageFormat);
  ball.unk80 = 0;
  ball.unk92 = 0;
  ball.apeYaw = initApeYaw;
  ball.unkA8.x = 0;
  ball.unkA8.y = 0;
  ball.unkA8.z = 0;
  ball.unkA8.w = 1;
  ball.unkB8.x = 0;
  ball.unkB8.y = 0;
  ball.unkB8.z = 0;
  ball.unkC4 = 0;
  ball.unkF8 = 0;
  setApeQuatFromYaw(ball, initApeYaw);
  ball.apeFlags = 0;
  ball.unk114.x = 0;
  ball.unk114.y = 1;
  ball.unk114.z = 0;
  ball.deltaQuat.x = 0;
  ball.deltaQuat.y = 0;
  ball.deltaQuat.z = 0;
  ball.deltaQuat.w = 1;
  ball.orientation.x = 0;
  ball.orientation.y = 0;
  ball.orientation.z = 0;
  ball.orientation.w = 1;
  ball.prevOrientation.x = ball.orientation.x;
  ball.prevOrientation.y = ball.orientation.y;
  ball.prevOrientation.z = ball.orientation.z;
  ball.prevOrientation.w = ball.orientation.w;
  ball.wormholeCooldown = 0;
  ball.wormholeTransform = null;
  ball.wormholeTraversal = null;
  updateBallTransform(ball);
  ball.prevTransform.set(ball.transform);
}

export function initBallForStage(ball, startPos, startRotY, stageFormat = 'smb1') {
  ball.startPos.x = startPos.x;
  ball.startPos.y = startPos.y;
  ball.startPos.z = startPos.z;
  ball.startRotY = startRotY;
  ball.flags = BALL_FLAGS.INVISIBLE;
  ball.state = BALL_STATES.READY;
  ball.goalTimer = 0;
  ball.vel.x = 0;
  ball.vel.y = 0;
  ball.vel.z = 0;
  ball.rotX = 0;
  ball.rotY = 0;
  ball.rotZ = 0;
  const dropFrames = 24;
  const dropOffset = ((ball.accel * dropFrames) * dropFrames) * 0.5;
  ball.pos.x = startPos.x;
  ball.pos.y = startPos.y + dropOffset;
  ball.pos.z = startPos.z;
  ball.prevPos.x = ball.pos.x;
  ball.prevPos.y = ball.pos.y;
  ball.prevPos.z = ball.pos.z;
  const initApeYaw = getInitApeYaw(startRotY, stageFormat);
  ball.unk80 = 0;
  ball.unk92 = 0;
  ball.apeYaw = initApeYaw;
  ball.unkA8.x = 0;
  ball.unkA8.y = 0;
  ball.unkA8.z = 0;
  ball.unkA8.w = 1;
  ball.unkB8.x = 0;
  ball.unkB8.y = 0;
  ball.unkB8.z = 0;
  ball.unkC4 = 0;
  ball.unkF8 = 0;
  setApeQuatFromYaw(ball, initApeYaw);
  ball.apeFlags = 0;
  ball.unk114.x = 0;
  ball.unk114.y = 1;
  ball.unk114.z = 0;
  ball.deltaQuat.x = 0;
  ball.deltaQuat.y = 0;
  ball.deltaQuat.z = 0;
  ball.deltaQuat.w = 1;
  ball.orientation.x = 0;
  ball.orientation.y = 0;
  ball.orientation.z = 0;
  ball.orientation.w = 1;
  ball.prevOrientation.x = ball.orientation.x;
  ball.prevOrientation.y = ball.orientation.y;
  ball.prevOrientation.z = ball.orientation.z;
  ball.prevOrientation.w = ball.orientation.w;
  ball.wormholeCooldown = 0;
  ball.wormholeTransform = null;
  ball.wormholeTraversal = null;
  updateBallTransform(ball);
  ball.prevTransform.set(ball.transform);
}

export function startBallDrop(ball, frames = 24, stageFormat = 'smb1') {
  const f4 = frames;
  if (f4 <= 0) {
    return;
  }
  ball.prevPos.x = ball.pos.x;
  ball.prevPos.y = ball.pos.y;
  ball.prevPos.z = ball.pos.z;

  const f2 = (ball.startPos.y - ball.pos.y) / f4;
  ball.vel.x = 0;
  ball.vel.y = (ball.accel * f4) * 0.5 + f2;
  ball.vel.z = 0;

  ball.rotX = 0x2000;
  ball.rotY = toS16(ball.startRotY - 0x4000);
  ball.rotZ = 0;

  stack.fromIdentity();
  stack.rotateY(ball.rotY);
  stack.rotateX(ball.rotX);
  stack.rotateZ(ball.rotZ);
  stack.toQuat(ball.orientation);

  ball.flags &= ~BALL_FLAGS.INVISIBLE;
  ball.flags |= BALL_FLAGS.FLAG_14;
  ball.state = BALL_STATES.PLAY;
  const initApeYaw = getInitApeYaw(ball.startRotY, stageFormat);
  ball.unk80 = 0;
  ball.unk92 = 0;
  ball.apeYaw = initApeYaw;
  setApeQuatFromYaw(ball, initApeYaw);
  ball.apeFlags = 0;
  ball.wormholeCooldown = 0;
  ball.wormholeTransform = null;
  ball.wormholeTraversal = null;
  updateBallTransform(ball);
  ball.prevTransform.set(ball.transform);
}

export function resolveBallBallCollision(ballA, ballB) {
  const dx = ballB.pos.x - ballA.pos.x;
  const dy = ballB.pos.y - ballA.pos.y;
  const dz = ballB.pos.z - ballA.pos.z;
  const minDist = (ballA.currRadius ?? 0.5) + (ballB.currRadius ?? 0.5);
  const distSq = dx * dx + dy * dy + dz * dz;
  if (distSq <= FLT_EPSILON || distSq >= minDist * minDist) {
    return;
  }
  const dist = sqrt(distSq);
  const nx = dx / dist;
  const ny = dy / dist;
  const nz = dz / dist;
  const overlap = minDist - dist;
  const correction = overlap * 0.5;
  ballA.pos.x -= nx * correction;
  ballA.pos.y -= ny * correction;
  ballA.pos.z -= nz * correction;
  ballB.pos.x += nx * correction;
  ballB.pos.y += ny * correction;
  ballB.pos.z += nz * correction;

  const rvx = ballB.vel.x - ballA.vel.x;
  const rvy = ballB.vel.y - ballA.vel.y;
  const rvz = ballB.vel.z - ballA.vel.z;
  const relVel = rvx * nx + rvy * ny + rvz * nz;
  if (relVel >= 0) {
    return;
  }
  const restitution = (ballA.restitution + ballB.restitution) * 0.5;
  const impulse = -((1 + restitution) * relVel) * 0.5;
  ballA.vel.x -= impulse * nx;
  ballA.vel.y -= impulse * ny;
  ballA.vel.z -= impulse * nz;
  ballB.vel.x += impulse * nx;
  ballB.vel.y += impulse * ny;
  ballB.vel.z += impulse * nz;
}

function updateBallCameraSteerYaw(ball, stageFormat) {
  const speed = sqrt(sumSq2(ball.vel.x, ball.vel.z));
  let velYaw = 0;
  if (speed > FLT_EPSILON) {
    velYaw = atan2S16(ball.vel.x, ball.vel.z) - 0x8000;
  }

  if (stageFormat === 'smb2') {
    // SMB2 g_ball_ape_rotation uses ape->chara_rotation transformed -Z as the orientation source.
    stack.fromQuat(ball.apeQuat);
    const apeForward = apeForwardScratch;
    apeForward.x = 0;
    apeForward.y = 0;
    apeForward.z = -1;
    stack.tfVec(apeForward, apeForward);
    const apeYaw = toS16(atan2S16(apeForward.x, apeForward.z) - 0x8000);

    let blend = 0;
    if (speed >= 0.37037037037037035) {
      blend = 1;
    } else if (speed >= 0.23148148148148145) {
      blend = (speed - 0.23148148148148145) / 0.1388888888888889;
    }

    const delta = toS16(velYaw - apeYaw);
    ball.unk92 = toS16(apeYaw + delta * blend);
    return;
  }

  let blend = 0;
  if (speed >= 0.37037037037037035) {
    blend = 1;
  } else if (speed >= 0.23148148148148145) {
    blend = (speed - 0.23148148148148145) / 0.1388888888888889;
  }

  const delta = toS16(velYaw - ball.apeYaw);
  ball.unk92 = toS16(ball.apeYaw + delta * blend);
}

function updateBallTransform(ball) {
  stack.fromQuat(ball.orientation);
  stack.setTranslate(ball.pos);
  stack.toMtx(ball.transform);
}

function setApeQuatFromYaw(ball, yaw) {
  stack.fromIdentity();
  stack.rotateY(toS16(yaw));
  stack.toQuat(ball.apeQuat);
}

function updateBallApeBasis(ball) {
  const sp64 = apeBasis64;
  const sp58 = apeBasis58;
  const sp4C = apeBasis4C;
  const sp40 = apeBasis40;
  const sp34 = apeBasis34;
  const sp28 = apeBasis28;
  const sp1C = apeBasis1C;

  stack.fromMtx(ball.transform);
  ball.unkC4 = vecLen(ball.unkB8);
  stack.tfVec(unitVecY, sp58);
  stack.tfVec(unitVecX, sp40);
  stack.tfVec(unitVecZ, sp28);
  sp1C.x = 0;
  sp1C.y = -ball.currRadius;
  sp1C.z = 0;
  stack.rigidInvTfVec(sp1C, sp1C);

  stack.fromMtx(ball.prevTransform);
  stack.tfVec(sp1C, ball.unkB8);
  ball.unkB8.y += ball.currRadius;
  stack.tfVec(unitVecY, sp64);
  stack.tfVec(unitVecX, sp4C);
  stack.tfVec(unitVecZ, sp34);

  let f31 = vecDotNormalized(sp64, sp58);
  let f1 = vecDotNormalized(sp4C, sp40);
  if (f31 > f1) {
    f31 = f1;
    sp64.x = sp4C.x;
    sp64.y = sp4C.y;
    sp64.z = sp4C.z;
    sp58.x = sp40.x;
    sp58.y = sp40.y;
    sp58.z = sp40.z;
  }
  f1 = vecDotNormalized(sp34, sp28);
  if (f31 > f1) {
    f31 = f1;
    sp64.x = sp34.x;
    sp64.y = sp34.y;
    sp64.z = sp34.z;
    sp58.x = sp28.x;
    sp58.y = sp28.y;
    sp58.z = sp28.z;
  }

  if (f31 > -0.9998 && f31 < 0.9998) {
    quatFromDirs(ball.unkA8, sp64, sp58);
  } else {
    ball.unkA8.x = 0;
    ball.unkA8.y = 0;
    ball.unkA8.z = 0;
    ball.unkA8.w = 1;
  }
}

function updateApeBaseOrientation(ball) {
  const tmpQuat = apeBaseTmpQuat;
  tmpQuat.x = ball.unkA8.x;
  tmpQuat.y = ball.unkA8.y;
  tmpQuat.z = ball.unkA8.z;
  tmpQuat.w = ball.unkA8.w;
  tmpQuat.w /= 0.65;
  tmpQuat.x *= 0.65;
  tmpQuat.y *= 0.65;
  tmpQuat.z *= 0.65;
  quatNormalize(tmpQuat);

  stack.fromQuat(tmpQuat);
  stack.toMtx(stack.mtxB);
  stack.fromQuat(ball.apeQuat);
  stack.normalizeBasis();
  stack.multLeft(stack.mtxB);
  stack.normalizeBasis();

  if (!(ball.flags & BALL_FLAGS.FLAG_05)) {
    const f31 = vecLen(ball.vel);
    const f1 = vecLen(ball.unkB8);
    if (f31 > 0.032407406717538834) {
      if (f1 * 100.0 < ball.unkC4) {
        ball.flags |= BALL_FLAGS.FLAG_05;
      } else if (f1 * 3.0 < ball.unkC4 && f31 * 1.5 < ball.unkF8) {
        ball.flags |= BALL_FLAGS.FLAG_05;
      }
    }
  }

  if (tmpQuat.w < 0.9941) {
    return false;
  }

  stack.toMtx(stack.mtxB);
  const sp48 = apeBaseUpA;
  sp48.x = 0;
  sp48.y = 1;
  sp48.z = 0;
  stack.rigidInvTfVec(sp48, sp48);
  const sp3C = apeBaseUpB;
  sp3C.x = 0;
  sp3C.y = 1;
  sp3C.z = 0;
  const f1 = 1.0 - vecDotNormalized(sp48, sp3C);
  const quat = apeBaseQuat;
  quat.x = 0;
  quat.y = 0;
  quat.z = 0;
  quat.w = 1;
  if (f1 > 0.01) {
    const sp30 = apeBaseCross;
    sp30.x = 0;
    sp30.y = 1;
    sp30.z = 0;
    if (f1 > 1.999) {
      sp48.x = 1;
      sp48.y = 0;
      sp48.z = 0;
    } else {
      vecCross(sp30, sp48, sp48);
    }
    quatFromAxisAngle(sp48, 0x38e, quat);
  } else {
    quatFromDirs(quat, unitVecY, sp48);
  }

  quatNormalize(quat);
  stack.fromQuat(quat);
  stack.normalizeBasis();
  stack.multLeft(stack.mtxB);
  return true;
}

function updateApeFromVelocity(ball, stageFormat = 'smb1') {
  const sp4C = apeVelDir;
  sp4C.x = ball.vel.x;
  sp4C.y = 0;
  sp4C.z = ball.vel.z;
  if (vecLen(sp4C) < 0.00027777777) {
    return 0;
  }

  vecNormalizeLen(sp4C);
  stack.rigidInvTfVec(sp4C, sp4C);

  const isSmb2 = stageFormat === 'smb2';
  const forwardBasis = isSmb2 ? apeForwardSmb2 : apeForwardSmb1;
  const sp40 = apeVelAxis;
  sp40.x = 0;
  sp40.y = 0;
  sp40.z = 0;
  let var1 = isSmb2 ? sp4C.z : sp4C.x;
  const quat = apeVelQuat;
  quat.x = 0;
  quat.y = 0;
  quat.z = 0;
  quat.w = 1;
  if (var1 > -0.992) {
    var1 = 1.0 - var1;
    if (var1 > 9.99999993922529e-09) {
      vecCross(forwardBasis, sp4C, sp40);
    } else {
      sp40.x = 0;
      sp40.y = 1;
      sp40.z = 0;
    }
    quatFromAxisAngle(sp40, 0x2d8, quat);
  } else {
    quatFromDirs(quat, forwardBasis, sp4C);
  }

  stack.push();
  stack.fromQuat(quat);
  stack.normalizeBasis();
  stack.toMtx(stack.mtxB);
  stack.pop();
  stack.multRight(stack.mtxB);
  return vecLen(ball.unkB8) * 1.5;
}

function updateApeSpinCompensation(stageFormat = 'smb1') {
  const tmp = apeSpinMtx;
  stack.toMtx(tmp);
  const sp24 = apeSpinDir;
  sp24.x = 0;
  sp24.y = 0;
  sp24.z = 0;
  if (stageFormat === 'smb2') {
    stack.tfVec(apeForwardSmb2, sp24);
  } else {
    stack.tfVec(apeForwardSmb1, sp24);
  }
  const quat = apeSpinQuat;
  quat.x = 0;
  quat.y = 0;
  quat.z = 0;
  quat.w = 1;
  if (sp24.y < 0.99) {
    const sp18 = apeSpinUp;
    sp18.x = 0;
    sp18.y = 1;
    sp18.z = 0;
    vecCross(sp24, sp18, sp24);
    quatFromAxisAngle(sp24, 0x38e, quat);
  } else {
    quatFromDirs(quat, sp24, apeSpinUp);
  }
  stack.fromQuat(quat);
  stack.normalizeBasis();
  stack.multRight(tmp);
}

function updateApeOrientation(ball, physBall, stageRuntime) {
  const APE_FLAG_ON_GROUND = 1 << 0;
  const APE_FLAG_IN_AIR = 1 << 1;
  const stageFormat = stageRuntime?.stage?.format ?? 'smb1';
  ball.apeFlags &= ~0x3;

  const rayHit = raycastStageDown(ball.pos, stageRuntime);
  if (!rayHit && ball.vel.y < -0.16203702986240387) {
    ball.apeFlags |= APE_FLAG_IN_AIR;
  } else if (vecLen(ball.unkB8) < 0.00027777777) {
    ball.apeFlags |= APE_FLAG_ON_GROUND;
  }

  let r27 = (ball.flags & BALL_FLAGS.GOAL) !== 0;
  r27 = r27 || !(ball.apeFlags & 0x3);

  updateApeBaseOrientation(ball);
  if (r27) {
    updateApeFromVelocity(ball, stageFormat);
  } else {
    stack.fromQuat(ball.apeQuat);
    stack.normalizeBasis();
    if (ball.apeFlags & APE_FLAG_IN_AIR) {
      updateApeSpinCompensation(stageFormat);
    }
  }

  stack.toQuat(ball.apeQuat);

  const tmpDir = stageFormat === 'smb2'
    ? { x: 0, y: 0, z: -1 }
    : { x: -1, y: 0, z: 0 };
  stack.fromQuat(ball.apeQuat);
  stack.tfVec(tmpDir, tmpDir);
  ball.apeYaw = toS16(atan2S16(tmpDir.x, tmpDir.z) - 0x8000);
}

export function startGoal(ball) {
  ball.state = BALL_STATES.GOAL_MAIN;
  ball.flags |= BALL_FLAGS.GOAL | BALL_FLAGS.FLAG_08 | BALL_FLAGS.FLAG_10;
  if (ball.flags & (BALL_FLAGS.GOAL | BALL_FLAGS.FLAG_13)) {
    ball.flags |= BALL_FLAGS.FLAG_06;
  }
  ball.deltaQuat.x = 0;
  ball.deltaQuat.y = 0;
  ball.deltaQuat.z = 0;
  ball.deltaQuat.w = 1;
  ball.orientation.x = 0;
  ball.orientation.y = 0;
  ball.orientation.z = 0;
  ball.orientation.w = 1;
  ball.goalTimer = 0;
}

function initPhysBallFromBall(ball, physBall, stageFormat = 'smb1') {
  physBall.flags = 0;
  physBall.pos.x = ball.pos.x;
  physBall.pos.y = ball.pos.y;
  physBall.pos.z = ball.pos.z;
  physBall.prevPos.x = ball.prevPos.x;
  physBall.prevPos.y = ball.prevPos.y;
  physBall.prevPos.z = ball.prevPos.z;
  physBall.vel.x = ball.vel.x;
  physBall.vel.y = ball.vel.y;
  physBall.vel.z = ball.vel.z;
  physBall.radius = ball.currRadius;
  physBall.gravityAccel = ball.accel;
  physBall.restitution = ball.restitution;
  physBall.hardestColiSpeed = 0;
  physBall.animGroupId = 0;
  physBall.hardestColiAnimGroupId = 0;
  physBall.friction = 0.01;
  physBall.frictionMode = stageFormat === 'smb2' ? 'smb2' : 'smb1';
}

function syncBallFromPhysBall(ball, physBall) {
  if (physBall.flags & COLI_FLAGS.OCCURRED) {
    ball.flags |= BALL_FLAGS.FLAG_00;
  }
  ball.pos.x = physBall.pos.x;
  ball.pos.y = physBall.pos.y;
  ball.pos.z = physBall.pos.z;
  ball.vel.x = physBall.vel.x;
  ball.vel.y = physBall.vel.y;
  ball.vel.z = physBall.vel.z;
}

function adjustMovementForAnimGroup(ball, physBall, movement, animGroups) {
  const group = animGroups[physBall.hardestColiAnimGroupId];
  adjustPlanePoint.x = physBall.hardestColiPlane.point.x;
  adjustPlanePoint.y = physBall.hardestColiPlane.point.y;
  adjustPlanePoint.z = physBall.hardestColiPlane.point.z;
  adjustPlaneNormal.x = physBall.hardestColiPlane.normal.x;
  adjustPlaneNormal.y = physBall.hardestColiPlane.normal.y;
  adjustPlaneNormal.z = physBall.hardestColiPlane.normal.z;

  stack.fromMtx(group.transform);
  stack.tfPoint(adjustPlanePoint, adjustSp38);
  stack.tfVec(adjustPlaneNormal, adjustSp44);

  adjustSp14.x = adjustSp38.x - ball.pos.x;
  adjustSp14.y = adjustSp38.y - ball.pos.y;
  adjustSp14.z = adjustSp38.z - ball.pos.z;

  adjustSp2C.x = ball.pos.x + adjustSp14.x * adjustSp44.x;
  adjustSp2C.y = ball.pos.y + adjustSp14.y * adjustSp44.y;
  adjustSp2C.z = ball.pos.z + adjustSp14.z * adjustSp44.z;

  stack.rigidInvTfPoint(adjustSp2C, adjustSp14);

  stack.fromMtx(group.prevTransform);
  stack.tfPoint(adjustSp14, adjustSp20);

  adjustSp14.x = adjustSp2C.x - adjustSp20.x;
  adjustSp14.y = adjustSp2C.y - adjustSp20.y;
  adjustSp14.z = adjustSp2C.z - adjustSp20.z;

  movement.x -= adjustSp14.x;
  movement.y -= adjustSp14.y;
  movement.z -= adjustSp14.z;
}

function updateBallOrientation(ball) {
  quatMul(ball.orientation, ball.orientation, ball.deltaQuat);
  quatNormalize(ball.orientation);
  stack.fromQuat(ball.orientation);
  stack.toEulerYXZ(rotYTmp, rotXTmp, rotZTmp);
  ball.rotY = rotYTmp.value;
  ball.rotX = rotXTmp.value;
  ball.rotZ = rotZTmp.value;
}

function handleBallRotationalKinematics(ball, physBall, animGroups, stageRuntime, goalMode) {
  let doRot = 0;
  if (goalMode) {
    if (physBall.hardestColiSpeed < 0) {
      doRot = 1;
    }
  } else if (physBall.flags & COLI_FLAGS.OCCURRED) {
    doRot = 1;
  }

  if (!doRot) {
    if (ball.flags & BALL_FLAGS.FLAG_10) {
      ball.vel.x *= 0.95;
      ball.vel.y *= 0.95;
      ball.vel.z *= 0.95;
    }
    return;
  }

  movementTmp.x = ball.pos.x - ball.prevPos.x;
  movementTmp.y = ball.pos.y - ball.prevPos.y;
  movementTmp.z = ball.pos.z - ball.prevPos.z;
  if (physBall.hardestColiAnimGroupId > 0) {
    adjustMovementForAnimGroup(ball, physBall, movementTmp, animGroups);
  }

  const planeNormal = physBall.hardestColiPlane.normal;
  stack.fromMtx(animGroups[physBall.hardestColiAnimGroupId].transform);
  stack.tfVec(planeNormal, planeNormalWorldTmp);

  contactOffsetTmp.x = -planeNormalWorldTmp.x * ball.currRadius;
  contactOffsetTmp.y = -planeNormalWorldTmp.y * ball.currRadius;
  contactOffsetTmp.z = -planeNormalWorldTmp.z * ball.currRadius;

  stack.fromRotateY(ball.rotY);
  stack.rotateX(ball.rotX);
  stack.rotateZ(ball.rotZ);
  stack.rigidInvTfVec(contactOffsetTmp, contactOffsetTmp);

  movementLocalTmp.x = -movementTmp.x;
  movementLocalTmp.y = -movementTmp.y;
  movementLocalTmp.z = -movementTmp.z;
  stack.rigidInvTfVec(movementLocalTmp, movementLocalTmp);

  vecCross(contactOffsetTmp, movementLocalTmp, axisTmp);

  let invRadiusSq = 0;
  if (ball.currRadius > FLT_EPSILON) {
    invRadiusSq = RAD_TO_S16 / (ball.currRadius * ball.currRadius);
  }
  ball.unk60 = axisTmp.x * invRadiusSq;
  ball.unk62 = axisTmp.y * invRadiusSq;
  ball.unk64 = axisTmp.z * invRadiusSq;

  if (ball.currRadius > FLT_EPSILON) {
    let len = vecLen(axisTmp);
    if (len !== 0) {
      len = vecNormalizeLen(axisTmp);
      quatFromAxisAngle(
        axisTmp,
        (len * 2.0) / (ball.currRadius * ball.currRadius * Math.PI) * RAD_TO_S16,
        ball.deltaQuat,
      );
    }
  }
}

export function stepBall(ball, stageRuntime, world, allowEffects = true) {
  const perf = stepBallPerf;
  const perfEnabled = perf.enabled;
  const totalStart = perfEnabled ? nowMs() : 0;
  let t = totalStart;
  const stage = stageRuntime.stage;
  const animGroups = stageRuntime.animGroups;
  ball.flags &= ~BALL_FLAGS.FLAG_00;
  if (ball.state === BALL_STATES.GOAL_MAIN) {
    ball.goalTimer += 1;
    if (ball.goalTimer >= GOAL_FLOAT_FRAMES && !(ball.flags & BALL_FLAGS.FLAG_09)) {
      ball.flags &= ~(BALL_FLAGS.FLAG_08 | BALL_FLAGS.FLAG_10);
      ball.flags |= BALL_FLAGS.FLAG_09;
    }
  }
  if (ball.transform[0] === 0 && ball.transform[5] === 0 && ball.transform[10] === 0) {
    updateBallTransform(ball);
  }
  ball.prevTransform.set(ball.transform);
  ball.prevPos.x = ball.pos.x;
  ball.prevPos.y = ball.pos.y;
  ball.prevPos.z = ball.pos.z;
  ball.prevOrientation.x = ball.orientation.x;
  ball.prevOrientation.y = ball.orientation.y;
  ball.prevOrientation.z = ball.orientation.z;
  ball.prevOrientation.w = ball.orientation.w;
  ball.speed = vecLen(ball.vel);
  ball.unkF8 = ball.speed;
  ball.flags &= ~BALL_FLAGS.FLAG_05;

  accelTmp.x = 0;
  accelTmp.y = -ball.accel;
  accelTmp.z = 0;
  if (ball.flags & BALL_FLAGS.FLAG_09) {
    accelTmp.y = -accelTmp.y;
  } else if (ball.flags & BALL_FLAGS.FLAG_08) {
    accelTmp.y = 0;
  }

  stack.fromIdentity();
  stack.rotateX(world.xrot);
  stack.rotateZ(world.zrot);
  stack.rigidInvTfVec(accelTmp, accelTmp);

  ball.vel.x += accelTmp.x;
  ball.vel.y += accelTmp.y;
  ball.vel.z += accelTmp.z;

  ball.pos.x += ball.vel.x;
  ball.pos.y += ball.vel.y;
  ball.pos.z += ball.vel.z;
  if (perfEnabled) {
    const dt = nowMs() - t;
    perf.lastIntegrateMs = dt;
    perf.integrateMs += dt;
    t = nowMs();
  }

  const physBall = ball.physBall;
  initPhysBallFromBall(ball, physBall, stage.format);
  collideBallWithStage(physBall, stage, animGroups);
  const stageColiFlags = physBall.flags;
  const stageColiSpeed = physBall.hardestColiSpeed;
  if (stage.format === 'smb2' && (physBall.flags & COLI_FLAGS.OCCURRED)) {
    const seesawState = animGroups[physBall.hardestColiAnimGroupId]?.seesawState;
    if (seesawState) {
      seesawBall.pos.x = physBall.pos.x;
      seesawBall.pos.y = physBall.pos.y;
      seesawBall.pos.z = physBall.pos.z;
      seesawBall.prevPos.x = physBall.prevPos.x;
      seesawBall.prevPos.y = physBall.prevPos.y;
      seesawBall.prevPos.z = physBall.prevPos.z;
      seesawBall.vel.x = 0;
      seesawBall.vel.y = 0;
      seesawBall.vel.z = 0;
      seesawBall.animGroupId = 0;
      tfPhysballToAnimGroupSpace(seesawBall, physBall.hardestColiAnimGroupId, animGroups);
      seesawBall.vel.x = physBall.hardestColiPlane.normal.x;
      seesawBall.vel.y = physBall.hardestColiPlane.normal.y;
      seesawBall.vel.z = physBall.hardestColiPlane.normal.z;
      vecSetLen(seesawBall.vel, seesawBall.vel, physBall.hardestColiSpeed);
      applySeesawCollision(seesawBall, seesawState);
    }
  }
  if (stage.format !== 'smb2' && stage.stageId === 92 && physBall.animGroupId !== 0) {
    tfPhysballToAnimGroupSpace(physBall, 0, animGroups);
  }
  collideBallWithBonusWave(physBall, stageRuntime);
  syncBallFromPhysBall(ball, physBall);

  if (physBall.flags & COLI_FLAGS.OCCURRED) {
    if (physBall.hardestColiAnimGroupId === 0) {
      ball.unk114.x = -physBall.hardestColiPlane.normal.x;
      ball.unk114.y = -physBall.hardestColiPlane.normal.y;
      ball.unk114.z = -physBall.hardestColiPlane.normal.z;
    } else {
      stack.fromMtx(animGroups[physBall.hardestColiAnimGroupId].transform);
      stack.tfVec(physBall.hardestColiPlane.normal, ball.unk114);
      ball.unk114.x = -ball.unk114.x;
      ball.unk114.y = -ball.unk114.y;
      ball.unk114.z = -ball.unk114.z;
    }
  }
  if (perfEnabled) {
    const dt = nowMs() - t;
    perf.lastStageMeshMs = dt;
    perf.stageMeshMs += dt;
    t = nowMs();
  }

  if (allowEffects && stageRuntime.effects) {
    const onGround = (physBall.flags & COLI_FLAGS.OCCURRED) !== 0 && physBall.hardestColiPlane.normal.y > 0;
    const rng = stageRuntime.visualRng;
    spawnMovementSparks(stageRuntime.effects, ball, onGround, rng);
    if ((physBall.flags & COLI_FLAGS.OCCURRED) && physBall.hardestColiSpeed < -0.06) {
      spawnCollisionStars(stageRuntime.effects, ball, physBall.hardestColiSpeed, rng);
    }
    if (ball.state === BALL_STATES.GOAL_MAIN && (ball.unk80 & 1)) {
      spawnPostGoalSparkle(stageRuntime.effects, ball, rng);
    }
  }
  if (perfEnabled) {
    const dt = nowMs() - t;
    perf.lastEffectsMs = dt;
    perf.effectsMs += dt;
    t = nowMs();
  }

  const goalMode = ball.state === BALL_STATES.GOAL_MAIN;
  handleBallRotationalKinematics(ball, physBall, animGroups, stageRuntime, goalMode);
  updateBallOrientation(ball);
  updateBallTransform(ball);
  updateBallApeBasis(ball);
  updateApeOrientation(ball, physBall, stageRuntime);
  updateBallCameraSteerYaw(ball, stage.format);
  if (perfEnabled) {
    const dt = nowMs() - t;
    perf.lastOrientationMs = dt;
    perf.orientationMs += dt;
    t = nowMs();
  }

  initPhysBallFromBall(ball, physBall, stage.format);
  collideBallWithStageObjects(physBall, stageRuntime);
  syncBallFromPhysBall(ball, physBall);
  if (ball.audio) {
    ball.audio.lastColiFlags = stageColiFlags | physBall.flags;
    ball.audio.lastColiSpeed = Math.min(stageColiSpeed, physBall.hardestColiSpeed);
  }
  if (perfEnabled) {
    const dt = nowMs() - t;
    perf.lastStageObjectsMs = dt;
    perf.stageObjectsMs += dt;
    t = nowMs();
  }

  processBallWormholeTeleport(ball, stageRuntime);
  if (perfEnabled) {
    const dt = nowMs() - t;
    perf.lastWormholeMs = dt;
    perf.wormholeMs += dt;
  }

  ball.unk80 += 1;
  if (perfEnabled) {
    const totalMs = nowMs() - totalStart;
    perf.lastTotalMs = totalMs;
    perf.totalMs += totalMs;
    perf.callCount += 1;
    if (perf.callCount >= perf.logEvery) {
      const count = Math.max(1, perf.callCount);
      console.log(
        "[perf] ball-step-breakdown avg total=%sms integrate=%sms stage=%sms effects=%sms orient=%sms objects=%sms wormhole=%sms over=%d",
        (perf.totalMs / count).toFixed(3),
        (perf.integrateMs / count).toFixed(3),
        (perf.stageMeshMs / count).toFixed(3),
        (perf.effectsMs / count).toFixed(3),
        (perf.orientationMs / count).toFixed(3),
        (perf.stageObjectsMs / count).toFixed(3),
        (perf.wormholeMs / count).toFixed(3),
        perf.callCount,
      );
      perf.callCount = 0;
      perf.totalMs = 0;
      perf.integrateMs = 0;
      perf.stageMeshMs = 0;
      perf.effectsMs = 0;
      perf.orientationMs = 0;
      perf.stageObjectsMs = 0;
      perf.wormholeMs = 0;
    }
  }
}

export function processBallWormholeTeleport(ball, stageRuntime) {
  const stage = stageRuntime?.stage;
  if (!stage || stage.format !== 'smb2') {
    return false;
  }
  if (ball.wormholeCooldown > 0) {
    ball.wormholeCooldown -= 1;
    return false;
  }
  const hit = checkBallEnteredWormhole(ball, stageRuntime);
  if (!hit || !hit.wormhole?.dest) {
    return false;
  }
  teleportBallToWormhole(ball, stageRuntime, hit.wormhole, hit.wormhole.dest);
  ball.wormholeCooldown = WORMHOLE_COOLDOWN_FRAMES;
  return true;
}

function buildWormholeView(stageRuntime, wormhole, forwardPoint, outMat4) {
  const animGroupIndex = wormhole.animGroupIndex ?? 0;
  if (animGroupIndex > 0 && stageRuntime.animGroups[animGroupIndex]) {
    stack.fromMtx(stageRuntime.animGroups[animGroupIndex].transform);
  } else {
    stack.fromIdentity();
  }
  stack.translate(wormhole.pos);
  stack.rotateZ(wormhole.rot.z);
  stack.rotateY(wormhole.rot.y);
  stack.rotateX(wormhole.rot.x);
  stack.translateXYZ(0, WORMHOLE_OFFSET_Y, 0);
  stack.getTranslateAlt(wormholeEye);
  stack.tfVec(wormholeUnitY, wormholeUp);
  stack.tfPoint(forwardPoint, wormholeTarget);
  vec3.set(wormholeVecA, wormholeEye.x, wormholeEye.y, wormholeEye.z);
  vec3.set(wormholeVecB, wormholeTarget.x, wormholeTarget.y, wormholeTarget.z);
  vec3.set(wormholeVecC, wormholeUp.x, wormholeUp.y, wormholeUp.z);
  mat4.lookAt(outMat4, wormholeVecA, wormholeVecB, wormholeVecC);
}

function computeWormholeTransform(stageRuntime, srcWormhole, destWormhole, outMat4) {
  buildWormholeView(stageRuntime, srcWormhole, wormholeForwardPoint, wormholeMatA);
  buildWormholeView(stageRuntime, destWormhole, wormholeBackwardPoint, wormholeMatB);
  if (!mat4.invert(wormholeMatC, wormholeMatB)) {
    return false;
  }
  mat4.multiply(outMat4, wormholeMatC, wormholeMatA);
  return true;
}

function teleportBallToWormhole(ball, stageRuntime, srcWormhole, destWormhole) {
  const srcWormholeId = Number.isFinite(srcWormhole?._fileOffset) ? (srcWormhole._fileOffset | 0) : 0;
  const dstWormholeId = Number.isFinite(destWormhole?._fileOffset) ? (destWormhole._fileOffset | 0) : 0;
  const prevPosX = ball.pos.x;
  const prevPosY = ball.pos.y;
  const prevPosZ = ball.pos.z;
  const wormholeTf = wormholeTfScratch;
  if (!computeWormholeTransform(stageRuntime, srcWormhole, destWormhole, wormholeTf)) {
    const destPos = wormholeDestPosScratch;
    destPos.x = destWormhole.pos.x;
    destPos.y = destWormhole.pos.y;
    destPos.z = destWormhole.pos.z;
    const animGroupIndex = destWormhole.animGroupIndex ?? 0;
    if (animGroupIndex > 0) {
      stack.fromMtx(stageRuntime.animGroups[animGroupIndex].transform);
      stack.tfPoint(destPos, destPos);
    }
    ball.pos.x = destPos.x;
    ball.pos.y = destPos.y;
    ball.pos.z = destPos.z;
    ball.prevPos.x = destPos.x;
    ball.prevPos.y = destPos.y;
    ball.prevPos.z = destPos.z;
    updateBallTransform(ball);
    ball.prevTransform.set(ball.transform);
    if (!ball.wormholeTransform) {
      ball.wormholeTransform = mat4.create();
    }
    mat4.identity(ball.wormholeTransform);
    ball.wormholeTransform[12] = destPos.x - prevPosX;
    ball.wormholeTransform[13] = destPos.y - prevPosY;
    ball.wormholeTransform[14] = destPos.z - prevPosZ;
    ball.wormholeTraversal = {
      srcWormholeId,
      dstWormholeId,
    };
    return;
  }

  vec3.set(wormholeVecA, ball.pos.x, ball.pos.y, ball.pos.z);
  vec3.transformMat4(wormholeVecA, wormholeVecA, wormholeTf);
  ball.pos.x = wormholeVecA[0];
  ball.pos.y = wormholeVecA[1];
  ball.pos.z = wormholeVecA[2];

  vec3.set(wormholeVecA, ball.prevPos.x, ball.prevPos.y, ball.prevPos.z);
  vec3.transformMat4(wormholeVecA, wormholeVecA, wormholeTf);
  ball.prevPos.x = wormholeVecA[0];
  ball.prevPos.y = wormholeVecA[1];
  ball.prevPos.z = wormholeVecA[2];

  mat3.fromMat4(wormholeMat3, wormholeTf);
  vec3.set(wormholeVecA, ball.vel.x, ball.vel.y, ball.vel.z);
  vec3.transformMat3(wormholeVecA, wormholeVecA, wormholeMat3);
  ball.vel.x = wormholeVecA[0];
  ball.vel.y = wormholeVecA[1];
  ball.vel.z = wormholeVecA[2];

  vec3.set(wormholeVecA, ball.unk114.x, ball.unk114.y, ball.unk114.z);
  vec3.transformMat3(wormholeVecA, wormholeVecA, wormholeMat3);
  ball.unk114.x = wormholeVecA[0];
  ball.unk114.y = wormholeVecA[1];
  ball.unk114.z = wormholeVecA[2];

  updateBallTransform(ball);
  ball.prevTransform.set(ball.transform);
  if (!ball.wormholeTransform) {
    ball.wormholeTransform = mat4.create();
  }
  ball.wormholeTransform.set(wormholeTf);
  ball.wormholeTraversal = {
    srcWormholeId,
    dstWormholeId,
  };
}

function checkBallEnteredWormhole(ball, stageRuntime) {
  const stage = stageRuntime.stage;
  const animGroups = stageRuntime.animGroups;
  const physBall = ball.physBall;
  initPhysBallFromBall(ball, physBall, stage.format);
  for (let animGroupId = 0; animGroupId < stage.animGroupCount; animGroupId += 1) {
    const stageAg = stage.animGroups[animGroupId];
    const groupWormholes = stageAg.wormholes ?? [];
    const stageWormholes = animGroupId === 0 ? (stage.wormholes ?? []) : [];
    if (!groupWormholes.length && !stageWormholes.length) {
      continue;
    }
    if (animGroupId !== physBall.animGroupId) {
      tfPhysballToAnimGroupSpace(physBall, animGroupId, animGroups);
    }
    const trigger = wormholeTriggerScratch;
    for (const wormhole of groupWormholes) {
      trigger.pos.x = 0;
      trigger.pos.y = WORMHOLE_TRIGGER_OFFSET_Y;
      trigger.pos.z = 0;
      trigger.rot.x = wormhole.rot.x;
      trigger.rot.y = wormhole.rot.y;
      trigger.rot.z = wormhole.rot.z;
      stack.fromTranslate(wormhole.pos);
      stack.rotateZ(wormhole.rot.z);
      stack.rotateY(wormhole.rot.y);
      stack.rotateX(wormhole.rot.x);
      stack.tfPoint(trigger.pos, trigger.pos);
      if (testLineIntersectsRect(physBall.pos, physBall.prevPos, trigger)) {
        return { wormhole };
      }
    }
    if (stageWormholes.length === 0) {
      continue;
    }
    for (const wormhole of stageWormholes) {
      trigger.pos.x = 0;
      trigger.pos.y = WORMHOLE_TRIGGER_OFFSET_Y;
      trigger.pos.z = 0;
      trigger.rot.x = wormhole.rot.x;
      trigger.rot.y = wormhole.rot.y;
      trigger.rot.z = wormhole.rot.z;
      stack.fromTranslate(wormhole.pos);
      stack.rotateZ(wormhole.rot.z);
      stack.rotateY(wormhole.rot.y);
      stack.rotateX(wormhole.rot.x);
      stack.tfPoint(trigger.pos, trigger.pos);
      if (testLineIntersectsRect(physBall.pos, physBall.prevPos, trigger)) {
        return { wormhole };
      }
    }
  }
  if (physBall.animGroupId !== 0) {
    tfPhysballToAnimGroupSpace(physBall, 0, animGroups);
  }
  return null;
}

export function checkBallEnteredGoal(ball, stageRuntime) {
  const stage = stageRuntime.stage;
  const animGroups = stageRuntime.animGroups;
  const physBall = ball.physBall;
  initPhysBallFromBall(ball, physBall, stage.format);
  let goalId = 0;
  for (let animGroupId = 0; animGroupId < stage.animGroupCount; animGroupId += 1) {
    const stageAg = stage.animGroups[animGroupId];
    if (stageAg.goalCount > 0) {
      if (animGroupId !== physBall.animGroupId) {
        tfPhysballToAnimGroupSpace(physBall, animGroupId, animGroups);
      }
      for (const goal of stageAg.goals) {
        const trigger = goalTriggerScratch;
        trigger.pos.x = 0;
        trigger.pos.y = 1;
        trigger.pos.z = 0;
        trigger.rot.x = goal.rot.x;
        trigger.rot.y = goal.rot.y;
        trigger.rot.z = goal.rot.z;
        stack.fromTranslate(goal.pos);
        stack.rotateZ(goal.rot.z);
        stack.rotateY(goal.rot.y);
        stack.rotateX(goal.rot.x);
        stack.tfPoint(trigger.pos, trigger.pos);
        if (testLineIntersectsRect(physBall.pos, physBall.prevPos, trigger)) {
          return { goalId, animGroupId, goalType: goal.type };
        }
        goalId += 1;
      }
    }
  }
  return null;
}
