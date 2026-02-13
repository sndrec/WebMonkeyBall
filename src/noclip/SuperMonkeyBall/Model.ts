import { mat4, vec3 } from "gl-matrix";
import { GfxDevice } from "../gfx/platform/GfxPlatform.js";
import type { GfxMegaStateDescriptor } from "../gfx/platform/GfxPlatform.js";
import { GXTextureMapping } from "../gx/gx_render.js";
import { GfxRenderCache } from "../gfx/render/GfxRenderCache.js";
import { GXMaterialHacks, LightingFudgeParams } from "../gx/gx_material.js";
import { ViewerRenderInput } from "../viewer.js";
import * as Gma from "./Gma.js";
import { TextureCache } from "./ModelCache.js";
import { TevLayerInst } from "./TevLayer.js";
import { ShapeInst } from "./Shape.js";
import { RenderContext } from "./Render.js";
import { Color, colorNewFromRGBA } from "../Color.js";
import { ModelInterface } from "./World.js";
import { transformVec3Mat4w1 } from "../MathHelpers.js";
import { Lighting } from "./Lighting.js";
import type { GfxRenderInst } from "../gfx/render/GfxRenderInstManager.js";

export enum RenderSort {
    Translucent, // Depth sort "translucent" shapes only
    All, // Sort both translucent and opaque shapes
    None, // Don't sort any shapes
}

export class RenderParams {
    public viewFromModel = mat4.create();
    public alpha: number;
    public sort: RenderSort;
    public texMtx = mat4.create();
    public lighting: Lighting | null;
    public depthOffset: number;
    public colorMul: Color;
    public disableSpecular: boolean;
    public textureOverride: GXTextureMapping | null;
    public megaStateFlags?: Partial<GfxMegaStateDescriptor>;

    constructor() {
        this.colorMul = colorNewFromRGBA(1, 1, 1, 1);
        this.reset();
    }

    public reset(): void {
        mat4.identity(this.viewFromModel);
        this.alpha = 1;
        this.sort = RenderSort.Translucent;
        mat4.identity(this.texMtx);
        this.lighting = null;
        this.depthOffset = 0;
        this.colorMul.r = 1;
        this.colorMul.g = 1;
        this.colorMul.b = 1;
        this.colorMul.a = 1;
        this.disableSpecular = false;
        this.textureOverride = null;
        this.megaStateFlags = undefined;
    }
}

const scratchVec3a = vec3.create();
const scratchVec3b = vec3.create();
export class ModelInst implements ModelInterface {
    private shapes: ShapeInst[];
    private tevLayers: TevLayerInst[]; // Each shape's material uses up to three of these

    constructor(device: GfxDevice, renderCache: GfxRenderCache, public modelData: Gma.Model, texHolder: TextureCache) {
        this.tevLayers = modelData.tevLayers.map(
            (tevLayerData) => new TevLayerInst(device, renderCache, tevLayerData, texHolder)
        );
        this.shapes = modelData.shapes.map(
            (shapeData, i) =>
                new ShapeInst(
                    device,
                    renderCache,
                    shapeData,
                    this.tevLayers,
                    modelData.flags,
                    i >= modelData.opaqueShapeCount,
                    modelData.boundSphereCenter,
                    modelData.boundSphereRadius
                )
        );
        this.prewarmPrograms(renderCache);
    }

    public setMaterialHacks(hacks: GXMaterialHacks): void {
        for (let i = 0; i < this.shapes.length; i++) {
            this.shapes[i].setMaterialHacks(hacks);
        }
    }

    public prewarmPrograms(renderCache: GfxRenderCache): void {
        for (let i = 0; i < this.shapes.length; i++) {
            this.shapes[i].prewarmPrograms(renderCache);
        }
    }

    public prepareToRender(ctx: RenderContext, renderParams: RenderParams) {
        const scale = scratchVec3a;
        mat4.getScaling(scale, renderParams.viewFromModel);
        const maxScale = Math.max(...scale);

        const centerWorldSpace = scratchVec3a;
        transformVec3Mat4w1(centerWorldSpace, renderParams.viewFromModel, this.modelData.boundSphereCenter);
        transformVec3Mat4w1(centerWorldSpace, ctx.viewerInput.camera.worldMatrix, centerWorldSpace);
        const mirrorPlaneNormal = ctx.mirrorPlaneNormal;
        const mirrorPlanePoint = ctx.mirrorPlanePoint;
        if (mirrorPlaneNormal && mirrorPlanePoint) {
            vec3.sub(scratchVec3b, centerWorldSpace, mirrorPlanePoint);
            const dist = vec3.dot(scratchVec3b, mirrorPlaneNormal);
            if (dist < -(this.modelData.boundSphereRadius * maxScale)) {
                return;
            }
        }
        const clipPlaneNormal = ctx.clipPlaneNormal;
        const clipPlanePoint = ctx.clipPlanePoint;
        if (clipPlaneNormal && clipPlanePoint) {
            vec3.sub(scratchVec3b, centerWorldSpace, clipPlanePoint);
            const dist = vec3.dot(scratchVec3b, clipPlaneNormal);
            if (dist < 0.0) {
                return;
            }
        }
        const inFrustum = ctx.viewerInput.camera.frustum.containsSphere(
            centerWorldSpace,
            this.modelData.boundSphereRadius * maxScale
        );
        if (!inFrustum) return;

        for (let i = 0; i < this.shapes.length; i++) {
            this.shapes[i].prepareToRender(ctx, renderParams);
        }
    }

    public prepareToRenderCustom(
        ctx: RenderContext,
        renderParams: RenderParams,
        configureRenderInst: (renderInst: GfxRenderInst, renderParams: RenderParams) => void
    ) {
        const scale = scratchVec3a;
        mat4.getScaling(scale, renderParams.viewFromModel);
        const maxScale = Math.max(...scale);

        const centerWorldSpace = scratchVec3a;
        transformVec3Mat4w1(centerWorldSpace, renderParams.viewFromModel, this.modelData.boundSphereCenter);
        transformVec3Mat4w1(centerWorldSpace, ctx.viewerInput.camera.worldMatrix, centerWorldSpace);
        const mirrorPlaneNormal = ctx.mirrorPlaneNormal;
        const mirrorPlanePoint = ctx.mirrorPlanePoint;
        if (mirrorPlaneNormal && mirrorPlanePoint) {
            vec3.sub(scratchVec3b, centerWorldSpace, mirrorPlanePoint);
            const dist = vec3.dot(scratchVec3b, mirrorPlaneNormal);
            if (dist < -(this.modelData.boundSphereRadius * maxScale)) {
                return;
            }
        }
        const clipPlaneNormal = ctx.clipPlaneNormal;
        const clipPlanePoint = ctx.clipPlanePoint;
        if (clipPlaneNormal && clipPlanePoint) {
            vec3.sub(scratchVec3b, centerWorldSpace, clipPlanePoint);
            const dist = vec3.dot(scratchVec3b, clipPlaneNormal);
            if (dist < 0.0) {
                return;
            }
        }
        const inFrustum = ctx.viewerInput.camera.frustum.containsSphere(
            centerWorldSpace,
            this.modelData.boundSphereRadius * maxScale
        );
        if (!inFrustum) return;

        for (let i = 0; i < this.shapes.length; i++) {
            this.shapes[i].prepareToRenderCustom(ctx, renderParams, configureRenderInst);
        }
    }

    public destroy(device: GfxDevice): void {
        for (let i = 0; i < this.shapes.length; i++) {
            this.shapes[i].destroy(device);
        }
    }
}
