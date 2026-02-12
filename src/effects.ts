import { raycastStageDown } from './collision.js';
import { atan2S16, sqrt, sumSq2, toS16, vecDot } from './math.js';
import type { Vec3 } from './shared/types.js';

const SPARK_GRAVITY_SCALE = 0.008;
const SPARK_DAMP = 0.992;
const STAR_GRAVITY_SCALE = 0.004;
const STAR_DAMP = 0.985;
const SPARK_LIFE_MIN = 15;
const SPARK_LIFE_RANGE = 45;
const STAR_LIFE_MIN = 15;
const STAR_LIFE_RANGE = 45;
const LEVITATE_LIFE_MIN = 60;
const LEVITATE_LIFE_RANGE = 15;
const SPARK_GROUND_CHECK = 0.5;
const STAR_GROUND_CHECK = 0.6;
const SPARK_GROUND_MIN_DIST = 0.025;
const STAR_GROUND_MIN_DIST_SCALE = 8.090365;
const SPARK_GROUND_BLEND = 0.03;
const STAR_GROUND_BLEND = 0.029999971;
const STAR_ROT_KICK_XZ = 131072;
const STAR_ROT_KICK_Y = 524288;
const LEVITATE_GRAVITY = 0.0004;
const LEVITATE_START_VEL = 0.003;
const LEVITATE_SCALE = 0.24;
const LEVITATE_OFFSET_RADIUS = 0.7;
const LEVITATE_DRIFT = 0.0012;
const LEVITATE_DAMP = 0.98;
const STAR_SCALE_TARGET = 0.015;

const randFloat = (rng) => rng.nextFloat();
const randS16 = (rng) => rng.nextS16();

export type BallEffectKind = 'coli' | 'colistar' | 'coliflash' | 'levitate';

export type BallEffect = {
  id: number;
  kind: BallEffectKind;
  pos: Vec3;
  prevPos: Vec3;
  groundPos: Vec3;
  groundNormal: Vec3;
  groundVel: Vec3;
  glowPos: Vec3;
  glowDist: number;
  glowRotX: number;
  glowRotY: number;
  hasGround: boolean;
  surfaceNormal: Vec3;
  vel: Vec3;
  life: number;
  age: number;
  scale: number;
  scaleTarget: number;
  alpha: number;
  colorR: number;
  colorG: number;
  colorB: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  prevRotX: number;
  prevRotY: number;
  prevRotZ: number;
  rotVelX: number;
  rotVelY: number;
  rotVelZ: number;
  baseY: number;
};

let nextEffectId = 1;

function createEffect(kind: BallEffectKind, pos: Vec3, vel: Vec3, life: number): BallEffect {
  return {
    id: nextEffectId++,
    kind,
    pos: { x: pos.x, y: pos.y, z: pos.z },
    prevPos: { x: pos.x, y: pos.y, z: pos.z },
    groundPos: { x: pos.x, y: pos.y, z: pos.z },
    groundNormal: { x: 0, y: 1, z: 0 },
    groundVel: { x: 0, y: 0, z: 0 },
    glowPos: { x: pos.x, y: pos.y, z: pos.z },
    glowDist: 0,
    glowRotX: 0,
    glowRotY: 0,
    hasGround: false,
    surfaceNormal: { x: 0, y: 1, z: 0 },
    vel: { x: vel.x, y: vel.y, z: vel.z },
    life,
    age: 0,
    scale: 1,
    scaleTarget: 1,
    alpha: 1,
    colorR: 1,
    colorG: 1,
    colorB: 1,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    prevRotX: 0,
    prevRotY: 0,
    prevRotZ: 0,
    rotVelX: 0,
    rotVelY: 0,
    rotVelZ: 0,
    baseY: pos.y,
  };
}

