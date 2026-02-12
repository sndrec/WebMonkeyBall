import { COLI_FLAGS } from './shared/constants/index.js';
import {
  MatrixStack,
  atan2S16,
  floor,
  rsqrt,
  cosS16,
  sinS16,
  sqrt,
  sumSq2,
  sumSq3,
  vecDistance,
  vecDot,
  vecNormalizeLen,
  vecSetLen,
} from './math.js';

const FLT_EPSILON = 1.1920929e-7;
const GOAL_RING_MIN_DOT = 0.7732404444;
const GOAL_RING_RADIUS = 2.25;
const GOAL_RING_THICKNESS = 0.1;
const GOAL_POST_RADIUS = 0.2;
const GOAL_POST_HEIGHT = 1.5;
const BONUS_WAVE_STAGE_ID = 92;
const BONUS_WAVE_LIMIT = 10.01;
const SWITCH_COOLDOWN_FRAMES = 15;
const SWITCH_TRIGGER_RADIUS = 1.2;
const SWITCH_COLI_HEIGHT = 0.3;
const BONUS_WAVE_AMPLITUDE_BASE = 0.5;
const BONUS_WAVE_AMPLITUDE_SLOPE = -0.030833333333333333;
const BONUS_WAVE_ANGLE_SPEED = -1092.0;
const BONUS_WAVE_START_FRAME = 30.0;
const BONUS_WAVE_ANGLE_SCALE = 16384.0;
const ANIM_PLAY_ONCE = 1;
const stack = new MatrixStack();
const switchLocalCenter = { x: 0, y: 0, z: 0 };
const raycastLocalPos = { x: 0, y: 0, z: 0 };
const raycastTriPos = { x: 0, y: 0, z: 0 };
const raycastTriDir = { x: 0, y: 0, z: 0 };
const raycastHitLocal = { x: 0, y: 0, z: 0 };
const raycastHitWorld = { x: 0, y: 0, z: 0 };
const raycastNormalWorld = { x: 0, y: 0, z: 0 };
const raycastSurfacePrev = { x: 0, y: 0, z: 0 };
const raycastSurfaceCurr = { x: 0, y: 0, z: 0 };
const triPlaneScratch = {
  point: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 0 },
};
const triEdgeBallPrevPos = { x: 0, y: 0, z: 0 };
const triEdgeBallPos = { x: 0, y: 0, z: 0 };
const triEdgeLocalPrevPos = { x: 0, y: 0, z: 0 };
const triEdgeLocalPos = { x: 0, y: 0, z: 0 };
const triEdgeEndPos = { x: 0, y: 0, z: 0 };
const triEdgePlaneVec = { x: 0, y: 0, z: 0 };
const triEdgePlane = {
  point: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 0 },
};
const triEdgeScratchEdge = {
  start: { x: 0, y: 0 },
  end: { x: 0, y: 0 },
  normal: { x: 0, y: 0 },
};
const triVertTmpVec = { x: 0, y: 0, z: 0 };
const triVertScratch = { x: 0, y: 0 };
const rectPosScratch = { x: 0, y: 0, z: 0 };
const rectPrevPosScratch = { x: 0, y: 0, z: 0 };
const rectTmpVecScratch = { x: 0, y: 0, z: 0 };
const rectPosLocalScratch = { x: 0, y: 0, z: 0 };
const goalSubPosLocal = { x: 0, y: 0, z: 0 };
const goalSubPrevLocal = { x: 0, y: 0, z: 0 };
const goalRingPoint = { x: 0, y: 0, z: 0 };
const goalPlaneVec = { x: 0, y: 0, z: 0 };
const goalPlane = {
  point: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 0 },
};
const goalUpVec = { x: 0, y: -1, z: 0 };
const goalDirVec = { x: 0, y: 0, z: 0 };
const goalRingInfo = {
  center: { x: 0, y: 0, z: 0 },
  radius: GOAL_RING_RADIUS,
  thickness: GOAL_RING_THICKNESS,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
};
const goalRingInfo2 = {
  center: { x: 0, y: 0, z: 0 },
  radius: GOAL_RING_RADIUS,
  thickness: GOAL_RING_THICKNESS,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
};
const goalCyl = {
  pos: { x: 0, y: 0, z: 0 },
  rot: { x: 0, y: 0, z: 0 },
  radius: GOAL_POST_RADIUS,
  height: GOAL_POST_HEIGHT,
};
const goalCyl2 = {
  pos: { x: 0, y: 0, z: 0 },
  rot: { x: 0, y: 0, z: 0 },
  radius: GOAL_POST_RADIUS,
  height: GOAL_POST_HEIGHT,
};
const goalBagVecA = { x: 0, y: 0, z: 0 };
const goalBagVecB = { x: 0, y: 0, z: 0 };
const goalBagVecC = { x: 0, y: 0, z: 0 };
const goalBagVecD = { x: 0, y: 0, z: 0 };
const goalTapeLocalPos = { x: 0, y: 0, z: 0 };
const goalTapeDelta = { x: 0, y: 0, z: 0 };
const goalTapeImpulse = { x: 0, y: 0, z: 0 };
const goalTapeImpulseStep = { x: 0, y: 0, z: 0 };
const goalTapeNormalScratch = { x: 0, y: 0, z: 0 };
const seesawLocalPosScratch = { x: 0, y: 0, z: 0 };
const seesawLocalVelScratch = { x: 0, y: 0, z: 0 };
const switchCylinderScratch = {
  pos: { x: 0, y: 0, z: 0 },
  rot: { x: 0, y: 0, z: 0 },
  height: SWITCH_COLI_HEIGHT,
  radius: SWITCH_TRIGGER_RADIUS,
};
const switchLocalNormalScratch = { x: 0, y: 0, z: 0 };
const bumperTempPos = { x: 0, y: 0, z: 0 };
const bumperNormal = { x: 0, y: 0, z: 0 };
const cylinderTmpVec = { x: 0, y: 0, z: 0 };
const cylinderPosLocal = { x: 0, y: 0, z: 0 };
const cylinderPrevLocal = { x: 0, y: 0, z: 0 };
const cylinderCircle = {
  pos: { x: 0, y: 0, z: 0 },
  radius: 0,
  rot: { x: 0, y: 0, z: 0 },
};
const cylinderPlane = {
  point: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 0 },
};
const rectPlaneScratch = {
  point: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 0 },
};
const switchProbeBall = {
  flags: 0,
  pos: { x: 0, y: 0, z: 0 },
  prevPos: { x: 0, y: 0, z: 0 },
  vel: { x: 0, y: 0, z: 0 },
  radius: 0.5,
  gravityAccel: 0,
  restitution: 0,
  hardestColiSpeed: 0,
  hardestColiPlane: {
    point: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 1, z: 0 },
  },
  hardestColiAnimGroupId: 0,
  friction: 0,
  animGroupId: 0,
};
const physballDeltaScratch = { x: 0, y: 0, z: 0 };
const lineStartScratch = { x: 0, y: 0, z: 0 };
const lineEndScratch = { x: 0, y: 0, z: 0 };
const linePlanePointScratch = { x: 0, y: 0, z: 0 };
const jamabarBallPosScratch = { x: 0, y: 0, z: 0 };
const circleTmpVecScratch = { x: 0, y: 0, z: 0 };
const circleBallPosScratch = { x: 0, y: 0, z: 0 };
const circlePlaneScratch = {
  point: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 0 },
};
const circlePlanePointScratch = { x: 0, y: 0, z: 0 };
const sphereTmpVecScratch = { x: 0, y: 0, z: 0 };
const spherePlaneScratch = {
  point: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 0 },
};
const coneTmpVecScratch = { x: 0, y: 0, z: 0 };
const coneBallPosScratch = { x: 0, y: 0, z: 0 };
const conePlaneScratch = {
  point: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 0 },
};
const bonusWaveSurfaceScratch = {
  point: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 1, z: 0 },
};
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export const stageCollisionPerf = {
  enabled: false,
  logEvery: 120,
  callCount: 0,
  totalMs: 0,
  tfMs: 0,
  seesawMs: 0,
  gridLookupMs: 0,
  triFaceMs: 0,
  triEdgeMs: 0,
  triVertMs: 0,
  primitiveMs: 0,
  animGroups: 0,
  cellHits: 0,
  triangles: 0,
  cones: 0,
  spheres: 0,
  cylinders: 0,
  goals: 0,
  lastTotalMs: 0,
  lastTfMs: 0,
  lastSeesawMs: 0,
  lastGridLookupMs: 0,
  lastTriFaceMs: 0,
  lastTriEdgeMs: 0,
  lastTriVertMs: 0,
  lastPrimitiveMs: 0,
};

function resetSwitchProbeBall(ball) {
  switchProbeBall.flags = 0;
  switchProbeBall.pos.x = ball.pos.x;
  switchProbeBall.pos.y = ball.pos.y;
  switchProbeBall.pos.z = ball.pos.z;
  switchProbeBall.prevPos.x = ball.prevPos.x;
  switchProbeBall.prevPos.y = ball.prevPos.y;
  switchProbeBall.prevPos.z = ball.prevPos.z;
  switchProbeBall.vel.x = ball.vel.x;
  switchProbeBall.vel.y = ball.vel.y;
  switchProbeBall.vel.z = ball.vel.z;
  switchProbeBall.radius = ball.radius;
  switchProbeBall.gravityAccel = ball.gravityAccel;
  switchProbeBall.restitution = ball.restitution;
  switchProbeBall.hardestColiSpeed = 0;
  switchProbeBall.hardestColiAnimGroupId = ball.animGroupId;
  switchProbeBall.friction = ball.friction;
  switchProbeBall.animGroupId = ball.animGroupId;
}

function computeSwitchCylinder(stageSwitch, modelBounds, cylinder) {
  const boundCenter = modelBounds.center;
  const boundRadius = modelBounds.radius;
  switchLocalCenter.x = boundCenter.x;
  switchLocalCenter.y = boundCenter.y;
  switchLocalCenter.z = boundCenter.z;
  stack.fromIdentity();
  stack.rotateZ(stageSwitch.rot.z);
  stack.rotateY(stageSwitch.rot.y);
  stack.rotateX(stageSwitch.rot.x);
  stack.tfPoint(switchLocalCenter, switchLocalCenter);
  cylinder.pos.x = stageSwitch.pos.x + switchLocalCenter.x;
  cylinder.pos.y = stageSwitch.pos.y + switchLocalCenter.y;
  cylinder.pos.z = stageSwitch.pos.z + switchLocalCenter.z;
  cylinder.rot.x = stageSwitch.rot.x;
  cylinder.rot.y = stageSwitch.rot.y;
  cylinder.rot.z = stageSwitch.rot.z;
  cylinder.height = SWITCH_COLI_HEIGHT;
  const radiusSq = (boundRadius * boundRadius) - (SWITCH_COLI_HEIGHT * SWITCH_COLI_HEIGHT);
  cylinder.radius = radiusSq > 0 ? sqrt(radiusSq) : boundRadius;
}

function dumbDot(x1, y1, x2, y2) {
  return x1 * x2 + y1 * y2;
}

