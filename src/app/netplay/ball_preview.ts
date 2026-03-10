import { mat4 } from 'gl-matrix';
import type { createSwapChainForWebGL2 } from '../../noclip/gfx/platform/GfxPlatformWebGL2.js';
import type { GfxDevice } from '../../noclip/gfx/platform/GfxPlatform.js';
import { StageId } from '../../noclip/SuperMonkeyBall/StageInfo.js';
import type { StageData } from '../../noclip/SuperMonkeyBall/World.js';
import {
  Renderer,
  type BallRenderState,
  type GameplaySyncState,
  type SceneRenderOverrides,
} from '../../noclip/Render.js';
import type { ModRenderPrimitive } from '../../mods/render_primitives.js';
import {
  BALL_HEMI1_DEFAULT_COLOR,
  BALL_HEMI2_DEFAULT_COLOR,
  resolveBallAppearance,
  type BallAppearanceProfile,
} from '../../shared/ball_appearance.js';
import { initRendererGfx, type ViewerInputState } from '../render/boot.js';

type BallPreviewOptions = {
  canvas: HTMLCanvasElement | null;
  loadPreviewStageData: (stageId: number) => Promise<StageData>;
  getBallAppearance: () => BallAppearanceProfile | undefined;
};

const PREVIEW_TARGET_FPS = 30;
const PREVIEW_FRAME_INTERVAL_MS = 1000 / PREVIEW_TARGET_FPS;
const PREVIEW_FOV_Y = Math.PI / 7;
const PREVIEW_NEAR_PLANE = 0.1;
const PREVIEW_FAR_PLANE = 200.0;
const PREVIEW_BALL_SPIN_RADIANS_PER_SECOND = 0.75;
const PREVIEW_BALL_RADIUS = 0.5;
const PREVIEW_BALL_Y = 0.55;
const PREVIEW_EYE = [0, 1.6, 3.0] as const;
const PREVIEW_TARGET = [0, 0.55, 0] as const;
const PREVIEW_UP = [0, 1, 0] as const;
const PREVIEW_SCENE_OVERRIDES: SceneRenderOverrides = {
  skipStageGeometry: true,
  skipBackground: true,
  clearColor: { r: 0.06, g: 0.065, b: 0.075, a: 1.0 },
};
const PREVIEW_FLOOR_SIZE = 8.0;
const PREVIEW_FLOOR_Y = 0.0;
const scratchViewFromWorld = mat4.create();

function resizeCanvasToClientSize(canvasElem: HTMLCanvasElement): boolean {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvasElem.clientWidth || canvasElem.width;
  const cssHeight = canvasElem.clientHeight || canvasElem.height;
  const width = Math.max(1, Math.floor(cssWidth * dpr));
  const height = Math.max(1, Math.floor(cssHeight * dpr));
  if (canvasElem.width === width && canvasElem.height === height) {
    return false;
  }
  canvasElem.width = width;
  canvasElem.height = height;
  return true;
}

function createGridTextureDataUrl(): string | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }
  const canvas = document.createElement('canvas');
  const size = 512;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return undefined;
  }
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#16181b';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#242a30';
  ctx.lineWidth = 1;
  for (let i = 0; i <= size; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i + 0.5, 0);
    ctx.lineTo(i + 0.5, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i + 0.5);
    ctx.lineTo(size, i + 0.5);
    ctx.stroke();
  }
  ctx.strokeStyle = '#323c46';
  ctx.lineWidth = 2;
  for (let i = 0; i <= size; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i + 0.5, 0);
    ctx.lineTo(i + 0.5, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i + 0.5);
    ctx.lineTo(size, i + 0.5);
    ctx.stroke();
  }
  return canvas.toDataURL('image/png');
}

