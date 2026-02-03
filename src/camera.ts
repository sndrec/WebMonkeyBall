import { mat3, vec3 } from 'gl-matrix';
import { MatrixStack, atan2S16, atan2S16Safe, clamp, sqrt, sumSq2, sumSq3, rsqrt, toS16 } from './math.js';
import { smoothstep } from './animation.js';
import { BALL_FLAGS, CAMERA_STATE, COLI_FLAGS, S16_TO_RAD } from './constants.js';

const stack = new MatrixStack();
const tmpVec = { x: 0, y: 0, z: 0 };
const tmpVec2 = { x: 0, y: 0, z: 0 };
const wormholeVec = vec3.create();
const wormholeMat3 = mat3.create();
const SMB2_FLY_IN_MIN_RADIUS = 31.25;
const SMB2_SPIN_IN_PRESETS = [
  { zScale: 0.8, yScale: 0.4, yawOffset: -0xc000 },
  { zScale: 0.8, yScale: 0.4, yawOffset: 0xc000 },
  { zScale: 0.8, yScale: 0.4, yawOffset: -0x6000 },
  { zScale: 0.8, yScale: 0.4, yawOffset: 0x6000 },
];
const SMB2_FLY_IN_OVERRIDES = new Map([
  [52, { pos: { x: 0, y: 0, z: -110 }, radius: 150 }],
  [279, { pos: { x: 0, y: 0, z: -50 }, radius: 100 }],
  [17, { pos: { x: 0, y: 0, z: 0 }, radius: 200 }],
]);
const SMB2_PIVOT_Y_BASE = 0.8;
const SMB2_PIVOT_Y_OFFSET = 0.18;
const SMB2_PIVOT_Y_OFFSET_STAGE = 0x15a;
const SMB2_YAW_LERP_CLAMP = 0x1a0;
const SMB2_YAW_STEP_CLAMP = 0x300;
const SMB2_PITCH_BASE = -0x900;
const SMB2_PITCH_OFFSET = 0x200;
const SMB2_PITCH_LIMIT = 0x3000;
const SMB2_STANDSTILL_SPEED = 0.02;
const FREE_FLY_LOOK_SPEED = 0x300;
const FREE_FLY_MOVE_SPEED = 0.3;
const FREE_FLY_PITCH_LIMIT = 0x3000;

function applyMat4ToPoint(out, mtx) {
  vec3.set(wormholeVec, out.x, out.y, out.z);
  vec3.transformMat4(wormholeVec, wormholeVec, mtx);
  out.x = wormholeVec[0];
  out.y = wormholeVec[1];
  out.z = wormholeVec[2];
}

function applyMat3ToVec(out, mtx) {
  vec3.set(wormholeVec, out.x, out.y, out.z);
  vec3.transformMat3(wormholeVec, wormholeVec, mtx);
  out.x = wormholeVec[0];
  out.y = wormholeVec[1];
  out.z = wormholeVec[2];
}

function cameraFaceDirection(camera, lookDir) {
  camera.rotY = atan2S16(lookDir.x, lookDir.z) - 0x8000;
  camera.rotX = atan2S16Safe(lookDir.y, sqrt(sumSq2(lookDir.x, lookDir.z)));
  camera.rotZ = 0;
}

export class GameplayCamera {
  constructor() {
    this.eye = { x: 0, y: 0, z: 0 };
    this.lookAt = { x: 0, y: 0, z: 0 };
    this.eyeVel = { x: 0, y: 0, z: 0 };
    this.lookAtVel = { x: 0, y: 0, z: 0 };
    this.rotX = 0;
    this.rotY = 0;
    this.rotZ = 0;
    this.flags = 0;
    this.state = CAMERA_STATE.LEVEL_MAIN;
    this.timerCurr = 0;
    this.timerMax = 0;
    this.unk54 = { x: 0, y: 0, z: 0 };
    this.unk60 = 0;
    this.unk64 = 0;
    this.unk68 = 0;
    this.unk6C = 0;
    this.unk70 = 0;
    this.unk74 = { x: 0, y: 0, z: 0 };
    this.unk88 = 0;
    this.unk8C = 0;
    this.unk90 = 0;
    this.unkAC = { x: 0, y: 0, z: 0 };
    this.unkB8 = 0;
    this.unk10C = 0;
    this.readyMode = 'smb1';
    this.smb2Standstill = 0;
    this.smb2PivotXRot = 0;
    this.smb2YawVel = 0;
    this.smb2FrameCounter = 0;
  }

