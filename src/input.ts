export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.gamepadIndex = null;

    this.controlModeKey = 'smb_control_mode';
    this.hasTouch = ('ontouchstart' in window) || ((navigator.maxTouchPoints ?? 0) > 0);
    const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
    this.hasGyro = typeof window.DeviceOrientationEvent !== 'undefined' && (this.hasTouch || hasCoarsePointer);

    this.touch = {
      pointerId: null,
      active: false,
      centerX: 0,
      centerY: 0,
      value: { x: 0, y: 0 },
    };

    this.touchAction = {
      pointerId: null,
      active: false,
    };

    this.gyro = {
      baselineSet: false,
      baseBeta: 0,
      baseGamma: 0,
      value: { x: 0, y: 0 },
    };
    this.gyroRaw = {
      beta: 0,
      gamma: 0,
      hasSample: false,
    };

    this.gyroSensitivity = 25;
    this.joystickScale = 1;
    this.inputFalloff = 1;
    this.touchPreview = false;
    this.padGate = loadPadGate() ?? DEFAULT_STICK_GATE.map((point) => [point[0], point[1]]);
    this.gyroTapMode = 'recalibrate';

    this.touchRoot = document.getElementById('touch-controls');
    this.joystickEl = this.touchRoot?.querySelector?.('.joystick') ?? null;
    this.joystickHandleEl = this.touchRoot?.querySelector?.('.joystick-handle') ?? null;
    this.touchRoot?.style.setProperty('--joystick-scale', String(this.joystickScale));

    this.handlers = {
      keydown: (event) => {
        if (!this.down.has(event.code)) {
          this.pressed.add(event.code);
        }
        this.down.add(event.code);
      },
      keyup: (event) => {
        this.down.delete(event.code);
      },

      pointerdown: (event) => {
        if (!this.hasTouch) {
          return;
        }
        if (this.getControlMode() !== 'touch') {
          return;
        }
        if (!this.isTouchLayerActive()) {
          return;
        }
        if (this.isOverlayVisible() && this.touchPreview) {
          if (!(event.target instanceof HTMLElement)) {
            return;
          }
          const onJoystick = event.target.closest('.joystick');
          if (!onJoystick) {
            return;
          }
        }
        if (this.touch.pointerId !== null) {
          return;
        }

        event.preventDefault();
        this.touch.pointerId = event.pointerId;
        this.touch.active = true;
        if (this.isOverlayVisible() && this.touchPreview && this.joystickEl) {
          const rect = this.joystickEl.getBoundingClientRect();
          this.touch.centerX = rect.left + rect.width / 2;
          this.touch.centerY = rect.top + rect.height / 2;
        } else {
          this.touch.centerX = event.clientX;
          this.touch.centerY = event.clientY;
        }
        this.touch.value.x = 0;
        this.touch.value.y = 0;

        this.touchRoot?.setPointerCapture?.(event.pointerId);
        if (!this.isOverlayVisible() || !this.touchPreview) {
          this.showJoystickAt(event.clientX, event.clientY);
        }
        this.updateJoystickHandle(0, 0);
      },

      pointermove: (event) => {
        if (!this.touch.active || event.pointerId !== this.touch.pointerId) {
          return;
        }
        event.preventDefault();

        const MAX_RADIUS = 55 * this.joystickScale;
        const dx = event.clientX - this.touch.centerX;
        const dy = event.clientY - this.touch.centerY;
        const dist = Math.hypot(dx, dy);
        let nx = 0;
        let ny = 0;
        let px = dx;
        let py = dy;

        if (dist > 0) {
          const clamped = Math.min(dist, MAX_RADIUS);
          const s = clamped / dist;
          px = dx * s;
          py = dy * s;
          nx = px / MAX_RADIUS;
          ny = py / MAX_RADIUS;
        }

        this.touch.value.x = clamp(nx * 1.5, -1, 1);
        this.touch.value.y = clamp(ny * 1.5, -1, 1);
        this.updateJoystickHandle(px, py);
      },

      pointerup: (event) => {
        if (event.pointerId === this.touch.pointerId) {
          this.endTouch();
        }
        if (event.pointerId === this.touchAction.pointerId) {
          this.endTouchAction();
        }
      },

      pointercancel: (event) => {
        if (event.pointerId === this.touch.pointerId) {
          this.endTouch();
        }
        if (event.pointerId === this.touchAction.pointerId) {
          this.endTouchAction();
        }
      },

      pointerdownAction: (event) => {
        if (!this.hasTouch) {
          return;
        }
        if (event.pointerType !== 'touch') {
          return;
        }
        if (this.isOverlayVisible()) {
          return;
        }
        if (this.getControlMode() === 'gyro' && this.gyroTapMode === 'recalibrate') {
          event.preventDefault();
          this.recalibrateGyro();
          return;
        }
        if (event.target instanceof HTMLElement) {
          const interactive = event.target.closest('button, input, select, textarea, a, label');
          if (interactive) {
            return;
          }
        }
        if (this.touchAction.pointerId !== null) {
          return;
        }
        event.preventDefault();
        this.touchAction.pointerId = event.pointerId;
        this.touchAction.active = true;
      },

      deviceorientation: (event) => {
        if (!this.hasGyro) {
          return;
        }
        if (this.getControlMode() !== 'gyro') {
          return;
        }

        const rawBeta = typeof event.beta === 'number' ? event.beta : 0;
        const rawGamma = typeof event.gamma === 'number' ? event.gamma : 0;
        const { beta, gamma } = adjustGyroForOrientation(rawBeta, rawGamma);
        this.gyroRaw.beta = beta;
        this.gyroRaw.gamma = gamma;
        this.gyroRaw.hasSample = true;

        if (!this.gyro.baselineSet) {
          this.gyro.baselineSet = true;
          this.gyro.baseBeta = beta;
          this.gyro.baseGamma = gamma;
        }

        const MAX_ANGLE = this.gyroSensitivity;
        const x = (gamma - this.gyro.baseGamma) / MAX_ANGLE;
        const y = (beta - this.gyro.baseBeta) / MAX_ANGLE;
        this.gyro.value.x = clamp(x, -1, 1);
        this.gyro.value.y = clamp(y, -1, 1);
      },

      gamepadconnected: (event) => {
        if (this.gamepadIndex === null) {
          this.gamepadIndex = event.gamepad.index;
        }
      },
      gamepaddisconnected: (event) => {
        if (event.gamepad.index === this.gamepadIndex) {
          this.gamepadIndex = null;
        }
      },
    };
    window.addEventListener('keydown', this.handlers.keydown);
    window.addEventListener('keyup', this.handlers.keyup);

    if (this.hasTouch && this.touchRoot) {
      this.touchRoot.addEventListener('pointerdown', this.handlers.pointerdown, { passive: false });
      window.addEventListener('pointermove', this.handlers.pointermove, { passive: false });
      window.addEventListener('pointerup', this.handlers.pointerup);
      window.addEventListener('pointercancel', this.handlers.pointercancel);
    }
    if (this.hasTouch) {
      window.addEventListener('pointerdown', this.handlers.pointerdownAction, { passive: false });
    }

    if (this.hasGyro) {
      window.addEventListener('deviceorientation', this.handlers.deviceorientation);
    }

    window.addEventListener('gamepadconnected', this.handlers.gamepadconnected);
    window.addEventListener('gamepaddisconnected', this.handlers.gamepaddisconnected);
  }

  destroy() {
    window.removeEventListener('keydown', this.handlers.keydown);
    window.removeEventListener('keyup', this.handlers.keyup);

    if (this.hasTouch && this.touchRoot) {
      this.touchRoot.removeEventListener('pointerdown', this.handlers.pointerdown);
      window.removeEventListener('pointermove', this.handlers.pointermove);
      window.removeEventListener('pointerup', this.handlers.pointerup);
      window.removeEventListener('pointercancel', this.handlers.pointercancel);
    }
    if (this.hasTouch) {
      window.removeEventListener('pointerdown', this.handlers.pointerdownAction);
    }

    if (this.hasGyro) {
      window.removeEventListener('deviceorientation', this.handlers.deviceorientation);
    }

    window.removeEventListener('gamepadconnected', this.handlers.gamepadconnected);
    window.removeEventListener('gamepaddisconnected', this.handlers.gamepaddisconnected);
  }

  getControlMode() {
    const raw = localStorage.getItem(this.controlModeKey);
    if (raw === 'gyro' || raw === 'touch') {
      return raw;
    }
    return this.hasTouch ? 'touch' : 'gyro';
  }

  isOverlayVisible() {
    const overlay = document.getElementById('overlay');
    if (!overlay) {
      return false;
    }
    return !overlay.classList.contains('hidden');
  }

  isTouchLayerActive() {
    if (!this.touchRoot) {
      return false;
    }
    if (this.isOverlayVisible() && !this.touchPreview) {
      return false;
    }
    return true;
  }

  syncTouchLayer(mode) {
    if (!this.touchRoot) {
      return;
    }

    const overlayVisible = this.isOverlayVisible();
    const shouldEnable = mode === 'touch' && this.hasTouch && !overlayVisible;
    const shouldPreview = mode === 'touch' && this.hasTouch && overlayVisible && this.touchPreview;
    if (!shouldEnable && !shouldPreview) {
      if (this.touch.active) {
        this.endTouch();
      }
      this.touchRoot.classList.remove('active');
      this.touchRoot.classList.remove('preview');
      this.touchRoot.classList.add('hidden');
      this.joystickEl?.classList.add('hidden');
      return;
    }

    this.touchRoot.classList.remove('hidden');
    if (shouldEnable) {
      this.touchRoot.classList.add('active');
      this.touchRoot.classList.remove('preview');
      this.joystickEl?.classList.add('hidden');
    } else {
      this.touchRoot.classList.remove('active');
      this.touchRoot.classList.add('preview');
      this.joystickEl?.classList.remove('hidden');
    }
  }

  showJoystickAt(x, y) {
    if (!this.touchRoot || !this.joystickEl) {
      return;
    }
    this.touchRoot.classList.add('active');
    this.touchRoot.classList.remove('hidden');
    this.joystickEl.classList.remove('hidden');
    this.joystickEl.style.left = `${x}px`;
    this.joystickEl.style.top = `${y}px`;
  }

  updateJoystickHandle(dx, dy) {
    if (!this.joystickHandleEl) {
      return;
    }
    if (this.joystickEl?.classList.contains('hidden') && !this.isOverlayVisible()) {
      this.joystickEl.classList.remove('hidden');
    }
    const scale = this.joystickScale || 1;
    const adjX = dx / scale;
    const adjY = dy / scale;
    this.joystickHandleEl.style.transform = `translate(calc(-50% + ${adjX}px), calc(-50% + ${adjY}px))`;
  }

  hideJoystick() {
    if (this.touchPreview && this.isOverlayVisible()) {
      return;
    }
    this.joystickEl?.classList.add('hidden');
  }

  endTouch() {
    this.touch.active = false;
    this.touch.pointerId = null;
    this.touch.value.x = 0;
    this.touch.value.y = 0;
    this.hideJoystick();
  }

  endTouchAction() {
    this.touchAction.active = false;
    this.touchAction.pointerId = null;
  }

  isDown(code) {
    return this.down.has(code);
  }

  recalibrateGyro() {
    if (!this.hasGyro) {
      return;
    }
    if (this.gyroRaw.hasSample) {
      this.gyro.baseBeta = this.gyroRaw.beta;
      this.gyro.baseGamma = this.gyroRaw.gamma;
      this.gyro.baselineSet = true;
    } else {
      this.gyro.baselineSet = false;
    }
  }

  getGyroSample() {
    return {
      beta: this.gyroRaw.beta,
      gamma: this.gyroRaw.gamma,
      baseBeta: this.gyro.baseBeta,
      baseGamma: this.gyro.baseGamma,
      baselineSet: this.gyro.baselineSet,
      hasSample: this.gyroRaw.hasSample,
    };
  }

  setGyroSensitivity(value) {
    this.gyroSensitivity = clamp(value, 10, 25);
  }

  getGyroSensitivity() {
    return this.gyroSensitivity;
  }

  setJoystickScale(value) {
    this.joystickScale = clamp(value, 0.5, 2);
    this.touchRoot?.style.setProperty('--joystick-scale', String(this.joystickScale));
  }

  setInputFalloff(value) {
    this.inputFalloff = clamp(value, 1, 2);
  }

  setGyroTapMode(mode) {
    this.gyroTapMode = mode === 'action' ? 'action' : 'recalibrate';
  }

  setPadGate(points) {
    if (!Array.isArray(points) || points.length !== 8) {
      return;
    }
    this.padGate = points.map((point) => [point[0], point[1]]);
    savePadGate(this.padGate);
  }

  getPadGate() {
    return this.padGate.map((point) => [point[0], point[1]]);
  }

  setTouchPreview(enabled) {
    this.touchPreview = !!enabled;
    this.syncTouchLayer(this.getControlMode());
    if (!this.touchPreview && this.touch.active) {
      this.endTouch();
    }
  }

  getRawInputPreview() {
    if (this.hasTouch && this.touch.active) {
      return { x: this.touch.value.x, y: this.touch.value.y };
    }
    const padStick = this.getGamepadStick();
    if (padStick && (Math.abs(padStick.x) > 0 || Math.abs(padStick.y) > 0)) {
      return padStick;
    }
    return null;
  }

  applyInputFalloffToStick(stick) {
    return applyInputFalloff(stick, this.inputFalloff);
  }

  wasPressed(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  clearPressed() {
    this.pressed.clear();
  }

  getActiveGamepad() {
    const gamepads = navigator.getGamepads?.() ?? navigator.webkitGetGamepads?.();
    if (!gamepads) {
      return null;
    }

    if (this.gamepadIndex !== null) {
      const candidate = gamepads[this.gamepadIndex];
      if (candidate?.connected) {
        return candidate;
      }
    }

    for (const candidate of gamepads) {
      if (candidate?.connected) {
        this.gamepadIndex = candidate.index;
        return candidate;
      }
    }

    return null;
  }

  isPrimaryActionDown() {
    if (this.isDown('Space') || this.isDown('Enter') || this.isDown('KeyZ')) {
      return true;
    }
    if (this.touchAction.active) {
      return true;
    }
    const pad = this.getActiveGamepad();
    if (!pad?.buttons?.length) {
      return false;
    }
    const button = pad.buttons[0];
    return !!button && (button.pressed || button.value > 0.5);
  }

  getGamepadStick() {
    const gamepads = navigator.getGamepads?.() ?? navigator.webkitGetGamepads?.();
    if (!gamepads) {
      return null;
    }

    let pad = null;
    if (this.gamepadIndex !== null) {
      const candidate = gamepads[this.gamepadIndex];
      if (candidate?.connected && candidate.axes.length >= 2) {
        pad = candidate;
      }
    }

    if (!pad) {
      for (const candidate of gamepads) {
        if (candidate?.connected && candidate.axes.length >= 2) {
          pad = candidate;
          this.gamepadIndex = candidate.index;
          break;
        }
      }
    }

    if (!pad) {
      return null;
    }

    const primary = readPadStick(pad, this.padGate);
    if (primary.magnitudeSq > GAMEPAD_SWITCH_THRESHOLD) {
      return primary.value;
    }

    let best = primary;
    for (const candidate of gamepads) {
      if (!candidate?.connected || candidate.axes.length < 2) {
        continue;
      }
      const result = readPadStick(candidate, this.padGate);
      if (result.magnitudeSq > best.magnitudeSq) {
        best = result;
        this.gamepadIndex = candidate.index;
      }
    }

    return best.magnitudeSq > 0 ? best.value : null;
  }

  getStick() {
    const mode = this.getControlMode();
    this.syncTouchLayer(mode);
    if (mode !== 'gyro') {
      this.gyro.baselineSet = false;
    }
    if (mode === 'gyro' && this.hasGyro && this.gyro.baselineSet) {
      const gx = this.gyro.value.x;
      const gy = this.gyro.value.y;
      if (Math.abs(gx) > 0 || Math.abs(gy) > 0) {
        return { x: gx, y: gy };
      }
    }

    if (mode === 'touch' && this.hasTouch) {
      const tx = this.touch.value.x;
      const ty = this.touch.value.y;
      if (Math.abs(tx) > 0 || Math.abs(ty) > 0) {
        return applyInputFalloff({ x: tx, y: ty }, this.inputFalloff);
      }
    }

    const padStick = this.getGamepadStick();
    if (padStick && (Math.abs(padStick.x) > 0 || Math.abs(padStick.y) > 0)) {
      return applyInputFalloff(padStick, this.inputFalloff);
    }

    const left = this.isDown('ArrowLeft') || this.isDown('KeyA');
    const right = this.isDown('ArrowRight') || this.isDown('KeyD');
    const up = this.isDown('ArrowUp') || this.isDown('KeyW');
    const down = this.isDown('ArrowDown') || this.isDown('KeyS');
    let x = 0;
    let y = 0;
    if (left) x -= 1;
    if (right) x += 1;
    if (up) y -= 1;
    if (down) y += 1;
    if (x > 1) x = 1;
    if (x < -1) x = -1;
    if (y > 1) y = 1;
    if (y < -1) y = -1;
    return { x, y };
  }

  static async requestGyroPermission(): Promise<'granted' | 'denied'> {
    if (typeof window.DeviceOrientationEvent !== 'undefined' && 
        typeof (window.DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const response = await (window.DeviceOrientationEvent as any).requestPermission();
        return response === 'granted' ? 'granted' : 'denied';
      } catch (e) {
        console.error('Gyro permission request failed:', e);
        return 'denied';
      }
    }
    // Non-iOS devices (or older iOS) usually don't need explicit permission or don't support this API
    return 'granted';
  }
}

