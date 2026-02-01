import { Camera, CameraController } from './Camera.js';
import { mat4, vec3 } from 'gl-matrix';
import { transformVec3Mat4w0, transformVec3Mat4w1 } from './MathHelpers.js';
import {
  makeAttachmentClearDescriptor,
  makeBackbufferDescSimple,
  opaqueBlackFullClearRenderPassDescriptor,
} from './gfx/helpers/RenderGraphHelpers.js';
import { GfxDevice, GfxFormat } from './gfx/platform/GfxPlatform.js';
import { GfxrAttachmentSlot, GfxrRenderTargetDescription } from './gfx/render/GfxRenderGraph.js';
import {
  GfxRenderInstList,
  GfxRenderInstManager,
} from './gfx/render/GfxRenderInstManager.js';
import {
  GXRenderHelperGfx,
  fillSceneParamsDataOnTemplate,
} from './gx/gx_render.js';
import { MirrorMode, StageData, World } from './SuperMonkeyBall/World.js';
import { StageId } from './SuperMonkeyBall/StageInfo.js';

// TODO(complexplane): Put somewhere else
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
};

export type BallRenderState = {
  pos: { x: number; y: number; z: number };
  orientation: { x: number; y: number; z: number; w: number };
  radius: number;
  visible: boolean;
};

export type BananaRenderState = {
  animGroupId: number;
  pos: { x: number; y: number; z: number };
  rotX: number;
  rotY: number;
  rotZ: number;
  scale: number;
  tiltFactor: number;
  type: number;
  visible: boolean;
};

export type JamabarRenderState = {
  animGroupId: number;
  pos: { x: number; y: number; z: number };
  rot: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
};

export type GoalBagRenderState = {
  animGroupId: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  openness: number;
  uSomePos: { x: number; y: number; z: number };
};

export type GoalTapePointRenderState = {
  pos: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  t: number;
  flags: number;
};

export type GoalTapeRenderState = {
  animGroupId: number;
  pos: { x: number; y: number; z: number };
  rot: { x: number; y: number; z: number };
  points: GoalTapePointRenderState[];
  index?: number;
};

export type ConfettiRenderState = {
  modelIndex: number;
  pos: { x: number; y: number; z: number };
  rotX: number;
  rotY: number;
  rotZ: number;
  scale: number;
};

export type EffectRenderState = {
  kind: 'streak' | 'star' | 'flash' | 'sparkle';
  id: number;
  pos: { x: number; y: number; z: number };
  prevPos?: { x: number; y: number; z: number };
  glowPos?: { x: number; y: number; z: number };
  glowRotX?: number;
  glowRotY?: number;
  glowDist?: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  normal?: { x: number; y: number; z: number };
  scale: number;
  alpha: number;
  lifeRatio?: number;
  colorR?: number;
  colorG?: number;
  colorB?: number;
  textureName?: string;
};

export type SwitchRenderState = {
  animGroupId: number;
  pos: { x: number; y: number; z: number };
  rotX: number;
  rotY: number;
  rotZ: number;
  type: number;
};

export type StageTiltRenderState = {
  xrot: number;
  zrot: number;
};

export type GameplaySyncState = {
  timeFrames?: number | null;
  bananaCollectedByAnimGroup?: boolean[][] | null;
  bananas?: BananaRenderState[] | null;
  jamabars?: JamabarRenderState[] | null;
  animGroupTransforms?: Float32Array[] | null;
  ball?: BallRenderState | null;
  balls?: BallRenderState[] | null;
  goalBags?: GoalBagRenderState[] | null;
  goalTapes?: GoalTapeRenderState[] | null;
  confetti?: ConfettiRenderState[] | null;
  effects?: EffectRenderState[] | null;
  switches?: SwitchRenderState[] | null;
  stageTilt?: StageTiltRenderState | null;
};

const scratchMirrorPlaneNormal = vec3.create();
const scratchMirrorPlanePoint = vec3.create();
const scratchMirrorReflection = mat4.create();
const scratchMirrorViewFromWorld = mat4.create();
const scratchMirrorViewFromWorldTilted = mat4.create();
const scratchMirrorWorldFromView = mat4.create();
const scratchMirrorClipFromWorld = mat4.create();
const scratchViewFromWorldTilted = mat4.create();
const scratchDistortClipFromWorld = mat4.create();
const mirrorFlipX = mat4.fromScaling(mat4.create(), [-1, 1, 1]);
const WAVY_MIRROR_ALPHA = 0x60 / 0xff;