  reset() {
    this.eye.x = 0;
    this.eye.y = 0;
    this.eye.z = 0;
    this.lookAt.x = 0;
    this.lookAt.y = 0;
    this.lookAt.z = 0;
    this.eyeVel.x = 0;
    this.eyeVel.y = 0;
    this.eyeVel.z = 0;
    this.lookAtVel.x = 0;
    this.lookAtVel.y = 0;
    this.lookAtVel.z = 0;
    this.rotX = 0;
    this.rotY = 0;
    this.rotZ = 0;
    this.flags = 0;
    this.state = CAMERA_STATE.LEVEL_MAIN;
    this.timerCurr = 0;
    this.timerMax = 0;
    this.unk54.x = 0;
    this.unk54.y = 0;
    this.unk54.z = 0;
    this.unk60 = 0;
    this.unk64 = 0;
    this.unk68 = 0;
    this.unk6C = 0;
    this.unk70 = 0;
    this.unk74.x = 0;
    this.unk74.y = 0;
    this.unk74.z = 0;
    this.unk88 = 0;
    this.unk8C = 0;
    this.unk90 = 0;
    this.unkAC.x = 0;
    this.unkAC.y = 0;
    this.unkAC.z = 0;
    this.unkB8 = 0;
    this.unk10C = 0;
    this.readyMode = 'smb1';
    this.smb2Standstill = 0;
    this.smb2PivotXRot = 0;
    this.smb2YawVel = 0;
  }

  getState() {
    return {
      eye: { x: this.eye.x, y: this.eye.y, z: this.eye.z },
      lookAt: { x: this.lookAt.x, y: this.lookAt.y, z: this.lookAt.z },
      eyeVel: { x: this.eyeVel.x, y: this.eyeVel.y, z: this.eyeVel.z },
      lookAtVel: { x: this.lookAtVel.x, y: this.lookAtVel.y, z: this.lookAtVel.z },
      rotX: this.rotX,
      rotY: this.rotY,
      rotZ: this.rotZ,
      flags: this.flags,
      state: this.state,
      timerCurr: this.timerCurr,
      timerMax: this.timerMax,
      unk54: { x: this.unk54.x, y: this.unk54.y, z: this.unk54.z },
      unk60: this.unk60,
      unk64: this.unk64,
      unk68: this.unk68,
      unk6C: this.unk6C,
      unk70: this.unk70,
      unk74: { x: this.unk74.x, y: this.unk74.y, z: this.unk74.z },
      unk88: this.unk88,
      unk8C: this.unk8C,
      unk90: this.unk90,
      unkAC: { x: this.unkAC.x, y: this.unkAC.y, z: this.unkAC.z },
      unkB8: this.unkB8,
      unk10C: this.unk10C,
      readyMode: this.readyMode,
      smb2Standstill: this.smb2Standstill,
      smb2PivotXRot: this.smb2PivotXRot,
      smb2YawVel: this.smb2YawVel,
      smb2FrameCounter: this.smb2FrameCounter,
    };
  }

  setState(state) {
    if (!state) {
      return;
    }
    this.eye.x = state.eye?.x ?? this.eye.x;
    this.eye.y = state.eye?.y ?? this.eye.y;
    this.eye.z = state.eye?.z ?? this.eye.z;
    this.lookAt.x = state.lookAt?.x ?? this.lookAt.x;
    this.lookAt.y = state.lookAt?.y ?? this.lookAt.y;
    this.lookAt.z = state.lookAt?.z ?? this.lookAt.z;
    this.eyeVel.x = state.eyeVel?.x ?? this.eyeVel.x;
    this.eyeVel.y = state.eyeVel?.y ?? this.eyeVel.y;
    this.eyeVel.z = state.eyeVel?.z ?? this.eyeVel.z;
    this.lookAtVel.x = state.lookAtVel?.x ?? this.lookAtVel.x;
    this.lookAtVel.y = state.lookAtVel?.y ?? this.lookAtVel.y;
    this.lookAtVel.z = state.lookAtVel?.z ?? this.lookAtVel.z;
    this.rotX = state.rotX ?? this.rotX;
    this.rotY = state.rotY ?? this.rotY;
    this.rotZ = state.rotZ ?? this.rotZ;
    this.flags = state.flags ?? this.flags;
    this.state = state.state ?? this.state;
    this.timerCurr = state.timerCurr ?? this.timerCurr;
    this.timerMax = state.timerMax ?? this.timerMax;
    this.unk54.x = state.unk54?.x ?? this.unk54.x;
    this.unk54.y = state.unk54?.y ?? this.unk54.y;
    this.unk54.z = state.unk54?.z ?? this.unk54.z;
    this.unk60 = state.unk60 ?? this.unk60;
    this.unk64 = state.unk64 ?? this.unk64;
    this.unk68 = state.unk68 ?? this.unk68;
    this.unk6C = state.unk6C ?? this.unk6C;
    this.unk70 = state.unk70 ?? this.unk70;
    this.unk74.x = state.unk74?.x ?? this.unk74.x;
    this.unk74.y = state.unk74?.y ?? this.unk74.y;
    this.unk74.z = state.unk74?.z ?? this.unk74.z;
    this.unk88 = state.unk88 ?? this.unk88;
    this.unk8C = state.unk8C ?? this.unk8C;
    this.unk90 = state.unk90 ?? this.unk90;
    this.unkAC.x = state.unkAC?.x ?? this.unkAC.x;
    this.unkAC.y = state.unkAC?.y ?? this.unkAC.y;
    this.unkAC.z = state.unkAC?.z ?? this.unkAC.z;
    this.unkB8 = state.unkB8 ?? this.unkB8;
    this.unk10C = state.unk10C ?? this.unk10C;
    this.readyMode = state.readyMode ?? this.readyMode;
    this.smb2Standstill = state.smb2Standstill ?? this.smb2Standstill;
    this.smb2PivotXRot = state.smb2PivotXRot ?? this.smb2PivotXRot;
    this.smb2YawVel = state.smb2YawVel ?? this.smb2YawVel;
    this.smb2FrameCounter = state.smb2FrameCounter ?? this.smb2FrameCounter;
  }