const JAMABAR_COLI_RECTS = [
  {
    pos: { x: 0, y: 0.5, z: 1.75 },
    rot: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    width: 1,
    height: 1,
  },
  {
    pos: { x: -0.5, y: 0.5, z: 0 },
    rot: { x: 0, y: -0x4000, z: 0 },
    normal: { x: -1, y: 0, z: 0 },
    width: 3.5,
    height: 1,
  },
  {
    pos: { x: 0, y: 0.5, z: -1.75 },
    rot: { x: 0, y: 0x8000, z: 0 },
    normal: { x: 0, y: 0, z: -1 },
    width: 1,
    height: 1,
  },
  {
    pos: { x: 0.5, y: 0.5, z: 0 },
    rot: { x: 0, y: 0x4000, z: 0 },
    normal: { x: 1, y: 0, z: 0 },
    width: 3.5,
    height: 1,
  },
];

export function tfPhysballToAnimGroupSpace(physBall, animGroupId, animGroups) {
  const delta = physballDeltaScratch;
  if (physBall.animGroupId > 0) {
    const group = animGroups[physBall.animGroupId];
    delta.x = physBall.pos.x - physBall.prevPos.x;
    delta.y = physBall.pos.y - physBall.prevPos.y;
    delta.z = physBall.pos.z - physBall.prevPos.z;

    stack.fromMtx(group.transform);
    stack.tfPoint(physBall.pos, physBall.pos);
    stack.tfVec(physBall.vel, physBall.vel);
    stack.tfVec(delta, delta);
    stack.fromMtx(group.prevTransform);
    stack.tfPoint(physBall.prevPos, physBall.prevPos);

    physBall.vel.x += physBall.pos.x - physBall.prevPos.x - delta.x;
    physBall.vel.y += physBall.pos.y - physBall.prevPos.y - delta.y;
    physBall.vel.z += physBall.pos.z - physBall.prevPos.z - delta.z;
  }

  if (animGroupId > 0) {
    const group = animGroups[animGroupId];
    delta.x = physBall.pos.x - physBall.prevPos.x;
    delta.y = physBall.pos.y - physBall.prevPos.y;
    delta.z = physBall.pos.z - physBall.prevPos.z;

    stack.fromMtx(group.transform);
    stack.rigidInvTfPoint(physBall.pos, physBall.pos);
    stack.rigidInvTfVec(physBall.vel, physBall.vel);
    stack.rigidInvTfVec(delta, delta);
    stack.fromMtx(group.prevTransform);
    stack.rigidInvTfPoint(physBall.prevPos, physBall.prevPos);

    physBall.vel.x += physBall.pos.x - physBall.prevPos.x - delta.x;
    physBall.vel.y += physBall.pos.y - physBall.prevPos.y - delta.y;
    physBall.vel.z += physBall.pos.z - physBall.prevPos.z - delta.z;
  }

  physBall.animGroupId = animGroupId;
}

export function intersectsMovingSpheres(startA, endA, startB, endB, radiusA, radiusB) {
  const dx = startA.x - startB.x;
  const dy = startA.y - startB.y;
  const dz = startA.z - startB.z;
  const vx = (endA.x - endB.x) - dx;
  const vy = (endA.y - endB.y) - dy;
  const vz = (endA.z - endB.z) - dz;
  const vv = (vx * vx) + (vy * vy) + (vz * vz);
  if (vv === 0) {
    return false;
  }
  const radiusSum = radiusA + radiusB;
  const vd = (dx * vx) + (dy * vy) + (dz * vz);
  const dd = (dx * dx) + (dy * dy) + (dz * dz) - (radiusSum * radiusSum);
  if ((vd * vd) - (vv * dd) < 0) {
    return false;
  }
  if (dd <= 0) {
    return true;
  }
  if ((vv + vd + vd + dd) <= 0) {
    return true;
  }
  if (vd >= 0) {
    return false;
  }
  if (-vd >= vv) {
    return false;
  }
  return true;
}

function resolveMovingSpheres(startA, endA, startB, endB, radiusA, radiusB) {
  const dx = startA.x - startB.x;
  const dy = startA.y - startB.y;
  const dz = startA.z - startB.z;
  const vx = (endA.x - endB.x) - dx;
  const vy = (endA.y - endB.y) - dy;
  const vz = (endA.z - endB.z) - dz;
  const vv = (vx * vx) + (vy * vy) + (vz * vz);
  if (vv === 0) {
    return false;
  }
  const radiusSum = radiusA + radiusB;
  const vd = (dx * vx) + (dy * vy) + (dz * vz);
  const dd = (dx * dx) + (dy * dy) + (dz * dz) - (radiusSum * radiusSum);
  const discriminant = (vd * vd) - (vv * dd);
  if (discriminant < 0) {
    return false;
  }
  if (dd <= 0) {
    endA.x = startA.x;
    endA.y = startA.y;
    endA.z = startA.z;
    endB.x = startB.x;
    endB.y = startB.y;
    endB.z = startB.z;
    return true;
  }
  if (!((vv + vd + vd + dd) <= 0)) {
    if (vd >= 0) {
      return false;
    }
    if (-vd >= vv) {
      return false;
    }
  }
  const t = -(vd + sqrt(discriminant)) / vv;
  endA.x = startA.x + t * (endA.x - startA.x);
  endA.y = startA.y + t * (endA.y - startA.y);
  endA.z = startA.z + t * (endA.z - startA.z);
  endB.x = startB.x + t * (endB.x - startB.x);
  endB.y = startB.y + t * (endB.y - startB.y);
  endB.z = startB.z + t * (endB.z - startB.z);
  return true;
}

function tfBallToLocal(ball) {
  stack.rigidInvTfPoint(ball.pos, ball.pos);
  stack.rigidInvTfPoint(ball.prevPos, ball.prevPos);
  stack.rigidInvTfVec(ball.vel, ball.vel);
}

function tfBallToWorld(ball) {
  stack.tfPoint(ball.pos, ball.pos);
  stack.tfPoint(ball.prevPos, ball.prevPos);
  stack.tfVec(ball.vel, ball.vel);
}

export function testLineIntersectsRect(lineStart, lineEnd, rect) {
  const start = lineStartScratch;
  start.x = lineStart.x;
  start.y = lineStart.y;
  start.z = lineStart.z;
  const end = lineEndScratch;
  end.x = lineEnd.x;
  end.y = lineEnd.y;
  end.z = lineEnd.z;
  const planePoint = linePlanePointScratch;

  stack.fromTranslate(rect.pos);
  stack.rotateZ(rect.rot.z);
  stack.rotateY(rect.rot.y);
  stack.rotateX(rect.rot.x);
  stack.rigidInvTfPoint(start, start);
  stack.rigidInvTfPoint(end, end);

  if ((end.z < 0 && start.z < 0) || (end.z > 0 && start.z > 0)) {
    return false;
  }

  planePoint.x = start.x - end.x;
  planePoint.y = start.y - end.y;
  planePoint.z = start.z - end.z;
  if (planePoint.z > FLT_EPSILON) {
    planePoint.x = end.x - planePoint.x * (end.z / planePoint.z);
    planePoint.y = end.y - planePoint.y * (end.z / planePoint.z);
  } else {
    planePoint.x = end.x;
    planePoint.y = end.y;
  }

  const halfWidth = 0.5 * rect.width;
  const halfHeight = 0.5 * rect.height;
  if (planePoint.x < -halfWidth || planePoint.x > halfWidth) {
    return false;
  }
  if (planePoint.y < -halfHeight || planePoint.y > halfHeight) {
    return false;
  }
  return true;
}

function coligridLookup(stageAg, x, z) {
  if (!stageAg.gridCellTris) {
    return null;
  }
  const cellX = floor((x - stageAg.gridOriginX) / stageAg.gridStepX);
  const cellZ = floor((z - stageAg.gridOriginZ) / stageAg.gridStepZ);
  if (cellX < 0 || cellX >= stageAg.gridCellCountX) {
    return null;
  }
  if (cellZ < 0 || cellZ >= stageAg.gridCellCountZ) {
    return null;
  }
  return stageAg.gridCellTris[cellZ * stageAg.gridCellCountX + cellX];
}

export function raycastStageDown(pos, stageRuntime) {
  if (!stageRuntime?.stage || !stageRuntime.animGroups) {
    return null;
  }
  const stage = stageRuntime.stage;
  const animGroups = stageRuntime.animGroups;
  let bestHit = null;
  let bestY = -Infinity;
  for (let animGroupId = 0; animGroupId < stage.animGroupCount; animGroupId += 1) {
    const stageAg = stage.animGroups[animGroupId];
    const agInfo = animGroups[animGroupId];
    if (!stageAg || !agInfo) {
      continue;
    }
    raycastLocalPos.x = pos.x;
    raycastLocalPos.y = pos.y;
    raycastLocalPos.z = pos.z;
    if (animGroupId !== 0) {
      stack.fromMtx(agInfo.transform);
      stack.rigidInvTfPoint(raycastLocalPos, raycastLocalPos);
    }
    const cellTris = coligridLookup(stageAg, raycastLocalPos.x, raycastLocalPos.z);
    if (!cellTris) {
      continue;
    }
    for (const triIndex of cellTris) {
      const tri = stageAg.triangles[triIndex];
      stack.fromTranslate(tri.pos);
      stack.rotateY(tri.rot.y);
      stack.rotateX(tri.rot.x);
      stack.rotateZ(tri.rot.z);
      raycastTriPos.x = 0;
      raycastTriPos.y = 0;
      raycastTriPos.z = 0;
      raycastTriDir.x = 0;
      raycastTriDir.y = -1;
      raycastTriDir.z = 0;
      stack.rigidInvTfPoint(raycastLocalPos, raycastTriPos);
      stack.rigidInvTfVec(raycastTriDir, raycastTriDir);
      if (Math.abs(raycastTriDir.z) <= FLT_EPSILON) {
        continue;
      }
      const t = -raycastTriPos.z / raycastTriDir.z;
      if (t < 0) {
        continue;
      }
      const hitX = raycastTriPos.x + raycastTriDir.x * t;
      const hitY = raycastTriPos.y + raycastTriDir.y * t;
      if (dumbDot(0, 1, hitX, hitY) < -FLT_EPSILON) {
        continue;
      }
      if (((hitX - tri.vert2.x) * tri.edge2Normal.x) + ((hitY - tri.vert2.y) * tri.edge2Normal.y) < -FLT_EPSILON) {
        continue;
      }
      if (((hitX - tri.vert3.x) * tri.edge3Normal.x) + ((hitY - tri.vert3.y) * tri.edge3Normal.y) < -FLT_EPSILON) {
        continue;
      }
      raycastHitLocal.x = hitX;
      raycastHitLocal.y = hitY;
      raycastHitLocal.z = 0;
      stack.tfPoint(raycastHitLocal, raycastHitLocal);
      if (animGroupId !== 0) {
        stack.fromMtx(agInfo.transform);
        stack.tfPoint(raycastHitLocal, raycastHitWorld);
      } else {
        raycastHitWorld.x = raycastHitLocal.x;
        raycastHitWorld.y = raycastHitLocal.y;
        raycastHitWorld.z = raycastHitLocal.z;
      }
      if (raycastHitWorld.y > bestY && raycastHitWorld.y <= pos.y + FLT_EPSILON) {
        bestY = raycastHitWorld.y;
        if (!bestHit) {
          bestHit = {
            pos: { x: 0, y: 0, z: 0 },
            normal: { x: 0, y: 0, z: 0 },
            surfaceVel: { x: 0, y: 0, z: 0 },
            flags: 1,
          };
        }
        bestHit.pos.x = raycastHitWorld.x;
        bestHit.pos.y = raycastHitWorld.y;
        bestHit.pos.z = raycastHitWorld.z;
        if (animGroupId !== 0) {
          stack.fromMtx(agInfo.transform);
          stack.tfVec(tri.normal, raycastNormalWorld);
          stack.fromMtx(agInfo.prevTransform);
          stack.tfPoint(raycastHitLocal, raycastSurfacePrev);
          stack.fromMtx(agInfo.transform);
          stack.tfPoint(raycastHitLocal, raycastSurfaceCurr);
          bestHit.normal.x = raycastNormalWorld.x;
          bestHit.normal.y = raycastNormalWorld.y;
          bestHit.normal.z = raycastNormalWorld.z;
          bestHit.surfaceVel.x = raycastSurfaceCurr.x - raycastSurfacePrev.x;
          bestHit.surfaceVel.y = raycastSurfaceCurr.y - raycastSurfacePrev.y;
          bestHit.surfaceVel.z = raycastSurfaceCurr.z - raycastSurfacePrev.z;
        } else {
          bestHit.normal.x = tri.normal.x;
          bestHit.normal.y = tri.normal.y;
          bestHit.normal.z = tri.normal.z;
          bestHit.surfaceVel.x = 0;
          bestHit.surfaceVel.y = 0;
          bestHit.surfaceVel.z = 0;
        }
      }
    }
  }
  return bestHit;
}

