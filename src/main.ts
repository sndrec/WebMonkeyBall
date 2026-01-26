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
import { parseStagedefLz } from './noclip/SuperMonkeyBall/Stagedef.js';
import { StageId, STAGE_INFO_MAP } from './noclip/SuperMonkeyBall/StageInfo.js';
import type { StageData } from './noclip/SuperMonkeyBall/World.js';
import { convertSmb2StageDef, getMb2wsStageInfo, getSmb2StageInfo } from './smb2_render.js';
import { HudRenderer } from './hud.js';

function clamp(value: number, min: number, max: number) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

const STAGE_BASE_PATH = STAGE_BASE_PATHS[GAME_SOURCES.SMB1];
const NAOMI_STAGE_IDS = new Set([
  10, 19, 20, 30, 49, 50, 60, 70, 80, 92, 96, 97, 98, 99, 100, 114, 115, 116, 117, 118, 119, 120,
]);

function isNaomiStage(stageId: number): boolean {
  return NAOMI_STAGE_IDS.has(stageId);
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const hudCanvas = document.getElementById('hud-canvas') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLElement;
const stageFade = document.getElementById('stage-fade') as HTMLElement;
const mobileMenuButton = document.getElementById('mobile-menu-button') as HTMLButtonElement | null;
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
const gyroSensitivityInput = document.getElementById('gyro-sensitivity') as HTMLInputElement | null;
const gyroSensitivityValue = document.getElementById('gyro-sensitivity-value') as HTMLOutputElement | null;
const joystickSizeInput = document.getElementById('joystick-size') as HTMLInputElement | null;
const joystickSizeValue = document.getElementById('joystick-size-value') as HTMLOutputElement | null;
const inputFalloffInput = document.getElementById('input-falloff') as HTMLInputElement | null;
const inputFalloffValue = document.getElementById('input-falloff-value') as HTMLOutputElement | null;
const inputFalloffCurveWrap = document.getElementById('input-falloff-curve-wrap') as HTMLElement | null;
const inputFalloffPath = document.getElementById('input-falloff-path') as SVGPathElement | null;
const startButton = document.getElementById('start') as HTMLButtonElement;
const resumeButton = document.getElementById('resume') as HTMLButtonElement;
const difficultySelect = document.getElementById('difficulty') as HTMLSelectElement;
const smb1StageSelect = document.getElementById('smb1-stage') as HTMLSelectElement;
const gameSourceSelect = document.getElementById('game-source') as HTMLSelectElement;
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

const hasTouch = ('ontouchstart' in window) || ((navigator.maxTouchPoints ?? 0) > 0);

function updateMobileMenuButtonVisibility() {
  if (!mobileMenuButton) {
    return;
  }
  const shouldShow = hasTouch && overlay.classList.contains('hidden') && running;
  mobileMenuButton.classList.toggle('hidden', !shouldShow);
}

function setOverlayVisible(visible: boolean) {
  overlay.classList.toggle('hidden', !visible);
  canvas.style.pointerEvents = visible ? 'none' : 'auto';
  document.body.classList.toggle('gameplay-active', !visible);
  updateMobileMenuButtonVisibility();
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
  const width = Math.floor(canvasElem.clientWidth * window.devicePixelRatio);
  const height = Math.floor(canvasElem.clientHeight * window.devicePixelRatio);
  if (canvasElem.width !== width || canvasElem.height !== height) {
    canvasElem.width = width;
    canvasElem.height = height;
  }
}

async function fetchSlice(path: string): Promise<ArrayBufferSlice> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  return new ArrayBufferSlice(buffer);
}

async function loadRenderStage(stageId: number): Promise<StageData> {
  const stageIdStr = String(stageId).padStart(3, '0');
  const stageInfo = STAGE_INFO_MAP.get(stageId as StageId);
  if (!stageInfo) {
    throw new Error(`Missing StageInfo for stage ${stageId}`);
  }

  const stagedefPath = `${STAGE_BASE_PATH}/st${stageIdStr}/STAGE${stageIdStr}.lz`;
  const stageGmaPath = `${STAGE_BASE_PATH}/st${stageIdStr}/st${stageIdStr}.gma`;
  const stageTplPath = `${STAGE_BASE_PATH}/st${stageIdStr}/st${stageIdStr}.tpl`;

  const commonGmaPath = `${STAGE_BASE_PATH}/init/common.gma`;
  const commonTplPath = `${STAGE_BASE_PATH}/init/common.tpl`;
  const commonNlPath = `${STAGE_BASE_PATH}/init/common_p.lz`;
  const commonNlTplPath = `${STAGE_BASE_PATH}/init/common.lz`;

  const bgName = stageInfo.bgInfo.fileName;
  const bgGmaPath = `${STAGE_BASE_PATH}/bg/${bgName}.gma`;
  const bgTplPath = `${STAGE_BASE_PATH}/bg/${bgName}.tpl`;
  const isNaomi = isNaomiStage(stageId);
  const stageNlObjPath = isNaomi ? `${STAGE_BASE_PATH}/st${stageIdStr}/st${stageIdStr}_p.lz` : null;
  const stageNlTplPath = isNaomi ? `${STAGE_BASE_PATH}/st${stageIdStr}/st${stageIdStr}.lz` : null;

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

  const stageBasePath = STAGE_BASE_PATHS[gameSource] ?? STAGE_BASE_PATHS[GAME_SOURCES.SMB2];
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
  goalBags: null,
  goalTapes: null,
  confetti: null,
  effects: null,
  switches: null,
  stageTilt: null,
};

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

