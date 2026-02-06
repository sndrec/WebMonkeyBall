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
import type {
    BananaRenderState,
    ConfettiRenderState,
    EffectRenderState,
    JamabarRenderState,
    GoalBagRenderState,
    GoalTapeRenderState,
    StageTiltRenderState,
    SwitchRenderState,
} from "./Render.js";
import * as SD from "./Stagedef.js";
import { BgInfos, StageId, StageInfo } from "./StageInfo.js";
import { MkbTime } from "./Utils.js";
import { AnimGroup } from "./AnimGroup.js";
import { Lighting, LightingGroups } from "./Lighting.js";
import { CommonModelID } from "./ModelInfo.js";
import { GAME_SOURCES } from "../../constants.js";
import { CommonNlModelID } from "./NlModelInfo.js";
import { S16_TO_RADIANS } from "./Utils.js";
import { Vec3Zero, transformVec3Mat4w0, transformVec3Mat4w1 } from "../MathHelpers.js";
import { TevLayerInst } from "./TevLayer.js";
import { BONUS_WAVE_MODEL_NAME, BONUS_WAVE_VERTEX_GLOBAL, createBonusWaveMaterialHacks } from "./BonusWave.js";

// Immutable parsed stage definition
export type StageData = {
    stageInfo: StageInfo;
    stagedef: SD.Stage;
    stageGma: Gma.Gma;
    bgGma: Gma.Gma;
    commonGma: Gma.Gma;
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
    // TODO(complexplane): Itemgroup animation state (for raycasts)
    // TODO(complexplane): Stage bounding sphere (for asteroids in Space?)
};