const DEFAULT_STICK_GATE = [
  [84, 0],
  [59, 59],
  [0, 84],
  [-59, 59],
  [-84, 0],
  [-59, -59],
  [0, -84],
  [59, -59],
];

const PAD_GATE_KEY = 'smb_pad_gate';

function loadPadGate() {
  try {
    const raw = localStorage.getItem(PAD_GATE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== 8) {
      return null;
    }
    const gate = parsed.map((point) => {
      if (!Array.isArray(point) || point.length !== 2) {
        return null;
      }
      const x = Number(point[0]);
      const y = Number(point[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
      }
      return [x, y];
    });
    if (gate.some((point) => point === null)) {
      return null;
    }
    return gate;
  } catch {
    return null;
  }
}

function savePadGate(gate) {
  try {
    localStorage.setItem(PAD_GATE_KEY, JSON.stringify(gate));
  } catch {
    // Ignore storage failures.
  }
}

const STICK_SHAPE_POINTS = [
  [105, 0],
  [105, 105],
  [0, 105],
  [-105, 105],
  [-105, 0],
  [-105, -105],
  [0, -105],
  [105, -105],
];

const STICK_SHAPE_TABLE = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3,
  3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 7, 7,
  7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13,
  14, 14, 15, 15, 16, 17, 17, 18, 19, 19, 20, 21,
  22, 22, 23, 24, 25, 25, 26, 27, 28, 29, 29, 30,
  31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42,
  43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 54, 55,
  56, 57, 58, 60,
];