  applyWormholeTransform(wormholeTf) {
    mat3.fromMat4(wormholeMat3, wormholeTf);
    applyMat4ToPoint(this.eye, wormholeTf);
    applyMat4ToPoint(this.lookAt, wormholeTf);
    applyMat4ToPoint(this.unkAC, wormholeTf);
    applyMat4ToPoint(this.unk54, wormholeTf);
    applyMat4ToPoint(this.unk74, wormholeTf);
    applyMat3ToVec(this.eyeVel, wormholeMat3);
    applyMat3ToVec(this.lookAtVel, wormholeMat3);
    tmpVec.x = this.lookAt.x - this.eye.x;
    tmpVec.y = this.lookAt.y - this.eye.y;
    tmpVec.z = this.lookAt.z - this.eye.z;
    cameraFaceDirection(this, tmpVec);
  }

  initForStage(ball, startRotY = 0, stageRuntime = null) {
    if (stageRuntime?.stage?.format === 'smb2') {
      this.initForStageSmb2(ball, startRotY, stageRuntime);
      return;
    }
    this.reset();
    this.lookAt.x = ball.pos.x;
    this.lookAt.y = ball.pos.y + 0.5;
    this.lookAt.z = ball.pos.z;

    stack.fromTranslate(this.lookAt);
    stack.rotateY(startRotY);

    tmpVec.x = 0;
    tmpVec.y = 1;
    tmpVec.z = 3;
    stack.tfPoint(tmpVec, this.eye);

    tmpVec.x = 0;
    tmpVec.y = 0;
    tmpVec.z = 3;
    stack.tfPoint(tmpVec, this.unkAC);

    tmpVec.x = this.lookAt.x - this.eye.x;
    tmpVec.y = this.lookAt.y - this.eye.y;
    tmpVec.z = this.lookAt.z - this.eye.z;
    cameraFaceDirection(this, tmpVec);
    this.state = CAMERA_STATE.LEVEL_MAIN;
  }

  initForStageSmb2(ball, startRotY, stageRuntime) {
    this.reset();
    const stageId = stageRuntime?.stage?.stageId ?? -1;
    const pivotOffset = stageId === SMB2_PIVOT_Y_OFFSET_STAGE ? 0 : SMB2_PIVOT_Y_OFFSET;
    const pitchOffset = stageId === SMB2_PIVOT_Y_OFFSET_STAGE ? 0 : SMB2_PITCH_OFFSET;

    this.lookAt.x = ball.pos.x;
    this.lookAt.y = ball.pos.y + SMB2_PIVOT_Y_BASE + pivotOffset;
    this.lookAt.z = ball.pos.z;

    stack.fromTranslate(this.lookAt);
    stack.rotateY(startRotY);

    tmpVec.x = 0;
    tmpVec.y = 1;
    tmpVec.z = 3;
    stack.tfPoint(tmpVec, this.eye);

    tmpVec.x = 0;
    tmpVec.y = 0;
    tmpVec.z = 3;
    stack.tfPoint(tmpVec, this.unkAC);

    tmpVec.x = this.lookAt.x - this.eye.x;
    tmpVec.y = this.lookAt.y - this.eye.y;
    tmpVec.z = this.lookAt.z - this.eye.z;
    cameraFaceDirection(this, tmpVec);
    this.rotX = toS16(SMB2_PITCH_BASE - pitchOffset);
    this.rotZ = 0;
    this.state = CAMERA_STATE.LEVEL_MAIN;
  }

