import { mat4, vec3 } from 'gl-matrix';
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
import type { ClientToHostMessage, FrameBundleMessage, HostToClientMessage } from './netcode_protocol.js';
import { parseStagedefLz } from './noclip/SuperMonkeyBall/Stagedef.js';
import { StageId, STAGE_INFO_MAP } from './noclip/SuperMonkeyBall/StageInfo.js';
import type { StageData } from './noclip/SuperMonkeyBall/World.js';
import { convertSmb2StageDef, getMb2wsStageInfo, getSmb2StageInfo } from './smb2_render.js';
import { HudRenderer } from './hud.js';
import type { ReplayData } from './replay.js';
import {
  fetchPackSlice,
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
const overlayPanel = document.querySelector('.panel') as HTMLElement | null;
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
  updateMobileMenuButtonVisibility();
  updateFullscreenButtonVisibility();
  syncTouchPreviewVisibility();
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
  onStageLoaded: (stageId) => {
    void handleStageLoaded(stageId);
    if (netplayEnabled && netplayState?.role === 'host' && hostRelay) {
      const config = getHostCourseConfig();
      if (config) {
        netplayState.currentCourse = config;
        netplayState.currentGameSource = activeGameSource;
        hostRelay.broadcast({
          type: 'start',
          gameSource: activeGameSource,
          course: config,
          stageBasePath: getStageBasePath(activeGameSource),
        });
      }
    }
  },
});
game.init();

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

type LobbyRoom = {
  roomId: string;
  roomCode?: string;
  isPublic: boolean;
  hostId: number;
  courseId: string;
  settings: { maxPlayers: number; collisionEnabled: boolean };
};

const lobbyBaseUrl = (window as any).LOBBY_URL ?? "";
const lobbyClient = lobbyBaseUrl ? new LobbyClient(lobbyBaseUrl) : null;

const lobbyRefreshButton = document.getElementById('lobby-refresh') as HTMLButtonElement | null;
const lobbyCreateButton = document.getElementById('lobby-create') as HTMLButtonElement | null;
const lobbyJoinButton = document.getElementById('lobby-join') as HTMLButtonElement | null;
const lobbyPublicCheckbox = document.getElementById('lobby-public') as HTMLInputElement | null;
const lobbyCodeInput = document.getElementById('lobby-code') as HTMLInputElement | null;
const lobbyLeaveButton = document.getElementById('lobby-leave') as HTMLButtonElement | null;
const lobbyStatus = document.getElementById('lobby-status') as HTMLElement | null;
const lobbyList = document.getElementById('lobby-list') as HTMLElement | null;
const lobbyPlayers = document.getElementById('lobby-players') as HTMLElement | null;

let lobbyRoom: LobbyRoom | null = null;
let lobbySignal: { send: (msg: any) => void; close: () => void } | null = null;
let hostRelay: HostRelay | null = null;
let clientPeer: ClientPeer | null = null;
let netplayEnabled = false;
let pendingSnapshot: { frame: number; state: any; stageId?: number; gameSource?: GameSource } | null = null;
let lobbyHeartbeatTimer: number | null = null;
let netplayAccumulator = 0;
const NETPLAY_MAX_FRAME_DELTA = 5;