function computeReflectionMatrix(out: mat4, planePoint: vec3, planeNormal: vec3): void {
  vec3.normalize(scratchMirrorPlaneNormal, planeNormal);
  const nx = scratchMirrorPlaneNormal[0];
  const ny = scratchMirrorPlaneNormal[1];
  const nz = scratchMirrorPlaneNormal[2];
  const d = -(nx * planePoint[0] + ny * planePoint[1] + nz * planePoint[2]);

  out[0] = 1 - 2 * nx * nx;
  out[1] = -2 * nx * ny;
  out[2] = -2 * nx * nz;
  out[3] = 0;

  out[4] = -2 * ny * nx;
  out[5] = 1 - 2 * ny * ny;
  out[6] = -2 * ny * nz;
  out[7] = 0;

  out[8] = -2 * nz * nx;
  out[9] = -2 * nz * ny;
  out[10] = 1 - 2 * nz * nz;
  out[11] = 0;

  out[12] = -2 * nx * d;
  out[13] = -2 * ny * d;
  out[14] = -2 * nz * d;
  out[15] = 1;
}

function getMirrorCaptureDimensions(stageData: StageData, mirrorMode: MirrorMode): { width: number; height: number } {
  if (mirrorMode === 'wavy') {
    return { width: 640, height: 224 };
  }
  const bgName = stageData.stageInfo.bgInfo.fileName;
  if (bgName === 'bg_snd') {
    return { width: 160, height: 112 };
  }
  if (bgName === 'bg_ice') {
    return { width: 320, height: 224 };
  }
  if (bgName === 'bg_mst') {
    return stageData.stageInfo.id === StageId.St122_Fan_Master
      ? { width: 320, height: 224 }
      : { width: 640, height: 448 };
  }
  if (bgName === 'bg_stm') {
    return stageData.stageInfo.id === StageId.St089_Coffee_Cup
      ? { width: 320, height: 224 }
      : { width: 640, height: 448 };
  }
  if (bgName === 'bg_spa') {
    switch (stageData.stageInfo.id) {
      case StageId.St101_Blur_Bridge:
      case StageId.St109_Factory:
      case StageId.St110_Curl_Pipe:
      case StageId.St113_Daa_Loo_Maa:
      case StageId.St145_Fight_Space:
        return { width: 320, height: 224 };
      default:
        return { width: 640, height: 448 };
    }
  }
  return { width: 640, height: 448 };
}

export class Renderer {
  private renderHelper: GXRenderHelperGfx;
  private world: World;
  private opaqueInstList = new GfxRenderInstList();
  private translucentInstList = new GfxRenderInstList();
  private mirrorCaptureOpaqueInstList = new GfxRenderInstList();
  private mirrorCaptureTranslucentInstList = new GfxRenderInstList();
  private mirrorOverlayInstList = new GfxRenderInstList();
  private mirrorDistortInstList = new GfxRenderInstList();
  private mirrorCamera = new Camera();
  private mirrorMode: MirrorMode = 'none';
  private mirrorCaptureWidth = 0;
  private mirrorCaptureHeight = 0;
  private mirrorNeedsDistort = false;
  private lastExternalTimeFrames: number | null = null;

  constructor(device: GfxDevice, private stageData: StageData) {
    this.renderHelper = new GXRenderHelperGfx(device);
    this.world = new World(device, this.renderHelper.renderCache, stageData);
  }