  initReady(stageRuntime, startRotY, startPos, flyInFrames = 90) {
    if (stageRuntime?.stage?.format === 'smb2') {
      this.initReadySmb2(stageRuntime, startRotY, startPos, flyInFrames);
      return;
    }
    this.reset();
    const flyIn = stageRuntime?.getFlyInSphere?.() ?? stageRuntime?.boundSphere;
    if (flyIn) {
      this.unk54.x = flyIn.pos.x;
      this.unk54.y = flyIn.pos.y;
      this.unk54.z = flyIn.pos.z;
      this.unk60 = flyIn.radius * 0.8;
      this.unk64 = flyIn.radius * 0.8;
    }

    stack.fromTranslate(this.unk54);
    stack.rotateY(startRotY);
    tmpVec.x = 0;
    tmpVec.y = this.unk64;
    tmpVec.z = this.unk60;
    stack.tfPoint(tmpVec, tmpVec);
    tmpVec.x = this.unk54.x - tmpVec.x;
    tmpVec.y = this.unk54.y - tmpVec.y;
    tmpVec.z = this.unk54.z - tmpVec.z;
    this.unk6C = toS16(atan2S16(tmpVec.x, tmpVec.z) - 0x8000);
    this.unk68 = atan2S16Safe(tmpVec.y, sqrt(sumSq2(tmpVec.x, tmpVec.z)));
    this.unk70 = 0;

    this.unk74.x = startPos.x;
    this.unk74.y = startPos.y + 0.5;
    this.unk74.z = startPos.z;
    stack.fromTranslate(this.unk74);
    stack.rotateY(startRotY);
    tmpVec.x = 0;
    tmpVec.y = 1;
    tmpVec.z = 3;
    stack.tfPoint(tmpVec, tmpVec);
    tmpVec.x = this.unk74.x - tmpVec.x;
    tmpVec.y = this.unk74.y - tmpVec.y;
    tmpVec.z = this.unk74.z - tmpVec.z;
    this.unk8C = toS16(atan2S16(tmpVec.x, tmpVec.z) - 0x8000) + 0x10000;
    this.unk88 = atan2S16Safe(tmpVec.y, sqrt(sumSq2(tmpVec.x, tmpVec.z)));
    this.unk90 = 0;
    this.flags |= 1;
    this.timerCurr = flyInFrames;
    this.timerMax = flyInFrames;
    this.state = CAMERA_STATE.READY_MAIN;
    this.updateReadyMain(false, false);
  }

  initReadySmb2(stageRuntime, startRotY, startPos, flyInFrames = 90) {
    this.reset();
    this.readyMode = 'smb2';
    const stageId = stageRuntime?.stage?.stageId ?? -1;
    const override = SMB2_FLY_IN_OVERRIDES.get(stageId);
    const flyIn = override ?? stageRuntime?.boundSphere;
    const radius = Math.max(flyIn?.radius ?? 0, SMB2_FLY_IN_MIN_RADIUS);
    let presetIndex = this.smb2FrameCounter & 3;
    if (stageId === 0x11e && presetIndex === 2) {
      presetIndex = 0;
    }
    const preset = SMB2_SPIN_IN_PRESETS[presetIndex];

    if (flyIn) {
      this.unk54.x = flyIn.pos.x;
      this.unk54.y = flyIn.pos.y;
      this.unk54.z = flyIn.pos.z;
    }
    this.unk60 = radius * preset.zScale;
    this.unk64 = radius * preset.yScale;

    stack.fromTranslate(this.unk54);
    stack.rotateY(startRotY);
    tmpVec.x = 0;
    tmpVec.y = this.unk64;
    tmpVec.z = this.unk60;
    stack.tfPoint(tmpVec, tmpVec);
    tmpVec.x = this.unk54.x - tmpVec.x;
    tmpVec.y = this.unk54.y - tmpVec.y;
    tmpVec.z = this.unk54.z - tmpVec.z;
    this.unk6C = toS16(atan2S16(tmpVec.x, tmpVec.z) - 0x8000 + preset.yawOffset);
    this.unk68 = atan2S16Safe(tmpVec.y, sqrt(sumSq2(tmpVec.x, tmpVec.z)));
    this.unk70 = 0;

    const pivotYOffset = (stageId === 0x15a ? 0 : 0.18) + 0.8;
    this.unk74.x = startPos.x;
    this.unk74.y = startPos.y + pivotYOffset;
    this.unk74.z = startPos.z;
    this.unk8C = toS16(startRotY);
    this.unk88 = toS16(-0x900 - (stageId === 0x15a ? 0 : 0x200));
    this.unk90 = 0;
    this.flags |= 1;
    this.timerCurr = flyInFrames;
    this.timerMax = flyInFrames;
    this.state = CAMERA_STATE.READY_MAIN;
    this.updateReadyMain(false, false);
  }

  updateReadyMain(paused, fastForward) {
    if (paused) {
      return;
    }
    if (this.timerCurr > 0) {
      this.timerCurr -= 1;
      if (fastForward) {
        this.timerCurr -= 1;
      }
    }

    let t = this.timerCurr / (this.timerMax || 1);
    t = smoothstep(t);

    this.lookAt.x = this.unk74.x * (1 - t) + this.unk54.x * t;
    this.lookAt.y = this.unk74.y * (1 - t) + this.unk54.y * t;
    this.lookAt.z = this.unk74.z * (1 - t) + this.unk54.z * t;

    const deltaX = toS16(this.unk88 - this.unk68);
    const deltaZ = toS16(this.unk90 - this.unk70);
    this.rotX = toS16(this.unk68 + deltaX * (1 - t));
    this.rotY = toS16(this.unk6C + (this.unk8C - this.unk6C) * (1 - t));
    this.rotZ = toS16(this.unk70 + deltaZ * (1 - t));

    stack.fromTranslate(this.lookAt);
    stack.rotateY(this.rotY);
    tmpVec.x = 0;
    tmpVec.y = (1 - t) + this.unk64 * t;
    tmpVec.z = (1 - t) * 3 + this.unk60 * t;
    stack.tfPoint(tmpVec, this.eye);
  }

