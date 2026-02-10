import { Camera } from '../../noclip/Camera.js';
import { GfxDevice } from '../../noclip/gfx/platform/GfxPlatform.js';
import {
  GfxPlatformWebGL2Config,
  createSwapChainForWebGL2,
} from '../../noclip/gfx/platform/GfxPlatformWebGL2.js';
import { AntialiasingMode } from '../../noclip/gfx/helpers/RenderGraphHelpers.js';
import { Renderer } from '../../noclip/Render.js';

export type ViewerInputState = {
  camera: Camera;
  time: number;
  deltaTime: number;
  backbufferWidth: number;
  backbufferHeight: number;
  onscreenTexture: unknown;
  antialiasingMode: AntialiasingMode;
  mouseLocation: { mouseX: number; mouseY: number };
  debugConsole: { addInfoLine: (line: string) => void };
};

export function initRendererGfx(canvas: HTMLCanvasElement): {
  swapChain: ReturnType<typeof createSwapChainForWebGL2>;
  gfxDevice: GfxDevice;
  camera: Camera;
  viewerInput: ViewerInputState;
} {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    preserveDrawingBuffer: false,
    depth: false,
    stencil: false,
  });
  if (!gl) {
    throw new Error('WebGL2 is required.');
  }

  const config = new GfxPlatformWebGL2Config();
  config.trackResources = false;
  config.shaderDebug = false;

  const swapChain = createSwapChainForWebGL2(gl, config);
  const gfxDevice = swapChain.getDevice();
  const camera = new Camera();
  camera.clipSpaceNearZ = gfxDevice.queryVendorInfo().clipSpaceNearZ;
  const viewerInput: ViewerInputState = {
    camera,
    time: 0,
    deltaTime: 0,
    backbufferWidth: canvas.width,
    backbufferHeight: canvas.height,
    onscreenTexture: null,
    antialiasingMode: AntialiasingMode.None,
    mouseLocation: { mouseX: 0, mouseY: 0 },
    debugConsole: { addInfoLine: () => {} },
  };

  canvas.addEventListener('mousemove', (event) => {
    viewerInput.mouseLocation.mouseX = event.clientX * window.devicePixelRatio;
    viewerInput.mouseLocation.mouseY = event.clientY * window.devicePixelRatio;
  });

  return { swapChain, gfxDevice, camera, viewerInput };
}

export function prewarmConfettiRenderer(
  canvas: HTMLCanvasElement,
  renderer: Renderer | null,
  gfxDevice: GfxDevice | null,
  swapChain: ReturnType<typeof createSwapChainForWebGL2> | null,
  viewerInput: ViewerInputState | null,
  resizeCanvasToDisplaySize: (canvasElem: HTMLCanvasElement) => void,
) {
  if (!renderer || !gfxDevice || !swapChain || !viewerInput) {
    return;
  }
  resizeCanvasToDisplaySize(canvas);
  viewerInput.backbufferWidth = canvas.width;
  viewerInput.backbufferHeight = canvas.height;
  swapChain.configureSwapChain(canvas.width, canvas.height);
  gfxDevice.beginFrame();
  viewerInput.onscreenTexture = swapChain.getOnscreenTexture();
  renderer.prewarmConfetti(gfxDevice, viewerInput);
  gfxDevice.endFrame();
}
