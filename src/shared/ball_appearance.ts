export type BallAppearanceProfile = {
  hemi1Color?: string;
  hemi2Color?: string;
  hemi1Texture?: string;
  hemi2Texture?: string;
  playerBillboardTexture?: string;
};

export type BallAppearanceResolved = {
  hemi1Color: string;
  hemi2Color: string;
  hemi1Texture?: string;
  hemi2Texture?: string;
  playerBillboardTexture?: string;
};

const BALL_COLOR_HEX_RE = /^#[0-9a-f]{6}$/i;

export const BALL_HEMI1_DEFAULT_COLOR = '#ff0000';
export const BALL_HEMI2_DEFAULT_COLOR = '#ffffff';

export function sanitizeBallColorHex(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return BALL_COLOR_HEX_RE.test(normalized) ? normalized : undefined;
}

export function normalizeBallColorHex(value: unknown, fallback: string): string {
  return sanitizeBallColorHex(value) ?? fallback;
}

export function resolveBallAppearance(appearance?: BallAppearanceProfile | null): BallAppearanceResolved {
  return {
    hemi1Color: normalizeBallColorHex(appearance?.hemi1Color, BALL_HEMI1_DEFAULT_COLOR),
    hemi2Color: normalizeBallColorHex(appearance?.hemi2Color, BALL_HEMI2_DEFAULT_COLOR),
    hemi1Texture: typeof appearance?.hemi1Texture === 'string' ? appearance.hemi1Texture : undefined,
    hemi2Texture: typeof appearance?.hemi2Texture === 'string' ? appearance.hemi2Texture : undefined,
    playerBillboardTexture: typeof appearance?.playerBillboardTexture === 'string' ? appearance.playerBillboardTexture : undefined,
  };
}

export function ballAppearanceProfilesEqual(
  a?: BallAppearanceProfile,
  b?: BallAppearanceProfile,
): boolean {
  return (a?.hemi1Color ?? '') === (b?.hemi1Color ?? '')
    && (a?.hemi2Color ?? '') === (b?.hemi2Color ?? '')
    && (a?.hemi1Texture ?? '') === (b?.hemi1Texture ?? '')
    && (a?.hemi2Texture ?? '') === (b?.hemi2Texture ?? '')
    && (a?.playerBillboardTexture ?? '') === (b?.playerBillboardTexture ?? '');
}

export function writeRgbFromHex(out: [number, number, number], hex: string): void {
  const normalized = normalizeBallColorHex(hex, BALL_HEMI1_DEFAULT_COLOR);
  out[0] = Number.parseInt(normalized.slice(1, 3), 16) / 255;
  out[1] = Number.parseInt(normalized.slice(3, 5), 16) / 255;
  out[2] = Number.parseInt(normalized.slice(5, 7), 16) / 255;
}