  updateLevelMain(ball, paused) {
    if (paused) {
      return;
    }
    const prevEye = { x: this.eye.x, y: this.eye.y, z: this.eye.z };
    const prevLookAt = { x: this.lookAt.x, y: this.lookAt.y, z: this.lookAt.z };

    tmpVec.x = this.unkAC.x - this.lookAt.x;
    tmpVec.y = this.unkAC.y - this.lookAt.y;
    tmpVec.z = this.unkAC.z - this.lookAt.z;
    let f1 = sumSq3(tmpVec.x, tmpVec.y, tmpVec.z);
    if (f1 > 1e-7) {
      f1 = rsqrt(f1);
      tmpVec.x *= f1;
      tmpVec.y *= f1;
      tmpVec.z *= f1;
    } else {
      tmpVec.x = 1;
      tmpVec.y = 0;
      tmpVec.z = 0;
    }

    tmpVec.x = tmpVec.x * 0.75 + this.lookAt.x;
    tmpVec.y = tmpVec.y * 0.75 + this.lookAt.y;
    tmpVec.z = tmpVec.z * 0.75 + this.lookAt.z;

    this.lookAt.x = ball.pos.x;
    this.lookAt.y = ball.pos.y + 0.5;
    this.lookAt.z = ball.pos.z;

    tmpVec.x = this.lookAt.x - tmpVec.x;
    tmpVec.y = this.lookAt.y - tmpVec.y;
    tmpVec.z = this.lookAt.z - tmpVec.z;

    let pitch = 0;
    if (ball.unk80 >= 60) {
      pitch = atan2S16Safe(tmpVec.y, sqrt(sumSq2(tmpVec.x, tmpVec.z)));
    }

    let yaw = toS16(atan2S16(tmpVec.x, tmpVec.z) - 0x8000);
    let deltaYaw = toS16(yaw - this.rotY);
    yaw = toS16(this.rotY + clamp(deltaYaw, -512, 512));

    if (!(this.flags & (1 << 1)) && !(ball.flags & BALL_FLAGS.GOAL)) {
      let steer = toS16(ball.unk92 - yaw);
      if (steer > 0x800) {
        steer -= 0x800;
      } else if (steer < -0x800) {
        steer += 0x800;
      } else {
        steer = 0;
      }
      steer >>= 7;
      let steerVel = this.unk10C;
      if (steer === 0) {
        steerVel = 0;
      } else if ((steerVel < 0 && steer > 0) || (steerVel > 0 && steer < 0)) {
        steerVel = 0;
      } else if (steer < 0) {
        if (steer < steerVel - 4) {
          steerVel -= 4;
        } else {
          steerVel = steer;
        }
      } else if (steer > steerVel + 4) {
        steerVel += 4;
      } else {
        steerVel = steer;
      }

      yaw = toS16(yaw + steerVel);
      deltaYaw = clamp(toS16(yaw - this.rotY), -768, 768);
      yaw = toS16(this.rotY + deltaYaw);
    }

    if (pitch < -6144) {
      pitch = -6144;
    } else if (pitch > 6144) {
      pitch = 6144;
    }
    const pitchSmoothed = toS16(this.unkB8 + 0.2 * (pitch - this.unkB8));
    this.unkB8 = pitchSmoothed;

    stack.fromTranslate(this.lookAt);
    stack.rotateY(yaw);
    stack.rotateX(pitchSmoothed);
    tmpVec.x = 0;
    tmpVec.y = 0;
    tmpVec.z = 3;
    stack.tfPoint(tmpVec, this.unkAC);

    this.unk10C = toS16(yaw - this.rotY);
    this.rotY = yaw;
    this.rotX = toS16(pitchSmoothed + 62208);

    stack.fromTranslate(this.lookAt);
    stack.rotateY(this.rotY);
    stack.rotateX(this.rotX);
    tmpVec2.x = 0;
    tmpVec2.y = 0;
    tmpVec2.z = sqrt(sumSq2(3, 1));
    stack.tfPoint(tmpVec2, this.eye);

    this.eyeVel.x = this.eye.x - prevEye.x;
    this.eyeVel.y = this.eye.y - prevEye.y;
    this.eyeVel.z = this.eye.z - prevEye.z;

    this.lookAtVel.x = this.lookAt.x - prevLookAt.x;
    this.lookAtVel.y = this.lookAt.y - prevLookAt.y;
    this.lookAtVel.z = this.lookAt.z - prevLookAt.z;
  }

