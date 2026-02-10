import type { Game } from '../../game.js';

function clamp(value: number, min: number, max: number) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

const DEFAULT_PAD_GATE = [
  [84, 0],
  [59, 59],
  [0, 84],
  [-59, 59],
  [-84, 0],
  [-59, -59],
  [0, -84],
  [59, -59],
];

type InputControlsElements = {
  controlModeField: HTMLElement | null;
  controlModeSelect: HTMLSelectElement | null;
  controlModeSettings: HTMLElement | null;
  gyroSettings: HTMLElement | null;
  touchSettings: HTMLElement | null;
  inputFalloffBlock: HTMLElement | null;
  inputFalloffCurveWrap: HTMLElement | null;
  inputFalloffPath: SVGPathElement | null;
  inputPreview: HTMLElement | null;
  inputRawDot: HTMLElement | null;
  inputProcessedDot: HTMLElement | null;
  gamepadCalibrationBlock: HTMLElement | null;
  gamepadCalibrationOverlay: HTMLElement | null;
  gamepadCalibrationMap: HTMLCanvasElement | null;
  gamepadCalibrationCtx: CanvasRenderingContext2D | null;
  gyroHelper: HTMLElement | null;
  gyroHelperFrame: HTMLElement | null;
  gyroHelperDevice: HTMLElement | null;
  overlay: HTMLElement;
};

type InputControlsDeps = {
  game: Game;
  elements: InputControlsElements;
  isOverlayPanelNearBottom: () => boolean;
};

export function bindVolumeControl(
  input: HTMLInputElement | null,
  output: HTMLOutputElement | null,
  apply: (value: number) => void,
) {
  if (!input) {
    return;
  }
  const update = () => {
    const value = Number(input.value) / 100;
    apply(value);
    if (output) {
      output.value = `${Math.round(value * 100)}%`;
      output.textContent = output.value;
    }
  };
  input.addEventListener('input', update);
  update();
}