function updateEffectGround(
  effect: BallEffect,
  stageRuntime: any,
  checkMask: number,
  threshold: number,
  glowDecay: number,
): void {
  if ((effect.life & checkMask) === 0) {
    effect.hasGround = false;
    const hit = raycastStageDown(effect.pos, stageRuntime);
    if (hit && hit.normal && effect.pos.y - threshold < hit.pos.y) {
      effect.hasGround = true;
      effect.groundPos.x = hit.pos.x;
      effect.groundPos.y = hit.pos.y;
      effect.groundPos.z = hit.pos.z;
      effect.groundNormal.x = hit.normal.x;
      effect.groundNormal.y = hit.normal.y;
      effect.groundNormal.z = hit.normal.z;
      if (hit.surfaceVel) {
        effect.groundVel.x = hit.surfaceVel.x;
        effect.groundVel.y = hit.surfaceVel.y;
        effect.groundVel.z = hit.surfaceVel.z;
      } else {
        effect.groundVel.x = 0;
        effect.groundVel.y = 0;
        effect.groundVel.z = 0;
      }
    }
  }

  if (!effect.hasGround) {
    if (effect.glowDist > 0) {
      effect.glowDist = Math.max(0, effect.glowDist - glowDecay);
    }
    return;
  }

  const hitNormal = effect.groundNormal;
  const hitPos = effect.groundPos;
  const dx = effect.pos.x - hitPos.x;
  const dy = effect.pos.y - hitPos.y;
  const dz = effect.pos.z - hitPos.z;
  const dist = dx * hitNormal.x + dy * hitNormal.y + dz * hitNormal.z;
  effect.glowDist += (dist - effect.glowDist) * 0.25;
  effect.glowPos.x = effect.pos.x - (dist - 0.02) * hitNormal.x;
  effect.glowPos.y = effect.pos.y - (dist - 0.02) * hitNormal.y;
  effect.glowPos.z = effect.pos.z - (dist - 0.02) * hitNormal.z;
  const rotY = atan2S16(hitNormal.x, hitNormal.z) - 0x8000;
  const rotX = atan2S16(hitNormal.y, sqrt(sumSq2(hitNormal.x, hitNormal.z)));
  effect.glowRotY = rotY;
  effect.glowRotX = rotX;
}

function applyEffectGroundResponse(
  effect: BallEffect,
  minDist: number,
  bounceScale: number,
  surfaceBlend: number,
  randomizeRot = false,
  rng = null,
): void {
  const normal = effect.groundNormal;
  const dx = effect.pos.x - effect.groundPos.x;
  const dy = effect.pos.y - effect.groundPos.y;
  const dz = effect.pos.z - effect.groundPos.z;
  const dist = dx * normal.x + dy * normal.y + dz * normal.z;
  if (dist >= minDist) {
    return;
  }

  const push = minDist - dist;
  effect.pos.x += push * normal.x;
  effect.pos.y += push * normal.y;
  effect.pos.z += push * normal.z;

  const dot = vecDot(effect.vel, normal);
  if (dot >= 0) {
    return;
  }
  const impulse = -dot;
  effect.vel.x += impulse * normal.x;
  effect.vel.y += impulse * normal.y;
  effect.vel.z += impulse * normal.z;
  effect.vel.x += (effect.groundVel.x - effect.vel.x) * surfaceBlend;
  effect.vel.y += (effect.groundVel.y - effect.vel.y) * surfaceBlend;
  effect.vel.z += (effect.groundVel.z - effect.vel.z) * surfaceBlend;
  if (randomizeRot && rng) {
    effect.rotVelX = toS16(effect.rotVelX + impulse * (randFloat(rng) - 0.5) * STAR_ROT_KICK_XZ);
    effect.rotVelY = toS16(effect.rotVelY + impulse * (randFloat(rng) - 0.5) * STAR_ROT_KICK_Y);
    effect.rotVelZ = toS16(effect.rotVelZ + impulse * (randFloat(rng) - 0.5) * STAR_ROT_KICK_XZ);
  }
  effect.vel.x += impulse * bounceScale * normal.x;
  effect.vel.y += impulse * bounceScale * normal.y;
  effect.vel.z += impulse * bounceScale * normal.z;
}

