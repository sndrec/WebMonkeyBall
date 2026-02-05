import { mat4, vec3, vec4 } from 'gl-matrix';
import { Game } from './game.js';
import { AudioManager } from './audio.js';
import { GAME_SOURCES, S16_TO_RAD, STAGE_BASE_PATHS, type GameSource } from './constants.js';
import { getStageListForDifficulty } from './course.js';
import {
  SMB2_CHALLENGE_ORDER,
  SMB2_STORY_ORDER,
  type Smb2ChallengeDifficulty,
  type Smb2CourseConfig,
} from './course_smb2.js';
import {
  MB2WS_CHALLENGE_ORDER,
  MB2WS_STORY_ORDER,
  type Mb2wsChallengeDifficulty,
  type Mb2wsCourseConfig,
} from './course_mb2ws.js';
import ArrayBufferSlice from './noclip/ArrayBufferSlice.js';
import { Camera } from './noclip/Camera.js';
import { GfxDevice } from './noclip/gfx/platform/GfxPlatform.js';
import {
  GfxPlatformWebGL2Config,
  createSwapChainForWebGL2,
} from './noclip/gfx/platform/GfxPlatformWebGL2.js';
import { AntialiasingMode } from './noclip/gfx/helpers/RenderGraphHelpers.js';
import { parseAVTpl } from './noclip/SuperMonkeyBall/AVTpl.js';
import { decompressLZ } from './noclip/SuperMonkeyBall/AVLZ.js';
import * as Nl from './noclip/SuperMonkeyBall/NaomiLib.js';
import * as Gma from './noclip/SuperMonkeyBall/Gma.js';
import { GameplaySyncState, Renderer } from './noclip/Render.js';
import { LobbyClient, HostRelay, ClientPeer, createHostOffer, applyHostSignal } from './netplay.js';
import type { QuantizedInput } from './determinism.js';
import { hashSimState } from './sim_hash.js';
import type {
  ClientToHostMessage,
  FrameBundleMessage,
  HostToClientMessage,
  PlayerProfile,
  RoomInfo,
  RoomMeta,
  ChatMessage,
} from './netcode_protocol.js';
import { parseStagedefLz } from './noclip/SuperMonkeyBall/Stagedef.js';
import { StageId, STAGE_INFO_MAP } from './noclip/SuperMonkeyBall/StageInfo.js';
import type { StageData } from './noclip/SuperMonkeyBall/World.js';
import { convertSmb2StageDef, getMb2wsStageInfo, getSmb2StageInfo } from './smb2_render.js';
import { HudRenderer } from './hud.js';
import type { ReplayData } from './replay.js';
import {
  fetchPackSlice,
  prefetchPackSlice,
  getActivePack,
  getPackCourseData,
  getPackStageBasePath,
  hasPackForGameSource,
  loadPackFromFileList,
  loadPackFromUrl,
  loadPackFromZipFile,
  setActivePack,
  setPackEnabled,
} from './pack.js';
import type { LoadedPack } from './pack.js';

function clamp(value: number, min: number, max: number) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

const DEFAULT_PAD_GATE = [
  [84, 0],
  [59, 59],
  [0, 84],
  [-59, 59],
  [-84, 0],
  [-59, -59],
  [0, -84],
  [59, -59],
];

function getStageBasePath(gameSource: GameSource): string {
  const selection = gameSourceSelect?.value as GameSourceSelection | undefined;
  const usePack = !!selection && selection.startsWith('pack:') && hasPackForGameSource(gameSource);
  if (usePack) {
    return getPackStageBasePath(gameSource)
      ?? STAGE_BASE_PATHS[gameSource]
      ?? STAGE_BASE_PATHS[GAME_SOURCES.SMB1];
  }
  return STAGE_BASE_PATHS[gameSource] ?? STAGE_BASE_PATHS[GAME_SOURCES.SMB1];
}
const NAOMI_STAGE_IDS = new Set([
  10, 19, 20, 30, 49, 50, 60, 70, 80, 92, 96, 97, 98, 99, 100, 114, 115, 116, 117, 118, 119, 120,
]);

function isNaomiStage(stageId: number): boolean {
  return NAOMI_STAGE_IDS.has(stageId);
}

type GameSourceSelection = GameSource | `pack:${string}`;
const loadedPacks = new Map<string, LoadedPack>();
let activePackKey: string | null = null;

function normalizePackKey(base: string) {
  return base.replace(/\s+/g, '-').toLowerCase();
}

function createPackKey(pack: LoadedPack) {
  const base = normalizePackKey(pack.manifest.id || pack.manifest.name || 'pack');
  if (!loadedPacks.has(base)) {
    return base;
  }
  let counter = 2;
  while (loadedPacks.has(`${base}-${counter}`)) {
    counter += 1;
  }
  return `${base}-${counter}`;
}

function resolveSelectedGameSource() {
  const selection = (gameSourceSelect?.value as GameSourceSelection) ?? GAME_SOURCES.SMB1;
  if (selection.startsWith('pack:')) {
    const pack = getActivePack();
    if (pack) {
      return { selection, gameSource: pack.manifest.gameSource };
    }
    return { selection, gameSource: GAME_SOURCES.SMB1 };
  }
  return { selection, gameSource: selection as GameSource };
}

function updatePackUi() {
  const pack = getActivePack();
  if (packStatus) {
    if (!pack) {
      if (loadedPacks.size > 0) {
        packStatus.textContent = `Loaded packs: ${loadedPacks.size}`;
      } else {
        packStatus.textContent = 'No pack loaded';
      }
    } else if (loadedPacks.size <= 1) {
      packStatus.textContent = `Loaded: ${pack.manifest.name} (${pack.manifest.gameSource.toUpperCase()})`;
    } else {
      packStatus.textContent = `Loaded packs: ${loadedPacks.size} (active: ${pack.manifest.name})`;
    }
  }
  if (!gameSourceSelect) {
    return;
  }
  for (const option of Array.from(gameSourceSelect.querySelectorAll('option[data-pack="true"]'))) {
    option.remove();
  }
  for (const [key, entry] of loadedPacks.entries()) {
    const option = document.createElement('option');
    option.value = `pack:${key}`;
    option.textContent = `Pack: ${entry.manifest.name}`;
    option.dataset.pack = 'true';
    gameSourceSelect.appendChild(option);
  }
  if (activePackKey && gameSourceSelect.querySelector(`option[value="pack:${activePackKey}"]`)) {
    gameSourceSelect.value = `pack:${activePackKey}`;
  }
}

