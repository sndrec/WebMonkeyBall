import { DEG_TO_S16 } from './shared/constants/index.js';
import { MatrixStack, atan2S16, sumSq2, sqrt, toS16 } from './math.js';

const stack = new MatrixStack();
const upVec = { x: 0, y: 1, z: 0 };

export class World {
  constructor({ maxTilt = 23.0 } = {}) {
    this.maxTilt = maxTilt;
    this.xrot = 0;
    this.zrot = 0;
    this.xrotPrev = 0;
    this.zrotPrev = 0;
    this.gravity = { x: 0, y: -1, z: 0 };
  }

  reset() {
    this.xrot = 0;
    this.zrot = 0;
    this.xrotPrev = 0;
    this.zrotPrev = 0;
    this.gravity.x = 0;
    this.gravity.y = -1;
    this.gravity.z = 0;
  }

  updateInput(stick, cameraRotY) {
    this.xrotPrev = this.xrot;
    this.zrotPrev = this.zrot;

    let stickX = stick.x;
    let stickY = stick.y;
    if (stickX < -1) stickX = -1;
    else if (stickX > 1) stickX = 1;
    if (stickY < -1) stickY = -1;
    else if (stickY > 1) stickY = 1;

    const maxTiltS16 = this.maxTilt * DEG_TO_S16;
    let inpXRot = stickY * maxTiltS16;
    let inpZRot = -stickX * maxTiltS16;
    inpXRot = toS16(inpXRot);
    inpZRot = toS16(inpZRot);

    stack.fromIdentity();
    stack.rotateY(cameraRotY);
    stack.rotateX(inpXRot);
    stack.rotateZ(inpZRot);

    upVec.x = 0;
    upVec.y = 1;
    upVec.z = 0;
    stack.tfVec(upVec, upVec);

    inpXRot = atan2S16(upVec.z, upVec.y);
    inpZRot = -atan2S16(upVec.x, sqrt(sumSq2(upVec.z, upVec.y)));

    const dx = toS16(inpXRot - this.xrot);
    const dz = toS16(inpZRot - this.zrot);
    this.xrot = toS16(this.xrot + dx * 0.2);
    this.zrot = toS16(this.zrot + dz * 0.2);

    this.gravity.x = 0;
    this.gravity.y = -1;
    this.gravity.z = 0;
    stack.fromIdentity();
    stack.rotateX(this.xrot);
    stack.rotateZ(this.zrot);
    stack.rigidInvTfVec(this.gravity, this.gravity);
  }
}