  updateLevelMainSmb2(ball, stageRuntime, paused) {
    if (paused) {
      return;
    }
    const prevEye = { x: this.eye.x, y: this.eye.y, z: this.eye.z };
    const prevLookAt = { x: this.lookAt.x, y: this.lookAt.y, z: this.lookAt.z };
    const stageId = stageRuntime?.stage?.stageId ?? -1;
    const pivotOffset = stageId === SMB2_PIVOT_Y_OFFSET_STAGE ? 0 : SMB2_PIVOT_Y_OFFSET;
    const pitchOffset = stageId === SMB2_PIVOT_Y_OFFSET_STAGE ? 0 : SMB2_PITCH_OFFSET;

    const speed = ball.speed ?? sqrt(sumSq3(ball.vel.x, ball.vel.y, ball.vel.z));
    if (speed <= SMB2_STANDSTILL_SPEED) {
      this.smb2Standstill = Math.min(60, this.smb2Standstill + 1);
    } else {
      this.smb2Standstill = Math.max(0, this.smb2Standstill - 1);
    }

    tmpVec.x = this.unkAC.x - this.lookAt.x;
    tmpVec.y = this.unkAC.y - this.lookAt.y;
    tmpVec.z = this.unkAC.z - this.lookAt.z;
    let lenSq = sumSq3(tmpVec.x, tmpVec.y, tmpVec.z);
    if (lenSq > 1.1920928955078125e-7) {
      const invLen = rsqrt(lenSq);
      tmpVec.x *= invLen;
      tmpVec.y *= invLen;
      tmpVec.z *= invLen;
    } else {
      tmpVec.x = 1;
      tmpVec.y = 0;
      tmpVec.z = 0;
    }

    this.lookAt.x = ball.pos.x;
    this.lookAt.y = ball.pos.y + SMB2_PIVOT_Y_BASE + pivotOffset;
    this.lookAt.z = ball.pos.z;

    tmpVec.x = this.lookAt.x - (tmpVec.x * 0.75 + prevLookAt.x);
    tmpVec.y = this.lookAt.y - (tmpVec.y * 0.75 + prevLookAt.y);
    tmpVec.z = this.lookAt.z - (tmpVec.z * 0.75 + prevLookAt.z);

    let pitchRaw = 0;
    if (ball.unk80 >= 60) {
      pitchRaw = atan2S16Safe(tmpVec.y, sqrt(sumSq2(tmpVec.x, tmpVec.z)));
    }

    let yaw = toS16(atan2S16(tmpVec.x, tmpVec.z) - 0x8000);
    let yawDelta = toS16(yaw - this.rotY);
    let yawAdjust = clamp(Math.trunc(yawDelta * 0.6), -SMB2_YAW_LERP_CLAMP, SMB2_YAW_LERP_CLAMP);
    yaw = toS16(this.rotY + yawAdjust);

    const groundNormalY = ball.physBall?.hardestColiPlane?.normal?.y ?? 0;
    const onGround = (ball.physBall?.flags & COLI_FLAGS.OCCURRED) !== 0 && groundNormalY > 0.5;
    if (onGround) {
      const standstillFactor = 1 - this.smb2Standstill / 60;
      const yawLimit = standstillFactor * 4096;
      let steer = toS16(ball.unk92 - yaw);
      let yawDiff = 0;
      if (yawLimit < steer) {
        yawDiff = steer - yawLimit;
      } else if (steer < -yawLimit) {
        yawDiff = steer + yawLimit;
      }

      let steerBlend = 1;
      if (speed >= 0.2777778) {
        steerBlend = 0;
      } else if (speed > 0.18518518) {
        steerBlend = (speed - 0.18518518) / 0.09259259;
      }
      yaw = toS16(yaw + Math.trunc((yawDiff * steerBlend) / 128));
    }

    let yawStep = toS16(yaw - this.rotY);
    yawStep = clamp(yawStep, -SMB2_YAW_STEP_CLAMP, SMB2_YAW_STEP_CLAMP);
    yaw = toS16(this.rotY + yawStep);

    const pitchMin = pitchOffset - SMB2_PITCH_LIMIT;
    const pitchMax = pitchOffset + SMB2_PITCH_LIMIT;
    if (pitchRaw < pitchMin) {
      pitchRaw = pitchMin;
    } else if (pitchRaw > pitchMax) {
      pitchRaw = pitchMax;
    }

    if (this.smb2PivotXRot < 0) {
      this.smb2PivotXRot = Math.trunc(this.smb2PivotXRot * 0.99);
    } else {
      this.smb2PivotXRot = Math.trunc(this.smb2PivotXRot * 0.95);
    }
    this.smb2PivotXRot = toS16(this.smb2PivotXRot + (pitchRaw - this.smb2PivotXRot) * 0.2);

    stack.fromTranslate(this.lookAt);
    stack.rotateY(yaw);
    stack.rotateX(this.smb2PivotXRot);
    tmpVec.x = 0;
    tmpVec.y = 0;
    tmpVec.z = 3;
    stack.tfPoint(tmpVec, this.unkAC);

    this.smb2YawVel = toS16(yaw - this.rotY);
    this.rotY = yaw;
    this.rotX = toS16(this.smb2PivotXRot + (SMB2_PITCH_BASE - pitchOffset));

    stack.fromTranslate(this.lookAt);
    stack.rotateY(this.rotY);
    stack.rotateX(this.rotX);
    tmpVec2.x = 0;
    tmpVec2.y = 0;
    tmpVec2.z = sqrt(10);
    stack.tfPoint(tmpVec2, this.eye);

    if (this.rotZ !== 0) {
      this.rotZ = toS16(this.rotZ * 0.95);
    }

    this.eyeVel.x = this.eye.x - prevEye.x;
    this.eyeVel.y = this.eye.y - prevEye.y;
    this.eyeVel.z = this.eye.z - prevEye.z;

    this.lookAtVel.x = this.lookAt.x - prevLookAt.x;
    this.lookAtVel.y = this.lookAt.y - prevLookAt.y;
    this.lookAtVel.z = this.lookAt.z - prevLookAt.z;
  }