function updateEffectGlow(
  effect: BallEffect,
  stageRuntime: any,
  threshold: number,
  glowDecay: number,
): void {
  if ((effect.life & 0x0f) !== 0) {
    if (effect.hasGround) {
      const hitNormal = effect.groundNormal;
      const hitPos = effect.groundPos;
      const dx = effect.pos.x - hitPos.x;
      const dy = effect.pos.y - hitPos.y;
      const dz = effect.pos.z - hitPos.z;
      const dist = dx * hitNormal.x + dy * hitNormal.y + dz * hitNormal.z;
      effect.glowDist += (dist - effect.glowDist) * 0.25;
      effect.glowPos.x = effect.pos.x - (dist - 0.02) * hitNormal.x;
      effect.glowPos.y = effect.pos.y - (dist - 0.02) * hitNormal.y;
      effect.glowPos.z = effect.pos.z - (dist - 0.02) * hitNormal.z;
    }
    return;
  }
  const hit = raycastStageDown(effect.pos, stageRuntime);
  if (!hit || hit.pos.y < effect.pos.y - threshold) {
    effect.hasGround = false;
    if (effect.glowDist > 0) {
      effect.glowDist = Math.max(0, effect.glowDist - glowDecay);
    }
    return;
  }
  if (!hit.normal) {
    effect.hasGround = false;
    return;
  }
  effect.hasGround = true;
  effect.groundPos.x = hit.pos.x;
  effect.groundPos.y = hit.pos.y;
  effect.groundPos.z = hit.pos.z;
  effect.groundNormal.x = hit.normal.x;
  effect.groundNormal.y = hit.normal.y;
  effect.groundNormal.z = hit.normal.z;
  const dx = effect.pos.x - hit.pos.x;
  const dy = effect.pos.y - hit.pos.y;
  const dz = effect.pos.z - hit.pos.z;
  const dist = dx * hit.normal.x + dy * hit.normal.y + dz * hit.normal.z;
  effect.glowDist += (dist - effect.glowDist) * 0.25;
  effect.glowPos.x = effect.pos.x - (dist - 0.02) * hit.normal.x;
  effect.glowPos.y = effect.pos.y - (dist - 0.02) * hit.normal.y;
  effect.glowPos.z = effect.pos.z - (dist - 0.02) * hit.normal.z;
  const rotY = atan2S16(hit.normal.x, hit.normal.z) - 0x8000;
  const rotX = atan2S16(hit.normal.y, sqrt(sumSq2(hit.normal.x, hit.normal.z)));
  effect.glowRotY = rotY;
  effect.glowRotX = rotX;
}

export function updateBallEffects(effects: BallEffect[], gravity: Vec3, stageRuntime: any, rng: any): void {
  let removed = 0;
  for (let i = effects.length - 1; i >= 0; i -= 1) {
    const effect = effects[i];
    effect.prevPos.x = effect.pos.x;
    effect.prevPos.y = effect.pos.y;
    effect.prevPos.z = effect.pos.z;
    effect.prevRotX = effect.rotX;
    effect.prevRotY = effect.rotY;
    effect.prevRotZ = effect.rotZ;
    effect.age += 1;
    effect.life -= 1;
    if (effect.life <= 0) {
      removed += 1;
      continue;
    }
    if (removed > 0) {
      effects[i + removed] = effect;
    }

    if (effect.kind === 'levitate') {
      effect.vel.x *= LEVITATE_DAMP;
      effect.vel.y = effect.vel.y * LEVITATE_DAMP + LEVITATE_GRAVITY;
      effect.vel.z *= LEVITATE_DAMP;
      effect.pos.x += effect.vel.x;
      effect.pos.y += effect.vel.y;
      effect.pos.z += effect.vel.z;
      const lifeRatio = effect.life / Math.max(1, effect.life + effect.age);
      effect.alpha = Math.min(1, Math.max(0, lifeRatio));
      effect.scale = effect.scaleTarget * (0.6 + 0.4 * effect.alpha);
      continue;
    }
    if (effect.kind === 'coliflash') {
      effect.scale += (effect.scaleTarget - effect.scale) * 0.1;
      const normal = effect.surfaceNormal;
      const nx = -normal.x;
      const nz = -normal.z;
      const rotY = atan2S16(nx, nz);
      const rotX = toS16(atan2S16(normal.y, sqrt(sumSq2(nx, nz))) - 0x8000);
      effect.rotY = rotY;
      effect.rotX = rotX;
      if (effect.life < 8) {
        const life = Math.max(1, effect.life);
        effect.alpha *= Math.max(0, (life - 1) / life);
      }
      updateEffectGlow(effect, stageRuntime, STAR_GROUND_CHECK, 0.0625);
      continue;
    }

    const gravityScale = effect.kind === 'colistar' ? STAR_GRAVITY_SCALE : SPARK_GRAVITY_SCALE;
    const damp = effect.kind === 'colistar' ? STAR_DAMP : SPARK_DAMP;
    effect.vel.x += gravity.x * gravityScale;
    effect.vel.y += gravity.y * gravityScale;
    effect.vel.z += gravity.z * gravityScale;
    effect.vel.x *= damp;
    effect.vel.y *= damp;
    effect.vel.z *= damp;
    effect.pos.x += effect.vel.x;
    effect.pos.y += effect.vel.y;
    effect.pos.z += effect.vel.z;

    if (effect.kind === 'colistar') {
      effect.rotVelX -= effect.rotVelX >> 2;
      effect.rotVelY -= effect.rotVelY >> 5;
      effect.rotVelZ -= effect.rotVelZ >> 3;
      effect.rotX = toS16(effect.rotX + effect.rotVelX);
      effect.rotY = toS16(effect.rotY + effect.rotVelY);
      effect.rotZ = toS16(effect.rotZ + effect.rotVelZ);
      if (effect.life < 24) {
        effect.scale *= effect.life / (effect.life + 1);
      } else {
        effect.scale += (effect.scaleTarget - effect.scale) * 0.3312;
      }
      updateEffectGround(effect, stageRuntime, 0x07, STAR_GROUND_CHECK, 0.0625);
      if (effect.hasGround) {
        applyEffectGroundResponse(
          effect,
          effect.scale * STAR_GROUND_MIN_DIST_SCALE,
          1.0,
          STAR_GROUND_BLEND,
          true,
          rng,
        );
      }
    } else {
      updateEffectGround(effect, stageRuntime, 0x0f, SPARK_GROUND_CHECK, 0.125);
      if (effect.hasGround) {
        applyEffectGroundResponse(effect, SPARK_GROUND_MIN_DIST, 0.9, SPARK_GROUND_BLEND);
      }
    }

    if (effect.kind === 'coli') {
      if (effect.life < 24) {
        effect.scale = effect.life / 24;
        effect.colorR *= 0.96;
        effect.colorG *= 0.87;
        effect.colorB *= 0.86;
      } else {
        effect.scale = 1;
      }
    }
    if (effect.life < 24) {
      effect.alpha = Math.max(0, effect.life / 24);
    } else {
      effect.alpha = 1;
    }
  }
  if (removed > 0) {
    effects.copyWithin(0, removed);
    effects.length -= removed;
  }
}

