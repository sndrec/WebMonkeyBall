import { GAME_SOURCES, INFO_FLAGS, type GameSource } from './shared/constants/index.js';

const HUD_WIDTH = 640;
const HUD_HEIGHT = 480;
const HURRY_UP_FRAMES = 11 * 60;
const GO_BANNER_FRAMES = 60;
const GOAL_BANNER_FRAMES = 360;
const GOAL_SEQUENCE_FRAMES = 360;
const HURRY_UP_BANNER_FRAMES = 30;
const TIME_OVER_BANNER_FRAMES = 120;
const BONUS_BANNER_FRAMES = 90;
const FINAL_FLOOR_BANNER_FRAMES = 150;

type Vec2 = { x: number; y: number };

type FontParams = {
  spaceWidth: number;
  lineHeight: number;
  firstChar: number;
  lastChar: number;
  columns: number;
  rows: number;
  uStep: number;
  vStep: number;
  uMargin: number;
  vMargin: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
};

type SpriteFont = {
  image: HTMLImageElement;
  params: FontParams;
};

type HudAssets = {
  banana: HTMLImageElement;
  bananaBunch: HTMLImageElement;
  mph: HTMLImageElement;
  goal: HTMLImageElement;
  bomb: HTMLImageElement;
  bombCrack: HTMLImageElement;
  lvIcon: HTMLImageElement;
  bombParts: HTMLImageElement[];
  fonts: {
    num24x37: SpriteFont;
    num12x19: SpriteFont;
    num22x22: SpriteFont;
    asc20x20: SpriteFont;
    asc32x32: SpriteFont;
    asc72x64: SpriteFont;
    asc16x16: SpriteFont;
  };
};

type BannerState = {
  timer: number;
  duration: number;
};

type GoalScoreInfo = {
  clearScore: number;
  floorScore: number;
  warpMultiplier: number;
  timeBonus: number;
  goalType: 'B' | 'G' | 'R';
};

type BombFragment = {
  index: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  opacity: number;
  scale: number;
};

type WarpTrail = {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  addG: number;
  addB: number;
  life: number;
};

const BOMB_FRAG_X = [7, 16, 26, 48, 0, 9, 55, 12, 33, 71];
const BOMB_FRAG_Y = [9, 0, 0, 4, 24, 16, 23, 63, 56, 69];
const BOMB_BASE_SCALE = 1.0;
const MPH_SCALE = 1;

const FONT_PARAMS = {
  num24x37: {
    spaceWidth: 26,
    lineHeight: 38,
    firstChar: 48,
    lastChar: 57,
    columns: 5,
    rows: 2,
    uStep: 0.1911764741,
    vStep: 0.475,
    uMargin: 0.0073529412,
    vMargin: 0.0125,
    padLeft: 0,
    padRight: 0,
    padTop: 0,
    padBottom: 0,
  },
  num12x19: {
    spaceWidth: 16,
    lineHeight: 22,
    firstChar: 48,
    lastChar: 59,
    columns: 6,
    rows: 2,
    uStep: 0.166666666,
    vStep: 0.4583333333,
    uMargin: 0.0104166666,
    vMargin: 0.0208333333,
    padLeft: 0,
    padRight: 0,
    padTop: 0,
    padBottom: 0,
  },
  num22x22: {
    spaceWidth: 22,
    lineHeight: 22,
    firstChar: 39,
    lastChar: 63,
    columns: 5,
    rows: 5,
    uStep: 0.171875,
    vStep: 0.171875,
    uMargin: 0.0078125,
    vMargin: 0.0078125,
    padLeft: 0,
    padRight: 0,
    padTop: 1,
    padBottom: 0,
  },
  asc20x20: {
    spaceWidth: 20,
    lineHeight: 20,
    firstChar: 32,
    lastChar: 91,
    columns: 12,
    rows: 5,
    uStep: 0.078125,
    vStep: 0.078125,
    uMargin: 0.00390625,
    vMargin: 0.00390625,
    padLeft: 0,
    padRight: 0,
    padTop: 0,
    padBottom: 0,
  },
  asc32x32: {
    spaceWidth: 32,
    lineHeight: 32,
    firstChar: 32,
    lastChar: 95,
    columns: 8,
    rows: 8,
    uStep: 0.125,
    vStep: 0.125,
    uMargin: 0.00390625,
    vMargin: 0.00390625,
    padLeft: 0,
    padRight: 1,
    padTop: 0,
    padBottom: 2,
  },
  asc72x64: {
    spaceWidth: 72,
    lineHeight: 64,
    firstChar: 48,
    lastChar: 96,
    columns: 7,
    rows: 7,
    uStep: 0.140625,
    vStep: 0.1428571492,
    uMargin: 0.001953125,
    vMargin: 0.0022321429,
    padLeft: 0,
    padRight: 1,
    padTop: 0,
    padBottom: 2,
  },
  asc16x16: {
    spaceWidth: 16,
    lineHeight: 16,
    firstChar: 32,
    lastChar: 122,
    columns: 16,
    rows: 7,
    uStep: 0.0625,
    vStep: 0.166666666,
    uMargin: 0.00390625,
    vMargin: 0.0104166666,
    padLeft: 0,
    padRight: 0,
    padTop: 0,
    padBottom: 0,
  },
} satisfies Record<string, FontParams>;

function hudAsset(path: string) {
  const origin = window.location.origin;
  const pathname = window.location.pathname;
  const base = pathname.includes('/web/') ? `${origin}/web/` : `${origin}/`;
  return `${base}assets/hud/smb1/${path}`;
}

const HUD_ASSET_PATHS = {
  banana: hudAsset('bmp_com/012_banana_01.png'),
  bananaBunch: hudAsset('bmp_com/085_banana_10.png'),
  mph: hudAsset('bmp_com/088_game_icon_mph.png'),
  goal: hudAsset('bmp_nml/004_game_goal.png'),
  bomb: hudAsset('bmp_nml/000_icon_bombtimer.png'),
  bombCrack: hudAsset('bmp_nml/016_icon_bomb_hibi.png'),
  lvIcon: hudAsset('bmp_nml/001_icon_lv1234_j.png'),
  bombParts: [
    hudAsset('bmp_nml/017_icon_bomb_part_a.png'),
    hudAsset('bmp_nml/018_icon_bomb_part_b.png'),
    hudAsset('bmp_nml/019_icon_bomb_part_c.png'),
    hudAsset('bmp_nml/020_icon_bomb_part_d.png'),
    hudAsset('bmp_nml/021_icon_bomb_part_e.png'),
    hudAsset('bmp_nml/022_icon_bomb_part_f.png'),
    hudAsset('bmp_nml/023_icon_bomb_part_g.png'),
    hudAsset('bmp_nml/024_icon_bomb_part_h.png'),
    hudAsset('bmp_nml/025_icon_bomb_part_i.png'),
    hudAsset('bmp_nml/026_icon_bomb_part_j.png'),
  ],
  fonts: {
    num24x37: hudAsset('bmp_nml/012_asc_ball26x38.png'),
    num12x19: hudAsset('bmp_nml/013_asc_ball16x22.png'),
    num22x22: hudAsset('bmp_nml/005_asc_ball22x22.png'),
    asc20x20: hudAsset('bmp_nml/009_asc_ball20x20.png'),
    asc32x32: hudAsset('bmp_nml/007_asc_tama32x32.png'),
    asc72x64: hudAsset('bmp_com/080_asc_tama72x64_new.png'),
    asc16x16: hudAsset('bmp_nml/006_asc_komo16x16.png'),
  },
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function sinFixed(angle: number): number {
  return Math.sin((angle * Math.PI) / 0x8000);
}

function formatTimerSeconds(frames: number): { seconds: string; centis: string } {
  const clampedFrames = Math.max(0, Math.floor(frames));
  const seconds = Math.floor(clampedFrames / 60);
  const centis = Math.floor(((clampedFrames % 60) * 100) / 60);
  return {
    seconds: String(seconds).padStart(3, '0'),
    centis: String(centis).padStart(2, '0'),
  };
}

const tintCanvas = document.createElement('canvas');
const tintCtx = tintCanvas.getContext('2d');

function drawTintedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  color: string | null,
  opacity: number,
) {
  ctx.save();
  ctx.globalAlpha = opacity;
  if (!color || !tintCtx) {
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    ctx.restore();
    return;
  }

  const w = Math.max(1, Math.ceil(dw));
  const h = Math.max(1, Math.ceil(dh));
  if (tintCanvas.width !== w || tintCanvas.height !== h) {
    tintCanvas.width = w;
    tintCanvas.height = h;
  } else {
    tintCtx.clearRect(0, 0, w, h);
  }
  tintCtx.globalCompositeOperation = 'source-over';
  tintCtx.globalAlpha = 1;
  tintCtx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
  tintCtx.globalCompositeOperation = 'multiply';
  tintCtx.fillStyle = color;
  tintCtx.fillRect(0, 0, w, h);
  tintCtx.globalCompositeOperation = 'destination-in';
  tintCtx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
  ctx.drawImage(tintCanvas, dx, dy);
  ctx.restore();
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  pos: Vec2,
  scale: number,
  opacity = 1,
  color: string | null = null,
) {
  const dw = img.width * scale;
  const dh = img.height * scale;
  drawTintedImage(ctx, img, 0, 0, img.width, img.height, pos.x - dw / 2, pos.y - dh / 2, dw, dh, color, opacity);
}