  setGoalMain() {
    this.state = CAMERA_STATE.GOAL_MAIN;
  }

  initFalloutReplay(ball) {
    this.state = CAMERA_STATE.FALLOUT_REPLAY;
    this.flags |= 1;
    this.lookAt.x = ball.pos.x;
    this.lookAt.y = ball.pos.y;
    this.lookAt.z = ball.pos.z;

    const randYaw = toS16(ball.rotY ?? 0);
    stack.fromIdentity();
    stack.rotateY(randYaw);
    tmpVec.x = 3;
    tmpVec.y = 3;
    tmpVec.z = 3;
    stack.tfVec(tmpVec, tmpVec);
    this.eye.x = ball.pos.x + tmpVec.x;
    this.eye.y = ball.pos.y + tmpVec.y;
    this.eye.z = ball.pos.z + tmpVec.z;

    this.eyeVel.x = (ball.pos.x - this.eye.x) * 0.05;
    this.eyeVel.y = (ball.pos.y - this.eye.y) * 0.05;
    this.eyeVel.z = (ball.pos.z - this.eye.z) * 0.05;
    this.lookAtVel.x = 0;
    this.lookAtVel.y = 0;
    this.lookAtVel.z = 0;

    tmpVec.x = this.lookAt.x - this.eye.x;
    tmpVec.y = this.lookAt.y - this.eye.y;
    tmpVec.z = this.lookAt.z - this.eye.z;
    cameraFaceDirection(this, tmpVec);
  }

  initSpectatorFreeFly(pose) {
    if (!pose) {
      return;
    }
    this.reset();
    this.eye.x = pose.eye?.x ?? this.eye.x;
    this.eye.y = pose.eye?.y ?? this.eye.y;
    this.eye.z = pose.eye?.z ?? this.eye.z;
    this.lookAt.x = pose.lookAt?.x ?? this.lookAt.x;
    this.lookAt.y = pose.lookAt?.y ?? this.lookAt.y;
    this.lookAt.z = pose.lookAt?.z ?? this.lookAt.z;
    this.rotX = pose.rotX ?? this.rotX;
    this.rotY = pose.rotY ?? this.rotY;
    this.rotZ = pose.rotZ ?? this.rotZ;
    this.state = CAMERA_STATE.SPECTATOR_FREE;
  }

  updateSpectatorFreeFly(move, look, paused) {
    if (paused) {
      return;
    }
    const moveX = move?.x ?? 0;
    const moveY = move?.y ?? 0;
    const lookX = look?.x ?? 0;
    const lookY = look?.y ?? 0;
    this.rotY = toS16(this.rotY + lookX * FREE_FLY_LOOK_SPEED);
    this.rotX = toS16(clamp(this.rotX + lookY * FREE_FLY_LOOK_SPEED, -FREE_FLY_PITCH_LIMIT, FREE_FLY_PITCH_LIMIT));
    this.rotZ = 0;

    const yawRad = this.rotY * S16_TO_RAD;
    const pitchRad = this.rotX * S16_TO_RAD;
    const cosPitch = Math.cos(pitchRad);
    const sinPitch = Math.sin(pitchRad);
    const forwardX = -Math.sin(yawRad) * cosPitch;
    const forwardY = sinPitch;
    const forwardZ = -Math.cos(yawRad) * cosPitch;
    const rightX = -forwardZ;
    const rightZ = forwardX;

    const forwardScale = -moveY;
    this.eye.x += (rightX * moveX + forwardX * forwardScale) * FREE_FLY_MOVE_SPEED;
    this.eye.y += (forwardY * forwardScale) * FREE_FLY_MOVE_SPEED;
    this.eye.z += (rightZ * moveX + forwardZ * forwardScale) * FREE_FLY_MOVE_SPEED;

    this.lookAt.x = this.eye.x + forwardX;
    this.lookAt.y = this.eye.y + forwardY;
    this.lookAt.z = this.eye.z + forwardZ;
  }