const STICK_RANGE = 60;
const FLOAT_EPSILON = 1.1920928955078125e-7;

function clamp(value, min, max) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function applyStickGate(x, y, gate) {
  let adjX = x;
  let adjY = y;

  for (let i = 0; i < 8; i += 1) {
    const next = i === 7 ? 0 : i + 1;
    const f9 = gate[i][0];
    const f4 = gate[i][1];
    const f10 = gate[next][0];
    const f5 = gate[next][1];

    let denom = f9 * f5 - f10 * f4;
    if (Math.abs(denom) < FLOAT_EPSILON) {
      continue;
    }
    denom = 1 / denom;

    const f5_ = (f5 * adjX - f10 * adjY) * denom;
    const f3 = (-f4 * adjX + f9 * adjY) * denom;
    if (f5_ < 0 || f3 < 0) {
      continue;
    }

    let mapped = Math.trunc(f5_ * STICK_SHAPE_POINTS[i][0] + f3 * STICK_SHAPE_POINTS[next][0]);
    let sign = mapped < 0 ? -1 : 1;
    let idx = clamp(Math.abs(mapped), 0, 99);
    adjX = sign * STICK_SHAPE_TABLE[idx];

    mapped = Math.trunc(f5_ * STICK_SHAPE_POINTS[i][1] + f3 * STICK_SHAPE_POINTS[next][1]);
    sign = mapped < 0 ? -1 : 1;
    idx = clamp(Math.abs(mapped), 0, 99);
    adjY = sign * STICK_SHAPE_TABLE[idx];
    break;
  }

  return { x: adjX, y: adjY };
}

