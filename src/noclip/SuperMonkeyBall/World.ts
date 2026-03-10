import { mat4, quat, vec3, vec4 } from "gl-matrix";
import { Color } from "../Color.js";
import {
    GfxBlendFactor,
    GfxBlendMode,
    GfxBufferUsage,
    GfxChannelWriteMask,
    GfxCompareMode,
    GfxCullMode,
    GfxDevice,
    GfxFormat,
    GfxInputLayout,
    GfxInputLayoutDescriptor,
    GfxMipFilterMode,
    GfxPrimitiveTopology,
    type GfxProgram,
    GfxSamplerDescriptor,
    GfxTexFilterMode,
    makeTextureDescriptor2D,
    GfxVertexAttributeDescriptor,
    GfxVertexBufferFrequency,
    GfxWrapMode,
} from "../gfx/platform/GfxPlatform.js";
import { GfxRenderCache } from "../gfx/render/GfxRenderCache.js";
import type { GfxRenderInst } from "../gfx/render/GfxRenderInstManager.js";
import * as GX_Material from "../gx/gx_material.js";
import { GfxShaderLibrary } from "../gfx/helpers/GfxShaderLibrary.js";
import { preprocessProgram_GLSL } from "../gfx/shaderc/GfxShaderCompiler.js";
import * as Viewer from "../viewer.js";
import { Background } from "./Background.js";
import { BgObjectInst } from "./BgObject.js";
import * as Gma from "./Gma.js";
import { ModelInst, RenderParams, RenderSort } from "./Model.js";
import { GmaSrc, ModelCache, TextureCache } from "./ModelCache.js";
import * as Nl from "./NaomiLib.js";
import { RenderContext } from "./Render.js";
import { GXTextureMapping, fillSceneParamsDataOnTemplate, gxBindingLayouts } from "../gx/gx_render.js";
import type { TextureInputGX } from "../gx/gx_texture.js";
import { fillMatrix4x4, fillVec4 } from "../gfx/helpers/UniformBufferHelpers.js";
import { makeMegaState, setAttachmentStateSimple } from "../gfx/helpers/GfxMegaStateDescriptorHelpers.js";
import { makeSolidColorTexture2D } from "../gfx/helpers/TextureHelpers.js";
import { reverseDepthForCompareMode } from "../gfx/helpers/ReversedDepthHelpers.js";
import type {
    BananaRenderState,
    ConfettiRenderState,
    EffectRenderState,
    JamabarRenderState,
    ModRenderPrimitiveState,
    GoalBagRenderState,
    GoalTapeRenderState,
    StageTiltRenderState,
    SwitchRenderState,
} from "./Render.js";
import * as SD from "./Stagedef.js";
import { BgInfos, StageId, StageInfo } from "./StageInfo.js";
import {getMat4RotY, MkbTime} from "./Utils.js";
import { AnimGroup } from "./AnimGroup.js";
import { Lighting, LightingGroups } from "./Lighting.js";
import { CommonModelID } from "./ModelInfo.js";
import {BALL_STATES, GAME_SOURCES, S16_TO_RAD} from "../../shared/constants/index.js";
import {
    BALL_HEMI1_DEFAULT_COLOR,
    BALL_HEMI2_DEFAULT_COLOR,
    writeRgbFromHex,
} from "../../shared/ball_appearance.js";
import { CommonNlModelID } from "./NlModelInfo.js";
import { S16_TO_RADIANS } from "./Utils.js";
import { Vec3Zero, transformVec3Mat4w0, transformVec3Mat4w1 } from "../MathHelpers.js";
import { TevLayerInst } from "./TevLayer.js";
import { BONUS_WAVE_MODEL_NAME, BONUS_WAVE_VERTEX_GLOBAL, createBonusWaveMaterialHacks } from "./BonusWave.js";
import {raycastStageDown} from "../../collision";

// Immutable parsed stage definition
export type StageData = {
    stageInfo: StageInfo;
    stagedef: SD.Stage;
    stageGma: Gma.Gma;
    bgGma: Gma.Gma;
    commonGma: Gma.Gma;
    ballCommonGma?: Gma.Gma | null;
    goalTimerGma?: Gma.Gma | null;
    nlObj: Nl.Obj; // Extra Naomi model archive from filedrop
    stageNlObj?: Nl.Obj | null;
    stageNlObjNameMap?: Map<string, number> | null;
    gameSource?: string;
};

export type MirrorMode = 'none' | 'flat' | 'wavy';

// Common interface for GMA and NaomiLib models
export interface ModelInterface {
    setMaterialHacks(hacks: GX_Material.GXMaterialHacks): void;
    prepareToRender(ctx: RenderContext, renderParams: RenderParams): void;
    prepareToRenderCustom?: (
        ctx: RenderContext,
        renderParams: RenderParams,
        configureRenderInst: (renderInst: GfxRenderInst, renderParams: RenderParams) => void
    ) => void;
    destroy(device: GfxDevice): void;
}

// Mutable, global shared state
export type WorldState = {
    lighting: Lighting;
    lightingGroups: LightingGroups;
    modelCache: ModelCache;
    time: MkbTime;
    raycastStageDown?: (pos: vec3) => number | null;
    // TODO(complexplane): Itemgroup animation state (for raycasts)
    // TODO(complexplane): Stage bounding sphere (for asteroids in Space?)
};

export type BallRenderState = {
    playerId: number;
    pos: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
    radius: number;
    visible: boolean;
    appearance?: {
        hemi1Color?: string;
        hemi2Color?: string;
        hemi1Texture?: string;
        hemi2Texture?: string;
        playerBillboardTexture?: string;
    };
    apeYaw: number;
    speed: number;
    goaled: boolean;
};

export type GoalTimerDigits = {
    small: (ModelInterface | null)[];
    large: (ModelInterface | null)[];
};

export type GoalBagModels = {
    closed: ModelInterface | null;
    openA: ModelInterface | null;
    openB: ModelInterface | null;
};

const BALL_BASE_RADIUS = 0.5;
const STAGE_TILT_SCALE = 0.6;
const SHADOW_LIGHT_OFFSET = 15;
const SHADOW_RADIUS_SCALE = 1.4;
const SHADOW_FADE_SCALE = 0.2;
const SHADOW_PARAMS_WORDS = 40;
const SHADOW_UBO_INDEX = 1;
const STREAK_VERTEX_SIZE = 24;
const BALL_TEXTURE_MAX_DIM = 1024;
const BALL_HEMI_Y_ROT_180 = mat4.fromYRotation(mat4.create(), Math.PI);
const BALL_COLOR_GAIN_EPSILON = 0.001;
const BALL_COLOR_GAIN_MAX = 20.0;
const BALL_CLEAR_HEMI_ALPHA_MUL = 1.6;
const EFFECT_DEPTH_BIAS = 0.2;
const EFFECT_DEPTH_BIAS_MAX = 0.5;
const SPARKLE_TEXTURE_PATH = "assets/particle/beautifulstar.png";
const MIRROR_FLAT_UBO_INDEX = 1;
const MIRROR_FLAT_UBO_WORDS = 36;
const MIRROR_WAVY_UBO_INDEX = 1;
const MIRROR_WAVY_UBO_WORDS = 60;
const MIRROR_DISTORT_UBO_INDEX = 1;
const MIRROR_DISTORT_UBO_WORDS = 16;
const WORMHOLE_SURFACE_UBO_INDEX = 1;
const WORMHOLE_SURFACE_UBO_WORDS = 36;
const WORMHOLE_VIEW_OFFSET_Y = 2.2;
const WAVY_MIRROR_PLANE_Y = 0.02;
const scratchRenderParams = new RenderParams();
const scratchTiltedView = mat4.create();
const scratchTiltedViewPrev = mat4.create();
const scratchVec3a = vec3.create();
const scratchVec3b = vec3.create();
const scratchVec3c = vec3.create();
const scratchVec3d = vec3.create();
const scratchVec3e = vec3.create();
const scratchVec3f = vec3.create();
const scratchVec3g = vec3.create();
const scratchVec3h = vec3.create();
const scratchVec4a = vec4.create();
const scratchVec4b = vec4.create();
const scratchVec4c = vec4.create();
const scratchMat4a = mat4.create();
const scratchShadowView = mat4.create();
const scratchShadowFromView = mat4.create();
const scratchWorldFromView = mat4.create();
const scratchBallLightPos = vec3.create();
const scratchMirrorPlane = mat4.create();
const scratchMirrorMat4a = mat4.create();
const scratchMirrorMat4b = mat4.create();
const scratchMirrorMat4c = mat4.create();
const scratchMirrorMat4d = mat4.create();
const scratchMirrorMat4e = mat4.create();
const scratchMirrorVec3a = vec3.create();
const scratchWormholeMat4a = mat4.create();
const scratchWormholeMat4b = mat4.create();
const scratchWormholeMat4c = mat4.create();
const scratchWormholeMat4d = mat4.create();
const scratchWormholeMat4e = mat4.create();
const scratchWormholeMat4f = mat4.create();
const scratchWormholeMat4g = mat4.create();
const scratchWormholeVec3a = vec3.create();
const scratchWormholeVec3b = vec3.create();
const scratchWormholeVec3c = vec3.create();
const scratchWormholeVec3d = vec3.create();
const WORMHOLE_OFFSET_LOCAL = vec3.fromValues(0, WORMHOLE_VIEW_OFFSET_Y, 0);
const WORMHOLE_UP_LOCAL = vec3.fromValues(0, 1, 0);
const WORMHOLE_FORWARD_SOURCE_LOCAL = vec3.fromValues(0, 0, -1);
const WORMHOLE_FORWARD_DEST_LOCAL = vec3.fromValues(0, 0, 1);
const WORMHOLE_LOCAL_THROUGH = mat4.fromYRotation(mat4.create(), Math.PI);
const SMB2_WORMHOLE_OVERLAY_WARP_MODEL_ID = 0x5e;
const SMB2_WORMHOLE_OVERLAY_WARP_MODEL_NAME = "circle_white";
const WORMHOLE_NEAR_FADE_INNER_RADIUS_SCALE = 0.8;
const WORMHOLE_NEAR_FADE_OUTER_RADIUS_SCALE = 2.0;
const OVERLAY_RAYCAST_EPSILON = 1.1920928955078125e-7;
const OVERLAY_RAYCAST_EDGE_EPSILON = 0.01;
const SMB2_STAGE_340_ID = 340;
const SMB2_STAGE_340_FORCE_DRAW_FLAG = 0x01;
const SMB2_STAGE_340_MODEL_DRAWS: readonly Smb2Stage340ModelDraw[] = [
    [3, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0x00],
    [7, 0.0, 3.75, 0.0, 0.0, 1.0, 0.0, 0x00],
    [8, 0.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0x00],
    [9, 0.0, -3.75, 0.0, 0.0, -1.0, 0.0, 0x00],
    [10, 0.0, 0.0, 5.0, 0.0, 0.0, 1.0, 0x00],
    [11, 0.0, 0.0, -5.0, 0.0, 0.0, -1.0, 0x00],
    [12, 0.0, -3.75, 0.0, 0.0, -1.0, 0.0, 0x00],
];
const SMB2_REVOLUTION_STAGE_ID = 348;
const REVOLUTION_WALL_THRESHOLD = 40.0;
const REVOLUTION_FLOOR_LOW_Y = -8.0;
const REVOLUTION_FLOOR_MID_Y = 0.0;
const REVOLUTION_FLOOR_HIGH_Y = 8.0;
const scratchOverlayRayAgFromWorld = mat4.create();
const scratchOverlayRayTriFromAg = mat4.create();
const scratchOverlayRayAgFromTri = mat4.create();
const scratchOverlayRayPosAg = vec3.create();
const scratchOverlayRayPosTri = vec3.create();
const scratchOverlayRayDirTri = vec3.create();
const scratchOverlayRayHitTri = vec3.create();
const scratchOverlayRayHitAg = vec3.create();
const scratchOverlayRayHitWorld = vec3.create();
const scratchStage340AgFromWorld = mat4.create();
const scratchStage340CameraWorld = vec3.create();
const scratchStage340CameraLocal = vec3.create();
const scratchRevolutionAgFromWorld = mat4.create();
const scratchRevolutionCameraWorld = vec3.create();
const scratchRevolutionCameraLocal = vec3.create();
const scratchRevolutionBallLocal = vec3.create();
const BALL_PLAYER_CHAR_BILLBOARD_MODEL = "gb_grad"; // This model is offset by 0,1,1 in common.gma!

function coligridLookupStagedef(animGroup: SD.AnimGroup, x: number, z: number): number[] | null {
    const stepX = animGroup.gridStepX;
    const stepZ = animGroup.gridStepZ;
    if (stepX <= 0 || stepZ <= 0) {
        return null;
    }
    // SMB2 casts to int here, which truncates toward zero (not floor for negatives).
    const cellX = Math.trunc((x - animGroup.gridOriginX) / stepX);
    const cellZ = Math.trunc((z - animGroup.gridOriginZ) / stepZ);
    if (
        cellX < 0 ||
        cellX >= animGroup.gridCellCountX ||
        cellZ < 0 ||
        cellZ >= animGroup.gridCellCountZ
    ) {
        return null;
    }
    const index = cellZ * animGroup.gridCellCountX + cellX;
    return animGroup.gridCellTris[index] ?? null;
}

type WormholeRenderInfo = {
    id: number;
    destId: number | null;
    animGroupIndex: number;
    pos: vec3;
    rot: vec3;
};

type Smb2Stage340ModelDraw = readonly [
    modelIndex: number,
    pointX: number,
    pointY: number,
    pointZ: number,
    normalX: number,
    normalY: number,
    normalZ: number,
    flags: number,
];

type RevolutionStageModels = {
    floor1: ModelInst | null;
    floor2: ModelInst | null;
    floor3: ModelInst | null;
    wallLeft: ModelInst | null;
    wallRight: ModelInst | null;
};

function getNlModelInst(
    device: GfxDevice,
    renderCache: GfxRenderCache,
    nlObj: Nl.Obj,
    textureCache: TextureCache,
    id: number
): Nl.ModelInst | null {
    const modelData = nlObj.get(id);
    if (!modelData) {
        return null;
    }
    return new Nl.ModelInst(device, renderCache, modelData, textureCache);
}

function getGoalTapeModelData(stageData: StageData): Nl.Model | null {
    let model = stageData.nlObj.get(CommonNlModelID.GOAL_TAPE);
    if (!model && (stageData.gameSource === 'smb2' || stageData.gameSource === 'mb2ws')) {
        model = stageData.nlObj.get(CommonNlModelID.GOAL_TAPE_SMB2);
    }
    return model ?? null;
}

function createShadowProgram(renderCache: GfxRenderCache): GfxProgram {
    const vert = `
${GfxShaderLibrary.MatrixLibrary}

layout(std140) uniform ub_SceneParams {
    Mat4x4 u_Projection;
    vec4 u_Misc0;
};

layout(std140) uniform ub_ShadowParams {
    Mat4x4 u_ViewFromModel;
    Mat4x4 u_ShadowFromView;
    vec4 u_ShadowColor;
    vec4 u_ShadowInfo;
};

layout(location = 0) in vec4 a_Position;
layout(location = 3) in vec3 a_Normal;

out vec3 v_ShadowPos;
out vec2 v_ShadowUV;
out vec3 v_ShadowNormal;
out float v_HasShadowNormal;

void main() {
    mat4 proj = UnpackMatrix(u_Projection);
    mat4 viewFromModel = UnpackMatrix(u_ViewFromModel);
    mat4 shadowFromView = UnpackMatrix(u_ShadowFromView);
    mat4 shadowFromModel = shadowFromView * viewFromModel;
    mat3 shadowNormalFromModel = mat3(transpose(inverse(shadowFromModel)));
    vec4 posView = viewFromModel * vec4(a_Position.xyz, 1.0);
    vec4 posShadow = shadowFromModel * vec4(a_Position.xyz, 1.0);
    v_ShadowPos = posShadow.xyz;
    v_ShadowUV = posShadow.xy / (u_ShadowInfo.x * 2.0) + vec2(0.5);
    vec3 normalShadow = shadowNormalFromModel * a_Normal;
    float normalLen = length(normalShadow);
    if (normalLen > 1e-5) {
        v_ShadowNormal = normalShadow / normalLen;
        v_HasShadowNormal = 1.0;
    } else {
        v_ShadowNormal = vec3(0.0);
        v_HasShadowNormal = 0.0;
    }
    gl_Position = proj * posView;
}
`;

    const frag = `
${GfxShaderLibrary.MatrixLibrary}

precision highp float;

layout(std140) uniform ub_ShadowParams {
    Mat4x4 u_ViewFromModel;
    Mat4x4 u_ShadowFromView;
    vec4 u_ShadowColor;
    vec4 u_ShadowInfo;
};

uniform sampler2D u_Texture;

in vec3 v_ShadowPos;
in vec2 v_ShadowUV;
in vec3 v_ShadowNormal;
in float v_HasShadowNormal;

out vec4 o_Color;

void main() {
    if (v_ShadowUV.x < 0.0 || v_ShadowUV.x > 1.0 || v_ShadowUV.y < 0.0 || v_ShadowUV.y > 1.0) {
        discard;
    }
    if (v_HasShadowNormal > 0.5) {
        // Directional light comparison in shadow space.
        float facing = dot(normalize(v_ShadowNormal), vec3(0.0, 0.0, 1.0));
        if (facing <= 0.0) {
            discard;
        }
    }
    vec4 tex = texture(u_Texture, v_ShadowUV);
    float dist = u_ShadowInfo.y - v_ShadowPos.z;
    // if (dist <= -0.03) {
    //     discard;
    // }
    float distForFade = max(dist, 0.0);
    float fade = clamp(1.0 - distForFade * u_ShadowInfo.z, 0.0, 1.0);
    float mask = max(max(tex.r, tex.g), tex.b);
    float alpha = mask * u_ShadowColor.a * fade;
    if (alpha <= 0.0) {
        discard;
    }
    o_Color = vec4(u_ShadowColor.rgb, alpha);
}
`;

    const program = preprocessProgram_GLSL(renderCache.device.queryVendorInfo(), vert, frag);
    return renderCache.createProgramSimple(program);
}

function createStreakProgram(renderCache: GfxRenderCache): GfxProgram {
    const vert = `
${GfxShaderLibrary.MatrixLibrary}

precision highp float;

layout(std140) uniform ub_SceneParams {
    Mat4x4 u_Projection;
    vec4 u_Misc0;
};

layout(location = 0) in vec3 a_Position;
layout(location = 1) in vec4 a_Color;
layout(location = 2) in vec2 a_TexCoord;

out vec4 v_Color;
out vec2 v_TexCoord;

void main() {
    mat4 proj = UnpackMatrix(u_Projection);
    gl_Position = proj * vec4(a_Position, 1.0);
    v_Color = a_Color;
    v_TexCoord = a_TexCoord;
}
`;

    const frag = `
precision mediump float;

uniform sampler2D u_Texture;

in vec4 v_Color;
in vec2 v_TexCoord;

out vec4 o_Color;

void main() {
    vec4 tex = texture(u_Texture, v_TexCoord);
    o_Color = v_Color * tex;
}
`;

    const program = preprocessProgram_GLSL(renderCache.device.queryVendorInfo(), vert, frag);
    return renderCache.createProgramSimple(program);
}

function createStreakCutoutProgram(renderCache: GfxRenderCache): GfxProgram {
    const vert = `
${GfxShaderLibrary.MatrixLibrary}

precision highp float;

layout(std140) uniform ub_SceneParams {
    Mat4x4 u_Projection;
    vec4 u_Misc0;
};

layout(location = 0) in vec3 a_Position;
layout(location = 1) in vec4 a_Color;
layout(location = 2) in vec2 a_TexCoord;

out vec4 v_Color;
out vec2 v_TexCoord;

void main() {
    mat4 proj = UnpackMatrix(u_Projection);
    gl_Position = proj * vec4(a_Position, 1.0);
    v_Color = a_Color;
    v_TexCoord = a_TexCoord;
}
`;

    const frag = `
precision mediump float;

uniform sampler2D u_Texture;

in vec4 v_Color;
in vec2 v_TexCoord;

out vec4 o_Color;

void main() {
    vec4 tex = texture(u_Texture, v_TexCoord);
    vec4 color = v_Color * tex;
    if (color.a <= 0.45) {
        discard;
    }
    o_Color = vec4(color.rgb, 1.0);
}
`;

    const program = preprocessProgram_GLSL(renderCache.device.queryVendorInfo(), vert, frag);
    return renderCache.createProgramSimple(program);
}

function createMirrorFlatProgram(renderCache: GfxRenderCache): GfxProgram {
    const vert = `
${GfxShaderLibrary.MatrixLibrary}

layout(std140) uniform ub_SceneParams {
    Mat4x4 u_Projection;
    vec4 u_Misc0;
};

layout(std140) uniform ub_MirrorParams {
    Mat4x4 u_ViewFromModel;
    Mat4x4 u_MirrorClipFromModel;
    vec4 u_MirrorAlpha;
};

layout(location = 0) in vec4 a_Position;
layout(location = 6) in vec4 a_Color;

out vec4 v_MirrorClip;
out vec4 v_Color;

void main() {
    mat4 viewFromModel = UnpackMatrix(u_ViewFromModel);
    vec4 posView = viewFromModel * vec4(a_Position.xyz, 1.0);
    gl_Position = UnpackMatrix(u_Projection) * posView;
    v_MirrorClip = UnpackMatrix(u_MirrorClipFromModel) * vec4(a_Position.xyz, 1.0);
    v_Color = a_Color;
}
`;

    const frag = `
${GfxShaderLibrary.MatrixLibrary}

precision highp float;

layout(std140) uniform ub_MirrorParams {
    Mat4x4 u_ViewFromModel;
    Mat4x4 u_MirrorClipFromModel;
    vec4 u_MirrorAlpha;
};

uniform sampler2D u_MirrorTexture;

in vec4 v_MirrorClip;
in vec4 v_Color;

out vec4 o_Color;

vec2 Project(vec4 clipPos) {
    vec2 uv = clipPos.xy / clipPos.w;
    return uv * 0.5 + vec2(0.5);
}

void main() {
    vec2 uv = clamp(Project(v_MirrorClip), 0.0, 1.0);
    vec4 tex = texture(u_MirrorTexture, uv);
    o_Color = vec4(tex.rgb, u_MirrorAlpha.x * v_Color.a);
}
`;

    const program = preprocessProgram_GLSL(renderCache.device.queryVendorInfo(), vert, frag);
    return renderCache.createProgramSimple(program);
}