function syncPackEnabled() {
  if (!gameSourceSelect) {
    return;
  }
  const selection = gameSourceSelect.value;
  if (selection.startsWith('pack:')) {
    const key = selection.slice('pack:'.length);
    const pack = loadedPacks.get(key) ?? null;
    activePackKey = pack ? key : null;
    setActivePack(pack);
    setPackEnabled(!!pack);
  } else {
    activePackKey = null;
    setPackEnabled(false);
  }
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const hudCanvas = document.getElementById('hud-canvas') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLElement;
const mainMenuPanel = document.getElementById('main-menu') as HTMLElement | null;
const multiplayerMenuPanel = document.getElementById('multiplayer-menu') as HTMLElement | null;
const multiplayerIngameMenuPanel = document.getElementById('multiplayer-ingame-menu') as HTMLElement | null;
const settingsMenuPanel = document.getElementById('settings-menu') as HTMLElement | null;
const levelSelectMenuPanel = document.getElementById('level-select-menu') as HTMLElement | null;
const stageFade = document.getElementById('stage-fade') as HTMLElement;
const mobileMenuButton = document.getElementById('mobile-menu-button') as HTMLButtonElement | null;
const fullscreenButton = document.getElementById('fullscreen-button') as HTMLButtonElement | null;
const controlModeField = document.getElementById('control-mode-field') as HTMLElement | null;
const controlModeSelect = document.getElementById('control-mode') as HTMLSelectElement | null;
const gyroRecalibrateButton = document.getElementById('gyro-recalibrate') as HTMLButtonElement | null;
const gyroHelper = document.getElementById('gyro-helper') as HTMLElement | null;
const gyroHelperFrame = gyroHelper?.querySelector('.gyro-helper-frame') as HTMLElement | null;
const gyroHelperDevice = document.getElementById('gyro-helper-device') as HTMLElement | null;
const controlModeSettings = document.getElementById('control-mode-settings') as HTMLElement | null;
const gyroSettings = document.getElementById('gyro-settings') as HTMLElement | null;
const touchSettings = document.getElementById('touch-settings') as HTMLElement | null;
const inputFalloffBlock = document.getElementById('input-falloff-block') as HTMLElement | null;
const gamepadCalibrationBlock = document.getElementById('gamepad-calibration-block') as HTMLElement | null;
const gyroSensitivityInput = document.getElementById('gyro-sensitivity') as HTMLInputElement | null;
const gyroSensitivityValue = document.getElementById('gyro-sensitivity-value') as HTMLOutputElement | null;
const joystickSizeInput = document.getElementById('joystick-size') as HTMLInputElement | null;
const joystickSizeValue = document.getElementById('joystick-size-value') as HTMLOutputElement | null;
const inputFalloffInput = document.getElementById('input-falloff') as HTMLInputElement | null;
const inputFalloffValue = document.getElementById('input-falloff-value') as HTMLOutputElement | null;
const inputFalloffCurveWrap = document.getElementById('input-falloff-curve-wrap') as HTMLElement | null;
const inputFalloffPath = document.getElementById('input-falloff-path') as SVGPathElement | null;
const inputPreview = document.getElementById('input-preview') as HTMLElement | null;
const inputRawDot = document.getElementById('input-raw-dot') as HTMLElement | null;
const inputProcessedDot = document.getElementById('input-processed-dot') as HTMLElement | null;
const gamepadCalibrationOverlay = document.getElementById('gamepad-calibration') as HTMLElement | null;
const gamepadCalibrationMap = document.getElementById('gamepad-calibration-map') as HTMLCanvasElement | null;
const gamepadCalibrationButton = document.getElementById('gamepad-calibrate') as HTMLButtonElement | null;
const gamepadCalibrationCtx = gamepadCalibrationMap?.getContext('2d') ?? null;
const ingamePlayerList = document.getElementById('ingame-player-list') as HTMLElement | null;
const ingameResumeButton = document.getElementById('ingame-resume') as HTMLButtonElement | null;
const ingameLeaveButton = document.getElementById('ingame-leave') as HTMLButtonElement | null;
const netplayDebugWrap = document.createElement('div');
const netplayDebugWarningEl = document.createElement('div');
const netplayDebugInfoEl = document.createElement('div');
netplayDebugWrap.id = 'netplay-debug';
netplayDebugWrap.style.position = 'fixed';
netplayDebugWrap.style.left = '12px';
netplayDebugWrap.style.top = '120px';
netplayDebugWrap.style.zIndex = '10000';
netplayDebugWrap.style.color = '#ffffff';
netplayDebugWrap.style.font = '12px/1.4 system-ui, sans-serif';
netplayDebugWrap.style.whiteSpace = 'pre';
netplayDebugWrap.style.pointerEvents = 'none';
netplayDebugWrap.style.textShadow = '0 1px 2px rgba(0,0,0,0.7)';
netplayDebugWrap.style.display = 'none';
netplayDebugWarningEl.style.color = '#ff6666';
netplayDebugWarningEl.style.fontWeight = '600';
netplayDebugWarningEl.style.marginBottom = '4px';
netplayDebugInfoEl.style.whiteSpace = 'pre';
netplayDebugWrap.append(netplayDebugWarningEl, netplayDebugInfoEl);
document.body.appendChild(netplayDebugWrap);
const nameplateLayer = document.createElement('div');
nameplateLayer.id = 'nameplate-layer';
document.body.appendChild(nameplateLayer);
const startButton = document.getElementById('start') as HTMLButtonElement;
const resumeButton = document.getElementById('resume') as HTMLButtonElement;
const difficultySelect = document.getElementById('difficulty') as HTMLSelectElement;
const smb1StageSelect = document.getElementById('smb1-stage') as HTMLSelectElement;
const gameSourceSelect = document.getElementById('game-source') as HTMLSelectElement;
const packLoadButton = document.getElementById('pack-load') as HTMLButtonElement | null;
const packPicker = document.getElementById('pack-picker') as HTMLElement | null;
const packLoadZipButton = document.getElementById('pack-load-zip') as HTMLButtonElement | null;
const packLoadFolderButton = document.getElementById('pack-load-folder') as HTMLButtonElement | null;
const packStatus = document.getElementById('pack-status') as HTMLElement | null;
const packFileInput = document.getElementById('pack-file') as HTMLInputElement | null;
const packFolderInput = document.getElementById('pack-folder') as HTMLInputElement | null;
const replaySaveButton = document.getElementById('replay-save') as HTMLButtonElement | null;
const replayLoadButton = document.getElementById('replay-load') as HTMLButtonElement | null;
const replayFileInput = document.getElementById('replay-file') as HTMLInputElement | null;
const replayStatus = document.getElementById('replay-status') as HTMLElement | null;
const smb1Fields = document.getElementById('smb1-fields') as HTMLElement;
const smb2Fields = document.getElementById('smb2-fields') as HTMLElement;
const smb2ModeSelect = document.getElementById('smb2-mode') as HTMLSelectElement;
const smb2ChallengeSelect = document.getElementById('smb2-challenge') as HTMLSelectElement;
const smb2ChallengeStageSelect = document.getElementById('smb2-challenge-stage') as HTMLSelectElement;
const smb2StoryWorldSelect = document.getElementById('smb2-story-world') as HTMLSelectElement;
const smb2StoryStageSelect = document.getElementById('smb2-story-stage') as HTMLSelectElement;
const interpolationToggle = document.getElementById('interpolation') as HTMLInputElement;
const musicVolumeInput = document.getElementById('music-volume') as HTMLInputElement;
const sfxVolumeInput = document.getElementById('sfx-volume') as HTMLInputElement;
const announcerVolumeInput = document.getElementById('announcer-volume') as HTMLInputElement;
const musicVolumeValue = document.getElementById('music-volume-value') as HTMLOutputElement;
const sfxVolumeValue = document.getElementById('sfx-volume-value') as HTMLOutputElement;
const announcerVolumeValue = document.getElementById('announcer-volume-value') as HTMLOutputElement;

const hudStatus = document.getElementById('hud-status') as HTMLElement | null;

const defaultChallengeOptions = Array.from(smb2ChallengeSelect?.options ?? []).map((option) => ({
  value: option.value,
  label: option.textContent ?? option.value,
}));

const hasTouch = ('ontouchstart' in window) || ((navigator.maxTouchPoints ?? 0) > 0);

function updateMobileMenuButtonVisibility() {
  if (!mobileMenuButton) {
    return;
  }
  const shouldShow = hasTouch && overlay.classList.contains('hidden') && running;
  mobileMenuButton.classList.toggle('hidden', !shouldShow);
}

function updateFullscreenButtonVisibility() {
  if (!fullscreenButton) {
    return;
  }
  const root = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  const supportsFullscreen = typeof root.requestFullscreen === 'function' || typeof root.webkitRequestFullscreen === 'function';
  const isFullscreen = !!(document.fullscreenElement || (document as typeof document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement);
  const shouldShow = hasTouch && supportsFullscreen;
  fullscreenButton.classList.toggle('hidden', !shouldShow);
  if (!shouldShow) {
    return;
  }
  fullscreenButton.textContent = supportsFullscreen && isFullscreen ? 'Exit Fullscreen' : 'Fullscreen';
}

function setOverlayVisible(visible: boolean) {
  overlay.classList.toggle('hidden', !visible);
  canvas.style.pointerEvents = visible ? 'none' : 'auto';
  document.body.classList.toggle('gameplay-active', !visible);
  if (!visible) {
    blurActiveInput();
  }
  updateMobileMenuButtonVisibility();
  updateFullscreenButtonVisibility();
  syncTouchPreviewVisibility();
  updateIngameChatVisibility();
}

const STAGE_FADE_MS = 333;

let currentSmb2LikeMode: 'story' | 'challenge' | null = null;

function hasSmb2LikeMode(config: unknown): config is { mode: 'story' | 'challenge' } {
  return typeof config === 'object' && config !== null && 'mode' in config;
}

function triggerStageFade(color: string) {
  if (!stageFade) {
    return;
  }
  stageFade.style.transition = 'none';
  stageFade.style.backgroundColor = color;
  stageFade.style.opacity = '1';
  stageFade.getBoundingClientRect();
  stageFade.style.transition = `opacity ${STAGE_FADE_MS}ms linear`;
  stageFade.style.opacity = '0';
}

function maybeStartSmb2LikeStageFade() {
  if (activeGameSource === GAME_SOURCES.SMB1 || !currentSmb2LikeMode) {
    return;
  }
  const color = currentSmb2LikeMode === 'story' ? '#fff' : '#000';
  triggerStageFade(color);
}

function resizeCanvasToDisplaySize(canvasElem: HTMLCanvasElement) {
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

async function fetchSlice(path: string): Promise<ArrayBufferSlice> {
  return fetchPackSlice(path);
}

async function initPackFromQuery() {
  const packParam = new URLSearchParams(window.location.search).get('pack');
  if (!packParam) {
    return;
  }
  try {
    const pack = await loadPackFromUrl(packParam);
    await applyLoadedPack(pack);
  } catch (error) {
    console.error(error);
    if (hudStatus) {
      hudStatus.textContent = 'Failed to load pack.';
    }
  }
}

async function applyLoadedPack(pack: LoadedPack) {
  const key = createPackKey(pack);
  loadedPacks.set(key, pack);
  activePackKey = key;
  setActivePack(pack);
  setPackEnabled(true);
  updatePackUi();
  updateSmb2ChallengeStages();
  updateSmb2StoryOptions();
  updateSmb1Stages();
  updateGameSourceFields();
}

async function loadRenderStage(stageId: number): Promise<StageData> {
  const stageIdStr = String(stageId).padStart(3, '0');
  const stageInfo = STAGE_INFO_MAP.get(stageId as StageId);
  if (!stageInfo) {
    throw new Error(`Missing StageInfo for stage ${stageId}`);
  }

  const stageBasePath = getStageBasePath(GAME_SOURCES.SMB1);
  const stagedefPath = `${stageBasePath}/st${stageIdStr}/STAGE${stageIdStr}.lz`;
  const stageGmaPath = `${stageBasePath}/st${stageIdStr}/st${stageIdStr}.gma`;
  const stageTplPath = `${stageBasePath}/st${stageIdStr}/st${stageIdStr}.tpl`;

  const commonGmaPath = `${stageBasePath}/init/common.gma`;
  const commonTplPath = `${stageBasePath}/init/common.tpl`;
  const commonNlPath = `${stageBasePath}/init/common_p.lz`;
  const commonNlTplPath = `${stageBasePath}/init/common.lz`;

  const bgName = stageInfo.bgInfo.fileName;
  const bgGmaPath = `${stageBasePath}/bg/${bgName}.gma`;
  const bgTplPath = `${stageBasePath}/bg/${bgName}.tpl`;
  const isNaomi = isNaomiStage(stageId);
  const stageNlObjPath = isNaomi ? `${stageBasePath}/st${stageIdStr}/st${stageIdStr}_p.lz` : null;
  const stageNlTplPath = isNaomi ? `${stageBasePath}/st${stageIdStr}/st${stageIdStr}.lz` : null;

  const [
    stagedefBuf,
    stageGmaBuf,
    stageTplBuf,
    commonGmaBuf,
    commonTplBuf,
    commonNlBuf,
    commonNlTplBuf,
    bgGmaBuf,
    bgTplBuf,
    stageNlObjBuf,
    stageNlTplBuf,
  ] =
    await Promise.all([
      fetchSlice(stagedefPath),
      fetchSlice(stageGmaPath),
      fetchSlice(stageTplPath),
      fetchSlice(commonGmaPath),
      fetchSlice(commonTplPath),
      fetchSlice(commonNlPath),
      fetchSlice(commonNlTplPath),
      fetchSlice(bgGmaPath),
      fetchSlice(bgTplPath),
      stageNlObjPath ? fetchSlice(stageNlObjPath) : Promise.resolve(null),
      stageNlTplPath ? fetchSlice(stageNlTplPath) : Promise.resolve(null),
    ]);

  const stagedef = parseStagedefLz(stagedefBuf);

  const stageTpl = parseAVTpl(stageTplBuf, `st${stageIdStr}`);
  const stageGma = Gma.parseGma(stageGmaBuf, stageTpl);

  const commonTpl = parseAVTpl(commonTplBuf, 'common');
  const commonGma = Gma.parseGma(commonGmaBuf, commonTpl);
  const commonNlTpl = parseAVTpl(decompressLZ(commonNlTplBuf), 'common-nl');
  const nlObj = Nl.parseObj(decompressLZ(commonNlBuf), commonNlTpl);

  const bgTpl = parseAVTpl(bgTplBuf, bgName);
  const bgGma = Gma.parseGma(bgGmaBuf, bgTpl);
  let stageNlObj: Nl.Obj | null = null;
  let stageNlObjNameMap: Map<string, number> | null = null;
  if (stageNlObjBuf && stageNlTplBuf) {
    const nlTpl = parseAVTpl(decompressLZ(stageNlTplBuf), `st${stageIdStr}-nl`);
    const nlObjBuffer = decompressLZ(stageNlObjBuf);
    stageNlObj = Nl.parseObj(nlObjBuffer, nlTpl);
    stageNlObjNameMap = Nl.buildObjNameMap(nlObjBuffer);
  }

  return {
    stageInfo,
    stagedef,
    stageGma,
    bgGma,
    commonGma,
    nlObj,
    stageNlObj,
    stageNlObjNameMap,
    gameSource: GAME_SOURCES.SMB1,
  };
}

async function loadRenderStageSmb2(stageId: number, stage: any, gameSource: GameSource): Promise<StageData> {
  if (!stage || stage.format !== 'smb2') {
    throw new Error('Missing SMB2 stage data.');
  }
  const stageIdStr = String(stageId).padStart(3, '0');
  const stageInfo =
    gameSource === GAME_SOURCES.MB2WS ? getMb2wsStageInfo(stageId) : getSmb2StageInfo(stageId);
  const stagedef = convertSmb2StageDef(stage);

  const stageBasePath = getStageBasePath(gameSource) ?? STAGE_BASE_PATHS[GAME_SOURCES.SMB2];
  const stageGmaPath = `${stageBasePath}/st${stageIdStr}/st${stageIdStr}.gma`;
  const stageTplPath = `${stageBasePath}/st${stageIdStr}/st${stageIdStr}.tpl`;

  const commonGmaPath = `${stageBasePath}/init/common.gma`;
  const commonTplPath = `${stageBasePath}/init/common.tpl`;
  const commonNlPath = `${stageBasePath}/init/common_p.lz`;
  const commonNlTplPath = `${stageBasePath}/init/common.lz`;

  const bgName = stageInfo.bgInfo.fileName;
  const bgGmaPath = bgName ? `${stageBasePath}/bg/${bgName}.gma` : '';
  const bgTplPath = bgName ? `${stageBasePath}/bg/${bgName}.tpl` : '';

  const [
    stageGmaBuf,
    stageTplBuf,
    commonGmaBuf,
    commonTplBuf,
    commonNlBuf,
    commonNlTplBuf,
    bgGmaBuf,
    bgTplBuf,
  ] =
    await Promise.all([
      fetchSlice(stageGmaPath),
      fetchSlice(stageTplPath),
      fetchSlice(commonGmaPath),
      fetchSlice(commonTplPath),
      fetchSlice(commonNlPath),
      fetchSlice(commonNlTplPath),
      bgName ? fetchSlice(bgGmaPath) : Promise.resolve(new ArrayBufferSlice(new ArrayBuffer(0))),
      bgName ? fetchSlice(bgTplPath) : Promise.resolve(new ArrayBufferSlice(new ArrayBuffer(0))),
    ]);

  const stageTpl = parseAVTpl(stageTplBuf, `st${stageIdStr}`);
  const stageGma = Gma.parseGma(stageGmaBuf, stageTpl);

  const commonTpl = parseAVTpl(commonTplBuf, 'common');
  const commonGma = Gma.parseGma(commonGmaBuf, commonTpl);
  const commonNlTpl = parseAVTpl(decompressLZ(commonNlTplBuf), 'common-nl');
  const nlObj = Nl.parseObj(decompressLZ(commonNlBuf), commonNlTpl);

  const bgGma = bgName
    ? Gma.parseGma(bgGmaBuf, parseAVTpl(bgTplBuf, bgName))
    : { nameMap: new Map(), idMap: new Map() };

  return {
    stageInfo,
    stagedef,
    stageGma,
    bgGma,
    commonGma,
    nlObj,
    stageNlObj: null,
    stageNlObjNameMap: null,
    gameSource,
  };
}

let renderer: Renderer | null = null;
let gfxDevice: GfxDevice | null = null;
let swapChain: ReturnType<typeof createSwapChainForWebGL2> | null = null;
let camera: Camera | null = null;
let viewerInput: {
  camera: Camera;
  time: number;
  deltaTime: number;
  backbufferWidth: number;
  backbufferHeight: number;
  onscreenTexture: unknown;
  antialiasingMode: AntialiasingMode;
  mouseLocation: { mouseX: number; mouseY: number };
  debugConsole: { addInfoLine: (line: string) => void };
} | null = null;

const perfEnabled = true;
const audio = new AudioManager();
const game = new Game({
  audio,
  onReadyToResume: () => {
    resumeButton.disabled = false;
  },
  onPaused: () => {
    paused = true;
    setOverlayVisible(true);
  },
  onResumed: () => {
    paused = false;
    setOverlayVisible(false);
  },
  onStageLoadStart: (stageId) => {
    if (netplayEnabled && netplayState?.role === 'host' && hostRelay) {
      const config = getHostCourseConfig();
      if (config) {
        netplayState.currentCourse = config;
        netplayState.currentGameSource = activeGameSource;
        netplayState.stageSeq += 1;
        hostRelay.broadcast({
          type: 'start',
          stageSeq: netplayState.stageSeq,
          gameSource: activeGameSource,
          course: config,
          stageBasePath: getStageBasePath(activeGameSource),
        });
      }
    }
  },
  onStageLoaded: (stageId) => {
    if (netplayEnabled && netplayState) {
      resetNetplayForStage();
      initStageSync(stageId);
    }
    void handleStageLoaded(stageId);
  },
  onCourseComplete: () => {
    handleCourseComplete();
  },
});
game.init();
game.simPerf.enabled = perfEnabled;
game.rollbackPerf.enabled = perfEnabled;

const hudRenderer = new HudRenderer(hudCanvas);
void hudRenderer.load();

let running = false;
let paused = false;
let lastTime = performance.now();
let lastRenderTime = lastTime;
let lastHudTime = lastTime;
let lastControlModeSettingsCheck = lastTime;
let calibrationActive = false;
let calibrationSamples: Array<{ x: number; y: number }> = [];
let calibrationSectorMax: number[] = new Array(8).fill(0);
let calibrationGate: number[][] = [];
let calibrationFallbackGate: number[][] = [];
let stageLoadToken = 0;
let renderReady = false;
let activeGameSource: GameSource = GAME_SOURCES.SMB1;
let interpolationEnabled = true;
const RENDER_FRAME_MS = 1000 / 60;
const syncState: GameplaySyncState = {
  timeFrames: null,
  bananas: null,
  jamabars: null,
  bananaCollectedByAnimGroup: null,
  animGroupTransforms: null,
  ball: null,
  balls: null,
  goalBags: null,
  goalTapes: null,
  confetti: null,
  effects: null,
  switches: null,
  stageTilt: null,
};

type LobbyRoom = RoomInfo;

const lobbyBaseUrl = (window as any).LOBBY_URL ?? "";
const lobbyClient = lobbyBaseUrl ? new LobbyClient(lobbyBaseUrl) : null;

const multiplayerOpenButton = document.getElementById('open-multiplayer') as HTMLButtonElement | null;
const multiplayerBackButton = document.getElementById('multiplayer-back') as HTMLButtonElement | null;
const levelSelectOpenButton = document.getElementById('open-level-select') as HTMLButtonElement | null;
const levelSelectBackButton = document.getElementById('level-select-back') as HTMLButtonElement | null;
const settingsOpenButton = document.getElementById('open-settings') as HTMLButtonElement | null;
const settingsBackButton = document.getElementById('settings-back') as HTMLButtonElement | null;
const settingsTabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-settings-tab]'));
const settingsTabPanels = Array.from(document.querySelectorAll<HTMLElement>('[data-settings-panel]'));
const multiplayerOnlineCount = document.getElementById('lobby-online-count') as HTMLElement | null;
const multiplayerLayout = document.getElementById('multiplayer-layout') as HTMLElement | null;
const multiplayerBrowser = document.getElementById('multiplayer-browser') as HTMLElement | null;
const multiplayerLobby = document.getElementById('multiplayer-lobby') as HTMLElement | null;
const lobbyRefreshButton = document.getElementById('lobby-refresh') as HTMLButtonElement | null;
const lobbyCreateButton = document.getElementById('lobby-create') as HTMLButtonElement | null;
const lobbyJoinButton = document.getElementById('lobby-join') as HTMLButtonElement | null;
const lobbyPublicCheckbox = document.getElementById('lobby-public') as HTMLInputElement | null;
const lobbyNameInput = document.getElementById('lobby-name') as HTMLInputElement | null;
const lobbyCodeInput = document.getElementById('lobby-code') as HTMLInputElement | null;
const lobbyLeaveButton = document.getElementById('lobby-leave') as HTMLButtonElement | null;
const lobbyStatus = document.getElementById('lobby-status') as HTMLElement | null;
const lobbyList = document.getElementById('lobby-list') as HTMLElement | null;
const lobbyRoomInfo = document.getElementById('lobby-room-info') as HTMLElement | null;
const lobbyRoomStatus = document.getElementById('lobby-room-status') as HTMLElement | null;
const lobbyRoomNameInput = document.getElementById('lobby-room-name') as HTMLInputElement | null;
const lobbyPlayerList = document.getElementById('lobby-player-list') as HTMLElement | null;
const lobbyMaxPlayersSelect = document.getElementById('lobby-max-players') as HTMLSelectElement | null;
const lobbyCollisionToggle = document.getElementById('lobby-collision') as HTMLInputElement | null;
const lobbyLockToggle = document.getElementById('lobby-locked') as HTMLInputElement | null;
const lobbyStageButton = document.getElementById('lobby-stage-button') as HTMLButtonElement | null;
const lobbyStageInfo = document.getElementById('lobby-stage-info') as HTMLElement | null;
const lobbyStageActions = document.getElementById('lobby-stage-actions') as HTMLElement | null;
const lobbyStageChooseButton = document.getElementById('lobby-stage-choose') as HTMLButtonElement | null;
const lobbyStartButton = document.getElementById('lobby-start') as HTMLButtonElement | null;
const lobbyChatPanel = document.getElementById('lobby-chat-panel') as HTMLElement | null;
const lobbyChatList = document.getElementById('lobby-chat-list') as HTMLElement | null;
const lobbyChatInput = document.getElementById('lobby-chat-input') as HTMLInputElement | null;
const lobbyChatSendButton = document.getElementById('lobby-chat-send') as HTMLButtonElement | null;
const ingameChatWrap = document.getElementById('ingame-chat') as HTMLElement | null;
const ingameChatList = document.getElementById('ingame-chat-list') as HTMLElement | null;
const ingameChatInputRow = document.getElementById('ingame-chat-input-row') as HTMLElement | null;
const ingameChatInput = document.getElementById('ingame-chat-input') as HTMLInputElement | null;
const profileNameInput = document.getElementById('profile-name') as HTMLInputElement | null;
const profileAvatarInput = document.getElementById('profile-avatar-input') as HTMLInputElement | null;
const profileAvatarPreview = document.getElementById('profile-avatar-preview') as HTMLElement | null;
const profileAvatarClearButton = document.getElementById('profile-avatar-clear') as HTMLButtonElement | null;
const profileAvatarError = document.getElementById('profile-avatar-error') as HTMLElement | null;
const hidePlayerNamesToggle = document.getElementById('hide-player-names') as HTMLInputElement | null;
const hideLobbyNamesToggle = document.getElementById('hide-lobby-names') as HTMLInputElement | null;

const PROFILE_STORAGE_KEY = 'smb_netplay_profile';
const PROFILE_NAME_MAX = 64;
const PROFILE_NAME_SAFE = /[^A-Za-z0-9 _.-]/g;
const LOBBY_NAME_MAX = 64;
const PROFILE_AVATAR_MAX_BYTES = 150 * 1024;
const PROFILE_AVATAR_MAX_DIM = 512;
const PROFILE_AVATAR_MAX_DATA_URL_CHARS = 220000;
const PROFILE_AVATAR_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/jpg']);
const PRIVACY_STORAGE_KEY = 'smb_netplay_privacy';
const PROFILE_BROADCAST_COOLDOWN_MS = 1200;
const PROFILE_REMOTE_COOLDOWN_MS = 1500;
const LOBBY_NAME_UPDATE_COOLDOWN_MS = 1200;
const CHAT_MAX_CHARS = 200;
const CHAT_MAX_MESSAGES = 160;
const CHAT_SEND_COOLDOWN_MS = 800;

let lobbyRoom: LobbyRoom | null = null;
let lobbySelfId: number | null = null;
let lobbyPlayerToken: string | null = null;
let lobbyHostToken: string | null = null;
let lobbySignal: { send: (msg: any) => void; close: () => void } | null = null;
let lobbySignalRetryTimer: number | null = null;
let lobbySignalRetryMs = 1000;
let lobbySignalShouldReconnect = false;
let lobbySignalReconnectFn: (() => void) | null = null;
let hostRelay: HostRelay | null = null;
let clientPeer: ClientPeer | null = null;
let netplayEnabled = false;
let lobbyProfiles = new Map<number, PlayerProfile>();
let pendingAvatarByPlayer = new Map<number, string>();
let localProfile: PlayerProfile = { name: 'Player' };
let allowHostMigration = true;
let suppressHostDisconnectUntil = 0;
let pendingSnapshot: {
  frame: number;
  state: any;
  stageId?: number;
  gameSource?: GameSource;
  stageSeq?: number;
} | null = null;
let lobbyHeartbeatTimer: number | null = null;
let lastLobbyHeartbeatMs: number | null = null;
let netplayAccumulator = 0;
type MenuPanel = 'main' | 'multiplayer' | 'multiplayer-ingame' | 'settings' | 'level-select';
type SettingsTab = 'input' | 'audio' | 'multiplayer';
let activeMenu: MenuPanel = 'main';
let settingsReturnMenu: MenuPanel = 'main';
let levelSelectReturnMenu: MenuPanel = 'main';
let activeSettingsTab: SettingsTab = 'input';
let profileBroadcastTimer: number | null = null;
let lastProfileBroadcastMs: number | null = null;
let lobbyNameUpdateTimer: number | null = null;
let lastLobbyNameUpdateMs: number | null = null;
let lastRoomMetaKey: string | null = null;
let privacySettings = { hidePlayerNames: false, hideLobbyNames: false };
const avatarValidationCache = new Map<string, Promise<boolean>>();
const profileUpdateThrottle = new Map<number, number>();
type ChatEntry = { id: number; playerId: number; text: string; time: number };
let chatMessages: ChatEntry[] = [];
let chatSeq = 0;
let lastLocalChatSentMs = 0;
const chatRateLimitByPlayer = new Map<number, number>();
let ingameChatOpen = false;
type NameplateEntry = {
  el: HTMLElement;
  nameEl: HTMLElement;
  avatarEl: HTMLElement;
  lastName: string;
  lastAvatarKey: string;
};
const nameplateEntries = new Map<number, NameplateEntry>();
const nameplateScratch = vec4.create();
const nameplateTiltPivot = vec3.create();
const nameplateViewScratch = mat4.create();
const nameplateClipScratch = mat4.create();
const NETPLAY_MAX_FRAME_DELTA = 5;
const NETPLAY_CLIENT_LEAD = 2;
const NETPLAY_CLIENT_AHEAD_SLACK = 2;
const NETPLAY_CLIENT_RATE_MIN = 0.9;
const NETPLAY_CLIENT_RATE_MAX = 1.1;
const NETPLAY_CLIENT_DRIFT_RATE = 0.05;
const NETPLAY_DRIFT_FORCE_TICK = 3;
const NETPLAY_DRIFT_EXTRA_TICKS = 6;
const NETPLAY_CLIENT_MAX_EXTRA_LEAD = 12;
const NETPLAY_SYNC_RATE_MIN = 0.85;
const NETPLAY_SYNC_RATE_MAX = 1.35;
const NETPLAY_SYNC_DRIFT_RATE = 0.1;
const NETPLAY_SYNC_FORCE_TICK = 1;
const NETPLAY_SYNC_EXTRA_TICKS = 2;
const NETPLAY_SYNC_MAX_TICKS = 6;
const NETPLAY_STAGE_READY_RESEND_MS = 2000;
const NETPLAY_STAGE_READY_TIMEOUT_MS = 12000;
const NETPLAY_LAG_FUSE_FRAMES = 24;
const NETPLAY_LAG_FUSE_MS = 500;
const NETPLAY_SNAPSHOT_COOLDOWN_MS = 1000;
const NETPLAY_PING_INTERVAL_MS = 1000;
const NETPLAY_HOST_STALL_MS = 3000;
const NETPLAY_HOST_SNAPSHOT_BEHIND_FRAMES = 120;
const NETPLAY_HOST_SNAPSHOT_COOLDOWN_MS = 1500;
const NETPLAY_SNAPSHOT_MISMATCH_COOLDOWN_MS = 250;
const NETPLAY_MAX_INPUT_AHEAD = 60;
const NETPLAY_MAX_INPUT_BEHIND = 60;
const LOBBY_MAX_PLAYERS = 8;
const NAMEPLATE_OFFSET_SCALE = 1.6;
const STAGE_TILT_SCALE = 0.6;
const NETPLAY_DEBUG_STORAGE_KEY = 'smb_netplay_debug';
const LOBBY_HEARTBEAT_INTERVAL_MS = 15000;
const LOBBY_HEARTBEAT_FALLBACK_MS = 12000;

const netplayPerf = {
  enabled: perfEnabled,
  logEveryMs: 1000,
  lastLogMs: performance.now(),
  tickMs: 0,
  tickCount: 0,
  simTicks: 0,
  rollbackMs: 0,
  rollbackFrames: 0,
  rollbackCount: 0,
  resimMs: 0,
  resimFrames: 0,
  resimCount: 0,
};

function logNetplayPerf(nowMs: number) {
  if (!netplayPerf.enabled) {
    return;
  }
  if (nowMs - netplayPerf.lastLogMs < netplayPerf.logEveryMs) {
    return;
  }
  const avgTick = netplayPerf.tickMs / Math.max(1, netplayPerf.tickCount);
  const avgRollback = netplayPerf.rollbackMs / Math.max(1, netplayPerf.rollbackCount);
  const avgResim = netplayPerf.resimMs / Math.max(1, netplayPerf.resimCount);
  console.log(
    "[perf] netplay tick avg=%sms over=%d simTicks=%d rollback avg=%sms frames=%d resim avg=%sms frames=%d",
    avgTick.toFixed(3),
    netplayPerf.tickCount,
    netplayPerf.simTicks,
    avgRollback.toFixed(3),
    netplayPerf.rollbackFrames,
    avgResim.toFixed(3),
    netplayPerf.resimFrames,
  );
  if (game.rollbackPerf.enabled) {
    const avgSave = game.rollbackPerf.saveMs / Math.max(1, game.rollbackPerf.saveCount);
    const avgLoad = game.rollbackPerf.loadMs / Math.max(1, game.rollbackPerf.loadCount);
    const avgAdvance = game.rollbackPerf.advanceMs / Math.max(1, game.rollbackPerf.advanceCount);
    console.log(
      "[perf] rollback save avg=%sms last=%sms load avg=%sms last=%sms advance avg=%sms last=%sms over=%d",
      avgSave.toFixed(3),
      game.rollbackPerf.lastSaveMs.toFixed(3),
      avgLoad.toFixed(3),
      game.rollbackPerf.lastLoadMs.toFixed(3),
      avgAdvance.toFixed(3),
      game.rollbackPerf.lastAdvanceMs.toFixed(3),
      game.rollbackPerf.saveCount,
    );
    game.rollbackPerf.saveMs = 0;
    game.rollbackPerf.saveCount = 0;
    game.rollbackPerf.loadMs = 0;
    game.rollbackPerf.loadCount = 0;
    game.rollbackPerf.advanceMs = 0;
    game.rollbackPerf.advanceCount = 0;
  }
  netplayPerf.lastLogMs = nowMs;
  netplayPerf.tickMs = 0;
  netplayPerf.tickCount = 0;
  netplayPerf.simTicks = 0;
  netplayPerf.rollbackMs = 0;
  netplayPerf.rollbackFrames = 0;
  netplayPerf.rollbackCount = 0;
  netplayPerf.resimMs = 0;
  netplayPerf.resimFrames = 0;
  netplayPerf.resimCount = 0;
}

function recordNetplayPerf(startMs: number, simTicks = 0) {
  if (!netplayPerf.enabled) {
    return;
  }
  const nowMs = performance.now();
  netplayPerf.tickMs += nowMs - startMs;
  netplayPerf.tickCount += 1;
  netplayPerf.simTicks += simTicks;
  logNetplayPerf(nowMs);
}

function isNetplayDebugEnabled() {
  const globalFlag = (window as any).NETPLAY_DEBUG;
  if (globalFlag !== undefined) {
    return !!globalFlag;
  }
  try {
    return localStorage.getItem(NETPLAY_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function setNetplayDebugEnabled(enabled: boolean) {
  (window as any).NETPLAY_DEBUG = enabled;
  try {
    localStorage.setItem(NETPLAY_DEBUG_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage issues.
  }
}

(window as any).setNetplayDebug = setNetplayDebugEnabled;

type NetplayRole = 'host' | 'client';
type NetplayClientState = {
  lastAckedHostFrame: number;
  lastAckedClientInput: number;
  lastSnapshotMs: number | null;
  lastSnapshotRequestMs: number | null;
};
type NetplayState = {
  role: NetplayRole;
  session: ReturnType<Game['ensureRollbackSession']>;
  inputHistory: Map<number, Map<number, QuantizedInput>>;
  lastInputs: Map<number, QuantizedInput>;
  pendingLocalInputs: Map<number, QuantizedInput>;
  lastAckedLocalFrame: number;
  lastReceivedHostFrame: number;
  hostFrameBuffer: Map<number, FrameBundleMessage>;
  clientStates: Map<number, NetplayClientState>;
  maxRollback: number;
  maxResend: number;
  hashInterval: number;
  hashHistory: Map<number, number>;
  expectedHashes: Map<number, number>;
  lastAuthHashFrameSent: number;
  pendingHostUpdates: Set<number>;
  lastHostFrameTimeMs: number | null;
  lagBehindSinceMs: number | null;
  lastSnapshotRequestTimeMs: number | null;
  rttMs: number | null;
  pingSeq: number;
  pendingPings: Map<number, number>;
  lastPingTimeMs: number;
  currentStageId: number | null;
  readyPlayers: Set<number>;
  awaitingStageReady: boolean;
  awaitingStageSync: boolean;
  stageSeq: number;
  stageReadySentMs: number | null;
  stageReadyTimeoutMs: number | null;
  currentCourse: any | null;
  currentGameSource: GameSource | null;
  awaitingSnapshot: boolean;
};

let netplayState: NetplayState | null = null;

function createNetplayId() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] >>> 0;
}

function quantizedEqual(a: QuantizedInput, b: QuantizedInput) {
  return a.x === b.x && a.y === b.y && (a.buttons ?? 0) === (b.buttons ?? 0);
}

function coerceFrame(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return null;
  }
  return Math.max(0, Math.floor(num));
}

function clampQuantizedAxis(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 0;
  }
  return clampInt(Math.round(num), -127, 127);
}

function normalizeInput(input: any): QuantizedInput | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const buttonsNum = Number(input.buttons ?? 0);
  return {
    x: clampQuantizedAxis(input.x),
    y: clampQuantizedAxis(input.y),
    buttons: Number.isFinite(buttonsNum) ? (buttonsNum | 0) : 0,
  };
}

function ensureNetplayState(role: NetplayRole) {
  if (netplayState && netplayState.role === role) {
    return netplayState;
  }
  const session = game.ensureRollbackSession();
  session.prime(game.simTick);
  game.netplayRttMs = null;
  netplayState = {
    role,
    session,
    inputHistory: new Map(),
    lastInputs: new Map(),
    pendingLocalInputs: new Map(),
    lastAckedLocalFrame: -1,
    lastReceivedHostFrame: game.simTick,
    hostFrameBuffer: new Map(),
    clientStates: new Map(),
    maxRollback: 30,
    maxResend: 8,
    hashInterval: 15,
    hashHistory: new Map(),
    expectedHashes: new Map(),
    lastAuthHashFrameSent: -1,
    pendingHostUpdates: new Set(),
    lastHostFrameTimeMs: null,
    lagBehindSinceMs: null,
    lastSnapshotRequestTimeMs: null,
    rttMs: null,
    pingSeq: 0,
    pendingPings: new Map(),
    lastPingTimeMs: 0,
    currentStageId: null,
    readyPlayers: new Set(),
    awaitingStageReady: false,
    awaitingStageSync: false,
    stageSeq: 0,
    stageReadySentMs: null,
    stageReadyTimeoutMs: null,
    currentCourse: null,
    currentGameSource: null,
    awaitingSnapshot: false,
  };
  return netplayState;
}

function resetNetplaySession() {
  game.rollbackSession = null;
  const session = game.ensureRollbackSession();
  session.prime(game.simTick);
  if (netplayState) {
    netplayState.session = session;
  }
}

function resetNetplayForStage() {
  if (!netplayState) {
    return;
  }
  netplayState.inputHistory.clear();
  netplayState.lastInputs.clear();
  netplayState.pendingLocalInputs.clear();
  netplayState.hashHistory.clear();
  netplayState.expectedHashes.clear();
  netplayState.lastAuthHashFrameSent = -1;
  netplayState.pendingHostUpdates.clear();
  netplayState.lastHostFrameTimeMs = null;
  netplayState.lagBehindSinceMs = null;
  netplayState.lastSnapshotRequestTimeMs = null;
  netplayState.awaitingSnapshot = false;
  netplayState.lastAckedLocalFrame = 0;
  netplayState.lastReceivedHostFrame = 0;
  netplayState.hostFrameBuffer.clear();
  pendingSnapshot = null;
  netplayState.readyPlayers.clear();
  netplayState.awaitingStageReady = false;
  netplayState.awaitingStageSync = false;
  netplayState.currentStageId = null;
  netplayState.stageReadySentMs = null;
  netplayState.stageReadyTimeoutMs = null;
  netplayAccumulator = 0;
  for (const clientState of netplayState.clientStates.values()) {
    clientState.lastAckedHostFrame = -1;
    clientState.lastAckedClientInput = -1;
    clientState.lastSnapshotMs = null;
    clientState.lastSnapshotRequestMs = null;
  }
  resetNetplaySession();
}

function getExpectedStageReadyPlayers() {
  return game.players.filter((player) => !player.isSpectator).map((player) => player.id);
}

function maybeSendStageSync() {
  if (!netplayState || netplayState.role !== 'host' || !hostRelay) {
    return;
  }
  const state = netplayState;
  if (!state.awaitingStageReady) {
    return;
  }
  const expected = getExpectedStageReadyPlayers();
  const allReady = expected.every((playerId) => state.readyPlayers.has(playerId));
  if (!allReady) {
    return;
  }
  state.awaitingStageReady = false;
  state.stageReadyTimeoutMs = null;
  netplayAccumulator = 0;
  hostRelay.broadcast({
    type: 'stage_sync',
    stageSeq: state.stageSeq,
    stageId: state.currentStageId ?? game.stage?.stageId ?? 0,
    frame: state.session.getFrame(),
  });
}

function sendStageSyncToClient(playerId: number) {
  if (!netplayState || netplayState.role !== 'host' || !hostRelay) {
    return;
  }
  const state = netplayState;
  hostRelay.sendTo(playerId, {
    type: 'stage_sync',
    stageSeq: state.stageSeq,
    stageId: state.currentStageId ?? game.stage?.stageId ?? 0,
    frame: state.session.getFrame(),
  });
}

function initStageSync(stageId: number) {
  if (!netplayState || !netplayEnabled) {
    return;
  }
  const state = netplayState;
  state.currentStageId = stageId;
  state.readyPlayers.clear();
  if (state.role === 'host') {
    state.awaitingStageReady = true;
    state.awaitingStageSync = false;
    state.stageReadyTimeoutMs = null;
  } else {
    state.awaitingStageSync = true;
    state.awaitingStageReady = false;
    state.stageReadySentMs = null;
  }
  netplayAccumulator = 0;
}

function markStageReady(stageId: number) {
  if (!netplayState || !netplayEnabled) {
    return;
  }
  const state = netplayState;
  if (state.currentStageId !== null && stageId !== state.currentStageId) {
    return;
  }
  if (state.currentStageId === null) {
    state.currentStageId = stageId;
  }
  if (state.role === 'host') {
    state.readyPlayers.add(game.localPlayerId);
    if (state.stageReadyTimeoutMs === null) {
      state.stageReadyTimeoutMs = performance.now() + NETPLAY_STAGE_READY_TIMEOUT_MS;
    }
    maybeSendStageSync();
    return;
  }
  if (clientPeer) {
    clientPeer.send({ type: 'stage_ready', stageSeq: state.stageSeq, stageId });
    state.stageReadySentMs = performance.now();
  }
}

function maybeResendStageReady(nowMs: number) {
  if (!netplayState || netplayState.role !== 'client' || !clientPeer) {
    return;
  }
  if (!netplayState.awaitingStageSync) {
    return;
  }
  const lastSent = netplayState.stageReadySentMs;
  if (lastSent === null || (nowMs - lastSent) < NETPLAY_STAGE_READY_RESEND_MS) {
    return;
  }
  const stageId = netplayState.currentStageId ?? game.stage?.stageId ?? 0;
  clientPeer.send({ type: 'stage_ready', stageSeq: netplayState.stageSeq, stageId });
  netplayState.stageReadySentMs = nowMs;
}

function maybeForceStageSync(nowMs: number) {
  if (!netplayState || netplayState.role !== 'host' || !hostRelay) {
    return;
  }
  if (!netplayState.awaitingStageReady) {
    return;
  }
  const timeoutAt = netplayState.stageReadyTimeoutMs;
  if (timeoutAt === null || nowMs < timeoutAt) {
    return;
  }
  netplayState.awaitingStageReady = false;
  netplayState.stageReadyTimeoutMs = null;
  netplayAccumulator = 0;
  hostRelay.broadcast({
    type: 'stage_sync',
    stageSeq: netplayState.stageSeq,
    stageId: netplayState.currentStageId ?? game.stage?.stageId ?? 0,
    frame: netplayState.session.getFrame(),
  });
}

function getSimHash() {
  if (!game.stageRuntime || !game.world) {
    return 0;
  }
  const players = [...game.players].sort((a, b) => a.id - b.id);
  const balls = players.map((player) => player.ball);
  const worlds = [game.world, ...players.map((player) => player.world)];
  return hashSimState(balls, worlds, game.stageRuntime);
}

function getAuthoritativeFrame(state: NetplayState) {
  let authFrame = state.session.getFrame();
  for (const player of game.players) {
    if (player.isSpectator || player.pendingSpawn || player.id === game.localPlayerId) {
      continue;
    }
    const clientState = state.clientStates.get(player.id);
    if (!clientState) {
      return -1;
    }
    authFrame = Math.min(authFrame, clientState.lastAckedClientInput);
  }
  return authFrame;
}

function getAuthoritativeHashFrame(state: NetplayState) {
  if (state.hashInterval <= 0) {
    return null;
  }
  const authFrame = getAuthoritativeFrame(state);
  if (authFrame < 0) {
    return null;
  }
  const hashFrame = authFrame - (authFrame % state.hashInterval);
  if (hashFrame < 0 || hashFrame <= state.lastAuthHashFrameSent) {
    return null;
  }
  if (!state.hashHistory.has(hashFrame)) {
    return null;
  }
  return hashFrame;
}

function getEstimatedHostFrame(state: NetplayState) {
  if (state.role !== 'client') {
    return state.lastReceivedHostFrame;
  }
  if (state.lastHostFrameTimeMs === null) {
    return state.lastReceivedHostFrame;
  }
  const elapsedSeconds = (performance.now() - state.lastHostFrameTimeMs) / 1000;
  const maxAdvance = Math.max(1, state.maxRollback);
  const advance = Math.min(elapsedSeconds / game.fixedStep, maxAdvance);
  return state.lastReceivedHostFrame + Math.max(0, advance);
}

function getIntroLeadScale() {
  const total = game.introTotalFrames ?? 0;
  const remaining = game.introTimerFrames ?? 0;
  if (total <= 0 || remaining <= 0) {
    return 1;
  }
  return clamp(1 - (remaining / total), 0, 1);
}

function getClientLeadFrames(state: NetplayState) {
  let lead = NETPLAY_CLIENT_LEAD;
  if (state.rttMs && state.rttMs > 0) {
    const rttFrames = (state.rttMs / 1000) / game.fixedStep;
    const extra = Math.min(NETPLAY_CLIENT_MAX_EXTRA_LEAD, Math.max(0, Math.floor(rttFrames * 0.5)));
    lead += extra;
  }
  const scale = getIntroLeadScale();
  if (scale >= 1) {
    return lead;
  }
  return Math.max(0, Math.floor(lead * scale));
}

function sanitizeProfileName(value: string) {
  if (typeof value !== 'string') {
    return 'Player';
  }
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(PROFILE_NAME_SAFE, '').trim();
  const collapsed = cleaned.replace(/\s+/g, ' ');
  const trimmed = collapsed.slice(0, PROFILE_NAME_MAX);
  return trimmed || 'Player';
}

function sanitizeLobbyName(value?: string) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(PROFILE_NAME_SAFE, '').trim();
  const collapsed = cleaned.replace(/\s+/g, ' ');
  const trimmed = collapsed.slice(0, LOBBY_NAME_MAX);
  return trimmed || undefined;
}