type NetplayRole = 'host' | 'client';
type NetplayClientState = {
  lastAckedHostFrame: number;
  lastAckedClientInput: number;
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

function ensureNetplayState(role: NetplayRole) {
  if (netplayState && netplayState.role === role) {
    return netplayState;
  }
  const session = game.ensureRollbackSession();
  session.prime(game.simTick);
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

function getSimHash() {
  if (!game.stageRuntime || !game.world) {
    return 0;
  }
  const balls = game.players.map((player) => player.ball);
  const worlds = [game.world, ...game.players.map((player) => player.world)];
  return hashSimState(balls, worlds, game.stageRuntime);
}

function updateLobbyUi() {
  if (!lobbyStatus || !lobbyLeaveButton || !lobbyPlayers) {
    return;
  }
  if (!netplayEnabled || !lobbyRoom) {
    lobbyLeaveButton.classList.add('hidden');
    lobbyPlayers.classList.add('hidden');
    lobbyPlayers.textContent = '';
    return;
  }
  lobbyLeaveButton.classList.remove('hidden');
  const role = netplayState?.role ?? 'offline';
  const playerIds = game.players.map((player) => player.id);
  lobbyPlayers.textContent = `Connected (${role}): ${playerIds.join(', ') || 'none'}`;
  lobbyPlayers.classList.remove('hidden');
}

function startLobbyHeartbeat(roomId: string) {
  if (!lobbyClient) {
    return;
  }
  if (lobbyHeartbeatTimer !== null) {
    window.clearInterval(lobbyHeartbeatTimer);
  }
  lobbyHeartbeatTimer = window.setInterval(() => {
    void lobbyClient.heartbeat(roomId);
  }, 15000);
}

function stopLobbyHeartbeat() {
  if (lobbyHeartbeatTimer !== null) {
    window.clearInterval(lobbyHeartbeatTimer);
    lobbyHeartbeatTimer = null;
  }
}

function resetNetplayConnections() {
  lobbySignal?.close();
  lobbySignal = null;
  hostRelay?.closeAll();
  hostRelay = null;
  clientPeer?.close();
  clientPeer = null;
  netplayEnabled = false;
  netplayState = null;
  pendingSnapshot = null;
  netplayAccumulator = 0;
  stopLobbyHeartbeat();
  lobbyRoom = null;
  updateLobbyUi();
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
  const session = netplayState.session;
  const current = session.getFrame();
  const rollbackFrame = Math.max(0, startFrame - 1);
  if (!session.rollbackTo(rollbackFrame)) {
    return false;
  }
  for (let frame = rollbackFrame + 1; frame <= current; frame += 1) {
    const inputs = buildInputsForFrame(frame);
    session.advanceTo(frame, inputs);
    if (netplayState.hashInterval > 0 && frame % netplayState.hashInterval === 0) {
      netplayState.hashHistory.set(frame, getSimHash());
    }
    trimNetplayHistory(frame);
  }
  return true;
}

function tryApplyPendingSnapshot(stageId: number) {
  if (!pendingSnapshot) {
    return;
  }
  if (pendingSnapshot.stageId !== undefined && pendingSnapshot.stageId !== stageId) {
    return;
  }
  game.loadRollbackState(pendingSnapshot.state);
  resetNetplaySession();
  if (netplayState) {
    netplayState.lastReceivedHostFrame = pendingSnapshot.frame;
    netplayState.awaitingSnapshot = false;
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
    maybeStartSmb2LikeStageFade();
    tryApplyPendingSnapshot(stageId);
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
  maybeStartSmb2LikeStageFade();
  tryApplyPendingSnapshot(stageId);
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
  if (netplayEnabled && netplayState) {
    netplayState.inputHistory.clear();
    netplayState.lastInputs.clear();
    netplayState.pendingLocalInputs.clear();
    netplayState.hashHistory.clear();
    netplayState.expectedHashes.clear();
    netplayState.lastAckedLocalFrame = -1;
    netplayState.lastReceivedHostFrame = game.simTick;
    resetNetplaySession();
  }
}

function requestSnapshot(reason: 'mismatch' | 'lag') {
  if (!clientPeer || !netplayState || netplayState.awaitingSnapshot) {
    return;
  }
  netplayState.awaitingSnapshot = true;
  clientPeer.send({
    type: 'snapshot_request',
    frame: netplayState.session.getFrame(),
    reason,
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
  const state = netplayState;
  if (!state) {
    return;
  }
  if (msg.type === 'frame') {
    const frameMsg = msg as FrameBundleMessage;
    if (frameMsg.lastAck !== undefined) {
      state.lastAckedLocalFrame = Math.max(state.lastAckedLocalFrame, frameMsg.lastAck);
      for (const frame of Array.from(state.pendingLocalInputs.keys())) {
        if (frame <= state.lastAckedLocalFrame) {
          state.pendingLocalInputs.delete(frame);
        }
      }
    }
    state.lastReceivedHostFrame = Math.max(state.lastReceivedHostFrame, frameMsg.frame);
    let changed = false;
    for (const [id, input] of Object.entries(frameMsg.inputs)) {
      const playerId = Number(id);
      if (recordInputForFrame(frameMsg.frame, playerId, input)) {
        changed = true;
      }
    }
    if (frameMsg.hash !== undefined) {
      state.expectedHashes.set(frameMsg.frame, frameMsg.hash);
      const localHash = state.hashHistory.get(frameMsg.frame);
      if (localHash !== undefined && localHash !== frameMsg.hash) {
        requestSnapshot('mismatch');
      }
    }
    const currentFrame = state.session.getFrame();
    if (changed && frameMsg.frame <= currentFrame) {
      if (!rollbackAndResim(frameMsg.frame)) {
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
      netplayState.inputHistory.clear();
      netplayState.lastInputs.clear();
      netplayState.pendingLocalInputs.clear();
      netplayState.hashHistory.clear();
      netplayState.expectedHashes.clear();
      netplayState.lastAckedLocalFrame = msg.frame;
      netplayState.lastReceivedHostFrame = msg.frame;
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
    updateLobbyUi();
    return;
  }
  if (msg.type === 'player_leave') {
    game.removePlayer(msg.playerId);
    updateLobbyUi();
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
    activeGameSource = msg.gameSource;
    game.setGameSource(activeGameSource);
    game.stageBasePath = msg.stageBasePath ?? getStageBasePath(activeGameSource);
    currentSmb2LikeMode = activeGameSource !== GAME_SOURCES.SMB1 && msg.course?.mode ? msg.course.mode : null;
    if (netplayState) {
      netplayState.currentCourse = msg.course;
      netplayState.currentGameSource = msg.gameSource;
    }
    void startStage(msg.course);
  }
}

function handleClientMessage(playerId: number, msg: ClientToHostMessage) {
  const state = netplayState;
  if (!state) {
    return;
  }
  let clientState = state.clientStates.get(playerId);
  if (!clientState) {
    clientState = { lastAckedHostFrame: -1, lastAckedClientInput: -1 };
    state.clientStates.set(playerId, clientState);
  }
  if (!game.players.some((player) => player.id === playerId)) {
    game.addPlayer(playerId, { spectator: false });
    updateLobbyUi();
  }
  if (msg.type === 'input') {
    if (msg.lastAck !== undefined) {
      clientState.lastAckedHostFrame = Math.max(clientState.lastAckedHostFrame, msg.lastAck);
    }
    clientState.lastAckedClientInput = Math.max(clientState.lastAckedClientInput, msg.frame);
    const changed = recordInputForFrame(msg.frame, playerId, msg.input);
    const currentFrame = state.session.getFrame();
    if (changed && msg.frame <= currentFrame) {
      if (!rollbackAndResim(msg.frame)) {
        sendSnapshotToClient(playerId);
      }
    }
    return;
  }
  if (msg.type === 'ack') {
    clientState.lastAckedHostFrame = Math.max(clientState.lastAckedHostFrame, msg.frame);
    return;
  }
  if (msg.type === 'snapshot_request') {
    sendSnapshotToClient(playerId);
  }
}

function sendSnapshotToClient(playerId: number) {
  if (!hostRelay || !netplayState) {
    return;
  }
  const state = game.saveRollbackState();
  if (!state) {
    return;
  }
  hostRelay.sendTo(playerId, {
    type: 'snapshot',
    frame: netplayState.session.getFrame(),
    state,
    stageId: game.stage?.stageId,
    gameSource: game.gameSource,
  });
}

function hostResendFrames(currentFrame: number) {
  if (!hostRelay || !netplayState) {
    return;
  }
  for (const [playerId, clientState] of netplayState.clientStates.entries()) {
    const start = Math.max(clientState.lastAckedHostFrame + 1, currentFrame - netplayState.maxResend + 1);
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
      frame,
      playerId: game.localPlayerId,
      input,
      lastAck: netplayState.lastReceivedHostFrame,
    });
  }
  if (start > end) {
    clientPeer.send({
      type: 'ack',
      playerId: game.localPlayerId,
      frame: netplayState.lastReceivedHostFrame,
    });
  }
}

function netplayStep() {
  if (!netplayState) {
    return;
  }
  const state = netplayState;
  const session = state.session;
  const currentFrame = session.getFrame();
  let targetFrame = currentFrame;
  if (state.role === 'client') {
    targetFrame = Math.max(state.lastReceivedHostFrame, currentFrame);
  }
  const drift = targetFrame - currentFrame;
  if (state.role === 'client' && drift < -2) {
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
        requestSnapshot('mismatch');
      }
    }
  if (state.role === 'host') {
    const bundleInputs: Record<number, QuantizedInput> = {};
    for (const [playerId, input] of inputs.entries()) {
      bundleInputs[playerId] = input;
    }
    state.hostFrameBuffer.set(frame, {
      type: 'frame',
      frame,
      inputs: bundleInputs,
      hash,
    });
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
  if (!game.stageRuntime || game.loadingStage) {
    game.update(0);
    return;
  }
  netplayAccumulator = Math.min(netplayAccumulator + dtSeconds, game.fixedStep * NETPLAY_MAX_FRAME_DELTA);
  const state = netplayState;
  const session = state.session;
  const currentFrame = session.getFrame();
  let targetFrame = currentFrame;
  if (state.role === 'client') {
    targetFrame = Math.max(state.lastReceivedHostFrame, currentFrame);
  }
  const drift = targetFrame - currentFrame;
  if (state.role === 'client' && drift < -2) {
    clientSendInputBuffer(currentFrame);
    return;
  }
  let ticks = Math.floor(netplayAccumulator / game.fixedStep);
  if (ticks <= 0 && drift > 2) {
    ticks = 1;
  }
  if (drift > 4) {
    ticks = Math.min(3, Math.max(1, ticks + 1));
  }
  for (let i = 0; i < ticks; i += 1) {
    netplayStep();
    netplayAccumulator -= game.fixedStep;
  }
  game.accumulator = Math.max(0, Math.min(game.fixedStep, netplayAccumulator));
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
    for (const room of rooms) {
      const item = document.createElement('div');
      item.className = 'lobby-item';
      const label = document.createElement('span');
      label.textContent = `${room.courseId} • host ${room.hostId}`;
      const join = document.createElement('button');
      join.className = 'ghost compact';
      join.type = 'button';
      join.textContent = 'Join';
      join.addEventListener('click', async () => {
        await joinRoom(room.roomId);
      });
      item.append(label, join);
      lobbyList.appendChild(item);
    }
    lobbyStatus.textContent = `Lobby: ${rooms.length} room(s)`;
  } catch (err) {
    console.error(err);
    lobbyStatus.textContent = 'Lobby: failed';
  }
}

async function createRoom() {
  if (!lobbyClient || !lobbyStatus) {
    return;
  }
  const isPublic = lobbyPublicCheckbox?.checked ?? true;
  const hostId = game.localPlayerId ?? 0;
  const room = await lobbyClient.createRoom({
    isPublic,
    hostId,
    courseId: 'smb1-main',
    settings: { maxPlayers: 8, collisionEnabled: true },
  });
  lobbyRoom = room;
  lobbyStatus.textContent = `Lobby: hosting ${room.roomCode ?? room.roomId}`;
  startHost(room);
}

async function joinRoom(roomId: string) {
  if (!lobbyClient || !lobbyStatus) {
    return;
  }
  const room = await lobbyClient.joinRoom({ roomId });
  lobbyRoom = room;
  lobbyStatus.textContent = `Lobby: joining ${room.roomCode ?? room.roomId}`;
  startClient(room);
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
  const room = await lobbyClient.joinRoom({ roomCode: code });
  lobbyRoom = room;
  lobbyStatus.textContent = `Lobby: joining ${room.roomCode ?? room.roomId}`;
  startClient(room);
}

async function leaveRoom() {
  if (!lobbyClient) {
    resetNetplayConnections();
    return;
  }
  const roomId = lobbyRoom?.roomId;
  const wasHost = netplayState?.role === 'host';
  resetNetplayConnections();
  if (roomId && wasHost) {
    try {
      await lobbyClient.closeRoom(roomId);
    } catch {
      // Ignore.
    }
  }
  if (lobbyStatus) {
    lobbyStatus.textContent = 'Lobby: idle';
  }
}

function startHost(room: LobbyRoom) {
  if (!lobbyClient) {
    return;
  }
  netplayEnabled = true;
  ensureNetplayState('host');
  game.setLocalPlayerId(room.hostId);
  game.maxPlayers = room.settings.maxPlayers;
  game.playerCollisionEnabled = room.settings.collisionEnabled;
  hostRelay = new HostRelay((playerId, msg) => {
    handleClientMessage(playerId, msg);
  });
  hostRelay.hostId = room.hostId;
  hostRelay.onConnect = (playerId) => {
    const state = netplayState;
    if (!state) {
      return;
    }
    if (!state.clientStates.has(playerId)) {
      state.clientStates.set(playerId, { lastAckedHostFrame: -1, lastAckedClientInput: -1 });
    }
    game.addPlayer(playerId, { spectator: false });
    const player = game.players.find((p) => p.id === playerId);
    const pendingSpawn = !!player?.pendingSpawn;
    for (const existing of game.players) {
      hostRelay?.sendTo(playerId, {
        type: 'player_join',
        playerId: existing.id,
        spectator: existing.isSpectator,
        pendingSpawn: existing.pendingSpawn,
      });
    }
    hostRelay?.broadcast({ type: 'player_join', playerId, spectator: false, pendingSpawn });
    hostRelay?.sendTo(playerId, { type: 'room_update', room });
    if (state.currentCourse && state.currentGameSource) {
      hostRelay?.sendTo(playerId, {
        type: 'start',
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
    hostRelay?.broadcast({ type: 'player_leave', playerId });
    updateLobbyUi();
  };
  lobbySignal?.close();
  lobbySignal = lobbyClient.openSignal(room.roomId, room.hostId, async (msg) => {
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
    lobbyStatus!.textContent = 'Lobby: disconnected';
    resetNetplayConnections();
  });
  hostRelay.onSignal = (signal) => lobbySignal?.send(signal);
  startLobbyHeartbeat(room.roomId);
  lobbyStatus!.textContent = `Lobby: hosting ${room.roomCode ?? room.roomId}`;
  updateLobbyUi();
}

async function startClient(room: LobbyRoom) {
  if (!lobbyClient) {
    return;
  }
  netplayEnabled = true;
  ensureNetplayState('client');
  const playerId = createNetplayId();
  game.setLocalPlayerId(playerId);
  game.maxPlayers = room.settings.maxPlayers;
  game.playerCollisionEnabled = room.settings.collisionEnabled;
  game.addPlayer(room.hostId, { spectator: false });
  clientPeer = new ClientPeer((msg) => {
    handleHostMessage(msg);
  });
  clientPeer.playerId = playerId;
  clientPeer.hostId = room.hostId;
  await clientPeer.createConnection();
  lobbySignal?.close();
  lobbySignal = lobbyClient.openSignal(room.roomId, playerId, async (msg) => {
    if (msg.to !== playerId) {
      return;
    }
    await clientPeer?.handleSignal(msg.payload);
  }, () => {
    lobbyStatus!.textContent = 'Lobby: disconnected';
    resetNetplayConnections();
  });
  clientPeer.onSignal = (signal) => lobbySignal?.send(signal);
  clientPeer.onDisconnect = () => {
    lobbyStatus!.textContent = 'Lobby: disconnected';
    resetNetplayConnections();
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

function isOverlayPanelNearBottom() {
  if (!overlayPanel) {
    return false;
  }
  const buffer = 24;
  return overlayPanel.scrollTop + overlayPanel.clientHeight >= overlayPanel.scrollHeight - buffer;
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

overlayPanel?.addEventListener('scroll', () => {
  syncTouchPreviewVisibility();
});

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

startButton.addEventListener('click', () => {
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
    hostRelay?.broadcast({
      type: 'start',
      gameSource: activeGameSource,
      course: difficulty,
      stageBasePath: getStageBasePath(activeGameSource),
    });
  }
  startStage(difficulty).catch((error) => {
    if (hudStatus) {
      hudStatus.textContent = 'Failed to load stage.';
    }
    console.error(error);
  });
});

resumeButton.addEventListener('click', () => {
  paused = false;
  void audio.resume();
  game.resume();
});

gyroRecalibrateButton?.addEventListener('click', () => {
  game.input?.recalibrateGyro?.();
});

mobileMenuButton?.addEventListener('click', () => {
  paused = true;
  game.pause();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    paused = true;
    game.pause();
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
if (lobbyClient) {
  void refreshLobbyList();
}

requestAnimationFrame(renderFrame);