  private prepareToRender(
    device: GfxDevice,
    viewerInput: RenderContext['viewerInput'],
    opaqueInstList: GfxRenderInstList,
    translucentInstList: GfxRenderInstList
  ): void {
    this.renderHelper.renderInstManager.reset();
    this.mirrorCaptureOpaqueInstList.reset();
    this.mirrorCaptureTranslucentInstList.reset();
    this.mirrorOverlayInstList.reset();
    this.mirrorDistortInstList.reset();
    this.world.update(viewerInput);

    viewerInput.camera.setClipPlanes(0.1);

    this.mirrorMode = this.world.getMirrorMode();
    this.mirrorNeedsDistort = this.mirrorMode === 'wavy';
    this.mirrorCaptureWidth = 0;
    this.mirrorCaptureHeight = 0;

    const mirrorPlaneMatrix = scratchMirrorReflection;
    if (this.mirrorMode !== 'none') {
      if (!this.world.getMirrorPlaneMatrix(mirrorPlaneMatrix, viewerInput.camera.worldMatrix)) {
        this.mirrorMode = 'none';
        this.mirrorNeedsDistort = false;
      }
    }

    if (this.mirrorMode !== 'none') {
      const dims = getMirrorCaptureDimensions(this.stageData, this.mirrorMode);
      const mirrorAspect = viewerInput.camera.aspect;
      this.mirrorCaptureHeight = dims.height;
      this.mirrorCaptureWidth = Math.max(1, Math.round(dims.height * mirrorAspect));

      const viewFromWorldTilted = this.world.getTiltedViewMatrix(
        viewerInput.camera.viewMatrix,
        scratchViewFromWorldTilted
      );
      transformVec3Mat4w0(scratchMirrorPlaneNormal, mirrorPlaneMatrix, [0, 1, 0]);
      transformVec3Mat4w1(scratchMirrorPlanePoint, mirrorPlaneMatrix, [0, 0, 0]);
      computeReflectionMatrix(scratchMirrorReflection, scratchMirrorPlanePoint, scratchMirrorPlaneNormal);

      mat4.mul(scratchMirrorViewFromWorld, viewFromWorldTilted, scratchMirrorReflection);
      mat4.mul(scratchMirrorViewFromWorld, mirrorFlipX, scratchMirrorViewFromWorld);
      mat4.invert(scratchMirrorWorldFromView, scratchMirrorViewFromWorld);

      this.mirrorCamera.clipSpaceNearZ = viewerInput.camera.clipSpaceNearZ;
      if (viewerInput.camera.isOrthographic) {
        this.mirrorCamera.setOrthographic(
          viewerInput.camera.top,
          mirrorAspect,
          viewerInput.camera.near,
          viewerInput.camera.far
        );
      } else {
        this.mirrorCamera.setPerspective(
          viewerInput.camera.fovY,
          mirrorAspect,
          viewerInput.camera.near,
          viewerInput.camera.far
        );
      }
      mat4.copy(this.mirrorCamera.worldMatrix, scratchMirrorWorldFromView);
      this.mirrorCamera.worldMatrixUpdated();

      const mirrorViewerInput: RenderContext['viewerInput'] = {
        ...viewerInput,
        camera: this.mirrorCamera,
        backbufferWidth: this.mirrorCaptureWidth,
        backbufferHeight: this.mirrorCaptureHeight,
      };

      const mirrorTemplate = this.renderHelper.pushTemplateRenderInst();
      fillSceneParamsDataOnTemplate(mirrorTemplate, mirrorViewerInput, 0, this.world.getAnimTimeFrames());
      const mirrorCtx: RenderContext = {
        device,
        renderInstManager: this.renderHelper.renderInstManager,
        viewerInput: mirrorViewerInput,
        opaqueInstList: this.mirrorCaptureOpaqueInstList,
        translucentInstList: this.mirrorCaptureTranslucentInstList,
        skipMirrorModels: true,
        skipStageTilt: true,
        mirrorCapture: true,
        mirrorPlanePoint: scratchMirrorPlanePoint,
        mirrorPlaneNormal: scratchMirrorPlaneNormal,
      };
      this.world.prepareToRender(mirrorCtx);
      this.renderHelper.renderInstManager.popTemplate();

      mat4.copy(scratchMirrorViewFromWorldTilted, scratchMirrorViewFromWorld);
      const mirrorViewFromWorldTilted = scratchMirrorViewFromWorldTilted;
      mat4.mul(scratchMirrorClipFromWorld, this.mirrorCamera.projectionMatrix, mirrorViewFromWorldTilted);
      mat4.mul(scratchDistortClipFromWorld, viewerInput.camera.projectionMatrix, viewFromWorldTilted);

      let indTexMtx0: vec3 | null = null;
      let indTexMtx1: vec3 | null = null;
      if (this.mirrorNeedsDistort) {
        const ind0 = scratchMirrorPlaneNormal;
        const ind1 = scratchMirrorPlanePoint;
        vec3.set(ind0, 0.0, 1.6, 0.0);
        vec3.set(ind1, 1.2, 0.0, 0.0);
        const abs0 = Math.abs(ind0[1]);
        const abs1 = Math.abs(ind1[0]);
        if (abs0 > abs1) {
          while (Math.abs(ind0[1]) >= 1.0) {
            vec3.scale(ind0, ind0, 0.5);
            vec3.scale(ind1, ind1, 0.5);
          }
        } else {
          while (Math.abs(ind1[0]) >= 1.0) {
            vec3.scale(ind0, ind0, 0.5);
            vec3.scale(ind1, ind1, 0.5);
          }
        }
        indTexMtx0 = ind0;
        indTexMtx1 = ind1;
      }

      const mirrorOverlayTemplate = this.renderHelper.pushTemplateRenderInst();
      fillSceneParamsDataOnTemplate(mirrorOverlayTemplate, viewerInput, 0, this.world.getAnimTimeFrames());
      const mirrorOverlayCtx: RenderContext = {
        device,
        renderInstManager: this.renderHelper.renderInstManager,
        viewerInput,
        opaqueInstList: this.mirrorOverlayInstList,
        translucentInstList: this.mirrorOverlayInstList,
      };
      const mirrorAlpha = this.mirrorMode === 'wavy' ? WAVY_MIRROR_ALPHA : 1.0;
      this.world.prepareToRenderMirrors(
        mirrorOverlayCtx,
        viewerInput.camera.viewMatrix,
        scratchMirrorClipFromWorld,
        mirrorAlpha,
        this.mirrorNeedsDistort ? scratchDistortClipFromWorld : null,
        indTexMtx0,
        indTexMtx1
      );
      if (this.mirrorNeedsDistort) {
        const mirrorDistortCtx: RenderContext = {
          device,
          renderInstManager: this.renderHelper.renderInstManager,
          viewerInput,
          opaqueInstList: this.mirrorDistortInstList,
          translucentInstList: this.mirrorDistortInstList,
        };
        this.world.prepareToRenderWavyDistort(mirrorDistortCtx, viewerInput.camera.viewMatrix);
      }
      this.renderHelper.renderInstManager.popTemplate();
    }

    const template = this.renderHelper.pushTemplateRenderInst();
    fillSceneParamsDataOnTemplate(template, viewerInput, 0, this.world.getAnimTimeFrames());

    const renderCtx: RenderContext = {
      device,
      renderInstManager: this.renderHelper.renderInstManager,
      viewerInput,
      opaqueInstList,
      translucentInstList,
    };
    this.world.prepareToRender(renderCtx);
    this.renderHelper.prepareToRender();
    this.renderHelper.renderInstManager.popTemplate();
  }