function createMirrorWavyProgram(renderCache: GfxRenderCache): GfxProgram {
    const vert = `
${GfxShaderLibrary.MatrixLibrary}
${BONUS_WAVE_VERTEX_GLOBAL}

layout(std140) uniform ub_SceneParams {
    Mat4x4 u_Projection;
    vec4 u_Misc0;
};

#define u_SceneTimeFrames u_Misc0[1]

layout(std140) uniform ub_MirrorParams {
    Mat4x4 u_ViewFromModel;
    Mat4x4 u_MirrorClipFromModel;
    Mat4x4 u_DistortClipFromModel;
    vec4 u_MirrorAlpha;
    vec4 u_IndTexMtx0;
    vec4 u_IndTexMtx1;
};

layout(location = 0) in vec4 a_Position;
layout(location = 6) in vec4 a_Color;

out vec4 v_MirrorClip;
out vec4 v_DistortClip;
out vec4 v_Color;

void main() {
    vec3 t_Position = a_Position.xyz;
    float t_WaveDist = length(t_Position.xz);
    float t_WaveAmp = 0.5 + (-0.030833333333333333 * t_WaveDist);
    float t_WaveAngle = -1092.0 * (u_SceneTimeFrames - 30.0) + 16384.0 * t_WaveDist;
    if (t_WaveAngle <= 0.0) {
        float t_WaveRad = t_WaveAngle * BONUS_WAVE_ANGLE_TO_RAD;
        float t_WaveSin = sin(t_WaveRad);
        t_Position.y += t_WaveSin * t_WaveAmp;
    }

    mat4 viewFromModel = UnpackMatrix(u_ViewFromModel);
    vec4 posView = viewFromModel * vec4(t_Position, 1.0);
    gl_Position = UnpackMatrix(u_Projection) * posView;
    v_MirrorClip = UnpackMatrix(u_MirrorClipFromModel) * vec4(t_Position, 1.0);
    v_DistortClip = UnpackMatrix(u_DistortClipFromModel) * vec4(t_Position, 1.0);
    v_Color = a_Color;
}
`;

    const frag = `
${GfxShaderLibrary.MatrixLibrary}

precision highp float;

layout(std140) uniform ub_MirrorParams {
    Mat4x4 u_ViewFromModel;
    Mat4x4 u_MirrorClipFromModel;
    Mat4x4 u_DistortClipFromModel;
    vec4 u_MirrorAlpha;
    vec4 u_IndTexMtx0;
    vec4 u_IndTexMtx1;
};

uniform sampler2D u_MirrorTexture;
uniform sampler2D u_DistortTexture;

in vec4 v_MirrorClip;
in vec4 v_DistortClip;
in vec4 v_Color;

out vec4 o_Color;

vec2 Project(vec4 clipPos) {
    vec2 uv = clipPos.xy / clipPos.w;
    return uv * 0.5 + vec2(0.5);
}

void main() {
    vec2 mirrorUV = Project(v_MirrorClip);
    vec2 distortUV = Project(v_DistortClip);

    vec4 distort = texture(u_DistortTexture, distortUV);
    // SMB1 uses GXSetTexCopyDst(..., GX_CTF_GB8, ...) then samples as IA8.
    // That maps copied channels to IA8 as I=G and A=B, so .abg becomes (B, G, G).
    float indI = 255.0 * distort.g;
    float indA = 255.0 * distort.b;
    vec3 indCoord = vec3(indA, indI, indI);
    indCoord += vec3(-128.0);
    vec2 mirrorTexSize = vec2(textureSize(u_MirrorTexture, 0));
    vec2 indOffset = vec2(
        dot(u_IndTexMtx0.xyz, indCoord),
        dot(u_IndTexMtx1.xyz, indCoord)
    ) / mirrorTexSize;

    mirrorUV = clamp(mirrorUV + indOffset, 0.0, 1.0);
    vec4 tex = texture(u_MirrorTexture, mirrorUV);
    o_Color = vec4(tex.rgb, u_MirrorAlpha.x * v_Color.a);
}
`;

    const program = preprocessProgram_GLSL(renderCache.device.queryVendorInfo(), vert, frag);
    return renderCache.createProgramSimple(program);
}

function createMirrorDistortProgram(renderCache: GfxRenderCache): GfxProgram {
    const vert = `
${GfxShaderLibrary.MatrixLibrary}
${GfxShaderLibrary.MulNormalMatrix}

layout(std140) uniform ub_SceneParams {
    Mat4x4 u_Projection;
    vec4 u_Misc0;
};

#define u_SceneTimeFrames u_Misc0[1]

layout(std140) uniform ub_WavyParams {
    Mat4x4 u_ViewFromModel;
};

layout(location = 0) in vec4 a_Position;
layout(location = 3) in vec3 a_Normal;

out vec2 v_TexCoord;

${BONUS_WAVE_VERTEX_GLOBAL}

void main() {
    vec3 t_Position = a_Position.xyz;
    vec3 t_Normal = a_Normal;

    float t_WaveDist = length(t_Position.xz);
    float t_WaveAmp = 0.5 + (-0.030833333333333333 * t_WaveDist);
    float t_WaveAngle = -1092.0 * (u_SceneTimeFrames - 30.0) + 16384.0 * t_WaveDist;
    if (t_WaveAngle <= 0.0) {
        float t_WaveRad = t_WaveAngle * BONUS_WAVE_ANGLE_TO_RAD;
        float t_WaveSin = sin(t_WaveRad);
        float t_WaveCos = cos(t_WaveRad);
        float t_WaveAmpDeriv = -0.030833333333333333;
        float t_WaveThetaDeriv = 16384.0 * BONUS_WAVE_ANGLE_TO_RAD;
        vec3 t_WavePos = t_Position;
        t_WavePos.y += t_WaveSin * t_WaveAmp;

        vec3 t_WaveNormal = vec3(0.0, 1.0, 0.0);
        if (t_WaveDist > 0.0) {
            float t_WaveDyDr = (t_WaveCos * t_WaveThetaDeriv * t_WaveAmp) + (t_WaveSin * t_WaveAmpDeriv);
            float t_WaveInvR = 1.0 / t_WaveDist;
            float t_WaveDx = t_WaveDyDr * t_Position.x * t_WaveInvR;
            float t_WaveDz = t_WaveDyDr * t_Position.z * t_WaveInvR;
            t_WaveNormal = normalize(vec3(-t_WaveDx, 1.0, -t_WaveDz));
        }

        t_Position = t_WavePos;
        t_Normal = t_WaveNormal;
    }

    mat4 viewFromModel = UnpackMatrix(u_ViewFromModel);
    vec4 posView = viewFromModel * vec4(t_Position, 1.0);
    gl_Position = UnpackMatrix(u_Projection) * posView;

    // Match SMB1's distortion texgen setup:
    // GXSetTexCoordGen2(TG_NRM, texMtx=0x40) with
    // texMtx = Translate(0.5, 0.5, 1.0) * (view rot, no translation), then scale Y column to 0.
    // This removes normal-Y contribution before the view rotation and performs the generated q divide.
    mat3 viewRot = mat3(viewFromModel);
    vec3 nrm = normalize(t_Normal);
    vec3 texGen = viewRot * vec3(nrm.x, 0.0, nrm.z) + vec3(0.5, 0.5, 1.0);
    if (abs(texGen.z) > 1e-5) {
        v_TexCoord = texGen.xy / texGen.z;
    } else {
        v_TexCoord = texGen.xy;
    }
}
`;

    const frag = `
precision highp float;

uniform sampler2D u_GradTexture;

in vec2 v_TexCoord;

out vec4 o_Color;

void main() {
    vec2 uv = clamp(v_TexCoord, 0.0, 1.0);
    vec4 tex = texture(u_GradTexture, uv);
    o_Color = vec4(tex.rgb, 1.0);
}
`;

    const program = preprocessProgram_GLSL(renderCache.device.queryVendorInfo(), vert, frag);
    return renderCache.createProgramSimple(program);
}

function createWormholeSurfaceProgram(renderCache: GfxRenderCache): GfxProgram {
    const vert = `
${GfxShaderLibrary.MatrixLibrary}

layout(std140) uniform ub_SceneParams {
    Mat4x4 u_Projection;
    vec4 u_Misc0;
};

layout(std140) uniform ub_WormholeParams {
    Mat4x4 u_ViewFromModel;
    Mat4x4 u_PortalClipFromModel;
    vec4 u_Params;
};

layout(location = 0) in vec4 a_Position;

out vec4 v_PortalClip;

void main() {
    mat4 viewFromModel = UnpackMatrix(u_ViewFromModel);
    vec4 posView = viewFromModel * vec4(a_Position.xyz, 1.0);
    gl_Position = UnpackMatrix(u_Projection) * posView;
    v_PortalClip = UnpackMatrix(u_PortalClipFromModel) * vec4(a_Position.xyz, 1.0);
}
`;

    const frag = `
${GfxShaderLibrary.MatrixLibrary}

precision highp float;

layout(std140) uniform ub_WormholeParams {
    Mat4x4 u_ViewFromModel;
    Mat4x4 u_PortalClipFromModel;
    vec4 u_Params;
};

uniform sampler2D u_PortalTexture;

in vec4 v_PortalClip;

out vec4 o_Color;

vec2 Project(vec4 clipPos) {
    vec2 uv = clipPos.xy / clipPos.w;
    return uv * 0.5 + vec2(0.5);
}

void main() {
    if (v_PortalClip.w <= 0.0) {
        discard;
    }
    vec2 uv = clamp(Project(v_PortalClip), 0.0, 1.0);
    vec4 tex = texture(u_PortalTexture, uv);
    float alpha = clamp(u_Params.x, 0.0, 1.0);
    if (alpha <= 0.0) {
        discard;
    }
    o_Color = vec4(tex.rgb, alpha);
}
`;

    const program = preprocessProgram_GLSL(renderCache.device.queryVendorInfo(), vert, frag);
    return renderCache.createProgramSimple(program);
}

function collectStreakTextures(textureSources: Map<string, TextureInputGX>, gma: Gma.Gma): void {
    for (const model of gma.nameMap.values()) {
        for (const tevLayer of model.tevLayers) {
            const tex = tevLayer.gxTexture;
            if (tex && tex.data && !textureSources.has(tex.name)) {
                textureSources.set(tex.name, tex);
            }
        }
    }
}

class BallInst {
    private slots: {
        model: ModelInst;
        depthOffset: number;
        disableSpecular: boolean;
        colorChannel: "hemi1" | "hemi2" | "edge";
        textureChannel: "none" | "hemi1" | "hemi2";
        rotateY180: boolean;
        colorGainR: number;
        colorGainG: number;
        colorGainB: number;
        alphaMul: number;
    }[] = [];
    private visible = false;
    private pos = vec3.create();
    private rotation = quat.create();
    private scale = vec3.create();
    private modelFromBall = mat4.create();
    private modelFromBallRotated = mat4.create();
    private viewFromModelDefault = mat4.create();
    private viewFromModelRotated = mat4.create();
    private hasRotatedSlots = false;
    private hemi1ColorHex = BALL_HEMI1_DEFAULT_COLOR;
    private hemi2ColorHex = BALL_HEMI2_DEFAULT_COLOR;
    private hemi1Color: [number, number, number] = [1, 0, 0];
    private hemi2Color: [number, number, number] = [1, 1, 1];
    private hemi1Texture?: string;
    private hemi2Texture?: string;
    private playerBillboardTexture?: string;
    private playerBillboardModel: ModelInst;
    private spritesheetFrameCountX = 4;
    private spritesheetFrameCountY = 3;
    private lastApeYaw = 0;
    private lastSpeed = 0;
    private hasGoaled = false;
    private animTimer = 0;
    private currentAnimFrame = 0;

    constructor(
        modelCache: ModelCache,
        private resolveTextureMapping: (textureName?: string) => GXTextureMapping | null,
    ) {
        const clearInside = modelCache.getBallModel(CommonModelID.CLEAR_HEMI_INSIDE);
        const clearOutside = modelCache.getBallModel(CommonModelID.CLEAR_HEMI_OUTSIDE);
        const hemi1Inside = clearInside;
        const hemi1Outside = clearOutside;
        const edge = modelCache.getBallModel(CommonModelID.SPHERE_EDGE_01_RED);
        if (clearInside) {
            this.pushSlot(clearInside, 4, true, "hemi2", "hemi2", false, BALL_CLEAR_HEMI_ALPHA_MUL);
        }
        if (hemi1Inside) {
            this.pushSlot(hemi1Inside, 3, true, "hemi1", "hemi1", true, BALL_CLEAR_HEMI_ALPHA_MUL);
        }
        if (edge) {
            this.pushSlot(edge, 2, false, "edge", "none", false, 1.0);
            this.pushSlot(edge, 2, false, "edge", "none", true, 1.0);
        }
        if (clearOutside) {
            this.pushSlot(clearOutside, 1, false, "hemi2", "hemi2", false, BALL_CLEAR_HEMI_ALPHA_MUL);
        }
        if (hemi1Outside) {
            this.pushSlot(hemi1Outside, 0, false, "hemi1", "hemi1", true, BALL_CLEAR_HEMI_ALPHA_MUL);
        }
        if (this.slots.length === 0) {
            const fallbackInside = modelCache.getModel("BALL_INSIDE", GmaSrc.Common);
            const fallbackOutside = modelCache.getModel("BALL_OUTSIDE", GmaSrc.Common);
            if (fallbackInside) {
                this.pushSlot(fallbackInside, 2, true, "hemi1", "hemi1", false, 1.0);
            }
            if (fallbackOutside) {
                this.pushSlot(fallbackOutside, 0, false, "hemi2", "hemi2", false, 1.0);
            }
        }
        writeRgbFromHex(this.hemi1Color, this.hemi1ColorHex);
        writeRgbFromHex(this.hemi2Color, this.hemi2ColorHex);
        this.playerBillboardModel = modelCache.getModel(BALL_PLAYER_CHAR_BILLBOARD_MODEL, GmaSrc.Common);
    }

    private computeSlotColorGains(model: ModelInst): [number, number, number] {
        const materialColor = model.modelData.shapes[0]?.material.materialColor;
        if (!materialColor) {
            return [1, 1, 1];
        }
        const gainR = Math.min(BALL_COLOR_GAIN_MAX, 1 / Math.max(BALL_COLOR_GAIN_EPSILON, materialColor.r));
        const gainG = Math.min(BALL_COLOR_GAIN_MAX, 1 / Math.max(BALL_COLOR_GAIN_EPSILON, materialColor.g));
        const gainB = Math.min(BALL_COLOR_GAIN_MAX, 1 / Math.max(BALL_COLOR_GAIN_EPSILON, materialColor.b));
        return [gainR, gainG, gainB];
    }

    private pushSlot(
        model: ModelInst,
        depthOffset: number,
        disableSpecular: boolean,
        colorChannel: "hemi1" | "hemi2" | "edge",
        textureChannel: "none" | "hemi1" | "hemi2",
        rotateY180: boolean,
        alphaMul: number,
    ): void {
        const [colorGainR, colorGainG, colorGainB] = this.computeSlotColorGains(model);
        this.slots.push({
            model,
            depthOffset,
            disableSpecular,
            colorChannel,
            textureChannel,
            rotateY180,
            colorGainR,
            colorGainG,
            colorGainB,
            alphaMul,
        });
        if (rotateY180) {
            this.hasRotatedSlots = true;
        }
    }

    private updateAppearance(state: BallRenderState): void {
        const appearance = state.appearance;
        const hemi1Color = typeof appearance?.hemi1Color === "string" ? appearance.hemi1Color : BALL_HEMI1_DEFAULT_COLOR;
        const hemi2Color = typeof appearance?.hemi2Color === "string" ? appearance.hemi2Color : BALL_HEMI2_DEFAULT_COLOR;
        if (hemi1Color !== this.hemi1ColorHex) {
            this.hemi1ColorHex = hemi1Color;
            writeRgbFromHex(this.hemi1Color, hemi1Color);
        }
        if (hemi2Color !== this.hemi2ColorHex) {
            this.hemi2ColorHex = hemi2Color;
            writeRgbFromHex(this.hemi2Color, hemi2Color);
        }
        this.hemi1Texture = typeof appearance?.hemi1Texture === "string" ? appearance.hemi1Texture : undefined;
        this.hemi2Texture = typeof appearance?.hemi2Texture === "string" ? appearance.hemi2Texture : undefined;
        this.playerBillboardTexture = typeof appearance?.playerBillboardTexture === "string" ? appearance.playerBillboardTexture : undefined;
    }

    public setState(state: BallRenderState | null): void {
        if (!state) {
            this.visible = false;
            return;
        }
        this.visible = state.visible;
        vec3.set(this.pos, state.pos.x, state.pos.y, state.pos.z);
        quat.set(this.rotation, state.orientation.x, state.orientation.y, state.orientation.z, state.orientation.w);
        const scale = state.radius / BALL_BASE_RADIUS;
        vec3.set(this.scale, scale, scale, scale);
        this.lastSpeed = state.speed;
        this.lastApeYaw = state.apeYaw;
        this.hasGoaled = state.goaled;
        this.updateAppearance(state);
    }

    public prepareToRender(state: WorldState, ctx: RenderContext): void {
        if (!this.visible || this.slots.length === 0) return;

        const rp = scratchRenderParams;
        rp.reset();
        rp.sort = RenderSort.Translucent;
        rp.lighting = state.lighting;
        mat4.fromRotationTranslationScale(this.modelFromBall, this.rotation, this.pos, this.scale);
        const viewFromWorld = ctx.viewFromWorld ?? ctx.viewerInput.camera.viewMatrix;
        mat4.mul(this.viewFromModelDefault, viewFromWorld, this.modelFromBall);
        if (this.hasRotatedSlots) {
            mat4.mul(this.modelFromBallRotated, this.modelFromBall, BALL_HEMI_Y_ROT_180);
            mat4.mul(this.viewFromModelRotated, viewFromWorld, this.modelFromBallRotated);
        }

        for (let i = 0; i < this.slots.length; i++) {
            const slot = this.slots[i];
            rp.depthOffset = slot.depthOffset;
            mat4.copy(rp.viewFromModel, slot.rotateY180 ? this.viewFromModelRotated : this.viewFromModelDefault);
            // Hack: the OG ball's inner shells appear to be unlit by specular.
            rp.disableSpecular = slot.disableSpecular;
            const color =
                slot.colorChannel === "hemi1" || slot.colorChannel === "edge"
                    ? this.hemi1Color
                    : this.hemi2Color;
            rp.colorMul.r = color[0] * slot.colorGainR;
            rp.colorMul.g = color[1] * slot.colorGainG;
            rp.colorMul.b = color[2] * slot.colorGainB;
            rp.colorMul.a = slot.alphaMul;
            let customTexture: GXTextureMapping | null = null;
            if (slot.textureChannel === "hemi1") {
                customTexture = this.resolveTextureMapping(this.hemi1Texture);
            } else if (slot.textureChannel === "hemi2") {
                customTexture = this.resolveTextureMapping(this.hemi2Texture);
            }
            let textureOverride: GXTextureMapping | null = null;
            if (customTexture && customTexture.gfxTexture && customTexture.gfxSampler) {
                textureOverride = customTexture;
            }
            rp.textureOverride = textureOverride;
            rp.textureOverrideForceTex0 = textureOverride !== null;
            slot.model.prepareToRender(ctx, rp);
        }

        // Player texture billboard
        if (this.playerBillboardTexture && this.visible) {
            const renderParams = scratchRenderParams;
            renderParams.reset();
            renderParams.lighting = state.lighting;

            const viewFromWorld = ctx.viewFromWorld ?? ctx.viewerInput.camera.viewMatrix;

            mat4.copy(renderParams.viewFromModel, viewFromWorld);
            mat4.translate(renderParams.viewFromModel, renderParams.viewFromModel, this.pos);

            // Billboard
            const cameraRotY = getMat4RotY(ctx.viewerInput.camera.worldMatrix);
            mat4.rotateY(renderParams.viewFromModel, renderParams.viewFromModel, cameraRotY);

            // Adjust since our model isn't centered in the ball.
            // Y value may need to be tweaked depending on height
            mat4.translate(renderParams.viewFromModel, renderParams.viewFromModel, vec3.fromValues(0, -0.4, 0.33));

            // Scale may need to be tweaked depending on height
            const scale = 0.333;
            mat4.scale(renderParams.viewFromModel, renderParams.viewFromModel, [scale, scale, -scale]);
            
            // Apply player billboard texture
            const customTexture = this.resolveTextureMapping(this.playerBillboardTexture);
            if (customTexture && customTexture.gfxTexture && customTexture.gfxSampler) {
                renderParams.textureOverride = customTexture;
                renderParams.textureOverrideForceTex0 = true;

                if (customTexture.width > 0 && customTexture.height > 0 &&
                    (this.spritesheetFrameCountX > 1 || this.spritesheetFrameCountY > 1)) {

                    const apeYawRad = this.lastApeYaw * S16_TO_RAD;
                    //console.log(`Ape yaw: ${apeYawRad*(180/Math.PI)}, camera angle: ${cameraRotY*(180/Math.PI)} speed: ${this.lastSpeed}`);
                    let apeRelativeToCamRad = apeYawRad - cameraRotY;
                    apeRelativeToCamRad = Math.atan2(Math.sin(apeRelativeToCamRad), Math.cos(apeRelativeToCamRad));
                    const apeRelativeToCamDeg = apeRelativeToCamRad * (180 / Math.PI);
                    //console.log(`Ape yaw: ${apeRelativeToCamDeg} deg`);

                    const forwardThreshold = 7.5; // +- angle to determine whether or not we're going forward
                    const backThreshold = 50.0; // +- angle to determine whether or not we're going backward

                    const minimumSpeed = 0.02; // minimum speed ~2mph
                    const maxSpeed = 0.35; // Full animation speed at 0.5m/frame - ~53mph

                    // 4x3 grid has the following layout (I = idle, M = moving, B = backwards, F = forwards, R = right) (X = falling, G = goaled)
                    // IB, MB1, MB2, IF
                    // MF1, MF2, IR, MR1
                    // MR2, X1, X2, G
                    // this layout was taken from taronuke's mawaru gold marble rolling minigame because I don't know how to sprite sheet!

                    let baseFrame: number;
                    let isMirrored = false;
                    let isFalling = false;

                    // Has goaled (OVERRIDES EVERYTHING ELSE - INCLUDING ANIMATION
                    if (this.hasGoaled) {
                        baseFrame = 11;
                    }
                    // Are we falling, or going way too fast (>200mph)?
                    else if (this.lastSpeed > 1.5 || !state.raycastStageDown(this.pos)) {
                        baseFrame = 9;
                        isFalling = true;
                    }
                    // Forward - also if we're going too fast, just assume that we're going forwards
                    // This is because apeyaw is unreliable above the max speed. TODO: a better way?
                    else if ( (apeRelativeToCamDeg >= -forwardThreshold && apeRelativeToCamDeg <= forwardThreshold) || this.lastSpeed >= maxSpeed) {
                        baseFrame = 3;
                    }
                    // Backwards
                    else if (apeRelativeToCamDeg > backThreshold || apeRelativeToCamDeg < -backThreshold) {
                        baseFrame = 0;
                    }
                    // Left
                    else if (apeRelativeToCamDeg > forwardThreshold && apeRelativeToCamDeg <= backThreshold) {
                        baseFrame = 6;
                        isMirrored = true;
                    }
                    // Right
                    else {
                        baseFrame = 6;
                    }

                    const speedRatio = Math.min(this.lastSpeed, maxSpeed) / maxSpeed;
                    const framesPerSwitch = Math.max(15, Math.round(60.0 * (1.0 - speedRatio)));

                    this.animTimer += 1;
                    if (this.animTimer >= framesPerSwitch) {
                        this.animTimer = 0;
                        this.currentAnimFrame = this.currentAnimFrame === 0 ? 1 : 0;
                    }

                    let animFrameOffset = 0;

                    // Idle or goaled - ignore animation
                    if (!isFalling && (this.lastSpeed < minimumSpeed || this.hasGoaled)) {
                        animFrameOffset = baseFrame;
                    }
                    // Falling animation doesn't have an idle frame
                    else if (isFalling) {
                        animFrameOffset = baseFrame + this.currentAnimFrame;
                    }
                    else {
                        animFrameOffset = baseFrame + this.currentAnimFrame+1;
                    }

                    //console.log(`I: ${frameIndexWithAnim} S: ${this.lastSpeed}, FPS: ${framesPerSwitch}, AF: ${this.currentAnimFrame}, AT: ${this.animTimer}`);

                    let frameU: number;
                    let frameV: number;
                    let uOffset: number;
                    let vOffset: number;
                    let uSize: number;
                    let vSize: number;

                    if (isMirrored) {
                        frameU = animFrameOffset % this.spritesheetFrameCountX;
                        frameV = Math.floor(animFrameOffset / this.spritesheetFrameCountX);
                        uOffset = (frameU + 1) / this.spritesheetFrameCountX;
                        vOffset = (frameV) / this.spritesheetFrameCountY;
                        uSize = -1.0 / this.spritesheetFrameCountX;
                        vSize = 1.0 / this.spritesheetFrameCountY;
                    }
                    else {
                        frameU = animFrameOffset % this.spritesheetFrameCountX;
                        frameV = Math.floor(animFrameOffset / this.spritesheetFrameCountX);
                        uOffset = frameU / this.spritesheetFrameCountX;
                        vOffset = frameV / this.spritesheetFrameCountY;
                        uSize = 1.0 / this.spritesheetFrameCountX;
                        vSize = 1.0 / this.spritesheetFrameCountY;
                    }

                    mat4.translate(renderParams.texMtx2, renderParams.texMtx2, [uOffset, vOffset, 0.0]);
                    mat4.scale(renderParams.texMtx2, renderParams.texMtx2, [uSize, vSize, 1.0]);
                }
                else {
                    mat4.identity(renderParams.texMtx);
                }
            }
            
            renderParams.disableSpecular = true;
            
            this.playerBillboardModel.prepareToRender(ctx, renderParams);
        }
    }
}