function sanitizeLobbyNameDraft(value: string) {
  if (typeof value !== 'string') {
    return '';
  }
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(PROFILE_NAME_SAFE, '');
  const collapsed = cleaned.replace(/\s+/g, ' ');
  return collapsed.slice(0, LOBBY_NAME_MAX);
}

function sanitizeChatText(value: string) {
  if (typeof value !== 'string') {
    return '';
  }
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '');
  const collapsed = cleaned.replace(/\s+/g, ' ');
  const trimmed = collapsed.trim().slice(0, CHAT_MAX_CHARS);
  return trimmed;
}

function base64ByteLength(base64: string) {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function sanitizeAvatarDataUrl(value?: unknown): string | undefined {
  if (typeof value !== 'string' || !value) {
    return undefined;
  }
  if (value.length > PROFILE_AVATAR_MAX_DATA_URL_CHARS) {
    return undefined;
  }
  const match = value.match(/^data:(image\/(?:png|jpeg|webp|jpg));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    return undefined;
  }
  const mime = match[1].toLowerCase();
  if (!PROFILE_AVATAR_MIME.has(mime)) {
    return undefined;
  }
  const bytes = base64ByteLength(match[2]);
  if (bytes <= 0 || bytes > PROFILE_AVATAR_MAX_BYTES) {
    return undefined;
  }
  return value;
}

function sanitizeProfile(profile?: Partial<PlayerProfile>): PlayerProfile {
  return {
    name: sanitizeProfileName(profile?.name ?? ''),
    avatarData: sanitizeAvatarDataUrl(profile?.avatarData),
  };
}

function loadLocalProfile(): PlayerProfile {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) {
      return sanitizeProfile({});
    }
    return sanitizeProfile(JSON.parse(raw));
  } catch {
    return sanitizeProfile({});
  }
}

function saveLocalProfile(profile: PlayerProfile) {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore storage errors.
  }
}

function setProfileAvatarError(message?: string) {
  if (!profileAvatarError) {
    return;
  }
  if (message) {
    profileAvatarError.textContent = message;
    profileAvatarError.classList.remove('hidden');
    profileAvatarError.classList.add('error');
  } else {
    profileAvatarError.textContent = '';
    profileAvatarError.classList.add('hidden');
    profileAvatarError.classList.remove('error');
  }
}