  public render(device: GfxDevice, viewerInput: RenderContext['viewerInput']) {
    this.prepareToRender(device, viewerInput, this.opaqueInstList, this.translucentInstList);
    const mainColorDesc = makeBackbufferDescSimple(
      GfxrAttachmentSlot.Color0,
      viewerInput,
      makeAttachmentClearDescriptor(this.world.getClearColor())
    );
    const mainDepthDesc = makeBackbufferDescSimple(
      GfxrAttachmentSlot.DepthStencil,
      viewerInput,
      opaqueBlackFullClearRenderPassDescriptor
    );

    const builder = this.renderHelper.renderGraph.newGraphBuilder();

    let mirrorColorTargetID = null;
    let mirrorColorResolveID = null;
    let mirrorDepthTargetID = null;
    let mirrorDistortTargetID = null;
    let mirrorDistortResolveID = null;
    let mirrorDistortDepthTargetID = null;
    if (this.mirrorMode !== 'none') {
      const mirrorDims = { width: this.mirrorCaptureWidth, height: this.mirrorCaptureHeight };
      const mirrorColorDesc = new GfxrRenderTargetDescription(GfxFormat.U8_RGBA_RT);
      mirrorColorDesc.setDimensions(mirrorDims.width, mirrorDims.height, 1);
      mirrorColorDesc.clearColor = this.world.getClearColor();
      mirrorColorDesc.clearDepth = opaqueBlackFullClearRenderPassDescriptor.clearDepth;
      mirrorColorDesc.clearStencil = 0;
      const mirrorDepthDesc = new GfxrRenderTargetDescription(GfxFormat.D24);
      mirrorDepthDesc.setDimensions(mirrorDims.width, mirrorDims.height, 1);
      mirrorDepthDesc.clearColor = 'load';
      mirrorDepthDesc.clearDepth = opaqueBlackFullClearRenderPassDescriptor.clearDepth;
      mirrorDepthDesc.clearStencil = 0;

      mirrorColorTargetID = builder.createRenderTargetID(mirrorColorDesc, 'Mirror Color');
      mirrorDepthTargetID = builder.createRenderTargetID(mirrorDepthDesc, 'Mirror Depth');

      builder.pushPass((pass) => {
        pass.setDebugName('Mirror Capture');
        pass.attachRenderTargetID(GfxrAttachmentSlot.Color0, mirrorColorTargetID!);
        pass.attachRenderTargetID(GfxrAttachmentSlot.DepthStencil, mirrorDepthTargetID!);
        pass.exec((passRenderer) => {
          this.mirrorCaptureOpaqueInstList.drawOnPassRenderer(this.renderHelper.renderCache, passRenderer);
          this.mirrorCaptureTranslucentInstList.drawOnPassRenderer(this.renderHelper.renderCache, passRenderer);
        });
      });
      mirrorColorResolveID = builder.resolveRenderTarget(mirrorColorTargetID);

      if (this.mirrorNeedsDistort) {
        const distortDesc = new GfxrRenderTargetDescription(GfxFormat.U8_RGBA_RT);
        distortDesc.setDimensions(256, 256, 1);
        distortDesc.clearColor = makeAttachmentClearDescriptor({ r: 0, g: 0, b: 0, a: 0 }).clearColor;
        distortDesc.clearDepth = opaqueBlackFullClearRenderPassDescriptor.clearDepth;
        distortDesc.clearStencil = 0;
        const distortDepthDesc = new GfxrRenderTargetDescription(GfxFormat.D24);
        distortDepthDesc.setDimensions(256, 256, 1);
        distortDepthDesc.clearColor = 'load';
        distortDepthDesc.clearDepth = opaqueBlackFullClearRenderPassDescriptor.clearDepth;
        distortDepthDesc.clearStencil = 0;

        mirrorDistortTargetID = builder.createRenderTargetID(distortDesc, 'Mirror Distort');
        mirrorDistortDepthTargetID = builder.createRenderTargetID(distortDepthDesc, 'Mirror Distort Depth');

        builder.pushPass((pass) => {
          pass.setDebugName('Mirror Distort');
          pass.attachRenderTargetID(GfxrAttachmentSlot.Color0, mirrorDistortTargetID!);
          pass.attachRenderTargetID(GfxrAttachmentSlot.DepthStencil, mirrorDistortDepthTargetID!);
          pass.exec((passRenderer) => {
            this.mirrorDistortInstList.drawOnPassRenderer(this.renderHelper.renderCache, passRenderer);
          });
        });
        mirrorDistortResolveID = builder.resolveRenderTarget(mirrorDistortTargetID);
      }
    }

    const mainColorTargetID = builder.createRenderTargetID(mainColorDesc, 'Main Color');
    const mainDepthTargetID = builder.createRenderTargetID(mainDepthDesc, 'Main Depth');
    builder.pushPass((pass) => {
      pass.setDebugName('Main Opaque');
      pass.attachRenderTargetID(GfxrAttachmentSlot.Color0, mainColorTargetID);
      pass.attachRenderTargetID(GfxrAttachmentSlot.DepthStencil, mainDepthTargetID);
      pass.exec((passRenderer) => {
        this.opaqueInstList.drawOnPassRenderer(this.renderHelper.renderCache, passRenderer);
      });
    });
    if (this.mirrorMode !== 'none' && mirrorColorResolveID !== null) {
      builder.pushPass((pass) => {
        pass.setDebugName('Mirror Overlay');
        pass.attachRenderTargetID(GfxrAttachmentSlot.Color0, mainColorTargetID);
        pass.attachRenderTargetID(GfxrAttachmentSlot.DepthStencil, mainDepthTargetID);
        pass.attachResolveTexture(mirrorColorResolveID!);
        if (this.mirrorNeedsDistort && mirrorDistortResolveID !== null) {
          pass.attachResolveTexture(mirrorDistortResolveID);
        }
        pass.exec((passRenderer, scope) => {
          const mirrorTexture = scope.getResolveTextureForID(mirrorColorResolveID!);
          this.mirrorOverlayInstList.resolveLateSamplerBinding('mirror-color', {
            gfxTexture: mirrorTexture,
            gfxSampler: null,
            lateBinding: null,
          });
          if (this.mirrorNeedsDistort && mirrorDistortResolveID !== null) {
            const distortTexture = scope.getResolveTextureForID(mirrorDistortResolveID);
            this.mirrorOverlayInstList.resolveLateSamplerBinding('mirror-distort', {
              gfxTexture: distortTexture,
              gfxSampler: null,
              lateBinding: null,
            });
          }
          this.mirrorOverlayInstList.drawOnPassRenderer(this.renderHelper.renderCache, passRenderer);
        });
      });
    }
    builder.pushPass((pass) => {
      pass.setDebugName('Main Translucent');
      pass.attachRenderTargetID(GfxrAttachmentSlot.Color0, mainColorTargetID);
      pass.attachRenderTargetID(GfxrAttachmentSlot.DepthStencil, mainDepthTargetID);
      pass.exec((passRenderer) => {
        this.translucentInstList.drawOnPassRenderer(this.renderHelper.renderCache, passRenderer);
      });
    });
    this.renderHelper.antialiasingSupport.pushPasses(
      builder,
      viewerInput,
      mainColorTargetID
    );
    builder.resolveRenderTargetToExternalTexture(mainColorTargetID, viewerInput.onscreenTexture);

    this.renderHelper.renderGraph.execute(builder);
  }