function drawSpriteSolidTint(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  pos: Vec2,
  scale: number,
  opacity = 1,
) {
  const dw = img.width * scale;
  const dh = img.height * scale;
  const w = Math.max(1, Math.ceil(dw));
  const h = Math.max(1, Math.ceil(dh));
  if (!tintCtx) {
    return;
  }
  if (tintCanvas.width !== w || tintCanvas.height !== h) {
    tintCanvas.width = w;
    tintCanvas.height = h;
  } else {
    tintCtx.clearRect(0, 0, w, h);
  }
  tintCtx.globalCompositeOperation = 'source-over';
  tintCtx.globalAlpha = 1;
  tintCtx.drawImage(img, 0, 0, img.width, img.height, 0, 0, dw, dh);
  tintCtx.globalCompositeOperation = 'source-in';
  tintCtx.fillStyle = '#ffffff';
  tintCtx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(tintCanvas, pos.x - dw / 2, pos.y - dh / 2);
  ctx.restore();
}

function drawGlyph(
  ctx: CanvasRenderingContext2D,
  font: SpriteFont,
  charCode: number,
  x: number,
  y: number,
  scaleX: number,
  scaleY: number,
  color: string | null,
  opacity = 1,
) {
  const params = font.params;
  if (charCode < params.firstChar || charCode > params.lastChar) {
    return;
  }
  const glyphIndex = charCode - params.firstChar;
  const div = Math.floor(glyphIndex / params.columns);
  const mod = glyphIndex % params.columns;
  const u1 = params.uStep * mod + params.uMargin * params.padLeft;
  const v1 = params.vStep * div + params.vMargin * params.padTop;
  const u2 = params.uStep + (params.uStep * mod - params.uMargin * params.padRight);
  const v2 = params.vStep + (params.vStep * div - params.vMargin * params.padBottom);
  const sx = u1 * font.image.width;
  const sy = v1 * font.image.height;
  const sw = (u2 - u1) * font.image.width;
  const sh = (v2 - v1) * font.image.height;
  const dw = sw * scaleX;
  const dh = sh * scaleY;
  drawTintedImage(ctx, font.image, sx, sy, sw, sh, x, y - dh / 2, dw, dh, color, opacity);
}

function measureText(font: SpriteFont, text: string, scale: number): number {
  const params = font.params;
  let width = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (ch === ' ') {
      width += params.spaceWidth * scale;
      continue;
    }
    if (code < params.firstChar || code > params.lastChar) {
      width += params.spaceWidth * scale;
      continue;
    }
    width += params.spaceWidth * scale;
  }
  return width;
}

function drawText(
  ctx: CanvasRenderingContext2D,
  font: SpriteFont,
  text: string,
  pos: Vec2,
  scale: number,
  color: string | null,
  align: 'left' | 'center' | 'right',
  alignV: 'top' | 'center' | 'bottom' = 'center',
  opacity = 1,
) {
  const params = font.params;
  let x = pos.x;
  const textWidth = measureText(font, text, scale);
  if (align === 'center') {
    x -= textWidth / 2;
  } else if (align === 'right') {
    x -= textWidth;
  }
  let y = pos.y;
  if (alignV === 'bottom') {
    y -= (params.lineHeight * scale) / 2;
  } else if (alignV === 'top') {
    y += (params.lineHeight * scale) / 2;
  }

  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (ch === ' ') {
      x += params.spaceWidth * scale;
      continue;
    }
    if (code < params.firstChar || code > params.lastChar) {
      x += params.spaceWidth * scale;
      continue;
    }
    const glyphIndex = code - params.firstChar;
    const div = Math.floor(glyphIndex / params.columns);
    const mod = glyphIndex % params.columns;
    const u1 = params.uStep * mod + params.uMargin * params.padLeft;
    const v1 = params.vStep * div + params.vMargin * params.padTop;
    const u2 = params.uStep + (params.uStep * mod - params.uMargin * params.padRight);
    const v2 = params.vStep + (params.vStep * div - params.vMargin * params.padBottom);
    const sx = u1 * font.image.width;
    const sy = v1 * font.image.height;
    const sw = (u2 - u1) * font.image.width;
    const sh = (v2 - v1) * font.image.height;
    const dw = sw * scale;
    const dh = sh * scale;
    drawTintedImage(ctx, font.image, sx, sy, sw, sh, x, y - dh / 2, dw, dh, color, opacity);
    x += params.spaceWidth * scale;
  }
}

function drawTextScaled(
  ctx: CanvasRenderingContext2D,
  font: SpriteFont,
  text: string,
  pos: Vec2,
  scaleX: number,
  scaleY: number,
  color: string | null,
  align: 'left' | 'center' | 'right',
  alignV: 'top' | 'center' | 'bottom' = 'center',
  opacity = 1,
) {
  const params = font.params;
  let x = pos.x;
  const textWidth = measureText(font, text, scaleX);
  if (align === 'center') {
    x -= textWidth / 2;
  } else if (align === 'right') {
    x -= textWidth;
  }
  let y = pos.y;
  if (alignV === 'bottom') {
    y -= (params.lineHeight * scaleY) / 2;
  } else if (alignV === 'top') {
    y += (params.lineHeight * scaleY) / 2;
  }

  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (ch === ' ') {
      x += params.spaceWidth * scaleX;
      continue;
    }
    if (code < params.firstChar || code > params.lastChar) {
      x += params.spaceWidth * scaleX;
      continue;
    }
    const glyphIndex = code - params.firstChar;
    const div = Math.floor(glyphIndex / params.columns);
    const mod = glyphIndex % params.columns;
    const u1 = params.uStep * mod + params.uMargin * params.padLeft;
    const v1 = params.vStep * div + params.vMargin * params.padTop;
    const u2 = params.uStep + (params.uStep * mod - params.uMargin * params.padRight);
    const v2 = params.vStep + (params.vStep * div - params.vMargin * params.padBottom);
    const sx = u1 * font.image.width;
    const sy = v1 * font.image.height;
    const sw = (u2 - u1) * font.image.width;
    const sh = (v2 - v1) * font.image.height;
    const dw = sw * scaleX;
    const dh = sh * scaleY;
    drawTintedImage(ctx, font.image, sx, sy, sw, sh, x, y - dh / 2, dw, dh, color, opacity);
    x += params.spaceWidth * scaleX;
  }
}

function textMetrics(font: SpriteFont, text: string, scale: number): { width: number; height: number } {
  return {
    width: measureText(font, text, scale),
    height: font.params.lineHeight * scale,
  };
}

function padNumber(value: number, width: number): string {
  const text = String(Math.max(0, Math.trunc(value)));
  if (text.length >= width) {
    return text;
  }
  return `${' '.repeat(width - text.length)}${text}`;
}