function collideBallWithPlane(ball, plane) {
  const planeDeltaX = ball.pos.x - plane.point.x;
  const planeDeltaY = ball.pos.y - plane.point.y;
  const planeDeltaZ = ball.pos.z - plane.point.z;
  const planeDist = planeDeltaX * plane.normal.x + planeDeltaY * plane.normal.y + planeDeltaZ * plane.normal.z;
  if (planeDist > ball.radius) {
    return;
  }

  let isHardestColi = -1;
  if (!(ball.flags & COLI_FLAGS.OCCURRED)) {
    isHardestColi = 0;
  }

  const penetrationDist = ball.radius - planeDist;
  ball.pos.x += plane.normal.x * penetrationDist;
  ball.pos.y += plane.normal.y * penetrationDist;
  ball.pos.z += plane.normal.z * penetrationDist;

  const normalSpeed = plane.normal.x * ball.vel.x + plane.normal.y * ball.vel.y + plane.normal.z * ball.vel.z;

  if (normalSpeed < 0 && ball.restitution > FLT_EPSILON) {
    if (normalSpeed < ball.hardestColiSpeed) {
      ball.hardestColiSpeed = normalSpeed;
      ball.hardestColiAnimGroupId = ball.animGroupId;
      isHardestColi = 0;
    }

    const parallelVelX = ball.vel.x - plane.normal.x * normalSpeed;
    const parallelVelY = ball.vel.y - plane.normal.y * normalSpeed;
    const parallelVelZ = ball.vel.z - plane.normal.z * normalSpeed;
    if (ball.frictionMode !== 'smb2' || !(ball.flags & COLI_FLAGS.OCCURRED)) {
      ball.vel.x -= parallelVelX * ball.friction;
      ball.vel.y -= parallelVelY * ball.friction;
      ball.vel.z -= parallelVelZ * ball.friction;
    }

    if (normalSpeed >= -5.0 * ball.gravityAccel) {
      ball.vel.x -= plane.normal.x * normalSpeed;
      ball.vel.y -= plane.normal.y * normalSpeed;
      ball.vel.z -= plane.normal.z * normalSpeed;
    } else {
      const adjustedBallSpeed = normalSpeed + 5.0 * ball.gravityAccel;
      ball.vel.x -= plane.normal.x * (-5.0 * ball.gravityAccel);
      ball.vel.y -= plane.normal.y * (-5.0 * ball.gravityAccel);
      ball.vel.z -= plane.normal.z * (-5.0 * ball.gravityAccel);
      ball.vel.x -= (1.0 + ball.restitution) * (plane.normal.x * adjustedBallSpeed);
      ball.vel.y -= (1.0 + ball.restitution) * (plane.normal.y * adjustedBallSpeed);
      ball.vel.z -= (1.0 + ball.restitution) * (plane.normal.z * adjustedBallSpeed);
    }
  }

  if (isHardestColi === 0) {
    ball.hardestColiPlane.point.x = plane.point.x;
    ball.hardestColiPlane.point.y = plane.point.y;
    ball.hardestColiPlane.point.z = plane.point.z;
    ball.hardestColiPlane.normal.x = plane.normal.x;
    ball.hardestColiPlane.normal.y = plane.normal.y;
    ball.hardestColiPlane.normal.z = plane.normal.z;
  }

  ball.flags |= COLI_FLAGS.OCCURRED;
}

export function bonusWaveSurfaceAt(x, z, timerFrames) {
  if (x < -BONUS_WAVE_LIMIT || x > BONUS_WAVE_LIMIT) {
    return null;
  }
  if (z < -BONUS_WAVE_LIMIT || z > BONUS_WAVE_LIMIT) {
    return null;
  }

  const dist = sqrt(sumSq2(x, z));
  const amplitude = BONUS_WAVE_AMPLITUDE_BASE + BONUS_WAVE_AMPLITUDE_SLOPE * dist;
  const angle = Math.trunc(BONUS_WAVE_ANGLE_SPEED * (timerFrames - BONUS_WAVE_START_FRAME)
    + BONUS_WAVE_ANGLE_SCALE * dist);
  const surface = bonusWaveSurfaceScratch;
  surface.point.x = x;
  surface.point.z = z;
  surface.normal.x = 0;
  surface.normal.y = 1;
  surface.normal.z = 0;

  if (angle > 0) {
    surface.point.y = 0;
    return surface;
  }

  const y = sinS16(angle) * amplitude;
  const normal = surface.normal;
  const lenSq = sumSq2(x, z);
  if (lenSq > FLT_EPSILON) {
    const scale = -(cosS16(angle) * amplitude) * rsqrt(lenSq);
    normal.x = x * scale;
    normal.z = z * scale;
    const normalLenSq = sumSq3(normal.x, normal.y, normal.z);
    if (normalLenSq > FLT_EPSILON) {
      const inv = rsqrt(normalLenSq);
      normal.x *= inv;
      normal.y *= inv;
      normal.z *= inv;
    }
  }

  surface.point.y = y;
  return surface;
}

function collideBallWithTriFace(ball, tri) {
  triEdgeBallPrevPos.x = ball.prevPos.x;
  triEdgeBallPrevPos.y = ball.prevPos.y;
  triEdgeBallPrevPos.z = ball.prevPos.z;
  triEdgeBallPos.x = ball.pos.x;
  triEdgeBallPos.y = ball.pos.y;
  triEdgeBallPos.z = ball.pos.z;

  let x = triEdgeBallPrevPos.x - tri.pos.x;
  let y = triEdgeBallPrevPos.y - tri.pos.y;
  let z = triEdgeBallPrevPos.z - tri.pos.z;
  if (x * tri.normal.x + y * tri.normal.y + z * tri.normal.z < 0.0) {
    return;
  }
  x = triEdgeBallPos.x - tri.pos.x;
  y = triEdgeBallPos.y - tri.pos.y;
  z = triEdgeBallPos.z - tri.pos.z;
  if (x * tri.normal.x + y * tri.normal.y + z * tri.normal.z > ball.radius) {
    return;
  }

  stack.fromTranslate(tri.pos);
  stack.rotateY(tri.rot.y);
  stack.rotateX(tri.rot.x);
  stack.rotateZ(tri.rot.z);
  stack.rigidInvTfPoint(triEdgeBallPrevPos, triEdgeBallPrevPos);
  stack.rigidInvTfPoint(triEdgeBallPos, triEdgeBallPos);

  const prevOutside = (dumbDot(0, 1, triEdgeBallPrevPos.x, triEdgeBallPrevPos.y) < -FLT_EPSILON)
    || (((triEdgeBallPrevPos.x - tri.vert2.x) * tri.edge2Normal.x) + ((triEdgeBallPrevPos.y - tri.vert2.y) * tri.edge2Normal.y) < -FLT_EPSILON)
    || (((triEdgeBallPrevPos.x - tri.vert3.x) * tri.edge3Normal.x) + ((triEdgeBallPrevPos.y - tri.vert3.y) * tri.edge3Normal.y) < -FLT_EPSILON);
  const posOutside = (dumbDot(0, 1, triEdgeBallPos.x, triEdgeBallPos.y) < -FLT_EPSILON)
    || (((triEdgeBallPos.x - tri.vert2.x) * tri.edge2Normal.x) + ((triEdgeBallPos.y - tri.vert2.y) * tri.edge2Normal.y) < -FLT_EPSILON)
    || (((triEdgeBallPos.x - tri.vert3.x) * tri.edge3Normal.x) + ((triEdgeBallPos.y - tri.vert3.y) * tri.edge3Normal.y) < -FLT_EPSILON);

  if (!(prevOutside && posOutside)) {
    triPlaneScratch.point.x = tri.pos.x;
    triPlaneScratch.point.y = tri.pos.y;
    triPlaneScratch.point.z = tri.pos.z;
    triPlaneScratch.normal.x = tri.normal.x;
    triPlaneScratch.normal.y = tri.normal.y;
    triPlaneScratch.normal.z = tri.normal.z;
    collideBallWithPlane(ball, triPlaneScratch);
  }
}

function collideBallWithTriEdge(ball, ballPosTri, ballPrevPosTri, edge) {
  stack.push();
  stack.fromIdentity();
  stack.translateXYZ(edge.start.x, edge.start.y, 0);
  const edgeNormalLenSq = sumSq2(edge.normal.x, edge.normal.y);
  if (edgeNormalLenSq > FLT_EPSILON) {
    stack.rotateZ(-atan2S16(edge.normal.x, edge.normal.y));
  }

  stack.rigidInvTfPoint(ballPrevPosTri, triEdgeLocalPrevPos);
  stack.rigidInvTfPoint(ballPosTri, triEdgeLocalPos);

  triEdgeEndPos.x = edge.end.x;
  triEdgeEndPos.y = edge.end.y;
  triEdgeEndPos.z = 0;
  stack.rigidInvTfPoint(triEdgeEndPos, triEdgeEndPos);

  triEdgePlaneVec.x = 0;
  triEdgePlaneVec.y = triEdgeLocalPos.y - triEdgeLocalPrevPos.y;
  triEdgePlaneVec.z = triEdgeLocalPos.z - triEdgeLocalPrevPos.z;
  const planeLenSq = sumSq2(triEdgePlaneVec.y, triEdgePlaneVec.z);
  if (planeLenSq > FLT_EPSILON) {
    stack.rotateX(-atan2S16(triEdgePlaneVec.y, triEdgePlaneVec.z) - 0x8000);
  }
  stack.rigidInvTfPoint(ballPosTri, triEdgeLocalPos);
  stack.rigidInvTfPoint(ballPrevPosTri, triEdgeLocalPrevPos);

  const someY = triEdgeLocalPos.y;
  if (Math.abs(someY) > ball.radius) {
    stack.pop();
    return;
  }
  let phi = sqrt((ball.radius * ball.radius) - (triEdgeLocalPos.y * triEdgeLocalPos.y));
  if (Math.abs(triEdgeLocalPos.z) > phi) {
    stack.pop();
    return;
  }
  if (triEdgeLocalPrevPos.z < 0.0) {
    phi = -phi;
  }
  triEdgePlaneVec.x = 0;
  triEdgePlaneVec.y = someY;
  triEdgePlaneVec.z = phi;
  let edgeHitX;
  if (triEdgeLocalPrevPos.z > phi && triEdgeLocalPos.z < phi) {
    edgeHitX = triEdgeLocalPrevPos.x
      + ((triEdgeLocalPos.x - triEdgeLocalPrevPos.x)
        * ((phi - triEdgeLocalPrevPos.z) / (triEdgeLocalPos.z - triEdgeLocalPrevPos.z)));
  } else {
    edgeHitX = triEdgeLocalPos.x;
  }
  if (edgeHitX < 0.0 || edgeHitX > triEdgeEndPos.x) {
    stack.pop();
    return;
  }

  const tempLenSq = sumSq2(triEdgePlaneVec.y, triEdgePlaneVec.z);
  if (tempLenSq <= FLT_EPSILON) {
    stack.pop();
    return;
  }
  const invLen = rsqrt(tempLenSq);
  triEdgePlaneVec.y *= invLen;
  triEdgePlaneVec.z *= invLen;

  stack.tfVec(triEdgePlaneVec, triEdgePlane.normal);
  stack.getTranslateAlt(triEdgePlane.point);

  stack.pop();
  stack.tfVec(triEdgePlane.normal, triEdgePlane.normal);
  stack.tfPoint(triEdgePlane.point, triEdgePlane.point);
  collideBallWithPlane(ball, triEdgePlane);
}