export class World {
    private worldState: WorldState;
    private animGroups: AnimGroup[];
    private background: Background;
    private fgObjects: BgObjectInst[] = [];
    private ball: BallInst;
    private balls: BallInst[] = [];
    private ballPos = vec3.create();
    private ballRadius = 0;
    private ballVisible = false;
    private externalTimeFrames: number | null = null;
    private externalDeltaFrames: number = 0;
    private externalStageTimerFrames: number | null = null;
    private externalStageTimeLimitFrames: number | null = null;
    private bananas: BananaRenderState[] | null = null;
    private bananasByGroup: BananaRenderState[][] = [];
    private jamabars: JamabarRenderState[] | null = null;
    private jamabarsByGroup: JamabarRenderState[][] = [];
    private goalBags: GoalBagRenderState[] | null = null;
    private goalBagsByGroup: GoalBagRenderState[][] = [];
    private goalTapes: GoalTapeRenderState[] | null = null;
    private goalTapesByGroup: GoalTapeRenderState[][] = [];
    private confetti: ConfettiRenderState[] | null = null;
    private effects: EffectRenderState[] | null = null;
    private modPrimitives: ModRenderPrimitiveState[] | null = null;
    private switches: SwitchRenderState[] | null = null;
    private switchesByGroup: SwitchRenderState[][] = [];
    private stageTilt: StageTiltRenderState | null = null;
    private nlTextureCache: TextureCache | null = null;
    private nlStageModelCache: Map<string, ModelInterface> | null = null;
    private bonusWaveModel: ModelInterface | null = null;
    private bonusWaveLastLogTime = -1;
    private confettiModels: (ModelInst | null)[];
    private sparkModel: ModelInst | null = null;
    private flashModel: ModelInst | null = null;
    private streakModel: ModelInst | null = null;
    private glowModel: ModelInst | null = null;
    private bonusShotModel: ModelInst | null = null;
    private bonusShotGlowModel: ModelInst | null = null;
    private bonusShotTailModel: ModelInst | null = null;
    private bonusShotTailNlModel: Nl.ModelInst | null = null;
    private sparkleTextureMapping: GXTextureMapping | null = null;
    private sparkleTextureReady = false;
    private goalTapeModel: Nl.DynamicModelInst | null = null;
    private ballPosForTilt = vec3.create();
    private ballPosForTiltPrev = vec3.create();
    private hasBallPosForTilt = false;
    private hasBallPosForTiltPrev = false;
    private shadowProgram!: GfxProgram;
    private shadowTextureMapping = new GXTextureMapping();
    private shadowTextureCache = new TextureCache();
    private shadowTevLayer: TevLayerInst | null = null;
    private shadowLightDir = vec3.create();
    private shadowLightUp = vec3.create();
    private shadowColor = vec4.fromValues(0, 0, 0, 0.4);
    private shadowMegaState = makeMegaState(
        setAttachmentStateSimple({ depthCompare: GfxCompareMode.LEqual, depthWrite: false }, {
            blendMode: GfxBlendMode.Add,
            blendSrcFactor: GfxBlendFactor.SrcAlpha,
            blendDstFactor: GfxBlendFactor.OneMinusSrcAlpha,
            channelWriteMask: GfxChannelWriteMask.RGB,
        })
    );
    private streakProgram!: GfxProgram;
    private streakCutoutProgram!: GfxProgram;
    private streakInputLayout!: GfxInputLayout;
    private streakDefaultTexture = new GXTextureMapping();
    private streakTextureSources = new Map<string, TextureInputGX>();
    private streakTextureMappings = new Map<string, GXTextureMapping>();
    private streakExternalTextureLoading = new Set<string>();
    private streakExternalTextureFailed = new Set<string>();
    private streakExternalTextureOwned = new Set<string>();
    private ballTextureMappings = new Map<string, GXTextureMapping>();
    private ballExternalTextureLoading = new Set<string>();
    private ballExternalTextureFailed = new Set<string>();
    private ballExternalTextureOwned = new Set<string>();
    private streakHistory = new Map<number, { older: vec3; prev: vec3; lastUpdate: number }>();
    private prevViewFromWorld = mat4.create();
    private lastViewFromWorld = mat4.create();
    private hasPrevViewFromWorld = false;
    private streakMegaState = makeMegaState(
        setAttachmentStateSimple({ depthWrite: false, cullMode: GfxCullMode.None }, {
            blendMode: GfxBlendMode.Add,
            blendSrcFactor: GfxBlendFactor.SrcAlpha,
            blendDstFactor: GfxBlendFactor.One,
            channelWriteMask: GfxChannelWriteMask.RGBA,
        })
    );
    private ribbonAlphaMegaState = makeMegaState(
        setAttachmentStateSimple({ depthWrite: false, cullMode: GfxCullMode.None }, {
            blendMode: GfxBlendMode.Add,
            blendSrcFactor: GfxBlendFactor.SrcAlpha,
            blendDstFactor: GfxBlendFactor.OneMinusSrcAlpha,
            channelWriteMask: GfxChannelWriteMask.RGBA,
        })
    );
    private ribbonAddMegaState = makeMegaState(
        setAttachmentStateSimple({ depthWrite: false, cullMode: GfxCullMode.None }, {
            blendMode: GfxBlendMode.Add,
            blendSrcFactor: GfxBlendFactor.SrcAlpha,
            blendDstFactor: GfxBlendFactor.One,
            channelWriteMask: GfxChannelWriteMask.RGBA,
        })
    );
    private ribbonAlphaNoDepthMegaState = makeMegaState(
        setAttachmentStateSimple({ depthWrite: false, depthCompare: GfxCompareMode.Always, cullMode: GfxCullMode.None }, {
            blendMode: GfxBlendMode.Add,
            blendSrcFactor: GfxBlendFactor.SrcAlpha,
            blendDstFactor: GfxBlendFactor.OneMinusSrcAlpha,
            channelWriteMask: GfxChannelWriteMask.RGBA,
        })
    );
    private ribbonAddNoDepthMegaState = makeMegaState(
        setAttachmentStateSimple({ depthWrite: false, depthCompare: GfxCompareMode.Always, cullMode: GfxCullMode.None }, {
            blendMode: GfxBlendMode.Add,
            blendSrcFactor: GfxBlendFactor.SrcAlpha,
            blendDstFactor: GfxBlendFactor.One,
            channelWriteMask: GfxChannelWriteMask.RGBA,
        })
    );
    private ribbonCutoutMegaState = makeMegaState(
        setAttachmentStateSimple({ depthWrite: true, cullMode: GfxCullMode.None }, {
            blendMode: GfxBlendMode.Add,
            blendSrcFactor: GfxBlendFactor.One,
            blendDstFactor: GfxBlendFactor.Zero,
            channelWriteMask: GfxChannelWriteMask.RGBA,
        })
    );
    private mirrorFlatProgram!: GfxProgram;
    private mirrorWavyProgram!: GfxProgram;
    private mirrorDistortProgram!: GfxProgram;
    private mirrorColorMapping = new GXTextureMapping();
    private mirrorDistortMapping = new GXTextureMapping();
    private mirrorGradMapping = new GXTextureMapping();
    private wormholeScreenOverlayWarpMapping = new GXTextureMapping();
    private mirrorGradOwnsTexture = false;
    private mirrorModelNames = new Set<string>();
    private wormholeSurfaceProgram!: GfxProgram;
    private wormholeColorMapping = new GXTextureMapping();
    private wormholeSurfaceModel: ModelInst | null = null;
    private wormholeInfos: WormholeRenderInfo[] = [];
    private wormholeInfoById = new Map<number, WormholeRenderInfo>();
    private smb2Stage340Models: (ModelInst | null)[] | null = null;
    private revolutionModels: RevolutionStageModels | null = null;
    private mirrorFlatMegaState = makeMegaState(
        setAttachmentStateSimple({ depthWrite: false }, {
            blendMode: GfxBlendMode.Add,
            blendSrcFactor: GfxBlendFactor.SrcAlpha,
            blendDstFactor: GfxBlendFactor.OneMinusSrcAlpha,
            channelWriteMask: GfxChannelWriteMask.RGBA,
        })
    );
    private mirrorWavyMegaState = makeMegaState(
        setAttachmentStateSimple({ depthWrite: false }, {
            blendMode: GfxBlendMode.Add,
            blendSrcFactor: GfxBlendFactor.SrcAlpha,
            blendDstFactor: GfxBlendFactor.OneMinusSrcAlpha,
            channelWriteMask: GfxChannelWriteMask.RGBA,
        })
    );
    private mirrorDistortMegaState = makeMegaState(
        setAttachmentStateSimple({ depthWrite: true, cullMode: GfxCullMode.Back }, {
            blendMode: GfxBlendMode.Add,
            blendSrcFactor: GfxBlendFactor.One,
            blendDstFactor: GfxBlendFactor.Zero,
            channelWriteMask: GfxChannelWriteMask.RGBA,
        })
    );
    private wormholeSurfaceMegaState = makeMegaState(
        setAttachmentStateSimple({ depthWrite: true, depthCompare: reverseDepthForCompareMode(GfxCompareMode.LessEqual), cullMode: GfxCullMode.None }, {
            blendMode: GfxBlendMode.Add,
            blendSrcFactor: GfxBlendFactor.SrcAlpha,
            blendDstFactor: GfxBlendFactor.OneMinusSrcAlpha,
            channelWriteMask: GfxChannelWriteMask.RGBA,
        })
    );
    private initSparkleTexture(device: GfxDevice): void {
        const mapping = new GXTextureMapping();
        const samplerDesc: GfxSamplerDescriptor = {
            wrapS: GfxWrapMode.Clamp,
            wrapT: GfxWrapMode.Clamp,
            minFilter: GfxTexFilterMode.Bilinear,
            magFilter: GfxTexFilterMode.Bilinear,
            mipFilter: GfxMipFilterMode.Nearest,
            minLOD: 0,
            maxLOD: 0,
        };
        mapping.gfxSampler = device.createSampler(samplerDesc);
        this.sparkleTextureMapping = mapping;

        if (typeof Image === "undefined") {
            console.warn("[sparkle] Image not available; skipping texture load");
            return;
        }
        const img = new Image();
        img.onload = () => {
            const width = img.naturalWidth || img.width;
            const height = img.naturalHeight || img.height;
            if (!width || !height) {
                return;
            }
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                return;
            }
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            const tex = device.createTexture(makeTextureDescriptor2D(GfxFormat.U8_RGBA_NORM, width, height, 1));
            const imageData = ctx.getImageData(0, 0, width, height);
            const pixels = new Uint8Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength);
            device.uploadTextureData(tex, 0, [pixels]);
            if (mapping.gfxTexture) {
                device.destroyTexture(mapping.gfxTexture);
            }
            mapping.gfxTexture = tex;
            mapping.width = width;
            mapping.height = height;
            mapping.flipY = false;
            this.sparkleTextureReady = true;
        };
        img.onerror = () => {
            console.warn("[sparkle] failed to load texture", SPARKLE_TEXTURE_PATH);
        };
        img.src = SPARKLE_TEXTURE_PATH;
    }
    private effectDepthState = { depthWrite: false, cullMode: GfxCullMode.None };
    private glowMegaState = makeMegaState(
        setAttachmentStateSimple({ depthWrite: false, cullMode: GfxCullMode.None }, {
            blendMode: GfxBlendMode.Add,
            blendSrcFactor: GfxBlendFactor.SrcAlpha,
            blendDstFactor: GfxBlendFactor.One,
            channelWriteMask: GfxChannelWriteMask.RGB,
        })
    );
    private flashMegaState = makeMegaState(
        setAttachmentStateSimple({
            depthCompare: GfxCompareMode.LessEqual,
            depthWrite: false,
            cullMode: GfxCullMode.None,
            polygonOffset: true,
        }, {
            blendMode: GfxBlendMode.Add,
            blendSrcFactor: GfxBlendFactor.SrcAlpha,
            blendDstFactor: GfxBlendFactor.One,
            channelWriteMask: GfxChannelWriteMask.RGB,
        })
    );

    constructor(device: GfxDevice, private renderCache: GfxRenderCache, private stageData: StageData) {
        const lighting = new Lighting(stageData.stageInfo.bgInfo);
        this.worldState = {
            modelCache: new ModelCache(device, renderCache, stageData),
            time: new MkbTime(60), // TODO(complexplane): Per-stage time limit
            lighting,
            lightingGroups: new LightingGroups(lighting),
            raycastStageDown: (pos: vec3) => this.raycastStageDown(pos),
        };
        let goalTimerDigits: GoalTimerDigits | null = null;
        const smallDigits: (ModelInterface | null)[] = [];
        const largeDigits: (ModelInterface | null)[] = [];
        let hasGoalTimerDigit = false;
        for (let i = 0; i < 10; i++) {
            const small = this.worldState.modelCache.getGoalTimerDigitModel("small", i);
            const large = this.worldState.modelCache.getGoalTimerDigitModel("large", i);
            smallDigits.push(small);
            largeDigits.push(large);
            hasGoalTimerDigit ||= small !== null || large !== null;
        }
        if (hasGoalTimerDigit) {
            goalTimerDigits = { small: smallDigits, large: largeDigits };
        }

        const hasStageNlObj = (stageData.stageNlObj?.size ?? 0) > 0;
        if (stageData.nlObj.size > 0 || hasStageNlObj) {
            this.nlTextureCache = new TextureCache();
            const nlSmallDigits: (ModelInterface | null)[] = [];
            const nlLargeDigits: (ModelInterface | null)[] = [];
            let hasNlGoalTimerDigit = false;
            for (let i = 0; i < 10; i++) {
                const small = getNlModelInst(
                    device,
                    renderCache,
                    stageData.nlObj,
                    this.nlTextureCache,
                    CommonNlModelID.S_LCD_0 + i
                );
                const large = getNlModelInst(
                    device,
                    renderCache,
                    stageData.nlObj,
                    this.nlTextureCache,
                    CommonNlModelID.L_LCD_0 + i
                );
                nlSmallDigits.push(small);
                nlLargeDigits.push(large);
                hasNlGoalTimerDigit ||= small !== null || large !== null;
            }
            if (hasNlGoalTimerDigit) {
                if (!goalTimerDigits) {
                    goalTimerDigits = { small: nlSmallDigits, large: nlLargeDigits };
                } else {
                    for (let i = 0; i < 10; i++) {
                        goalTimerDigits.small[i] ??= nlSmallDigits[i];
                        goalTimerDigits.large[i] ??= nlLargeDigits[i];
                    }
                }
            }

            const tapeModelData = getGoalTapeModelData(stageData);
            if (tapeModelData) {
                this.goalTapeModel = new Nl.DynamicModelInst(
                    device,
                    renderCache,
                    tapeModelData,
                    this.nlTextureCache,
                    "goal-tape"
                );
            }
        }

        const usesSmb2Models = stageData.gameSource === 'smb2' || stageData.gameSource === 'mb2ws';
        const goalBagModels: GoalBagModels = {
            closed: usesSmb2Models
                ? this.worldState.modelCache.getModel("NEW_SCENT_BAG_WHOLE", GmaSrc.Common)
                : this.worldState.modelCache.getModel(CommonModelID.NEW_SCENT_BAG_WHOLE, GmaSrc.Common),
            openA: usesSmb2Models
                ? this.worldState.modelCache.getModel("NEW_SCENT_BAG_A", GmaSrc.Common)
                : this.worldState.modelCache.getModel(CommonModelID.NEW_SCENT_BAG_A, GmaSrc.Common),
            openB: usesSmb2Models
                ? this.worldState.modelCache.getModel("NEW_SCENT_BAG_B", GmaSrc.Common)
                : this.worldState.modelCache.getModel(CommonModelID.NEW_SCENT_BAG_B, GmaSrc.Common),
        };
        this.confettiModels = [
            usesSmb2Models
                ? this.worldState.modelCache.getModel("PAPER_PIECE_DEEPGREEN", GmaSrc.Common)
                : this.worldState.modelCache.getModel(CommonModelID.PAPER_PIECE_DEEPGREEN, GmaSrc.Common),
            usesSmb2Models
                ? this.worldState.modelCache.getModel("PAPER_PIECE_GREEN", GmaSrc.Common)
                : this.worldState.modelCache.getModel(CommonModelID.PAPER_PIECE_GREEN, GmaSrc.Common),
            usesSmb2Models
                ? this.worldState.modelCache.getModel("PAPER_PIECE_ORANGE", GmaSrc.Common)
                : this.worldState.modelCache.getModel(CommonModelID.PAPER_PIECE_ORANGE, GmaSrc.Common),
            usesSmb2Models
                ? this.worldState.modelCache.getModel("PAPER_PIECE_RED", GmaSrc.Common)
                : this.worldState.modelCache.getModel(CommonModelID.PAPER_PIECE_RED, GmaSrc.Common),
            usesSmb2Models
                ? this.worldState.modelCache.getModel("PAPER_PIECE_YELLOW", GmaSrc.Common)
                : this.worldState.modelCache.getModel(CommonModelID.PAPER_PIECE_YELLOW, GmaSrc.Common),
        ];
        this.sparkModel = usesSmb2Models
            ? this.worldState.modelCache.getModel("CRASH_STAR", GmaSrc.Common)
            : this.worldState.modelCache.getModel(CommonModelID.CRASH_STAR, GmaSrc.Common);
        const isSkyTheme =
            usesSmb2Models &&
            stageData.stageInfo.bgInfo.fileName.length > 0 &&
            stageData.stageInfo.bgInfo.fileName.startsWith("bg_spa");
        if (usesSmb2Models) {
            const flashName = isSkyTheme ? "circle_white2_half" : "circle_white2";
            this.flashModel =
                this.worldState.modelCache.getModel(flashName, GmaSrc.Common) ??
                this.worldState.modelCache.getModel("circle_white2", GmaSrc.Common);
        } else {
            this.flashModel = this.worldState.modelCache.getModel(CommonModelID.CRASH_FLASH, GmaSrc.Common);
        }
        this.streakModel = usesSmb2Models
            ? this.worldState.modelCache.getModel("circle_white2", GmaSrc.Common)
            : this.worldState.modelCache.getModel(CommonModelID.circle_white2, GmaSrc.Common);
        if (!this.streakModel) {
            this.streakModel = usesSmb2Models
                ? this.worldState.modelCache.getModel("circle_white", GmaSrc.Common)
                : this.worldState.modelCache.getModel(CommonModelID.circle_white, GmaSrc.Common);
        }
        this.glowModel = usesSmb2Models
            ? this.worldState.modelCache.getModel("circle_white2", GmaSrc.Common)
            : this.worldState.modelCache.getModel(CommonModelID.circle_white2, GmaSrc.Common);
        if (!this.glowModel) {
            this.glowModel = usesSmb2Models
                ? this.worldState.modelCache.getModel("circle_white", GmaSrc.Common)
                : this.worldState.modelCache.getModel(CommonModelID.circle_white, GmaSrc.Common);
        }
        this.bonusShotModel = this.worldState.modelCache.getModel("BNS_SHOTSTAR", GmaSrc.Bg);
        const bonusStarlightName = this.worldState.modelCache
            .getModelNames(GmaSrc.Bg)
            .find((name) => name.startsWith("STARLIGHT_"));
        if (bonusStarlightName) {
            this.bonusShotGlowModel = this.worldState.modelCache.getModel(bonusStarlightName, GmaSrc.Bg);
        }
        // SMB1 uses the common NL model CROSS_LIGHT for the shooting-star tail.
        // SMB2/MB2WS uses common.gma model index 0x26.
        if (usesSmb2Models) {
            this.bonusShotTailModel =
                this.worldState.modelCache.getModel(0x26, GmaSrc.Common) ??
                this.worldState.modelCache.getModel("CROSS_LIGHT", GmaSrc.Common) ??
                this.worldState.modelCache.getModel("CRASH_STAR", GmaSrc.Common);
        } else if (this.nlTextureCache && stageData.nlObj.size > 0) {
            this.bonusShotTailNlModel = getNlModelInst(
                device,
                renderCache,
                stageData.nlObj,
                this.nlTextureCache,
                CommonNlModelID.CROSS_LIGHT,
            );
            this.bonusShotTailModel =
                this.worldState.modelCache.getModel("CRASH_STAR", GmaSrc.Common);
        } else {
            this.bonusShotTailModel =
                this.worldState.modelCache.getModel("CRASH_STAR", GmaSrc.Common);
        }
        this.initSparkleTexture(device);

        const nlStageModels = hasStageNlObj && this.nlTextureCache && stageData.stageNlObjNameMap
            ? {
                obj: stageData.stageNlObj!,
                nameMap: stageData.stageNlObjNameMap,
                textureCache: this.nlTextureCache,
                nameList: Array.from(stageData.stageNlObjNameMap.keys()),
            }
            : null;
        const resolveStageModel = nlStageModels
            ? (name: string) => {
                if (!this.nlStageModelCache) {
                    this.nlStageModelCache = new Map();
                }
                const cached = this.nlStageModelCache.get(name);
                if (cached) {
                    return cached;
                }
                let modelIndex = nlStageModels.nameMap.get(name);
                if (modelIndex === undefined) {
                    modelIndex = nlStageModels.nameMap.get(`${name}_MAP`);
                }
                if (modelIndex === undefined) {
                    let bestName: string | null = null;
                    let bestLen = 0;
                    for (const candidate of nlStageModels.nameList) {
                        if (!candidate.startsWith(name)) {
                            continue;
                        }
                        if (candidate.length > bestLen) {
                            bestName = candidate;
                            bestLen = candidate.length;
                        }
                    }
                    if (bestName) {
                        modelIndex = nlStageModels.nameMap.get(bestName);
                    }
                }
                if (modelIndex === undefined) {
                    return null;
                }
                const modelData = nlStageModels.obj.get(modelIndex);
                if (!modelData) {
                    return null;
                }
                const inst = new Nl.ModelInst(device, renderCache, modelData, nlStageModels.textureCache);
                this.nlStageModelCache.set(name, inst);
                return inst;
            }
            : null;
        if (stageData.stageInfo.id === StageId.St092_Bonus_Wave && resolveStageModel) {
            this.bonusWaveModel = resolveStageModel(BONUS_WAVE_MODEL_NAME);
            if (this.bonusWaveModel) {
                this.bonusWaveModel.setMaterialHacks(createBonusWaveMaterialHacks());
                if ("setForceCullMode" in this.bonusWaveModel) {
                    this.bonusWaveModel.setForceCullMode(GfxCullMode.None);
                }
            }
        }
        if (stageData.stageInfo.id === SMB2_STAGE_340_ID) {
            this.smb2Stage340Models = new Array(SMB2_STAGE_340_MODEL_DRAWS.length);
            for (let i = 0; i < SMB2_STAGE_340_MODEL_DRAWS.length; i++) {
                this.smb2Stage340Models[i] = this.worldState.modelCache.getModel(SMB2_STAGE_340_MODEL_DRAWS[i][0], GmaSrc.Stage);
            }
        }
        if (stageData.stageInfo.id === SMB2_REVOLUTION_STAGE_ID) {
            this.revolutionModels = {
                floor1: this.worldState.modelCache.getModel(3, GmaSrc.Stage),
                floor2: this.worldState.modelCache.getModel(4, GmaSrc.Stage),
                floor3: this.worldState.modelCache.getModel(5, GmaSrc.Stage),
                wallLeft: this.worldState.modelCache.getModel(6, GmaSrc.Stage),
                wallRight: this.worldState.modelCache.getModel(7, GmaSrc.Stage),
            };
        }
        this.animGroups = stageData.stagedef.animGroups.map(
            (_, i) =>
                new AnimGroup(
                    this.worldState.modelCache,
                    stageData,
                    i,
                    goalTimerDigits,
                    goalBagModels,
                    this.goalTapeModel,
                    resolveStageModel
                )
        );
        this.wormholeSurfaceModel =
            this.worldState.modelCache.getWormholeSurfaceModel()
            ?? this.worldState.modelCache.getWormholeModel();
        let fallbackWormholeId = 1;
        for (let groupIndex = 0; groupIndex < stageData.stagedef.animGroups.length; groupIndex++) {
            const group = stageData.stagedef.animGroups[groupIndex];
            for (const wormhole of group.wormholes ?? []) {
                const wormholeId = wormhole.wormholeId ?? fallbackWormholeId++;
                const existing = this.wormholeInfoById.get(wormholeId);
                if (existing) {
                    if (existing.destId === null && wormhole.destWormholeId !== undefined) {
                        existing.destId = wormhole.destWormholeId ?? null;
                    }
                    continue;
                }
                const info: WormholeRenderInfo = {
                    id: wormholeId,
                    destId: wormhole.destWormholeId ?? null,
                    animGroupIndex: wormhole.animGroupIndex ?? groupIndex,
                    pos: vec3.clone(wormhole.pos),
                    rot: vec3.clone(wormhole.rot),
                };
                this.wormholeInfoById.set(wormholeId, info);
                this.wormholeInfos.push(info);
            }
        }
        const mirrors = stageData.stagedef.mirrors ?? [];
        for (const mirror of mirrors) {
            this.mirrorModelNames.add(mirror.modelName);
        }
        for (let i = 0; i < this.animGroups.length; i++) {
            const names = this.animGroups[i].agData.mirrorModelNames ?? [];
            for (let j = 0; j < names.length; j++) {
                this.mirrorModelNames.add(names[j]);
            }
        }
        this.bananasByGroup = new Array(this.animGroups.length);
        this.jamabarsByGroup = new Array(this.animGroups.length);
        this.goalBagsByGroup = new Array(this.animGroups.length);
        this.goalTapesByGroup = new Array(this.animGroups.length);
        this.switchesByGroup = new Array(this.animGroups.length);
        for (let i = 0; i < this.animGroups.length; i++) {
            this.bananasByGroup[i] = [];
            this.jamabarsByGroup[i] = [];
            this.goalBagsByGroup[i] = [];
            this.goalTapesByGroup[i] = [];
            this.switchesByGroup[i] = [];
        }

        const bgObjects: BgObjectInst[] = [];
        for (const bgObject of stageData.stagedef.bgObjects) {
            if (!(bgObject.flags & SD.BgModelFlags.Visible)) continue;
            const model = this.worldState.modelCache.getModel(bgObject.modelName, GmaSrc.StageAndBg);
            if (model === null) continue;
            bgObjects.push(new BgObjectInst(model, bgObject));
        }
        const fgObjects: BgObjectInst[] = [];
        for (const fgObject of stageData.stagedef.fgObjects) {
            if (!(fgObject.flags & SD.BgModelFlags.Visible)) continue;
            const model = this.worldState.modelCache.getModel(fgObject.modelName, GmaSrc.StageAndBg);
            if (model === null) continue;
            fgObjects.push(new BgObjectInst(model, fgObject));
        }
        this.background = new stageData.stageInfo.bgInfo.bgConstructor(this.worldState, bgObjects);
        this.fgObjects = fgObjects;
        this.ball = new BallInst(this.worldState.modelCache, (textureName) => this.getBallTextureMapping(textureName));
        this.balls = [this.ball];
        this.shadowProgram = createShadowProgram(renderCache);
        this.shadowMegaState.depthWrite = false;
        this.streakProgram = createStreakProgram(renderCache);
        this.streakCutoutProgram = createStreakCutoutProgram(renderCache);
        this.mirrorFlatProgram = createMirrorFlatProgram(renderCache);
        this.mirrorWavyProgram = createMirrorWavyProgram(renderCache);
        this.mirrorDistortProgram = createMirrorDistortProgram(renderCache);
        this.wormholeSurfaceProgram = createWormholeSurfaceProgram(renderCache);
        const streakInputLayoutDesc: GfxInputLayoutDescriptor = {
            vertexBufferDescriptors: [
                { byteStride: STREAK_VERTEX_SIZE, frequency: GfxVertexBufferFrequency.PerVertex },
            ],
            vertexAttributeDescriptors: [
                { location: 0, bufferIndex: 0, format: GfxFormat.F32_RGB, bufferByteOffset: 0 },
                { location: 1, bufferIndex: 0, format: GfxFormat.U8_RGBA_NORM, bufferByteOffset: 12 },
                { location: 2, bufferIndex: 0, format: GfxFormat.F32_RG, bufferByteOffset: 16 },
            ],
            indexBufferFormat: null,
        };
        this.streakInputLayout = renderCache.createInputLayout(streakInputLayoutDesc);
        const streakSamplerDesc: GfxSamplerDescriptor = {
            wrapS: GfxWrapMode.Clamp,
            wrapT: GfxWrapMode.Clamp,
            minFilter: GfxTexFilterMode.Bilinear,
            magFilter: GfxTexFilterMode.Bilinear,
            mipFilter: GfxMipFilterMode.Nearest,
            minLOD: 0,
            maxLOD: 0,
        };
        this.streakDefaultTexture.gfxTexture = makeSolidColorTexture2D(device, { r: 1, g: 1, b: 1, a: 1 });
        this.streakDefaultTexture.gfxSampler = device.createSampler(streakSamplerDesc);
        this.streakDefaultTexture.width = 1;
        this.streakDefaultTexture.height = 1;
        this.initSparkleTexture(device);
        const mirrorSamplerDesc: GfxSamplerDescriptor = {
            wrapS: GfxWrapMode.Clamp,
            wrapT: GfxWrapMode.Clamp,
            minFilter: GfxTexFilterMode.Bilinear,
            magFilter: GfxTexFilterMode.Bilinear,
            mipFilter: GfxMipFilterMode.Nearest,
            minLOD: 0,
            maxLOD: 0,
        };
        this.mirrorColorMapping.gfxSampler = device.createSampler(mirrorSamplerDesc);
        this.mirrorColorMapping.lateBinding = "mirror-color";
        this.mirrorDistortMapping.gfxSampler = device.createSampler(mirrorSamplerDesc);
        this.mirrorDistortMapping.lateBinding = "mirror-distort";
        this.wormholeColorMapping.gfxSampler = device.createSampler(mirrorSamplerDesc);
        this.wormholeColorMapping.lateBinding = "wormhole-color";
        this.mirrorGradMapping.gfxSampler = device.createSampler(mirrorSamplerDesc);
        this.wormholeScreenOverlayWarpMapping.gfxSampler = device.createSampler(mirrorSamplerDesc);
        const mirrorGradModel = stageData.commonGma.idMap.get(CommonModelID.gb_grad);
        const mirrorGradTex = mirrorGradModel?.tevLayers[0]?.gxTexture ?? null;
        if (mirrorGradTex) {
            this.worldState.modelCache.fillTextureMappingFromGxTexture(mirrorGradTex, this.mirrorGradMapping);
        } else {
            this.mirrorGradMapping.gfxTexture = makeSolidColorTexture2D(device, { r: 1, g: 1, b: 1, a: 1 });
            this.mirrorGradMapping.width = 1;
            this.mirrorGradMapping.height = 1;
            this.mirrorGradOwnsTexture = true;
        }
        const wormholeOverlayWarpModel =
            stageData.commonGma.nameMap.get(SMB2_WORMHOLE_OVERLAY_WARP_MODEL_NAME) ??
            stageData.commonGma.idMap.get(SMB2_WORMHOLE_OVERLAY_WARP_MODEL_ID);
        const wormholeOverlayWarpTex = wormholeOverlayWarpModel?.tevLayers[0]?.gxTexture ?? null;
        if (wormholeOverlayWarpTex) {
            this.worldState.modelCache.fillTextureMappingFromGxTexture(
                wormholeOverlayWarpTex,
                this.wormholeScreenOverlayWarpMapping,
            );
        }
        collectStreakTextures(this.streakTextureSources, stageData.stageGma);
        collectStreakTextures(this.streakTextureSources, stageData.bgGma);
        collectStreakTextures(this.streakTextureSources, stageData.commonGma);

        const lightRotX = S16_TO_RADIANS * stageData.stageInfo.bgInfo.infLightRotX;
        const lightRotY = S16_TO_RADIANS * stageData.stageInfo.bgInfo.infLightRotY;
        vec3.set(this.shadowLightDir, 0, 0, -1);
        vec3.rotateX(this.shadowLightDir, this.shadowLightDir, Vec3Zero, lightRotX);
        vec3.rotateY(this.shadowLightDir, this.shadowLightDir, Vec3Zero, lightRotY);
        vec3.normalize(this.shadowLightDir, this.shadowLightDir);
        vec3.set(this.shadowLightUp, 0, 1, 0);
        vec3.rotateX(this.shadowLightUp, this.shadowLightUp, Vec3Zero, lightRotX);
        vec3.rotateY(this.shadowLightUp, this.shadowLightUp, Vec3Zero, lightRotY);

        const shadowModel = usesSmb2Models
            ? stageData.commonGma.nameMap.get("circle_white")
            : stageData.commonGma.idMap.get(CommonModelID.circle_white);
        const shadowTev = shadowModel?.tevLayers[0];
        if (shadowTev) {
            this.shadowTevLayer = new TevLayerInst(device, renderCache, shadowTev, this.shadowTextureCache);
            this.shadowTevLayer.fillTextureMapping(this.shadowTextureMapping);
        }
    }

    public setExternalTimeFrames(timeFrames: number, deltaFrames: number): void {
        this.externalTimeFrames = timeFrames;
        this.externalDeltaFrames = deltaFrames;
    }

    public setExternalStageClock(
        stageTimerFrames: number | null | undefined,
        stageTimeLimitFrames: number | null | undefined
    ): void {
        if (stageTimerFrames !== undefined) {
            this.externalStageTimerFrames = stageTimerFrames;
        }
        if (stageTimeLimitFrames !== undefined) {
            this.externalStageTimeLimitFrames = stageTimeLimitFrames;
        }
    }

    public setBananaCollectedByAnimGroup(collectedByAnimGroup: boolean[][]): void {
        for (let i = 0; i < this.animGroups.length; i++) {
            const collected = collectedByAnimGroup[i];
            if (collected) {
                this.animGroups[i].setBananaCollected(collected);
            }
        }
    }

    public setBallState(state: BallRenderState | null): void {
        this.ball.setState(state);
        if (state) {
            if (this.hasBallPosForTilt) {
                vec3.copy(this.ballPosForTiltPrev, this.ballPosForTilt);
                this.hasBallPosForTiltPrev = true;
            }
            this.ballVisible = state.visible;
            this.ballRadius = state.radius;
            vec3.set(this.ballPos, state.pos.x, state.pos.y, state.pos.z);
            vec3.set(this.ballPosForTilt, state.pos.x, state.pos.y, state.pos.z);
            this.hasBallPosForTilt = true;
        } else {
            this.hasBallPosForTilt = false;
            this.hasBallPosForTiltPrev = false;
            this.ballVisible = false;
            this.ballRadius = 0;
        }
    }

    public setBallsState(states: BallRenderState[] | null): void {
        if (!states || states.length === 0) {
            this.balls = [this.ball];
            this.ball.setState(null);
            this.hasBallPosForTilt = false;
            this.hasBallPosForTiltPrev = false;
            this.ballVisible = false;
            this.ballRadius = 0;
            return;
        }
        if (this.balls.length !== states.length) {
            this.balls = new Array(states.length);
            for (let i = 0; i < states.length; i++) {
                this.balls[i] = new BallInst(this.worldState.modelCache, (textureName) => this.getBallTextureMapping(textureName));
            }
        }
        let primary: BallRenderState | null = null;
        for (let i = 0; i < states.length; i++) {
            const state = states[i];
            this.balls[i].setState(state);
            if (!primary && state.visible) {
                primary = state;
            }
        }
        if (!primary) {
            primary = states[0];
        }
        if (primary) {
            if (this.hasBallPosForTilt) {
                vec3.copy(this.ballPosForTiltPrev, this.ballPosForTilt);
                this.hasBallPosForTiltPrev = true;
            }
            this.ballVisible = primary.visible;
            this.ballRadius = primary.radius;
            vec3.set(this.ballPos, primary.pos.x, primary.pos.y, primary.pos.z);
            vec3.set(this.ballPosForTilt, primary.pos.x, primary.pos.y, primary.pos.z);
            this.hasBallPosForTilt = true;
        } else {
            this.hasBallPosForTilt = false;
            this.hasBallPosForTiltPrev = false;
            this.ballVisible = false;
            this.ballRadius = 0;
        }
    }

    public update(viewerInput: Viewer.ViewerRenderInput): void {
        if (this.externalTimeFrames !== null) {
            this.worldState.time.overrideTimeFrames(this.externalTimeFrames, this.externalDeltaFrames);
        } else {
            this.worldState.time.updateDeltaTimeSeconds(viewerInput.deltaTime / 1000);
        }
        this.worldState.time.setExternalStageClock(this.externalStageTimerFrames, this.externalStageTimeLimitFrames);
        if (this.hasPrevViewFromWorld) {
            mat4.copy(this.prevViewFromWorld, this.lastViewFromWorld);
        } else {
            mat4.copy(this.prevViewFromWorld, viewerInput.camera.viewMatrix);
            this.hasPrevViewFromWorld = true;
        }
        mat4.copy(this.lastViewFromWorld, viewerInput.camera.viewMatrix);
        for (let i = 0; i < this.animGroups.length; i++) {
            this.animGroups[i].update(this.worldState);
        }
        this.background.update(this.worldState);
        for (let i = 0; i < this.fgObjects.length; i++) {
            this.fgObjects[i].update(this.worldState);
        }
        this.worldState.lightingGroups.update(viewerInput);
    }

    public prepareToRender(ctx: RenderContext): void {
        const bgOpaqueInstList = ctx.bgOpaqueInstList ?? ctx.opaqueInstList;
        const bgTranslucentInstList = ctx.bgTranslucentInstList ?? ctx.translucentInstList;
        const skipStageGeometry = !!ctx.skipStageGeometry;
        const skipBackground = !!ctx.skipBackground;
        const stageCtx = ctx.forceAlphaWrite
            ? ctx
            : {
                ...ctx,
                forceAlphaWrite: true,
            };
        const bgCtx =
            bgOpaqueInstList === ctx.opaqueInstList && bgTranslucentInstList === ctx.translucentInstList
                ? ctx
                : {
                    ...ctx,
                    opaqueInstList: bgOpaqueInstList,
                    translucentInstList: bgTranslucentInstList,
                };
        const viewFromWorld = ctx.viewerInput.camera.viewMatrix;
        const viewFromWorldTilted = ctx.skipStageTilt
            ? viewFromWorld
            : this.getTiltedViewMatrix(viewFromWorld, scratchTiltedView);
        const viewFromWorldPrev = this.hasPrevViewFromWorld
            ? (ctx.skipStageTilt
                ? this.prevViewFromWorld
                : this.getTiltedViewMatrix(
                    this.prevViewFromWorld,
                    scratchTiltedViewPrev,
                    this.hasBallPosForTiltPrev ? this.ballPosForTiltPrev : this.ballPosForTilt,
                  ))
            : viewFromWorldTilted;
        const tiltParams = this.stageTilt && this.hasBallPosForTilt
            ? {
                rotX: this.stageTilt.xrot * STAGE_TILT_SCALE * S16_TO_RADIANS,
                rotZ: this.stageTilt.zrot * STAGE_TILT_SCALE * S16_TO_RADIANS,
                pivot: this.ballPosForTilt,
            }
            : null;
        const bananasByGroup = this.bananas ? this.bananasByGroup : null;
        const jamabarsByGroup = this.jamabars ? this.jamabarsByGroup : null;
        const goalBagsByGroup = this.goalBags ? this.goalBagsByGroup : null;
        const goalTapesByGroup = this.goalTapes ? this.goalTapesByGroup : null;
        const switchesByGroup = this.switches ? this.switchesByGroup : null;
        let skipModelNames: Set<string> | undefined = ctx.skipMirrorModels ? this.mirrorModelNames : undefined;
        if (ctx.mirrorCapture && this.stageData.stageInfo.id === StageId.St092_Bonus_Wave) {
            if (skipModelNames) {
                if (!skipModelNames.has(BONUS_WAVE_MODEL_NAME)) {
                    skipModelNames = new Set(skipModelNames);
                    skipModelNames.add(BONUS_WAVE_MODEL_NAME);
                }
            } else {
                skipModelNames = new Set<string>([BONUS_WAVE_MODEL_NAME]);
            }
        }
        if (!skipStageGeometry) {
            for (let i = 0; i < this.animGroups.length; i++) {
                this.animGroups[i].prepareToRender(
                    this.worldState,
                    stageCtx,
                    bananasByGroup?.[i],
                    jamabarsByGroup?.[i],
                    goalBagsByGroup?.[i],
                    goalTapesByGroup?.[i],
                    switchesByGroup?.[i],
                    viewFromWorldTilted,
                    viewFromWorld,
                    tiltParams,
                    skipModelNames
                );
            }
            this.drawRevolutionSpecialStageModels(stageCtx, viewFromWorldTilted);
            this.drawSmb2Stage340SpecialStageModels(stageCtx, viewFromWorldTilted);
            if (this.bonusWaveModel && !ctx.mirrorCapture) {
                const rp = scratchRenderParams;
                rp.reset();
                rp.lighting = this.worldState.lighting;
                mat4.copy(rp.viewFromModel, viewFromWorldTilted);
                this.bonusWaveModel.prepareToRender(stageCtx, rp);
            }
            this.drawProjectedShadow(stageCtx, viewFromWorldTilted);
        }
        this.drawConfetti(stageCtx, viewFromWorldTilted);
        this.drawModPrimitives(stageCtx, viewFromWorldTilted);
        if (!skipStageGeometry && !ctx.mirrorCapture && !ctx.wormholeCapture) {
            this.drawEffects(stageCtx, viewFromWorldTilted, viewFromWorldPrev, viewFromWorld);
        }
        if (!skipStageGeometry) {
            for (let i = 0; i < this.fgObjects.length; i++) {
                this.fgObjects[i].prepareToRenderWithViewMatrix(this.worldState, stageCtx, viewFromWorldTilted);
            }
        }
        if (!skipBackground) {
            this.background.prepareToRender(this.worldState, {
                ...bgCtx,
                viewFromWorld: viewFromWorldTilted,
                viewFromWorldPrev,
                viewFromWorldNoTilt: viewFromWorld,
            });
        }
        const ballCtx = ctx.skipStageTilt ? stageCtx : { ...stageCtx, viewFromWorld: viewFromWorldTilted };
        for (let i = 0; i < this.balls.length; i++) {
            this.balls[i].prepareToRender(this.worldState, ballCtx);
        }
    }

    private shouldDrawRevolutionSlice(cameraValue: number, ballValue: number, threshold: number, inclusive: boolean): boolean {
        if (cameraValue <= threshold) {
            return inclusive ? ballValue <= threshold : ballValue > threshold;
        }
        return inclusive ? ballValue >= threshold : ballValue < threshold;
    }

    private drawRevolutionFloors(
        ctx: RenderContext,
        rp: RenderParams,
        cameraY: number,
        ballY: number,
        inclusive: boolean
    ): void {
        const models = this.revolutionModels;
        if (!models) {
            return;
        }
        if (models.floor1 && this.shouldDrawRevolutionSlice(cameraY, ballY, REVOLUTION_FLOOR_LOW_Y, inclusive)) {
            models.floor1.prepareToRender(ctx, rp);
        }
        if (models.floor2 && this.shouldDrawRevolutionSlice(cameraY, ballY, REVOLUTION_FLOOR_MID_Y, inclusive)) {
            models.floor2.prepareToRender(ctx, rp);
        }
        if (models.floor3 && this.shouldDrawRevolutionSlice(cameraY, ballY, REVOLUTION_FLOOR_HIGH_Y, inclusive)) {
            models.floor3.prepareToRender(ctx, rp);
        }
    }

    private drawRevolutionWallsAndFloors(
        ctx: RenderContext,
        rp: RenderParams,
        cameraX: number,
        cameraY: number,
        ballX: number,
        ballY: number,
        inclusive: boolean
    ): void {
        const models = this.revolutionModels;
        if (!models) {
            return;
        }
        const leftThreshold = -REVOLUTION_WALL_THRESHOLD;
        const rightThreshold = REVOLUTION_WALL_THRESHOLD;
        if (cameraX <= leftThreshold) {
            if (models.wallRight && this.shouldDrawRevolutionSlice(cameraX, ballX, rightThreshold, inclusive)) {
                models.wallRight.prepareToRender(ctx, rp);
            }
            this.drawRevolutionFloors(ctx, rp, cameraY, ballY, inclusive);
            if (models.wallLeft && this.shouldDrawRevolutionSlice(cameraX, ballX, leftThreshold, inclusive)) {
                models.wallLeft.prepareToRender(ctx, rp);
            }
            return;
        }
        if (cameraX <= rightThreshold) {
            models.wallLeft?.prepareToRender(ctx, rp);
            models.wallRight?.prepareToRender(ctx, rp);
            this.drawRevolutionFloors(ctx, rp, cameraY, ballY, inclusive);
            return;
        }
        if (models.wallLeft && this.shouldDrawRevolutionSlice(cameraX, ballX, leftThreshold, inclusive)) {
            models.wallLeft.prepareToRender(ctx, rp);
        }
        this.drawRevolutionFloors(ctx, rp, cameraY, ballY, inclusive);
        if (models.wallRight && this.shouldDrawRevolutionSlice(cameraX, ballX, rightThreshold, inclusive)) {
            models.wallRight.prepareToRender(ctx, rp);
        }
    }

    private drawRevolutionSpecialStageModels(ctx: RenderContext, viewFromWorld: mat4): void {
        const models = this.revolutionModels;
        const revolutionAg = this.animGroups[1];
        if (!models || !revolutionAg) {
            return;
        }
        const worldFromAg = revolutionAg.getWorldFromAg();
        if (!mat4.invert(scratchRevolutionAgFromWorld, worldFromAg)) {
            return;
        }
        mat4.getTranslation(scratchRevolutionCameraWorld, ctx.viewerInput.camera.worldMatrix);
        transformVec3Mat4w1(scratchRevolutionCameraLocal, scratchRevolutionAgFromWorld, scratchRevolutionCameraWorld);
        transformVec3Mat4w1(scratchRevolutionBallLocal, scratchRevolutionAgFromWorld, this.ballPos);

        const rp = scratchRenderParams;
        rp.reset();
        rp.sort = RenderSort.None;
        rp.lighting = this.worldState.lighting;
        mat4.mul(rp.viewFromModel, viewFromWorld, worldFromAg);
        this.drawRevolutionWallsAndFloors(
            ctx,
            rp,
            scratchRevolutionCameraLocal[0],
            scratchRevolutionCameraLocal[1],
            scratchRevolutionBallLocal[0],
            scratchRevolutionBallLocal[1],
            true
        );
        this.drawRevolutionWallsAndFloors(
            ctx,
            rp,
            scratchRevolutionCameraLocal[0],
            scratchRevolutionCameraLocal[1],
            scratchRevolutionBallLocal[0],
            scratchRevolutionBallLocal[1],
            false
        );
    }

    private drawSmb2Stage340SpecialStageModels(ctx: RenderContext, viewFromWorld: mat4): void {
        const models = this.smb2Stage340Models;
        const stage340Ag = this.animGroups[2];
        if (!models || !stage340Ag) {
            return;
        }
        const worldFromAg = stage340Ag.getWorldFromAg();
        if (!mat4.invert(scratchStage340AgFromWorld, worldFromAg)) {
            return;
        }
        mat4.getTranslation(scratchStage340CameraWorld, ctx.viewerInput.camera.worldMatrix);
        transformVec3Mat4w1(scratchStage340CameraLocal, scratchStage340AgFromWorld, scratchStage340CameraWorld);
        const cameraX = scratchStage340CameraLocal[0];
        const cameraY = scratchStage340CameraLocal[1];
        const cameraZ = scratchStage340CameraLocal[2];

        const rp = scratchRenderParams;
        rp.reset();
        rp.sort = RenderSort.None;
        rp.lighting = this.worldState.lighting;
        mat4.mul(rp.viewFromModel, viewFromWorld, worldFromAg);

        for (let i = 0; i < SMB2_STAGE_340_MODEL_DRAWS.length; i++) {
            const model = models[i];
            if (!model) {
                continue;
            }
            const draw = SMB2_STAGE_340_MODEL_DRAWS[i];
            const forceDraw = (draw[7] & SMB2_STAGE_340_FORCE_DRAW_FLAG) !== 0;
            if (!forceDraw) {
                const dot =
                    (cameraZ - draw[3]) * draw[6] +
                    (cameraX - draw[1]) * draw[4] +
                    (cameraY - draw[2]) * draw[5];
                if (dot < 0.0) {
                    continue;
                }
            }
            model.prepareToRender(ctx, rp);
        }
    }

    private raycastStageDown(pos: vec3): number | null {
        const stage = this.stageData.stagedef;
        let bestY = -Infinity;

        for (let animGroupId = 0; animGroupId < stage.animGroups.length; animGroupId++) {
            const stageAg = stage.animGroups[animGroupId];
            const animGroup = this.animGroups[animGroupId];
            if (!stageAg || !animGroup) {
                continue;
            }

            const worldFromAg = animGroup.getWorldFromAg();
            if (!mat4.invert(scratchOverlayRayAgFromWorld, worldFromAg)) {
                continue;
            }
            transformVec3Mat4w1(scratchOverlayRayPosAg, scratchOverlayRayAgFromWorld, pos);

            const cellTris = coligridLookupStagedef(stageAg, scratchOverlayRayPosAg[0], scratchOverlayRayPosAg[2]);
            if (!cellTris || cellTris.length === 0) {
                continue;
            }

            for (let triIndex = 0; triIndex < cellTris.length; triIndex++) {
                const tri = stageAg.coliTris[cellTris[triIndex]];
                if (!tri) {
                    continue;
                }

                mat4.fromTranslation(scratchOverlayRayTriFromAg, tri.pos);
                mat4.rotateY(scratchOverlayRayTriFromAg, scratchOverlayRayTriFromAg, tri.rot[1] * S16_TO_RADIANS);
                mat4.rotateX(scratchOverlayRayTriFromAg, scratchOverlayRayTriFromAg, tri.rot[0] * S16_TO_RADIANS);
                mat4.rotateZ(scratchOverlayRayTriFromAg, scratchOverlayRayTriFromAg, tri.rot[2] * S16_TO_RADIANS);
                if (!mat4.invert(scratchOverlayRayAgFromTri, scratchOverlayRayTriFromAg)) {
                    continue;
                }

                transformVec3Mat4w1(scratchOverlayRayPosTri, scratchOverlayRayAgFromTri, scratchOverlayRayPosAg);
                vec3.set(scratchOverlayRayDirTri, 0.0, -1.0, 0.0);
                transformVec3Mat4w0(scratchOverlayRayDirTri, scratchOverlayRayAgFromTri, scratchOverlayRayDirTri);
                // Match SMB2 raycast_tri front-face tests before solving intersection.
                if (scratchOverlayRayPosTri[2] < 0.0 || scratchOverlayRayDirTri[2] > 0.0) {
                    continue;
                }
                if (Math.abs(scratchOverlayRayDirTri[2]) <= OVERLAY_RAYCAST_EPSILON) {
                    continue;
                }

                const t = -scratchOverlayRayPosTri[2] / scratchOverlayRayDirTri[2];
                if (t < 0.0) {
                    continue;
                }

                const hitX = scratchOverlayRayPosTri[0] + scratchOverlayRayDirTri[0] * t;
                const hitY = scratchOverlayRayPosTri[1] + scratchOverlayRayDirTri[1] * t;
                if (hitY < -OVERLAY_RAYCAST_EDGE_EPSILON) {
                    continue;
                }
                if (
                    ((hitX - tri.vert2[0]) * tri.edge2Normal[0] + (hitY - tri.vert2[1]) * tri.edge2Normal[1]) <
                    -OVERLAY_RAYCAST_EDGE_EPSILON
                ) {
                    continue;
                }
                if (
                    ((hitX - tri.vert3[0]) * tri.edge3Normal[0] + (hitY - tri.vert3[1]) * tri.edge3Normal[1]) <
                    -OVERLAY_RAYCAST_EDGE_EPSILON
                ) {
                    continue;
                }

                vec3.set(scratchOverlayRayHitTri, hitX, hitY, 0.0);
                transformVec3Mat4w1(scratchOverlayRayHitAg, scratchOverlayRayTriFromAg, scratchOverlayRayHitTri);
                transformVec3Mat4w1(scratchOverlayRayHitWorld, worldFromAg, scratchOverlayRayHitAg);
                if (scratchOverlayRayHitWorld[1] > bestY) {
                    bestY = scratchOverlayRayHitWorld[1];
                }
            }
        }

        if (bestY > -Infinity) {
            return bestY;
        }
        return null;
    }

    private buildWormholeWorldFromModel(info: WormholeRenderInfo, out: mat4): boolean {
        const animGroup = this.animGroups[info.animGroupIndex];
        if (!animGroup) {
            return false;
        }
        mat4.fromTranslation(out, info.pos);
        mat4.rotateZ(out, out, S16_TO_RADIANS * info.rot[2]);
        mat4.rotateY(out, out, S16_TO_RADIANS * info.rot[1]);
        mat4.rotateX(out, out, S16_TO_RADIANS * info.rot[0]);
        mat4.mul(out, animGroup.getWorldFromAg(), out);
        return true;
    }

    private buildWormholeLookAt(info: WormholeRenderInfo, forwardLocal: vec3, out: mat4): boolean {
        const worldFromModel = scratchWormholeMat4f;
        if (!this.buildWormholeWorldFromModel(info, worldFromModel)) {
            return false;
        }
        const eye = scratchWormholeVec3a;
        const up = scratchWormholeVec3b;
        const target = scratchWormholeVec3c;
        const forwardWithOffset = scratchWormholeVec3d;
        transformVec3Mat4w1(eye, worldFromModel, WORMHOLE_OFFSET_LOCAL);
        transformVec3Mat4w0(up, worldFromModel, WORMHOLE_UP_LOCAL);
        if (vec3.squaredLength(up) <= 1e-8) {
            return false;
        }
        vec3.normalize(up, up);
        vec3.add(forwardWithOffset, WORMHOLE_OFFSET_LOCAL, forwardLocal);
        transformVec3Mat4w1(target, worldFromModel, forwardWithOffset);
        mat4.lookAt(out, eye, target, up);
        return true;
    }

    private computeWormholeSurfaceNearAlpha(viewFromWorld: mat4, worldFromModel: mat4): number {
        if (!this.wormholeSurfaceModel) {
            return 1;
        }
        const scale = scratchVec3a;
        mat4.getScaling(scale, worldFromModel);
        const maxScale = Math.max(scale[0], scale[1], scale[2]);
        const radius = Math.max(this.wormholeSurfaceModel.modelData.boundSphereRadius * maxScale, 1e-3);
        const fadeStart = radius * WORMHOLE_NEAR_FADE_INNER_RADIUS_SCALE;
        const fadeEnd = radius * WORMHOLE_NEAR_FADE_OUTER_RADIUS_SCALE;
        const centerWorld = scratchVec3b;
        const centerView = scratchVec3c;
        const sideNormalWorld = scratchVec3d;
        const sideNormalView = scratchVec3e;
        transformVec3Mat4w1(centerWorld, worldFromModel, this.wormholeSurfaceModel.modelData.boundSphereCenter);
        transformVec3Mat4w1(centerView, viewFromWorld, centerWorld);
        transformVec3Mat4w0(sideNormalWorld, worldFromModel, WORMHOLE_FORWARD_SOURCE_LOCAL);
        transformVec3Mat4w0(sideNormalView, viewFromWorld, sideNormalWorld);
        if (vec3.squaredLength(sideNormalView) > 1e-8) {
            vec3.normalize(sideNormalView, sideNormalView);
            const sideDot =
                -centerView[0] * sideNormalView[0] -
                centerView[1] * sideNormalView[1] -
                centerView[2] * sideNormalView[2];
            if (sideDot >= 0.0) {
                // Camera is on the portal's front side; keep it opaque.
                return 1;
            }
        }
        const dist = vec3.length(centerView);
        if (dist <= fadeStart) {
            return 0;
        }
        if (dist >= fadeEnd) {
            return 1;
        }
        return (dist - fadeStart) / Math.max(fadeEnd - fadeStart, 1e-6);
    }

    public getWormholeCaptureClipPlane(wormholeId: number, outPoint: vec3, outNormal: vec3): boolean {
        const wormhole = this.wormholeInfoById.get(wormholeId);
        if (!wormhole) {
            return false;
        }
        const worldFromModel = scratchWormholeMat4f;
        if (!this.buildWormholeWorldFromModel(wormhole, worldFromModel)) {
            return false;
        }
        transformVec3Mat4w1(outPoint, worldFromModel, WORMHOLE_OFFSET_LOCAL);
        // Clip against the exit portal plane, using the same side convention as legacy wormhole capture culling.
        transformVec3Mat4w0(outNormal, worldFromModel, WORMHOLE_FORWARD_SOURCE_LOCAL);
        if (vec3.squaredLength(outNormal) <= 1e-8) {
            return false;
        }
        vec3.normalize(outNormal, outNormal);
        return true;
    }

    public hasRenderableWormholes(): boolean {
        if (!this.wormholeSurfaceModel || this.wormholeInfos.length === 0) {
            return false;
        }
        for (const wormhole of this.wormholeInfos) {
            if (wormhole.destId !== null && this.wormholeInfoById.has(wormhole.destId)) {
                return true;
            }
        }
        return false;
    }

    public getActiveWormholeCapture(
        viewFromWorld: mat4,
        projection: mat4,
        outCaptureViewFromWorld: mat4,
        outPortalClipFromWorld: mat4
    ): { sourceId: number; destId: number } | null {
        if (!this.hasRenderableWormholes()) {
            return null;
        }

        const viewFromWorldTilted = this.getTiltedViewMatrix(viewFromWorld, scratchWormholeMat4a);
        const worldFromView = scratchWormholeMat4b;
        if (!mat4.invert(worldFromView, viewFromWorldTilted)) {
            return null;
        }

        const cameraPos = scratchWormholeVec3a;
        const cameraForward = scratchWormholeVec3b;
        mat4.getTranslation(cameraPos, worldFromView);
        transformVec3Mat4w0(cameraForward, worldFromView, WORMHOLE_FORWARD_SOURCE_LOCAL);
        if (vec3.squaredLength(cameraForward) <= 1e-8) {
            return null;
        }
        vec3.normalize(cameraForward, cameraForward);

        let activeSource: WormholeRenderInfo | null = null;
        let activeDest: WormholeRenderInfo | null = null;
        let bestDistSq = Number.POSITIVE_INFINITY;
        const portalCenter = scratchWormholeVec3c;
        const cameraToPortal = scratchWormholeVec3d;
        for (const wormhole of this.wormholeInfos) {
            if (wormhole.destId === null) {
                continue;
            }
            const dest = this.wormholeInfoById.get(wormhole.destId);
            if (!dest) {
                continue;
            }
            const sourceWorldFromModel = scratchWormholeMat4c;
            if (!this.buildWormholeWorldFromModel(wormhole, sourceWorldFromModel)) {
                continue;
            }
            transformVec3Mat4w1(portalCenter, sourceWorldFromModel, WORMHOLE_OFFSET_LOCAL);
            vec3.sub(cameraToPortal, portalCenter, cameraPos);
            if (vec3.dot(cameraForward, cameraToPortal) < 0) {
                continue;
            }
            const distSq = vec3.squaredLength(cameraToPortal);
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                activeSource = wormhole;
                activeDest = dest;
            }
        }

        if (!activeSource || !activeDest) {
            return null;
        }

        const sourceLookAt = scratchWormholeMat4c;
        const destLookAt = scratchWormholeMat4d;
        if (!this.buildWormholeLookAt(activeSource, WORMHOLE_FORWARD_SOURCE_LOCAL, sourceLookAt)) {
            return null;
        }
        if (!this.buildWormholeLookAt(activeDest, WORMHOLE_FORWARD_DEST_LOCAL, destLookAt)) {
            return null;
        }

        const invSource = scratchWormholeMat4b;
        if (!mat4.invert(invSource, sourceLookAt)) {
            return null;
        }
        const delta = scratchWormholeMat4e;
        mat4.mul(delta, invSource, destLookAt);
        mat4.mul(outCaptureViewFromWorld, viewFromWorldTilted, delta);
        mat4.mul(outPortalClipFromWorld, projection, outCaptureViewFromWorld);
        return {
            sourceId: activeSource.id,
            destId: activeDest.id,
        };
    }

    public prepareToRenderWormholeSurface(
        ctx: RenderContext,
        viewFromWorld: mat4,
        portalClipFromWorld: mat4,
        sourceId: number,
        destId: number | null
    ): void {
        if (!this.wormholeSurfaceModel || !this.wormholeSurfaceModel.prepareToRenderCustom) {
            return;
        }
        const source = this.wormholeInfoById.get(sourceId);
        if (!source) {
            return;
        }
        const viewFromWorldTilted = this.getTiltedViewMatrix(viewFromWorld, scratchWormholeMat4a);
        const worldFromModel = scratchWormholeMat4b;
        if (!this.buildWormholeWorldFromModel(source, worldFromModel)) {
            return;
        }
        const sampleFromModel = scratchWormholeMat4d;
        let usePairedDest = false;
        if (destId !== null) {
            const dest = this.wormholeInfoById.get(destId);
            if (dest && this.buildWormholeWorldFromModel(dest, sampleFromModel)) {
                // Use destination portal local->world to map source surface UV sampling into exit space.
                usePairedDest = true;
            } else {
                mat4.copy(sampleFromModel, worldFromModel);
            }
        } else {
            mat4.copy(sampleFromModel, worldFromModel);
        }
        const sampleFromModelAdjusted = scratchWormholeMat4g;
        if (usePairedDest) {
            // Crossing the portal flips local facing; rotate 180 around local up before sampling.
            mat4.mul(sampleFromModelAdjusted, sampleFromModel, WORMHOLE_LOCAL_THROUGH);
        } else {
            mat4.copy(sampleFromModelAdjusted, sampleFromModel);
        }
        const portalClipFromModel = scratchWormholeMat4c;
        mat4.mul(portalClipFromModel, portalClipFromWorld, sampleFromModelAdjusted);
        const rp = scratchRenderParams;
        rp.reset();
        rp.sort = RenderSort.None;
        rp.lighting = this.worldState.lighting;
        mat4.mul(rp.viewFromModel, viewFromWorldTilted, worldFromModel);
        const nearAlpha = this.computeWormholeSurfaceNearAlpha(viewFromWorldTilted, worldFromModel);
        this.wormholeSurfaceModel.prepareToRenderCustom(ctx, rp, (renderInst, renderParams): void => {
            renderInst.setBindingLayouts(gxBindingLayouts);
            fillSceneParamsDataOnTemplate(renderInst, ctx.viewerInput, 0, this.worldState.time.getAnimTimeFrames());
            renderInst.setGfxProgram(this.wormholeSurfaceProgram);
            renderInst.setMegaStateFlags(this.wormholeSurfaceMegaState);
            renderInst.setSamplerBindingsFromTextureMappings([this.wormholeColorMapping]);
            const d = renderInst.allocateUniformBufferF32(WORMHOLE_SURFACE_UBO_INDEX, WORMHOLE_SURFACE_UBO_WORDS);
            fillMatrix4x4(d, 0, renderParams.viewFromModel);
            fillMatrix4x4(d, 16, portalClipFromModel);
            fillVec4(d, 32, nearAlpha, 0, 0, 0);
        });
    }

    public getMirrorMode(): MirrorMode {
        if (this.stageData.stageInfo.id === StageId.St092_Bonus_Wave && this.bonusWaveModel) {
            return 'wavy';
        }
        const mirrors = this.stageData.stagedef.mirrors ?? [];
        const hasMirrors =
            mirrors.length > 0 ||
            this.stageData.stageInfo.id === StageId.St102_Hitter ||
            this.stageData.stageInfo.id === StageId.St103_Av_Logo;
        return hasMirrors ? 'flat' : 'none';
    }

    public getMirrorPlaneMatrix(out: mat4, cameraWorldMatrix: mat4): boolean {
        const stageId = this.stageData.stageInfo.id;
        mat4.identity(out);
        if (stageId === StageId.St092_Bonus_Wave) {
            mat4.fromTranslation(out, [0, WAVY_MIRROR_PLANE_Y, 0]);
            return true;
        }
        if (stageId === StageId.St103_Av_Logo) {
            if (this.animGroups.length > 1) {
                this.animGroups[1].getWorldFromAgNoOrigin(out);
                return true;
            }
            return false;
        }
        if (stageId === StageId.St110_Curl_Pipe) {
            const cameraPos = scratchMirrorVec3a;
            mat4.getTranslation(cameraPos, cameraWorldMatrix);
            const mirrorY = cameraPos[1] >= -9.0 ? -9.0 : -43.0;
            mat4.fromTranslation(out, [0, mirrorY, 0]);
            return true;
        }
        if (stageId === StageId.St048_Tracks || stageId === StageId.St102_Hitter) {
            return true;
        }

        const mirrors = this.stageData.stagedef.mirrors ?? [];
        const mirrorEntry = mirrors[0];
        if (!mirrorEntry) {
            return false;
        }
        const mirrorModel = this.worldState.modelCache.getModel(mirrorEntry.modelName, GmaSrc.StageAndBg);
        if (!mirrorModel) {
            return false;
        }
        mat4.fromTranslation(out, [0, mirrorModel.modelData.boundSphereCenter[1], 0]);
        return true;
    }

    public prepareToRenderMirrors(
        ctx: RenderContext,
        viewFromWorld: mat4,
        mirrorClipFromWorld: mat4,
        mirrorAlpha: number,
        distortClipFromWorld: mat4 | null,
        indTexMtx0: vec3 | null,
        indTexMtx1: vec3 | null
    ): void {
        const viewFromWorldTilted = this.getTiltedViewMatrix(viewFromWorld, scratchMirrorMat4e);
        const worldFromView = scratchMirrorMat4a;
        mat4.invert(worldFromView, viewFromWorldTilted);

        if (distortClipFromWorld && indTexMtx0 && indTexMtx1) {
            const configureRenderInst = (renderInst: GfxRenderInst, renderParams: RenderParams): void => {
                renderInst.setGfxProgram(this.mirrorWavyProgram);
                renderInst.setMegaStateFlags(this.mirrorWavyMegaState);
                renderInst.setSamplerBindingsFromTextureMappings([this.mirrorColorMapping, this.mirrorDistortMapping]);

                const worldFromModel = scratchMirrorMat4b;
                const mirrorClipFromModel = scratchMirrorMat4c;
                const distortClipFromModel = scratchMirrorMat4d;
                mat4.mul(worldFromModel, worldFromView, renderParams.viewFromModel);
                mat4.mul(mirrorClipFromModel, mirrorClipFromWorld, worldFromModel);
                mat4.mul(distortClipFromModel, distortClipFromWorld, worldFromModel);

                const d = renderInst.allocateUniformBufferF32(MIRROR_WAVY_UBO_INDEX, MIRROR_WAVY_UBO_WORDS);
                fillMatrix4x4(d, 0, renderParams.viewFromModel);
                fillMatrix4x4(d, 16, mirrorClipFromModel);
                fillMatrix4x4(d, 32, distortClipFromModel);
                fillVec4(d, 48, mirrorAlpha, 0, 0, 0);
                fillVec4(d, 52, indTexMtx0[0], indTexMtx0[1], indTexMtx0[2], 0);
                fillVec4(d, 56, indTexMtx1[0], indTexMtx1[1], indTexMtx1[2], 0);
            };

            if (this.bonusWaveModel) {
                const rp = scratchRenderParams;
                rp.reset();
                rp.sort = RenderSort.None;
                mat4.copy(rp.viewFromModel, viewFromWorldTilted);
                this.bonusWaveModel.prepareToRenderCustom?.(ctx, rp, configureRenderInst);
            }
            return;
        }

        const configureRenderInst = (renderInst: GfxRenderInst, renderParams: RenderParams): void => {
            renderInst.setGfxProgram(this.mirrorFlatProgram);
            renderInst.setMegaStateFlags(this.mirrorFlatMegaState);
            renderInst.setSamplerBindingsFromTextureMappings([this.mirrorColorMapping]);

            const worldFromModel = scratchMirrorMat4b;
            const mirrorClipFromModel = scratchMirrorMat4c;
            mat4.mul(worldFromModel, worldFromView, renderParams.viewFromModel);
            mat4.mul(mirrorClipFromModel, mirrorClipFromWorld, worldFromModel);

            const d = renderInst.allocateUniformBufferF32(MIRROR_FLAT_UBO_INDEX, MIRROR_FLAT_UBO_WORDS);
            fillMatrix4x4(d, 0, renderParams.viewFromModel);
            fillMatrix4x4(d, 16, mirrorClipFromModel);
            fillVec4(d, 32, mirrorAlpha, 0, 0, 0);
        };

        for (let i = 0; i < this.animGroups.length; i++) {
            this.animGroups[i].prepareToRenderMirrors(this.worldState, ctx, viewFromWorldTilted, configureRenderInst);
        }
        const mirrors = this.stageData.stagedef.mirrors ?? [];
        if (mirrors.length > 0) {
            const mirrorNamesInGroups = new Set<string>();
            for (let i = 0; i < this.animGroups.length; i++) {
                const names = this.animGroups[i].agData.mirrorModelNames ?? [];
                for (let j = 0; j < names.length; j++) {
                    mirrorNamesInGroups.add(names[j]);
                }
            }
            const rp = scratchRenderParams;
            rp.reset();
            rp.sort = RenderSort.None;
            rp.lighting = this.worldState.lighting;
            mat4.copy(rp.viewFromModel, viewFromWorldTilted);
            for (let i = 0; i < mirrors.length; i++) {
                const mirrorEntry = mirrors[i];
                if (mirrorNamesInGroups.has(mirrorEntry.modelName)) {
                    continue;
                }
                const mirrorModel = this.worldState.modelCache.getModel(mirrorEntry.modelName, GmaSrc.StageAndBg);
                if (!mirrorModel) {
                    continue;
                }
                mirrorModel.prepareToRenderCustom?.(ctx, rp, configureRenderInst);
            }
        }
    }

    public prepareToRenderWavyDistort(ctx: RenderContext, viewFromWorld: mat4): void {
        if (!this.bonusWaveModel) {
            return;
        }
        const viewFromWorldTilted = this.getTiltedViewMatrix(viewFromWorld, scratchMirrorMat4e);

        const configureRenderInst = (renderInst: GfxRenderInst, renderParams: RenderParams): void => {
            renderInst.setGfxProgram(this.mirrorDistortProgram);
            renderInst.setMegaStateFlags(this.mirrorDistortMegaState);
            renderInst.setSamplerBindingsFromTextureMappings([this.mirrorGradMapping]);

            const d = renderInst.allocateUniformBufferF32(MIRROR_DISTORT_UBO_INDEX, MIRROR_DISTORT_UBO_WORDS);
            fillMatrix4x4(d, 0, renderParams.viewFromModel);
        };

        const rp = scratchRenderParams;
        rp.reset();
        rp.sort = RenderSort.None;
        mat4.copy(rp.viewFromModel, viewFromWorldTilted);
        this.bonusWaveModel.prepareToRenderCustom?.(ctx, rp, configureRenderInst);
    }

    public getClearColor(): Color {
        return this.stageData.stageInfo.bgInfo.clearColor;
    }

    public getAnimTimeFrames(): number {
        return this.worldState.time.getAnimTimeFrames();
    }

    public getWormholeScreenOverlayWarpTextureMapping(): GXTextureMapping | null {
        if (!this.wormholeScreenOverlayWarpMapping.gfxTexture || !this.wormholeScreenOverlayWarpMapping.gfxSampler) {
            return null;
        }
        return this.wormholeScreenOverlayWarpMapping;
    }

    public setMaterialHacks(hacks: GX_Material.GXMaterialHacks): void {
        this.worldState.modelCache.setMaterialHacks(hacks);
    }

    private regroupRenderStatesByAnimGroup<T extends { animGroupId: number }>(
        source: T[] | null,
        buckets: T[][],
    ): void {
        for (let i = 0; i < buckets.length; i++) {
            buckets[i].length = 0;
        }
        if (!source) {
            return;
        }
        for (let i = 0; i < source.length; i++) {
            const entry = source[i];
            const group = entry.animGroupId | 0;
            if (group >= 0 && group < buckets.length) {
                buckets[group].push(entry);
            }
        }
    }

    public setGoalBags(goalBags: GoalBagRenderState[] | null): void {
        if (this.goalBags === goalBags) {
            return;
        }
        this.goalBags = goalBags;
        this.regroupRenderStatesByAnimGroup(goalBags, this.goalBagsByGroup);
    }

    public setBananas(bananas: BananaRenderState[] | null): void {
        if (this.bananas === bananas) {
            return;
        }
        this.bananas = bananas;
        this.regroupRenderStatesByAnimGroup(bananas, this.bananasByGroup);
    }

    public setJamabars(jamabars: JamabarRenderState[] | null): void {
        if (this.jamabars === jamabars) {
            return;
        }
        this.jamabars = jamabars;
        this.regroupRenderStatesByAnimGroup(jamabars, this.jamabarsByGroup);
    }

    public setGoalTapes(goalTapes: GoalTapeRenderState[] | null): void {
        if (this.goalTapes === goalTapes) {
            return;
        }
        this.goalTapes = goalTapes;
        this.regroupRenderStatesByAnimGroup(goalTapes, this.goalTapesByGroup);
    }

    public setConfetti(confetti: ConfettiRenderState[] | null): void {
        this.confetti = confetti;
    }

    public setEffects(effects: EffectRenderState[] | null): void {
        this.effects = effects;
    }

    public setModPrimitives(primitives: ModRenderPrimitiveState[] | null): void {
        this.modPrimitives = primitives;
    }

    public setSwitches(switches: SwitchRenderState[] | null): void {
        if (this.switches === switches) {
            return;
        }
        this.switches = switches;
        this.regroupRenderStatesByAnimGroup(switches, this.switchesByGroup);
    }

    public setStageTilt(stageTilt: StageTiltRenderState | null): void {
        this.stageTilt = stageTilt;
    }

    public setAnimGroupTransforms(transforms: Float32Array[] | null): void {
        if (!transforms) {
            for (let i = 0; i < this.animGroups.length; i++) {
                this.animGroups[i].setExternalTransform(null);
            }
            return;
        }
        for (let i = 0; i < this.animGroups.length; i++) {
            this.animGroups[i].setExternalTransform(transforms[i] ?? null);
        }
    }

    private isExternalStreakTextureName(textureName: string): boolean {
        return textureName.includes("/")
            || textureName.includes("\\")
            || textureName.startsWith("data:")
            || /\.(png|jpe?g|webp|gif|bmp)$/i.test(textureName);
    }

    private createExternalStreakTextureMapping(textureName: string): GXTextureMapping {
        const mapping = new GXTextureMapping();
        mapping.gfxTexture = this.streakDefaultTexture.gfxTexture;
        mapping.gfxSampler = this.streakDefaultTexture.gfxSampler;
        mapping.width = this.streakDefaultTexture.width;
        mapping.height = this.streakDefaultTexture.height;
        this.streakTextureMappings.set(textureName, mapping);
        if (this.streakExternalTextureLoading.has(textureName) || this.streakExternalTextureFailed.has(textureName)) {
            return mapping;
        }
        if (typeof Image === "undefined") {
            this.streakExternalTextureFailed.add(textureName);
            console.warn("[streak] Image not available; skipping texture load", textureName);
            return mapping;
        }
        if (typeof document === "undefined") {
            this.streakExternalTextureFailed.add(textureName);
            console.warn("[streak] document not available; skipping texture load", textureName);
            return mapping;
        }
        this.streakExternalTextureLoading.add(textureName);
        const img = new Image();
        img.onload = () => {
            this.streakExternalTextureLoading.delete(textureName);
            const width = img.naturalWidth || img.width;
            const height = img.naturalHeight || img.height;
            if (!width || !height) {
                this.streakExternalTextureFailed.add(textureName);
                return;
            }
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                this.streakExternalTextureFailed.add(textureName);
                return;
            }
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            const tex = this.renderCache.device.createTexture(makeTextureDescriptor2D(GfxFormat.U8_RGBA_NORM, width, height, 1));
            const imageData = ctx.getImageData(0, 0, width, height);
            const pixels = new Uint8Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength);
            this.renderCache.device.uploadTextureData(tex, 0, [pixels]);
            if (mapping.gfxTexture && mapping.gfxTexture !== this.streakDefaultTexture.gfxTexture && this.streakExternalTextureOwned.has(textureName)) {
                this.renderCache.device.destroyTexture(mapping.gfxTexture);
            }
            mapping.gfxTexture = tex;
            mapping.gfxSampler = this.streakDefaultTexture.gfxSampler;
            mapping.width = width;
            mapping.height = height;
            mapping.flipY = false;
            this.streakExternalTextureOwned.add(textureName);
        };
        img.onerror = () => {
            this.streakExternalTextureLoading.delete(textureName);
            this.streakExternalTextureFailed.add(textureName);
            console.warn("[streak] failed to load texture", textureName);
        };
        img.src = textureName;
        return mapping;
    }

    private getStreakTextureMapping(textureName?: string): GXTextureMapping {
        if (!textureName) {
            return this.streakDefaultTexture;
        }
        const cached = this.streakTextureMappings.get(textureName);
        if (cached) {
            return cached;
        }
        const tex = this.streakTextureSources.get(textureName);
        if (!tex) {
            if (this.isExternalStreakTextureName(textureName)) {
                return this.createExternalStreakTextureMapping(textureName);
            }
            return this.streakDefaultTexture;
        }
        const mapping = new GXTextureMapping();
        this.worldState.modelCache.fillTextureMappingFromGxTexture(tex, mapping);
        if (!mapping.gfxSampler) {
            mapping.gfxSampler = this.streakDefaultTexture.gfxSampler;
        }
        this.streakTextureMappings.set(textureName, mapping);
        return mapping;
    }

    private isExternalBallTextureName(textureName: string): boolean {
        return textureName.includes("/")
            || textureName.includes("\\")
            || textureName.startsWith("data:")
            || /\.(png|jpe?g|webp|gif|bmp)$/i.test(textureName);
    }

    private createExternalBallTextureMapping(textureName: string): GXTextureMapping | null {
        const mapping = new GXTextureMapping();
        this.ballTextureMappings.set(textureName, mapping);
        if (this.ballExternalTextureLoading.has(textureName) || this.ballExternalTextureFailed.has(textureName)) {
            return mapping;
        }
        if (typeof Image === "undefined") {
            this.ballExternalTextureFailed.add(textureName);
            console.warn("[ball] Image not available; skipping texture load", textureName);
            return mapping;
        }
        if (typeof document === "undefined") {
            this.ballExternalTextureFailed.add(textureName);
            console.warn("[ball] document not available; skipping texture load", textureName);
            return mapping;
        }
        this.ballExternalTextureLoading.add(textureName);
        const img = new Image();
        img.onload = () => {
            this.ballExternalTextureLoading.delete(textureName);
            const width = img.naturalWidth || img.width;
            const height = img.naturalHeight || img.height;
            if (!width || !height) {
                this.ballExternalTextureFailed.add(textureName);
                return;
            }
            if (width > BALL_TEXTURE_MAX_DIM || height > BALL_TEXTURE_MAX_DIM) {
                this.ballExternalTextureFailed.add(textureName);
                console.warn("[ball] texture too large", textureName, width, height);
                return;
            }
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                this.ballExternalTextureFailed.add(textureName);
                return;
            }
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            const tex = this.renderCache.device.createTexture(makeTextureDescriptor2D(GfxFormat.U8_RGBA_NORM, width, height, 1));
            const imageData = ctx.getImageData(0, 0, width, height);
            const pixels = new Uint8Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength);
            this.renderCache.device.uploadTextureData(tex, 0, [pixels]);
            if (mapping.gfxTexture && this.ballExternalTextureOwned.has(textureName)) {
                this.renderCache.device.destroyTexture(mapping.gfxTexture);
            }
            if (!this.streakDefaultTexture.gfxSampler) {
                this.ballExternalTextureFailed.add(textureName);
                this.renderCache.device.destroyTexture(tex);
                return;
            }
            mapping.gfxTexture = tex;
            mapping.gfxSampler = this.streakDefaultTexture.gfxSampler;
            mapping.width = width;
            mapping.height = height;
            mapping.flipY = false;
            this.ballExternalTextureOwned.add(textureName);
        };
        img.onerror = () => {
            this.ballExternalTextureLoading.delete(textureName);
            this.ballExternalTextureFailed.add(textureName);
            console.warn("[ball] failed to load texture", textureName);
        };
        img.src = textureName;
        return mapping;
    }

    private getBallTextureMapping(textureName?: string): GXTextureMapping | null {
        if (!textureName) {
            return null;
        }
        const cached = this.ballTextureMappings.get(textureName);
        if (cached) {
            return cached;
        }
        if (!this.isExternalBallTextureName(textureName)) {
            return null;
        }
        return this.createExternalBallTextureMapping(textureName);
    }

    public getTiltedViewMatrix(viewFromWorld: mat4, out: mat4, pivot?: vec3): mat4 {
        if (!this.stageTilt || !this.hasBallPosForTilt) {
            return viewFromWorld;
        }
        const rotX = this.stageTilt.xrot * STAGE_TILT_SCALE * S16_TO_RADIANS;
        const rotZ = this.stageTilt.zrot * STAGE_TILT_SCALE * S16_TO_RADIANS;
        if (rotX === 0 && rotZ === 0) {
            return viewFromWorld;
        }
        const tiltPivot = pivot ?? this.ballPosForTilt;
        mat4.copy(out, viewFromWorld);
        mat4.translate(out, out, tiltPivot);
        mat4.rotateX(out, out, rotX);
        mat4.rotateZ(out, out, rotZ);
        vec3.negate(scratchVec3a, tiltPivot);
        mat4.translate(out, out, scratchVec3a);
        return out;
    }

    private drawProjectedShadow(ctx: RenderContext, viewFromWorld: mat4): void {
        if (!this.ballVisible || this.ballRadius <= 0 || !this.shadowTevLayer || !this.shadowTextureMapping.gfxTexture) {
            return;
        }
        const radius = this.ballRadius * SHADOW_RADIUS_SCALE;
        if (radius <= 0) {
            return;
        }
        const lightPos = scratchVec3a;
        lightPos[0] = this.ballPos[0] + this.shadowLightDir[0] * SHADOW_LIGHT_OFFSET;
        lightPos[1] = this.ballPos[1] + this.shadowLightDir[1] * SHADOW_LIGHT_OFFSET;
        lightPos[2] = this.ballPos[2] + this.shadowLightDir[2] * SHADOW_LIGHT_OFFSET;
        mat4.lookAt(scratchShadowView, lightPos, this.ballPos, this.shadowLightUp);
        mat4.invert(scratchWorldFromView, viewFromWorld);
        mat4.mul(scratchShadowFromView, scratchShadowView, scratchWorldFromView);
        vec3.transformMat4(scratchBallLightPos, this.ballPos, scratchShadowView);

        const configureRenderInst = (renderInst: GfxRenderInst, renderParams: RenderParams): void => {
            renderInst.setBindingLayouts(gxBindingLayouts);
            fillSceneParamsDataOnTemplate(renderInst, ctx.viewerInput, 0, this.worldState.time.getAnimTimeFrames());
            renderInst.setGfxProgram(this.shadowProgram);
            renderInst.setMegaStateFlags(this.shadowMegaState);
            renderInst.setSamplerBindingsFromTextureMappings([this.shadowTextureMapping]);
            const d = renderInst.allocateUniformBufferF32(SHADOW_UBO_INDEX, SHADOW_PARAMS_WORDS);
            fillMatrix4x4(d, 0, renderParams.viewFromModel);
            fillMatrix4x4(d, 16, scratchShadowFromView);
            fillVec4(d, 32, this.shadowColor[0], this.shadowColor[1], this.shadowColor[2], this.shadowColor[3]);
            fillVec4(d, 36, radius, scratchBallLightPos[2], SHADOW_FADE_SCALE, 0);
        };

        for (let i = 0; i < this.animGroups.length; i++) {
            this.animGroups[i].prepareToRenderShadow(ctx, viewFromWorld, configureRenderInst);
        }
    }

    private drawConfetti(ctx: RenderContext, viewFromWorld: mat4): void {
        if (!this.confetti || this.confetti.length === 0) {
            return;
        }
        const rp = scratchRenderParams;
        rp.reset();
        rp.sort = RenderSort.None;
        rp.lighting = this.worldState.lighting;

        for (const frag of this.confetti) {
            const model = this.confettiModels[frag.modelIndex];
            if (!model) {
                continue;
            }
            mat4.translate(rp.viewFromModel, viewFromWorld, [
                frag.pos.x,
                frag.pos.y,
                frag.pos.z,
            ]);
            mat4.rotateY(rp.viewFromModel, rp.viewFromModel, S16_TO_RADIANS * frag.rotY);
            mat4.rotateX(rp.viewFromModel, rp.viewFromModel, S16_TO_RADIANS * frag.rotX);
            mat4.rotateZ(rp.viewFromModel, rp.viewFromModel, S16_TO_RADIANS * frag.rotZ);
            if (frag.scale !== 1) {
                mat4.scale(rp.viewFromModel, rp.viewFromModel, [frag.scale, frag.scale, frag.scale]);
            }
            model.prepareToRender(ctx, rp);
        }
    }

    private drawModPrimitives(ctx: RenderContext, viewFromWorld: mat4): void {
        if (!this.modPrimitives || this.modPrimitives.length === 0) {
            return;
        }
        const viewX: number[] = [];
        const viewY: number[] = [];
        const viewZ: number[] = [];
        const sideX: number[] = [];
        const sideY: number[] = [];
        const sideZ: number[] = [];
        const uCoords: number[] = [];
        const writeVertex = (
            view: DataView,
            baseOffset: number,
            x: number,
            y: number,
            z: number,
            r: number,
            g: number,
            b: number,
            a: number,
            u: number,
            v: number,
        ): void => {
            view.setFloat32(baseOffset + 0, x, true);
            view.setFloat32(baseOffset + 4, y, true);
            view.setFloat32(baseOffset + 8, z, true);
            view.setUint8(baseOffset + 12, r);
            view.setUint8(baseOffset + 13, g);
            view.setUint8(baseOffset + 14, b);
            view.setUint8(baseOffset + 15, a);
            view.setFloat32(baseOffset + 16, u, true);
            view.setFloat32(baseOffset + 20, v, true);
        };
        const getRibbonMegaState = (additiveBlend: boolean, depthTest: boolean) => {
            if (additiveBlend) {
                return depthTest ? this.ribbonAddMegaState : this.ribbonAddNoDepthMegaState;
            }
            return depthTest ? this.ribbonAlphaMegaState : this.ribbonAlphaNoDepthMegaState;
        };
        const clamp01 = (value: number, fallback: number): number => {
            if (!Number.isFinite(value)) {
                return fallback;
            }
            return Math.min(1, Math.max(0, value));
        };
        const submitPrimitive = (
            textureName: string | undefined,
            additiveBlend: boolean,
            depthTest: boolean,
            useAlphaClip: boolean,
            vertexData: ArrayBuffer,
            vertexCount: number,
            translucentSortDistance: number,
        ): void => {
            const vbuf = ctx.renderInstManager.gfxRenderCache.dynamicBufferCache.allocateData(
                GfxBufferUsage.Vertex,
                new Uint8Array(vertexData),
            );
            const renderInst = ctx.renderInstManager.newRenderInst();
            renderInst.setBindingLayouts(gxBindingLayouts);
            fillSceneParamsDataOnTemplate(renderInst, ctx.viewerInput, 0, this.worldState.time.getAnimTimeFrames());
            renderInst.setGfxProgram(useAlphaClip ? this.streakCutoutProgram : this.streakProgram);
            renderInst.setPrimitiveTopology(GfxPrimitiveTopology.Triangles);
            if (useAlphaClip) {
                renderInst.setMegaStateFlags(this.ribbonCutoutMegaState);
            } else {
                renderInst.setMegaStateFlags(getRibbonMegaState(additiveBlend, depthTest));
            }
            renderInst.setVertexInput(this.streakInputLayout, [vbuf], null);
            renderInst.setDrawCount(vertexCount);
            renderInst.setSamplerBindingsFromTextureMappings([this.getStreakTextureMapping(textureName)]);
            renderInst.setAllowSkippingIfPipelineNotReady(false);
            if (useAlphaClip) {
                ctx.opaqueInstList.submitRenderInst(renderInst);
            } else {
                renderInst.sortKey = -translucentSortDistance;
                ctx.translucentInstList.submitRenderInst(renderInst);
            }
        };

        for (const primitive of this.modPrimitives) {
            if (primitive.kind === "quad") {
                const corners = primitive.corners;
                if (!corners || corners.length !== 4) {
                    continue;
                }
                const alpha = clamp01(primitive.alpha, 1);
                if (alpha <= 0) {
                    continue;
                }
                const baseR = clamp01(primitive.colorR ?? 1, 1);
                const baseG = clamp01(primitive.colorG ?? 1, 1);
                const baseB = clamp01(primitive.colorB ?? 1, 1);
                const r = Math.round(baseR * 255);
                const g = Math.round(baseG * 255);
                const b = Math.round(baseB * 255);
                const a = Math.round(alpha * 255);
                if (a <= 0) {
                    continue;
                }
                const useAlphaClip = primitive.alphaClip === true
                    && primitive.additiveBlend !== true
                    && primitive.depthTest !== false;
                const uMinRaw = primitive.uMin ?? 0;
                const uMaxRaw = primitive.uMax ?? 1;
                const vMinRaw = primitive.vMin ?? 0;
                const vMaxRaw = primitive.vMax ?? 1;
                const uMin = Number.isFinite(uMinRaw) ? uMinRaw : 0;
                const uMax = Number.isFinite(uMaxRaw) ? uMaxRaw : 1;
                const vMin = Number.isFinite(vMinRaw) ? vMinRaw : 0;
                const vMax = Number.isFinite(vMaxRaw) ? vMaxRaw : 1;
                const c0 = corners[0];
                const c1 = corners[1];
                const c2 = corners[2];
                const c3 = corners[3];
                scratchVec3a[0] = c0.x;
                scratchVec3a[1] = c0.y;
                scratchVec3a[2] = c0.z;
                transformVec3Mat4w1(scratchVec3b, viewFromWorld, scratchVec3a);
                const x0 = scratchVec3b[0];
                const y0 = scratchVec3b[1];
                const z0 = scratchVec3b[2];
                scratchVec3a[0] = c1.x;
                scratchVec3a[1] = c1.y;
                scratchVec3a[2] = c1.z;
                transformVec3Mat4w1(scratchVec3b, viewFromWorld, scratchVec3a);
                const x1 = scratchVec3b[0];
                const y1 = scratchVec3b[1];
                const z1 = scratchVec3b[2];
                scratchVec3a[0] = c2.x;
                scratchVec3a[1] = c2.y;
                scratchVec3a[2] = c2.z;
                transformVec3Mat4w1(scratchVec3b, viewFromWorld, scratchVec3a);
                const x2 = scratchVec3b[0];
                const y2 = scratchVec3b[1];
                const z2 = scratchVec3b[2];
                scratchVec3a[0] = c3.x;
                scratchVec3a[1] = c3.y;
                scratchVec3a[2] = c3.z;
                transformVec3Mat4w1(scratchVec3b, viewFromWorld, scratchVec3a);
                const x3 = scratchVec3b[0];
                const y3 = scratchVec3b[1];
                const z3 = scratchVec3b[2];
                const centerX = (x0 + x1 + x2 + x3) * 0.25;
                const centerY = (y0 + y1 + y2 + y3) * 0.25;
                const centerZ = (z0 + z1 + z2 + z3) * 0.25;
                const vertexCount = 6;
                const vertexData = new ArrayBuffer(STREAK_VERTEX_SIZE * vertexCount);
                const view = new DataView(vertexData);
                let baseOffset = 0;
                const writeCorner = (x: number, y: number, z: number, u: number, v: number): void => {
                    writeVertex(
                        view,
                        baseOffset,
                        x,
                        y,
                        z,
                        r,
                        g,
                        b,
                        a,
                        u,
                        v,
                    );
                    baseOffset += STREAK_VERTEX_SIZE;
                };
                // Triangle 1
                writeCorner(x0, y0, z0, uMin, vMin);
                writeCorner(x1, y1, z1, uMax, vMin);
                writeCorner(x2, y2, z2, uMax, vMax);
                // Triangle 2
                writeCorner(x0, y0, z0, uMin, vMin);
                writeCorner(x2, y2, z2, uMax, vMax);
                writeCorner(x3, y3, z3, uMin, vMax);
                submitPrimitive(
                    primitive.textureName,
                    primitive.additiveBlend === true,
                    primitive.depthTest !== false,
                    useAlphaClip,
                    vertexData,
                    vertexCount,
                    Math.hypot(centerX, centerY, centerZ),
                );
                continue;
            }
            if (primitive.kind !== "ribbon") {
                continue;
            }
            const points = primitive.points;
            if (!points || points.length < 2) {
                continue;
            }
            if (!Number.isFinite(primitive.width)) {
                continue;
            }
            const width = Math.abs(primitive.width);
            if (!(width > 1e-4)) {
                continue;
            }
            const alpha = clamp01(primitive.alpha, 1);
            if (alpha <= 0) {
                continue;
            }
            const baseR = clamp01(primitive.colorR ?? 1, 1);
            const baseG = clamp01(primitive.colorG ?? 1, 1);
            const baseB = clamp01(primitive.colorB ?? 1, 1);
            const r = Math.round(baseR * 255);
            const g = Math.round(baseG * 255);
            const b = Math.round(baseB * 255);
            const a = Math.round(alpha * 255);
            if (a <= 0) {
                continue;
            }
            const uScaleRaw = primitive.uScale ?? 1;
            const uScale = Number.isFinite(uScaleRaw) ? uScaleRaw : 1;
            const useAlphaClip = primitive.alphaClip === true
                && primitive.additiveBlend !== true
                && primitive.depthTest !== false;

            viewX.length = points.length;
            viewY.length = points.length;
            viewZ.length = points.length;
            sideX.length = points.length;
            sideY.length = points.length;
            sideZ.length = points.length;
            uCoords.length = points.length;
            let totalLen = 0;
            let centerX = 0;
            let centerY = 0;
            let centerZ = 0;
            for (let i = 0; i < points.length; i += 1) {
                const point = points[i];
                scratchVec3a[0] = point.x;
                scratchVec3a[1] = point.y;
                scratchVec3a[2] = point.z;
                transformVec3Mat4w1(scratchVec3b, viewFromWorld, scratchVec3a);
                viewX[i] = scratchVec3b[0];
                viewY[i] = scratchVec3b[1];
                viewZ[i] = scratchVec3b[2];
                centerX += scratchVec3b[0];
                centerY += scratchVec3b[1];
                centerZ += scratchVec3b[2];
                if (i > 0) {
                    const prev = points[i - 1];
                    const dx = point.x - prev.x;
                    const dy = point.y - prev.y;
                    const dz = point.z - prev.z;
                    totalLen += Math.hypot(dx, dy, dz);
                }
                uCoords[i] = totalLen;
            }
            const invLen = totalLen > 1e-5 ? 1 / totalLen : 0;
            for (let i = 0; i < uCoords.length; i += 1) {
                uCoords[i] = uCoords[i] * invLen * uScale;
            }

            let prevTangentX = 0;
            let prevTangentY = 1;
            let prevTangentZ = 0;
            let prevSideX = 1;
            let prevSideY = 0;
            let prevSideZ = 0;
            let hasPrevSide = false;
            const last = points.length - 1;
            for (let i = 0; i < points.length; i += 1) {
                const prevIdx = i > 0 ? i - 1 : i;
                const nextIdx = i < last ? i + 1 : i;
                let tangentX = viewX[nextIdx] - viewX[prevIdx];
                let tangentY = viewY[nextIdx] - viewY[prevIdx];
                let tangentZ = viewZ[nextIdx] - viewZ[prevIdx];
                const tangentLen = Math.hypot(tangentX, tangentY, tangentZ);
                if (tangentLen > 1e-5) {
                    const invTangentLen = 1 / tangentLen;
                    tangentX *= invTangentLen;
                    tangentY *= invTangentLen;
                    tangentZ *= invTangentLen;
                    prevTangentX = tangentX;
                    prevTangentY = tangentY;
                    prevTangentZ = tangentZ;
                } else {
                    tangentX = prevTangentX;
                    tangentY = prevTangentY;
                    tangentZ = prevTangentZ;
                }

                let toCamX = -viewX[i];
                let toCamY = -viewY[i];
                let toCamZ = -viewZ[i];
                const toCamLen = Math.hypot(toCamX, toCamY, toCamZ);
                if (toCamLen > 1e-5) {
                    const invToCamLen = 1 / toCamLen;
                    toCamX *= invToCamLen;
                    toCamY *= invToCamLen;
                    toCamZ *= invToCamLen;
                } else {
                    toCamX = 0;
                    toCamY = 0;
                    toCamZ = 1;
                }

                let outSideX = (tangentY * toCamZ) - (tangentZ * toCamY);
                let outSideY = (tangentZ * toCamX) - (tangentX * toCamZ);
                let outSideZ = (tangentX * toCamY) - (tangentY * toCamX);
                let outSideLen = Math.hypot(outSideX, outSideY, outSideZ);
                if (outSideLen <= 1e-5 && hasPrevSide) {
                    outSideX = prevSideX;
                    outSideY = prevSideY;
                    outSideZ = prevSideZ;
                    outSideLen = 1;
                }
                if (outSideLen <= 1e-5) {
                    outSideX = -tangentZ;
                    outSideY = 0;
                    outSideZ = tangentX;
                    outSideLen = Math.hypot(outSideX, outSideY, outSideZ);
                }
                if (outSideLen <= 1e-5) {
                    outSideX = 1;
                    outSideY = 0;
                    outSideZ = 0;
                    outSideLen = 1;
                }
                const invSideLen = 1 / outSideLen;
                outSideX *= invSideLen;
                outSideY *= invSideLen;
                outSideZ *= invSideLen;
                if (hasPrevSide) {
                    const dot = (outSideX * prevSideX) + (outSideY * prevSideY) + (outSideZ * prevSideZ);
                    if (dot < 0) {
                        outSideX = -outSideX;
                        outSideY = -outSideY;
                        outSideZ = -outSideZ;
                    }
                }
                sideX[i] = outSideX;
                sideY[i] = outSideY;
                sideZ[i] = outSideZ;
                prevSideX = outSideX;
                prevSideY = outSideY;
                prevSideZ = outSideZ;
                hasPrevSide = true;
            }

            const halfWidth = width * 0.5;
            const segmentCount = points.length - 1;
            const vertexCount = segmentCount * 6;
            const vertexData = new ArrayBuffer(STREAK_VERTEX_SIZE * vertexCount);
            const view = new DataView(vertexData);
            let baseOffset = 0;
            for (let i = 0; i < segmentCount; i += 1) {
                const next = i + 1;
                const offsetX0 = sideX[i] * halfWidth;
                const offsetY0 = sideY[i] * halfWidth;
                const offsetZ0 = sideZ[i] * halfWidth;
                const offsetX1 = sideX[next] * halfWidth;
                const offsetY1 = sideY[next] * halfWidth;
                const offsetZ1 = sideZ[next] * halfWidth;
                const u0 = uCoords[i];
                const u1 = uCoords[next];
                const x0l = viewX[i] + offsetX0;
                const y0l = viewY[i] + offsetY0;
                const z0l = viewZ[i] + offsetZ0;
                const x0r = viewX[i] - offsetX0;
                const y0r = viewY[i] - offsetY0;
                const z0r = viewZ[i] - offsetZ0;
                const x1l = viewX[next] + offsetX1;
                const y1l = viewY[next] + offsetY1;
                const z1l = viewZ[next] + offsetZ1;
                const x1r = viewX[next] - offsetX1;
                const y1r = viewY[next] - offsetY1;
                const z1r = viewZ[next] - offsetZ1;
                // Triangle 1
                writeVertex(
                    view,
                    baseOffset,
                    x0l,
                    y0l,
                    z0l,
                    r,
                    g,
                    b,
                    a,
                    u0,
                    0,
                );
                baseOffset += STREAK_VERTEX_SIZE;
                writeVertex(
                    view,
                    baseOffset,
                    x0r,
                    y0r,
                    z0r,
                    r,
                    g,
                    b,
                    a,
                    u0,
                    1,
                );
                baseOffset += STREAK_VERTEX_SIZE;
                writeVertex(
                    view,
                    baseOffset,
                    x1l,
                    y1l,
                    z1l,
                    r,
                    g,
                    b,
                    a,
                    u1,
                    0,
                );
                baseOffset += STREAK_VERTEX_SIZE;
                // Triangle 2
                writeVertex(
                    view,
                    baseOffset,
                    x1l,
                    y1l,
                    z1l,
                    r,
                    g,
                    b,
                    a,
                    u1,
                    0,
                );
                baseOffset += STREAK_VERTEX_SIZE;
                writeVertex(
                    view,
                    baseOffset,
                    x0r,
                    y0r,
                    z0r,
                    r,
                    g,
                    b,
                    a,
                    u0,
                    1,
                );
                baseOffset += STREAK_VERTEX_SIZE;
                writeVertex(
                    view,
                    baseOffset,
                    x1r,
                    y1r,
                    z1r,
                    r,
                    g,
                    b,
                    a,
                    u1,
                    1,
                );
                baseOffset += STREAK_VERTEX_SIZE;
            }

            const invPoints = 1 / points.length;
            submitPrimitive(
                primitive.textureName,
                primitive.additiveBlend === true,
                primitive.depthTest !== false,
                useAlphaClip,
                vertexData,
                vertexCount,
                Math.hypot(centerX * invPoints, centerY * invPoints, centerZ * invPoints),
            );
        }
    }

    private drawEffects(
        ctx: RenderContext,
        viewFromWorld: mat4,
        viewFromWorldPrev: mat4,
        viewFromWorldNoTilt: mat4,
    ): void {
        if (!this.effects || this.effects.length === 0) {
            return;
        }
        const cameraPos = scratchVec3g;
        mat4.getTranslation(cameraPos, ctx.viewerInput.camera.worldMatrix);
        const rp = scratchRenderParams;
        rp.reset();
        rp.sort = RenderSort.Translucent;
        rp.lighting = this.worldState.lighting;
        const glowModel = this.glowModel;
        const applyEffectDepthBias = (
            pos: { x: number; y: number; z: number },
            normal: { x: number; y: number; z: number } | undefined,
            scale: number | undefined,
            out: vec3,
        ): void => {
            out[0] = pos.x;
            out[1] = pos.y;
            out[2] = pos.z;
            const scaleMul = scale && Number.isFinite(scale) ? Math.max(1, scale) : 1;
            const bias = Math.min(EFFECT_DEPTH_BIAS_MAX, EFFECT_DEPTH_BIAS * scaleMul);
            if (!(bias > 0)) {
                return;
            }
            if (
                normal &&
                Number.isFinite(normal.x) &&
                Number.isFinite(normal.y) &&
                Number.isFinite(normal.z)
            ) {
                const len = Math.hypot(normal.x, normal.y, normal.z);
                if (len > 1e-4) {
                    const invLen = bias / len;
                    out[0] += normal.x * invLen;
                    out[1] += normal.y * invLen;
                    out[2] += normal.z * invLen;
                    return;
                }
            }
            const dirX = cameraPos[0] - pos.x;
            const dirY = cameraPos[1] - pos.y;
            const dirZ = cameraPos[2] - pos.z;
            const dirLen = Math.hypot(dirX, dirY, dirZ);
            if (dirLen > 1e-4) {
                const invLen = bias / dirLen;
                out[0] += dirX * invLen;
                out[1] += dirY * invLen;
                out[2] += dirZ * invLen;
            }
        };
        const drawGlow = (effect: EffectRenderState, scaleMul = 1): void => {
            if (!glowModel || !effect.glowPos || effect.glowDist === undefined) {
                return;
            }
            const effectViewFromWorld = effect.ignoreStageTilt ? viewFromWorldNoTilt : viewFromWorld;
            const dist = effect.glowDist;
            if (dist <= 0 || dist >= 0.5) {
                return;
            }
            const glowScale = (0.25 - dist * 0.5) * effect.scale * scaleMul;
            if (glowScale <= 0) {
                return;
            }
            const colorScale = 0.5 / (dist * 2 + 1);
            rp.alpha = 1;
            rp.colorMul.r = (effect.colorR ?? 1) * colorScale;
            rp.colorMul.g = (effect.colorG ?? 1) * colorScale;
            rp.colorMul.b = (effect.colorB ?? 1) * colorScale;
            rp.colorMul.a = 1;
            rp.megaStateFlags = this.glowMegaState;
            const glowPos = scratchVec3h;
            applyEffectDepthBias(effect.glowPos, effect.normal, effect.scale, glowPos);
            mat4.translate(rp.viewFromModel, effectViewFromWorld, glowPos);
            if (effect.glowRotY !== undefined) {
                mat4.rotateY(rp.viewFromModel, rp.viewFromModel, S16_TO_RADIANS * effect.glowRotY);
            }
            if (effect.glowRotX !== undefined) {
                mat4.rotateX(rp.viewFromModel, rp.viewFromModel, S16_TO_RADIANS * effect.glowRotX);
            }
            mat4.scale(rp.viewFromModel, rp.viewFromModel, [glowScale, glowScale, glowScale]);
            glowModel.prepareToRender(ctx, rp);
            rp.megaStateFlags = undefined;
            rp.colorMul.r = 1;
            rp.colorMul.g = 1;
            rp.colorMul.b = 1;
            rp.colorMul.a = 1;
        };
        const drawFlash = (effect: EffectRenderState): void => {
            const effectViewFromWorld = effect.ignoreStageTilt ? viewFromWorldNoTilt : viewFromWorld;
            const flashPos = effect.glowPos ?? effect.pos;
            const flashRotX = effect.glowRotX ?? effect.rotX;
            const flashRotY = effect.glowRotY ?? effect.rotY;
            if (flashRotX === undefined || flashRotY === undefined) {
                return;
            }
            const intensity = effect.alpha;
            if (intensity <= 1 / 255) {
                return;
            }
            const scale = effect.scale * 2.5;
            rp.alpha = 1;
            const flashIntensity = Math.min(1.0, intensity * 0.5);
            rp.colorMul.r = flashIntensity;
            rp.colorMul.g = flashIntensity;
            rp.colorMul.b = flashIntensity * 0.8;
            rp.colorMul.a = 1;
            rp.megaStateFlags = this.flashMegaState;
            const biasedFlashPos = scratchVec3h;
            applyEffectDepthBias(flashPos, effect.normal, effect.scale, biasedFlashPos);
            mat4.translate(rp.viewFromModel, effectViewFromWorld, biasedFlashPos);
            mat4.rotateY(rp.viewFromModel, rp.viewFromModel, S16_TO_RADIANS * flashRotY);
            mat4.rotateX(rp.viewFromModel, rp.viewFromModel, S16_TO_RADIANS * flashRotX);
            mat4.scale(rp.viewFromModel, rp.viewFromModel, [scale, scale, scale]);
            glowModel?.prepareToRender(ctx, rp);

            rp.megaStateFlags = undefined;
            rp.colorMul.r = 1;
            rp.colorMul.g = 1;
            rp.colorMul.b = 1;
            rp.colorMul.a = 1;
        };
        const drawSparkleSprite = (effect: EffectRenderState): void => {
            if (!this.sparkleTextureReady || !this.sparkleTextureMapping) {
                return;
            }
            const effectViewFromWorld = effect.ignoreStageTilt ? viewFromWorldNoTilt : viewFromWorld;
            const mapping = this.sparkleTextureMapping;
            if (!mapping.gfxTexture || !mapping.gfxSampler) {
                return;
            }
            const posView = scratchVec3d;
            scratchVec3d[0] = effect.pos.x;
            scratchVec3d[1] = effect.pos.y;
            scratchVec3d[2] = effect.pos.z;
            transformVec3Mat4w1(posView, effectViewFromWorld, scratchVec3d);
            const size = effect.scale;
            if (!(size > 0)) {
                return;
            }
            const x = posView[0];
            const y = posView[1];
            const z = posView[2];
            const r = Math.round(Math.min(1, Math.max(0, effect.colorR ?? 1)) * 255);
            const g = Math.round(Math.min(1, Math.max(0, effect.colorG ?? 1)) * 255);
            const b = Math.round(Math.min(1, Math.max(0, effect.colorB ?? 1)) * 255);
            const a = Math.round(Math.min(1, Math.max(0, effect.alpha)) * 255);
            if (a <= 0) {
                return;
            }
            const left = x - size;
            const right = x + size;
            const top = y + size;
            const bottom = y - size;

            const vertexData = new ArrayBuffer(STREAK_VERTEX_SIZE * 6);
            const view = new DataView(vertexData);
            const writeVertex = (
                baseOffset: number,
                vx: number,
                vy: number,
                vz: number,
                u: number,
                v: number
            ) => {
                view.setFloat32(baseOffset + 0, vx, true);
                view.setFloat32(baseOffset + 4, vy, true);
                view.setFloat32(baseOffset + 8, vz, true);
                view.setUint8(baseOffset + 12, r);
                view.setUint8(baseOffset + 13, g);
                view.setUint8(baseOffset + 14, b);
                view.setUint8(baseOffset + 15, a);
                view.setFloat32(baseOffset + 16, u, true);
                view.setFloat32(baseOffset + 20, v, true);
            };

            // Triangle 1: top-left, top-right, bottom-left
            writeVertex(0, left, top, z, 0, 0);
            writeVertex(STREAK_VERTEX_SIZE, right, top, z, 1, 0);
            writeVertex(STREAK_VERTEX_SIZE * 2, left, bottom, z, 0, 1);
            // Triangle 2: bottom-left, top-right, bottom-right
            writeVertex(STREAK_VERTEX_SIZE * 3, left, bottom, z, 0, 1);
            writeVertex(STREAK_VERTEX_SIZE * 4, right, top, z, 1, 0);
            writeVertex(STREAK_VERTEX_SIZE * 5, right, bottom, z, 1, 1);

            const vbuf = ctx.renderInstManager.gfxRenderCache.dynamicBufferCache.allocateData(
                GfxBufferUsage.Vertex,
                new Uint8Array(vertexData),
            );
            const renderInst = ctx.renderInstManager.newRenderInst();
            renderInst.setBindingLayouts(gxBindingLayouts);
            fillSceneParamsDataOnTemplate(renderInst, ctx.viewerInput, 0, this.worldState.time.getAnimTimeFrames());
            renderInst.setGfxProgram(this.streakProgram);
            renderInst.setPrimitiveTopology(GfxPrimitiveTopology.Triangles);
            renderInst.setMegaStateFlags(this.streakMegaState);
            renderInst.setVertexInput(this.streakInputLayout, [vbuf], null);
            renderInst.setDrawCount(6);
            renderInst.setSamplerBindingsFromTextureMappings([mapping]);
            renderInst.setAllowSkippingIfPipelineNotReady(false);
            renderInst.sortKey = -Math.hypot(x, y, z);
            ctx.translucentInstList.submitRenderInst(renderInst);
        };
        const streakSeen = new Set<number>();
        for (const effect of this.effects) {
            rp.alpha = effect.alpha;
            if (effect.kind === "streak") {
                const effectViewFromWorld = effect.ignoreStageTilt ? viewFromWorldNoTilt : viewFromWorld;
                streakSeen.add(effect.id);
                const start = scratchVec3a;
                const end = scratchVec3b;
                scratchVec3d[0] = effect.pos.x;
                scratchVec3d[1] = effect.pos.y;
                scratchVec3d[2] = effect.pos.z;
                transformVec3Mat4w1(end, effectViewFromWorld, scratchVec3d);
                const nowMs = ctx.viewerInput.time;
                const persistenceMs = 33.4;
                const history = this.streakHistory.get(effect.id);
                if (!history) {
                    const prev = vec3.clone(end);
                    const older = vec3.clone(end);
                    this.streakHistory.set(effect.id, { older, prev, lastUpdate: nowMs });
                    vec3.copy(start, end);
                } else {
                    let lastUpdate = history.lastUpdate;
                    if (nowMs > lastUpdate + persistenceMs) {
                        const steps = Math.min(4, Math.floor((nowMs - lastUpdate) / persistenceMs));
                        for (let i = 0; i < steps; i += 1) {
                            vec3.copy(history.older, history.prev);
                            vec3.copy(history.prev, end);
                            lastUpdate += persistenceMs;
                        }
                        history.lastUpdate = lastUpdate;
                    }
                    const ratio = Math.min(1, Math.max(0, (nowMs - history.lastUpdate) / persistenceMs));
                    start[0] = history.older[0] + (history.prev[0] - history.older[0]) * ratio;
                    start[1] = history.older[1] + (history.prev[1] - history.older[1]) * ratio;
                    start[2] = history.older[2] + (history.prev[2] - history.older[2]) * ratio;
                }
                const fov = ctx.viewerInput.camera.fovY;
                const tanHalfFov = Math.tan(fov * 0.5);
                // SMB2 stretches spark streaks in screen space using camera-relative positions.
                const tailX = start[0];
                const tailY = start[1];
                const tailZ = start[2];
                if (end[2] >= -0.001 || tailZ >= -0.001) {
                    continue;
                }
                const backbufferHeight = Math.max(1, ctx.viewerInput.backbufferHeight);
                const endInvZ = 1 / Math.abs(end[2]);
                const tailInvZ = 1 / Math.abs(tailZ);
                const endScreenX = end[0] * endInvZ;
                const endScreenY = end[1] * endInvZ;
                let tailScreenX = tailX * tailInvZ;
                let tailScreenY = tailY * tailInvZ;
                let dirX = endScreenX - tailScreenX;
                let dirY = endScreenY - tailScreenY;
                let dirLen = Math.hypot(dirX, dirY);
                const lifeRatio = Math.min(1, Math.max(0, effect.lifeRatio ?? effect.alpha));
                let thicknessPx = 27;
                if (end[2] <= 0) {
                    if (end[2] <= -3) {
                        thicknessPx = 9;
                    } else {
                        thicknessPx = (end[2] + 3 + 1.5) * 6;
                    }
                }
                const depth = Math.max(0.001, Math.max(-end[2], -tailZ));
                const pixelScale = (2 / backbufferHeight) * (depth / tanHalfFov);
                const resScale = backbufferHeight / 1200;
                const spriteSize = Math.max(
                    0.00001,
                    thicknessPx * pixelScale * effect.scale * 0.12 * lifeRatio * resScale,
                );
                if (dirLen * 100 < spriteSize * 2) {
                    if (dirLen < 1e-4) {
                        dirLen = 1;
                        dirX = 1;
                        dirY = 0;
                    }
                    const invDirLen = 1 / dirLen;
                    const screenDirX = dirX * invDirLen;
                    const screenDirY = dirY * invDirLen;
                    tailScreenX = endScreenX - screenDirX * spriteSize * 0.02;
                    tailScreenY = endScreenY - screenDirY * spriteSize * 0.02;
                    dirX = endScreenX - tailScreenX;
                    dirY = endScreenY - tailScreenY;
                    dirLen = Math.hypot(dirX, dirY);
                }
                if (dirLen < 1e-4) {
                    continue;
                }
                const invDirLen = 1 / dirLen;
                const rightX = dirY * invDirLen;
                const rightY = -dirX * invDirLen;
                const trueDist = Math.hypot(dirX, dirY) * Math.max(Math.abs(tailZ), Math.abs(end[2]));
                const clampDist = Math.min(trueDist, spriteSize);
                const sizeFixX = -dirX * invDirLen * (spriteSize - clampDist);
                const sizeFixY = -dirY * invDirLen * (spriteSize - clampDist);
                const posFixX = dirX * invDirLen * (spriteSize - clampDist) * 0.5;
                const posFixY = dirY * invDirLen * (spriteSize - clampDist) * 0.5;
                const tailBaseX = tailX + sizeFixX + posFixX;
                const tailBaseY = tailY + sizeFixY + posFixY;
                const headBaseX = end[0] + posFixX;
                const headBaseY = end[1] + posFixY;
                const head0 = scratchVec3c;
                const head1 = scratchVec3d;
                const tail0 = scratchVec3e;
                const tail1 = scratchVec3f;
                head0[0] = headBaseX + rightX * spriteSize;
                head0[1] = headBaseY + rightY * spriteSize;
                head0[2] = end[2];
                head1[0] = headBaseX - rightX * spriteSize;
                head1[1] = headBaseY - rightY * spriteSize;
                head1[2] = end[2];
                tail0[0] = tailBaseX + rightX * spriteSize;
                tail0[1] = tailBaseY + rightY * spriteSize;
                tail0[2] = tailZ;
                tail1[0] = tailBaseX - rightX * spriteSize;
                tail1[1] = tailBaseY - rightY * spriteSize;
                tail1[2] = tailZ;

                const baseR = Math.min(1, Math.max(0, effect.colorR ?? 1));
                const baseG = Math.min(1, Math.max(0, effect.colorG ?? 1));
                const baseB = Math.min(1, Math.max(0, effect.colorB ?? 1));
                const headR = Math.round(baseR * 255);
                const headG = Math.round(baseG * 255);
                const headB = Math.round(baseB * 255);
                const tailR = Math.round(baseR * 96);
                const tailG = Math.round(baseG * 88);
                const tailB = Math.round(baseB * 8);
                const alpha = Math.round(Math.min(1, Math.max(0, effect.alpha)) * 255);

                const vertexData = new ArrayBuffer(STREAK_VERTEX_SIZE * 6);
                const view = new DataView(vertexData);
                const writeVertex = (
                    baseOffset: number,
                    x: number,
                    y: number,
                    z: number,
                    r: number,
                    g: number,
                    b: number,
                    a: number,
                    u: number,
                    v: number,
                ) => {
                    view.setFloat32(baseOffset + 0, x, true);
                    view.setFloat32(baseOffset + 4, y, true);
                    view.setFloat32(baseOffset + 8, z, true);
                    view.setUint8(baseOffset + 12, r);
                    view.setUint8(baseOffset + 13, g);
                    view.setUint8(baseOffset + 14, b);
                    view.setUint8(baseOffset + 15, a);
                    view.setFloat32(baseOffset + 16, u, true);
                    view.setFloat32(baseOffset + 20, v, true);
                };

                // Triangle 1: head0, head1, tail0
                writeVertex(0, head0[0], head0[1], head0[2], headR, headG, headB, alpha, 1, 0);
                writeVertex(STREAK_VERTEX_SIZE, head1[0], head1[1], head1[2], headR, headG, headB, alpha, 1, 1);
                writeVertex(STREAK_VERTEX_SIZE * 2, tail0[0], tail0[1], tail0[2], tailR, tailG, tailB, alpha, 0, 0);
                // Triangle 2: tail0, head1, tail1
                writeVertex(STREAK_VERTEX_SIZE * 3, tail0[0], tail0[1], tail0[2], tailR, tailG, tailB, alpha, 0, 0);
                writeVertex(STREAK_VERTEX_SIZE * 4, head1[0], head1[1], head1[2], headR, headG, headB, alpha, 1, 1);
                writeVertex(STREAK_VERTEX_SIZE * 5, tail1[0], tail1[1], tail1[2], tailR, tailG, tailB, alpha, 0, 1);

                const vbuf = ctx.renderInstManager.gfxRenderCache.dynamicBufferCache.allocateData(
                    GfxBufferUsage.Vertex,
                    new Uint8Array(vertexData),
                );
                const renderInst = ctx.renderInstManager.newRenderInst();
                renderInst.setBindingLayouts(gxBindingLayouts);
                fillSceneParamsDataOnTemplate(renderInst, ctx.viewerInput, 0, this.worldState.time.getAnimTimeFrames());
                renderInst.setGfxProgram(this.streakProgram);
                renderInst.setPrimitiveTopology(GfxPrimitiveTopology.Triangles);
                renderInst.setMegaStateFlags(this.streakMegaState);
                renderInst.setVertexInput(this.streakInputLayout, [vbuf], null);
                renderInst.setDrawCount(6);
                renderInst.setSamplerBindingsFromTextureMappings([this.getStreakTextureMapping(effect.textureName)]);
                renderInst.setAllowSkippingIfPipelineNotReady(false);
                renderInst.sortKey = -Math.hypot(end[0], end[1], end[2]);
                ctx.translucentInstList.submitRenderInst(renderInst);
                drawGlow(effect);
                continue;
            }

            if (effect.kind === "sparkle") {
                drawSparkleSprite(effect);
                continue;
            }

            if (effect.kind === "flash") {
                drawFlash(effect);
                continue;
            }
            let model: ModelInterface | null = this.sparkModel;
            if (effect.modelVariant === "bonusshot") {
                model = this.bonusShotModel ?? model;
            } else if (effect.modelVariant === "bonusshot_tail") {
                model = this.bonusShotTailNlModel ?? this.bonusShotTailModel ?? model;
            }
            if (!model) {
                continue;
            }
            const effectViewFromWorld = effect.ignoreStageTilt ? viewFromWorldNoTilt : viewFromWorld;
            const starPos = scratchVec3h;
            applyEffectDepthBias(effect.pos, effect.normal, effect.scale, starPos);
            if (effect.modelVariant === "bonusshot_tail") {
                // Match SMB bonus tail display: camera-facing sprite with a view-space Z spin.
                const viewPos = scratchVec3a;
                transformVec3Mat4w1(viewPos, effectViewFromWorld, starPos);
                mat4.fromTranslation(rp.viewFromModel, viewPos);
                if (effect.scale !== 1) {
                    mat4.scale(rp.viewFromModel, rp.viewFromModel, [effect.scale, effect.scale, effect.scale]);
                }
                const tailRotZ = (viewPos[0] * 325.0 + viewPos[1] * 655.0) | 0;
                mat4.rotateZ(rp.viewFromModel, rp.viewFromModel, S16_TO_RADIANS * tailRotZ);
                model.prepareToRender(ctx, rp);
                continue;
            }
            mat4.translate(rp.viewFromModel, effectViewFromWorld, starPos);
            if (effect.rotY !== undefined) {
                mat4.rotateY(rp.viewFromModel, rp.viewFromModel, S16_TO_RADIANS * effect.rotY);
            }
            if (effect.rotX !== undefined) {
                mat4.rotateX(rp.viewFromModel, rp.viewFromModel, S16_TO_RADIANS * effect.rotX);
            }
            if (effect.rotZ !== undefined) {
                mat4.rotateZ(rp.viewFromModel, rp.viewFromModel, S16_TO_RADIANS * effect.rotZ);
            }
            if (effect.modelVariant !== "bonusshot" && effect.scale !== 1) {
                mat4.scale(rp.viewFromModel, rp.viewFromModel, [effect.scale, effect.scale, effect.scale]);
            }
            model.prepareToRender(ctx, rp);
            if (effect.modelVariant === "bonusshot" && this.bonusShotGlowModel) {
                const viewPos = scratchVec3a;
                const worldPos = scratchVec3b;
                worldPos[0] = effect.pos.x;
                worldPos[1] = effect.pos.y;
                worldPos[2] = effect.pos.z;
                transformVec3Mat4w1(viewPos, effectViewFromWorld, worldPos);
                if (viewPos[2] < -30.0) {
                    const f3 = (viewPos[2] + 26.0) / viewPos[2];
                    if (f3 > 0) {
                        worldPos[0] = viewPos[0] * f3;
                        worldPos[1] = viewPos[1] * f3;
                        worldPos[2] = viewPos[2] * f3;
                        const glowScale = effect.alpha * 0.5 + 0.5;
                        const glowColor = effect.alpha * 0.75;
                        rp.alpha = 1;
                        rp.colorMul.r = glowColor;
                        rp.colorMul.g = glowColor;
                        rp.colorMul.b = glowColor;
                        rp.colorMul.a = 1;
                        rp.megaStateFlags = { depthWrite: false };
                        mat4.fromTranslation(rp.viewFromModel, worldPos);
                        mat4.scale(rp.viewFromModel, rp.viewFromModel, [glowScale, glowScale, glowScale]);
                        this.bonusShotGlowModel.prepareToRender(ctx, rp);
                        rp.megaStateFlags = undefined;
                        rp.colorMul.r = 1;
                        rp.colorMul.g = 1;
                        rp.colorMul.b = 1;
                        rp.colorMul.a = 1;
                        rp.alpha = effect.alpha;
                    }
                }
            }
            if (effect.kind === "star" && effect.modelVariant !== "bonusshot") {
                drawGlow(effect);
            }
        }
        if (this.streakHistory.size > 0) {
            for (const id of this.streakHistory.keys()) {
                if (!streakSeen.has(id)) {
                    this.streakHistory.delete(id);
                }
            }
        }
    }

    public destroy(device: GfxDevice): void {
        this.worldState.modelCache.destroy(device); // Destroys GPU resources that transitively exist in cache
        if (this.nlStageModelCache) {
            for (const model of this.nlStageModelCache.values()) {
                model.destroy(device);
            }
            this.nlStageModelCache.clear();
        }
        this.goalTapeModel?.destroy(device);
        this.bonusShotTailNlModel?.destroy(device);
        this.shadowTextureCache.destroy(device);
        this.nlTextureCache?.destroy(device);
        for (const [name, mapping] of this.streakTextureMappings.entries()) {
            if (!this.streakExternalTextureOwned.has(name)) {
                continue;
            }
            if (mapping.gfxTexture && mapping.gfxTexture !== this.streakDefaultTexture.gfxTexture) {
                device.destroyTexture(mapping.gfxTexture);
            }
        }
        for (const [name, mapping] of this.ballTextureMappings.entries()) {
            if (!this.ballExternalTextureOwned.has(name)) {
                continue;
            }
            if (mapping.gfxTexture && mapping.gfxTexture !== this.streakDefaultTexture.gfxTexture) {
                device.destroyTexture(mapping.gfxTexture);
            }
        }
        if (this.streakDefaultTexture.gfxTexture) {
            device.destroyTexture(this.streakDefaultTexture.gfxTexture);
        }
        if (this.streakDefaultTexture.gfxSampler) {
            device.destroySampler(this.streakDefaultTexture.gfxSampler);
        }
        if (this.mirrorColorMapping.gfxSampler) {
            device.destroySampler(this.mirrorColorMapping.gfxSampler);
        }
        if (this.mirrorDistortMapping.gfxSampler) {
            device.destroySampler(this.mirrorDistortMapping.gfxSampler);
        }
        if (this.wormholeColorMapping.gfxSampler) {
            device.destroySampler(this.wormholeColorMapping.gfxSampler);
        }
        if (this.mirrorGradMapping.gfxSampler) {
            device.destroySampler(this.mirrorGradMapping.gfxSampler);
        }
        if (this.wormholeScreenOverlayWarpMapping.gfxSampler) {
            device.destroySampler(this.wormholeScreenOverlayWarpMapping.gfxSampler);
        }
        if (this.mirrorGradOwnsTexture && this.mirrorGradMapping.gfxTexture) {
            device.destroyTexture(this.mirrorGradMapping.gfxTexture);
        }
        if (this.sparkleTextureMapping?.gfxTexture) {
            device.destroyTexture(this.sparkleTextureMapping.gfxTexture);
        }
        if (this.sparkleTextureMapping?.gfxSampler) {
            device.destroySampler(this.sparkleTextureMapping.gfxSampler);
        }
    }
}