  public prewarmConfetti(device: GfxDevice, viewerInput: RenderContext['viewerInput']): void {
    const warmConfetti: ConfettiRenderState[] = [
      { modelIndex: 0, pos: { x: 0, y: 0, z: 0 }, rotX: 0, rotY: 0, rotZ: 0, scale: 0.001 },
      { modelIndex: 1, pos: { x: 0, y: 0, z: 0 }, rotX: 0, rotY: 0, rotZ: 0, scale: 0.001 },
      { modelIndex: 2, pos: { x: 0, y: 0, z: 0 }, rotX: 0, rotY: 0, rotZ: 0, scale: 0.001 },
      { modelIndex: 3, pos: { x: 0, y: 0, z: 0 }, rotX: 0, rotY: 0, rotZ: 0, scale: 0.001 },
      { modelIndex: 4, pos: { x: 0, y: 0, z: 0 }, rotX: 0, rotY: 0, rotZ: 0, scale: 0.001 },
    ];
    const warmGoalBags: GoalBagRenderState[] = [
      { animGroupId: 0, rotX: 0, rotY: 0, rotZ: 0, openness: 0, uSomePos: { x: 0, y: 0, z: 0 } },
      { animGroupId: 0, rotX: 0, rotY: 0, rotZ: 0, openness: 1, uSomePos: { x: 0, y: 0, z: 0 } },
    ];
    const prevDeltaTime = viewerInput.deltaTime;
    const prevTime = viewerInput.time;
    viewerInput.deltaTime = 0;
    this.world.setConfetti(warmConfetti);
    this.world.setGoalBags(warmGoalBags);
    this.render(device, viewerInput);
    this.world.setConfetti(null);
    this.world.setGoalBags(null);
    viewerInput.deltaTime = prevDeltaTime;
    viewerInput.time = prevTime;
  }