function collideBallWithTriEdges(ball, tri) {
  triEdgeBallPrevPos.x = ball.prevPos.x;
  triEdgeBallPrevPos.y = ball.prevPos.y;
  triEdgeBallPrevPos.z = ball.prevPos.z;
  triEdgeBallPos.x = ball.pos.x;
  triEdgeBallPos.y = ball.pos.y;
  triEdgeBallPos.z = ball.pos.z;

  let x = triEdgeBallPrevPos.x - tri.pos.x;
  let y = triEdgeBallPrevPos.y - tri.pos.y;
  let z = triEdgeBallPrevPos.z - tri.pos.z;
  if (x * tri.normal.x + y * tri.normal.y + z * tri.normal.z < 0.0) {
    return;
  }
  x = triEdgeBallPos.x - tri.pos.x;
  y = triEdgeBallPos.y - tri.pos.y;
  z = triEdgeBallPos.z - tri.pos.z;
  if (x * tri.normal.x + y * tri.normal.y + z * tri.normal.z > ball.radius) {
    return;
  }

  stack.fromTranslate(tri.pos);
  stack.rotateY(tri.rot.y);
  stack.rotateX(tri.rot.x);
  stack.rotateZ(tri.rot.z);
  stack.rigidInvTfPoint(triEdgeBallPrevPos, triEdgeBallPrevPos);
  stack.rigidInvTfPoint(triEdgeBallPos, triEdgeBallPos);

  x = 0;
  y = 1;
  if ((x * triEdgeBallPos.x + y * triEdgeBallPos.y < -ball.radius)
    && (x * triEdgeBallPrevPos.x + y * triEdgeBallPrevPos.y < -ball.radius)) {
    return;
  }
  x = tri.edge2Normal.x;
  y = tri.edge2Normal.y;
  if ((x * (triEdgeBallPos.x - tri.vert2.x) + y * (triEdgeBallPos.y - tri.vert2.y) < -ball.radius)
    && (x * (triEdgeBallPrevPos.x - tri.vert2.x) + y * (triEdgeBallPrevPos.y - tri.vert2.y) < -ball.radius)) {
    return;
  }
  x = tri.edge3Normal.x;
  y = tri.edge3Normal.y;
  if ((x * (triEdgeBallPos.x - tri.vert3.x) + y * (triEdgeBallPos.y - tri.vert3.y) < -ball.radius)
    && (x * (triEdgeBallPrevPos.x - tri.vert3.x) + y * (triEdgeBallPrevPos.y - tri.vert3.y) < -ball.radius)) {
    return;
  }

  triEdgeScratchEdge.start.x = 0;
  triEdgeScratchEdge.start.y = 0;
  triEdgeScratchEdge.end.x = tri.vert2.x;
  triEdgeScratchEdge.end.y = tri.vert2.y;
  triEdgeScratchEdge.normal.x = 0;
  triEdgeScratchEdge.normal.y = 1;
  collideBallWithTriEdge(ball, triEdgeBallPos, triEdgeBallPrevPos, triEdgeScratchEdge);

  triEdgeScratchEdge.start.x = tri.vert2.x;
  triEdgeScratchEdge.start.y = tri.vert2.y;
  triEdgeScratchEdge.end.x = tri.vert3.x;
  triEdgeScratchEdge.end.y = tri.vert3.y;
  triEdgeScratchEdge.normal.x = tri.edge2Normal.x;
  triEdgeScratchEdge.normal.y = tri.edge2Normal.y;
  collideBallWithTriEdge(ball, triEdgeBallPos, triEdgeBallPrevPos, triEdgeScratchEdge);

  triEdgeScratchEdge.start.x = tri.vert3.x;
  triEdgeScratchEdge.start.y = tri.vert3.y;
  triEdgeScratchEdge.end.x = 0;
  triEdgeScratchEdge.end.y = 0;
  triEdgeScratchEdge.normal.x = tri.edge3Normal.x;
  triEdgeScratchEdge.normal.y = tri.edge3Normal.y;
  collideBallWithTriEdge(ball, triEdgeBallPos, triEdgeBallPrevPos, triEdgeScratchEdge);
}

function collideBallWithTriVert(ball, ballPosTri, vert) {
  triVertTmpVec.x = ballPosTri.x - vert.x;
  triVertTmpVec.y = ballPosTri.y - vert.y;
  triVertTmpVec.z = ballPosTri.z;
  const distSq = sumSq3(triVertTmpVec.x, triVertTmpVec.y, triVertTmpVec.z);
  if (distSq > ball.radius * ball.radius || distSq <= FLT_EPSILON) {
    return;
  }

  const invDist = rsqrt(distSq);
  triVertTmpVec.x *= invDist;
  triVertTmpVec.y *= invDist;
  triVertTmpVec.z *= invDist;

  triPlaneScratch.point.x = vert.x;
  triPlaneScratch.point.y = vert.y;
  triPlaneScratch.point.z = 0;
  triPlaneScratch.normal.x = triVertTmpVec.x;
  triPlaneScratch.normal.y = triVertTmpVec.y;
  triPlaneScratch.normal.z = triVertTmpVec.z;
  stack.tfVec(triPlaneScratch.normal, triPlaneScratch.normal);
  stack.tfPoint(triPlaneScratch.point, triPlaneScratch.point);

  stack.push();
  collideBallWithPlane(ball, triPlaneScratch);
  stack.pop();
}

function collideBallWithTriVerts(ball, tri) {
  triEdgeBallPrevPos.x = ball.prevPos.x;
  triEdgeBallPrevPos.y = ball.prevPos.y;
  triEdgeBallPrevPos.z = ball.prevPos.z;
  let x = triEdgeBallPrevPos.x - tri.pos.x;
  let y = triEdgeBallPrevPos.y - tri.pos.y;
  let z = triEdgeBallPrevPos.z - tri.pos.z;
  if (x * tri.normal.x + y * tri.normal.y + z * tri.normal.z < 0.0) {
    return;
  }

  triEdgeBallPos.x = ball.pos.x;
  triEdgeBallPos.y = ball.pos.y;
  triEdgeBallPos.z = ball.pos.z;
  x = triEdgeBallPos.x - tri.pos.x;
  y = triEdgeBallPos.y - tri.pos.y;
  z = triEdgeBallPos.z - tri.pos.z;
  if (x * tri.normal.x + y * tri.normal.y + z * tri.normal.z > ball.radius) {
    return;
  }

  stack.fromTranslate(tri.pos);
  stack.rotateY(tri.rot.y);
  stack.rotateX(tri.rot.x);
  stack.rotateZ(tri.rot.z);
  stack.rigidInvTfPoint(triEdgeBallPrevPos, triEdgeBallPrevPos);
  stack.rigidInvTfPoint(triEdgeBallPos, triEdgeBallPos);

  triVertScratch.x = 0;
  triVertScratch.y = 0;
  collideBallWithTriVert(ball, triEdgeBallPos, triVertScratch);
  triVertScratch.x = tri.vert2.x;
  triVertScratch.y = tri.vert2.y;
  collideBallWithTriVert(ball, triEdgeBallPos, triVertScratch);
  triVertScratch.x = tri.vert3.x;
  triVertScratch.y = tri.vert3.y;
  collideBallWithTriVert(ball, triEdgeBallPos, triVertScratch);
}