function readStoredNumber(key: string, fallback: number) {
  const raw = localStorage.getItem(key);
  const value = raw === null ? NaN : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function bindRangeControl(
  input: HTMLInputElement | null,
  output: HTMLOutputElement | null,
  key: string,
  fallback: number,
  format: (value: number) => string,
  apply: (value: number) => void,
) {
  if (!input) {
    return;
  }
  const initial = readStoredNumber(key, fallback);
  input.value = String(initial);
  const update = () => {
    const value = Number(input.value);
    apply(value);
    if (output) {
      output.value = format(value);
      output.textContent = output.value;
    }
    localStorage.setItem(key, String(value));
  };
  input.addEventListener('input', update);
  update();
}

export class InputControlsController {
  private readonly game: Game;
  private readonly elements: InputControlsElements;
  private readonly isOverlayPanelNearBottom: () => boolean;
  private lastControlModeSettingsCheck = performance.now();
  private calibrationActive = false;
  private calibrationSamples: Array<{ x: number; y: number }> = [];
  private calibrationSectorMax: number[] = new Array(8).fill(0);
  private calibrationGate: number[][] = [];
  private calibrationFallbackGate: number[][] = [];

  constructor({ game, elements, isOverlayPanelNearBottom }: InputControlsDeps) {
    this.game = game;
    this.elements = elements;
    this.isOverlayPanelNearBottom = isOverlayPanelNearBottom;
  }

  updateFalloffCurve(power: number) {
    const pathEl = this.elements.inputFalloffPath;
    if (!pathEl) {
      return;
    }
    const steps = 24;
    let path = 'M 0 100';
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const x = t * 100;
      const y = 100 - Math.pow(t, power) * 100;
      path += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    pathEl.setAttribute('d', path);
  }

  updateInputPreview() {
    const { inputPreview, inputRawDot, inputProcessedDot } = this.elements;
    if (!inputPreview || !inputRawDot || !inputProcessedDot) {
      return;
    }
    const raw = this.game.input?.getRawInputPreview?.();
    if (!raw) {
      inputRawDot.style.opacity = '0';
      inputProcessedDot.style.opacity = '0';
      return;
    }
    const processed = this.game.input?.applyInputFalloffToStick?.(raw) ?? raw;
    inputRawDot.style.opacity = '1';
    inputProcessedDot.style.opacity = '1';
    const placeDot = (dot: HTMLElement, value: { x: number; y: number }) => {
      const clampedX = clamp(value.x, -1, 1);
      const clampedY = clamp(value.y, -1, 1);
      const x = ((clampedX + 1) / 2) * 100;
      const y = ((clampedY + 1) / 2) * 100;
      dot.style.left = `${x}%`;
      dot.style.top = `${y}%`;
    };
    placeDot(inputRawDot, raw);
    placeDot(inputProcessedDot, processed);
  }

  private getConnectedGamepad() {
    const active = this.game.input?.getActiveGamepad?.();
    if (active?.connected) {
      return active;
    }
    const pads = navigator.getGamepads?.() ?? navigator.webkitGetGamepads?.();
    if (!pads) {
      return null;
    }
    for (const pad of pads) {
      if (pad?.connected) {
        return pad;
      }
    }
    return null;
  }

  private rebuildCalibrationGate() {
    const sectorAngle = (Math.PI * 2) / 8;
    this.calibrationGate = this.calibrationSectorMax.map((length, i) => {
      const fallback = this.calibrationFallbackGate[i] ?? DEFAULT_PAD_GATE[i];
      const fallbackLength = Math.hypot(fallback[0], fallback[1]);
      const use = clamp(length > 10 ? length : fallbackLength, 0, 127);
      const angle = i * sectorAngle;
      return [Math.cos(angle) * use, Math.sin(angle) * use];
    });
  }

  private drawCalibrationMap() {
    const { gamepadCalibrationCtx, gamepadCalibrationMap } = this.elements;
    if (!gamepadCalibrationCtx || !gamepadCalibrationMap) {
      return;
    }
    const { width, height } = gamepadCalibrationMap;
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = (Math.min(width, height) / 2 - 14) / 128;
    gamepadCalibrationCtx.clearRect(0, 0, width, height);

    gamepadCalibrationCtx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    gamepadCalibrationCtx.lineWidth = 1;
    gamepadCalibrationCtx.beginPath();
    gamepadCalibrationCtx.moveTo(centerX, 12);
    gamepadCalibrationCtx.lineTo(centerX, height - 12);
    gamepadCalibrationCtx.moveTo(12, centerY);
    gamepadCalibrationCtx.lineTo(width - 12, centerY);
    gamepadCalibrationCtx.stroke();

    gamepadCalibrationCtx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    for (const sample of this.calibrationSamples) {
      const x = centerX + sample.x * scale;
      const y = centerY + sample.y * scale;
      gamepadCalibrationCtx.fillRect(x - 1, y - 1, 2, 2);
    }

    if (this.calibrationGate.length === 8) {
      gamepadCalibrationCtx.strokeStyle = 'rgba(255, 159, 28, 0.9)';
      gamepadCalibrationCtx.lineWidth = 2;
      gamepadCalibrationCtx.beginPath();
      this.calibrationGate.forEach((point, index) => {
        const x = centerX + point[0] * scale;
        const y = centerY + point[1] * scale;
        if (index === 0) {
          gamepadCalibrationCtx.moveTo(x, y);
        } else {
          gamepadCalibrationCtx.lineTo(x, y);
        }
      });
      gamepadCalibrationCtx.closePath();
      gamepadCalibrationCtx.stroke();
    }
  }

  startGamepadCalibration() {
    const overlay = this.elements.gamepadCalibrationOverlay;
    if (!overlay) {
      return;
    }
    this.calibrationActive = true;
    this.calibrationSamples = [];
    this.calibrationSectorMax = new Array(8).fill(0);
    this.calibrationFallbackGate = this.game.input?.getPadGate?.() ?? DEFAULT_PAD_GATE.map((point) => [point[0], point[1]]);
    this.calibrationGate = this.calibrationFallbackGate.map((point) => [point[0], point[1]]);
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    this.drawCalibrationMap();
  }

  stopGamepadCalibration() {
    if (!this.calibrationActive) {
      return;
    }
    this.calibrationActive = false;
    if (this.calibrationGate.length === 8) {
      this.game.input?.setPadGate?.(this.calibrationGate);
    }
    this.elements.gamepadCalibrationOverlay?.classList.add('hidden');
    this.elements.gamepadCalibrationOverlay?.setAttribute('aria-hidden', 'true');
  }

  updateGamepadCalibration() {
    if (!this.calibrationActive) {
      return;
    }
    const pad = this.getConnectedGamepad();
    if (!pad) {
      this.drawCalibrationMap();
      return;
    }
    if (pad.buttons?.some((button) => button.pressed)) {
      this.stopGamepadCalibration();
      return;
    }
    const rawX = clamp((pad.axes[0] ?? 0) * 127, -128, 127);
    const rawY = clamp((pad.axes[1] ?? 0) * 127, -128, 127);
    const magnitude = Math.hypot(rawX, rawY);
    if (magnitude > 6) {
      this.calibrationSamples.push({ x: rawX, y: rawY });
      if (this.calibrationSamples.length > 600) {
        this.calibrationSamples.shift();
      }
      const sectorAngle = (Math.PI * 2) / 8;
      let angle = Math.atan2(rawY, rawX);
      if (angle < 0) {
        angle += Math.PI * 2;
      }
      const sector = Math.floor((angle + sectorAngle / 2) / sectorAngle) % 8;
      const axisAngle = sector * sectorAngle;
      const axisX = Math.cos(axisAngle);
      const axisY = Math.sin(axisAngle);
      const projection = rawX * axisX + rawY * axisY;
      const length = Math.abs(projection);
      if (length > this.calibrationSectorMax[sector]) {
        this.calibrationSectorMax[sector] = length;
        this.rebuildCalibrationGate();
      }
    }
    this.drawCalibrationMap();
  }

  updateControlModeSettingsVisibility() {
    const {
      controlModeSelect,
      controlModeSettings,
      gyroSettings,
      touchSettings,
      inputFalloffBlock,
      inputFalloffCurveWrap,
      inputPreview,
      gamepadCalibrationBlock,
    } = this.elements;
    if (!controlModeSelect || !controlModeSettings) {
      return;
    }
    const hasOptions = controlModeSelect.options.length > 0;
    const pads = navigator.getGamepads?.() ?? navigator.webkitGetGamepads?.();
    const hasConnectedPad = !!pads && Array.from(pads).some((pad) => pad?.connected);
    const hasController = hasConnectedPad || !!this.game.input?.getActiveGamepad?.();
    const showSettings = hasOptions || hasController;
    controlModeSettings.classList.toggle('hidden', !showSettings);
    if (!hasOptions) {
      gyroSettings?.classList.add('hidden');
      touchSettings?.classList.add('hidden');
      inputFalloffBlock?.classList.toggle('hidden', !hasController);
      inputFalloffCurveWrap?.classList.toggle('hidden', !hasController);
      inputPreview?.classList.toggle('hidden', !hasController);
      gamepadCalibrationBlock?.classList.toggle('hidden', !hasController);
      return;
    }
    const mode = controlModeSelect.value;
    gyroSettings?.classList.toggle('hidden', mode !== 'gyro');
    touchSettings?.classList.toggle('hidden', mode !== 'touch');
    const showFalloff = mode === 'touch' || hasController;
    inputFalloffBlock?.classList.toggle('hidden', !showFalloff);
    const hideCurve = mode === 'gyro';
    inputFalloffCurveWrap?.classList.toggle('hidden', hideCurve);
    inputPreview?.classList.toggle('hidden', hideCurve);
    gamepadCalibrationBlock?.classList.toggle('hidden', !hasController);
  }

  maybeUpdateControlModeSettings(now: number) {
    if (now - this.lastControlModeSettingsCheck < 1000) {
      return;
    }
    this.lastControlModeSettingsCheck = now;
    this.updateControlModeSettingsVisibility();
  }

  syncTouchPreviewVisibility() {
    const overlayVisible = !this.elements.overlay.classList.contains('hidden');
    const mode = this.elements.controlModeSelect?.value;
    const shouldPreview = overlayVisible && mode === 'touch' && !this.isOverlayPanelNearBottom();
    this.game.input?.setTouchPreview?.(shouldPreview);
  }

  updateGyroHelper() {
    const { controlModeSelect, gyroHelper, gyroHelperFrame, gyroHelperDevice, controlModeField } = this.elements;
    if (!controlModeSelect || !gyroHelper || !gyroHelperFrame) {
      return;
    }
    const hasGyroOption = Array.from(controlModeSelect.options).some((opt) => opt.value === 'gyro');
    const showGyro = hasGyroOption && controlModeSelect.value === 'gyro';
    gyroHelper.classList.toggle('hidden', !showGyro);
    if (controlModeField) {
      controlModeField.classList.toggle('hidden', controlModeSelect.options.length === 0);
    }
    this.updateControlModeSettingsVisibility();
    if (!showGyro) {
      gyroHelperDevice?.classList.remove('at-limit');
      return;
    }
    const sample = this.game.input?.getGyroSample?.();
    if (!sample || !sample.hasSample) {
      gyroHelperFrame.style.opacity = '0.5';
      gyroHelperDevice?.classList.remove('at-limit');
      return;
    }
    const deltaBeta = sample.baselineSet ? sample.beta - sample.baseBeta : sample.beta;
    const deltaGamma = sample.baselineSet ? sample.gamma - sample.baseGamma : sample.gamma;
    const maxAngle = this.game.input?.getGyroSensitivity?.() ?? 25;
    const x = clamp(-deltaBeta, -maxAngle, maxAngle);
    const y = clamp(deltaGamma, -maxAngle, maxAngle);
    gyroHelperFrame.style.opacity = '1';
    gyroHelperFrame.style.setProperty('--gyro-x', `${x}deg`);
    gyroHelperFrame.style.setProperty('--gyro-y', `${y}deg`);
    const atLimit = Math.abs(deltaBeta) >= maxAngle || Math.abs(deltaGamma) >= maxAngle;
    gyroHelperDevice?.classList.toggle('at-limit', atLimit);
  }
}