function createFloorPrimitive(textureName?: string): ModRenderPrimitive {
  return {
    kind: 'quad',
    corners: [
      { x: -PREVIEW_FLOOR_SIZE, y: PREVIEW_FLOOR_Y, z: -PREVIEW_FLOOR_SIZE },
      { x: PREVIEW_FLOOR_SIZE, y: PREVIEW_FLOOR_Y, z: -PREVIEW_FLOOR_SIZE },
      { x: PREVIEW_FLOOR_SIZE, y: PREVIEW_FLOOR_Y, z: PREVIEW_FLOOR_SIZE },
      { x: -PREVIEW_FLOOR_SIZE, y: PREVIEW_FLOOR_Y, z: PREVIEW_FLOOR_SIZE },
    ],
    alpha: 1.0,
    alphaClip: true,
    colorR: 0.85,
    colorG: 0.85,
    colorB: 0.85,
    textureName,
    depthTest: true,
    additiveBlend: false,
    uMin: 0,
    uMax: 1,
    vMin: 0,
    vMax: 1,
  };
}

export class BallPreviewController {
  private readonly options: BallPreviewOptions;
  private readonly previewBall: BallRenderState;
  private readonly previewBalls: BallRenderState[];
  private readonly previewFloor: ModRenderPrimitive[];
  private readonly syncState: GameplaySyncState;
  private visible = false;
  private destroyed = false;
  private initFailed = false;
  private initPromise: Promise<void> | null = null;
  private frameRequestId: number | null = null;
  private lastFrameMs = 0;
  private spinRadians = 0;
  private renderer: Renderer | null = null;
  private gfxDevice: GfxDevice | null = null;
  private swapChain: ReturnType<typeof createSwapChainForWebGL2> | null = null;
  private viewerInput: ViewerInputState | null = null;
  private cachedStageData: StageData | null = null;