function loadImageDimensions(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function loadImageDimensionsFromFile(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await loadImageDimensions(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read_failed'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
}

function isAllowedAvatarFile(file: File) {
  if (PROFILE_AVATAR_MIME.has(file.type.toLowerCase())) {
    return true;
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp';
}

async function validateAvatarFile(file: File): Promise<string | null> {
  setProfileAvatarError();
  if (!isAllowedAvatarFile(file)) {
    setProfileAvatarError('Avatar must be PNG, JPG, or WebP.');
    return null;
  }
  if (file.size > PROFILE_AVATAR_MAX_BYTES) {
    setProfileAvatarError('Avatar must be smaller than 150kb.');
    return null;
  }
  const dimensions = await loadImageDimensionsFromFile(file);
  if (!dimensions) {
    setProfileAvatarError('Failed to read avatar image.');
    return null;
  }
  if (dimensions.width > PROFILE_AVATAR_MAX_DIM || dimensions.height > PROFILE_AVATAR_MAX_DIM) {
    setProfileAvatarError('Avatar must be 512x512 or smaller.');
    return null;
  }
  let dataUrl = '';
  try {
    dataUrl = await readFileAsDataUrl(file);
  } catch {
    setProfileAvatarError('Failed to read avatar file.');
    return null;
  }
  const sanitized = sanitizeAvatarDataUrl(dataUrl);
  if (!sanitized) {
    setProfileAvatarError('Avatar could not be validated.');
    return null;
  }
  return sanitized;
}

function validateAvatarDataUrlDimensions(dataUrl: string): Promise<boolean> {
  return loadImageDimensions(dataUrl).then((dims) => {
    if (!dims) {
      return false;
    }
    return dims.width <= PROFILE_AVATAR_MAX_DIM && dims.height <= PROFILE_AVATAR_MAX_DIM;
  });
}

function getAvatarValidationPromise(dataUrl: string): Promise<boolean> {
  const cached = avatarValidationCache.get(dataUrl);
  if (cached) {
    return cached;
  }
  const promise = validateAvatarDataUrlDimensions(dataUrl);
  avatarValidationCache.set(dataUrl, promise);
  return promise;
}

function sanitizePrivacySettings(value: any) {
  return {
    hidePlayerNames: !!value?.hidePlayerNames,
    hideLobbyNames: !!value?.hideLobbyNames,
  };
}

function loadPrivacySettings() {
  try {
    const raw = localStorage.getItem(PRIVACY_STORAGE_KEY);
    if (!raw) {
      return sanitizePrivacySettings({});
    }
    return sanitizePrivacySettings(JSON.parse(raw));
  } catch {
    return sanitizePrivacySettings({});
  }
}

function savePrivacySettings(settings: { hidePlayerNames: boolean; hideLobbyNames: boolean }) {
  try {
    localStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors.
  }
}

function updatePrivacyUi() {
  if (hidePlayerNamesToggle) {
    hidePlayerNamesToggle.checked = privacySettings.hidePlayerNames;
  }
  if (hideLobbyNamesToggle) {
    hideLobbyNamesToggle.checked = privacySettings.hideLobbyNames;
  }
}

function appendChatMessage(playerId: number, text: string) {
  const sanitized = sanitizeChatText(text);
  if (!sanitized) {
    return;
  }
  chatMessages.push({
    id: chatSeq++,
    playerId,
    text: sanitized,
    time: Date.now(),
  });
  if (chatMessages.length > CHAT_MAX_MESSAGES) {
    chatMessages = chatMessages.slice(-CHAT_MAX_MESSAGES);
  }
  updateChatUi();
}

function renderChatList(target: HTMLElement | null, limit: number | null) {
  if (!target) {
    return;
  }
  const shouldStick = target.scrollTop + target.clientHeight >= target.scrollHeight - 24;
  target.innerHTML = '';
  const entries = limit ? chatMessages.slice(-limit) : chatMessages;
  for (const entry of entries) {
    const line = document.createElement('div');
    line.className = 'chat-line';
    const profile = lobbyProfiles.get(entry.playerId) ?? profileFallbackForPlayer(entry.playerId);
    const name = getPlayerDisplayName(entry.playerId, profile);
    const nameSpan = document.createElement('span');
    nameSpan.className = 'chat-name';
    nameSpan.textContent = name;
    const sep = document.createElement('span');
    sep.textContent = ':';
    const textSpan = document.createElement('span');
    textSpan.className = 'chat-text';
    textSpan.textContent = entry.text;
    line.append(nameSpan, sep, textSpan);
    target.appendChild(line);
  }
  if (shouldStick) {
    target.scrollTop = target.scrollHeight;
  }
}

function updateChatUi() {
  renderChatList(lobbyChatList, null);
  const ingameLimit = ingameChatOpen ? null : 6;
  renderChatList(ingameChatList, ingameLimit);
}

function sendChatMessage(text: string) {
  if (!netplayEnabled || !netplayState) {
    return;
  }
  if (!Number.isFinite(game.localPlayerId) || game.localPlayerId <= 0) {
    return;
  }
  const sanitized = sanitizeChatText(text);
  if (!sanitized) {
    return;
  }
  const nowMs = performance.now();
  if ((nowMs - lastLocalChatSentMs) < CHAT_SEND_COOLDOWN_MS) {
    return;
  }
  lastLocalChatSentMs = nowMs;
  const payload: ChatMessage = { type: 'chat', playerId: game.localPlayerId, text: sanitized };
  if (netplayState.role === 'host') {
    appendChatMessage(game.localPlayerId, sanitized);
    hostRelay?.broadcast(payload);
  } else {
    clientPeer?.send(payload);
  }
}

function setIngameChatOpen(open: boolean) {
  ingameChatOpen = open;
  if (ingameChatWrap) {
    ingameChatWrap.classList.toggle('open', open);
  }
  if (ingameChatInputRow) {
    ingameChatInputRow.classList.toggle('hidden', !open);
  }
  if (open && ingameChatInput) {
    ingameChatInput.focus();
  }
  if (!open && ingameChatInput) {
    ingameChatInput.blur();
  }
  updateChatUi();
}

function updateIngameChatVisibility() {
  if (!ingameChatWrap) {
    return;
  }
  const overlayVisible = !overlay.classList.contains('hidden');
  const shouldShow = netplayEnabled && running && !overlayVisible;
  ingameChatWrap.classList.toggle('hidden', !shouldShow);
  if (!shouldShow) {
    setIngameChatOpen(false);
  }
}

function isTextInputElement(el: Element | null) {
  if (!el) {
    return false;
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return true;
  }
  return (el as HTMLElement).isContentEditable;
}

function blurActiveInput() {
  const active = document.activeElement as HTMLElement | null;
  if (!active) {
    return;
  }
  if (isTextInputElement(active)) {
    active.blur();
  }
}

function getNameplateEntry(playerId: number): NameplateEntry {
  let entry = nameplateEntries.get(playerId);
  if (entry) {
    return entry;
  }
  const profile = lobbyProfiles.get(playerId) ?? profileFallbackForPlayer(playerId);
  const name = getPlayerDisplayName(playerId, profile);
  const avatarKey = profile.avatarData ?? 'default';
  const el = document.createElement('div');
  el.className = 'nameplate';
  const avatar = createAvatarElement(profile, playerId);
  const nameEl = document.createElement('div');
  nameEl.className = 'nameplate-name';
  nameEl.textContent = name;
  el.append(avatar, nameEl);
  nameplateLayer.appendChild(el);
  entry = { el, nameEl, avatarEl: avatar, lastName: name, lastAvatarKey: avatarKey };
  nameplateEntries.set(playerId, entry);
  return entry;
}

function updateNameplateContent(entry: NameplateEntry, playerId: number) {
  const profile = lobbyProfiles.get(playerId) ?? profileFallbackForPlayer(playerId);
  const name = getPlayerDisplayName(playerId, profile);
  if (entry.lastName !== name) {
    entry.lastName = name;
    entry.nameEl.textContent = name;
  }
  const avatarKey = profile.avatarData ?? 'default';
  if (entry.lastAvatarKey !== avatarKey) {
    entry.lastAvatarKey = avatarKey;
    const avatar = createAvatarElement(profile, playerId);
    entry.avatarEl.replaceWith(avatar);
    entry.avatarEl = avatar;
  }
}

function projectWorldToScreen(
  pos: { x: number; y: number; z: number },
  rect: DOMRect,
  clipFromWorld: mat4,
  offsetY = 0,
): { x: number; y: number } | null {
  nameplateScratch[0] = pos.x;
  nameplateScratch[1] = pos.y + offsetY;
  nameplateScratch[2] = pos.z;
  nameplateScratch[3] = 1;
  vec4.transformMat4(nameplateScratch, nameplateScratch, clipFromWorld);
  const w = nameplateScratch[3];
  if (w <= 0.0001) {
    return null;
  }
  const ndcX = nameplateScratch[0] / w;
  const ndcY = nameplateScratch[1] / w;
  if (ndcX < -1.05 || ndcX > 1.05 || ndcY < -1.05 || ndcY > 1.05) {
    return null;
  }
  const screenX = rect.left + (ndcX * 0.5 + 0.5) * rect.width;
  const screenY = rect.top + (1 - (ndcY * 0.5 + 0.5)) * rect.height;
  return { x: screenX, y: screenY };
}

function updateNameplates(interpolationAlpha: number) {
  const overlayVisible = !overlay.classList.contains('hidden');
  if (!netplayEnabled || !running || overlayVisible) {
    for (const entry of nameplateEntries.values()) {
      entry.el.classList.remove('visible');
    }
    return;
  }
  const localPlayer = game.getLocalPlayer();
  const localId = game.localPlayerId;
  const spectator = localPlayer?.isSpectator ?? false;
  const ballStates = game.getBallRenderStates(interpolationAlpha);
  if (!ballStates || !canvas) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  let clipFromWorld = camera?.clipFromWorldMatrix ?? null;
  const tilt = game.getStageTiltRenderState(interpolationAlpha);
  if (camera && tilt) {
    const rotX = tilt.xrot * STAGE_TILT_SCALE * S16_TO_RAD;
    const rotZ = tilt.zrot * STAGE_TILT_SCALE * S16_TO_RAD;
    if (rotX !== 0 || rotZ !== 0) {
      let pivot = ballStates.find((state) => state.visible) ?? ballStates[0] ?? null;
      if (pivot) {
        vec3.set(nameplateTiltPivot, pivot.pos.x, pivot.pos.y, pivot.pos.z);
        mat4.copy(nameplateViewScratch, camera.viewMatrix);
        mat4.translate(nameplateViewScratch, nameplateViewScratch, nameplateTiltPivot);
        mat4.rotateX(nameplateViewScratch, nameplateViewScratch, rotX);
        mat4.rotateZ(nameplateViewScratch, nameplateViewScratch, rotZ);
        vec3.negate(nameplateTiltPivot, nameplateTiltPivot);
        mat4.translate(nameplateViewScratch, nameplateViewScratch, nameplateTiltPivot);
        mat4.mul(nameplateClipScratch, camera.projectionMatrix, nameplateViewScratch);
        clipFromWorld = nameplateClipScratch;
      }
    }
  }
  if (!clipFromWorld) {
    return;
  }
  let closestId: number | null = null;
  let closestDist = Infinity;
  const activeIds = new Set<number>();
  const positions = new Map<number, { x: number; y: number }>();
  for (let i = 0; i < game.players.length; i += 1) {
    const player = game.players[i];
    if (player.id === localId) {
      continue;
    }
    activeIds.add(player.id);
    const renderState = ballStates[i];
    if (!renderState?.visible) {
      continue;
    }
    const screen = projectWorldToScreen(
      renderState.pos,
      rect,
      clipFromWorld,
      renderState.radius * NAMEPLATE_OFFSET_SCALE
    );
    if (!screen) {
      continue;
    }
    positions.set(player.id, screen);
    if (!spectator) {
      const dx = screen.x - centerX;
      const dy = screen.y - centerY;
      const dist = (dx * dx) + (dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closestId = player.id;
      }
    }
  }

  for (const [playerId, entry] of nameplateEntries.entries()) {
    if (!activeIds.has(playerId)) {
      entry.el.remove();
      nameplateEntries.delete(playerId);
    }
  }

  for (const playerId of activeIds) {
    const entry = getNameplateEntry(playerId);
    const pos = positions.get(playerId) ?? null;
    const shouldShow = !!pos && (spectator || playerId === closestId);
    entry.el.classList.toggle('visible', shouldShow);
    if (pos) {
      updateNameplateContent(entry, playerId);
      entry.el.style.left = `${pos.x}px`;
      entry.el.style.top = `${pos.y}px`;
    }
  }
}

function profileFallbackForPlayer(playerId: number): PlayerProfile {
  const suffix = String(playerId).slice(-4);
  return {
    name: `Player ${suffix}`,
  };
}

const ALIAS_ADJECTIVES = [
  'Brisk', 'Calm', 'Copper', 'Dusty', 'Frost', 'Golden', 'Hidden', 'Jade', 'Keen', 'Lucky',
  'Mellow', 'Neon', 'Quiet', 'Rapid', 'Rustic', 'Silver', 'Soft', 'Solar', 'Steady', 'Swift',
  'Tidy', 'Tiny', 'Vivid', 'Warm', 'Wild', 'Witty', 'Young', 'Zesty',
];

const ALIAS_NOUNS = [
  'Comet', 'Cedar', 'Drift', 'Falcon', 'Flare', 'Forest', 'Galaxy', 'Harbor', 'Horizon', 'Lagoon',
  'Maple', 'Meadow', 'Meteor', 'Orbit', 'Pebble', 'Quasar', 'River', 'Rocket', 'Signal', 'Summit',
  'Thistle', 'Voyage', 'Whisper', 'Willow', 'Zenith',
];

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let t = seed + 0x6d2b79f5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateAlias(seedText: string) {
  const seed = hashString(seedText);
  const rand = seededRandom(seed);
  const wordCount = 2 + Math.floor(rand() * 3);
  const words: string[] = [];
  for (let i = 0; i < wordCount - 1; i += 1) {
    words.push(ALIAS_ADJECTIVES[Math.floor(rand() * ALIAS_ADJECTIVES.length)]);
  }
  words.push(ALIAS_NOUNS[Math.floor(rand() * ALIAS_NOUNS.length)]);
  return words.join(' ');
}

function getPlayerDisplayName(playerId: number, profile: PlayerProfile) {
  if (!privacySettings.hidePlayerNames) {
    return profile.name;
  }
  const roomKey = lobbyRoom?.roomId ?? 'solo';
  return generateAlias(`${roomKey}:player:${playerId}`);
}

function getRoomDisplayName(room: RoomInfo) {
  const roomName = room.meta?.roomName?.trim() ?? '';
  if (!roomName) {
    return room.roomCode ? `Room ${room.roomCode}` : `Room ${room.roomId.slice(0, 8)}`;
  }
  if (!privacySettings.hideLobbyNames) {
    return roomName;
  }
  return generateAlias(`room:${room.roomId}`);
}

function formatRoomInfoLabel(room: RoomInfo) {
  const codeLabel = room.roomCode ? `Room ${room.roomCode}` : `Room ${room.roomId.slice(0, 8)}`;
  const roomName = room.meta?.roomName?.trim();
  const displayName = roomName ? (privacySettings.hideLobbyNames ? generateAlias(`room:${room.roomId}`) : roomName) : '';
  return displayName ? `${codeLabel} • ${displayName}` : codeLabel;
}

function createAvatarElement(profile: PlayerProfile, seed: number) {
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  if (profile.avatarData) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = profile.avatarData;
    avatar.style.background = 'none';
    avatar.appendChild(img);
    return avatar;
  }
  const hue = (seed * 47) % 360;
  const hue2 = (hue + 40) % 360;
  avatar.style.background = `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.6), rgba(255,255,255,0) 55%), linear-gradient(135deg, hsl(${hue} 70% 60%), hsl(${hue2} 70% 45%))`;
  return avatar;
}

function formatGameSourceLabel(source?: GameSource) {
  if (source === GAME_SOURCES.SMB2) {
    return 'SMB2';
  }
  if (source === GAME_SOURCES.MB2WS) {
    return 'MB2WS';
  }
  return 'SMB1';
}

function titleCaseLabel(value: string) {
  if (!value) {
    return '';
  }
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatCourseMeta(gameSource: GameSource, course: any) {
  if (!course) {
    return { courseLabel: formatGameSourceLabel(gameSource), stageLabel: '' };
  }
  if (gameSource === GAME_SOURCES.SMB1) {
    const difficulty = titleCaseLabel(course.difficulty ?? 'Beginner');
    const stageIndexRaw = Number(course.stageIndex ?? 0);
    const stageIndex = Number.isFinite(stageIndexRaw) ? stageIndexRaw : 0;
    return { courseLabel: difficulty || 'Beginner', stageLabel: `Stage ${stageIndex + 1}` };
  }
  const mode = course.mode ?? 'story';
  if (mode === 'story') {
    const worldIndexRaw = Number(course.worldIndex ?? 0);
    const stageIndexRaw = Number(course.stageIndex ?? 0);
    const worldIndex = Number.isFinite(worldIndexRaw) ? worldIndexRaw : 0;
    const stageIndex = Number.isFinite(stageIndexRaw) ? stageIndexRaw : 0;
    return { courseLabel: 'Story', stageLabel: `World ${worldIndex + 1}-${stageIndex + 1}` };
  }
  const difficulty = titleCaseLabel(course.difficulty ?? 'Beginner');
  const stageIndexRaw = Number(course.stageIndex ?? 0);
  const stageIndex = Number.isFinite(stageIndexRaw) ? stageIndexRaw : 0;
  const modeLabel = mode === 'challenge' ? 'Challenge' : titleCaseLabel(mode);
  return { courseLabel: `${modeLabel} ${difficulty}`.trim(), stageLabel: `Stage ${stageIndex + 1}` };
}

function buildRoomMeta(): RoomMeta | null {
  if (!netplayState || netplayState.role !== 'host') {
    return null;
  }
  const resolvedSource = resolveSelectedGameSource();
  const gameSource = netplayState.currentGameSource ?? resolvedSource.gameSource ?? activeGameSource;
  const course = netplayState.currentCourse ?? (() => {
    if (gameSource === GAME_SOURCES.SMB2) {
      return buildSmb2CourseConfig();
    }
    if (gameSource === GAME_SOURCES.MB2WS) {
      return buildMb2wsCourseConfig();
    }
    return buildSmb1CourseConfig();
  })();
  const labels = formatCourseMeta(gameSource, course);
  const stageId = game.stage?.stageId ?? undefined;
  const status = netplayState.currentCourse ? 'in_game' : 'lobby';
  const roomName = sanitizeLobbyName(lobbyRoomNameInput?.value ?? lobbyRoom?.meta?.roomName ?? '');
  return {
    status,
    gameSource,
    courseLabel: labels.courseLabel,
    stageLabel: labels.stageLabel,
    stageId,
    roomName: roomName ?? undefined,
  };
}

function buildRoomMetaForCreation(): RoomMeta {
  const resolvedSource = resolveSelectedGameSource();
  const gameSource = resolvedSource.gameSource ?? activeGameSource;
  const course = gameSource === GAME_SOURCES.SMB2
    ? buildSmb2CourseConfig()
    : gameSource === GAME_SOURCES.MB2WS
      ? buildMb2wsCourseConfig()
      : buildSmb1CourseConfig();
  const labels = formatCourseMeta(gameSource, course);
  const roomName = sanitizeLobbyName(lobbyNameInput?.value ?? '');
  return {
    status: 'lobby',
    gameSource,
    courseLabel: labels.courseLabel,
    stageLabel: labels.stageLabel,
    roomName: roomName ?? undefined,
  };
}

function renderLobbyPlayerList(target: HTMLElement | null, isHost: boolean) {
  if (!target) {
    return;
  }
  target.innerHTML = '';
  if (!lobbyRoom) {
    return;
  }
  for (const player of game.players) {
    const profile = lobbyProfiles.get(player.id) ?? profileFallbackForPlayer(player.id);
    const row = document.createElement('div');
    row.className = 'lobby-player';
    const avatar = createAvatarElement(profile, player.id);
    avatar.setAttribute('aria-hidden', 'true');
    const info = document.createElement('div');
    info.className = 'lobby-player-info';
    const name = document.createElement('div');
    name.className = 'lobby-player-name';
    name.textContent = getPlayerDisplayName(player.id, profile);
    const tags = document.createElement('span');
    tags.className = 'lobby-player-tags';
    const tagParts: string[] = [];
    if (player.id === lobbyRoom.hostId) {
      tagParts.push('Host');
    }
    if (player.id === game.localPlayerId) {
      tagParts.push('You');
    }
    if (tagParts.length > 0) {
      tags.textContent = ` (${tagParts.join(', ')})`;
      name.appendChild(tags);
    }
    const sub = document.createElement('div');
    sub.className = 'lobby-player-sub';
    sub.textContent = `ID ${player.id}`;
    info.append(name, sub);
    row.append(avatar, info);
    if (isHost && player.id !== lobbyRoom.hostId) {
      const kickButton = document.createElement('button');
      kickButton.type = 'button';
      kickButton.className = 'ghost kick-button';
      kickButton.textContent = 'Kick';
      kickButton.addEventListener('click', () => {
        void kickPlayerFromRoom(player.id);
      });
      row.append(kickButton);
    }
    target.appendChild(row);
  }
}

function updateLobbyUi() {
  const inLobby = !!(netplayEnabled && lobbyRoom);
  multiplayerBrowser?.classList.toggle('hidden', inLobby);
  multiplayerLobby?.classList.toggle('hidden', !inLobby);

  if (!lobbyLeaveButton) {
    return;
  }
  if (!inLobby || !lobbyRoom) {
    lobbyLeaveButton.classList.add('hidden');
    if (lobbyPlayerList) {
      lobbyPlayerList.innerHTML = '';
    }
    if (ingamePlayerList) {
      ingamePlayerList.innerHTML = '';
    }
    if (lobbyRoomInfo) {
      lobbyRoomInfo.textContent = '';
    }
    if (lobbyRoomStatus) {
      lobbyRoomStatus.textContent = '';
    }
    if (lobbyRoomNameInput) {
      lobbyRoomNameInput.value = '';
      lobbyRoomNameInput.disabled = true;
    }
    if (lobbyLockToggle) {
      lobbyLockToggle.checked = false;
      lobbyLockToggle.disabled = true;
    }
    if (lobbyChatPanel) {
      lobbyChatPanel.classList.add('hidden');
    }
    if (lobbyStartButton) {
      lobbyStartButton.classList.add('hidden');
      lobbyStartButton.disabled = true;
      lobbyStartButton.textContent = 'Start Match';
    }
    if (levelSelectOpenButton) {
      levelSelectOpenButton.disabled = false;
    }
    updateLevelSelectUi();
    return;
  }

  lobbyLeaveButton.classList.remove('hidden');
  const roomLabel = formatRoomInfoLabel(lobbyRoom);
  const statusLabel = lobbyRoom.meta?.status === 'in_game' ? 'In Game' : 'Waiting';
  const playerCount = Math.max(lobbyRoom.playerCount ?? 0, game.players.length);
  const maxPlayers = lobbyRoom.settings?.maxPlayers ?? game.maxPlayers;
  const isHost = netplayState?.role === 'host';
  if (lobbyRoomInfo) {
    lobbyRoomInfo.textContent = roomLabel;
  }
  if (lobbyRoomNameInput) {
    const desiredName = lobbyRoom.meta?.roomName ?? '';
    const isEditing = document.activeElement === lobbyRoomNameInput;
    if (!isEditing && lobbyRoomNameInput.value !== desiredName) {
      lobbyRoomNameInput.value = desiredName;
    }
    lobbyRoomNameInput.disabled = !isHost;
  }
  if (lobbyRoomStatus) {
    lobbyRoomStatus.textContent = `${statusLabel} • ${playerCount}/${maxPlayers} players`;
  }

  const inMatch = lobbyRoom.meta?.status === 'in_game' || !!netplayState?.currentCourse;
  if (lobbyChatPanel) {
    lobbyChatPanel.classList.toggle('hidden', inMatch);
  }

  renderLobbyPlayerList(lobbyPlayerList, isHost);
  renderLobbyPlayerList(ingamePlayerList, isHost);

  const meta = lobbyRoom.meta ?? buildRoomMeta();
  if (meta && !lobbyRoom.meta) {
    lobbyRoom.meta = meta;
  }
  if (lobbyStageInfo) {
    if (meta) {
      const sourceLabel = formatGameSourceLabel(meta.gameSource);
      const courseLabel = meta.courseLabel ?? 'Unknown';
      const stageLabel = meta.stageLabel ? ` • ${meta.stageLabel}` : '';
      lobbyStageInfo.textContent = `${sourceLabel} • ${courseLabel}${stageLabel}`;
    } else {
      lobbyStageInfo.textContent = 'Unknown';
    }
  }

  if (lobbyMaxPlayersSelect) {
    lobbyMaxPlayersSelect.value = String(maxPlayers);
  }
  if (lobbyCollisionToggle) {
    lobbyCollisionToggle.checked = !!(lobbyRoom.settings?.collisionEnabled ?? true);
  }
  if (lobbyLockToggle) {
    lobbyLockToggle.checked = !!(lobbyRoom.settings?.locked ?? false);
  }
  if (lobbyMaxPlayersSelect) {
    lobbyMaxPlayersSelect.disabled = !isHost;
  }
  if (lobbyCollisionToggle) {
    lobbyCollisionToggle.disabled = !isHost;
  }
  if (lobbyLockToggle) {
    lobbyLockToggle.disabled = !isHost;
  }
  if (lobbyStageButton) {
    lobbyStageButton.disabled = !isHost;
  }
  if (lobbyStartButton) {
    lobbyStartButton.classList.remove('hidden');
    lobbyStartButton.disabled = !isHost;
    lobbyStartButton.textContent = isHost ? 'Start Match' : 'Waiting for host...';
  }
  if (levelSelectOpenButton) {
    levelSelectOpenButton.disabled = !isHost;
  }
  updateProfileUi();
  updateChatUi();
  updateLevelSelectUi();
}

function setSettingsTab(tab: SettingsTab) {
  activeSettingsTab = tab;
  for (const button of settingsTabButtons) {
    button.classList.toggle('active', button.dataset.settingsTab === tab);
  }
  for (const panel of settingsTabPanels) {
    panel.classList.toggle('hidden', panel.dataset.settingsPanel !== tab);
  }
}

function updateSettingsUi() {
  // Settings UI currently only depends on stored values.
}

function updateLevelSelectUi() {
  const showLobbyStage = !!(netplayEnabled && lobbyRoom && netplayState?.role === 'host');
  if (lobbyStageActions) {
    lobbyStageActions.classList.toggle('hidden', !showLobbyStage);
  }
  if (lobbyStageChooseButton) {
    lobbyStageChooseButton.disabled = !showLobbyStage;
  }
}

function setActiveMenu(menu: MenuPanel) {
  if (activeMenu === menu) {
    return;
  }
  activeMenu = menu;
  mainMenuPanel?.classList.toggle('hidden', menu !== 'main');
  multiplayerLayout?.classList.toggle('hidden', menu !== 'multiplayer');
  multiplayerMenuPanel?.classList.toggle('hidden', menu !== 'multiplayer');
  multiplayerIngameMenuPanel?.classList.toggle('hidden', menu !== 'multiplayer-ingame');
  settingsMenuPanel?.classList.toggle('hidden', menu !== 'settings');
  levelSelectMenuPanel?.classList.toggle('hidden', menu !== 'level-select');
  updateLobbyUi();
  if (menu === 'multiplayer' && lobbyClient) {
    void refreshLobbyList();
  }
  if (menu === 'settings') {
    updateSettingsUi();
  }
  if (menu === 'level-select') {
    updateLevelSelectUi();
  }
  syncTouchPreviewVisibility();
}

function openSettingsMenu(tab?: SettingsTab) {
  if (activeMenu !== 'settings') {
    settingsReturnMenu = activeMenu;
  }
  if (tab) {
    setSettingsTab(tab);
  }
  setActiveMenu('settings');
}

function openLevelSelectMenu(returnMenu?: MenuPanel) {
  if (activeMenu !== 'level-select') {
    levelSelectReturnMenu = returnMenu ?? activeMenu;
  }
  setActiveMenu('level-select');
}

function broadcastRoomUpdate() {
  if (!lobbyRoom || netplayState?.role !== 'host') {
    return;
  }
  lobbyRoom.playerCount = game.players.length;
  hostRelay?.broadcast({ type: 'room_update', room: lobbyRoom });
}

function applyLobbySettingsFromInputs() {
  if (!lobbyRoom || netplayState?.role !== 'host') {
    return;
  }
  const currentPlayers = game.players.length;
  const requestedRaw = lobbyMaxPlayersSelect ? Number(lobbyMaxPlayersSelect.value) : lobbyRoom.settings.maxPlayers;
  const requestedMax = Number.isFinite(requestedRaw) ? requestedRaw : lobbyRoom.settings.maxPlayers;
  const minPlayers = Math.max(2, currentPlayers);
  const nextMax = clampInt(requestedMax, minPlayers, LOBBY_MAX_PLAYERS);
  const collisionEnabled = lobbyCollisionToggle ? !!lobbyCollisionToggle.checked : lobbyRoom.settings.collisionEnabled;
  const locked = lobbyLockToggle ? !!lobbyLockToggle.checked : lobbyRoom.settings.locked;
  lobbyRoom.settings = {
    ...lobbyRoom.settings,
    maxPlayers: nextMax,
    collisionEnabled,
    locked,
  };
  game.maxPlayers = nextMax;
  game.playerCollisionEnabled = collisionEnabled;
  if (lobbyMaxPlayersSelect) {
    lobbyMaxPlayersSelect.value = String(nextMax);
  }
  broadcastRoomUpdate();
  sendLobbyHeartbeat(performance.now(), true);
  updateLobbyUi();
}

async function handleHostDisconnect() {
  if (performance.now() < suppressHostDisconnectUntil) {
    suppressHostDisconnectUntil = 0;
    return;
  }
  if (!allowHostMigration) {
    resetNetplayConnections();
    return;
  }
  if (!lobbyClient || !lobbyRoom || lobbySelfId === null || !lobbyPlayerToken) {
    resetNetplayConnections();
    return;
  }
  const roomId = lobbyRoom.roomId;
  const previousHost = lobbyRoom.hostId;
  if (lobbyStatus) {
    lobbyStatus.textContent = 'Lobby: host lost, reassigning...';
  }
  resetNetplayConnections({ preserveLobby: true });
  try {
    const join = await lobbyClient.joinRoom({ roomId, playerId: lobbySelfId, token: lobbyPlayerToken });
    lobbyRoom = join.room;
    lobbySelfId = join.playerId;
    lobbyPlayerToken = join.playerToken;
    lobbyHostToken = join.hostToken ?? lobbyHostToken;
    if (lobbyRoom.hostId !== previousHost) {
      startClient(lobbyRoom, lobbySelfId, lobbyPlayerToken);
      return;
    }
    const promote = await lobbyClient.promoteHost(roomId, lobbySelfId, lobbyPlayerToken);
    lobbyRoom = promote.room;
    lobbySelfId = promote.playerId;
    lobbyPlayerToken = promote.playerToken;
    lobbyHostToken = promote.hostToken ?? null;
    if (lobbyRoom.hostId === lobbySelfId && lobbyHostToken) {
      startHost(lobbyRoom, lobbyPlayerToken);
    } else {
      startClient(lobbyRoom, lobbySelfId, lobbyPlayerToken);
    }
    return;
  } catch (err) {
    try {
      const retry = await lobbyClient.joinRoom({ roomId, playerId: lobbySelfId, token: lobbyPlayerToken });
      lobbyRoom = retry.room;
      lobbySelfId = retry.playerId;
      lobbyPlayerToken = retry.playerToken;
      lobbyHostToken = retry.hostToken ?? lobbyHostToken;
      if (lobbyRoom.hostId === lobbySelfId) {
        startHost(lobbyRoom, lobbyPlayerToken);
      } else {
        startClient(lobbyRoom, lobbySelfId, lobbyPlayerToken);
      }
    } catch {
      resetNetplayConnections();
    }
  }
}

function applyLocalProfileToSession() {
  if (!Number.isFinite(game.localPlayerId) || game.localPlayerId <= 0) {
    return;
  }
  lobbyProfiles.set(game.localPlayerId, localProfile);
}

function broadcastLocalProfile() {
  if (!netplayState) {
    return;
  }
  if (!Number.isFinite(game.localPlayerId) || game.localPlayerId <= 0) {
    return;
  }
  const sanitized = sanitizeProfile(localProfile);
  if (sanitized.name !== localProfile.name || sanitized.avatarData !== localProfile.avatarData) {
    localProfile = sanitized;
    saveLocalProfile(localProfile);
    updateProfileUi();
  } else {
    localProfile = sanitized;
  }
  applyLocalProfileToSession();
  const payload = { type: 'player_profile', playerId: game.localPlayerId, profile: localProfile } as const;
  if (netplayState.role === 'host') {
    hostRelay?.broadcast(payload);
  } else if (netplayState.role === 'client') {
    clientPeer?.send(payload);
  }
  lastProfileBroadcastMs = performance.now();
  updateLobbyUi();
}

function updateProfileUi() {
  if (profileNameInput) {
    const isEditing = document.activeElement === profileNameInput;
    if (!isEditing && profileNameInput.value !== localProfile.name) {
      profileNameInput.value = localProfile.name;
    }
  }
  if (profileAvatarPreview) {
    profileAvatarPreview.innerHTML = '';
    if (localProfile.avatarData) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = localProfile.avatarData;
      profileAvatarPreview.appendChild(img);
    }
  }
}

function scheduleProfileBroadcast() {
  if (profileBroadcastTimer !== null) {
    window.clearTimeout(profileBroadcastTimer);
  }
  const nowMs = performance.now();
  const lastMs = lastProfileBroadcastMs ?? 0;
  const cooldownRemaining = PROFILE_BROADCAST_COOLDOWN_MS - (nowMs - lastMs);
  const waitMs = Math.max(300, cooldownRemaining);
  profileBroadcastTimer = window.setTimeout(() => {
    profileBroadcastTimer = null;
    lastProfileBroadcastMs = performance.now();
    broadcastLocalProfile();
  }, waitMs);
}

function applyLobbyNameFromInput() {
  if (!lobbyRoom || netplayState?.role !== 'host') {
    return;
  }
  const sanitized = sanitizeLobbyName(lobbyRoomNameInput?.value ?? '');
  if (lobbyRoomNameInput && (sanitized ?? '') !== lobbyRoomNameInput.value) {
    lobbyRoomNameInput.value = sanitized ?? '';
  }
  const nextName = sanitized ?? undefined;
  const baseMeta = buildRoomMeta() ?? lobbyRoom.meta ?? { status: 'lobby' };
  if (baseMeta.roomName === nextName) {
    return;
  }
  lobbyRoom.meta = { ...baseMeta, roomName: nextName };
  lastLobbyNameUpdateMs = performance.now();
  broadcastRoomUpdate();
  sendLobbyHeartbeat(performance.now(), true);
  updateLobbyUi();
}

function scheduleLobbyNameUpdate() {
  if (lobbyNameUpdateTimer !== null) {
    window.clearTimeout(lobbyNameUpdateTimer);
  }
  const nowMs = performance.now();
  const lastMs = lastLobbyNameUpdateMs ?? 0;
  const cooldownRemaining = LOBBY_NAME_UPDATE_COOLDOWN_MS - (nowMs - lastMs);
  const waitMs = Math.max(300, cooldownRemaining);
  lobbyNameUpdateTimer = window.setTimeout(() => {
    lobbyNameUpdateTimer = null;
    applyLobbyNameFromInput();
  }, waitMs);
}

function applyLobbyStageSelection() {
  if (!lobbyRoom || netplayState?.role !== 'host') {
    return;
  }
  const meta = buildRoomMeta();
  if (!meta) {
    return;
  }
  lobbyRoom.meta = meta;
  lastRoomMetaKey = JSON.stringify(meta);
  broadcastRoomUpdate();
  sendLobbyHeartbeat(performance.now(), true);
  updateLobbyUi();
}

function resetMatchState() {
  if (netplayState) {
    netplayState.currentCourse = null;
    netplayState.currentGameSource = null;
    netplayState.awaitingSnapshot = false;
  }
  pendingSnapshot = null;
  if (netplayEnabled) {
    resetNetplayForStage();
  }
}

function endActiveMatch() {
  if (!running) {
    return;
  }
  game.pause();
  running = false;
  resumeButton.disabled = true;
  if (hudStatus) {
    hudStatus.textContent = '';
  }
  for (const entry of nameplateEntries.values()) {
    entry.el.classList.remove('visible');
  }
  updateIngameChatVisibility();
}

function endMatchToMenu() {
  resetMatchState();
  endActiveMatch();
  setOverlayVisible(true);
  setActiveMenu('main');
}

function endMatchToLobby() {
  resetMatchState();
  endActiveMatch();
  setOverlayVisible(true);
  setActiveMenu('multiplayer');
  updateLobbyUi();
}

function leaveMatchToLobbyList() {
  if (!netplayEnabled) {
    endMatchToMenu();
    return;
  }
  resetMatchState();
  endActiveMatch();
  setOverlayVisible(true);
  setActiveMenu('multiplayer');
  void leaveRoom();
}

function handleCourseComplete() {
  if (!running) {
    return;
  }
  if (netplayEnabled) {
    if (netplayState?.role !== 'host') {
      return;
    }
    endMatchToLobby();
    if (lobbyRoom) {
      const meta = buildRoomMeta();
      if (meta) {
        lobbyRoom.meta = meta;
      }
      broadcastRoomUpdate();
      sendLobbyHeartbeat(performance.now(), true);
    }
    hostRelay?.broadcast({ type: 'match_end' });
    return;
  }
  endMatchToMenu();
}

function openMenuOverlay(preferredMenu?: MenuPanel) {
  if (!running) {
    return;
  }
  if (netplayEnabled) {
    setActiveMenu('multiplayer-ingame');
    setOverlayVisible(true);
    return;
  }
  setActiveMenu(preferredMenu ?? 'main');
  paused = true;
  game.pause();
}

function closeMenuOverlay() {
  if (!running) {
    return;
  }
  if (netplayEnabled) {
    setOverlayVisible(false);
    return;
  }
  paused = false;
  game.resume();
}

localProfile = loadLocalProfile();
updateProfileUi();
privacySettings = loadPrivacySettings();
updatePrivacyUi();
setSettingsTab(activeSettingsTab);
updateChatUi();

function startLobbyHeartbeat(roomId: string) {
  if (!lobbyClient) {
    return;
  }
  if (lobbyHeartbeatTimer !== null) {
    window.clearInterval(lobbyHeartbeatTimer);
  }
  lastLobbyHeartbeatMs = null;
  lobbyHeartbeatTimer = window.setInterval(() => {
    sendLobbyHeartbeat(performance.now(), false, roomId);
  }, LOBBY_HEARTBEAT_INTERVAL_MS);
  sendLobbyHeartbeat(performance.now(), true, roomId);
}

function stopLobbyHeartbeat() {
  if (lobbyHeartbeatTimer !== null) {
    window.clearInterval(lobbyHeartbeatTimer);
    lobbyHeartbeatTimer = null;
  }
  lastLobbyHeartbeatMs = null;
}

function clearLobbySignalRetry() {
  if (lobbySignalRetryTimer !== null) {
    window.clearTimeout(lobbySignalRetryTimer);
    lobbySignalRetryTimer = null;
  }
  lobbySignalRetryMs = 1000;
}

function scheduleLobbySignalReconnect() {
  if (!lobbyClient || !lobbySignalShouldReconnect || !lobbySignalReconnectFn) {
    return;
  }
  if (lobbySignalRetryTimer !== null) {
    return;
  }
  const delay = lobbySignalRetryMs;
  lobbySignalRetryMs = Math.min(lobbySignalRetryMs * 2, 15000);
  lobbySignalRetryTimer = window.setTimeout(() => {
    lobbySignalRetryTimer = null;
    lobbySignalReconnectFn?.();
  }, delay);
}

function resetNetplayConnections({ preserveLobby = false }: { preserveLobby?: boolean } = {}) {
  lobbySignal?.close();
  lobbySignal = null;
  lobbySignalShouldReconnect = false;
  lobbySignalReconnectFn = null;
  clearLobbySignalRetry();
  hostRelay?.closeAll();
  hostRelay = null;
  clientPeer?.close();
  clientPeer = null;
  netplayEnabled = false;
  netplayState = null;
  pendingSnapshot = null;
  netplayAccumulator = 0;
  game.netplayRttMs = null;
  game.setInputFeed(null);
  for (const player of game.players) {
    game.setPlayerInputFeed(player.id, null);
  }
  game.allowCourseAdvance = true;
  stopLobbyHeartbeat();
  if (!preserveLobby) {
    lobbyRoom = null;
    lobbySelfId = null;
    lobbyPlayerToken = null;
    lobbyHostToken = null;
    lastLobbyHeartbeatMs = null;
    lobbyProfiles.clear();
    pendingAvatarByPlayer.clear();
    profileUpdateThrottle.clear();
    chatMessages = [];
    chatRateLimitByPlayer.clear();
    lastLocalChatSentMs = 0;
    for (const entry of nameplateEntries.values()) {
      entry.el.remove();
    }
    nameplateEntries.clear();
    lastProfileBroadcastMs = null;
    lastLobbyNameUpdateMs = null;
    allowHostMigration = false;
    lastRoomMetaKey = null;
  }
  updateLobbyUi();
  updateChatUi();
  setIngameChatOpen(false);
}

function sendLobbyHeartbeat(
  nowMs: number,
  force = false,
  roomId = lobbyRoom?.roomId,
  playerId = lobbySelfId,
  token = lobbyPlayerToken,
) {
  if (!lobbyClient || !roomId || playerId === null || !token) {
    return;
  }
  if (!force && lastLobbyHeartbeatMs !== null && (nowMs - lastLobbyHeartbeatMs) < LOBBY_HEARTBEAT_FALLBACK_MS) {
    return;
  }
  lastLobbyHeartbeatMs = nowMs;
  let meta: RoomMeta | undefined;
  let settings: RoomInfo['settings'] | undefined;
  if (netplayState?.role === 'host' && lobbyRoom) {
    meta = buildRoomMeta() ?? lobbyRoom.meta;
    settings = lobbyRoom.settings;
    lobbyRoom.playerCount = game.players.length;
    if (meta) {
      lobbyRoom.meta = meta;
      const metaKey = JSON.stringify(meta);
      if (metaKey !== lastRoomMetaKey) {
        lastRoomMetaKey = metaKey;
        broadcastRoomUpdate();
      }
    }
  }
  void lobbyClient.heartbeat(roomId, playerId, token, meta, settings);
}

function recordInputForFrame(frame: number, playerId: number, input: QuantizedInput) {
  if (!netplayState) {
    return false;
  }
  let frameInputs = netplayState.inputHistory.get(frame);
  if (!frameInputs) {
    frameInputs = new Map();
    netplayState.inputHistory.set(frame, frameInputs);
  }
  const prev = frameInputs.get(playerId);
  if (prev && quantizedEqual(prev, input)) {
    return false;
  }
  frameInputs.set(playerId, input);
  netplayState.lastInputs.set(playerId, input);
  return true;
}

function buildInputsForFrame(frame: number) {
  if (!netplayState) {
    return new Map<number, QuantizedInput>();
  }
  let frameInputs = netplayState.inputHistory.get(frame);
  if (!frameInputs) {
    frameInputs = new Map();
    netplayState.inputHistory.set(frame, frameInputs);
  }
  for (const player of game.players) {
    if (!frameInputs.has(player.id)) {
      const last = netplayState.lastInputs.get(player.id) ?? { x: 0, y: 0, buttons: 0 };
      frameInputs.set(player.id, last);
    }
  }
  return frameInputs;
}

function trimNetplayHistory(frame: number) {
  if (!netplayState) {
    return;
  }
  const minFrame = frame - netplayState.maxRollback;
  for (const key of Array.from(netplayState.inputHistory.keys())) {
    if (key < minFrame) {
      netplayState.inputHistory.delete(key);
    }
  }
  for (const key of Array.from(netplayState.hashHistory.keys())) {
    if (key < minFrame) {
      netplayState.hashHistory.delete(key);
    }
  }
  for (const key of Array.from(netplayState.expectedHashes.keys())) {
    if (key < minFrame) {
      netplayState.expectedHashes.delete(key);
    }
  }
}

function rollbackAndResim(startFrame: number) {
  if (!netplayState) {
    return false;
  }
  const perfStart = netplayPerf.enabled ? performance.now() : 0;
  const state = netplayState;
  const session = state.session;
  const current = session.getFrame();
  const rollbackFrame = Math.max(0, startFrame - 1);
  if (!session.rollbackTo(rollbackFrame)) {
    return false;
  }
  const resimFrames = current - rollbackFrame;
  const prevSuppress = session.suppressVisuals;
  session.suppressVisuals = true;
  try {
    for (let frame = rollbackFrame + 1; frame <= current; frame += 1) {
      const inputs = buildInputsForFrame(frame);
      session.advanceTo(frame, inputs);
      let hash: number | undefined;
      if (state.hashInterval > 0 && frame % state.hashInterval === 0) {
        hash = getSimHash();
        state.hashHistory.set(frame, hash);
      }
      if (state.role === 'host') {
        const bundleInputs: Record<number, QuantizedInput> = {};
        for (const [playerId, input] of inputs.entries()) {
          bundleInputs[playerId] = input;
        }
        state.hostFrameBuffer.set(frame, {
          type: 'frame',
          stageSeq: state.stageSeq,
          frame,
          inputs: bundleInputs,
        });
      }
      trimNetplayHistory(frame);
    }
  } finally {
    session.suppressVisuals = prevSuppress;
  }
  if (netplayPerf.enabled) {
    const dt = performance.now() - perfStart;
    netplayPerf.rollbackMs += dt;
    netplayPerf.rollbackFrames += resimFrames;
    netplayPerf.rollbackCount += 1;
  }
  return true;
}

function resimFromSnapshot(snapshotFrame: number, targetFrame: number) {
  if (!netplayState) {
    return;
  }
  if (targetFrame <= snapshotFrame) {
    return;
  }
  const perfStart = netplayPerf.enabled ? performance.now() : 0;
  const state = netplayState;
  const session = state.session;
  const resimFrames = targetFrame - snapshotFrame;
  const prevSuppress = session.suppressVisuals;
  session.suppressVisuals = true;
  try {
    for (let frame = snapshotFrame + 1; frame <= targetFrame; frame += 1) {
      const inputs = buildInputsForFrame(frame);
      session.advanceTo(frame, inputs);
      if (state.hashInterval > 0 && frame % state.hashInterval === 0) {
        state.hashHistory.set(frame, getSimHash());
      }
      trimNetplayHistory(frame);
    }
  } finally {
    session.suppressVisuals = prevSuppress;
  }
  if (netplayPerf.enabled) {
    const dt = performance.now() - perfStart;
    netplayPerf.resimMs += dt;
    netplayPerf.resimFrames += resimFrames;
    netplayPerf.resimCount += 1;
  }
}

function tryApplyPendingSnapshot(stageId: number) {
  if (!pendingSnapshot) {
    return;
  }
  if (netplayState && pendingSnapshot.stageSeq !== undefined && pendingSnapshot.stageSeq !== netplayState.stageSeq) {
    pendingSnapshot = null;
    return;
  }
  if (pendingSnapshot.stageId !== undefined && pendingSnapshot.stageId !== stageId) {
    return;
  }
  const state = netplayState;
  const targetFrame = state?.session.getFrame() ?? game.simTick;
  const snapshotFrame = pendingSnapshot.frame;
  game.loadRollbackState(pendingSnapshot.state);
  resetNetplaySession();
  if (state) {
    state.lastReceivedHostFrame = Math.max(state.lastReceivedHostFrame, snapshotFrame);
    state.awaitingSnapshot = false;
    state.hashHistory.clear();
    for (const key of Array.from(state.expectedHashes.keys())) {
      if (key <= snapshotFrame) {
        state.expectedHashes.delete(key);
      }
    }
  }
  resimFromSnapshot(snapshotFrame, targetFrame);
  if (state) {
    state.lagBehindSinceMs = null;
  }
  pendingSnapshot = null;
}

const cameraEye = vec3.create();

function applyGameCamera(alpha = 1) {
  if (!camera) {
    return;
  }
  const pose = game.getCameraPose(alpha);
  if (!pose) {
    return;
  }
  vec3.set(cameraEye, pose.eye.x, pose.eye.y, pose.eye.z);
  mat4.identity(camera.worldMatrix);
  mat4.translate(camera.worldMatrix, camera.worldMatrix, cameraEye);
  mat4.rotateY(camera.worldMatrix, camera.worldMatrix, pose.rotY * S16_TO_RAD);
  mat4.rotateX(camera.worldMatrix, camera.worldMatrix, pose.rotX * S16_TO_RAD);
  mat4.rotateZ(camera.worldMatrix, camera.worldMatrix, pose.rotZ * S16_TO_RAD);
  camera.worldMatrixUpdated();
}

function initGfx() {
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

  swapChain = createSwapChainForWebGL2(gl, config);
  gfxDevice = swapChain.getDevice();

  camera = new Camera();
  camera.clipSpaceNearZ = gfxDevice.queryVendorInfo().clipSpaceNearZ;

  viewerInput = {
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
    if (!viewerInput) return;
    viewerInput.mouseLocation.mouseX = event.clientX * window.devicePixelRatio;
    viewerInput.mouseLocation.mouseY = event.clientY * window.devicePixelRatio;
  });
}

function prewarmConfettiRenderer() {
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

function queuePrefetch(paths: string[]) {
  for (const path of paths) {
    if (!path) {
      continue;
    }
    void prefetchPackSlice(path);
  }
}

function getStageAssetPathsSmb1(stageId: number, stageBasePath: string): string[] {
  const stageInfo = STAGE_INFO_MAP.get(stageId as StageId);
  if (!stageInfo) {
    return [];
  }
  const stageIdStr = String(stageId).padStart(3, '0');
  const stagedefPath = `${stageBasePath}/st${stageIdStr}/STAGE${stageIdStr}.lz`;
  const stageGmaPath = `${stageBasePath}/st${stageIdStr}/st${stageIdStr}.gma`;
  const stageTplPath = `${stageBasePath}/st${stageIdStr}/st${stageIdStr}.tpl`;
  const commonGmaPath = `${stageBasePath}/init/common.gma`;
  const commonTplPath = `${stageBasePath}/init/common.tpl`;
  const commonNlPath = `${stageBasePath}/init/common_p.lz`;
  const commonNlTplPath = `${stageBasePath}/init/common.lz`;
  const bgName = stageInfo.bgInfo.fileName;
  const bgGmaPath = `${stageBasePath}/bg/${bgName}.gma`;
  const bgTplPath = `${stageBasePath}/bg/${bgName}.tpl`;
  const isNaomi = isNaomiStage(stageId);
  const stageNlObjPath = isNaomi ? `${stageBasePath}/st${stageIdStr}/st${stageIdStr}_p.lz` : '';
  const stageNlTplPath = isNaomi ? `${stageBasePath}/st${stageIdStr}/st${stageIdStr}.lz` : '';
  const paths = [
    stagedefPath,
    stageGmaPath,
    stageTplPath,
    commonGmaPath,
    commonTplPath,
    commonNlPath,
    commonNlTplPath,
    bgGmaPath,
    bgTplPath,
  ];
  if (stageNlObjPath && stageNlTplPath) {
    paths.push(stageNlObjPath, stageNlTplPath);
  }
  return paths;
}

function getStageAssetPathsSmb2(stageId: number, gameSource: GameSource, stageBasePath: string): string[] {
  const stageIdStr = String(stageId).padStart(3, '0');
  const stageInfo =
    gameSource === GAME_SOURCES.MB2WS ? getMb2wsStageInfo(stageId) : getSmb2StageInfo(stageId);
  const bgName = stageInfo?.bgInfo?.fileName ?? '';
  const paths = [
    `${stageBasePath}/st${stageIdStr}/STAGE${stageIdStr}.lz`,
    `${stageBasePath}/st${stageIdStr}/st${stageIdStr}.gma`,
    `${stageBasePath}/st${stageIdStr}/st${stageIdStr}.tpl`,
    `${stageBasePath}/init/common.gma`,
    `${stageBasePath}/init/common.tpl`,
    `${stageBasePath}/init/common_p.lz`,
    `${stageBasePath}/init/common.lz`,
  ];
  if (bgName) {
    paths.push(`${stageBasePath}/bg/${bgName}.gma`, `${stageBasePath}/bg/${bgName}.tpl`);
  }
  return paths;
}

function preloadNextStages() {
  const course = game.course;
  if (!course?.getNextStageIds) {
    return;
  }
  const nextStageIds = course.getNextStageIds();
  if (!nextStageIds.length) {
    return;
  }
  const stageBasePath = game.stageBasePath ?? getStageBasePath(activeGameSource);
  const uniqueIds = new Set(nextStageIds.filter((id) => typeof id === 'number' && id > 0));
  for (const stageId of uniqueIds) {
    const paths =
      activeGameSource === GAME_SOURCES.SMB1
        ? getStageAssetPathsSmb1(stageId, stageBasePath)
        : getStageAssetPathsSmb2(stageId, activeGameSource, stageBasePath);
    if (paths.length > 0) {
      queuePrefetch(paths);
    }
  }
}

async function handleStageLoaded(stageId: number) {
  const token = ++stageLoadToken;
  renderReady = false;
  if (!swapChain || !gfxDevice) {
    initGfx();
  }

  if (activeGameSource !== GAME_SOURCES.SMB1) {
    const stage = game.stage;
    const stageData = await loadRenderStageSmb2(stageId, stage, activeGameSource);
    if (token !== stageLoadToken) {
      return;
    }

    if (renderer) {
      renderer.destroy(gfxDevice!);
    }
    renderer = new Renderer(gfxDevice!, stageData);
    prewarmConfettiRenderer();
    (window as typeof window & { smbStageInfo?: { stageId: number; gameSource: GameSource; bgFile: string } }).smbStageInfo = {
      stageId,
      gameSource: activeGameSource,
      bgFile: stageData.stageInfo?.bgInfo?.fileName ?? '',
    };
    applyGameCamera();

    running = true;
    paused = false;
    renderReady = true;
    lastTime = performance.now();
    updateMobileMenuButtonVisibility();
    updateIngameChatVisibility();
    maybeStartSmb2LikeStageFade();
    markStageReady(stageId);
    tryApplyPendingSnapshot(stageId);
    preloadNextStages();
    if (netplayEnabled && netplayState?.role === 'host' && lobbyRoom) {
      const meta = buildRoomMeta();
      if (meta) {
        lobbyRoom.meta = meta;
        broadcastRoomUpdate();
        sendLobbyHeartbeat(performance.now(), true);
      }
    }
    return;
  }

  const stageData = await loadRenderStage(stageId);
  if (token !== stageLoadToken) {
    return;
  }

  if (renderer) {
    renderer.destroy(gfxDevice!);
  }
  renderer = new Renderer(gfxDevice!, stageData);
  prewarmConfettiRenderer();
  (window as typeof window & { smbStageInfo?: { stageId: number; gameSource: GameSource; bgFile: string } }).smbStageInfo = {
    stageId,
    gameSource: activeGameSource,
    bgFile: stageData.stageInfo?.bgInfo?.fileName ?? '',
  };
  applyGameCamera();

  running = true;
  paused = false;
  renderReady = true;
  lastTime = performance.now();
  updateMobileMenuButtonVisibility();
  updateIngameChatVisibility();
  maybeStartSmb2LikeStageFade();
  markStageReady(stageId);
  tryApplyPendingSnapshot(stageId);
  preloadNextStages();
  if (netplayEnabled && netplayState?.role === 'host' && lobbyRoom) {
    const meta = buildRoomMeta();
    if (meta) {
      lobbyRoom.meta = meta;
      broadcastRoomUpdate();
      sendLobbyHeartbeat(performance.now(), true);
    }
  }
}

function setSelectOptions(select: HTMLSelectElement, values: { value: string; label: string }[]) {
  select.innerHTML = '';
  for (const option of values) {
    const elem = document.createElement('option');
    elem.value = option.value;
    elem.textContent = option.label;
    select.appendChild(elem);
  }
}

function getPackChallengeOrder(gameSource: GameSource) {
  if (!hasPackForGameSource(gameSource)) {
    return null;
  }
  return getPackCourseData()?.challenge?.order ?? null;
}

function getPackStoryOrder(gameSource: GameSource) {
  if (!hasPackForGameSource(gameSource)) {
    return null;
  }
  return getPackCourseData()?.story ?? null;
}

function getSmb2LikeChallengeOrder(gameSource: GameSource) {
  const packOrder = getPackChallengeOrder(gameSource);
  if (packOrder) {
    return packOrder;
  }
  return gameSource === GAME_SOURCES.MB2WS ? MB2WS_CHALLENGE_ORDER : SMB2_CHALLENGE_ORDER;
}

function getSmb2LikeStoryOrder(gameSource: GameSource) {
  const packOrder = getPackStoryOrder(gameSource);
  if (packOrder) {
    return packOrder;
  }
  return gameSource === GAME_SOURCES.MB2WS ? MB2WS_STORY_ORDER : SMB2_STORY_ORDER;
}

function updateSmb2ChallengeStages() {
  if (!smb2ChallengeSelect || !smb2ChallengeStageSelect) {
    return;
  }
  const { gameSource } = resolveSelectedGameSource();
  const order = getSmb2LikeChallengeOrder(gameSource);
  if (hasPackForGameSource(gameSource) && order) {
    const keys = Object.keys(order);
    if (keys.length > 0) {
      const current = smb2ChallengeSelect.value;
      const options = keys.map((key) => ({ value: key, label: key }));
      setSelectOptions(smb2ChallengeSelect, options);
      smb2ChallengeSelect.value = keys.includes(current) ? current : keys[0];
    }
  } else if (defaultChallengeOptions.length > 0) {
    const current = smb2ChallengeSelect.value;
    setSelectOptions(smb2ChallengeSelect, defaultChallengeOptions);
    const values = defaultChallengeOptions.map((option) => option.value);
    smb2ChallengeSelect.value = values.includes(current) ? current : defaultChallengeOptions[0].value;
  }
  const difficulty = smb2ChallengeSelect.value as Smb2ChallengeDifficulty | Mb2wsChallengeDifficulty;
  const stages = order[difficulty] ?? [];
  const options = stages.map((_, index) => ({
    value: String(index + 1),
    label: `Stage ${index + 1}`,
  }));
  setSelectOptions(smb2ChallengeStageSelect, options);
}

function updateSmb1Stages() {
  if (!difficultySelect || !smb1StageSelect) {
    return;
  }
  const stages = getStageListForDifficulty(difficultySelect.value);
  const options = stages.map((stage, index) => ({
    value: String(index),
    label: stage.label,
  }));
  setSelectOptions(smb1StageSelect, options);
}

function updateSmb2StoryOptions() {
  if (!smb2StoryWorldSelect || !smb2StoryStageSelect) {
    return;
  }
  const { gameSource } = resolveSelectedGameSource();
  const storyOrder = getSmb2LikeStoryOrder(gameSource);
  if (storyOrder.length === 0) {
    setSelectOptions(smb2StoryWorldSelect, []);
    setSelectOptions(smb2StoryStageSelect, []);
    return;
  }
  const worldOptions = storyOrder.map((_, index) => ({
    value: String(index + 1),
    label: `World ${index + 1}`,
  }));
  setSelectOptions(smb2StoryWorldSelect, worldOptions);
  const currentWorld = Math.max(0, Math.min(storyOrder.length - 1, Number(smb2StoryWorldSelect.value ?? 1) - 1));
  smb2StoryWorldSelect.value = String(currentWorld + 1);
  const stageList = storyOrder[currentWorld] ?? [];
  const stageOptions = stageList.map((_, index) => ({
    value: String(index + 1),
    label: `Stage ${index + 1}`,
  }));
  setSelectOptions(smb2StoryStageSelect, stageOptions);
  const currentStage = Math.max(0, Math.min(stageList.length - 1, Number(smb2StoryStageSelect.value ?? 1) - 1));
  smb2StoryStageSelect.value = String(currentStage + 1);
}

function updateSmb2ModeFields() {
  if (!smb2ModeSelect) {
    return;
  }
  const isChallenge = smb2ModeSelect.value === 'challenge';
  document.getElementById('smb2-challenge-fields')?.classList.toggle('hidden', !isChallenge);
  document.getElementById('smb2-story-fields')?.classList.toggle('hidden', isChallenge);
}

function updateGameSourceFields() {
  const { gameSource } = resolveSelectedGameSource();
  const isSmb2Like = gameSource !== GAME_SOURCES.SMB1;
  smb1Fields?.classList.toggle('hidden', isSmb2Like);
  smb2Fields?.classList.toggle('hidden', !isSmb2Like);
  updateSmb2ModeFields();
  updateSmb2ChallengeStages();
  updateSmb2StoryOptions();
}

function buildSmb1CourseConfig() {
  const difficulty = difficultySelect?.value ?? 'beginner';
  const stageIndex = Math.max(0, Number(smb1StageSelect?.value ?? 0));
  return { difficulty, stageIndex };
}

function buildSmb2CourseConfig(): Smb2CourseConfig {
  const mode = smb2ModeSelect?.value === 'story' ? 'story' : 'challenge';
  if (mode === 'story') {
    const worldIndex = Math.max(0, Number(smb2StoryWorldSelect?.value ?? 1) - 1);
    const stageIndex = Math.max(0, Number(smb2StoryStageSelect?.value ?? 1) - 1);
    return { mode, worldIndex, stageIndex };
  }
  const difficulty = (smb2ChallengeSelect?.value ?? 'beginner') as Smb2ChallengeDifficulty;
  const stageIndex = Math.max(0, Number(smb2ChallengeStageSelect?.value ?? 1) - 1);
  return { mode, difficulty, stageIndex };
}

function buildMb2wsCourseConfig(): Mb2wsCourseConfig {
  const mode = smb2ModeSelect?.value === 'story' ? 'story' : 'challenge';
  if (mode === 'story') {
    const worldIndex = Math.max(0, Number(smb2StoryWorldSelect?.value ?? 1) - 1);
    const stageIndex = Math.max(0, Number(smb2StoryStageSelect?.value ?? 1) - 1);
    return { mode, worldIndex, stageIndex };
  }
  const difficulty = (smb2ChallengeSelect?.value ?? 'beginner') as Mb2wsChallengeDifficulty;
  const stageIndex = Math.max(0, Number(smb2ChallengeStageSelect?.value ?? 1) - 1);
  return { mode, difficulty, stageIndex };
}

async function startStage(
  difficulty: Smb2CourseConfig | Mb2wsCourseConfig | { difficulty: string; stageIndex: number },
) {
  setOverlayVisible(false);
  resumeButton.disabled = true;
  if (hudStatus) {
    hudStatus.textContent = '';
  }

  game.setReplayMode(false);
  game.setGameSource(activeGameSource);
  game.stageBasePath = getStageBasePath(activeGameSource);
  currentSmb2LikeMode =
    activeGameSource !== GAME_SOURCES.SMB1 && hasSmb2LikeMode(difficulty) ? difficulty.mode : null;
  void audio.resume();
  await game.start(difficulty);
}

function requestSnapshot(reason: 'mismatch' | 'lag', frame?: number, force = false) {
  if (!clientPeer || !netplayState) {
    return;
  }
  const nowMs = performance.now();
  const lastRequest = netplayState.lastSnapshotRequestTimeMs ?? 0;
  const cooldownOk = netplayState.lastSnapshotRequestTimeMs === null
    || (nowMs - lastRequest) >= NETPLAY_SNAPSHOT_COOLDOWN_MS;
  if (netplayState.awaitingSnapshot && !force && !cooldownOk) {
    return;
  }
  if (!cooldownOk) {
    return;
  }
  netplayState.lastSnapshotRequestTimeMs = nowMs;
  netplayState.awaitingSnapshot = true;
  const targetFrame = frame ?? netplayState.session.getFrame();
  clientPeer.send({
    type: 'snapshot_request',
    stageSeq: netplayState.stageSeq,
    frame: targetFrame,
    reason,
  });
}

function applyIncomingProfile(
  playerId: number,
  incoming: PlayerProfile,
  { broadcast }: { broadcast?: boolean } = {},
) {
  const sanitized = sanitizeProfile(incoming);
  const baseProfile: PlayerProfile = { name: sanitized.name };
  lobbyProfiles.set(playerId, baseProfile);
  if (broadcast) {
    hostRelay?.broadcast({ type: 'player_profile', playerId, profile: baseProfile });
  }
  updateLobbyUi();
  if (!sanitized.avatarData) {
    pendingAvatarByPlayer.delete(playerId);
    return;
  }
  const avatarData = sanitized.avatarData;
  pendingAvatarByPlayer.set(playerId, avatarData);
  void getAvatarValidationPromise(avatarData).then((ok) => {
    if (!ok) {
      if (pendingAvatarByPlayer.get(playerId) === avatarData) {
        pendingAvatarByPlayer.delete(playerId);
      }
      return;
    }
    if (pendingAvatarByPlayer.get(playerId) !== avatarData) {
      return;
    }
    pendingAvatarByPlayer.delete(playerId);
    const current = lobbyProfiles.get(playerId);
    const finalProfile: PlayerProfile = { name: current?.name ?? sanitized.name, avatarData };
    lobbyProfiles.set(playerId, finalProfile);
    if (broadcast) {
      hostRelay?.broadcast({ type: 'player_profile', playerId, profile: finalProfile });
    }
    updateLobbyUi();
  });
}

function cloneCourseConfig(config: any) {
  if (!config || typeof config !== 'object') {
    return config;
  }
  return JSON.parse(JSON.stringify(config));
}

function getHostCourseConfig() {
  if (!netplayState?.currentCourse || !game.course) {
    return netplayState?.currentCourse ?? null;
  }
  const config = cloneCourseConfig(netplayState.currentCourse);
  if (activeGameSource === GAME_SOURCES.SMB1) {
    const course = game.course as any;
    if (typeof course.currentFloor === 'number') {
      config.stageIndex = Math.max(0, course.currentFloor - 1);
    }
    if (typeof course.difficulty === 'string') {
      config.difficulty = course.difficulty;
    }
    return config;
  }
  const course = game.course as any;
  if (typeof course.currentIndex === 'number') {
    if (config.mode === 'story') {
      config.worldIndex = Math.floor(course.currentIndex / 10);
      config.stageIndex = course.currentIndex % 10;
    } else {
      config.stageIndex = course.currentIndex;
    }
  }
  return config;
}

function handleHostMessage(msg: HostToClientMessage) {
  if (msg.type === 'kick') {
    suppressHostDisconnectUntil = performance.now() + 1500;
    allowHostMigration = false;
    lobbySignalShouldReconnect = false;
    lobbySignalReconnectFn = null;
    clearLobbySignalRetry();
    resetNetplayConnections();
    game.pause();
    setActiveMenu('multiplayer');
    if (lobbyStatus) {
      lobbyStatus.textContent = msg.reason ? `Lobby: ${msg.reason}` : 'Lobby: removed by host';
    }
    return;
  }
  const state = netplayState;
  if (!state) {
    return;
  }
  if (msg.type === 'pong') {
    const sentAt = state.pendingPings.get(msg.id);
    if (sentAt !== undefined) {
      state.pendingPings.delete(msg.id);
      const rtt = Math.max(0, performance.now() - sentAt);
      state.rttMs = rtt;
      game.netplayRttMs = rtt;
    }
    return;
  }
  const msgStageSeq = (msg as { stageSeq?: number }).stageSeq;
  if (msgStageSeq !== undefined && msg.type !== 'start' && msgStageSeq !== state.stageSeq) {
    return;
  }
  if (msg.type === 'stage_sync') {
    if (state.currentStageId === null) {
      state.currentStageId = msg.stageId;
    }
    if (state.currentStageId !== null && msg.stageId !== state.currentStageId) {
      return;
    }
    state.awaitingStageSync = false;
    state.lastReceivedHostFrame = msg.frame;
    state.lastHostFrameTimeMs = performance.now();
    state.awaitingSnapshot = false;
    state.lagBehindSinceMs = null;
    state.lastAckedLocalFrame = 0;
    netplayAccumulator = 0;
    if (msg.frame > state.session.getFrame()) {
      requestSnapshot('lag', msg.frame, true);
    }
    return;
  }
  if (msg.type === 'frame') {
    if (state.awaitingStageSync) {
      return;
    }
    const frameMsg = msg as FrameBundleMessage;
    const frame = coerceFrame(frameMsg.frame);
    if (frame === null) {
      return;
    }
    if (frameMsg.lastAck !== undefined) {
      const ackFrame = coerceFrame(frameMsg.lastAck);
      if (ackFrame !== null) {
        state.lastAckedLocalFrame = Math.max(state.lastAckedLocalFrame, ackFrame);
      }
      for (const pendingFrame of Array.from(state.pendingLocalInputs.keys())) {
        if (pendingFrame <= state.lastAckedLocalFrame) {
          state.pendingLocalInputs.delete(pendingFrame);
        }
      }
    }
    state.lastReceivedHostFrame = Math.max(state.lastReceivedHostFrame, frame);
    state.lastHostFrameTimeMs = performance.now();
    let changed = false;
    for (const [id, input] of Object.entries(frameMsg.inputs)) {
      const playerId = Number(id);
      if (state.role === 'client' && playerId === game.localPlayerId) {
        continue;
      }
      const normalized = normalizeInput(input);
      if (!normalized) {
        continue;
      }
      if (recordInputForFrame(frame, playerId, normalized)) {
        changed = true;
      }
    }
    if (frameMsg.hash !== undefined && frameMsg.hashFrame !== undefined) {
      const hashFrame = coerceFrame(frameMsg.hashFrame);
      if (hashFrame !== null && Number.isFinite(frameMsg.hash)) {
        state.expectedHashes.set(hashFrame, frameMsg.hash);
        const localHash = state.hashHistory.get(hashFrame);
        if (localHash !== undefined && localHash !== frameMsg.hash) {
          requestSnapshot('mismatch', hashFrame);
        }
      }
    }
    const currentFrame = state.session.getFrame();
    if (changed && frame <= currentFrame) {
      if (!rollbackAndResim(frame)) {
        requestSnapshot('lag');
      }
    }
    if (state.lastReceivedHostFrame - currentFrame > state.maxRollback) {
      requestSnapshot('lag');
    }
    return;
  }
  if (msg.type === 'snapshot') {
    pendingSnapshot = msg;
    if (netplayState) {
      netplayState.lastReceivedHostFrame = Math.max(netplayState.lastReceivedHostFrame, msg.frame);
      netplayState.lastHostFrameTimeMs = performance.now();
    }
    if (!msg.stageId || game.stage?.stageId === msg.stageId) {
      tryApplyPendingSnapshot(game.stage?.stageId ?? 0);
    }
    return;
  }
  if (msg.type === 'player_join') {
    game.addPlayer(msg.playerId, { spectator: msg.spectator });
    const player = game.players.find((p) => p.id === msg.playerId);
    if (player && msg.pendingSpawn) {
      player.pendingSpawn = true;
    }
    if (!lobbyProfiles.has(msg.playerId)) {
      lobbyProfiles.set(msg.playerId, profileFallbackForPlayer(msg.playerId));
    }
    updateLobbyUi();
    return;
  }
  if (msg.type === 'player_leave') {
    game.removePlayer(msg.playerId);
    lobbyProfiles.delete(msg.playerId);
    pendingAvatarByPlayer.delete(msg.playerId);
    updateLobbyUi();
    return;
  }
  if (msg.type === 'player_profile') {
    applyIncomingProfile(msg.playerId, msg.profile);
    return;
  }
  if (msg.type === 'chat') {
    appendChatMessage(msg.playerId, msg.text);
    return;
  }
  if (msg.type === 'match_end') {
    endMatchToLobby();
    return;
  }
  if (msg.type === 'room_update') {
    game.maxPlayers = msg.room.settings.maxPlayers;
    game.playerCollisionEnabled = msg.room.settings.collisionEnabled;
    lobbyRoom = msg.room;
    updateLobbyUi();
    return;
  }
  if (msg.type === 'start') {
    if (netplayState) {
      netplayState.stageSeq = msg.stageSeq;
      netplayState.currentCourse = msg.course;
      netplayState.currentGameSource = msg.gameSource;
      netplayState.awaitingSnapshot = false;
      netplayState.expectedHashes.clear();
      netplayState.hashHistory.clear();
    }
    pendingSnapshot = null;
    activeGameSource = msg.gameSource;
    game.setGameSource(activeGameSource);
    game.stageBasePath = msg.stageBasePath ?? getStageBasePath(activeGameSource);
    currentSmb2LikeMode = activeGameSource !== GAME_SOURCES.SMB1 && msg.course?.mode ? msg.course.mode : null;
    void startStage(msg.course);
  }
}

function handleClientMessage(playerId: number, msg: ClientToHostMessage) {
  const state = netplayState;
  if (!state) {
    return;
  }
  const msgStageSeq = (msg as { stageSeq?: number }).stageSeq;
  if (msgStageSeq !== undefined && msgStageSeq !== state.stageSeq) {
    return;
  }
  let clientState = state.clientStates.get(playerId);
  if (!clientState) {
    clientState = {
      lastAckedHostFrame: -1,
      lastAckedClientInput: -1,
      lastSnapshotMs: null,
      lastSnapshotRequestMs: null,
    };
    state.clientStates.set(playerId, clientState);
  }
  if (!game.players.some((player) => player.id === playerId)) {
    if (game.players.length >= game.maxPlayers) {
      return;
    }
    game.addPlayer(playerId, { spectator: false });
    updateLobbyUi();
  }
  if (msg.type === 'input') {
    const frame = coerceFrame(msg.frame);
    const input = normalizeInput(msg.input);
    if (frame === null || !input) {
      return;
    }
    const player = game.players.find((entry) => entry.id === playerId);
    if (player) {
      player.pendingSpawn = false;
      player.isSpectator = false;
    }
    if (msg.lastAck !== undefined) {
      const ackFrame = coerceFrame(msg.lastAck);
      if (ackFrame !== null) {
        clientState.lastAckedHostFrame = Math.max(
          clientState.lastAckedHostFrame,
          Math.min(ackFrame, state.session.getFrame()),
        );
      }
    }
    clientState.lastAckedClientInput = Math.max(clientState.lastAckedClientInput, frame);
    const currentFrame = state.session.getFrame();
    const minFrame = Math.max(0, currentFrame - Math.min(state.maxRollback, NETPLAY_MAX_INPUT_BEHIND));
    const maxFrame = currentFrame + NETPLAY_MAX_INPUT_AHEAD;
    if (frame < minFrame || frame > maxFrame) {
      return;
    }
    const changed = recordInputForFrame(frame, playerId, input);
    if (changed && frame <= currentFrame) {
      if (!rollbackAndResim(frame)) {
        sendSnapshotToClient(playerId, frame);
      } else {
        state.pendingHostUpdates.add(frame);
      }
    }
    return;
  }
  if (msg.type === 'ack') {
    const frame = coerceFrame(msg.frame);
    if (frame !== null) {
      clientState.lastAckedHostFrame = Math.max(
        clientState.lastAckedHostFrame,
        Math.min(frame, state.session.getFrame()),
      );
    }
    return;
  }
  if (msg.type === 'ping') {
    hostRelay?.sendTo(playerId, { type: 'pong', id: msg.id });
    return;
  }
  if (msg.type === 'stage_ready') {
    if (state.currentStageId === null) {
      state.currentStageId = msg.stageId;
    }
    if (state.currentStageId !== null && msg.stageId !== state.currentStageId) {
      return;
    }
    state.readyPlayers.add(playerId);
    if (!state.awaitingStageReady) {
      sendStageSyncToClient(playerId);
      return;
    }
    maybeSendStageSync();
    return;
  }
  if (msg.type === 'snapshot_request') {
    const nowMs = performance.now();
    const lastRequest = clientState.lastSnapshotRequestMs ?? 0;
    if (clientState.lastSnapshotRequestMs !== null
      && (nowMs - lastRequest) < NETPLAY_SNAPSHOT_COOLDOWN_MS) {
      return;
    }
    clientState.lastSnapshotRequestMs = nowMs;
    const currentFrame = state.session.getFrame();
    const frame = coerceFrame(msg.frame) ?? currentFrame;
    const minFrame = Math.max(0, currentFrame - state.maxRollback);
    const clampedFrame = Math.min(currentFrame, Math.max(minFrame, frame));
    sendSnapshotToClient(playerId, clampedFrame);
    return;
  }
  if (msg.type === 'player_profile') {
    const nowMs = performance.now();
    const lastMs = profileUpdateThrottle.get(playerId) ?? 0;
    if ((nowMs - lastMs) < PROFILE_REMOTE_COOLDOWN_MS) {
      return;
    }
    profileUpdateThrottle.set(playerId, nowMs);
    applyIncomingProfile(playerId, msg.profile, { broadcast: true });
    return;
  }
  if (msg.type === 'chat') {
    const sanitized = sanitizeChatText(msg.text);
    if (!sanitized) {
      return;
    }
    const nowMs = performance.now();
    const lastMs = chatRateLimitByPlayer.get(playerId) ?? 0;
    if ((nowMs - lastMs) < CHAT_SEND_COOLDOWN_MS) {
      return;
    }
    chatRateLimitByPlayer.set(playerId, nowMs);
    appendChatMessage(playerId, sanitized);
    hostRelay?.broadcast({ type: 'chat', playerId, text: sanitized });
    return;
  }
}

function sendSnapshotToClient(playerId: number, frame?: number) {
  if (!hostRelay || !netplayState) {
    return;
  }
  const session = netplayState.session;
  let snapshotFrame = frame ?? session.getFrame();
  if (snapshotFrame > session.getFrame()) {
    snapshotFrame = session.getFrame();
  }
  let snapshotState = session.getState(snapshotFrame);
  if (!snapshotState) {
    snapshotFrame = session.getFrame();
    snapshotState = game.saveRollbackState();
  }
  if (!snapshotState) {
    return;
  }
  hostRelay.sendTo(playerId, {
    type: 'snapshot',
    stageSeq: netplayState.stageSeq,
    frame: snapshotFrame,
    state: snapshotState,
    stageId: game.stage?.stageId,
    gameSource: game.gameSource,
  });
}

function hostResendFrames(currentFrame: number) {
  if (!hostRelay || !netplayState) {
    return;
  }
  const pendingFrames = netplayState.pendingHostUpdates.size > 0
    ? Array.from(netplayState.pendingHostUpdates).sort((a, b) => a - b)
    : null;
  for (const [playerId, clientState] of netplayState.clientStates.entries()) {
    const start = Math.max(clientState.lastAckedHostFrame + 1, currentFrame - netplayState.maxResend + 1);
    if (pendingFrames) {
      for (const frame of pendingFrames) {
        const bundle = netplayState.hostFrameBuffer.get(frame);
        if (!bundle) {
          continue;
        }
        hostRelay.sendTo(playerId, {
          ...bundle,
          lastAck: clientState.lastAckedClientInput,
        });
      }
    }
    for (let frame = start; frame <= currentFrame; frame += 1) {
      const bundle = netplayState.hostFrameBuffer.get(frame);
      if (!bundle) {
        continue;
      }
      hostRelay.sendTo(playerId, {
        ...bundle,
        lastAck: clientState.lastAckedClientInput,
      });
    }
  }
  if (pendingFrames) {
    netplayState.pendingHostUpdates.clear();
  }
}

function hostMaybeSendSnapshots(nowMs: number) {
  if (!hostRelay || !netplayState || netplayState.role !== 'host') {
    return;
  }
  const state = netplayState;
  const currentFrame = state.session.getFrame();
  for (const [playerId, clientState] of state.clientStates.entries()) {
    if (clientState.lastAckedHostFrame < 0) {
      continue;
    }
    const behind = currentFrame - clientState.lastAckedHostFrame;
    if (behind < NETPLAY_HOST_SNAPSHOT_BEHIND_FRAMES) {
      continue;
    }
    const lastSnap = clientState.lastSnapshotMs;
    if (lastSnap !== null && (nowMs - lastSnap) < NETPLAY_HOST_SNAPSHOT_COOLDOWN_MS) {
      continue;
    }
    clientState.lastSnapshotMs = nowMs;
    sendSnapshotToClient(playerId, currentFrame);
  }
}

function clientSendInputBuffer(currentFrame: number) {
  if (!clientPeer || !netplayState) {
    return;
  }
  const start = netplayState.lastAckedLocalFrame + 1;
  const end = currentFrame;
  const minFrame = Math.max(start, end - netplayState.maxResend + 1);
  for (let frame = minFrame; frame <= end; frame += 1) {
    const input = netplayState.pendingLocalInputs.get(frame);
    if (!input) {
      continue;
    }
    clientPeer.send({
      type: 'input',
      stageSeq: netplayState.stageSeq,
      frame,
      playerId: game.localPlayerId,
      input,
      lastAck: netplayState.lastReceivedHostFrame,
    });
  }
  if (start > end) {
    clientPeer.send({
      type: 'ack',
      stageSeq: netplayState.stageSeq,
      playerId: game.localPlayerId,
      frame: netplayState.lastReceivedHostFrame,
    });
  }
}

function getNetplayTargetFrame(state: NetplayState, currentFrame: number) {
  if (state.role === 'client') {
    return getEstimatedHostFrame(state) + getClientLeadFrames(state);
  }
  return currentFrame;
}

function netplayStep() {
  if (!netplayState) {
    return;
  }
  const state = netplayState;
  const session = state.session;
  const currentFrame = session.getFrame();
  const targetFrame = getNetplayTargetFrame(state, currentFrame);
  const drift = targetFrame - currentFrame;
  if (state.role === 'client' && drift < -NETPLAY_CLIENT_AHEAD_SLACK) {
    clientSendInputBuffer(currentFrame);
    return;
  }
  const frame = session.getFrame() + 1;
    const localInput = game.sampleLocalInput();
    recordInputForFrame(frame, game.localPlayerId, localInput);
    if (state.role === 'client') {
      state.pendingLocalInputs.set(frame, localInput);
    }
    const inputs = buildInputsForFrame(frame);
    session.advanceTo(frame, inputs);
    let hash: number | undefined;
    if (state.hashInterval > 0 && frame % state.hashInterval === 0) {
      hash = getSimHash();
      state.hashHistory.set(frame, hash);
      const expected = state.expectedHashes.get(frame);
      if (expected !== undefined && expected !== hash) {
        requestSnapshot('mismatch', frame);
      }
    }
  if (state.role === 'host') {
    let hashFrame: number | null = null;
    let authHash: number | undefined;
    const authHashFrame = getAuthoritativeHashFrame(state);
    if (authHashFrame !== null) {
      const value = state.hashHistory.get(authHashFrame);
      if (value !== undefined) {
        hashFrame = authHashFrame;
        authHash = value;
        state.lastAuthHashFrameSent = authHashFrame;
      }
    }
    const bundleInputs: Record<number, QuantizedInput> = {};
    for (const [playerId, input] of inputs.entries()) {
      bundleInputs[playerId] = input;
    }
    const bundle: FrameBundleMessage = {
      type: 'frame',
      stageSeq: state.stageSeq,
      frame,
      inputs: bundleInputs,
    };
    if (hashFrame !== null && authHash !== undefined) {
      bundle.hashFrame = hashFrame;
      bundle.hash = authHash;
    }
    state.hostFrameBuffer.set(frame, bundle);
    const minFrame = frame - Math.max(state.maxRollback, state.maxResend);
    for (const key of Array.from(state.hostFrameBuffer.keys())) {
      if (key < minFrame) {
        state.hostFrameBuffer.delete(key);
      }
    }
  }
  trimNetplayHistory(frame);
  if (state.role === 'host') {
    hostResendFrames(session.getFrame());
  } else {
    clientSendInputBuffer(session.getFrame());
  }
}

function netplayTick(dtSeconds: number) {
  if (!netplayState) {
    return;
  }
  const perfStart = netplayPerf.enabled ? performance.now() : 0;
  if (!game.stageRuntime || game.loadingStage) {
    game.update(0);
    recordNetplayPerf(perfStart, 0);
    return;
  }
  const state = netplayState;
  const nowMs = performance.now();
  if (state.role === 'client' && state.awaitingStageSync) {
    maybeResendStageReady(nowMs);
    game.accumulator = 0;
    recordNetplayPerf(perfStart, 0);
    return;
  }
  if (state.role === 'host' && state.awaitingStageReady) {
    maybeForceStageSync(nowMs);
    if (state.awaitingStageReady) {
      game.accumulator = 0;
      recordNetplayPerf(perfStart, 0);
      return;
    }
  }
  if (netplayAccumulator < 0) {
    netplayAccumulator = 0;
  }
  const session = state.session;
  const currentFrame = session.getFrame();
  const targetFrame = getNetplayTargetFrame(state, currentFrame);
  const simFrame = currentFrame + (netplayAccumulator / game.fixedStep);
  const drift = targetFrame - simFrame;
  const introSync = game.introTimerFrames > 0;
  if (state.role === 'client') {
    if (clientPeer && nowMs - state.lastPingTimeMs >= NETPLAY_PING_INTERVAL_MS) {
      const pingId = (state.pingSeq += 1);
      state.pendingPings.set(pingId, nowMs);
      state.lastPingTimeMs = nowMs;
      clientPeer.send({ type: 'ping', id: pingId });
    }
    const hostAge = state.lastHostFrameTimeMs === null ? null : nowMs - state.lastHostFrameTimeMs;
    const lastRequest = state.lastSnapshotRequestTimeMs ?? 0;
    const canRequest = state.lastSnapshotRequestTimeMs === null
      || (nowMs - lastRequest) >= NETPLAY_SNAPSHOT_COOLDOWN_MS;
    if (hostAge !== null && hostAge >= NETPLAY_HOST_STALL_MS && canRequest) {
      state.lastSnapshotRequestTimeMs = nowMs;
      requestSnapshot('lag', state.lastReceivedHostFrame, true);
    }
    if (drift > NETPLAY_LAG_FUSE_FRAMES) {
      if (state.lagBehindSinceMs === null) {
        state.lagBehindSinceMs = nowMs;
      }
      const timeBehind = nowMs - state.lagBehindSinceMs;
      if (timeBehind >= NETPLAY_LAG_FUSE_MS && canRequest) {
        state.lastSnapshotRequestTimeMs = nowMs;
        requestSnapshot('lag', state.lastReceivedHostFrame, true);
      }
    } else {
      state.lagBehindSinceMs = null;
    }
  }
  if (state.role === 'client' && drift < -NETPLAY_CLIENT_AHEAD_SLACK) {
    clientSendInputBuffer(currentFrame);
    recordNetplayPerf(perfStart, 0);
    return;
  }
  let rateScale = 1;
  if (state.role === 'client') {
    const driftRate = introSync ? NETPLAY_SYNC_DRIFT_RATE : NETPLAY_CLIENT_DRIFT_RATE;
    const desired = 1 + drift * driftRate;
    const minRate = introSync ? NETPLAY_SYNC_RATE_MIN : NETPLAY_CLIENT_RATE_MIN;
    const maxRate = introSync ? NETPLAY_SYNC_RATE_MAX : NETPLAY_CLIENT_RATE_MAX;
    rateScale = clamp(desired, minRate, maxRate);
  }
  netplayAccumulator = Math.min(
    netplayAccumulator + dtSeconds * rateScale,
    game.fixedStep * NETPLAY_MAX_FRAME_DELTA,
  );
  let ticks = Math.floor(netplayAccumulator / game.fixedStep);
  const forceTick = introSync ? NETPLAY_SYNC_FORCE_TICK : NETPLAY_DRIFT_FORCE_TICK;
  if (ticks <= 0 && drift > forceTick) {
    ticks = 1;
  }
  const extraTick = introSync ? NETPLAY_SYNC_EXTRA_TICKS : NETPLAY_DRIFT_EXTRA_TICKS;
  if (drift > extraTick) {
    const maxTicks = introSync ? NETPLAY_SYNC_MAX_TICKS : 3;
    const add = introSync ? 2 : 1;
    ticks = Math.min(maxTicks, Math.max(1, ticks + add));
  }
  for (let i = 0; i < ticks; i += 1) {
    netplayStep();
    netplayAccumulator -= game.fixedStep;
  }
  if (netplayAccumulator < 0) {
    netplayAccumulator = 0;
  }
  if (state.role === 'host') {
    hostMaybeSendSnapshots(nowMs);
  }
  game.accumulator = Math.max(0, Math.min(game.fixedStep, netplayAccumulator));
  recordNetplayPerf(perfStart, ticks);
}

function updateNetplayDebugOverlay(nowMs: number) {
  if (!netplayEnabled || !netplayState) {
    game.netplayDebugLines = null;
    game.netplayWarning = null;
    netplayDebugWrap.style.display = 'none';
    return;
  }
  const state = netplayState;
  const localPlayer = game.getLocalPlayer?.() ?? null;
  let warning: string | null = null;
  if (state.role === 'client') {
    const hostAge = state.lastHostFrameTimeMs === null ? null : nowMs - state.lastHostFrameTimeMs;
    if (hostAge !== null && hostAge > NETPLAY_HOST_STALL_MS) {
      warning = `NET: host frames stale ${(hostAge / 1000).toFixed(1)}s`;
    } else if (state.awaitingStageSync) {
      warning = 'NET: awaiting stage sync';
    }
  }
  if (!warning && localPlayer) {
    if (localPlayer.isSpectator) {
      warning = 'NET: local spectator';
    } else if (localPlayer.pendingSpawn) {
      warning = 'NET: local pending spawn';
    }
  }
  game.netplayWarning = warning;

  if (!isNetplayDebugEnabled()) {
    game.netplayDebugLines = null;
    if (!warning) {
      netplayDebugWrap.style.display = 'none';
      return;
    }
    netplayDebugWarningEl.textContent = warning;
    netplayDebugInfoEl.textContent = '';
    netplayDebugWrap.style.display = 'block';
    return;
  }

  const sessionFrame = state.session.getFrame();
  const simFrame = sessionFrame + (netplayAccumulator / game.fixedStep);
  const targetFrame = getNetplayTargetFrame(state, sessionFrame);
  const drift = targetFrame - simFrame;
  const lines: string[] = [];
  lines.push(`net ${state.role} id=${game.localPlayerId}`);
  lines.push(`stage=${state.currentStageId ?? game.stage?.stageId ?? 0} seq=${state.stageSeq}`);
  lines.push(`frame=${sessionFrame} host=${state.lastReceivedHostFrame} ack=${state.lastAckedLocalFrame}`);
  lines.push(`drift=${drift.toFixed(2)} acc=${netplayAccumulator.toFixed(3)}`);
  lines.push(`sync=${state.awaitingStageSync ? 1 : 0} ready=${state.awaitingStageReady ? 1 : 0} snap=${state.awaitingSnapshot ? 1 : 0}`);
  if (state.role === 'client') {
    const chanState = clientPeer?.getChannelState?.() ?? 'none';
    const hostAge = state.lastHostFrameTimeMs === null ? 'n/a' : `${((nowMs - state.lastHostFrameTimeMs) / 1000).toFixed(1)}s`;
    lines.push(`peer=${chanState} hostAge=${hostAge}`);
  } else {
    const peers = hostRelay?.getChannelStates?.() ?? [];
    const peerText = peers.length
      ? peers.map((peer) => `${peer.playerId}:${peer.readyState}`).join(' ')
      : 'none';
    lines.push(`peers=${peerText}`);
    if (state.clientStates.size > 0) {
      const currentFrame = state.session.getFrame();
      const behind = Array.from(state.clientStates.entries())
        .map(([playerId, clientState]) => `${playerId}:${currentFrame - clientState.lastAckedHostFrame}`)
        .join(' ');
      lines.push(`behind=${behind}`);
    }
  }
  if (localPlayer) {
    lines.push(`local spec=${localPlayer.isSpectator ? 1 : 0} spawn=${localPlayer.pendingSpawn ? 1 : 0} state=${localPlayer.ball?.state ?? 0}`);
  }
  lines.push(`intro=${game.introTimerFrames} timeover=${game.timeoverTimerFrames}`);
  game.netplayDebugLines = lines;
  netplayDebugWarningEl.textContent = warning ?? '';
  netplayDebugInfoEl.textContent = lines.join('\n');
  netplayDebugWrap.style.display = 'block';
}

function setReplayStatus(text: string) {
  if (replayStatus) {
    replayStatus.textContent = text;
  }
}

async function startReplay(replay: ReplayData) {
  setOverlayVisible(false);
  resumeButton.disabled = true;
  if (hudStatus) {
    hudStatus.textContent = '';
  }
  game.setReplayMode(true, true);
  activeGameSource = replay.gameSource;
  if (gameSourceSelect) {
    gameSourceSelect.value = replay.gameSource;
  }
  updateGameSourceFields();
  game.setGameSource(replay.gameSource);
  game.stageBasePath = getStageBasePath(replay.gameSource);
  currentSmb2LikeMode = null;
  game.course = null;
  void audio.resume();
  await game.loadStage(replay.stageId);
  const localPlayer = game.getLocalPlayer?.() ?? null;
  if (localPlayer?.ball && game.stage) {
    const startTick = Math.max(0, replay.inputStartTick ?? 0);
    game.introTotalFrames = startTick;
    game.introTimerFrames = startTick;
    game.cameraController?.initForStage(localPlayer.ball, localPlayer.ball.startRotY, game.stageRuntime);
  }
  game.replayInputStartTick = Math.max(0, replay.inputStartTick ?? 0);
  game.setInputFeed(replay.inputs);
  game.paused = false;
  while (game.simTick < game.replayInputStartTick) {
    game.update(game.fixedStep);
  }
  game.replayAutoFastForward = false;
  game.setFixedTickMode(false, 1);
  setReplayStatus(`Replay loaded (stage ${replay.stageId})`);
}

function downloadReplay(replay: ReplayData) {
  const label = String(replay.stageId).padStart(3, '0');
  const filename = `replay_${replay.gameSource}_st${label}.json`;
  const blob = new Blob([JSON.stringify(replay, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function refreshLobbyList() {
  if (!lobbyClient || !lobbyList || !lobbyStatus) {
    return;
  }
  lobbyStatus.textContent = 'Lobby: loading...';
  try {
    const rooms = await lobbyClient.listRooms();
    lobbyList.innerHTML = '';
    const totalPlayers = rooms.reduce((sum, room) => sum + (room.playerCount ?? 0), 0);
    if (multiplayerOnlineCount) {
      multiplayerOnlineCount.textContent = `${totalPlayers} player${totalPlayers === 1 ? '' : 's'} online`;
    }
    for (const room of rooms) {
      const item = document.createElement('div');
      item.className = 'lobby-item';
      const info = document.createElement('div');
      info.className = 'lobby-item-main';
      const title = document.createElement('div');
      title.className = 'lobby-item-title';
      title.textContent = getRoomDisplayName(room);
      const subtitle = document.createElement('div');
      subtitle.className = 'lobby-item-subtitle';
      const sourceLabel = formatGameSourceLabel(room.meta?.gameSource);
      const courseLabel = room.meta?.courseLabel ?? room.courseId ?? 'Unknown';
      const stageLabel = room.meta?.stageLabel ? ` • ${room.meta.stageLabel}` : '';
      subtitle.textContent = `${sourceLabel} • ${courseLabel}${stageLabel}`;
      const meta = document.createElement('div');
      meta.className = 'lobby-item-meta';
      const status = room.meta?.status === 'in_game' ? 'In Game' : 'Waiting';
      const playerCount = room.playerCount ?? 0;
      const maxPlayers = room.settings?.maxPlayers ?? 8;
      const locked = !!room.settings?.locked;
      const lockLabel = locked ? ' • Locked' : '';
      meta.textContent = `${status} • ${playerCount}/${maxPlayers} players${lockLabel}`;
      info.append(title, subtitle, meta);
      const join = document.createElement('button');
      join.className = 'ghost compact';
      join.type = 'button';
      join.textContent = 'Join';
      if (playerCount >= maxPlayers || locked) {
        join.disabled = true;
      }
      join.addEventListener('click', async () => {
        await joinRoom(room.roomId);
      });
      item.append(info, join);
      lobbyList.appendChild(item);
    }
    lobbyStatus.textContent = `Lobby: ${rooms.length} room(s)`;
  } catch (err) {
    console.error(err);
    lobbyStatus.textContent = 'Lobby: failed';
    if (multiplayerOnlineCount) {
      multiplayerOnlineCount.textContent = '0 players online';
    }
  }
}

async function createRoom() {
  if (!lobbyClient || !lobbyStatus) {
    return;
  }
  const isPublic = lobbyPublicCheckbox?.checked ?? true;
  lobbyStatus.textContent = 'Lobby: creating...';
  try {
    const result = await lobbyClient.createRoom({
      isPublic,
      courseId: 'smb1-main',
      settings: { maxPlayers: LOBBY_MAX_PLAYERS, collisionEnabled: true, locked: false },
      meta: buildRoomMetaForCreation(),
    });
    lobbyRoom = result.room;
    lobbySelfId = result.playerId;
    lobbyPlayerToken = result.playerToken;
    lobbyHostToken = result.hostToken ?? null;
    lobbyStatus.textContent = `Lobby: hosting ${result.room.roomCode ?? result.room.roomId}`;
    startHost(result.room, result.playerToken);
  } catch (err) {
    console.error(err);
    lobbyStatus.textContent = 'Lobby: create failed';
  }
}

async function joinRoom(roomId: string) {
  if (!lobbyClient || !lobbyStatus) {
    return;
  }
  if (lobbyRoom) {
    if (lobbyRoom.roomId === roomId) {
      lobbyStatus.textContent = 'Lobby: already in room';
      return;
    }
    lobbyStatus.textContent = 'Lobby: leave current room first';
    return;
  }
  lobbyStatus.textContent = 'Lobby: joining...';
  try {
    const result = await lobbyClient.joinRoom({ roomId });
    lobbyRoom = result.room;
    lobbySelfId = result.playerId;
    lobbyPlayerToken = result.playerToken;
    lobbyHostToken = null;
    lobbyStatus.textContent = `Lobby: joining ${result.room.roomCode ?? result.room.roomId}`;
    startClient(result.room, result.playerId, result.playerToken);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : '';
    if (message === 'room_locked') {
      lobbyStatus.textContent = 'Lobby: room is locked';
    } else if (message === 'room_full') {
      lobbyStatus.textContent = 'Lobby: room is full';
    } else {
      lobbyStatus.textContent = 'Lobby: join failed';
    }
  }
}

async function joinRoomByCode() {
  if (!lobbyClient || !lobbyStatus) {
    return;
  }
  const code = lobbyCodeInput?.value?.trim();
  if (!code) {
    lobbyStatus.textContent = 'Lobby: enter a room code';
    return;
  }
  if (lobbyRoom) {
    const existingCode = lobbyRoom.roomCode?.trim().toUpperCase();
    if (existingCode && existingCode === code.trim().toUpperCase()) {
      lobbyStatus.textContent = 'Lobby: already in room';
      return;
    }
    lobbyStatus.textContent = 'Lobby: leave current room first';
    return;
  }
  lobbyStatus.textContent = 'Lobby: joining...';
  try {
    const result = await lobbyClient.joinRoom({ roomCode: code });
    lobbyRoom = result.room;
    lobbySelfId = result.playerId;
    lobbyPlayerToken = result.playerToken;
    lobbyHostToken = null;
    lobbyStatus.textContent = `Lobby: joining ${result.room.roomCode ?? result.room.roomId}`;
    startClient(result.room, result.playerId, result.playerToken);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : '';
    if (message === 'room_locked') {
      lobbyStatus.textContent = 'Lobby: room is locked';
    } else if (message === 'room_full') {
      lobbyStatus.textContent = 'Lobby: room is full';
    } else {
      lobbyStatus.textContent = 'Lobby: join failed';
    }
  }
}

async function leaveRoom() {
  if (!lobbyClient) {
    resetNetplayConnections();
    return;
  }
  const roomId = lobbyRoom?.roomId;
  const wasHost = netplayState?.role === 'host';
  const hostToken = lobbyHostToken;
  allowHostMigration = false;
  lobbySignalShouldReconnect = false;
  lobbySignalReconnectFn = null;
  clearLobbySignalRetry();
  resetNetplayConnections();
  if (roomId && wasHost && hostToken) {
    try {
      await lobbyClient.closeRoom(roomId, hostToken);
    } catch {
      // Ignore.
    }
  }
  if (lobbyStatus) {
    lobbyStatus.textContent = 'Lobby: idle';
  }
}

async function kickPlayerFromRoom(playerId: number) {
  if (!lobbyClient || !lobbyRoom || netplayState?.role !== 'host' || !lobbyHostToken) {
    return;
  }
  if (playerId === lobbyRoom.hostId) {
    return;
  }
  try {
    await lobbyClient.kickPlayer(lobbyRoom.roomId, lobbyHostToken, playerId);
  } catch (err) {
    console.error(err);
  }
  hostRelay?.sendTo(playerId, { type: 'kick', reason: 'Removed by host' });
  window.setTimeout(() => {
    hostRelay?.disconnect(playerId);
    broadcastRoomUpdate();
    sendLobbyHeartbeat(performance.now(), true);
  }, 80);
}

function startHost(room: LobbyRoom, playerToken: string) {
  if (!lobbyClient) {
    return;
  }
  if (!playerToken) {
    if (lobbyStatus) {
      lobbyStatus.textContent = 'Lobby: auth failed';
    }
    return;
  }
  netplayEnabled = true;
  allowHostMigration = true;
  ensureNetplayState('host');
  game.setLocalPlayerId(room.hostId);
  applyLocalProfileToSession();
  game.maxPlayers = room.settings.maxPlayers;
  game.playerCollisionEnabled = room.settings.collisionEnabled;
  game.allowCourseAdvance = true;
  hostRelay = new HostRelay((playerId, msg) => {
    handleClientMessage(playerId, msg);
  });
  hostRelay.hostId = room.hostId;
  hostRelay.onConnect = (playerId) => {
    const state = netplayState;
    if (!state) {
      return;
    }
    if (game.players.length >= game.maxPlayers) {
      return;
    }
    if (!state.clientStates.has(playerId)) {
      state.clientStates.set(playerId, {
        lastAckedHostFrame: -1,
        lastAckedClientInput: -1,
        lastSnapshotMs: null,
        lastSnapshotRequestMs: null,
      });
    }
    game.addPlayer(playerId, { spectator: false });
    const player = game.players.find((p) => p.id === playerId);
    const pendingSpawn = !!player?.pendingSpawn;
    if (!lobbyProfiles.has(playerId)) {
      lobbyProfiles.set(playerId, profileFallbackForPlayer(playerId));
    }
    for (const existing of game.players) {
      hostRelay?.sendTo(playerId, {
        type: 'player_join',
        playerId: existing.id,
        spectator: existing.isSpectator,
        pendingSpawn: existing.pendingSpawn,
      });
    }
    hostRelay?.broadcast({ type: 'player_join', playerId, spectator: false, pendingSpawn });
    const nextRoom = lobbyRoom ?? room;
    if (nextRoom) {
      nextRoom.playerCount = game.players.length;
      hostRelay?.sendTo(playerId, { type: 'room_update', room: nextRoom });
    }
    for (const [id, profile] of lobbyProfiles.entries()) {
      hostRelay?.sendTo(playerId, { type: 'player_profile', playerId: id, profile });
    }
    if (state.currentCourse && state.currentGameSource) {
      hostRelay?.sendTo(playerId, {
        type: 'start',
        stageSeq: state.stageSeq,
        gameSource: state.currentGameSource,
        course: state.currentCourse,
        stageBasePath: getStageBasePath(state.currentGameSource),
      });
    }
    sendSnapshotToClient(playerId);
    updateLobbyUi();
  };
  hostRelay.onDisconnect = (playerId) => {
    game.removePlayer(playerId);
    netplayState?.clientStates.delete(playerId);
    lobbyProfiles.delete(playerId);
    pendingAvatarByPlayer.delete(playerId);
    hostRelay?.broadcast({ type: 'player_leave', playerId });
    updateLobbyUi();
    maybeSendStageSync();
  };
  lobbySignalShouldReconnect = true;
  clearLobbySignalRetry();
  lobbySignalReconnectFn = () => {
    lobbySignal?.close();
    lobbySignal = lobbyClient.openSignal(room.roomId, room.hostId, playerToken, async (msg) => {
      if (msg.to !== room.hostId) {
        return;
      }
      if (msg.payload?.join) {
        const offer = await createHostOffer(hostRelay!, msg.from);
        hostRelay?.onSignal?.({ type: 'signal', from: room.hostId, to: msg.from, payload: { sdp: offer } });
        return;
      }
      await applyHostSignal(hostRelay!, msg.from, msg.payload);
    }, () => {
      if (!lobbySignalShouldReconnect) {
        return;
      }
      lobbyStatus!.textContent = 'Lobby: signal lost';
      scheduleLobbySignalReconnect();
    });
  };
  lobbySignalReconnectFn();
  hostRelay.onSignal = (signal) => lobbySignal?.send(signal);
  startLobbyHeartbeat(room.roomId);
  lobbyStatus!.textContent = `Lobby: hosting ${room.roomCode ?? room.roomId}`;
  broadcastLocalProfile();
  updateLobbyUi();
}

async function startClient(room: LobbyRoom, playerId: number, playerToken: string) {
  if (!lobbyClient) {
    return;
  }
  if (!playerToken) {
    if (lobbyStatus) {
      lobbyStatus.textContent = 'Lobby: auth failed';
    }
    return;
  }
  netplayEnabled = true;
  allowHostMigration = true;
  ensureNetplayState('client');
  game.setLocalPlayerId(playerId);
  applyLocalProfileToSession();
  game.maxPlayers = room.settings.maxPlayers;
  game.playerCollisionEnabled = room.settings.collisionEnabled;
  game.allowCourseAdvance = false;
  game.addPlayer(room.hostId, { spectator: false });
  clientPeer = new ClientPeer((msg) => {
    handleHostMessage(msg);
  });
  clientPeer.playerId = playerId;
  clientPeer.hostId = room.hostId;
  clientPeer.onConnect = () => {
    broadcastLocalProfile();
  };
  await clientPeer.createConnection();
  lobbySignalShouldReconnect = true;
  clearLobbySignalRetry();
  lobbySignalReconnectFn = () => {
    lobbySignal?.close();
    lobbySignal = lobbyClient.openSignal(room.roomId, playerId, playerToken, async (msg) => {
      if (msg.to !== playerId) {
        return;
      }
      await clientPeer?.handleSignal(msg.payload);
    }, () => {
      if (!lobbySignalShouldReconnect) {
        return;
      }
      lobbyStatus!.textContent = 'Lobby: signal lost';
      scheduleLobbySignalReconnect();
    });
  };
  lobbySignalReconnectFn();
  clientPeer.onSignal = (signal) => lobbySignal?.send(signal);
  clientPeer.onDisconnect = () => {
    if (lobbyStatus) {
      lobbyStatus.textContent = 'Lobby: disconnected';
    }
    void handleHostDisconnect();
  };
  lobbySignal.send({ type: 'signal', from: playerId, to: room.hostId, payload: { join: true } });
  startLobbyHeartbeat(room.roomId);
  lobbyStatus!.textContent = `Lobby: connected ${room.roomCode ?? room.roomId}`;
  updateLobbyUi();
}

function bindVolumeControl(
  input: HTMLInputElement | null,
  output: HTMLOutputElement | null,
  apply: (value: number) => void,
) {
  if (!input) {
    return;
  }
  const update = () => {
    const value = Number(input.value) / 100;
    apply(value);
    if (output) {
      output.value = `${Math.round(value * 100)}%`;
      output.textContent = output.value;
    }
  };
  input.addEventListener('input', update);
  update();
}

function readStoredNumber(key: string, fallback: number) {
  const raw = localStorage.getItem(key);
  const value = raw === null ? NaN : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function bindRangeControl(
  input: HTMLInputElement | null,
  output: HTMLOutputElement | null,
  key: string,
  fallback: number,
  format: (value: number) => string,
  apply: (value: number) => void,
) {
  if (!input) {
    return;
  }
  const initial = readStoredNumber(key, fallback);
  input.value = String(initial);
  const update = () => {
    const value = Number(input.value);
    apply(value);
    if (output) {
      output.value = format(value);
      output.textContent = output.value;
    }
    localStorage.setItem(key, String(value));
  };
  input.addEventListener('input', update);
  update();
}

function updateFalloffCurve(power: number) {
  if (!inputFalloffPath) {
    return;
  }
  const steps = 24;
  let path = 'M 0 100';
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const x = t * 100;
    const y = 100 - Math.pow(t, power) * 100;
    path += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  inputFalloffPath.setAttribute('d', path);
}

function updateInputPreview() {
  if (!inputPreview || !inputRawDot || !inputProcessedDot) {
    return;
  }
  const raw = game.input?.getRawInputPreview?.();
  if (!raw) {
    inputRawDot.style.opacity = '0';
    inputProcessedDot.style.opacity = '0';
    return;
  }
  const processed = game.input?.applyInputFalloffToStick?.(raw) ?? raw;
  inputRawDot.style.opacity = '1';
  inputProcessedDot.style.opacity = '1';
  const placeDot = (dot: HTMLElement, value: { x: number; y: number }) => {
    const clampedX = clamp(value.x, -1, 1);
    const clampedY = clamp(value.y, -1, 1);
    const x = ((clampedX + 1) / 2) * 100;
    const y = ((clampedY + 1) / 2) * 100;
    dot.style.left = `${x}%`;
    dot.style.top = `${y}%`;
  };
  placeDot(inputRawDot, raw);
  placeDot(inputProcessedDot, processed);
}

function getConnectedGamepad() {
  const active = game.input?.getActiveGamepad?.();
  if (active?.connected) {
    return active;
  }
  const pads = navigator.getGamepads?.() ?? navigator.webkitGetGamepads?.();
  if (!pads) {
    return null;
  }
  for (const pad of pads) {
    if (pad?.connected) {
      return pad;
    }
  }
  return null;
}

function rebuildCalibrationGate() {
  const sectorAngle = (Math.PI * 2) / 8;
  calibrationGate = calibrationSectorMax.map((length, i) => {
    const fallback = calibrationFallbackGate[i] ?? DEFAULT_PAD_GATE[i];
    const fallbackLength = Math.hypot(fallback[0], fallback[1]);
    const use = clamp(length > 10 ? length : fallbackLength, 0, 127);
    const angle = i * sectorAngle;
    return [Math.cos(angle) * use, Math.sin(angle) * use];
  });
}

function drawCalibrationMap() {
  if (!gamepadCalibrationCtx || !gamepadCalibrationMap) {
    return;
  }
  const { width, height } = gamepadCalibrationMap;
  const centerX = width / 2;
  const centerY = height / 2;
  const scale = (Math.min(width, height) / 2 - 14) / 128;
  gamepadCalibrationCtx.clearRect(0, 0, width, height);

  gamepadCalibrationCtx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  gamepadCalibrationCtx.lineWidth = 1;
  gamepadCalibrationCtx.beginPath();
  gamepadCalibrationCtx.moveTo(centerX, 12);
  gamepadCalibrationCtx.lineTo(centerX, height - 12);
  gamepadCalibrationCtx.moveTo(12, centerY);
  gamepadCalibrationCtx.lineTo(width - 12, centerY);
  gamepadCalibrationCtx.stroke();

  gamepadCalibrationCtx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  for (const sample of calibrationSamples) {
    const x = centerX + sample.x * scale;
    const y = centerY + sample.y * scale;
    gamepadCalibrationCtx.fillRect(x - 1, y - 1, 2, 2);
  }

  if (calibrationGate.length === 8) {
    gamepadCalibrationCtx.strokeStyle = 'rgba(255, 159, 28, 0.9)';
    gamepadCalibrationCtx.lineWidth = 2;
    gamepadCalibrationCtx.beginPath();
    calibrationGate.forEach((point, index) => {
      const x = centerX + point[0] * scale;
      const y = centerY + point[1] * scale;
      if (index === 0) {
        gamepadCalibrationCtx.moveTo(x, y);
      } else {
        gamepadCalibrationCtx.lineTo(x, y);
      }
    });
    gamepadCalibrationCtx.closePath();
    gamepadCalibrationCtx.stroke();
  }
}

function startGamepadCalibration() {
  if (!gamepadCalibrationOverlay) {
    return;
  }
  calibrationActive = true;
  calibrationSamples = [];
  calibrationSectorMax = new Array(8).fill(0);
  calibrationFallbackGate = game.input?.getPadGate?.() ?? DEFAULT_PAD_GATE.map((point) => [point[0], point[1]]);
  calibrationGate = calibrationFallbackGate.map((point) => [point[0], point[1]]);
  gamepadCalibrationOverlay.classList.remove('hidden');
  gamepadCalibrationOverlay.setAttribute('aria-hidden', 'false');
  drawCalibrationMap();
}

function stopGamepadCalibration() {
  if (!calibrationActive) {
    return;
  }
  calibrationActive = false;
  if (calibrationGate.length === 8) {
    game.input?.setPadGate?.(calibrationGate);
  }
  gamepadCalibrationOverlay?.classList.add('hidden');
  gamepadCalibrationOverlay?.setAttribute('aria-hidden', 'true');
}

function updateGamepadCalibration() {
  if (!calibrationActive) {
    return;
  }
  const pad = getConnectedGamepad();
  if (!pad) {
    drawCalibrationMap();
    return;
  }
  if (pad.buttons?.some((button) => button.pressed)) {
    stopGamepadCalibration();
    return;
  }
  const rawX = clamp((pad.axes[0] ?? 0) * 127, -128, 127);
  const rawY = clamp((pad.axes[1] ?? 0) * 127, -128, 127);
  const magnitude = Math.hypot(rawX, rawY);
  if (magnitude > 6) {
    calibrationSamples.push({ x: rawX, y: rawY });
    if (calibrationSamples.length > 600) {
      calibrationSamples.shift();
    }
    const sectorAngle = (Math.PI * 2) / 8;
    let angle = Math.atan2(rawY, rawX);
    if (angle < 0) {
      angle += Math.PI * 2;
    }
    const sector = Math.floor((angle + sectorAngle / 2) / sectorAngle) % 8;
    const axisAngle = sector * sectorAngle;
    const axisX = Math.cos(axisAngle);
    const axisY = Math.sin(axisAngle);
    const projection = rawX * axisX + rawY * axisY;
    const length = Math.abs(projection);
    if (length > calibrationSectorMax[sector]) {
      calibrationSectorMax[sector] = length;
      rebuildCalibrationGate();
    }
  }
  drawCalibrationMap();
}

function updateControlModeSettingsVisibility() {
  if (!controlModeSelect || !controlModeSettings) {
    return;
  }
  const hasOptions = controlModeSelect.options.length > 0;
  const pads = navigator.getGamepads?.() ?? navigator.webkitGetGamepads?.();
  const hasConnectedPad = !!pads && Array.from(pads).some((pad) => pad?.connected);
  const hasController = hasConnectedPad || !!game.input?.getActiveGamepad?.();
  const showSettings = hasOptions || hasController;
  controlModeSettings.classList.toggle('hidden', !showSettings);
  if (!hasOptions) {
    gyroSettings?.classList.add('hidden');
    touchSettings?.classList.add('hidden');
    inputFalloffBlock?.classList.toggle('hidden', !hasController);
    inputFalloffCurveWrap?.classList.toggle('hidden', !hasController);
    inputPreview?.classList.toggle('hidden', !hasController);
    gamepadCalibrationBlock?.classList.toggle('hidden', !hasController);
    return;
  }
  const mode = controlModeSelect.value;
  gyroSettings?.classList.toggle('hidden', mode !== 'gyro');
  touchSettings?.classList.toggle('hidden', mode !== 'touch');
  const showFalloff = mode === 'touch' || hasController;
  inputFalloffBlock?.classList.toggle('hidden', !showFalloff);
  const hideCurve = mode === 'gyro';
  inputFalloffCurveWrap?.classList.toggle('hidden', hideCurve);
  inputPreview?.classList.toggle('hidden', hideCurve);
  gamepadCalibrationBlock?.classList.toggle('hidden', !hasController);
}

function maybeUpdateControlModeSettings(now: number) {
  if (now - lastControlModeSettingsCheck < 1000) {
    return;
  }
  lastControlModeSettingsCheck = now;
  updateControlModeSettingsVisibility();
}

function syncTouchPreviewVisibility() {
  const overlayVisible = !overlay.classList.contains('hidden');
  const mode = controlModeSelect?.value;
  const shouldPreview = overlayVisible && mode === 'touch' && !isOverlayPanelNearBottom();
  game.input?.setTouchPreview?.(shouldPreview);
}

function getActiveOverlayPanel(): HTMLElement | null {
  if (levelSelectMenuPanel && !levelSelectMenuPanel.classList.contains('hidden')) {
    return levelSelectMenuPanel;
  }
  if (settingsMenuPanel && !settingsMenuPanel.classList.contains('hidden')) {
    return settingsMenuPanel;
  }
  if (multiplayerIngameMenuPanel && !multiplayerIngameMenuPanel.classList.contains('hidden')) {
    return multiplayerIngameMenuPanel;
  }
  if (multiplayerMenuPanel && !multiplayerMenuPanel.classList.contains('hidden')) {
    return multiplayerMenuPanel;
  }
  return mainMenuPanel;
}

function isOverlayPanelNearBottom() {
  const panel = getActiveOverlayPanel();
  if (!panel) {
    return false;
  }
  const buffer = 24;
  return panel.scrollTop + panel.clientHeight >= panel.scrollHeight - buffer;
}

function renderFrame(now: number) {
  requestAnimationFrame(renderFrame);

  updateGyroHelper();
  maybeUpdateControlModeSettings(now);
  updateInputPreview();
  updateGamepadCalibration();

  if (!running || !viewerInput || !camera) {
    lastTime = now;
    return;
  }

  const dt = Math.max(0, now - lastTime);
  lastTime = now;
  const dtSeconds = dt / 1000;
  sendLobbyHeartbeat(now);

  if (!paused) {
    viewerInput.deltaTime = dt;
    viewerInput.time += dt;
  } else {
    viewerInput.deltaTime = 0;
  }

  if (netplayEnabled) {
    netplayTick(dtSeconds);
  } else {
    game.update(dtSeconds);
  }
  updateNetplayDebugOverlay(now);

  const shouldRender = interpolationEnabled || (now - lastRenderTime) >= RENDER_FRAME_MS;
  if (!shouldRender) {
    return;
  }

  if (!renderer || !gfxDevice || !swapChain || !renderReady) {
    lastTime = now;
    return;
  }

  lastRenderTime = now;

  resizeCanvasToDisplaySize(canvas);
  resizeCanvasToDisplaySize(hudCanvas);
  hudRenderer.resize(hudCanvas.width, hudCanvas.height);

  if (game.loadingStage) {
    const hudDelta = now - lastHudTime;
    lastHudTime = now;
    const hudDtFrames = game.paused ? 0 : (hudDelta / 1000) * 60;
    hudRenderer.update(game, hudDtFrames);
    hudRenderer.render(game, dtSeconds);
    return;
  }

  const aspect = canvas.width / canvas.height;
  camera.clipSpaceNearZ = gfxDevice.queryVendorInfo().clipSpaceNearZ;
  camera.aspect = aspect;
  camera.setClipPlanes(5);

  viewerInput.backbufferWidth = canvas.width;
  viewerInput.backbufferHeight = canvas.height;

  swapChain.configureSwapChain(canvas.width, canvas.height);
  gfxDevice.beginFrame();
  viewerInput.onscreenTexture = swapChain.getOnscreenTexture();

  const interpolationAlpha = interpolationEnabled ? game.getInterpolationAlpha() : 1;
  const baseTimeFrames = game.getAnimTimeFrames(interpolationAlpha);
  const timeFrames = baseTimeFrames === null ? null : baseTimeFrames;
  syncState.timeFrames = timeFrames;
  syncState.bananas = game.getBananaRenderState(interpolationAlpha);
  syncState.jamabars = game.getJamabarRenderState(interpolationAlpha);
  syncState.bananaCollectedByAnimGroup = null;
  syncState.animGroupTransforms = game.getAnimGroupTransforms(interpolationAlpha);
  syncState.ball = game.getBallRenderState(interpolationAlpha);
  syncState.balls = game.getBallRenderStates(interpolationAlpha);
  syncState.goalBags = game.getGoalBagRenderState(interpolationAlpha);
  syncState.goalTapes = game.getGoalTapeRenderState(interpolationAlpha);
  syncState.confetti = game.getConfettiRenderState(interpolationAlpha);
  syncState.effects = game.getEffectRenderState(interpolationAlpha);
  syncState.switches = game.getSwitchRenderState(interpolationAlpha);
  syncState.stageTilt = game.getStageTiltRenderState(interpolationAlpha);
  renderer.syncGameplayState(syncState);

  applyGameCamera(interpolationAlpha);
  updateNameplates(interpolationAlpha);
  const hudDelta = now - lastHudTime;
  lastHudTime = now;
  const hudDtFrames = game.paused ? 0 : (hudDelta / 1000) * 60;
  hudRenderer.update(game, hudDtFrames);
  renderer.render(gfxDevice, viewerInput);

  gfxDevice.endFrame();

  hudRenderer.render(game, dtSeconds);
}

function updateGyroHelper() {
  if (!controlModeSelect || !gyroHelper || !gyroHelperFrame) {
    return;
  }
  const hasGyroOption = Array.from(controlModeSelect.options).some((opt) => opt.value === 'gyro');
  const showGyro = hasGyroOption && controlModeSelect.value === 'gyro';
  gyroHelper.classList.toggle('hidden', !showGyro);
  if (controlModeField) {
    controlModeField.classList.toggle('hidden', controlModeSelect.options.length === 0);
  }
  updateControlModeSettingsVisibility();
  if (!showGyro) {
    gyroHelperDevice?.classList.remove('at-limit');
    return;
  }
  const sample = game.input?.getGyroSample?.();
  if (!sample || !sample.hasSample) {
    gyroHelperFrame.style.opacity = '0.5';
    gyroHelperDevice?.classList.remove('at-limit');
    return;
  }
  const deltaBeta = sample.baselineSet ? sample.beta - sample.baseBeta : sample.beta;
  const deltaGamma = sample.baselineSet ? sample.gamma - sample.baseGamma : sample.gamma;
  const maxAngle = game.input?.getGyroSensitivity?.() ?? 25;
  const x = clamp(-deltaBeta, -maxAngle, maxAngle);
  const y = clamp(deltaGamma, -maxAngle, maxAngle);
  gyroHelperFrame.style.opacity = '1';
  gyroHelperFrame.style.setProperty('--gyro-x', `${x}deg`);
  gyroHelperFrame.style.setProperty('--gyro-y', `${y}deg`);
  const atLimit = Math.abs(deltaBeta) >= maxAngle || Math.abs(deltaGamma) >= maxAngle;
  gyroHelperDevice?.classList.toggle('at-limit', atLimit);
}

setOverlayVisible(true);
startButton.disabled = false;

updatePackUi();
syncPackEnabled();
void initPackFromQuery().finally(() => {
  updateSmb2ChallengeStages();
  updateSmb2StoryOptions();
  updateSmb1Stages();
  updateGameSourceFields();
});

bindVolumeControl(musicVolumeInput, musicVolumeValue, (value) => {
  audio.setMusicVolume(value);
});
bindVolumeControl(sfxVolumeInput, sfxVolumeValue, (value) => {
  audio.setSfxVolume(value);
});
bindVolumeControl(announcerVolumeInput, announcerVolumeValue, (value) => {
  audio.setAnnouncerVolume(value);
});

bindRangeControl(
  gyroSensitivityInput,
  gyroSensitivityValue,
  'smb_gyro_sensitivity',
  25,
  (value) => `${Math.round(value)}°`,
  (value) => {
    game.input?.setGyroSensitivity?.(value);
  },
);

bindRangeControl(
  joystickSizeInput,
  joystickSizeValue,
  'smb_touch_joystick_scale',
  1,
  (value) => `${value.toFixed(1)}x`,
  (value) => {
    game.input?.setJoystickScale?.(value);
  },
);

bindRangeControl(
  inputFalloffInput,
  inputFalloffValue,
  'smb_input_falloff',
  1,
  (value) => value.toFixed(2).replace(/\.00$/, ''),
  (value) => {
    game.input?.setInputFalloff?.(value);
    updateFalloffCurve(value);
  },
);

updateControlModeSettingsVisibility();
updateFalloffCurve(game.input?.inputFalloff ?? 1);
syncTouchPreviewVisibility();
updateFullscreenButtonVisibility();

function setPackPickerOpen(open: boolean) {
  if (!packPicker) {
    return;
  }
  packPicker.classList.toggle('hidden', !open);
}

packLoadButton?.addEventListener('click', () => {
  if (!packPicker) {
    return;
  }
  setPackPickerOpen(packPicker.classList.contains('hidden'));
});

packLoadZipButton?.addEventListener('click', () => {
  setPackPickerOpen(false);
  packFileInput?.click();
});

packLoadFolderButton?.addEventListener('click', () => {
  setPackPickerOpen(false);
  packFolderInput?.click();
});

packFileInput?.addEventListener('change', async () => {
  const file = packFileInput.files?.[0];
  packFileInput.value = '';
  if (!file) {
    return;
  }
  try {
    const pack = await loadPackFromZipFile(file);
    await applyLoadedPack(pack);
  } catch (error) {
    console.error(error);
    if (hudStatus) {
      hudStatus.textContent = 'Failed to load pack.';
    }
  }
});

packFolderInput?.addEventListener('change', async () => {
  const files = packFolderInput.files;
  packFolderInput.value = '';
  if (!files || files.length === 0) {
    return;
  }
  try {
    const pack = await loadPackFromFileList(files);
    await applyLoadedPack(pack);
  } catch (error) {
    console.error(error);
    if (hudStatus) {
      hudStatus.textContent = 'Failed to load pack.';
    }
  }
});

replaySaveButton?.addEventListener('click', () => {
  if (!game || !game.stage) {
    setReplayStatus('Replay: no stage active');
    return;
  }
  const replay = game.exportReplay();
  if (!replay) {
    setReplayStatus('Replay: no inputs recorded');
    return;
  }
  downloadReplay(replay);
  setReplayStatus(`Replay saved (stage ${replay.stageId})`);
});

replayLoadButton?.addEventListener('click', () => {
  replayFileInput?.click();
});

replayFileInput?.addEventListener('change', async () => {
  const file = replayFileInput.files?.[0];
  replayFileInput.value = '';
  if (!file) {
    return;
  }
  try {
    const text = await file.text();
    const replay = JSON.parse(text) as ReplayData;
    if (!replay || replay.version !== 1 || !Array.isArray(replay.inputs)) {
      throw new Error('Invalid replay');
    }
    await startReplay(replay);
  } catch (error) {
    console.error(error);
    setReplayStatus('Replay: failed to load');
  }
});

smb2ModeSelect?.addEventListener('change', () => {
  updateSmb2ModeFields();
});

smb2ChallengeSelect?.addEventListener('change', () => {
  updateSmb2ChallengeStages();
});

smb2StoryWorldSelect?.addEventListener('change', () => {
  updateSmb2StoryOptions();
});

difficultySelect?.addEventListener('change', () => {
  updateSmb1Stages();
});

gameSourceSelect?.addEventListener('change', () => {
  syncPackEnabled();
  updateGameSourceFields();
});

controlModeSelect?.addEventListener('change', () => {
  updateControlModeSettingsVisibility();
  syncTouchPreviewVisibility();
});

fullscreenButton?.addEventListener('click', async () => {
  const root = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  try {
    if (document.fullscreenElement || (document as typeof document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement) {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as typeof document & { webkitExitFullscreen?: () => Promise<void> | void }).webkitExitFullscreen) {
        await (document as typeof document & { webkitExitFullscreen?: () => Promise<void> | void }).webkitExitFullscreen?.();
      }
    } else if (root.requestFullscreen) {
      await root.requestFullscreen();
    } else if (root.webkitRequestFullscreen) {
      await root.webkitRequestFullscreen();
    }
  } catch {
    // Ignore fullscreen errors.
  }
  updateFullscreenButtonVisibility();
});

document.addEventListener('fullscreenchange', () => {
  updateFullscreenButtonVisibility();
});

document.addEventListener('webkitfullscreenchange', () => {
  updateFullscreenButtonVisibility();
});

for (const panel of [mainMenuPanel, multiplayerMenuPanel, multiplayerIngameMenuPanel, settingsMenuPanel, levelSelectMenuPanel]) {
  panel?.addEventListener('scroll', () => {
    syncTouchPreviewVisibility();
  });
}

gamepadCalibrationButton?.addEventListener('click', () => {
  startGamepadCalibration();
});

gamepadCalibrationOverlay?.addEventListener('click', () => {
  stopGamepadCalibration();
});

window.addEventListener('gamepadconnected', () => {
  updateControlModeSettingsVisibility();
});

window.addEventListener('gamepaddisconnected', () => {
  updateControlModeSettingsVisibility();
});

if (interpolationToggle) {
  interpolationToggle.checked = true;
  interpolationEnabled = true;
}

multiplayerOpenButton?.addEventListener('click', () => {
  setActiveMenu('multiplayer');
});

multiplayerBackButton?.addEventListener('click', () => {
  setActiveMenu('main');
});

levelSelectOpenButton?.addEventListener('click', () => {
  openLevelSelectMenu('main');
});

levelSelectBackButton?.addEventListener('click', () => {
  setActiveMenu(levelSelectReturnMenu);
});

settingsOpenButton?.addEventListener('click', () => {
  openSettingsMenu();
});

settingsBackButton?.addEventListener('click', () => {
  setActiveMenu(settingsReturnMenu);
});

for (const button of settingsTabButtons) {
  button.addEventListener('click', () => {
    const tab = button.dataset.settingsTab as SettingsTab | undefined;
    if (tab) {
      setSettingsTab(tab);
    }
  });
}

function handleStartRequest() {
  if (netplayEnabled && netplayState?.role === 'client') {
    if (hudStatus) {
      hudStatus.textContent = 'Waiting for host to start...';
    }
    return;
  }
  const resolved = resolveSelectedGameSource();
  activeGameSource = resolved.gameSource;
  const difficulty = activeGameSource === GAME_SOURCES.SMB2
    ? buildSmb2CourseConfig()
    : activeGameSource === GAME_SOURCES.MB2WS
      ? buildMb2wsCourseConfig()
      : buildSmb1CourseConfig();
  if (netplayEnabled && netplayState?.role === 'host') {
    netplayState.currentCourse = difficulty;
    netplayState.currentGameSource = activeGameSource;
    if (lobbyRoom) {
      const meta = buildRoomMeta();
      if (meta) {
        lobbyRoom.meta = meta;
      }
      broadcastRoomUpdate();
      sendLobbyHeartbeat(performance.now(), true);
    }
  }
  startStage(difficulty).catch((error) => {
    if (hudStatus) {
      hudStatus.textContent = 'Failed to load stage.';
    }
    console.error(error);
  });
}

startButton.addEventListener('click', handleStartRequest);

resumeButton.addEventListener('click', () => {
  closeMenuOverlay();
});

ingameResumeButton?.addEventListener('click', () => {
  closeMenuOverlay();
});

ingameLeaveButton?.addEventListener('click', () => {
  leaveMatchToLobbyList();
});

gyroRecalibrateButton?.addEventListener('click', () => {
  game.input?.recalibrateGyro?.();
});

mobileMenuButton?.addEventListener('click', () => {
  if (netplayEnabled) {
    openMenuOverlay();
  } else {
    openMenuOverlay('main');
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (ingameChatOpen) {
      event.preventDefault();
      setIngameChatOpen(false);
      return;
    }
    if (running && !overlay.classList.contains('hidden')) {
      event.preventDefault();
      closeMenuOverlay();
      return;
    }
    if (running) {
      event.preventDefault();
      openMenuOverlay(netplayEnabled ? 'multiplayer-ingame' : 'main');
      return;
    }
    return;
  }
  if (event.key === 'Enter') {
    if (!netplayEnabled || !running) {
      return;
    }
    if (!overlay.classList.contains('hidden')) {
      return;
    }
    if (ingameChatOpen) {
      return;
    }
    if (isTextInputElement(document.activeElement)) {
      blurActiveInput();
      if (isTextInputElement(document.activeElement)) {
        return;
      }
    }
    updateIngameChatVisibility();
    if (ingameChatWrap?.classList.contains('hidden')) {
      return;
    }
    event.preventDefault();
    setIngameChatOpen(true);
  }
});

if (lobbyRefreshButton) {
  lobbyRefreshButton.addEventListener('click', () => {
    void refreshLobbyList();
  });
}
if (lobbyCreateButton) {
  lobbyCreateButton.addEventListener('click', () => {
    void createRoom();
  });
}
if (lobbyJoinButton) {
  lobbyJoinButton.addEventListener('click', () => {
    void joinRoomByCode();
  });
}
if (lobbyLeaveButton) {
  lobbyLeaveButton.addEventListener('click', () => {
    void leaveRoom();
  });
}
if (lobbyMaxPlayersSelect) {
  lobbyMaxPlayersSelect.addEventListener('change', () => {
    applyLobbySettingsFromInputs();
  });
}
if (lobbyCollisionToggle) {
  lobbyCollisionToggle.addEventListener('change', () => {
    applyLobbySettingsFromInputs();
  });
}
if (lobbyLockToggle) {
  lobbyLockToggle.addEventListener('change', () => {
    applyLobbySettingsFromInputs();
  });
}
if (profileNameInput) {
  profileNameInput.addEventListener('input', () => {
    const sanitized = sanitizeProfileName(profileNameInput.value);
    if (sanitized !== profileNameInput.value) {
      profileNameInput.value = sanitized;
    }
    if (sanitized !== localProfile.name) {
      localProfile = { ...localProfile, name: sanitized };
      saveLocalProfile(localProfile);
      scheduleProfileBroadcast();
    }
  });
}
if (profileAvatarInput) {
  profileAvatarInput.addEventListener('change', async () => {
    const file = profileAvatarInput.files?.[0] ?? null;
    profileAvatarInput.value = '';
    if (!file) {
      return;
    }
    const dataUrl = await validateAvatarFile(file);
    if (!dataUrl) {
      return;
    }
    localProfile = { ...localProfile, avatarData: dataUrl };
    saveLocalProfile(localProfile);
    updateProfileUi();
    scheduleProfileBroadcast();
  });
}
if (profileAvatarClearButton) {
  profileAvatarClearButton.addEventListener('click', () => {
    if (!localProfile.avatarData) {
      return;
    }
    localProfile = { ...localProfile, avatarData: undefined };
    saveLocalProfile(localProfile);
    updateProfileUi();
    scheduleProfileBroadcast();
    setProfileAvatarError();
  });
}
if (hidePlayerNamesToggle) {
  hidePlayerNamesToggle.addEventListener('change', () => {
    privacySettings = { ...privacySettings, hidePlayerNames: hidePlayerNamesToggle.checked };
    savePrivacySettings(privacySettings);
    updateLobbyUi();
  });
}
if (hideLobbyNamesToggle) {
  hideLobbyNamesToggle.addEventListener('change', () => {
    privacySettings = { ...privacySettings, hideLobbyNames: hideLobbyNamesToggle.checked };
    savePrivacySettings(privacySettings);
    updateLobbyUi();
    void refreshLobbyList();
  });
}
if (lobbyNameInput) {
  lobbyNameInput.addEventListener('input', () => {
    const sanitized = sanitizeLobbyNameDraft(lobbyNameInput.value);
    if (sanitized !== lobbyNameInput.value) {
      lobbyNameInput.value = sanitized;
    }
  });
}
if (lobbyRoomNameInput) {
  lobbyRoomNameInput.addEventListener('input', () => {
    if (netplayState?.role !== 'host') {
      return;
    }
    const sanitized = sanitizeLobbyNameDraft(lobbyRoomNameInput.value);
    if (sanitized !== lobbyRoomNameInput.value) {
      lobbyRoomNameInput.value = sanitized;
    }
  });
  lobbyRoomNameInput.addEventListener('blur', () => {
    if (netplayState?.role !== 'host') {
      return;
    }
    scheduleLobbyNameUpdate();
  });
  lobbyRoomNameInput.addEventListener('keydown', (event) => {
    if (netplayState?.role !== 'host') {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      lobbyRoomNameInput.blur();
      scheduleLobbyNameUpdate();
    }
  });
}
if (lobbyChatInput) {
  lobbyChatInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    const value = lobbyChatInput.value;
    lobbyChatInput.value = '';
    sendChatMessage(value);
  });
}
if (lobbyChatSendButton) {
  lobbyChatSendButton.addEventListener('click', () => {
    const value = lobbyChatInput?.value ?? '';
    if (lobbyChatInput) {
      lobbyChatInput.value = '';
      lobbyChatInput.focus();
    }
    sendChatMessage(value);
  });
}
if (lobbyStageButton) {
  lobbyStageButton.addEventListener('click', () => {
    if (netplayState?.role !== 'host') {
      return;
    }
    openLevelSelectMenu('multiplayer');
  });
}
if (lobbyStageChooseButton) {
  lobbyStageChooseButton.addEventListener('click', () => {
    applyLobbyStageSelection();
    setActiveMenu('multiplayer');
  });
}
if (ingameChatInput) {
  ingameChatInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    const value = ingameChatInput.value;
    ingameChatInput.value = '';
    sendChatMessage(value);
    setIngameChatOpen(false);
  });
}
if (lobbyStartButton) {
  lobbyStartButton.addEventListener('click', () => {
    handleStartRequest();
  });
}
if (lobbyClient) {
  void refreshLobbyList();
} else if (multiplayerOnlineCount) {
  multiplayerOnlineCount.textContent = 'Offline';
}

requestAnimationFrame(renderFrame);
