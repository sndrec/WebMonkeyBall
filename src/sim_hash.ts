const f32View = new Float32Array(1);
const u32View = new Uint32Array(f32View.buffer);

function hashU32(hash, value) {
  let h = hash ^ (value >>> 0);
  h = Math.imul(h, 16777619) >>> 0;
  return h;
}

function hashF32(hash, value) {
  f32View[0] = value;
  return hashU32(hash, u32View[0]);
}

function hashVec3(hash, vec) {
  let h = hashF32(hash, vec.x);
  h = hashF32(h, vec.y);
  h = hashF32(h, vec.z);
  return h;
}

function hashS16(hash, value) {
  return hashU32(hash, value & 0xffff);
}

export function hashSimState(ball, world, stageRuntime, { includeVisual = false } = {}) {
  let h = 0x811c9dc5;
  if (!ball || !world || !stageRuntime) {
    return h >>> 0;
  }

  h = hashVec3(h, ball.pos);
  h = hashVec3(h, ball.vel);
  h = hashS16(h, ball.rotX);
  h = hashS16(h, ball.rotY);
  h = hashS16(h, ball.rotZ);
  h = hashU32(h, ball.state | 0);
  h = hashU32(h, ball.flags | 0);
  h = hashF32(h, ball.currRadius ?? 0);
  h = hashF32(h, ball.speed ?? 0);
  h = hashU32(h, ball.animGroupId | 0);
  h = hashS16(h, ball.apeYaw ?? 0);
  if (ball.orientation) {
    h = hashF32(h, ball.orientation.x);
    h = hashF32(h, ball.orientation.y);
    h = hashF32(h, ball.orientation.z);
    h = hashF32(h, ball.orientation.w);
  }

  h = hashS16(h, world.xrot ?? 0);
  h = hashS16(h, world.zrot ?? 0);
  if (world.gravity) {
    h = hashVec3(h, world.gravity);
  }

  h = hashU32(h, stageRuntime.timerFrames | 0);
  if (stageRuntime.animGroups) {
    h = hashU32(h, stageRuntime.animGroups.length | 0);
    for (const group of stageRuntime.animGroups) {
      h = hashVec3(h, group.pos);
      h = hashVec3(h, group.rot);
    }
  }
  if (stageRuntime.goalBags) {
    h = hashU32(h, stageRuntime.goalBags.length | 0);
    for (const bag of stageRuntime.goalBags) {
      h = hashU32(h, bag.state | 0);
      h = hashF32(h, bag.openness ?? 0);
      h = hashVec3(h, bag.localPos);
      h = hashVec3(h, bag.localVel);
      h = hashS16(h, bag.rotX ?? 0);
      h = hashS16(h, bag.rotY ?? 0);
      h = hashS16(h, bag.rotZ ?? 0);
    }
  }
  if (stageRuntime.bananas) {
    h = hashU32(h, stageRuntime.bananas.length | 0);
    for (const banana of stageRuntime.bananas) {
      h = hashU32(h, banana.state | 0);
      h = hashVec3(h, banana.localPos);
      h = hashVec3(h, banana.vel ?? { x: 0, y: 0, z: 0 });
      h = hashS16(h, banana.rotX ?? 0);
      h = hashS16(h, banana.rotY ?? 0);
      h = hashS16(h, banana.rotZ ?? 0);
      h = hashF32(h, banana.scale ?? 0);
    }
  }

  if (includeVisual) {
    if (stageRuntime.confetti) {
      h = hashU32(h, stageRuntime.confetti.length | 0);
      for (const frag of stageRuntime.confetti) {
        h = hashVec3(h, frag.pos);
        h = hashVec3(h, frag.vel);
        h = hashS16(h, frag.rotX ?? 0);
        h = hashS16(h, frag.rotY ?? 0);
        h = hashS16(h, frag.rotZ ?? 0);
      }
    }
    if (stageRuntime.effects) {
      h = hashU32(h, stageRuntime.effects.length | 0);
      for (const fx of stageRuntime.effects) {
        h = hashVec3(h, fx.pos);
        h = hashVec3(h, fx.vel);
        h = hashS16(h, fx.rotX ?? 0);
        h = hashS16(h, fx.rotY ?? 0);
        h = hashS16(h, fx.rotZ ?? 0);
      }
    }
  }

  return h >>> 0;
}