function drawGlyphRotatedTopLeft(
  ctx: CanvasRenderingContext2D,
  font: SpriteFont,
  charCode: number,
  x: number,
  y: number,
  scale: number,
  rotation: number,
  color: string | null,
  opacity = 1,
) {
  const params = font.params;
  if (charCode < params.firstChar || charCode > params.lastChar) {
    return;
  }
  const glyphIndex = charCode - params.firstChar;
  const div = Math.floor(glyphIndex / params.columns);
  const mod = glyphIndex % params.columns;
  const u1 = params.uStep * mod + params.uMargin * params.padLeft;
  const v1 = params.vStep * div + params.vMargin * params.padTop;
  const u2 = params.uStep + (params.uStep * mod - params.uMargin * params.padRight);
  const v2 = params.vStep + (params.vStep * div - params.vMargin * params.padBottom);
  const sx = u1 * font.image.width;
  const sy = v1 * font.image.height;
  const sw = (u2 - u1) * font.image.width;
  const sh = (v2 - v1) * font.image.height;
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  drawTintedImage(ctx, font.image, sx, sy, sw, sh, 0, 0, dw, dh, color, opacity);
  ctx.restore();
}

function drawTextAt(
  ctx: CanvasRenderingContext2D,
  font: SpriteFont,
  text: string,
  left: number,
  top: number,
  scale: number,
  color: string | null,
  opacity = 1,
) {
  const params = font.params;
  let x = left;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (ch === ' ') {
      x += params.spaceWidth * scale;
      continue;
    }
    if (code < params.firstChar || code > params.lastChar) {
      x += params.spaceWidth * scale;
      continue;
    }
    const glyphIndex = code - params.firstChar;
    const div = Math.floor(glyphIndex / params.columns);
    const mod = glyphIndex % params.columns;
    const u1 = params.uStep * mod + params.uMargin * params.padLeft;
    const v1 = params.vStep * div + params.vMargin * params.padTop;
    const u2 = params.uStep + (params.uStep * mod - params.uMargin * params.padRight);
    const v2 = params.vStep + (params.vStep * div - params.vMargin * params.padBottom);
    const sx = u1 * font.image.width;
    const sy = v1 * font.image.height;
    const sw = (u2 - u1) * font.image.width;
    const sh = (v2 - v1) * font.image.height;
    const dw = sw * scale;
    const dh = sh * scale;
    drawTintedImage(ctx, font.image, sx, sy, sw, sh, x, top, dw, dh, color, opacity);
    x += params.spaceWidth * scale;
  }
}

function normalizeGoalType(goalType: string | number | null): 'B' | 'G' | 'R' {
  if (goalType === 'G' || goalType === 'R' || goalType === 'B') {
    return goalType;
  }
  if (goalType === 1) {
    return 'G';
  }
  if (goalType === 2) {
    return 'R';
  }
  return 'B';
}

function isWarpGoal(goalType: string | number | null): boolean {
  const normalized = normalizeGoalType(goalType);
  return normalized === 'G' || normalized === 'R';
}

function getWarpJumpCount(game: any, goalType: 'B' | 'G' | 'R'): number {
  const preview = game?.course?.peekJumpCount?.({
    flags: INFO_FLAGS.GOAL,
    goalType,
    timerCurr: game?.stageTimerFrames ?? 0,
    u_currStageId: game?.stage?.stageId ?? game?.course?.currentStageId ?? 0,
  });
  if (typeof preview === 'number' && Number.isFinite(preview) && preview > 0) {
    return Math.floor(preview);
  }
  return goalType === 'R' ? 3 : 2;
}

function func800802E0(timerFrames: number): number {
  if (timerFrames > 60) {
    const t = Math.abs(Math.sin(((60 - (timerFrames % 60)) & 0x3f) * (Math.PI / 128)));
    return 0.2 * (1 - Math.abs(1 - t * 2));
  }
  if (timerFrames < 15) {
    const t = (15 - timerFrames) / 15;
    if (t < 0.5) {
      return 0.2 - t;
    }
    return (-0.3 + t) - 0.5;
  }
  const t = 1 - (timerFrames - 15) / 45;
  return t * 0.2;
}