function collideBallWithRect(ball, rect) {
  rectPosScratch.x = ball.pos.x;
  rectPosScratch.y = ball.pos.y;
  rectPosScratch.z = ball.pos.z;
  rectPrevPosScratch.x = ball.prevPos.x;
  rectPrevPosScratch.y = ball.prevPos.y;
  rectPrevPosScratch.z = ball.prevPos.z;

  rectTmpVecScratch.x = rectPrevPosScratch.x - rect.pos.x;
  rectTmpVecScratch.y = rectPrevPosScratch.y - rect.pos.y;
  rectTmpVecScratch.z = rectPrevPosScratch.z - rect.pos.z;
  if (rectTmpVecScratch.x * rect.normal.x
    + rectTmpVecScratch.y * rect.normal.y
    + rectTmpVecScratch.z * rect.normal.z < 0) {
    return;
  }

  rectTmpVecScratch.x = rectPosScratch.x - rect.pos.x;
  rectTmpVecScratch.y = rectPosScratch.y - rect.pos.y;
  rectTmpVecScratch.z = rectPosScratch.z - rect.pos.z;
  if (rectTmpVecScratch.x * rect.normal.x
    + rectTmpVecScratch.y * rect.normal.y
    + rectTmpVecScratch.z * rect.normal.z > ball.radius) {
    return;
  }

  stack.fromTranslate(rect.pos);
  stack.rotateY(atan2S16(rect.normal.x, rect.normal.z));
  stack.rotateX(-atan2S16(rect.normal.y, sqrt(sumSq2(rect.normal.x, rect.normal.z))));
  stack.rigidInvTfPoint(rectPosScratch, rectPosLocalScratch);

  const halfWidth = 0.5 * rect.width;
  const halfHeight = 0.5 * rect.height;

  if (rectPosLocalScratch.x < -halfWidth - ball.radius) {
    return;
  }
  if (rectPosLocalScratch.x > halfWidth + ball.radius) {
    return;
  }
  if (rectPosLocalScratch.y < -halfHeight - ball.radius) {
    return;
  }
  if (rectPosLocalScratch.y > halfHeight + ball.radius) {
    return;
  }

  if (rectPosLocalScratch.x < -halfWidth) {
    rectTmpVecScratch.x = rectPosLocalScratch.x + halfWidth;
    rectTmpVecScratch.z = rectPosLocalScratch.z;
    const distSq = sumSq2(rectTmpVecScratch.x, rectTmpVecScratch.z);
    if (distSq > ball.radius * ball.radius) {
      return;
    }
    if (distSq > FLT_EPSILON) {
      const inv = rsqrt(distSq);
      rectTmpVecScratch.x *= inv;
      rectTmpVecScratch.y = 0;
      rectTmpVecScratch.z *= inv;
    } else {
      rectTmpVecScratch.x = -1;
      rectTmpVecScratch.y = 0;
      rectTmpVecScratch.z = 0;
    }
    stack.tfVec(rectTmpVecScratch, rectPlaneScratch.normal);
    rectTmpVecScratch.x = -halfWidth;
    rectTmpVecScratch.y = 0;
    rectTmpVecScratch.z = 0;
    stack.tfPoint(rectTmpVecScratch, rectPlaneScratch.point);
    collideBallWithPlane(ball, rectPlaneScratch);
  } else if (rectPosLocalScratch.x > halfWidth) {
    rectTmpVecScratch.x = rectPosLocalScratch.x - halfWidth;
    rectTmpVecScratch.z = rectPosLocalScratch.z;
    const distSq = sumSq2(rectTmpVecScratch.x, rectTmpVecScratch.z);
    if (distSq > ball.radius * ball.radius) {
      return;
    }
    if (distSq > FLT_EPSILON) {
      const inv = rsqrt(distSq);
      rectTmpVecScratch.x *= inv;
      rectTmpVecScratch.y = 0;
      rectTmpVecScratch.z *= inv;
    } else {
      rectTmpVecScratch.x = 1;
      rectTmpVecScratch.y = 0;
      rectTmpVecScratch.z = 0;
    }
    stack.tfVec(rectTmpVecScratch, rectPlaneScratch.normal);
    rectTmpVecScratch.x = halfWidth;
    rectTmpVecScratch.y = 0;
    rectTmpVecScratch.z = 0;
    stack.tfPoint(rectTmpVecScratch, rectPlaneScratch.point);
    collideBallWithPlane(ball, rectPlaneScratch);
  } else if (rectPosLocalScratch.y < -halfHeight) {
    rectTmpVecScratch.y = rectPosLocalScratch.y + halfHeight;
    rectTmpVecScratch.z = rectPosLocalScratch.z;
    const distSq = sumSq2(rectTmpVecScratch.y, rectTmpVecScratch.z);
    if (distSq > ball.radius * ball.radius) {
      return;
    }
    if (distSq > FLT_EPSILON) {
      const inv = rsqrt(distSq);
      rectTmpVecScratch.x = 0;
      rectTmpVecScratch.y *= inv;
      rectTmpVecScratch.z *= inv;
    } else {
      rectTmpVecScratch.x = 0;
      rectTmpVecScratch.y = -1;
      rectTmpVecScratch.z = 0;
    }
    stack.tfVec(rectTmpVecScratch, rectPlaneScratch.normal);
    rectTmpVecScratch.x = 0;
    rectTmpVecScratch.y = -halfHeight;
    rectTmpVecScratch.z = 0;
    stack.tfPoint(rectTmpVecScratch, rectPlaneScratch.point);
    collideBallWithPlane(ball, rectPlaneScratch);
  } else if (rectPosLocalScratch.y > halfHeight) {
    rectTmpVecScratch.y = rectPosLocalScratch.y - halfHeight;
    rectTmpVecScratch.z = rectPosLocalScratch.z;
    const distSq = sumSq2(rectTmpVecScratch.y, rectTmpVecScratch.z);
    if (distSq > ball.radius * ball.radius) {
      return;
    }
    if (distSq > FLT_EPSILON) {
      const inv = rsqrt(distSq);
      rectTmpVecScratch.x = 0;
      rectTmpVecScratch.y *= inv;
      rectTmpVecScratch.z *= inv;
    } else {
      rectTmpVecScratch.x = 0;
      rectTmpVecScratch.y = 1;
      rectTmpVecScratch.z = 0;
    }
    stack.tfVec(rectTmpVecScratch, rectPlaneScratch.normal);
    rectTmpVecScratch.x = 0;
    rectTmpVecScratch.y = halfHeight;
    rectTmpVecScratch.z = 0;
    stack.tfPoint(rectTmpVecScratch, rectPlaneScratch.point);
    collideBallWithPlane(ball, rectPlaneScratch);
  } else {
    rectPlaneScratch.point.x = rect.pos.x;
    rectPlaneScratch.point.y = rect.pos.y;
    rectPlaneScratch.point.z = rect.pos.z;
    rectPlaneScratch.normal.x = rect.normal.x;
    rectPlaneScratch.normal.y = rect.normal.y;
    rectPlaneScratch.normal.z = rect.normal.z;
    collideBallWithPlane(ball, rectPlaneScratch);
  }
}

function collideBallWithJamabar(ball, jamabar) {
  const ballPos = jamabarBallPosScratch;

  stack.fromTranslate(jamabar.pos);
  stack.rotateX(jamabar.rot.x);
  stack.rotateY(jamabar.rot.y);
  stack.rotateZ(jamabar.rot.z);
  tfBallToLocal(ball);
  ballPos.x = ball.pos.x;
  ballPos.y = ball.pos.y;
  ballPos.z = ball.pos.z;

  for (const rect of JAMABAR_COLI_RECTS) {
    collideBallWithRect(ball, rect);
  }

  const delta = 0.75 * (ball.pos.z - ballPos.z);
  jamabar.localPos.z -= delta;
  ball.pos.z += delta;
  const localVel = jamabar.localVel.z;
  if (delta * localVel > 0) {
    jamabar.localVel.z *= 0.5;
    ball.vel.z += 2.5 * (localVel - jamabar.localVel.z);
  }

  stack.fromTranslate(jamabar.pos);
  stack.rotateX(jamabar.rot.x);
  stack.rotateY(jamabar.rot.y);
  stack.rotateZ(jamabar.rot.z);
  tfBallToWorld(ball);
}

function collideBallWithBumper(ball, bumper) {
  if (bumper.state !== undefined) {
    bumper.state = 1;
  }
  const resolveRadius = bumper.modelRadius ?? bumper.radius;
  bumperTempPos.x = bumper.pos.x;
  bumperTempPos.y = bumper.pos.y;
  bumperTempPos.z = bumper.pos.z;
  resolveMovingSpheres(ball.prevPos, ball.pos, bumper.prevPos, bumperTempPos, ball.radius, resolveRadius);
  bumperNormal.x = ball.pos.x - bumper.pos.x;
  bumperNormal.y = ball.pos.y - bumper.pos.y;
  bumperNormal.z = ball.pos.z - bumper.pos.z;
  vecNormalizeLen(bumperNormal);
  const push =
    -1.5 * (bumperNormal.x * ball.vel.x + bumperNormal.y * ball.vel.y + bumperNormal.z * ball.vel.z);
  if (push > 0) {
    ball.vel.x += push * bumperNormal.x;
    ball.vel.y += push * bumperNormal.y;
    ball.vel.z += push * bumperNormal.z;
  }
  ball.vel.x += 0.05 * bumperNormal.x;
  ball.vel.y += 0.05 * bumperNormal.y;
  ball.vel.z += 0.05 * bumperNormal.z;
  const dist = bumper.radius + ball.radius + 0.01;
  ball.pos.x = bumper.pos.x + bumperNormal.x * dist;
  ball.pos.y = bumper.pos.y + bumperNormal.y * dist;
  ball.pos.z = bumper.pos.z + bumperNormal.z * dist;
  if (ball.audio) {
    ball.audio.bumperHit = true;
  }
}

function collideBallWithCylinder(ball, cylinder) {
  cylinderTmpVec.x = ball.pos.x - cylinder.pos.x;
  cylinderTmpVec.y = ball.pos.y - cylinder.pos.y;
  cylinderTmpVec.z = ball.pos.z - cylinder.pos.z;
  const ballCylDistSq = sumSq3(cylinderTmpVec.x, cylinderTmpVec.y, cylinderTmpVec.z);
  const cullRadius = ball.radius + sqrt(sumSq2(cylinder.radius, cylinder.height));
  if (ballCylDistSq > cullRadius * cullRadius) {
    return;
  }

  stack.fromTranslate(cylinder.pos);
  stack.rotateZ(cylinder.rot.z);
  stack.rotateY(cylinder.rot.y);
  stack.rotateX(cylinder.rot.x);

  stack.rigidInvTfPoint(ball.pos, cylinderPosLocal);
  stack.rigidInvTfPoint(ball.prevPos, cylinderPrevLocal);

  if (cylinderPrevLocal.y < 0.5 * -cylinder.height) {
    cylinderCircle.pos.x = 0;
    cylinderCircle.pos.y = 0.5 * -cylinder.height;
    cylinderCircle.pos.z = 0;
    cylinderCircle.radius = cylinder.radius;
    cylinderCircle.rot.x = cylinder.rot.x - 0x8000;
    cylinderCircle.rot.y = cylinder.rot.y;
    cylinderCircle.rot.z = cylinder.rot.z;
    stack.tfPoint(cylinderCircle.pos, cylinderCircle.pos);
    collideBallWithCircle(ball, cylinderCircle);
    return;
  }
  if (cylinderPrevLocal.y > 0.5 * cylinder.height) {
    cylinderCircle.pos.x = 0;
    cylinderCircle.pos.y = 0.5 * cylinder.height;
    cylinderCircle.pos.z = 0;
    cylinderCircle.radius = cylinder.radius;
    cylinderCircle.rot.x = cylinder.rot.x;
    cylinderCircle.rot.y = cylinder.rot.y;
    cylinderCircle.rot.z = cylinder.rot.z;
    stack.tfPoint(cylinderCircle.pos, cylinderCircle.pos);
    collideBallWithCircle(ball, cylinderCircle);
    return;
  }

  const dist2d = sumSq2(cylinderPosLocal.x, cylinderPosLocal.z);
  const radiusSum = cylinder.radius + ball.radius;
  if (dist2d > radiusSum * radiusSum || dist2d < FLT_EPSILON) {
    return;
  }

  const invLen = rsqrt(dist2d);
  cylinderPlane.point.x = cylinderPosLocal.x * invLen * cylinder.radius;
  cylinderPlane.point.y = cylinderPosLocal.y;
  cylinderPlane.point.z = cylinderPosLocal.z * invLen * cylinder.radius;
  cylinderPlane.normal.x = cylinderPosLocal.x * invLen;
  cylinderPlane.normal.y = 0;
  cylinderPlane.normal.z = cylinderPosLocal.z * invLen;
  stack.tfVec(cylinderPlane.normal, cylinderPlane.normal);
  stack.tfPoint(cylinderPlane.point, cylinderPlane.point);
  collideBallWithPlane(ball, cylinderPlane);
}

