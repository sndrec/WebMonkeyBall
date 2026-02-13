import type { mat4, vec3 } from 'gl-matrix';
import type { GfxDevice } from '../gfx/platform/GfxPlatform.js';
import type { GfxRenderInstList, GfxRenderInstManager } from '../gfx/render/GfxRenderInstManager.js';

export type RenderContext = {
  device: GfxDevice;
  renderInstManager: GfxRenderInstManager;
  viewerInput: {
    camera: any;
    time: number;
    deltaTime: number;
    backbufferWidth: number;
    backbufferHeight: number;
    onscreenTexture: any;
    antialiasingMode: number;
    mouseLocation: { mouseX: number; mouseY: number };
    debugConsole: { addInfoLine: (line: string) => void };
  };
  opaqueInstList: GfxRenderInstList;
  translucentInstList: GfxRenderInstList;
  viewFromWorld?: mat4;
  bgOpaqueInstList?: GfxRenderInstList;
  bgTranslucentInstList?: GfxRenderInstList;
  forceAlphaWrite?: boolean;
  skipMirrorModels?: boolean;
  skipStageTilt?: boolean;
  mirrorCapture?: boolean;
  mirrorPlanePoint?: vec3;
  mirrorPlaneNormal?: vec3;
  clipPlanePoint?: vec3;
  clipPlaneNormal?: vec3;
  skipWormholeSurfaces?: boolean;
  skipWormholeIds?: Set<number>;
  wormholeCapture?: boolean;
};