export class HudRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private assets: HudAssets | null = null;
  private ready = false;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private frameCounter = 0;
  private lastTimeLeft = null as number | null;
  private bombFragments: BombFragment[] = [];
  private bombCrackPulse = 0;
  private currentGame: any = null;
  private introStartFrames = 0;
  private floorIntroActive = false;
  private bonusFloorActive = false;
  private finalFloorActive = false;
  private floorIntroFrames = 0;
  private floorIntroFadeFrames = 0;
  private bonusFloorFrames = 0;
  private finalFloorFrames = 0;
  private warpTrails: WarpTrail[] = [];
  private goalScoreInfo: GoalScoreInfo | null = null;
  private scoreDisplay = 0;
  private scoreStepFrames = 0;
  private scoreStepValue = 0;
  private bonusBananaCounter = 0;

  private goBanner: BannerState = { timer: 0, duration: GO_BANNER_FRAMES };
  private goalBanner: BannerState = { timer: 0, duration: GOAL_BANNER_FRAMES };
  private hurryBanner: BannerState = { timer: 0, duration: HURRY_UP_BANNER_FRAMES };
  private timeOverBanner: BannerState = { timer: 0, duration: TIME_OVER_BANNER_FRAMES };
  private perfectBanner: BannerState = { timer: 0, duration: BONUS_BANNER_FRAMES };
  private bonusFinishBanner: BannerState = { timer: 0, duration: BONUS_BANNER_FRAMES };
  private readyBanner: BannerState = { timer: 0, duration: 120 };
  private fallOutBanner: BannerState = { timer: 0, duration: 270 };
  private lastIntroFrames = 0;
  private lastGoalFrames = 0;
  private lastTimeOverFrames = 0;
  private lastRingoutFrames = 0;
  private lastResultReplayActive = false;
  private lastGoalEventTick = -1;
  private lastRingoutEventTick = -1;
  private lastStageId: number | null = null;
  private lastBonusClear = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  async load() {
    if (!this.ctx) {
      return;
    }
    const [
      banana,
      bananaBunch,
      mph,
      goal,
      bomb,
      bombCrack,
      lvIcon,
      ...rest
    ] = await Promise.all([
      loadImage(HUD_ASSET_PATHS.banana),
      loadImage(HUD_ASSET_PATHS.bananaBunch),
      loadImage(HUD_ASSET_PATHS.mph),
      loadImage(HUD_ASSET_PATHS.goal),
      loadImage(HUD_ASSET_PATHS.bomb),
      loadImage(HUD_ASSET_PATHS.bombCrack),
      loadImage(HUD_ASSET_PATHS.lvIcon),
      ...HUD_ASSET_PATHS.bombParts.map(loadImage),
      ...Object.values(HUD_ASSET_PATHS.fonts).map(loadImage),
    ]);

    const fontImages = rest.slice(HUD_ASSET_PATHS.bombParts.length) as HTMLImageElement[];
    const fontKeys = Object.keys(HUD_ASSET_PATHS.fonts) as Array<keyof HudAssets['fonts']>;
    const fonts: HudAssets['fonts'] = {
      num24x37: { image: fontImages[fontKeys.indexOf('num24x37')], params: FONT_PARAMS.num24x37 },
      num12x19: { image: fontImages[fontKeys.indexOf('num12x19')], params: FONT_PARAMS.num12x19 },
      num22x22: { image: fontImages[fontKeys.indexOf('num22x22')], params: FONT_PARAMS.num22x22 },
      asc20x20: { image: fontImages[fontKeys.indexOf('asc20x20')], params: FONT_PARAMS.asc20x20 },
      asc32x32: { image: fontImages[fontKeys.indexOf('asc32x32')], params: FONT_PARAMS.asc32x32 },
      asc72x64: { image: fontImages[fontKeys.indexOf('asc72x64')], params: FONT_PARAMS.asc72x64 },
      asc16x16: { image: fontImages[fontKeys.indexOf('asc16x16')], params: FONT_PARAMS.asc16x16 },
    };

    this.assets = {
      banana,
      bananaBunch,
      mph,
      goal,
      bomb,
      bombCrack,
      lvIcon,
      bombParts: rest.slice(0, HUD_ASSET_PATHS.bombParts.length) as HTMLImageElement[],
      fonts,
    };
    this.ready = true;
  }

  resize(width: number, height: number) {
    if (!this.ctx) {
      return;
    }
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    const scale = Math.min(width / HUD_WIDTH, height / HUD_HEIGHT);
    this.scale = scale;
    this.offsetX = (width - HUD_WIDTH * scale) / 2;
    this.offsetY = (height - HUD_HEIGHT * scale) / 2;
  }

  private beginBanner(state: BannerState) {
    state.timer = state.duration;
  }

  private resetTransientBanners() {
    this.goBanner.timer = 0;
    this.goalBanner.timer = 0;
    this.hurryBanner.timer = 0;
    this.timeOverBanner.timer = 0;
    this.perfectBanner.timer = 0;
    this.bonusFinishBanner.timer = 0;
    this.readyBanner.timer = 0;
    this.fallOutBanner.timer = 0;
  }

  private advanceBanner(state: BannerState, dt: number) {
    if (state.timer > 0) {
      state.timer = Math.max(0, state.timer - dt);
    }
  }

  private getHudPlayer(game: any) {
    if (!game) {
      return null;
    }
    const localPlayer = game.getLocalPlayer?.();
    if (localPlayer) {
      return localPlayer;
    }
    const players = game.players;
    if (!Array.isArray(players) || players.length === 0) {
      return null;
    }
    return players.find((player) => !player?.isSpectator && !player?.pendingSpawn) ?? players[0];
  }

  private syncState(game: any) {
    if (!game) {
      return;
    }
    const hudPlayer = this.getHudPlayer(game);
    const goalTimerFrames = hudPlayer?.goalTimerFrames ?? game.goalTimerFrames ?? 0;
    const ringoutTimerFrames = hudPlayer?.ringoutTimerFrames ?? game.ringoutTimerFrames ?? 0;
    const goalInfo = hudPlayer?.goalInfo ?? game.goalInfo ?? null;
    const replayActive = Boolean(game.activeResultReplay);
    const replayJustEnded = this.lastResultReplayActive && !replayActive;
    const suppressResultReplayEventStart = replayActive || replayJustEnded;
    const goalEventTick = Number.isFinite(game.hudGoalEventTick) ? game.hudGoalEventTick : null;
    const ringoutEventTick = Number.isFinite(game.hudRingoutEventTick) ? game.hudRingoutEventTick : null;
    const goalEventTriggered = goalEventTick !== null && goalEventTick >= 0 && goalEventTick !== this.lastGoalEventTick;
    const ringoutEventTriggered = ringoutEventTick !== null
      && ringoutEventTick >= 0
      && ringoutEventTick !== this.lastRingoutEventTick;
    const goalEventRewound = goalEventTick !== null
      && goalEventTick >= -1
      && goalEventTick < this.lastGoalEventTick;
    const ringoutEventRewound = ringoutEventTick !== null
      && ringoutEventTick >= -1
      && ringoutEventTick < this.lastRingoutEventTick;
    const goalTimerEdgeTriggered = this.lastGoalFrames === 0 && goalTimerFrames > 0;
    const ringoutTimerEdgeTriggered = this.lastRingoutFrames === 0 && ringoutTimerFrames > 0;
    const shouldStartGoalBanner = !suppressResultReplayEventStart
      && this.goalBanner.timer <= 0
      && !game.bonusClearPending
      && (goalEventTriggered || (goalEventTick === null && goalTimerEdgeTriggered));
    const shouldStartRingoutBanner = !suppressResultReplayEventStart
      && this.fallOutBanner.timer <= 0
      && (ringoutEventTriggered || (ringoutEventTick === null && ringoutTimerEdgeTriggered));
    if (!replayActive && goalEventRewound && goalTimerFrames <= 0) {
      this.goalBanner.timer = 0;
      this.warpTrails = [];
      this.goalScoreInfo = null;
    }
    if (!replayActive && ringoutEventRewound && ringoutTimerFrames <= 0) {
      this.fallOutBanner.timer = 0;
    }
    const stageId = game.stage?.stageId ?? null;
    if (stageId !== this.lastStageId) {
      this.lastStageId = stageId;
      this.resetTransientBanners();
      const floorInfo = game.course?.getFloorInfo?.();
      const firstAttempt = (game.stageAttempts ?? 1) <= 1;
      this.finalFloorActive = Boolean(floorInfo?.isFinal);
      this.finalFloorFrames = firstAttempt ? 0 : 150;
      this.bonusFloorActive = Boolean(game.isBonusStageActive?.());
      this.bonusFloorFrames = firstAttempt ? 0 : 150;
      this.floorIntroActive = firstAttempt;
      this.floorIntroFrames = 0;
      this.floorIntroFadeFrames = 0;
      this.introStartFrames = game.introTimerFrames ?? 0;
      this.bombFragments = [];
      this.bombCrackPulse = 0;
      this.lastTimeLeft = null;
      this.warpTrails = [];
      this.goalScoreInfo = null;
      this.scoreDisplay = Math.max(0, Math.trunc(game.score ?? 0));
      this.scoreStepFrames = 0;
      this.scoreStepValue = 0;
      this.bonusBananaCounter = 0;
    }

    if (this.lastIntroFrames > 0 && game.introTimerFrames === 0) {
      this.beginBanner(this.goBanner);
    }

    if (this.lastIntroFrames === 0 && game.introTimerFrames > 0) {
      this.resetTransientBanners();
      const firstAttempt = (game.stageAttempts ?? 1) <= 1;
      this.floorIntroActive = firstAttempt;
      this.floorIntroFrames = 0;
      this.floorIntroFadeFrames = 0;
      this.introStartFrames = game.introTimerFrames ?? 0;
      this.bonusFloorActive = Boolean(game.isBonusStageActive?.());
      this.bonusFloorFrames = firstAttempt ? 0 : 150;
      const floorInfo = game.course?.getFloorInfo?.();
      this.finalFloorActive = Boolean(floorInfo?.isFinal);
      this.finalFloorFrames = firstAttempt ? 0 : 150;
      if (game.introTimerFrames <= 120) {
        this.beginBanner(this.readyBanner);
        if (this.floorIntroActive) {
          this.floorIntroFadeFrames = 15;
        }
      }
    }

    if (shouldStartGoalBanner) {
      this.beginBanner(this.goalBanner);
      const timeRemaining = Math.max(0, (game.stageTimeLimitFrames ?? 0) - (game.stageTimerFrames ?? 0));
      const goalType = normalizeGoalType(goalInfo?.goalType ?? game.stage?.goals?.[0]?.type ?? 'B');
      let clearScore = Math.floor((timeRemaining * 100) / 60);
      if (goalType === 'G') {
        clearScore += 10000;
      } else if (goalType === 'R') {
        clearScore += 20000;
      }
      const timeBonus = (game.stageTimeLimitFrames ?? 0) > 0
        && timeRemaining > ((game.stageTimeLimitFrames ?? 0) >> 1)
        ? 2
        : 1;
      let warpMultiplier = 1;
      if (isWarpGoal(goalType)) {
        warpMultiplier = getWarpJumpCount(game, goalType);
      }
      const floorScore = clearScore * warpMultiplier * timeBonus;
      this.goalScoreInfo = {
        clearScore,
        floorScore,
        warpMultiplier,
        timeBonus,
        goalType,
      };
    }

    if (!this.lastBonusClear && game.bonusClearPending) {
      this.beginBanner(this.perfectBanner);
    }

    if (this.lastTimeOverFrames === 0 && game.timeoverTimerFrames > 0) {
      if (game.isBonusStageActive?.()) {
        this.beginBanner(this.bonusFinishBanner);
      } else {
        this.beginBanner(this.timeOverBanner);
      }
    }

    if (this.lastIntroFrames > 120 && game.introTimerFrames <= 120 && game.introTimerFrames > 0) {
      this.beginBanner(this.readyBanner);
      if (this.floorIntroActive) {
        this.floorIntroFadeFrames = 15;
      }
    }

    if (shouldStartRingoutBanner) {
      if (game.isBonusStageActive?.()) {
        this.beginBanner(this.bonusFinishBanner);
      } else {
        this.beginBanner(this.fallOutBanner);
      }
    }

    this.lastIntroFrames = game.introTimerFrames;
    this.lastGoalFrames = goalTimerFrames;
    this.lastTimeOverFrames = game.timeoverTimerFrames;
    this.lastRingoutFrames = ringoutTimerFrames;
    this.lastBonusClear = game.bonusClearPending;
    this.lastResultReplayActive = replayActive;
    if (goalEventTick !== null) {
      this.lastGoalEventTick = goalEventTick;
    }
    if (ringoutEventTick !== null) {
      this.lastRingoutEventTick = ringoutEventTick;
    }

    if (this.goalBanner.timer <= 0) {
      this.goalScoreInfo = null;
    }
  }

  update(game: any, dtFrames: number) {
    this.currentGame = game;
    this.syncState(game);
    this.advanceBanner(this.goBanner, dtFrames);
    this.advanceBanner(this.goalBanner, dtFrames);
    this.advanceBanner(this.hurryBanner, dtFrames);
    this.advanceBanner(this.timeOverBanner, dtFrames);
    this.advanceBanner(this.perfectBanner, dtFrames);
    this.advanceBanner(this.bonusFinishBanner, dtFrames);
    this.advanceBanner(this.readyBanner, dtFrames);
    this.advanceBanner(this.fallOutBanner, dtFrames);
    this.frameCounter += dtFrames;
    const hudPlayer = this.getHudPlayer(game);
    const goalTimerFrames = hudPlayer?.goalTimerFrames ?? game?.goalTimerFrames ?? 0;
    const ringoutTimerFrames = hudPlayer?.ringoutTimerFrames ?? game?.ringoutTimerFrames ?? 0;
    const goalInfo = hudPlayer?.goalInfo ?? game?.goalInfo ?? null;

    const targetScore = Math.max(0, Math.trunc(game?.score ?? 0));
    if (this.scoreDisplay > targetScore) {
      this.scoreDisplay = targetScore;
      this.scoreStepFrames = 0;
      this.scoreStepValue = 0;
    }
    if (this.scoreStepFrames === 0 && targetScore > this.scoreDisplay) {
      const diff = targetScore - this.scoreDisplay;
      this.scoreStepFrames = diff >= 1000 ? 120 : 30;
      this.scoreStepValue = Math.floor(diff / this.scoreStepFrames);
      if (this.scoreStepValue <= 0) {
        this.scoreStepValue = 1;
      }
    }
    if (this.scoreStepFrames > 0) {
      const steps = Math.max(1, Math.floor(dtFrames));
      for (let i = 0; i < steps; i += 1) {
        if (this.scoreStepFrames <= 0) {
          break;
        }
        this.scoreDisplay += this.scoreStepValue;
        this.scoreStepFrames -= 1;
        if (this.scoreDisplay > targetScore) {
          this.scoreDisplay = targetScore;
        }
      }
      if (this.scoreStepFrames <= 0) {
        this.scoreDisplay = targetScore;
      }
    }

    if (game?.stageTimeLimitFrames > 0) {
      const timeLeft = game.stageTimeLimitFrames - game.stageTimerFrames;
      if (timeLeft === HURRY_UP_FRAMES) {
        this.beginBanner(this.hurryBanner);
      }
    }

    const timeLeft = game?.stageTimeLimitFrames ? game.stageTimeLimitFrames - game.stageTimerFrames : null;
    if (timeLeft !== null && timeLeft <= 0 && (this.lastTimeLeft ?? 1) > 0) {
      this.spawnBombFragments();
    }
    this.lastTimeLeft = timeLeft;

    if (this.bombFragments.length > 0) {
      this.updateBombFragments(dtFrames);
    }

    if (timeLeft !== null && timeLeft < 240 && timeLeft > 0) {
      this.bombCrackPulse += 40 - (timeLeft * 40) / 240;
    }

    if (this.floorIntroActive) {
      const introFrames = game?.introTimerFrames;
      if (introFrames !== undefined && introFrames > 0) {
        const totalFrames = Math.max(introFrames, game?.introTotalFrames ?? introFrames);
        if (this.introStartFrames <= 0) {
          this.introStartFrames = totalFrames;
          this.floorIntroFrames = 0;
        } else if (this.introStartFrames < introFrames) {
          this.introStartFrames = totalFrames;
        }
        const elapsed = Math.max(0, this.introStartFrames - introFrames);
        if (elapsed > this.floorIntroFrames) {
          this.floorIntroFrames = elapsed;
        }
      } else {
        this.floorIntroFrames += dtFrames;
      }
      if ((game?.introTimerFrames ?? 0) <= 0 && this.floorIntroFrames > 180) {
        this.floorIntroActive = false;
      }
    }
    if (this.floorIntroFadeFrames > 0) {
      this.floorIntroFadeFrames = Math.max(0, this.floorIntroFadeFrames - dtFrames);
      if (this.floorIntroFadeFrames === 0) {
        this.floorIntroActive = false;
      }
    }
    if (this.bonusFloorActive) {
      this.bonusFloorFrames += dtFrames;
    }
    if (this.finalFloorActive) {
      this.finalFloorFrames += dtFrames;
    }

    if (
      this.goalBanner.timer > 0
      && !(game?.isBonusStageActive?.() ?? false)
      && isWarpGoal(goalInfo?.goalType ?? null)
    ) {
      const t = this.goalBanner.duration - this.goalBanner.timer;
      if (t % 2 === 1) {
        const warpX = 320 + 20 * sinFixed(t << 9);
        const warpY = 240 + 10 * sinFixed((t << 8) + 0x4000);
        this.warpTrails.push({
          x: warpX,
          y: warpY,
          scale: 1,
          opacity: 0.5,
          addG: 96,
          addB: 127,
          life: 16,
        });
      }
    }

    if (this.warpTrails.length > 0) {
      this.warpTrails = this.warpTrails.filter((trail) => {
        trail.addG += 6;
        trail.addB += 7;
        trail.scale += 0.008;
        trail.opacity -= 0.03125;
        trail.life -= 1;
        return trail.life > 0 && trail.opacity > 0;
      });
    }
    if (this.goalBanner.timer <= 0 && this.warpTrails.length > 0) {
      this.warpTrails = [];
    }

    const isBonusStage = game?.isBonusStageActive?.() ?? false;
    if (isBonusStage) {
      const inPlayMain = (game?.introTimerFrames ?? 0) <= 0
        && goalTimerFrames <= 0
        && ringoutTimerFrames <= 0
        && (game?.timeoverTimerFrames ?? 0) <= 0;
      const bananasLeft = game?.bananasLeft ?? 0;
      if (!inPlayMain || bananasLeft <= 0) {
        this.bonusBananaCounter = Math.max(0, this.bonusBananaCounter - dtFrames);
      } else {
        this.bonusBananaCounter = Math.min(60, this.bonusBananaCounter + dtFrames);
      }
    } else {
      this.bonusBananaCounter = 0;
    }
  }

  render(game: any, dtSeconds: number) {
    if (!this.ctx || !this.assets || !this.ready) {
      return;
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const assets = this.assets;
    const fonts = assets.fonts;

    const timeLeftRaw = (game?.stageTimeLimitFrames ?? 0) - (game?.stageTimerFrames ?? 0);
    const timeLeft = Math.max(0, timeLeftRaw);
    const { seconds, centis } = formatTimerSeconds(timeLeft);
    const localPlayer = this.getHudPlayer(game);
    const bananasCollected = localPlayer?.ball?.bananas ?? 0;
    const bananasLeft = game?.bananasLeft ?? 0;
    const bananaTotal = bananasCollected + bananasLeft;
    const score = String(Math.max(0, Math.trunc(this.scoreDisplay)));
    const lives = Math.max(0, Math.trunc(game?.lives ?? 0));
    const speedMph = Math.max(0, (localPlayer?.ball?.speed ?? 0) * 134.21985);
    const isBonusStage = game?.isBonusStageActive?.() ?? false;
    const floorInfo = game?.course?.getFloorInfo?.();
    const floorPrefix = floorInfo?.prefix ?? 'FLOOR';
    const floorLabel = floorInfo ? `${floorPrefix} ${floorInfo.current}` : 'FLOOR 1';
    const floorColor = floorPrefix === 'EXTRA' ? '#ffe14d' : null;

    drawText(ctx, fonts.asc20x20, 'SCORE', { x: 108, y: 24 }, 1, null, 'center');
    drawText(ctx, fonts.num22x22, score, { x: 196, y: 48 }, 1, null, 'right');

    drawSprite(ctx, assets.banana, { x: 428, y: 22 }, 0.2);
    drawText(ctx, fonts.asc20x20, 'BANANA(S)', { x: 536, y: 24 }, 1, '#ffe66e', 'center');
    drawText(ctx, fonts.num22x22, '/', { x: 518, y: 47 }, 1, '#ffe66e', 'center');
    drawText(
      ctx,
      fonts.asc20x20,
      `${String(bananasCollected).padStart(3, '0')} ${String(bananaTotal).padStart(3, '0')}`,
      { x: 518, y: 48 },
      1,
      '#ffe66e',
      'center',
    );

    // Lives counter hidden for now.

    if (timeLeftRaw > 0) {
      const bombScale = timeLeftRaw <= 600 ? 1 + func800802E0(timeLeft) : 1;
      drawSprite(ctx, assets.bomb, { x: 320, y: 68 }, BOMB_BASE_SCALE * bombScale);
      if (timeLeftRaw <= 480) {
        const crackOpacity = timeLeftRaw > 420 ? 1 - (timeLeftRaw - 420) / 60 : 1;
        let crackColor: string | null = null;
        if (timeLeftRaw < 240) {
          const pulse = Math.abs(255 - (Math.floor(this.bombCrackPulse) % 510));
          const blue = Math.max(128, pulse);
          crackColor = `rgb(255, ${Math.round(pulse)}, ${Math.round((blue - 128) * 2)})`;
        }
        drawSprite(ctx, assets.bombCrack, { x: 320, y: 68 }, BOMB_BASE_SCALE * bombScale, crackOpacity, crackColor);
      }
    }

    const showIcon = floorInfo?.showDifficultyIcon ?? false;
    const floorX = floorPrefix === 'MASTER' ? 32 : showIcon ? 72 : 32;
    drawText(ctx, fonts.asc20x20, floorLabel, { x: floorX, y: 458 }, 1, floorColor, 'left');

    const secMetrics = textMetrics(fonts.num24x37, seconds, 1);
    const secLeft = 320 - secMetrics.width / 2;
    const secTop = 85 - secMetrics.height;
    drawTextAt(ctx, fonts.num24x37, seconds, secLeft, secTop, 1, null);
    const centiMetrics = textMetrics(fonts.num12x19, `:${centis}`, 1);
    const centiLeft = secLeft + secMetrics.width - 4;
    const centiTop = 85 - centiMetrics.height;
    drawTextAt(ctx, fonts.num12x19, `:${centis}`, centiLeft, centiTop, 1, null);

    const speedText = String(Math.round(speedMph)).padStart(2, '0');
    const rttValue = Math.max(0, Math.min(999, Math.round(game?.netplayRttMs ?? 0)));
    const rttText = `${String(rttValue).padStart(3, '0')}ms`;
    drawText(ctx, fonts.asc20x20, rttText, { x: 32, y: 404 }, 1, null, 'left');
    drawText(ctx, fonts.asc20x20, speedText, { x: 32, y: 428 }, 1, null, 'left');
    const speedWidth = measureText(fonts.asc20x20, speedText, 1);
    const mphWidth = assets.mph.width * MPH_SCALE;
    drawSprite(ctx, assets.mph, { x: 32 + speedWidth + mphWidth / 2 + 6, y: 428 }, MPH_SCALE);

    if (isBonusStage && this.bonusBananaCounter > 0) {
      const counter = Math.min(60, Math.max(0, this.bonusBananaCounter));
      const opacity = counter / 60;
      let blueness = 2 * ((Math.floor(this.frameCounter) % 60) / 59);
      if (blueness > 1) {
        blueness = 2 - blueness;
      }
      const blue = Math.round(255 * blueness);
      const color = `rgb(255, 255, ${blue})`;
      drawText(
        ctx,
        fonts.asc32x32,
        `${padNumber(bananasLeft, 2)} BANANA${bananasLeft === 1 ? ' ' : 'S'} LEFT`,
        { x: 320, y: 380 },
        1,
        color,
        'center',
        'center',
        opacity,
      );
    }

    if (floorInfo && floorInfo.showDifficultyIcon) {
      const iconCell = 64;
      const iconIndex = floorInfo.difficultyIconIndex ?? 1;
      const sx = (iconIndex - 1) * iconCell;
      const sy = iconCell * 1;
      const scale = 0.5;
      const iconX = 48;
      const iconY = 458;
      drawTintedImage(
        ctx,
        assets.lvIcon,
        sx,
        sy,
        iconCell,
        iconCell,
        iconX - (iconCell * scale) * 0.5,
        iconY - (iconCell * scale) * 0.5,
        iconCell * scale,
        iconCell * scale,
        null,
        1,
      );
    }

    if (this.bombFragments.length > 0) {
      this.renderBombFragments(ctx, assets);
    }

    this.renderBanners(ctx, assets);

    ctx.restore();
  }

  private spawnBombFragments() {
    const fragments: BombFragment[] = [];
    for (let i = 0; i < BOMB_FRAG_X.length; i += 1) {
      fragments.push({
        index: i,
        x: 320 - 44 + BOMB_FRAG_X[i],
        y: 68 - 44 + BOMB_FRAG_Y[i],
        vx: 1.2 * (BOMB_FRAG_X[i] - 30),
        vy: 1.2 * (BOMB_FRAG_Y[i] - 20),
        opacity: 1,
        scale: BOMB_BASE_SCALE,
      });
    }
    this.bombFragments = fragments;
  }

  private updateBombFragments(dtFrames: number) {
    const step = dtFrames <= 0 ? 1 : dtFrames;
    for (let stepIndex = 0; stepIndex < step; stepIndex += 1) {
      this.bombFragments = this.bombFragments.filter((fragment) => {
        fragment.opacity *= 0.95;
        fragment.scale *= 1.01;
        const t = fragment.opacity * fragment.opacity;
        fragment.x += 0.9 * fragment.vx * t;
        fragment.y += (0.97 * fragment.vy * t) + (1 - t);
        return fragment.opacity >= 0.005;
      });
    }
  }

  private renderBombFragments(ctx: CanvasRenderingContext2D, assets: HudAssets) {
    for (const fragment of this.bombFragments) {
      const img = assets.bombParts[fragment.index % assets.bombParts.length];
      drawSprite(ctx, img, { x: fragment.x, y: fragment.y }, fragment.scale, fragment.opacity);
    }
  }

  private renderBanners(ctx: CanvasRenderingContext2D, assets: HudAssets) {
    const fonts = assets.fonts;
    const game = this.currentGame;
    const hudPlayer = this.getHudPlayer(game);
    const goalTimerFrames = hudPlayer?.goalTimerFrames ?? game?.goalTimerFrames ?? 0;
    const goalInfo = hudPlayer?.goalInfo ?? game?.goalInfo ?? null;

    if (this.goBanner.timer > 0) {
      const t = this.goBanner.duration - this.goBanner.timer;
      let scaleX = 1;
      let scaleY = 1;
      let opacity = 1;
      let flash = 0;
      if (t < 15) {
        const temp = 15 - t;
        opacity = t / 15;
        scaleX = 1 + temp * 0.1;
        scaleY = 1 - temp * 0.04;
      } else if (t < 30) {
        const wave = sinFixed((t - 15) * 0x888);
        flash = ((Math.floor(this.frameCounter) >> 1) & 1) ? 192 : 0;
        scaleX = 1 - wave * 0.5;
        scaleY = 1 + wave;
      } else if (t < 45) {
        const wave = sinFixed((t - 30) * 0x888);
        flash = ((Math.floor(this.frameCounter) >> 1) & 1) ? 192 : 0;
        scaleX = 1 + wave * 0.75;
        scaleY = 1 - wave * 0.375;
      } else {
        const remaining = this.goBanner.timer;
        opacity = remaining / 15;
        scaleX = 1 - (15 - remaining) * 0.04;
        scaleY = 1 + (15 - remaining) * 0.1;
      }

      const color = flash > 0 ? '#c0f2ff' : '#00a0ff';
      const font = fonts.asc72x64;
      const baseScaleX = 1.5 * scaleX;
      const baseScaleY = 1.5 * scaleY;
      const tempR23 = 1.5 * (36 * scaleX);
      const tempR3 = 1.5 * (32 * scaleY);

      for (let i = 0; i < 2; i += 1) {
        let phiX = 0;
        let phiY = 0;
        if (t < 15) {
          const side = i === 0 ? -320 : 320;
          phiX = side * sinFixed((15 - t) * 0x444);
        } else if (t >= 45) {
          const side = i === 0 ? -240 : 240;
          phiY = side * sinFixed((15 - this.goBanner.timer) * 0x444);
        }
        const charCode = i === 0 ? 0x47 : 0x4f;
        const x = 320 + phiX - tempR23 + (i === 0 ? -tempR23 : tempR23);
        const y = 240 + phiY - tempR3 + (font.params.lineHeight * baseScaleY) / 2;
        drawGlyph(ctx, font, charCode, x, y, baseScaleX, baseScaleY, color, opacity);
      }
    }

    if (this.goalBanner.timer > 0) {
      const t = this.goalBanner.duration - this.goalBanner.timer;
      let x = 320;
      let y = 320;
      let scale = 1;
      let opacity = 1;
      let flash = 0;
      if (t < 30) {
        opacity = t / 30;
      } else if (t < 45) {
        flash = sinFixed((t - 30) * 0x888) * 255;
      } else if (this.goalBanner.timer < 15) {
        opacity = this.goalBanner.timer / 15;
      }
      if (t >= 180) {
        const t2 = clamp((t - 180) / 30, 0, 1);
        x = lerp(320, 561, t2);
        y = lerp(320, 420, t2);
        scale = lerp(1, 0.5, t2);
      }

      if (t < 30) {
        const scatter = (30 - t) * 0.03333;
        const offsets = [
          { x: -1, y: 1 },
          { x: 1, y: 1 },
          { x: 1, y: -1 },
          { x: -1, y: -1 },
        ];
        for (const dir of offsets) {
          const pos = { x: x + scatter * (216 * dir.x), y: y + scatter * (192 * dir.y) };
          drawSprite(ctx, assets.goal, pos, scale, opacity);
          if (flash > 0) {
            drawSpriteSolidTint(ctx, assets.goal, pos, scale, opacity * (flash / 255));
          }
        }
      } else {
        const pos = { x, y };
        drawSprite(ctx, assets.goal, pos, scale, opacity);
        if (flash > 0) {
          drawSpriteSolidTint(ctx, assets.goal, pos, scale, opacity * (flash / 255));
        }
      }

      if (game && !(game.isBonusStageActive?.() ?? false) && isWarpGoal(goalInfo?.goalType ?? null)) {
        const floorInfo = game.course?.getFloorInfo?.();
        const goalType = normalizeGoalType(goalInfo?.goalType ?? game.stage?.goals?.[0]?.type ?? 'B');
        const currentFloor = floorInfo?.current ?? 1;
        let destinationFloor = currentFloor + getWarpJumpCount(game, goalType);
        if (typeof floorInfo?.total === 'number') {
          destinationFloor = Math.min(floorInfo.total, destinationFloor);
        }
        const warpText = `JUMP TO FLOOR ${destinationFloor}`;
        for (const trail of this.warpTrails) {
          const color = `rgb(0, ${Math.min(255, Math.round(trail.addG))}, ${Math.min(255, Math.round(trail.addB))})`;
          drawText(
            ctx,
            fonts.asc32x32,
            warpText,
            { x: trail.x, y: trail.y },
            trail.scale,
            color,
            'center',
            trail.opacity,
          );
        }
        const opacityWarp = t < 30 ? t / 30 : this.goalBanner.timer < 15 ? this.goalBanner.timer / 15 : 1;
        const warpX = 320 + 20 * sinFixed(t << 9);
        const warpY = 240 + 10 * sinFixed((t << 8) + 0x4000);
        drawText(
          ctx,
          fonts.asc32x32,
          warpText,
          { x: warpX, y: warpY },
          1,
          '#00c0ff',
          'center',
          opacityWarp,
        );
      }
    }

    if (this.goalScoreInfo && this.goalBanner.timer > 0 && !(game.isBonusStageActive?.() ?? false)) {
      const scoreInfo = this.goalScoreInfo;
      const baseT = GOAL_SEQUENCE_FRAMES - this.goalBanner.timer;
      const counter = this.goalBanner.timer;
      const baseX = 24;
      let lineY = 128;
      const font = fonts.asc16x16;

      const labelPhase = (t: number) => {
        if (t < 60) {
          return null;
        }
        if (t < 90) {
          return { opacity: 0.03333 * (t - 60), offsetX: (t - 90) * 5 };
        }
        if (counter <= 15) {
          return { opacity: 0.06666 * counter, offsetX: 0 };
        }
        return { opacity: 1, offsetX: 0 };
      };

      const valuePhase = (t: number) => {
        if (t < 120) {
          return null;
        }
        if (t < 150) {
          return { opacity: 0.03333 * (t - 120) };
        }
        if (counter <= 15) {
          return { opacity: 0.06666 * counter };
        }
        return { opacity: 1 };
      };

      const drawScoreLine = (
        t: number,
        label: string,
        value: string,
        color: string,
        addColor: string | null = null,
      ) => {
        const labelState = labelPhase(t);
        if (!labelState) {
          return;
        }
        const valueState = valuePhase(t);
        const lineTop = lineY - 10;
        const labelWidth = measureText(font, label, 1);
        const labelColor = addColor ? addColor : color;
        drawText(ctx, font, label, { x: baseX + labelState.offsetX, y: lineTop }, 1, labelColor, 'left', 'top', labelState.opacity);
        if (valueState) {
          drawText(
            ctx,
            font,
            value,
            { x: baseX + labelState.offsetX + labelWidth, y: lineTop },
            1,
            labelColor,
            'left',
            'top',
            valueState.opacity,
          );
        }
      };

      let clearColor = '#6060ff';
      if (scoreInfo.goalType === 'R') {
        clearColor = '#ff6060';
      } else if (scoreInfo.goalType === 'G') {
        clearColor = '#60ff60';
      }
      const clearValue = ` ${padNumber(scoreInfo.clearScore, 5)}`;
      drawScoreLine(baseT, 'CLEAR SCORE : ', clearValue, clearColor);

      if (scoreInfo.warpMultiplier > 1) {
        lineY += 20;
        const warpValue = scoreInfo.warpMultiplier < 10
          ? `   X ${scoreInfo.warpMultiplier}`
          : `  X ${scoreInfo.warpMultiplier}`;
        drawScoreLine(baseT - 10, ' WARP BONUS   ', warpValue, '#00c0ff');
      }

      if (scoreInfo.timeBonus > 1) {
        lineY += 20;
        drawScoreLine(baseT - 20, ' TIME BONUS   ', '   X 2', '#ffff00');
      }

      lineY += 24;
      const floorValue = padNumber(scoreInfo.floorScore, 6);
      const floorT = baseT - 60;
      const flash = Math.max(sinFixed(floorT * 0x280) * 255, 0);
      const addR = Math.min(255, 255 + flash);
      const addG = Math.min(255, 128 + flash);
      const addB = Math.min(255, flash);
      drawScoreLine(floorT, 'FLOOR SCORE : ', floorValue, '#ff8000', `rgb(${Math.round(addR)}, ${Math.round(addG)}, ${Math.round(addB)})`);
    }

    if (this.hurryBanner.timer > 0) {
      const t = this.hurryBanner.duration - this.hurryBanner.timer;
      const flash = (Math.floor(t) % 2) === 0 ? 1 : 0;
      const jitterX = (Math.random() - 0.5) * 4;
      const jitterY = (Math.random() - 0.5) * 2;
      drawText(
        ctx,
        fonts.asc32x32,
        'HURRY UP!',
        { x: 320 + jitterX, y: 240 + jitterY },
        1,
        '#ff8800',
        'center',
        flash,
      );
    }

    if (this.timeOverBanner.timer > 0) {
      const t = this.timeOverBanner.duration - this.timeOverBanner.timer;
      const opacity = t < 30 ? t / 30 : this.timeOverBanner.timer < 15 ? this.timeOverBanner.timer / 15 : 1;
      let y = 240;
      if (t < 30) {
        y = 240 - (30 - t) * 6;
      } else if (t < 60) {
        y = 240 - 32 * sinFixed((t - 30) * 0x444);
      } else if (t < 90) {
        y = 240 - 8 * sinFixed((t - 60) * 0x444);
      }
      drawText(ctx, fonts.asc72x64, 'TIME OVER', { x: 320, y }, 1, '#ff8c00', 'center', 'center', opacity);
    }

    if (this.readyBanner.timer > 0) {
      const t = this.readyBanner.duration - this.readyBanner.timer;
      let opacity = 1;
      let scaleX = 1;
      let scaleY = 1;
      if (t < 30) {
        opacity = 0.03333 * t;
        scaleY = sinFixed(t * 0x222);
      } else if (t < 60) {
        scaleY = 1 - sinFixed((t - 30) * 0x444) * 0.2;
      } else if (this.readyBanner.timer <= 15) {
        opacity = 0.06666 * this.readyBanner.timer;
        scaleX = 0.06666 * this.readyBanner.timer;
      }
      drawTextScaled(
        ctx,
        fonts.asc72x64,
        'READY',
        { x: 320, y: 240 },
        scaleX,
        scaleY,
        '#ffc800',
        'center',
        'center',
        opacity,
      );
    }

    if (this.perfectBanner.timer > 0) {
      const t = clamp((this.perfectBanner.duration - this.perfectBanner.timer) / 30, 0, 1);
      const scale = lerp(5, 0.8, t);
      drawText(ctx, fonts.asc72x64, 'PERFECT', { x: 320, y: 240 }, scale, null, 'center');
    }

    if (this.bonusFinishBanner.timer > 0) {
      const t = clamp((this.bonusFinishBanner.duration - this.bonusFinishBanner.timer) / 30, 0, 1);
      const scale = lerp(5, 0.8, t);
      drawText(ctx, fonts.asc72x64, 'BONUS FINISH', { x: 320, y: 240 }, scale, '#ff8800', 'center');
    }

    if (this.fallOutBanner.timer > 0) {
      const t = this.fallOutBanner.duration - this.fallOutBanner.timer;
      const opacity = t < 30 ? 0.03333 * t : this.fallOutBanner.timer <= 15 ? 0.06666 * this.fallOutBanner.timer : 1;
      let x = 320;
      let y = 240;
      let scale = 1;
      if (t < 30) {
        y = 240 - (30 - t) * 6;
      } else if (t < 60) {
        y = 240 - 32 * sinFixed((t - 30) * 0x444);
      } else if (t < 90) {
        y = 240 - 8 * sinFixed((t - 60) * 0x444);
      } else if (t >= 120) {
        x = 496;
        y = 420;
        scale = 0.5;
      } else if (t >= 90) {
        const dt = t - 90;
        x = 320 + dt * 5.86666;
        y = 240 + dt * 6;
        scale = 1 - dt * 0.01666;
      }
      drawText(ctx, fonts.asc72x64, 'FALL OUT', { x, y }, scale, '#ff8c00', 'center', 'center', opacity);
    }

    if (this.floorIntroActive && game) {
      const floorInfo = game.course?.getFloorInfo?.();
      const floorNum = floorInfo?.current ?? 1;
      const prefix = floorInfo?.prefix ?? 'FLOOR';
      const text = `${prefix} ${floorNum}`;
      const font = fonts.asc72x64;
      const scaleX = 0.8;
      const scaleY = 0.8;
      const centerX = (text.length * 57) / 2;
      const spaceIndex = text.indexOf(' ');
      const t = this.floorIntroFrames;
      const fadeFrames = this.floorIntroFadeFrames;
      const fadeOpacity = fadeFrames > 0 ? 0.06666 * fadeFrames : 1;
      let baseColor = '#ffd200';
      if (prefix === 'EXTRA') {
        baseColor = '#ffe14d';
      }

      for (let i = 0; i < text.length; i += 1) {
        if (text[i] === ' ') {
          continue;
        }
        if (i > spaceIndex) {
          if (t < 30 + spaceIndex * 16) {
            continue;
          }
        } else if (i > 0) {
          if (t < 30 + (i - 1) * 16) {
            continue;
          }
        }

        let xOffset = 0;
        let yOffset = 0;
        if (i === 0 && t < 30) {
          xOffset = (30 - t) * -5;
        } else if (i > 0 && i < spaceIndex && t < 30 + i * 16) {
          xOffset = -3.6 * (30 + i * 16 - t);
        } else if (i > spaceIndex) {
          xOffset = -28;
        }
        if (fadeFrames > 0) {
          const dir = i < spaceIndex ? ((i & 1) ? 1 : -1) : ((i & 1) ? -1 : 1);
          yOffset = (15 - fadeFrames) * 8 * dir;
        }

        const x = 320 - centerX + 14.4 + 57.6 * i + xOffset;
        const y = 240 - 25.6 + yOffset;
        let charOpacity = fadeOpacity;
        if (i > spaceIndex) {
          charOpacity = Math.min(0.0625 * (t - 30 - spaceIndex * 16), fadeOpacity);
        } else if (i > 0) {
          charOpacity = Math.min(0.0625 * (t - 30 - (i - 1) * 16), fadeOpacity);
        } else if (i === 0 && fadeFrames > 0) {
          charOpacity = fadeOpacity;
        }

        drawGlyph(
          ctx,
          font,
          text.charCodeAt(i),
          x,
          y + 25.6,
          scaleX,
          scaleY,
          baseColor,
          charOpacity,
        );
      }
    }

    if (this.bonusFloorActive) {
      const t = this.bonusFloorFrames;
      const text = 'BONUS FLOOR';
      const font = fonts.asc72x64;
      let opacity = 1;
      let rotation = 0;
      if (t < 60) {
        opacity = 0.01666 * t;
        rotation = (60 - t) * 0x111;
      }
      let x = 320;
      let y = 300;
      let scale = 0.5;
      if (t >= 150) {
        x = 500;
        y = 452;
        scale = 0.3;
      } else if (t >= 120) {
        const dt = t - 120;
        x = 320 + dt * 6;
        y = 300 + dt * 5.066666;
        scale = 0.5 - dt * 0.006666;
      }
      const rotationRad = (rotation * Math.PI) / 0x8000;
      const textWidth = measureText(font, text, scale);
      let cursorX = x - textWidth / 2;
      const top = y - (font.params.lineHeight * scale) / 2;
      for (const ch of text) {
        if (ch === ' ') {
          cursorX += font.params.spaceWidth * scale;
          continue;
        }
        drawGlyphRotatedTopLeft(
          ctx,
          font,
          ch.charCodeAt(0),
          cursorX,
          top,
          scale,
          rotationRad,
          '#ff8800',
          opacity,
        );
        cursorX += font.params.spaceWidth * scale;
      }
    }

    if (this.finalFloorActive) {
      const t = this.finalFloorFrames;
      const floorInfo = game?.course?.getFloorInfo?.();
      const difficulty = floorInfo?.difficultyIndex ?? 2;
      let baseColor = '#ffc000';
      if (difficulty === 0) {
        baseColor = '#00d000';
      } else if (difficulty === 1) {
        baseColor = '#0000e0';
      }
      const text = 'FINAL FLOOR';
      const font = fonts.asc72x64;
      const baseScale = 0.5;
      const textWidth = measureText(font, text, 1);
      const w = textWidth * baseScale;
      const h = font.params.lineHeight * baseScale;
      let x = 320;
      let y = 300;
      let scale = baseScale;
      if (t >= 150) {
        x = 500;
        y = 452;
        scale = 0.3;
      } else if (t >= 120) {
        const dt = t - 120;
        x = 320 + dt * 6;
        y = 300 + dt * 5.066666;
        scale = baseScale - dt * 0.006666;
      }

      if (t <= 120) {
        let advance = 0;
        for (let i = 0; i < text.length; i += 1) {
          if (i > Math.floor(t / 10)) {
            break;
          }
          const char = text[i];
          if (char === ' ') {
            advance += font.params.spaceWidth * baseScale;
            continue;
          }
          const charWidth = font.params.spaceWidth;
          const elapsed = clamp((t - 10 * i) / 10, 0, 1);
          const sx = 1 + ((i % 2 === 0) ? 5 * (1 - elapsed) : 0);
          const sy = 1 + ((i % 2 === 0) ? 0 : 5 * (1 - elapsed));
          const charX = x - w * 0.5 + advance - (charWidth * baseScale) * (sx - 1) * 0.5;
          const charY = y - h * 0.5 - h * (sy - 1) * 0.5;
          drawGlyph(
            ctx,
            font,
            char.charCodeAt(0),
            charX,
            charY + h * 0.5,
            baseScale * sx,
            baseScale * sy,
            baseColor,
            elapsed,
          );
          advance += charWidth * baseScale;
        }
      } else {
        drawText(ctx, font, text, { x, y }, scale, baseColor, 'center', 1);
      }
    }
  }
}