function collideBallWithCircle(ball, circle) {
  const tmpVec = circleTmpVecScratch;
  tmpVec.x = ball.pos.x - circle.pos.x;
  tmpVec.y = ball.pos.y - circle.pos.y;
  tmpVec.z = ball.pos.z - circle.pos.z;
  const distSq = sumSq3(tmpVec.x, tmpVec.y, tmpVec.z);
  const radiusSum = ball.radius + circle.radius;
  if (distSq > radiusSum * radiusSum) {
    return;
  }

  stack.fromTranslate(circle.pos);
  stack.rotateZ(circle.rot.z);
  stack.rotateY(circle.rot.y);
  stack.rotateX(circle.rot.x);
  const ballPosCircle = circleBallPosScratch;
  stack.rigidInvTfPoint(ball.pos, ballPosCircle);

  const dist2d = sumSq2(ballPosCircle.x, ballPosCircle.z);
  if (dist2d < circle.radius * circle.radius) {
    const plane = circlePlaneScratch;
    plane.point.x = 0;
    plane.point.y = 0;
    plane.point.z = 0;
    plane.normal.x = 0;
    plane.normal.y = 1;
    plane.normal.z = 0;
    stack.getTranslateAlt(plane.point);
    stack.tfVec(plane.normal, plane.normal);
    collideBallWithPlane(ball, plane);
    return;
  }

  const radiusSumSq = radiusSum * radiusSum;
  if (dist2d < radiusSumSq && dist2d > FLT_EPSILON) {
    const temp = circle.radius * rsqrt(dist2d);
    const planePoint = circlePlanePointScratch;
    planePoint.x = ballPosCircle.x * temp;
    planePoint.y = 0;
    planePoint.z = ballPosCircle.z * temp;
    tmpVec.x = ballPosCircle.x - planePoint.x;
    tmpVec.y = ballPosCircle.y - planePoint.y;
    tmpVec.z = ballPosCircle.z - planePoint.z;
    const distSq2 = sumSq3(tmpVec.x, tmpVec.y, tmpVec.z);
    if (distSq2 > FLT_EPSILON) {
      const invLen = rsqrt(distSq2);
      const plane = circlePlaneScratch;
      plane.point.x = planePoint.x;
      plane.point.y = planePoint.y;
      plane.point.z = planePoint.z;
      plane.normal.x = tmpVec.x * invLen;
      plane.normal.y = tmpVec.y * invLen;
      plane.normal.z = tmpVec.z * invLen;
      stack.tfPoint(plane.point, plane.point);
      stack.tfVec(plane.normal, plane.normal);
      collideBallWithPlane(ball, plane);
    }
  }
}

function collideBallWithSphere(ball, sphere) {
  const tmpVec = sphereTmpVecScratch;
  tmpVec.x = ball.pos.x - sphere.pos.x;
  tmpVec.y = ball.pos.y - sphere.pos.y;
  tmpVec.z = ball.pos.z - sphere.pos.z;
  const distSq = sumSq3(tmpVec.x, tmpVec.y, tmpVec.z);
  const radiusSum = sphere.radius + ball.radius;
  if (distSq > radiusSum * radiusSum || distSq <= FLT_EPSILON) {
    return;
  }

  const invDist = rsqrt(distSq);
  tmpVec.x *= invDist;
  tmpVec.y *= invDist;
  tmpVec.z *= invDist;

  const plane = spherePlaneScratch;
  plane.point.x = sphere.pos.x + tmpVec.x * sphere.radius;
  plane.point.y = sphere.pos.y + tmpVec.y * sphere.radius;
  plane.point.z = sphere.pos.z + tmpVec.z * sphere.radius;
  plane.normal.x = tmpVec.x;
  plane.normal.y = tmpVec.y;
  plane.normal.z = tmpVec.z;
  collideBallWithPlane(ball, plane);
}

function collideBallWithCone(ball, cone) {
  const tmpVec = coneTmpVecScratch;
  tmpVec.x = ball.pos.x - cone.pos.x;
  tmpVec.y = ball.pos.y - cone.pos.y;
  tmpVec.z = ball.pos.z - cone.pos.z;
  const distSq = sumSq3(tmpVec.x, tmpVec.y, tmpVec.z);
  const maxScale = cone.scale.x > cone.scale.y ? cone.scale.x : cone.scale.y;
  const cullRadius = maxScale + ball.radius;
  if (distSq > cullRadius * cullRadius) {
    return;
  }

  stack.fromTranslate(cone.pos);
  stack.rotateZ(cone.rot.z);
  stack.rotateY(cone.rot.y);
  stack.rotateX(cone.rot.x);
  const ballPosCone = coneBallPosScratch;
  stack.rigidInvTfPoint(ball.pos, ballPosCone);
  if (ballPosCone.y < -ball.radius || ballPosCone.y > cone.scale.y + ball.radius) {
    return;
  }

  const dist2d = sumSq2(ballPosCone.x, ballPosCone.z);
  const cylCullRadius = cone.scale.x + ball.radius;
  if (dist2d > cylCullRadius * cylCullRadius) {
    return;
  }

  stack.translateXYZ(0, cone.scale.y, 0);
  stack.rotateY(-atan2S16(ballPosCone.z, ballPosCone.x));
  stack.rotateZ(-atan2S16(cone.scale.y, cone.scale.x));
  stack.rigidInvTfPoint(ball.pos, tmpVec);

  if (tmpVec.x < 0.0) {
    const plane = conePlaneScratch;
    plane.point.x = 0;
    plane.point.y = 0;
    plane.point.z = 0;
    plane.normal.x = tmpVec.x;
    plane.normal.y = tmpVec.y;
    plane.normal.z = tmpVec.z;
    stack.getTranslateAlt(plane.point);
    const lenSq = sumSq3(tmpVec.x, tmpVec.y, tmpVec.z);
    if (lenSq <= FLT_EPSILON) {
      return;
    }
    const invLen = 1.0 / sqrt(lenSq);
    plane.normal.x = tmpVec.x * invLen;
    plane.normal.y = tmpVec.y * invLen;
    plane.normal.z = tmpVec.z * invLen;
    stack.tfVec(plane.normal, plane.normal);
    collideBallWithPlane(ball, plane);
  } else {
    const baseRadius = sqrt(sumSq2(cone.scale.x, cone.scale.y));
    if (tmpVec.x > ball.radius + baseRadius) {
      return;
    }
    const plane = conePlaneScratch;
    plane.point.x = 0;
    plane.point.y = 0;
    plane.point.z = 0;
    plane.normal.x = 0;
    plane.normal.y = 1;
    plane.normal.z = 0;
    stack.getTranslateAlt(plane.point);
    stack.tfVec(plane.normal, plane.normal);
    collideBallWithPlane(ball, plane);
  }
}

function goalSub22(ball, info) {
  const maxDist = info.radius + info.thickness + ball.radius;
  const minDist = info.radius - info.thickness - ball.radius;
  const dist = vecDistance(ball.pos, info.center);
  if (dist > maxDist || dist < minDist) {
    return;
  }

  stack.fromTranslate(info.center);
  stack.rotateZ(info.rotZ);
  stack.rotateY(info.rotY);
  stack.rotateX(info.rotX);
  stack.rigidInvTfPoint(ball.pos, goalSubPosLocal);
  stack.rigidInvTfPoint(ball.prevPos, goalSubPrevLocal);

  goalRingPoint.x = goalSubPosLocal.x + goalSubPrevLocal.x;
  goalRingPoint.y = goalSubPosLocal.y + goalSubPrevLocal.y;
  goalRingPoint.z = 0;
  vecSetLen(goalRingPoint, goalRingPoint, info.radius);
  if (intersectsMovingSpheres(goalSubPrevLocal, goalSubPosLocal, goalRingPoint, goalRingPoint, ball.radius, info.thickness)) {
    goalPlaneVec.x = goalSubPrevLocal.x - goalRingPoint.x;
    goalPlaneVec.y = goalSubPrevLocal.y - goalRingPoint.y;
    goalPlaneVec.z = goalSubPrevLocal.z - goalRingPoint.z;
    vecNormalizeLen(goalPlaneVec);
    stack.tfVec(goalPlaneVec, goalPlane.normal);
    goalRingPoint.x += goalPlaneVec.x * info.thickness;
    goalRingPoint.y += goalPlaneVec.y * info.thickness;
    goalRingPoint.z += goalPlaneVec.z * info.thickness;
    stack.tfPoint(goalRingPoint, goalPlane.point);
    collideBallWithPlane(ball, goalPlane);
  }
}

function goalSub23(ball, info) {
  goalUpVec.x = 0;
  goalUpVec.y = -1;
  goalUpVec.z = 0;
  stack.tfVec(goalUpVec, goalUpVec);
  goalDirVec.x = ball.pos.x - info.center.x;
  goalDirVec.y = ball.pos.y - info.center.y;
  goalDirVec.z = ball.pos.z - info.center.z;
  vecNormalizeLen(goalDirVec);
  if (!(vecDot(goalUpVec, goalDirVec) > GOAL_RING_MIN_DOT)) {
    goalSub22(ball, info);
  }
}

function goalSub24(ball, info) {
  const maxDist = info.radius + info.thickness + ball.radius;
  if (vecDistance(ball.pos, info.center) > maxDist) {
    return;
  }

  stack.fromTranslate(info.center);
  stack.rotateZ(info.rotZ);
  stack.rotateY(info.rotY);
  stack.rotateX(info.rotX);
  stack.rigidInvTfPoint(ball.pos, goalSubPosLocal);
  stack.rigidInvTfPoint(ball.prevPos, goalSubPrevLocal);

  goalRingPoint.x = (goalSubPosLocal.x + goalSubPrevLocal.x) * 0.5;
  goalRingPoint.y = (goalSubPosLocal.y + goalSubPrevLocal.y) * 0.5;
  goalRingPoint.z = 0;
  if (goalRingPoint.y < -0.5) {
    goalRingPoint.y = -0.5;
  }
  const ringLen = sqrt(sumSq2(goalRingPoint.x, goalRingPoint.y));
  if (ringLen > info.radius && ringLen > FLT_EPSILON) {
    const scale = info.radius / ringLen;
    goalRingPoint.x *= scale;
    goalRingPoint.y *= scale;
    goalRingPoint.z *= scale;
  }
  if (intersectsMovingSpheres(goalSubPrevLocal, goalSubPosLocal, goalRingPoint, goalRingPoint, ball.radius, info.thickness)) {
    goalPlaneVec.x = goalSubPrevLocal.x - goalRingPoint.x;
    goalPlaneVec.y = goalSubPrevLocal.y - goalRingPoint.y;
    goalPlaneVec.z = goalSubPrevLocal.z - goalRingPoint.z;
    vecNormalizeLen(goalPlaneVec);
    stack.tfVec(goalPlaneVec, goalPlane.normal);
    goalRingPoint.x += goalPlaneVec.x * info.thickness;
    goalRingPoint.y += goalPlaneVec.y * info.thickness;
    goalRingPoint.z += goalPlaneVec.z * info.thickness;
    stack.tfPoint(goalRingPoint, goalPlane.point);
    collideBallWithPlane(ball, goalPlane);
  }
}