export function spawnMovementSparks(effects: BallEffect[], ball: any, onGround: boolean, rng: any): void {
  if (!onGround) {
    return;
  }
  const speed = sqrt(ball.vel.x * ball.vel.x + ball.vel.y * ball.vel.y + ball.vel.z * ball.vel.z);
  const intensity = speed * 5.0;
  if (intensity <= 1.5) {
    return;
  }

  const surfaceNormal = { x: ball.unk114.x, y: ball.unk114.y, z: ball.unk114.z };
  const normal = { x: -surfaceNormal.x, y: -surfaceNormal.y, z: -surfaceNormal.z };
  const basePos = {
    x: ball.pos.x + surfaceNormal.x * ball.currRadius,
    y: ball.pos.y + surfaceNormal.y * ball.currRadius,
    z: ball.pos.z + surfaceNormal.z * ball.currRadius,
  };
  const f2 = 0.85;
  const baseVel = {
    x: ball.vel.x * f2,
    y: ball.vel.y * f2,
    z: ball.vel.z * f2,
  };
  let count = Math.trunc(intensity);
  while (count > 0) {
    const spark = createEffect(
      'coli',
      basePos,
      baseVel,
      Math.trunc(SPARK_LIFE_MIN + SPARK_LIFE_RANGE * randFloat(rng)),
    );
    const spread = randFloat(rng) * intensity * 0.1;
    spark.vel.x += (normal.x + (randFloat(rng) * 1.5 - 0.75)) * spread;
    spark.vel.y += (normal.y + (randFloat(rng) * 1.5 - 0.75)) * spread;
    spark.vel.z += (normal.z + (randFloat(rng) * 1.5 - 0.75)) * spread;
    spark.scale = 1.0;
    spark.scaleTarget = 1.0;
    spark.colorR = 1.1;
    spark.colorG = 1.0;
    spark.colorB = 0.6;
    effects.push(spark);
    count -= 1;
  }
}