export type BallRenderState = {
    pos: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
    radius: number;
    visible: boolean;
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
const EFFECT_DEPTH_BIAS = 0.2;
const EFFECT_DEPTH_BIAS_MAX = 0.5;
const SPARKLE_TEXTURE_PATH = "assets/particle/beautifulstar.png";
const MIRROR_FLAT_UBO_INDEX = 1;
const MIRROR_FLAT_UBO_WORDS = 36;
const MIRROR_WAVY_UBO_INDEX = 1;
const MIRROR_WAVY_UBO_WORDS = 60;
const MIRROR_DISTORT_UBO_INDEX = 1;
const MIRROR_DISTORT_UBO_WORDS = 16;
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

out vec3 v_ShadowPos;
out vec2 v_ShadowUV;

void main() {
    mat4 proj = UnpackMatrix(u_Projection);
    mat4 viewFromModel = UnpackMatrix(u_ViewFromModel);
    mat4 shadowFromView = UnpackMatrix(u_ShadowFromView);
    vec4 posView = viewFromModel * vec4(a_Position.xyz, 1.0);
    vec4 posShadow = shadowFromView * posView;
    v_ShadowPos = posShadow.xyz;
    v_ShadowUV = posShadow.xy / (u_ShadowInfo.x * 2.0) + vec2(0.5);
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

out vec4 o_Color;

void main() {
    if (v_ShadowUV.x < 0.0 || v_ShadowUV.x > 1.0 || v_ShadowUV.y < 0.0 || v_ShadowUV.y > 1.0) {
        discard;
    }
    vec4 tex = texture(u_Texture, v_ShadowUV);
    float dist = u_ShadowInfo.y - v_ShadowPos.z;
    float fade = clamp(1.0 - dist * u_ShadowInfo.z, 0.0, 1.0);
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

layout(std140) uniform ub_SceneParams {
    Mat4x4 u_Projection;
    vec4 u_Misc0;
};

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
    mat4 viewFromModel = UnpackMatrix(u_ViewFromModel);
    vec4 posView = viewFromModel * vec4(a_Position.xyz, 1.0);
    gl_Position = UnpackMatrix(u_Projection) * posView;
    v_MirrorClip = UnpackMatrix(u_MirrorClipFromModel) * vec4(a_Position.xyz, 1.0);
    v_DistortClip = UnpackMatrix(u_DistortClipFromModel) * vec4(a_Position.xyz, 1.0);
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

float IndMask(float n, int mask) { return float(int(n) & mask); }

vec2 Project(vec4 clipPos) {
    vec2 uv = clipPos.xy / clipPos.w;
    return uv * 0.5 + vec2(0.5);
}

void main() {
    vec2 mirrorUV = clamp(Project(v_MirrorClip), 0.0, 1.0);
    vec2 distortUV = clamp(Project(v_DistortClip), 0.0, 1.0);

    vec3 indCoord = 255.0 * texture(u_DistortTexture, distortUV).abg;
    indCoord = vec3(
        IndMask(indCoord.x, 0xF8),
        IndMask(indCoord.y, 0xF8),
        IndMask(indCoord.z, 0xF8)
    );
    indCoord += vec3(-128.0);
    vec2 indOffset = vec2(
        dot(u_IndTexMtx0.xyz, indCoord),
        dot(u_IndTexMtx1.xyz, indCoord)
    ) * (1.0 / 256.0);

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

    vec3 normalView = normalize((viewFromModel * vec4(t_Normal, 0.0)).xyz);
    v_TexCoord = normalView.xz * 0.5 + vec2(0.5);
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
    private models: ModelInst[];
    private modelDepthOffsets: number[];
    private modelDisableSpecular: boolean[];
    private visible = false;
    private pos = vec3.create();
    private rotation = quat.create();
    private scale = vec3.create();
    private modelFromBall = mat4.create();

    constructor(modelCache: ModelCache, stageData: StageData) {
        const models: ModelInst[] = [];
        const modelDepthOffsets: number[] = [];
        const modelDisableSpecular: boolean[] = [];
        const usesSmb2Models = stageData.gameSource === 'smb2' || stageData.gameSource === 'mb2ws';
        if (usesSmb2Models) {
            const inside = modelCache.getModel("BALL_INSIDE", GmaSrc.Common);
            const outside = modelCache.getModel("BALL_OUTSIDE", GmaSrc.Common);
            if (inside) {
                models.push(inside);
                modelDepthOffsets.push(2);
                modelDisableSpecular.push(true);
            }
            if (outside) {
                models.push(outside);
                modelDepthOffsets.push(0);
                modelDisableSpecular.push(false);
            }
        } else {
            const clearInside = modelCache.getModel(CommonModelID.CLEAR_HEMI_INSIDE, GmaSrc.Common);
            const coloredInside = modelCache.getModel(CommonModelID.RED_HEMI_INSIDE, GmaSrc.Common);
            const edge = modelCache.getModel(CommonModelID.SPHERE_EDGE_01_RED, GmaSrc.Common);
            const clearOutside = modelCache.getModel(CommonModelID.CLEAR_HEMI_OUTSIDE, GmaSrc.Common);
            const coloredOutside = modelCache.getModel(CommonModelID.RED_HEMI_OUTSIDE, GmaSrc.Common);
            if (clearInside) {
                models.push(clearInside);
                modelDepthOffsets.push(4);
                modelDisableSpecular.push(true);
            }
            if (coloredInside) {
                models.push(coloredInside);
                modelDepthOffsets.push(3);
                modelDisableSpecular.push(true);
            }
            if (edge) {
                models.push(edge);
                modelDepthOffsets.push(2);
                modelDisableSpecular.push(false);
            }
            if (clearOutside) {
                models.push(clearOutside);
                modelDepthOffsets.push(1);
                modelDisableSpecular.push(false);
            }
            if (coloredOutside) {
                models.push(coloredOutside);
                modelDepthOffsets.push(0);
                modelDisableSpecular.push(false);
            }
        }
        this.models = models;
        this.modelDepthOffsets = modelDepthOffsets;
        this.modelDisableSpecular = modelDisableSpecular;
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
    }

    public prepareToRender(state: WorldState, ctx: RenderContext): void {
        if (!this.visible || this.models.length === 0) return;

        const rp = new RenderParams();
        rp.reset();
        rp.sort = RenderSort.Translucent;
        rp.lighting = state.lighting;
        mat4.fromRotationTranslationScale(this.modelFromBall, this.rotation, this.pos, this.scale);
        const viewFromWorld = ctx.viewFromWorld ?? ctx.viewerInput.camera.viewMatrix;
        mat4.mul(rp.viewFromModel, viewFromWorld, this.modelFromBall);

        for (let i = 0; i < this.models.length; i++) {
            rp.depthOffset = this.modelDepthOffsets[i] ?? 0;
            // Hack: the OG ball's inner shells appear to be unlit by specular.
            rp.disableSpecular = this.modelDisableSpecular[i] ?? false;
            this.models[i].prepareToRender(ctx, rp);
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
    private streakInputLayout!: GfxInputLayout;
    private streakDefaultTexture = new GXTextureMapping();
    private streakTextureSources = new Map<string, TextureInputGX>();
    private streakTextureMappings = new Map<string, GXTextureMapping>();
    private lastStreakLogTime = -1;
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
    private mirrorFlatProgram!: GfxProgram;
    private mirrorWavyProgram!: GfxProgram;
    private mirrorDistortProgram!: GfxProgram;
    private mirrorColorMapping = new GXTextureMapping();
    private mirrorDistortMapping = new GXTextureMapping();
    private mirrorGradMapping = new GXTextureMapping();
    private mirrorGradOwnsTexture = false;
    private mirrorModelNames = new Set<string>();
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
        setAttachmentStateSimple({ depthWrite: true, cullMode: GfxCullMode.None }, {
            blendMode: GfxBlendMode.Add,
            blendSrcFactor: GfxBlendFactor.One,
            blendDstFactor: GfxBlendFactor.Zero,
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
        };
        let goalTimerDigits: GoalTimerDigits | null = null;
        const hasStageNlObj = (stageData.stageNlObj?.size ?? 0) > 0;
        if (stageData.nlObj.size > 0 || hasStageNlObj) {
            this.nlTextureCache = new TextureCache();
            const smallDigits: (ModelInterface | null)[] = [];
            const largeDigits: (ModelInterface | null)[] = [];
            for (let i = 0; i < 10; i++) {
                smallDigits.push(
                    getNlModelInst(
                        device,
                        renderCache,
                        stageData.nlObj,
                        this.nlTextureCache,
                        CommonNlModelID.S_LCD_0 + i
                    )
                );
                largeDigits.push(
                    getNlModelInst(
                        device,
                        renderCache,
                        stageData.nlObj,
                        this.nlTextureCache,
                        CommonNlModelID.L_LCD_0 + i
                    )
                );
            }
            goalTimerDigits = { small: smallDigits, large: largeDigits };
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
        const shouldLogNaomi = stageData.stageInfo.id === StageId.St092_Bonus_Wave;
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
        const missingConfetti = this.confettiModels
            .map((model, index) => (model ? null : index))
            .filter((index) => index !== null);
        if (missingConfetti.length > 0) {
            console.log("confetti models missing", missingConfetti);
        }

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
        this.initSparkleTexture(device);

        const nlStageModels = hasStageNlObj && this.nlTextureCache && stageData.stageNlObjNameMap
            ? {
                obj: stageData.stageNlObj!,
                nameMap: stageData.stageNlObjNameMap,
                textureCache: this.nlTextureCache,
                nameList: Array.from(stageData.stageNlObjNameMap.keys()),
            }
            : null;
        if (shouldLogNaomi) {
            const stageNames = new Set<string>();
            for (const group of stageData.stagedef.animGroups) {
                for (const model of group.animGroupModels) {
                    stageNames.add(model.modelName);
                }
            }
            const stageNameList = Array.from(stageNames.values());
            console.log(
                "[bonus-wave] animGroupModels",
                stageNameList.length,
                stageNameList.slice(0, 50)
            );
            if (nlStageModels) {
                console.log(
                    "[bonus-wave] nlObj names",
                    nlStageModels.nameList.length,
                    nlStageModels.nameList.slice(0, 50)
                );
            } else {
                console.log("[bonus-wave] nlObj names: none");
            }
        }
        const resolveStageModel = nlStageModels
            ? (name: string) => {
                if (!this.nlStageModelCache) {
                    this.nlStageModelCache = new Map();
                }
                const cached = this.nlStageModelCache.get(name);
                if (cached) {
                    return cached;
                }
                let matchReason = "direct";
                let modelIndex = nlStageModels.nameMap.get(name);
                if (modelIndex === undefined) {
                    matchReason = "map";
                    modelIndex = nlStageModels.nameMap.get(`${name}_MAP`);
                }
                if (modelIndex === undefined) {
                    matchReason = "prefix";
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
                if (shouldLogNaomi) {
                    console.log("[bonus-wave] resolve", name, modelIndex, matchReason);
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
            } else if (shouldLogNaomi) {
                console.log("[bonus-wave] bonus model missing", BONUS_WAVE_MODEL_NAME);
            }
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
        this.ball = new BallInst(this.worldState.modelCache, stageData);
        this.balls = [this.ball];
        this.shadowProgram = createShadowProgram(renderCache);
        this.shadowMegaState.depthWrite = false;
        this.streakProgram = createStreakProgram(renderCache);
        this.mirrorFlatProgram = createMirrorFlatProgram(renderCache);
        this.mirrorWavyProgram = createMirrorWavyProgram(renderCache);
        this.mirrorDistortProgram = createMirrorDistortProgram(renderCache);
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
        this.mirrorGradMapping.gfxSampler = device.createSampler(mirrorSamplerDesc);
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
                this.balls[i] = new BallInst(this.worldState.modelCache, this.stageData);
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
        if (bananasByGroup) {
            for (let i = 0; i < bananasByGroup.length; i++) {
                bananasByGroup[i].length = 0;
            }
            for (const banana of this.bananas ?? []) {
                const group = banana.animGroupId;
                if (group >= 0 && group < bananasByGroup.length) {
                    bananasByGroup[group].push(banana);
                }
            }
        }
        const jamabarsByGroup = this.jamabars ? this.jamabarsByGroup : null;
        if (jamabarsByGroup) {
            for (let i = 0; i < jamabarsByGroup.length; i++) {
                jamabarsByGroup[i].length = 0;
            }
            for (const jamabar of this.jamabars ?? []) {
                const group = jamabar.animGroupId;
                if (group >= 0 && group < jamabarsByGroup.length) {
                    jamabarsByGroup[group].push(jamabar);
                }
            }
        }
        const goalBagsByGroup = this.goalBags ? this.goalBagsByGroup : null;
        if (goalBagsByGroup) {
            for (let i = 0; i < goalBagsByGroup.length; i++) {
                goalBagsByGroup[i].length = 0;
            }
            for (const bag of this.goalBags ?? []) {
                const group = bag.animGroupId;
                if (group >= 0 && group < goalBagsByGroup.length) {
                    goalBagsByGroup[group].push(bag);
                }
            }
        }
        const goalTapesByGroup = this.goalTapes ? this.goalTapesByGroup : null;
        if (goalTapesByGroup) {
            for (let i = 0; i < goalTapesByGroup.length; i++) {
                goalTapesByGroup[i].length = 0;
            }
            for (const tape of this.goalTapes ?? []) {
                const group = tape.animGroupId;
                if (group >= 0 && group < goalTapesByGroup.length) {
                    goalTapesByGroup[group].push(tape);
                }
            }
        }
        const switchesByGroup = this.switches ? this.switchesByGroup : null;
        if (switchesByGroup) {
            for (let i = 0; i < switchesByGroup.length; i++) {
                switchesByGroup[i].length = 0;
            }
            for (const sw of this.switches ?? []) {
                const group = sw.animGroupId;
                if (group >= 0 && group < switchesByGroup.length) {
                    switchesByGroup[group].push(sw);
                }
            }
        }
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
                ctx.skipMirrorModels ? this.mirrorModelNames : undefined
            );
        }
        if (this.bonusWaveModel) {
            const rp = scratchRenderParams;
            rp.reset();
            rp.lighting = this.worldState.lighting;
            mat4.copy(rp.viewFromModel, viewFromWorldTilted);
            this.bonusWaveModel.prepareToRender(stageCtx, rp);
        }
        this.drawProjectedShadow(stageCtx, viewFromWorldTilted);
        this.drawConfetti(stageCtx, viewFromWorldTilted);
        if (!ctx.mirrorCapture) {
            this.drawEffects(stageCtx, viewFromWorldTilted, viewFromWorldPrev);
        }
        for (let i = 0; i < this.fgObjects.length; i++) {
            this.fgObjects[i].prepareToRenderWithViewMatrix(this.worldState, stageCtx, viewFromWorldTilted);
        }
        this.background.prepareToRender(this.worldState, bgCtx);
        const ballCtx = ctx.skipStageTilt ? stageCtx : { ...stageCtx, viewFromWorld: viewFromWorldTilted };
        for (let i = 0; i < this.balls.length; i++) {
            this.balls[i].prepareToRender(this.worldState, ballCtx);
        }
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
                mat4.copy(out, this.animGroups[1].getWorldFromAg());
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

    public setMaterialHacks(hacks: GX_Material.GXMaterialHacks): void {
        this.worldState.modelCache.setMaterialHacks(hacks);
    }

    public setGoalBags(goalBags: GoalBagRenderState[] | null): void {
        this.goalBags = goalBags;
    }

    public setBananas(bananas: BananaRenderState[] | null): void {
        this.bananas = bananas;
    }

    public setJamabars(jamabars: JamabarRenderState[] | null): void {
        this.jamabars = jamabars;
    }

    public setGoalTapes(goalTapes: GoalTapeRenderState[] | null): void {
        this.goalTapes = goalTapes;
    }

    public setConfetti(confetti: ConfettiRenderState[] | null): void {
        this.confetti = confetti;
    }

    public setEffects(effects: EffectRenderState[] | null): void {
        this.effects = effects;
    }

    public setSwitches(switches: SwitchRenderState[] | null): void {
        this.switches = switches;
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

    private drawEffects(ctx: RenderContext, viewFromWorld: mat4, viewFromWorldPrev: mat4): void {
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
            mat4.translate(rp.viewFromModel, viewFromWorld, glowPos);
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
            mat4.translate(rp.viewFromModel, viewFromWorld, biasedFlashPos);
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
            const mapping = this.sparkleTextureMapping;
            if (!mapping.gfxTexture || !mapping.gfxSampler) {
                return;
            }
            const posView = scratchVec3d;
            scratchVec3d[0] = effect.pos.x;
            scratchVec3d[1] = effect.pos.y;
            scratchVec3d[2] = effect.pos.z;
            transformVec3Mat4w1(posView, viewFromWorld, scratchVec3d);
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
        let streakCount = 0;
        let starCount = 0;
        let flashCount = 0;
        let sparkleCount = 0;
        let streakSample: {
            headZ: number;
            tailZ: number;
            pos: { x: number; y: number; z: number };
            prev: { x: number; y: number; z: number };
            reprojErr: number;
        } | null = null;
        let streakNaNCount = 0;
        let streakNaNSample: { pos: string; prev: string } | null = null;

        const streakSeen = new Set<number>();
        for (const effect of this.effects) {
            rp.alpha = effect.alpha;
            if (effect.kind === "streak") {
                streakCount += 1;
                streakSeen.add(effect.id);
                const start = scratchVec3a;
                const end = scratchVec3b;
                scratchVec3d[0] = effect.pos.x;
                scratchVec3d[1] = effect.pos.y;
                scratchVec3d[2] = effect.pos.z;
                transformVec3Mat4w1(end, viewFromWorld, scratchVec3d);
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

                const headZ = end[2];
                if (!Number.isFinite(headZ) || !Number.isFinite(tailZ)) {
                    streakNaNCount += 1;
                    if (!streakNaNSample) {
                        streakNaNSample = {
                            pos: `${effect.pos.x},${effect.pos.y},${effect.pos.z}`,
                            prev: `${effect.pos.x},${effect.pos.y},${effect.pos.z}`,
                        };
                    }
                } else if (!streakSample) {
                    const reprojErr = 0;
                    streakSample = {
                        headZ,
                        tailZ,
                        pos: { x: effect.pos.x, y: effect.pos.y, z: effect.pos.z },
                        prev: { x: effect.pos.x, y: effect.pos.y, z: effect.pos.z },
                        reprojErr,
                    };
                }
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
                sparkleCount += 1;
                drawSparkleSprite(effect);
                continue;
            }

            if (effect.kind === "flash") {
                flashCount += 1;
                drawFlash(effect);
                continue;
            } else {
                starCount += 1;
            }
            const model = this.sparkModel;
            if (!model) {
                continue;
            }
            const starPos = scratchVec3h;
            applyEffectDepthBias(effect.pos, effect.normal, effect.scale, starPos);
            mat4.translate(rp.viewFromModel, viewFromWorld, starPos);
            if (effect.rotY !== undefined) {
                mat4.rotateY(rp.viewFromModel, rp.viewFromModel, S16_TO_RADIANS * effect.rotY);
            }
            if (effect.rotX !== undefined) {
                mat4.rotateX(rp.viewFromModel, rp.viewFromModel, S16_TO_RADIANS * effect.rotX);
            }
            if (effect.rotZ !== undefined) {
                mat4.rotateZ(rp.viewFromModel, rp.viewFromModel, S16_TO_RADIANS * effect.rotZ);
            }
            if (effect.scale !== 1) {
                mat4.scale(rp.viewFromModel, rp.viewFromModel, [effect.scale, effect.scale, effect.scale]);
            }
            model.prepareToRender(ctx, rp);
            if (effect.kind === "star") {
                drawGlow(effect);
            }
        }
        const now = ctx.viewerInput.time;
        if (now - this.lastStreakLogTime > 1000) {
            console.log(
                "[effects] total=%d streak=%d star=%d flash=%d sparkle=%d nan=%d sample=%s nanSample=%s",
                this.effects.length,
                streakCount,
                starCount,
                flashCount,
                sparkleCount,
                streakNaNCount,
                streakSample
                    ? `${streakSample.headZ.toFixed(2)}/${streakSample.tailZ.toFixed(2)} err=${streakSample.reprojErr.toFixed(5)} pos=${streakSample.pos.x.toFixed(2)},${streakSample.pos.y.toFixed(2)},${streakSample.pos.z.toFixed(2)} prev=${streakSample.prev.x.toFixed(2)},${streakSample.prev.y.toFixed(2)},${streakSample.prev.z.toFixed(2)}`
                    : "n/a",
                streakNaNSample ? `pos=${streakNaNSample.pos} prev=${streakNaNSample.prev}` : "n/a",
            );
            this.lastStreakLogTime = now;
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
        this.shadowTextureCache.destroy(device);
        this.nlTextureCache?.destroy(device);
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
        if (this.mirrorGradMapping.gfxSampler) {
            device.destroySampler(this.mirrorGradMapping.gfxSampler);
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
