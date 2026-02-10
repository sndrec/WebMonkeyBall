import type { Camera } from '../../noclip/Camera.js';
import type { GameplaySyncState, Renderer } from '../../noclip/Render.js';
import type { Game } from '../../game.js';
import type { HudRenderer } from '../../hud.js';
import type { GfxDevice } from '../../noclip/gfx/platform/GfxPlatform.js';
import type { ViewerInputState } from './boot.js';
import type { createSwapChainForWebGL2 } from '../../noclip/gfx/platform/GfxPlatformWebGL2.js';

const RENDER_FRAME_MS = 1000 / 60;

export function resizeCanvasToDisplaySize(canvasElem: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const viewport = window.visualViewport;
  const cssWidth = viewport?.width || canvasElem.clientWidth || window.innerWidth;
  const cssHeight = viewport?.height || canvasElem.clientHeight || window.innerHeight;
  const width = Math.floor(cssWidth * dpr);
  const height = Math.floor(cssHeight * dpr);
  if (canvasElem.width !== width || canvasElem.height !== height) {
    canvasElem.width = width;
    canvasElem.height = height;
  }
}

type FrameLoopDeps = {
  canvas: HTMLCanvasElement;
  hudCanvas: HTMLCanvasElement;
  hudRenderer: HudRenderer;
  game: Game;
  syncState: GameplaySyncState;
  getRunning: () => boolean;
  getLastTime: () => number;
  setLastTime: (value: number) => void;
  getLastRenderTime: () => number;
  setLastRenderTime: (value: number) => void;
  getLastHudTime: () => number;
  setLastHudTime: (value: number) => void;
  getInterpolationEnabled: () => boolean;
  getViewerInput: () => ViewerInputState | null;
  getCamera: () => Camera | null;
  getRenderer: () => Renderer | null;
  getGfxDevice: () => GfxDevice | null;
  getSwapChain: () => ReturnType<typeof createSwapChainForWebGL2> | null;
  isRenderReady: () => boolean;
  isNetplayEnabled: () => boolean;
  netplayTick: (dtSeconds: number) => void;
  updateNetplayDebugOverlay: (now: number) => void;
  sendLobbyHeartbeat: (now: number) => void;
  applyGameCamera: (interpolationAlpha: number) => void;
  updateNameplates: (interpolationAlpha: number) => void;
  onBeforeTick: (now: number) => void;
};

export function startRenderLoop(deps: FrameLoopDeps) {
  const renderFrame = (now: number) => {
    requestAnimationFrame(renderFrame);

    deps.onBeforeTick(now);

    const viewerInput = deps.getViewerInput();
    const camera = deps.getCamera();
    if (!deps.getRunning() || !viewerInput || !camera) {
      deps.setLastTime(now);
      return;
    }

    const dt = Math.max(0, now - deps.getLastTime());
    deps.setLastTime(now);
    const dtSeconds = dt / 1000;
    deps.sendLobbyHeartbeat(now);

    if (!deps.game.paused) {
      viewerInput.deltaTime = dt;
      viewerInput.time += dt;
    } else {
      viewerInput.deltaTime = 0;
    }

    if (deps.isNetplayEnabled()) {
      deps.netplayTick(dtSeconds);
    } else {
      deps.game.update(dtSeconds);
    }
    deps.updateNetplayDebugOverlay(now);

    const shouldRender = deps.getInterpolationEnabled() || (now - deps.getLastRenderTime()) >= RENDER_FRAME_MS;
    if (!shouldRender) {
      return;
    }

    const renderer = deps.getRenderer();
    const gfxDevice = deps.getGfxDevice();
    const swapChain = deps.getSwapChain();
    if (!renderer || !gfxDevice || !swapChain || !deps.isRenderReady()) {
      deps.setLastTime(now);
      return;
    }

    deps.setLastRenderTime(now);

    resizeCanvasToDisplaySize(deps.canvas);
    resizeCanvasToDisplaySize(deps.hudCanvas);
    deps.hudRenderer.resize(deps.hudCanvas.width, deps.hudCanvas.height);

    if (deps.game.loadingStage) {
      const hudDelta = now - deps.getLastHudTime();
      deps.setLastHudTime(now);
      const hudDtFrames = deps.game.paused ? 0 : (hudDelta / 1000) * 60;
      deps.hudRenderer.update(deps.game, hudDtFrames);
      deps.hudRenderer.render(deps.game, dtSeconds);
      return;
    }

    const aspect = deps.canvas.width / deps.canvas.height;
    camera.clipSpaceNearZ = gfxDevice.queryVendorInfo().clipSpaceNearZ;
    camera.aspect = aspect;
    camera.setClipPlanes(5);

    viewerInput.backbufferWidth = deps.canvas.width;
    viewerInput.backbufferHeight = deps.canvas.height;

    swapChain.configureSwapChain(deps.canvas.width, deps.canvas.height);
    gfxDevice.beginFrame();
    viewerInput.onscreenTexture = swapChain.getOnscreenTexture();

    const interpolationAlpha = deps.getInterpolationEnabled() ? deps.game.getInterpolationAlpha() : 1;
    const baseTimeFrames = deps.game.getAnimTimeFrames(interpolationAlpha);
    deps.syncState.timeFrames = baseTimeFrames === null ? null : baseTimeFrames;
    deps.syncState.bananas = deps.game.getBananaRenderState(interpolationAlpha);
    deps.syncState.jamabars = deps.game.getJamabarRenderState(interpolationAlpha);
    deps.syncState.bananaCollectedByAnimGroup = null;
    deps.syncState.animGroupTransforms = deps.game.getAnimGroupTransforms(interpolationAlpha);
    deps.syncState.ball = deps.game.getBallRenderState(interpolationAlpha);
    deps.syncState.balls = deps.game.getBallRenderStates(interpolationAlpha);
    deps.syncState.goalBags = deps.game.getGoalBagRenderState(interpolationAlpha);
    deps.syncState.goalTapes = deps.game.getGoalTapeRenderState(interpolationAlpha);
    deps.syncState.confetti = deps.game.getConfettiRenderState(interpolationAlpha);
    deps.syncState.effects = deps.game.getEffectRenderState(interpolationAlpha);
    deps.syncState.switches = deps.game.getSwitchRenderState(interpolationAlpha);
    deps.syncState.stageTilt = deps.game.getStageTiltRenderState(interpolationAlpha);
    renderer.syncGameplayState(deps.syncState);

    deps.applyGameCamera(interpolationAlpha);
    deps.updateNameplates(interpolationAlpha);
    const hudDelta = now - deps.getLastHudTime();
    deps.setLastHudTime(now);
    const hudDtFrames = deps.game.paused ? 0 : (hudDelta / 1000) * 60;
    deps.hudRenderer.update(deps.game, hudDtFrames);
    renderer.render(gfxDevice, viewerInput);

    gfxDevice.endFrame();

    deps.hudRenderer.render(deps.game, dtSeconds);
  };

  requestAnimationFrame(renderFrame);
}