function collideBallWithGoal(ball, goal) {
  stack.fromTranslate(goal.pos);
  stack.rotateZ(goal.rot.z);
  stack.rotateY(goal.rot.y);
  stack.rotateX(goal.rot.x);

  stack.push();
  goalRingInfo.center.x = 0;
  goalRingInfo.center.y = 3.2;
  goalRingInfo.center.z = 0;
  goalRingInfo.rotX = goal.rot.x;
  goalRingInfo.rotY = goal.rot.y;
  goalRingInfo.rotZ = goal.rot.z;
  stack.tfPoint(goalRingInfo.center, goalRingInfo.center);
  goalSub23(ball, goalRingInfo);
  stack.pop();

  stack.push();
  goalRingInfo2.center.x = 0;
  goalRingInfo2.center.y = 3.2;
  goalRingInfo2.center.z = 0;
  goalRingInfo2.rotX = goal.rot.x;
  goalRingInfo2.rotY = goal.rot.y;
  goalRingInfo2.rotZ = goal.rot.z;
  stack.tfPoint(goalRingInfo2.center, goalRingInfo2.center);
  goalSub24(ball, goalRingInfo2);
  stack.pop();

  stack.push();
  goalCyl.pos.x = 1.1;
  goalCyl.pos.y = 0.75;
  goalCyl.pos.z = 0;
  goalCyl.rot.x = goal.rot.x;
  goalCyl.rot.y = goal.rot.y;
  goalCyl.rot.z = goal.rot.z;
  stack.tfPoint(goalCyl.pos, goalCyl.pos);
  collideBallWithCylinder(ball, goalCyl);
  stack.pop();

  stack.push();
  goalCyl2.pos.x = -1.1;
  goalCyl2.pos.y = 0.75;
  goalCyl2.pos.z = 0;
  goalCyl2.rot.x = goal.rot.x;
  goalCyl2.rot.y = goal.rot.y;
  goalCyl2.rot.z = goal.rot.z;
  stack.tfPoint(goalCyl2.pos, goalCyl2.pos);
  collideBallWithCylinder(ball, goalCyl2);
  stack.pop();
}

function collideBallWithGoalBag(ball, bag) {
  goalBagVecA.x = ball.pos.x - bag.position.x;
  goalBagVecA.y = ball.pos.y - bag.position.y;
  goalBagVecA.z = ball.pos.z - bag.position.z;
  if (vecNormalizeLen(goalBagVecA) === 0) {
    return;
  }
  goalBagVecB.x = bag.position.x - bag.prevPos.x;
  goalBagVecB.y = bag.position.y - bag.prevPos.y;
  goalBagVecB.z = bag.position.z - bag.prevPos.z;
  goalBagVecC.x = ball.vel.x;
  goalBagVecC.y = ball.vel.y;
  goalBagVecC.z = ball.vel.z;
  goalBagVecD.x = goalBagVecC.x - goalBagVecB.x;
  goalBagVecD.y = goalBagVecC.y - goalBagVecB.y;
  goalBagVecD.z = goalBagVecC.z - goalBagVecB.z;
  let var_f26 = 0;
  let temp_f0 = -1.5 * vecDot(goalBagVecA, ball.vel);
  if (temp_f0 > 0) {
    var_f26 = temp_f0;
    goalBagVecD.x += temp_f0 * goalBagVecA.x;
    goalBagVecD.y += temp_f0 * goalBagVecA.y;
    goalBagVecD.z += temp_f0 * goalBagVecA.z;
    ball.vel.x = goalBagVecD.x + goalBagVecB.x;
    ball.vel.y = goalBagVecD.y + goalBagVecB.y;
    ball.vel.z = goalBagVecD.z + goalBagVecB.z;
  }
  const temp_f25 = bag.boundSphereRadius + ball.radius;
  goalBagVecA.x *= temp_f25;
  goalBagVecA.y *= temp_f25;
  goalBagVecA.z *= temp_f25;
  ball.pos.x += bag.position.x + goalBagVecA.x - ball.pos.x;
  ball.pos.y += bag.position.y + goalBagVecA.y - ball.pos.y;
  ball.pos.z += bag.position.z + goalBagVecA.z - ball.pos.z;

  temp_f0 = -vecDot(goalBagVecA, bag.localPos);
  goalBagVecA.x += temp_f0 * bag.localPos.x;
  goalBagVecA.y += temp_f0 * bag.localPos.y;
  goalBagVecA.z += temp_f0 * bag.localPos.z;
  vecNormalizeLen(goalBagVecA);

  goalBagVecD.x = goalBagVecB.x + bag.localVel.x - goalBagVecC.x;
  goalBagVecD.y = goalBagVecB.y + bag.localVel.y - goalBagVecC.y;
  goalBagVecD.z = goalBagVecB.z + bag.localVel.z - goalBagVecC.z;
  temp_f0 = -2.0 * vecDot(goalBagVecA, goalBagVecD);
  if (temp_f0 < 0) {
    goalBagVecD.x += temp_f0 * goalBagVecA.x;
    goalBagVecD.y += temp_f0 * goalBagVecA.y;
    goalBagVecD.z += temp_f0 * goalBagVecA.z;
    bag.localVel.x = goalBagVecC.x + (goalBagVecD.x - goalBagVecB.x);
    bag.localVel.y = goalBagVecC.y + (goalBagVecD.y - goalBagVecB.y);
    bag.localVel.z = goalBagVecC.z + (goalBagVecD.z - goalBagVecB.z);
  }

  temp_f0 = -vecDot(bag.localPos, bag.localVel);
  bag.localVel.x += temp_f0 * bag.localPos.x;
  bag.localVel.y += temp_f0 * bag.localPos.y;
  bag.localVel.z += temp_f0 * bag.localPos.z;
  if (bag.flags !== 0) {
    temp_f0 = -2.0 * vecDot(bag.localPos, goalBagVecC);
    if (temp_f0 < 0) {
      bag.unk8 += temp_f0;
    }
  }
  if (var_f26 > 0.1) {
    // Effect spawn omitted in web port.
  }
}

function collideBallWithGoalTape(ball, tape) {
  if (!tape || !tape.points || tape.points.length === 0) {
    return;
  }
  goalTapeLocalPos.x = ball.pos.x;
  goalTapeLocalPos.y = ball.pos.y;
  goalTapeLocalPos.z = ball.pos.z;
  stack.fromIdentity();
  stack.translate(tape.goal.pos);
  stack.rotateZ(tape.goal.rot.z);
  stack.rotateY(tape.goal.rot.y);
  stack.rotateX(tape.goal.rot.x);
  stack.rigidInvTfPoint(goalTapeLocalPos, goalTapeLocalPos);

  const radius = ball.radius;
  const radiusSq = radius * radius;
  goalTapeImpulse.x = 0;
  goalTapeImpulse.y = 0;
  goalTapeImpulse.z = 0;
  let hit = false;

  for (const point of tape.points) {
    if (point.flags & 1) {
      continue;
    }
    goalTapeDelta.x = point.pos.x - goalTapeLocalPos.x;
    if (Math.abs(goalTapeDelta.x) > radius) {
      continue;
    }
    goalTapeDelta.z = point.pos.z - goalTapeLocalPos.z;
    if (Math.abs(goalTapeDelta.z) > radius) {
      continue;
    }
    goalTapeDelta.y = point.pos.y - goalTapeLocalPos.y;
    if (Math.abs(goalTapeDelta.y) > radius) {
      continue;
    }
    const distSq = (goalTapeDelta.x * goalTapeDelta.x)
      + (goalTapeDelta.y * goalTapeDelta.y)
      + (goalTapeDelta.z * goalTapeDelta.z);
    if (distSq > radiusSq) {
      continue;
    }

    vecSetLen(goalTapeDelta, goalTapeDelta, radius);
    const newX = goalTapeLocalPos.x + goalTapeDelta.x;
    const newY = goalTapeLocalPos.y + goalTapeDelta.y;
    const newZ = goalTapeLocalPos.z + goalTapeDelta.z;
    const deltaX = newX - point.pos.x;
    const deltaY = newY - point.pos.y;
    const deltaZ = newZ - point.pos.z;
    point.pos.x = newX;
    point.pos.y = newY;
    point.pos.z = newZ;
    point.vel.x += deltaX;
    point.vel.y += deltaY;
    point.vel.z += deltaZ;
    hit = true;

    const moveLen = sqrt((deltaX * deltaX) + (deltaY * deltaY) + (deltaZ * deltaZ));
    vecSetLen(goalTapeImpulseStep, goalTapeDelta, moveLen * -0.05);
    goalTapeImpulse.x += goalTapeImpulseStep.x;
    goalTapeImpulse.y += goalTapeImpulseStep.y;
    goalTapeImpulse.z += goalTapeImpulseStep.z;

    goalTapeNormalScratch.x = point.normal.x;
    goalTapeNormalScratch.y = point.normal.y;
    goalTapeNormalScratch.z = point.normal.z;
    vecNormalizeLen(goalTapeDelta);
    if ((goalTapeDelta.x * goalTapeNormalScratch.x)
      + (goalTapeDelta.y * goalTapeNormalScratch.y)
      + (goalTapeDelta.z * goalTapeNormalScratch.z) < 0) {
      goalTapeDelta.x = -goalTapeDelta.x;
      goalTapeDelta.y = -goalTapeDelta.y;
      goalTapeDelta.z = -goalTapeDelta.z;
    }
    goalTapeNormalScratch.x += (goalTapeDelta.x - goalTapeNormalScratch.x) * 0.125;
    goalTapeNormalScratch.y += (goalTapeDelta.y - goalTapeNormalScratch.y) * 0.125;
    goalTapeNormalScratch.z += (goalTapeDelta.z - goalTapeNormalScratch.z) * 0.125;
    vecNormalizeLen(goalTapeNormalScratch);
    point.normal.x = goalTapeNormalScratch.x;
    point.normal.y = goalTapeNormalScratch.y;
    point.normal.z = goalTapeNormalScratch.z;
  }

  if (hit) {
    stack.tfVec(goalTapeImpulse, goalTapeImpulse);
    ball.vel.x += goalTapeImpulse.x;
    ball.vel.y += goalTapeImpulse.y;
    ball.vel.z += goalTapeImpulse.z;
  }
}

export function applySeesawCollision(ball, seesaw) {
  if (!seesaw || !seesaw.invTransform) {
    return;
  }
  for (let i = 0; i < 12; i += 1) {
    if (!Number.isFinite(seesaw.invTransform[i])) {
      return;
    }
  }
  seesawLocalPosScratch.x = ball.pos.x;
  seesawLocalPosScratch.y = ball.pos.y;
  seesawLocalPosScratch.z = ball.pos.z;
  seesawLocalVelScratch.x = ball.vel.x;
  seesawLocalVelScratch.y = ball.vel.y;
  seesawLocalVelScratch.z = ball.vel.z;
  stack.fromMtx(seesaw.invTransform);
  stack.tfPoint(seesawLocalPosScratch, seesawLocalPosScratch);
  stack.tfVec(seesawLocalVelScratch, seesawLocalVelScratch);
  if (!Number.isFinite(seesawLocalPosScratch.x)
    || !Number.isFinite(seesawLocalPosScratch.y)
    || !Number.isFinite(seesawLocalVelScratch.x)
    || !Number.isFinite(seesawLocalVelScratch.y)) {
    return;
  }

  const dist = sqrt((seesawLocalPosScratch.x * seesawLocalPosScratch.x) + (seesawLocalPosScratch.y * seesawLocalPosScratch.y));
  if (!Number.isFinite(dist) || dist <= FLT_EPSILON) {
    return;
  }
  const invDist = 1.0 / dist;
  const nx = seesawLocalPosScratch.x * invDist;
  const ny = seesawLocalPosScratch.y * invDist;
  const dot = -(nx * seesawLocalVelScratch.x + ny * seesawLocalVelScratch.y);
  seesawLocalVelScratch.x += dot * nx;
  seesawLocalVelScratch.y += dot * ny;
  let velLen = sqrt((seesawLocalVelScratch.x * seesawLocalVelScratch.x) + (seesawLocalVelScratch.y * seesawLocalVelScratch.y));
  if ((-ny * seesawLocalVelScratch.x + nx * seesawLocalVelScratch.y) < 0) {
    velLen = -velLen;
  }
  if (!Number.isFinite(velLen) || !Number.isFinite(seesaw.sensitivity)) {
    return;
  }
  if (!Number.isFinite(seesaw.angleVel)) {
    seesaw.angleVel = 0;
  }
  seesaw.angleVel += seesaw.sensitivity * (dist * velLen);
}