export function spawnCollisionStars(
  effects: BallEffect[],
  ball: any,
  hardestColiSpeed: number,
  rng: any,
): void {
  const surfaceNormal = { x: ball.unk114.x, y: ball.unk114.y, z: ball.unk114.z };
  const normal = { x: -surfaceNormal.x, y: -surfaceNormal.y, z: -surfaceNormal.z };
  const basePos = {
    x: ball.pos.x + surfaceNormal.x * ball.currRadius,
    y: ball.pos.y + surfaceNormal.y * ball.currRadius,
    z: ball.pos.z + surfaceNormal.z * ball.currRadius,
  };
  const baseVel = { x: ball.vel.x * 0.5, y: ball.vel.y * 0.5, z: ball.vel.z * 0.5 };
  const proj = -(normal.x * baseVel.x + normal.y * baseVel.y + normal.z * baseVel.z);
  baseVel.x += proj * normal.x;
  baseVel.y += proj * normal.y;
  baseVel.z += proj * normal.z;

  const rawCount = Math.abs(hardestColiSpeed / 0.0165);
  let count = Math.min(32, Math.trunc(rawCount));
  const scaleBoost = Math.abs(hardestColiSpeed / 0.33) + 1.0;

  const flashScale = sqrt(Math.abs(hardestColiSpeed * 10.0));
  const flash = createEffect('coliflash', basePos, { x: 0, y: 0, z: 0 }, 12);
  flash.scale = flashScale * 0.25;
  flash.scaleTarget = flashScale;
  flash.surfaceNormal.x = surfaceNormal.x;
  flash.surfaceNormal.y = surfaceNormal.y;
  flash.surfaceNormal.z = surfaceNormal.z;
  effects.push(flash);

  let starCount = count >> 1;
  while (starCount > 0) {
    const star = createEffect(
      'colistar',
      basePos,
      baseVel,
      Math.trunc(STAR_LIFE_MIN + STAR_LIFE_RANGE * randFloat(rng)),
    );
    const jitter = {
      x: scaleBoost * (randFloat(rng) * 0.05 - 0.025),
      y: scaleBoost * (randFloat(rng) * 0.05 - 0.025),
      z: scaleBoost * (randFloat(rng) * 0.05 - 0.025),
    };
    const push = scaleBoost * (randFloat(rng) * 0.055 + 0.015);
    star.vel.x += jitter.x + push * normal.x;
    star.vel.y += jitter.y + push * normal.y;
    star.vel.z += jitter.z + push * normal.z;
    star.rotX = 0;
    star.rotY = randS16(rng);
    star.rotZ = randS16(rng);
    star.rotVelX = 0;
    star.rotVelY = (randS16(rng) & 0xfff) + 0x1000;
    star.rotVelZ = 0;
    star.scale = 0;
    star.scaleTarget = STAR_SCALE_TARGET;
    effects.push(star);
    starCount -= 1;
  }

  count -= count >> 1;
  while (count > 0) {
    const spark = createEffect(
      'coli',
      basePos,
      { x: baseVel.x * 0.5, y: baseVel.y * 0.5, z: baseVel.z * 0.5 },
      Math.trunc(SPARK_LIFE_MIN + SPARK_LIFE_RANGE * randFloat(rng)),
    );
    const jitter = {
      x: scaleBoost * (randFloat(rng) * 0.05 - 0.025),
      y: scaleBoost * (randFloat(rng) * 0.05 - 0.025),
      z: scaleBoost * (randFloat(rng) * 0.05 - 0.025),
    };
    const push = scaleBoost * (randFloat(rng) * 0.05 + 0.06);
    spark.vel.x += jitter.x + push * normal.x;
    spark.vel.y += jitter.y + push * normal.y;
    spark.vel.z += jitter.z + push * normal.z;
    spark.colorR = 1.1;
    spark.colorG = 1.0;
    spark.colorB = 0.6;
    effects.push(spark);
    count -= 1;
  }
}

export function spawnPostGoalSparkle(effects: BallEffect[], ball: any, rng: any): void {
  const sparkle = createEffect(
    'levitate',
    ball.pos,
    {
      x: (randFloat(rng) - 0.5) * LEVITATE_DRIFT,
      y: LEVITATE_START_VEL + randFloat(rng) * LEVITATE_START_VEL,
      z: (randFloat(rng) - 0.5) * LEVITATE_DRIFT,
    },
    Math.trunc(LEVITATE_LIFE_MIN + LEVITATE_LIFE_RANGE * randFloat(rng)),
  );
  sparkle.pos.x += (randFloat(rng) - 0.5) * LEVITATE_OFFSET_RADIUS;
  sparkle.pos.y += (randFloat(rng) - 0.5) * LEVITATE_OFFSET_RADIUS;
  sparkle.pos.z += (randFloat(rng) - 0.5) * LEVITATE_OFFSET_RADIUS;
  sparkle.prevPos.x = sparkle.pos.x;
  sparkle.prevPos.y = sparkle.pos.y;
  sparkle.prevPos.z = sparkle.pos.z;
  sparkle.baseY = sparkle.pos.y;
  sparkle.scale = LEVITATE_SCALE;
  sparkle.scaleTarget = sparkle.scale;
  sparkle.rotX = randS16(rng);
  sparkle.rotY = randS16(rng);
  sparkle.rotZ = randS16(rng);
  effects.push(sparkle);
}