const GAMEPAD_SWITCH_THRESHOLD = 0.0025;

function readPadStick(pad, gate) {
  const rawX = pad.axes[0] ?? 0;
  const rawY = pad.axes[1] ?? 0;
  const { x, y } = applyStickGate(
    clamp(Math.round(rawX * 127), -128, 127),
    clamp(Math.round(rawY * 127), -128, 127),
    gate,
  );
  const value = {
    x: clamp(x / STICK_RANGE, -1, 1),
    y: clamp(y / STICK_RANGE, -1, 1),
  };
  return { value, magnitudeSq: value.x * value.x + value.y * value.y };
}

function applyInputFalloff(stick, power) {
  const maxAxis = Math.max(Math.abs(stick.x), Math.abs(stick.y));
  if (maxAxis <= 0) {
    return stick;
  }
  const clamped = Math.min(1, maxAxis);
  const eased = Math.pow(clamped, power);
  const scale = eased / maxAxis;
  return { x: stick.x * scale, y: stick.y * scale };
}

function adjustGyroForOrientation(beta, gamma) {
  const angle = getScreenOrientationAngle();
  switch (angle) {
    case 90:
      return { beta: -gamma, gamma: beta };
    case 180:
      return { beta: -beta, gamma: -gamma };
    case 270:
      return { beta: gamma, gamma: -beta };
    default:
      return { beta, gamma };
  }
}

function getScreenOrientationAngle() {
  const orientation = window.screen?.orientation?.angle;
  if (typeof orientation === 'number') {
    return ((orientation % 360) + 360) % 360;
  }
  const legacy = typeof window.orientation === 'number' ? window.orientation : 0;
  return ((legacy % 360) + 360) % 360;
}