  public syncGameplayState(state: GameplaySyncState): void {
    if (state.timeFrames !== undefined && state.timeFrames !== null) {
      const delta = this.lastExternalTimeFrames === null
        ? 0
        : Math.max(0, state.timeFrames - this.lastExternalTimeFrames);
      this.lastExternalTimeFrames = state.timeFrames;
      this.world.setExternalTimeFrames(state.timeFrames, delta);
    }
    if (state.bananas !== undefined) {
      this.world.setBananas(state.bananas ?? null);
    }
    if (state.jamabars !== undefined) {
      this.world.setJamabars(state.jamabars ?? null);
    }
    if (state.bananaCollectedByAnimGroup) {
      this.world.setBananaCollectedByAnimGroup(state.bananaCollectedByAnimGroup);
    }
    const hasBalls = state.balls !== undefined;
    if (hasBalls) {
      this.world.setBallsState(state.balls ?? null);
    } else if (state.ball !== undefined) {
      this.world.setBallState(state.ball ?? null);
    }
    if (state.goalBags !== undefined) {
      this.world.setGoalBags(state.goalBags ?? null);
    }
    if (state.goalTapes !== undefined) {
      this.world.setGoalTapes(state.goalTapes ?? null);
    }
    if (state.confetti !== undefined) {
      this.world.setConfetti(state.confetti ?? null);
    }
    if (state.effects !== undefined) {
      this.world.setEffects(state.effects ?? null);
    }
    if (state.switches !== undefined) {
      this.world.setSwitches(state.switches ?? null);
    }
    if (state.stageTilt !== undefined) {
      this.world.setStageTilt(state.stageTilt ?? null);
    }
    if (state.animGroupTransforms !== undefined) {
      this.world.setAnimGroupTransforms(state.animGroupTransforms ?? null);
    }
  }

  public destroy(device: GfxDevice): void {
    this.renderHelper.destroy();
    this.world.destroy(device);
  }

  public adjustCameraController(c: CameraController) {
    c.setSceneMoveSpeedMult(1 / 32);
    c.setKeyMoveSpeed(20);
  }
}