  updateFalloutReplay(ball, paused) {
    if (paused) {
      return;
    }

    this.eyeVel.x *= 0.97;
    this.eyeVel.y *= 0.955;
    this.eyeVel.z *= 0.97;

    this.eye.x += this.eyeVel.x;
    this.eye.y += this.eyeVel.y;
    this.eye.z += this.eyeVel.z;

    this.lookAtVel.x = 0.15 * (ball.pos.x - this.lookAt.x);
    this.lookAtVel.y = 0.15 * (ball.pos.y - this.lookAt.y);
    this.lookAtVel.z = 0.15 * (ball.pos.z - this.lookAt.z);

    this.lookAt.x += this.lookAtVel.x;
    this.lookAt.y += this.lookAtVel.y;
    this.lookAt.z += this.lookAtVel.z;

    tmpVec.x = this.lookAt.x - this.eye.x;
    tmpVec.y = this.lookAt.y - this.eye.y;
    tmpVec.z = this.lookAt.z - this.eye.z;
    cameraFaceDirection(this, tmpVec);
  }

  updateGoalMain(ball, paused) {
    if (paused) {
      return;
    }
    tmpVec.x = ball.pos.x - this.eye.x;
    tmpVec.y = 0;
    tmpVec.z = ball.pos.z - this.eye.z;

    const dot = tmpVec.x * this.eyeVel.x + tmpVec.y * this.eyeVel.y + tmpVec.z * this.eyeVel.z;
    const dirLen = sumSq2(tmpVec.x, tmpVec.z);
    if (dirLen > 0) {
      const invLen = rsqrt(dirLen);
      tmpVec.x *= invLen;
      tmpVec.z *= invLen;
    }

    this.eyeVel.y *= 0.97;
    let f2 = -0.01 * dot;
    this.eyeVel.x += f2 * tmpVec.x;
    this.eyeVel.z += f2 * tmpVec.z;
    if (f2 < 0) {
      f2 *= 0.5;
      this.eyeVel.x += f2 * tmpVec.z;
      this.eyeVel.z += f2 * tmpVec.x;
    }

    this.eye.x += this.eyeVel.x;
    this.eye.y += this.eyeVel.y;
    this.eye.z += this.eyeVel.z;

    this.lookAtVel.x = 0.3 * (ball.pos.x - this.lookAt.x);
    this.lookAtVel.y = 0.3 * (ball.pos.y - this.lookAt.y);
    this.lookAtVel.z = 0.3 * (ball.pos.z - this.lookAt.z);

    this.lookAt.x += this.lookAtVel.x;
    this.lookAt.y += this.lookAtVel.y;
    this.lookAt.z += this.lookAtVel.z;

    tmpVec.x = this.eye.x - this.lookAt.x;
    tmpVec.y = 0;
    tmpVec.z = this.eye.z - this.lookAt.z;
    const dist = sqrt(sumSq2(tmpVec.x, tmpVec.z));
    if (dist > 1e-7) {
      const f3 = (dist + 0.08 * (2 - dist)) / dist;
      this.eye.x = tmpVec.x * f3 + this.lookAt.x;
      this.eye.z = tmpVec.z * f3 + this.lookAt.z;
      if (!(ball.flags & BALL_FLAGS.FLAG_09)) {
        tmpVec.y = this.lookAt.y - this.eye.y;
        this.eye.y += 0.01 * tmpVec.y;
      }
    }

    tmpVec.x = this.lookAt.x - this.eye.x;
    tmpVec.y = this.lookAt.y - this.eye.y;
    tmpVec.z = this.lookAt.z - this.eye.z;
    cameraFaceDirection(this, tmpVec);
  }

  update(ball, stageRuntime, paused, fastForwardIntro = false) {
    if (!paused) {
      this.smb2FrameCounter = (this.smb2FrameCounter + 1) >>> 0;
    }
    switch (this.state) {
      case CAMERA_STATE.FALLOUT_REPLAY:
        this.updateFalloutReplay(ball, paused);
        break;
      case CAMERA_STATE.READY_MAIN:
        this.updateReadyMain(paused, fastForwardIntro);
        break;
      case CAMERA_STATE.GOAL_MAIN:
        this.updateGoalMain(ball, paused);
        break;
      case CAMERA_STATE.SPECTATOR_FREE:
        break;
      case CAMERA_STATE.LEVEL_MAIN:
      default:
        if (stageRuntime?.stage?.format === 'smb2') {
          this.updateLevelMainSmb2(ball, stageRuntime, paused);
        } else {
          this.updateLevelMain(ball, paused);
        }
        break;
    }
  }
}