  constructor(options: BallPreviewOptions) {
    this.options = options;
    this.previewBall = {
      playerId: 0,
      pos: { x: 0, y: PREVIEW_BALL_Y, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      radius: PREVIEW_BALL_RADIUS,
      visible: true,
      appearance: {
        hemi1Color: BALL_HEMI1_DEFAULT_COLOR,
        hemi2Color: BALL_HEMI2_DEFAULT_COLOR,
      },
    };
    this.previewBalls = [this.previewBall];
    this.previewFloor = [createFloorPrimitive(createGridTextureDataUrl())];
    this.syncState = {
      bananas: null,
      jamabars: null,
      bananaCollectedByAnimGroup: null,
      animGroupTransforms: null,
      ball: null,
      balls: this.previewBalls,
      goalBags: null,
      goalTapes: null,
      confetti: null,
      effects: null,
      modPrimitives: this.previewFloor,
      switches: null,
      stageTilt: null,
      wormholeScreenOverlayTimer: 0,
      wormholeScreenOverlayIntensity: 0,
    };
  }

  setVisible(visible: boolean): void {
    if (this.destroyed || !this.options.canvas) {
      return;
    }
    if (this.visible === visible) {
      return;
    }
    this.visible = visible;
    if (visible) {
      this.lastFrameMs = 0;
      this.startLoop();
      return;
    }
    this.stopLoop();
    this.destroyRendererOnly();
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.stopLoop();
    this.destroyRendererOnly();
    this.gfxDevice = null;
    this.swapChain = null;
    this.viewerInput = null;
    this.cachedStageData = null;
    this.initPromise = null;
  }

  private destroyRendererOnly(): void {
    if (this.renderer && this.gfxDevice) {
      this.renderer.destroy(this.gfxDevice);
    }
    this.renderer = null;
  }

  private startLoop(): void {
    if (this.frameRequestId !== null) {
      return;
    }
    this.frameRequestId = window.requestAnimationFrame(this.onFrame);
  }

  private stopLoop(): void {
    if (this.frameRequestId === null) {
      return;
    }
    window.cancelAnimationFrame(this.frameRequestId);
    this.frameRequestId = null;
  }

  private onFrame = (nowMs: number): void => {
    this.frameRequestId = null;
    if (!this.visible || this.destroyed) {
      return;
    }
    this.frameRequestId = window.requestAnimationFrame(this.onFrame);
    if (this.lastFrameMs !== 0 && (nowMs - this.lastFrameMs) < PREVIEW_FRAME_INTERVAL_MS) {
      return;
    }
    const deltaMs = this.lastFrameMs === 0
      ? PREVIEW_FRAME_INTERVAL_MS
      : Math.max(0, nowMs - this.lastFrameMs);
    this.lastFrameMs = nowMs;
    if (!this.renderer || !this.gfxDevice || !this.swapChain || !this.viewerInput) {
      void this.ensureInitialized();
      return;
    }
    this.renderFrame(deltaMs);
  };

  private async ensureInitialized(): Promise<void> {
    if (this.destroyed || this.initFailed || this.renderer || this.initPromise || !this.options.canvas) {
      return;
    }
    this.initPromise = (async () => {
      try {
        if (!this.gfxDevice || !this.swapChain || !this.viewerInput) {
          const { swapChain, gfxDevice, viewerInput } = initRendererGfx(this.options.canvas!);
          this.swapChain = swapChain;
          this.gfxDevice = gfxDevice;
          this.viewerInput = viewerInput;
        }
        if (!this.cachedStageData) {
          this.cachedStageData = await this.options.loadPreviewStageData(StageId.St001_Plain);
        }
        if (this.destroyed || !this.visible || !this.gfxDevice || !this.cachedStageData) {
          return;
        }
        this.renderer = new Renderer(this.gfxDevice, this.cachedStageData);
        this.renderer.setSceneOverrides(PREVIEW_SCENE_OVERRIDES);
      } catch (error) {
        this.initFailed = true;
        console.warn('[ball-preview] Failed to initialize preview renderer', error);
      }
    })();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private renderFrame(deltaMs: number): void {
    const canvas = this.options.canvas;
    const renderer = this.renderer;
    const gfxDevice = this.gfxDevice;
    const swapChain = this.swapChain;
    const viewerInput = this.viewerInput;
    if (!canvas || !renderer || !gfxDevice || !swapChain || !viewerInput) {
      return;
    }
    resizeCanvasToClientSize(canvas);
    if (canvas.width < 2 || canvas.height < 2) {
      return;
    }
    const appearance = resolveBallAppearance(this.options.getBallAppearance());
    const ballAppearance = this.previewBall.appearance ?? (this.previewBall.appearance = {});
    ballAppearance.hemi1Color = appearance.hemi1Color;
    ballAppearance.hemi2Color = appearance.hemi2Color;
    ballAppearance.hemi1Texture = appearance.hemi1Texture;
    ballAppearance.hemi2Texture = appearance.hemi2Texture;
    ballAppearance.playerBillboardTexture = appearance.playerBillboardTexture;
    this.spinRadians += (deltaMs / 1000) * PREVIEW_BALL_SPIN_RADIANS_PER_SECOND;
    if (this.spinRadians > (Math.PI * 2)) {
      this.spinRadians -= Math.PI * 2;
    }
    const halfAngle = this.spinRadians * 0.5;
    this.previewBall.orientation.x = 0;
    this.previewBall.orientation.y = Math.sin(halfAngle);
    this.previewBall.orientation.z = 0;
    this.previewBall.orientation.w = Math.cos(halfAngle);
    renderer.syncGameplayState(this.syncState);

    const camera = viewerInput.camera;
    camera.clipSpaceNearZ = gfxDevice.queryVendorInfo().clipSpaceNearZ;
    camera.setPerspective(PREVIEW_FOV_Y, canvas.width / canvas.height, PREVIEW_NEAR_PLANE, PREVIEW_FAR_PLANE);
    mat4.lookAt(
      scratchViewFromWorld,
      PREVIEW_EYE,
      PREVIEW_TARGET,
      PREVIEW_UP,
    );
    mat4.invert(camera.worldMatrix, scratchViewFromWorld);
    camera.worldMatrixUpdated();

    viewerInput.deltaTime = deltaMs;
    viewerInput.time += deltaMs;
    viewerInput.backbufferWidth = canvas.width;
    viewerInput.backbufferHeight = canvas.height;

    swapChain.configureSwapChain(canvas.width, canvas.height);
    gfxDevice.beginFrame();
    viewerInput.onscreenTexture = swapChain.getOnscreenTexture();
    renderer.render(gfxDevice, viewerInput);
    gfxDevice.endFrame();
  }
}
