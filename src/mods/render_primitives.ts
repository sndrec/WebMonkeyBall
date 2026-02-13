import type { Vec3 } from '../shared/types.js';

export type RibbonRenderPrimitive = {
  kind: 'ribbon';
  id: number;
  points: Vec3[];
  width: number;
  alpha: number;
  alphaClip?: boolean;
  colorR?: number;
  colorG?: number;
  colorB?: number;
  textureName?: string;
  uScale?: number;
  depthTest?: boolean;
  additiveBlend?: boolean;
};

export type ModRenderPrimitive = RibbonRenderPrimitive;