function getSmb2LikeChallengeOrder(gameSource: GameSource) {
  return gameSource === GAME_SOURCES.MB2WS ? MB2WS_CHALLENGE_ORDER : SMB2_CHALLENGE_ORDER;
}

function getSmb2LikeStoryOrder(gameSource: GameSource) {
  return gameSource === GAME_SOURCES.MB2WS ? MB2WS_STORY_ORDER : SMB2_STORY_ORDER;
}

function updateSmb2ChallengeStages() {
  if (!smb2ChallengeSelect || !smb2ChallengeStageSelect) {
    return;
  }
  const gameSource = (gameSourceSelect?.value as GameSource) ?? GAME_SOURCES.SMB1;
  const difficulty = smb2ChallengeSelect.value as Smb2ChallengeDifficulty | Mb2wsChallengeDifficulty;
  const stages = getSmb2LikeChallengeOrder(gameSource)[difficulty] ?? [];
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
  const gameSource = (gameSourceSelect?.value as GameSource) ?? GAME_SOURCES.SMB1;
  const storyOrder = getSmb2LikeStoryOrder(gameSource);
  const worldOptions = storyOrder.map((_, index) => ({
    value: String(index + 1),
    label: `World ${index + 1}`,
  }));
  const stageOptions = storyOrder[0].map((_, index) => ({
    value: String(index + 1),
    label: `Stage ${index + 1}`,
  }));
  setSelectOptions(smb2StoryWorldSelect, worldOptions);
  setSelectOptions(smb2StoryStageSelect, stageOptions);
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
  const gameSource = (gameSourceSelect?.value as GameSource) ?? GAME_SOURCES.SMB1;
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

  game.setGameSource(activeGameSource);
  currentSmb2LikeMode =
    activeGameSource !== GAME_SOURCES.SMB1 && hasSmb2LikeMode(difficulty) ? difficulty.mode : null;
  void audio.resume();
  await game.start(difficulty);
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
    return;
  }
  const mode = controlModeSelect.value;
  gyroSettings?.classList.toggle('hidden', mode !== 'gyro');
  touchSettings?.classList.toggle('hidden', mode !== 'touch');
  const showFalloff = mode === 'touch' || hasController;
  inputFalloffBlock?.classList.toggle('hidden', !showFalloff);
  inputFalloffCurveWrap?.classList.toggle('hidden', mode === 'gyro');
}

function maybeUpdateControlModeSettings(now: number) {
  if (now - lastControlModeSettingsCheck < 1000) {
    return;
  }
  lastControlModeSettingsCheck = now;
  updateControlModeSettingsVisibility();
}

function renderFrame(now: number) {
  requestAnimationFrame(renderFrame);

  updateGyroHelper();
  maybeUpdateControlModeSettings(now);

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

  game.update(dtSeconds);

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

updateSmb2ChallengeStages();
updateSmb2StoryOptions();
updateSmb1Stages();
updateGameSourceFields();

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
  1.5,
  (value) => value.toFixed(2).replace(/\.00$/, ''),
  (value) => {
    game.input?.setInputFalloff?.(value);
    updateFalloffCurve(value);
  },
);

updateControlModeSettingsVisibility();
updateFalloffCurve(game.input?.inputFalloff ?? 1.5);

smb2ModeSelect?.addEventListener('change', () => {
  updateSmb2ModeFields();
});

smb2ChallengeSelect?.addEventListener('change', () => {
  updateSmb2ChallengeStages();
});

difficultySelect?.addEventListener('change', () => {
  updateSmb1Stages();
});

gameSourceSelect?.addEventListener('change', () => {
  updateGameSourceFields();
});

controlModeSelect?.addEventListener('change', () => {
  updateControlModeSettingsVisibility();
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
  activeGameSource = (gameSourceSelect?.value as GameSource) || GAME_SOURCES.SMB1;
  const difficulty = activeGameSource === GAME_SOURCES.SMB2
    ? buildSmb2CourseConfig()
    : activeGameSource === GAME_SOURCES.MB2WS
      ? buildMb2wsCourseConfig()
      : buildSmb1CourseConfig();
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

requestAnimationFrame(renderFrame);