export function collideBallWithStageObjects(ball, stageRuntime) {
  const animGroups = stageRuntime.animGroups;
  const switchesEnabled = stageRuntime.switchesEnabled !== false;
  for (let animGroupId = 0; animGroupId < animGroups.length; animGroupId += 1) {
    const bumpers = stageRuntime.bumpers[animGroupId];
    const jamabars = stageRuntime.jamabars[animGroupId];
    const goalBags = stageRuntime.goalBagsByGroup?.[animGroupId] ?? [];
    const goalTapes = stageRuntime.goalTapesByGroup?.[animGroupId] ?? [];
    const switches = stageRuntime.switchesByGroup?.[animGroupId]
      ?? stageRuntime.stage.animGroups[animGroupId]?.switches
      ?? [];
    if (animGroupId !== ball.animGroupId) {
      tfPhysballToAnimGroupSpace(ball, animGroupId, animGroups);
    }
    for (const bumper of bumpers) {
      if (intersectsMovingSpheres(ball.prevPos, ball.pos, bumper.prevPos, bumper.pos, ball.radius, bumper.radius)) {
        collideBallWithBumper(ball, bumper);
      }
    }
    for (const jamabar of jamabars) {
      if (intersectsMovingSpheres(ball.prevPos, ball.pos, jamabar.prevPos, jamabar.pos, ball.radius, jamabar.radius)) {
        collideBallWithJamabar(ball, jamabar);
      }
    }
    for (const bag of goalBags) {
      if (intersectsMovingSpheres(ball.prevPos, ball.pos, bag.prevPos, bag.position, ball.radius, bag.boundSphereRadius)) {
        collideBallWithGoalBag(ball, bag);
      }
    }
    for (const tape of goalTapes) {
      collideBallWithGoalTape(ball, tape);
    }
    if (!switchesEnabled) {
      continue;
    }
    for (const stageSwitch of switches) {
      const modelBounds = stageSwitch.modelBoundCenter && stageSwitch.modelBoundRadius
        ? { center: stageSwitch.modelBoundCenter, radius: stageSwitch.modelBoundRadius }
        : stageRuntime.switchModelBounds?.[stageSwitch.type & 7];
      let hitSwitch = false;
      if (modelBounds) {
        computeSwitchCylinder(stageSwitch, modelBounds, switchCylinderScratch);
        resetSwitchProbeBall(ball);
        collideBallWithCylinder(switchProbeBall, switchCylinderScratch);
        hitSwitch = (switchProbeBall.flags & COLI_FLAGS.OCCURRED) !== 0;
        if (hitSwitch) {
          stack.fromIdentity();
          stack.rotateZ(stageSwitch.rot.z);
          stack.rotateY(stageSwitch.rot.y);
          stack.rotateX(stageSwitch.rot.x);
          stack.rigidInvTfVec(switchProbeBall.hardestColiPlane.normal, switchLocalNormalScratch);
          stageSwitch.localVel.y = switchProbeBall.hardestColiSpeed * switchLocalNormalScratch.y * 0.5;
          stageSwitch.pressImpulse = true;
          collideBallWithCylinder(ball, switchCylinderScratch);
        }
      } else {
        hitSwitch = intersectsMovingSpheres(
          ball.prevPos,
          ball.pos,
          stageSwitch.pos,
          stageSwitch.pos,
          ball.radius,
          SWITCH_TRIGGER_RADIUS,
        );
      }
      if (!hitSwitch || (stageRuntime.format !== 'smb2' && stageSwitch.cooldown > 0)) {
        continue;
      }
      if (stageRuntime.format === 'smb2') {
        continue;
      }
      stageRuntime.applySwitchPlayback(stageSwitch, true);
      stageSwitch.cooldown = SWITCH_COOLDOWN_FRAMES;
    }
  }

  if (ball.animGroupId !== 0) {
    tfPhysballToAnimGroupSpace(ball, 0, animGroups);
  }
}

export function collideBallWithBonusWave(ball, stageRuntime) {
  if (stageRuntime.stage?.format === 'smb2') {
    return;
  }
  const stageId = stageRuntime.stage?.stageId ?? 0;
  if (stageId !== BONUS_WAVE_STAGE_ID) {
    return;
  }
  const surface = bonusWaveSurfaceAt(ball.pos.x, ball.pos.z, stageRuntime.timerFrames);
  if (!surface) {
    return;
  }
  collideBallWithPlane(ball, surface);
}

export function collideBallWithStage(ball, stage, animGroups) {
  const perf = stageCollisionPerf;
  const perfEnabled = perf.enabled;
  const totalStart = perfEnabled ? nowMs() : 0;
  let tfMs = 0;
  let seesawMs = 0;
  let gridLookupMs = 0;
  let triFaceMs = 0;
  let triEdgeMs = 0;
  let triVertMs = 0;
  let primitiveMs = 0;
  let animGroupsVisited = 0;
  let cellHits = 0;
  let trianglesTested = 0;
  let conesTested = 0;
  let spheresTested = 0;
  let cylindersTested = 0;
  let goalsTested = 0;
  for (let animGroupId = 0; animGroupId < stage.animGroupCount; animGroupId += 1) {
    if (perfEnabled) {
      animGroupsVisited += 1;
    }
    const stageAg = stage.animGroups[animGroupId];
    if (animGroupId !== ball.animGroupId) {
      const t = perfEnabled ? nowMs() : 0;
      tfPhysballToAnimGroupSpace(ball, animGroupId, animGroups);
      if (perfEnabled) {
        tfMs += nowMs() - t;
      }
    }

    const seesawState = animGroups[animGroupId]?.seesawState;
    if (seesawState && stage.format !== 'smb2') {
      const t = perfEnabled ? nowMs() : 0;
      applySeesawCollision(ball, seesawState);
      if (perfEnabled) {
        seesawMs += nowMs() - t;
      }
    }

    const lookupStart = perfEnabled ? nowMs() : 0;
    const cellTris = coligridLookup(stageAg, ball.pos.x, ball.pos.z);
    if (perfEnabled) {
      gridLookupMs += nowMs() - lookupStart;
    }
    if (cellTris) {
      if (perfEnabled) {
        cellHits += 1;
        trianglesTested += cellTris.length;
      }
      let t = perfEnabled ? nowMs() : 0;
      for (const triIndex of cellTris) {
        collideBallWithTriFace(ball, stageAg.triangles[triIndex]);
      }
      if (perfEnabled) {
        triFaceMs += nowMs() - t;
        t = nowMs();
      }
      for (const triIndex of cellTris) {
        collideBallWithTriEdges(ball, stageAg.triangles[triIndex]);
      }
      if (perfEnabled) {
        triEdgeMs += nowMs() - t;
        t = nowMs();
      }
      for (const triIndex of cellTris) {
        collideBallWithTriVerts(ball, stageAg.triangles[triIndex]);
      }
      if (perfEnabled) {
        triVertMs += nowMs() - t;
      }
    }

    const primitiveStart = perfEnabled ? nowMs() : 0;
    for (const cone of stageAg.coliCones) {
      if (perfEnabled) {
        conesTested += 1;
      }
      collideBallWithCone(ball, cone);
    }
    for (const sphere of stageAg.coliSpheres) {
      if (perfEnabled) {
        spheresTested += 1;
      }
      collideBallWithSphere(ball, sphere);
    }
    for (const cylinder of stageAg.coliCylinders) {
      if (perfEnabled) {
        cylindersTested += 1;
      }
      collideBallWithCylinder(ball, cylinder);
    }
    for (const goal of stageAg.goals) {
      if (perfEnabled) {
        goalsTested += 1;
      }
      collideBallWithGoal(ball, goal);
    }
    if (perfEnabled) {
      primitiveMs += nowMs() - primitiveStart;
    }
  }

  if (ball.animGroupId !== 0) {
    const t = perfEnabled ? nowMs() : 0;
    tfPhysballToAnimGroupSpace(ball, 0, animGroups);
    if (perfEnabled) {
      tfMs += nowMs() - t;
    }
  }

  if (perfEnabled) {
    const totalMs = nowMs() - totalStart;
    perf.lastTotalMs = totalMs;
    perf.lastTfMs = tfMs;
    perf.lastSeesawMs = seesawMs;
    perf.lastGridLookupMs = gridLookupMs;
    perf.lastTriFaceMs = triFaceMs;
    perf.lastTriEdgeMs = triEdgeMs;
    perf.lastTriVertMs = triVertMs;
    perf.lastPrimitiveMs = primitiveMs;
    perf.totalMs += totalMs;
    perf.tfMs += tfMs;
    perf.seesawMs += seesawMs;
    perf.gridLookupMs += gridLookupMs;
    perf.triFaceMs += triFaceMs;
    perf.triEdgeMs += triEdgeMs;
    perf.triVertMs += triVertMs;
    perf.primitiveMs += primitiveMs;
    perf.animGroups += animGroupsVisited;
    perf.cellHits += cellHits;
    perf.triangles += trianglesTested;
    perf.cones += conesTested;
    perf.spheres += spheresTested;
    perf.cylinders += cylindersTested;
    perf.goals += goalsTested;
    perf.callCount += 1;

    if (perf.callCount >= perf.logEvery) {
      const count = Math.max(1, perf.callCount);
      console.log(
        "[perf] stage-coli-breakdown avg total=%sms tf=%sms seesaw=%sms grid=%sms face=%sms edge=%sms vert=%sms prim=%sms over=%d",
        (perf.totalMs / count).toFixed(3),
        (perf.tfMs / count).toFixed(3),
        (perf.seesawMs / count).toFixed(3),
        (perf.gridLookupMs / count).toFixed(3),
        (perf.triFaceMs / count).toFixed(3),
        (perf.triEdgeMs / count).toFixed(3),
        (perf.triVertMs / count).toFixed(3),
        (perf.primitiveMs / count).toFixed(3),
        perf.callCount,
      );
      console.log(
        "[perf] stage-coli-work avg groups=%s cellHits=%s tris=%s cones=%s spheres=%s cylinders=%s goals=%s over=%d",
        (perf.animGroups / count).toFixed(1),
        (perf.cellHits / count).toFixed(1),
        (perf.triangles / count).toFixed(1),
        (perf.cones / count).toFixed(1),
        (perf.spheres / count).toFixed(1),
        (perf.cylinders / count).toFixed(1),
        (perf.goals / count).toFixed(1),
        perf.callCount,
      );
      perf.callCount = 0;
      perf.totalMs = 0;
      perf.tfMs = 0;
      perf.seesawMs = 0;
      perf.gridLookupMs = 0;
      perf.triFaceMs = 0;
      perf.triEdgeMs = 0;
      perf.triVertMs = 0;
      perf.primitiveMs = 0;
      perf.animGroups = 0;
      perf.cellHits = 0;
      perf.triangles = 0;
      perf.cones = 0;
      perf.spheres = 0;
      perf.cylinders = 0;
      perf.goals = 0;
    }
  }
}
