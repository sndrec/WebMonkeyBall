import { mat4, vec3, vec4 } from 'gl-matrix';
import { Game, type MultiplayerGameMode } from './game.js';
import { AudioManager } from './audio.js';
import { GAME_SOURCES, S16_TO_RAD, STAGE_BASE_PATHS, type GameSource } from './shared/constants/index.js';
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
import { createSwapChainForWebGL2 } from './noclip/gfx/platform/GfxPlatformWebGL2.js';
import { GameplaySyncState, Renderer } from './noclip/Render.js';
import { LobbyClient, HostRelay, ClientPeer } from './netplay.js';
import { LeaderboardsClient, type CourseReplayData, type CourseReplaySegment } from './leaderboards.js';
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
import { StageId, STAGE_INFO_MAP } from './noclip/SuperMonkeyBall/StageInfo.js';
import type { StageData } from './noclip/SuperMonkeyBall/World.js';
import { getMb2wsStageInfo, getSmb2StageInfo } from './smb2_render.js';
import { HudRenderer } from './hud.js';
import { createDefaultModRegistry } from './mods/index.js';
import { runAppBootstrap } from './app/bootstrap.js';
import { LeaderboardsUiController } from './app/leaderboards/ui.js';
import { ChatUiController } from './app/netplay/chat_ui.js';
import { createNetplayDebugOverlay } from './app/netplay/debug_overlay.js';
import { LobbyBrowserController } from './app/netplay/lobby_browser.js';
import { bindLobbyEventHandlers } from './app/netplay/lobby_bindings.js';
import { PeerSessionController } from './app/netplay/peer_session.js';
import {
  formatCourseMeta,
  formatGameSourceLabel,
  generateAlias,
  titleCaseLabel,
} from './app/netplay/presence_format.js';
import {
  getAvatarValidationPromise,
  loadLocalProfile,
  loadPrivacySettings,
  sanitizeChatText,
  sanitizeLobbyName,
  sanitizeLobbyNameDraft,
  sanitizeProfile,
  sanitizeProfileName,
  saveLocalProfile,
  savePrivacySettings,
  validateAvatarFile,
} from './app/netplay/profile_utils.js';
import { PackLoader } from './app/packs/pack_loader.js';
import { PackSelectionController } from './app/packs/pack_selection.js';
import { ReplayController } from './app/replay/controller.js';
import { CourseSelectionController } from './app/gameplay/course_selection.js';
import { initRendererGfx, prewarmConfettiRenderer as prewarmConfettiRenderResources, type ViewerInputState } from './app/render/boot.js';
import { startRenderLoop } from './app/render/frame_loop.js';
import { StageLoader } from './app/render/stage_loader.js';
import { bindUiEventHandlers } from './app/ui/event_bindings.js';
import { InputControlsController, bindRangeControl, bindVolumeControl } from './app/ui/input_controls.js';
import { bindMainUiControls } from './app/ui/main_bindings.js';
import { MenuFlowController, type MenuPanel } from './app/ui/menu_flow.js';
import {
  fetchPackSlice,
  prefetchPackSlice,
  getActivePack,
  getPackCourseData,
  hasPackForGameSource,
  loadPackFromFileList,
  loadPackFromUrl,
  loadPackFromZipFile,
} from './pack.js';
import type { LoadedPack } from './pack.js';

const modRegistry = createDefaultModRegistry();
void modRegistry;

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

const NAOMI_STAGE_IDS = new Set([
  10, 19, 20, 30, 49, 50, 60, 70, 80, 92, 96, 97, 98, 99, 100, 114, 115, 116, 117, 118, 119, 120,
]);

function isNaomiStage(stageId: number): boolean {
  return NAOMI_STAGE_IDS.has(stageId);
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
const netplayDebugOverlay = createNetplayDebugOverlay(document.body);
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
const packSelection = new PackSelectionController({ gameSourceSelect, packStatus });
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
let inputControls: InputControlsController | null = null;

function getStageBasePath(gameSource: GameSource): string {
  return packSelection.getStageBasePath(gameSource);
}

function resolveSelectedGameSource() {
  return packSelection.resolveSelectedGameSource();
}

function updatePackUi() {
  packSelection.refreshUi();
}

function syncPackEnabled() {
  packSelection.syncEnabled();
}

const courseSelection = new CourseSelectionController({
  difficultySelect,
  smb1StageSelect,
  smb1Fields,
  smb2Fields,
  smb2ModeSelect,
  smb2ChallengeSelect,
  smb2ChallengeStageSelect,
  smb2StoryWorldSelect,
  smb2StoryStageSelect,
  defaultChallengeOptions,
  resolveSelectedGameSource,
  hasPackForGameSource,
  getPackCourseData,
});

const stageLoader = new StageLoader({
  fetchSlice,
  getStageBasePath,
  isNaomiStage,
});

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
  inputControls?.syncTouchPreviewVisibility();
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

async function fetchSlice(path: string): Promise<ArrayBufferSlice> {
  return fetchPackSlice(path);
}

async function initPackFromQuery() {
  await packLoader.initFromQuery();
}

async function applyLoadedPack(pack: LoadedPack) {
  packSelection.registerLoadedPack(pack);
  void refreshLeaderboardAllowlist(true);
  updatePackUi();
  updateSmb2ChallengeStages();
  updateSmb2StoryOptions();
  updateSmb1Stages();
  updateGameSourceFields();
}

const packLoader = new PackLoader({
  loadPackFromUrl,
  loadPackFromZipFile,
  loadPackFromFileList,
  applyLoadedPack,
  setHudStatus: (message) => {
    if (hudStatus) {
      hudStatus.textContent = message;
    }
  },
});

async function loadRenderStage(stageId: number): Promise<StageData> {
  return stageLoader.loadSmb1(stageId);
}

async function loadRenderStageSmb2(stageId: number, stage: any, gameSource: GameSource): Promise<StageData> {
  return stageLoader.loadSmb2Like(stageId, stage, gameSource);
}

let renderer: Renderer | null = null;
let gfxDevice: GfxDevice | null = null;
let swapChain: ReturnType<typeof createSwapChainForWebGL2> | null = null;
let camera: Camera | null = null;
let viewerInput: ViewerInputState | null = null;

const perfEnabled = true;
const audio = new AudioManager();
const game = new Game({
  audio,
  modHooks: modRegistry.listHooks(),
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
        netplayState.currentGameMode = normalizeMultiplayerGameMode(
          netplayState.currentGameMode ?? game.getMultiplayerGameMode(),
        );
        netplayState.stageSeq += 1;
        promotePendingSpawns(netplayState.stageSeq);
        hostRelay.broadcast({
          type: 'start',
          stageSeq: netplayState.stageSeq,
          gameSource: activeGameSource,
          gameMode: netplayState.currentGameMode,
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
  onStageGoal: (info) => {
    handleStageGoal(info);
  },
  onStageFail: (info) => {
    handleStageFail(info);
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

inputControls = new InputControlsController({
  game,
  elements: {
    controlModeField,
    controlModeSelect,
    controlModeSettings,
    gyroSettings,
    touchSettings,
    inputFalloffBlock,
    inputFalloffCurveWrap,
    inputFalloffPath,
    inputPreview,
    inputRawDot,
    inputProcessedDot,
    gamepadCalibrationBlock,
    gamepadCalibrationOverlay,
    gamepadCalibrationMap,
    gamepadCalibrationCtx,
    gyroHelper,
    gyroHelperFrame,
    gyroHelperDevice,
    overlay,
  },
  isOverlayPanelNearBottom,
});

const replayController = new ReplayController({
  game,
  audio,
  replayStatus,
  replaySaveButton,
  replayLoadButton,
  replayFileInput,
  resumeButton,
  hudStatus,
  gameSourceSelect,
  setOverlayVisible,
  updateGameSourceFields,
  setActiveGameSource: (source) => {
    activeGameSource = source;
  },
  setCurrentSmb2LikeMode: (mode) => {
    currentSmb2LikeMode = mode;
  },
  getStageBasePath,
});

const lobbyBrowser = new LobbyBrowserController({
  lobbyClient,
  lobbyStatus,
  lobbyList,
  multiplayerOnlineCount,
  lobbyPublicCheckbox,
  lobbyCodeInput,
  getLobbyRoom: () => lobbyRoom,
  setLobbyRoom: (room) => {
    lobbyRoom = room;
  },
  getLobbySelfId: () => lobbySelfId,
  setLobbySelfId: (id) => {
    lobbySelfId = id;
  },
  getLobbyPlayerToken: () => lobbyPlayerToken,
  setLobbyPlayerToken: (token) => {
    lobbyPlayerToken = token;
  },
  getLobbyHostToken: () => lobbyHostToken,
  setLobbyHostToken: (token) => {
    lobbyHostToken = token;
  },
  getNetplayRole: () => netplayState?.role ?? null,
  getLobbySelectedGameMode,
  getRoomGameMode,
  formatMultiplayerGameModeLabel,
  formatGameSourceLabel,
  getRoomDisplayName,
  buildRoomMetaForCreation,
  destroySingleplayerForNetplay,
  startHost,
  startClient,
  resetNetplayConnections: () => {
    resetNetplayConnections();
  },
  clearLobbySignalRetry,
  setLobbySignalShouldReconnect: (enabled) => {
    lobbySignalShouldReconnect = enabled;
    if (!enabled) {
      lobbySignalReconnectFn = null;
    }
  },
});

const peerSession = new PeerSessionController({
  lobbyClient,
  lobbyStatus,
  game,
  chainedMaxPlayers: CHAINED_MAX_PLAYERS,
  getLobbyRoom: () => lobbyRoom,
  getLobbyHostToken: () => lobbyHostToken,
  getLobbySignalShouldReconnect: () => lobbySignalShouldReconnect,
  setLobbySignalShouldReconnect: (enabled) => {
    lobbySignalShouldReconnect = enabled;
  },
  getLobbySignal: () => lobbySignal,
  setLobbySignal: (signal) => {
    lobbySignal = signal;
  },
  getLobbySignalReconnectFn: () => lobbySignalReconnectFn,
  setLobbySignalReconnectFn: (fn) => {
    lobbySignalReconnectFn = fn;
  },
  clearLobbySignalRetry,
  scheduleLobbySignalReconnect,
  ensureNetplayState,
  getNetplayState: () => netplayState,
  setNetplayEnabled: (enabled) => {
    netplayEnabled = enabled;
  },
  getRoomGameMode,
  applyLocalProfileToSession,
  normalizeMultiplayerGameMode,
  shouldJoinAsSpectator,
  markPlayerPendingSpawn,
  profileFallbackForPlayer,
  lobbyProfiles,
  pendingAvatarByPlayer,
  pendingSpawnStageSeq,
  maybeSendStageSync,
  getStageBasePath,
  sendSnapshotToClient,
  broadcastRoomUpdate,
  sendLobbyHeartbeat,
  updateLobbyUi,
  startLobbyHeartbeat,
  broadcastLocalProfile,
  handleClientMessage,
  handleHostMessage,
  handleHostDisconnect,
  getHostRelay: () => hostRelay,
  setHostRelay: (relay) => {
    hostRelay = relay;
  },
  getClientPeer: () => clientPeer,
  setClientPeer: (peer) => {
    clientPeer = peer;
  },
});

let running = false;
let paused = false;
let lastTime = performance.now();
let lastRenderTime = lastTime;
let lastHudTime = lastTime;
let stageLoadToken = 0;
let renderReady = false;
let activeGameSource: GameSource = GAME_SOURCES.SMB1;
let interpolationEnabled = true;
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

type LeaderboardSession = {
  active: boolean;
  eligible: boolean;
  gameSource: GameSource;
  packId: string | null;
  courseId: string;
  mode: 'story' | 'challenge' | 'smb1';
  courseConfig: any;
  warpUsed: boolean;
  courseTimerFrames: number;
  penaltyFrames: number;
  retryCount: number;
  stageScoreStart: number;
  segments: CourseReplaySegment[];
  hasSkipped: boolean;
};

const lobbyBaseUrl = (window as any).LOBBY_URL ?? "";
const lobbyClient = lobbyBaseUrl ? new LobbyClient(lobbyBaseUrl) : null;
const leaderboardBaseUrl = (window as any).LEADERBOARD_URL ?? lobbyBaseUrl;
const leaderboardsClient = leaderboardBaseUrl ? new LeaderboardsClient(leaderboardBaseUrl) : null;

const multiplayerOpenButton = document.getElementById('open-multiplayer') as HTMLButtonElement | null;
const multiplayerBackButton = document.getElementById('multiplayer-back') as HTMLButtonElement | null;
const levelSelectOpenButton = document.getElementById('open-level-select') as HTMLButtonElement | null;
const levelSelectBackButton = document.getElementById('level-select-back') as HTMLButtonElement | null;
const leaderboardsOpenButton = document.getElementById('open-leaderboards') as HTMLButtonElement | null;
const leaderboardsBackButton = document.getElementById('leaderboards-back') as HTMLButtonElement | null;
const settingsOpenButton = document.getElementById('open-settings') as HTMLButtonElement | null;
const settingsBackButton = document.getElementById('settings-back') as HTMLButtonElement | null;
const settingsTabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-settings-tab]'));
const settingsTabPanels = Array.from(document.querySelectorAll<HTMLElement>('[data-settings-panel]'));
const leaderboardsMenuPanel = document.getElementById('leaderboards-menu') as HTMLElement | null;
const leaderboardTypeSelect = document.getElementById('leaderboard-type') as HTMLSelectElement | null;
const leaderboardGoalField = document.getElementById('leaderboard-goal-field') as HTMLElement | null;
const leaderboardGoalSelect = document.getElementById('leaderboard-goal') as HTMLSelectElement | null;
const leaderboardMetricField = document.getElementById('leaderboard-metric-field') as HTMLElement | null;
const leaderboardMetricSelect = document.getElementById('leaderboard-metric') as HTMLSelectElement | null;
const leaderboardWarpField = document.getElementById('leaderboard-warp-field') as HTMLElement | null;
const leaderboardWarpSelect = document.getElementById('leaderboard-warp') as HTMLSelectElement | null;
const leaderboardRefreshButton = document.getElementById('leaderboard-refresh') as HTMLButtonElement | null;
const leaderboardStatus = document.getElementById('leaderboard-status') as HTMLElement | null;
const leaderboardList = document.getElementById('leaderboard-list') as HTMLElement | null;
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
const lobbyGameModeSelect = document.getElementById('lobby-gamemode') as HTMLSelectElement | null;
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

const PROFILE_BROADCAST_COOLDOWN_MS = 1200;
const PROFILE_REMOTE_COOLDOWN_MS = 1500;
const LOBBY_NAME_UPDATE_COOLDOWN_MS = 1200;
const CHAT_MAX_MESSAGES = 160;
const CHAT_SEND_COOLDOWN_MS = 800;
const CHAT_INGAME_VISIBLE_MS = 5000;
const CHAT_INGAME_FADE_MS = 1000;

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
let leaderboardAllowlist: string[] = [];
let leaderboardSession: LeaderboardSession | null = null;
type SettingsTab = 'input' | 'audio' | 'multiplayer';
let settingsReturnMenu: MenuPanel = 'main';
let levelSelectReturnMenu: MenuPanel = 'main';
let activeSettingsTab: SettingsTab = 'input';
let profileBroadcastTimer: number | null = null;
let lastProfileBroadcastMs: number | null = null;
let lobbyNameUpdateTimer: number | null = null;
let lastLobbyNameUpdateMs: number | null = null;
let lastRoomMetaKey: string | null = null;
let lastRoomPlayerCount: number | null = null;
let privacySettings = { hidePlayerNames: false, hideLobbyNames: false };
const avatarValidationCache = new Map<string, Promise<boolean>>();
const profileUpdateThrottle = new Map<number, number>();
type ChatEntry = { id: number; playerId: number; text: string; time: number };
let chatMessages: ChatEntry[] = [];
let chatSeq = 0;
const pendingSpawnStageSeq = new Map<number, number>();
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
const NETPLAY_HOST_MAX_INPUT_ROLLBACK = 16;
const LOBBY_MAX_PLAYERS = 8;
const CHAINED_MAX_PLAYERS = 4;
const MULTIPLAYER_MODE_STANDARD: MultiplayerGameMode = 'standard';
const MULTIPLAYER_MODE_CHAINED: MultiplayerGameMode = 'chained_together';
const NAMEPLATE_OFFSET_SCALE = 1.6;
const STAGE_TILT_SCALE = 0.6;
const NETPLAY_DEBUG_STORAGE_KEY = 'smb_netplay_debug';
const LOBBY_HEARTBEAT_INTERVAL_MS = 15000;
const LOBBY_HEARTBEAT_FALLBACK_MS = 12000;

function normalizeMultiplayerGameMode(mode: unknown): MultiplayerGameMode {
  return mode === MULTIPLAYER_MODE_CHAINED ? MULTIPLAYER_MODE_CHAINED : MULTIPLAYER_MODE_STANDARD;
}

function formatMultiplayerGameModeLabel(mode: MultiplayerGameMode) {
  return mode === MULTIPLAYER_MODE_CHAINED ? 'Chained Together' : 'Standard';
}

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
  currentGameMode: MultiplayerGameMode | null;
  awaitingSnapshot: boolean;
  pendingHostRollbackFrame: number | null;
  pendingHostRollbackPlayers: Set<number>;
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
    currentGameMode: null,
    awaitingSnapshot: false,
    pendingHostRollbackFrame: null,
    pendingHostRollbackPlayers: new Set(),
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
  netplayState.pendingHostRollbackFrame = null;
  netplayState.pendingHostRollbackPlayers.clear();
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
  const baseHash = hashSimState(balls, worlds, game.stageRuntime);
  return (baseHash ^ game.getMultiplayerDeterminismHash()) >>> 0;
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

function getAvatarValidationCached(dataUrl: string): Promise<boolean> {
  return getAvatarValidationPromise(avatarValidationCache, dataUrl);
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

const chatUi = new ChatUiController({
  lobbyChatList,
  ingameChatList,
  ingameChatWrap,
  ingameChatInputRow,
  ingameChatInput,
  getDisplayName: (playerId) => {
    const profile = lobbyProfiles.get(playerId) ?? profileFallbackForPlayer(playerId);
    return getPlayerDisplayName(playerId, profile);
  },
  clearKeyboardState: () => {
    game.input?.clearKeyboardState?.();
  },
});

function updateChatUi() {
  chatUi.updateChatUi(chatMessages, CHAT_INGAME_VISIBLE_MS, CHAT_INGAME_FADE_MS);
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
  chatUi.setIngameChatOpen(open, chatMessages, CHAT_INGAME_VISIBLE_MS, CHAT_INGAME_FADE_MS);
}

function updateIngameChatVisibility() {
  const overlayVisible = !overlay.classList.contains('hidden');
  chatUi.updateIngameVisibility(
    netplayEnabled,
    running,
    overlayVisible,
    chatMessages,
    CHAT_INGAME_VISIBLE_MS,
    CHAT_INGAME_FADE_MS,
  );
  ingameChatOpen = chatUi.isIngameChatOpen();
}

function isTextInputElement(el: Element | null) {
  return chatUi.isTextInputElement(el);
}

function blurActiveInput() {
  chatUi.blurActiveInput();
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

function getLobbySelectedGameMode() {
  return normalizeMultiplayerGameMode(lobbyGameModeSelect?.value);
}

function getRoomGameMode(room: RoomInfo | null | undefined) {
  return normalizeMultiplayerGameMode(room?.meta?.gameMode);
}

function getLobbyRoomGameMode() {
  return normalizeMultiplayerGameMode(lobbyRoom?.meta?.gameMode ?? getLobbySelectedGameMode());
}

function getActiveLobbyPlayerCount() {
  return game.players.filter((player) => !player.isSpectator && !player.pendingSpawn).length;
}

function getLobbyStartDisabledReason(isHost: boolean, mode: MultiplayerGameMode) {
  if (!isHost) {
    return 'Waiting for host...';
  }
  if (mode !== MULTIPLAYER_MODE_CHAINED) {
    return '';
  }
  const activePlayers = getActiveLobbyPlayerCount();
  if (activePlayers < 2) {
    return 'Need at least 2 active players';
  }
  if (activePlayers > CHAINED_MAX_PLAYERS) {
    return 'Chained Together supports up to 4 players';
  }
  return '';
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
  const gameMode = normalizeMultiplayerGameMode(netplayState.currentGameMode ?? getLobbySelectedGameMode());
  const roomName = sanitizeLobbyName(lobbyRoomNameInput?.value ?? lobbyRoom?.meta?.roomName ?? '');
  return {
    status,
    gameSource,
    gameMode,
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
  const gameMode = getLobbySelectedGameMode();
  return {
    status: 'lobby',
    gameSource,
    gameMode,
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
  multiplayerBackButton?.classList.toggle('hidden', inLobby);

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
    if (lobbyGameModeSelect) {
      lobbyGameModeSelect.value = MULTIPLAYER_MODE_STANDARD;
      lobbyGameModeSelect.disabled = true;
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
  const playerCount = game.players.length;
  const maxPlayers = lobbyRoom.settings?.maxPlayers ?? game.maxPlayers;
  const isHost = netplayState?.role === 'host';
  const gameMode = getLobbyRoomGameMode();
  game.setMultiplayerGameMode(gameMode);
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
    lobbyRoomStatus.textContent = `${statusLabel} • ${playerCount}/${maxPlayers} players • ${formatMultiplayerGameModeLabel(gameMode)}`;
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
      lobbyStageInfo.textContent = `${sourceLabel} • ${courseLabel}${stageLabel} • ${formatMultiplayerGameModeLabel(gameMode)}`;
    } else {
      lobbyStageInfo.textContent = 'Unknown';
    }
  }

  if (lobbyGameModeSelect) {
    lobbyGameModeSelect.value = gameMode;
    lobbyGameModeSelect.disabled = !isHost;
  }

  if (lobbyMaxPlayersSelect) {
    lobbyMaxPlayersSelect.value = String(maxPlayers);
    for (const option of Array.from(lobbyMaxPlayersSelect.options)) {
      const value = Number(option.value);
      option.disabled = gameMode === MULTIPLAYER_MODE_CHAINED && Number.isFinite(value) && value > CHAINED_MAX_PLAYERS;
    }
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
    const startBlockedReason = getLobbyStartDisabledReason(!!isHost, gameMode);
    lobbyStartButton.classList.remove('hidden');
    lobbyStartButton.disabled = !!startBlockedReason;
    lobbyStartButton.textContent = startBlockedReason || 'Start Match';
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

function getSmb1StageIdByIndex(index: number): number | null {
  const stages = getStageListForDifficulty(difficultySelect?.value ?? 'beginner');
  return stages[index]?.id ?? null;
}

function getSmb2StoryStageId(gameSource: GameSource, worldIndex: number, stageIndex: number): number | null {
  const storyOrder = getSmb2LikeStoryOrder(gameSource);
  const stageList = storyOrder[worldIndex] ?? [];
  return stageList[stageIndex] ?? null;
}

function getSmb2ChallengeStageId(
  gameSource: GameSource,
  difficulty: string,
  stageIndex: number,
): number | null {
  const order = getSmb2LikeChallengeOrder(gameSource);
  const stages = order[difficulty as Smb2ChallengeDifficulty | Mb2wsChallengeDifficulty] ?? [];
  return stages[stageIndex] ?? null;
}

const leaderboardsUi = new LeaderboardsUiController({
  leaderboardsClient,
  leaderboardTypeSelect,
  leaderboardGoalField,
  leaderboardGoalSelect,
  leaderboardMetricField,
  leaderboardMetricSelect,
  leaderboardWarpField,
  leaderboardWarpSelect,
  leaderboardStatus,
  leaderboardList,
  difficultySelect,
  smb1StageSelect,
  smb2ModeSelect,
  smb2StoryWorldSelect,
  smb2StoryStageSelect,
  smb2ChallengeSelect,
  smb2ChallengeStageSelect,
  resolveSelectedGameSource,
  getActivePackId,
  getSmb1StageIdByIndex,
  getSmb2StoryStageId,
  getSmb2ChallengeStageId,
  buildCourseConfig: (gameSource) => {
    if (gameSource === GAME_SOURCES.MB2WS) {
      return buildMb2wsCourseConfig();
    }
    if (gameSource === GAME_SOURCES.SMB2) {
      return buildSmb2CourseConfig();
    }
    return { difficulty: String(difficultySelect?.value ?? 'beginner'), stageIndex: 0 };
  },
  buildCourseId,
  buildCourseMode,
});

function updateLeaderboardsUi() {
  leaderboardsUi.updateUi();
}

async function refreshLeaderboards() {
  await leaderboardsUi.refresh();
}

const menuFlow = new MenuFlowController({
  mainMenuPanel,
  multiplayerLayout,
  multiplayerMenuPanel,
  multiplayerIngameMenuPanel,
  settingsMenuPanel,
  levelSelectMenuPanel,
  leaderboardsMenuPanel,
  onMenuChanged: () => {
    updateLobbyUi();
    inputControls?.syncTouchPreviewVisibility();
  },
  onOpenMultiplayerMenu: () => {
    if (lobbyClient) {
      void refreshLobbyList();
    }
  },
  onOpenSettingsMenu: () => {
    updateSettingsUi();
  },
  onOpenLevelSelectMenu: () => {
    updateLevelSelectUi();
  },
  onOpenLeaderboardsMenu: () => {
    updateLeaderboardsUi();
    void refreshLeaderboards();
  },
  setOverlayVisible,
  isRunning: () => running,
  isNetplayEnabled: () => netplayEnabled,
  onPauseSingleplayer: () => {
    paused = true;
    game.pause();
  },
  onResumeSingleplayer: () => {
    paused = false;
    game.resume();
  },
});

function setActiveMenu(menu: MenuPanel) {
  menuFlow.setActiveMenu(menu);
}

function openSettingsMenu(tab?: SettingsTab) {
  const currentMenu = menuFlow.getActiveMenu();
  if (currentMenu !== 'settings') {
    settingsReturnMenu = currentMenu;
  }
  if (tab) {
    setSettingsTab(tab);
  }
  setActiveMenu('settings');
}

function openLevelSelectMenu(returnMenu?: MenuPanel) {
  const currentMenu = menuFlow.getActiveMenu();
  if (currentMenu !== 'level-select') {
    levelSelectReturnMenu = returnMenu ?? currentMenu;
  }
  setActiveMenu('level-select');
}

function broadcastRoomUpdate() {
  if (!lobbyRoom || netplayState?.role !== 'host') {
    return;
  }
  lobbyRoom.playerCount = game.players.length;
  hostRelay?.broadcast({ type: 'room_update', room: lobbyRoom });
  lastRoomPlayerCount = lobbyRoom.playerCount;
}

function applyLobbySettingsFromInputs() {
  if (!lobbyRoom || netplayState?.role !== 'host') {
    return;
  }
  const mode = getLobbyRoomGameMode();
  const currentPlayers = game.players.length;
  const requestedRaw = lobbyMaxPlayersSelect ? Number(lobbyMaxPlayersSelect.value) : lobbyRoom.settings.maxPlayers;
  const requestedMax = Number.isFinite(requestedRaw) ? requestedRaw : lobbyRoom.settings.maxPlayers;
  const minPlayers = mode === MULTIPLAYER_MODE_CHAINED ? 2 : Math.max(2, currentPlayers);
  const maxPlayersCap = mode === MULTIPLAYER_MODE_CHAINED ? CHAINED_MAX_PLAYERS : LOBBY_MAX_PLAYERS;
  const nextMax = clampInt(requestedMax, minPlayers, maxPlayersCap);
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
  game.setMultiplayerGameMode(mode);
  if (netplayState) {
    netplayState.currentGameMode = mode;
  }
  if (lobbyMaxPlayersSelect) {
    lobbyMaxPlayersSelect.value = String(nextMax);
  }
  broadcastRoomUpdate();
  sendLobbyHeartbeat(performance.now(), true);
  updateLobbyUi();
}

function applyLobbyGameModeFromInputs() {
  if (!lobbyRoom || netplayState?.role !== 'host') {
    return;
  }
  const mode = getLobbySelectedGameMode();
  const maxPlayersCap = mode === MULTIPLAYER_MODE_CHAINED ? CHAINED_MAX_PLAYERS : LOBBY_MAX_PLAYERS;
  const nextMax = clampInt(Math.min(lobbyRoom.settings.maxPlayers, maxPlayersCap), 2, maxPlayersCap);
  lobbyRoom.settings = {
    ...lobbyRoom.settings,
    maxPlayers: nextMax,
  };
  game.maxPlayers = nextMax;
  game.setMultiplayerGameMode(mode);
  if (netplayState) {
    netplayState.currentGameMode = mode;
  }
  const baseMeta = buildRoomMeta() ?? lobbyRoom.meta ?? { status: 'lobby' };
  lobbyRoom.meta = { ...baseMeta, gameMode: mode };
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
  if (!netplayEnabled || !lobbyRoom) {
    return;
  }
  if (lobbyStatus) {
    lobbyStatus.textContent = 'Lobby: host left';
  }
  if (running) {
    resetMatchState();
    endActiveMatch();
    setOverlayVisible(true);
  }
  resetNetplayConnections();
  setActiveMenu('multiplayer');
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
    netplayState.currentGameMode = null;
    netplayState.awaitingSnapshot = false;
  }
  leaderboardSession = null;
  pendingSnapshot = null;
  if (netplayEnabled) {
    resetNetplayForStage();
  }
}

function destroySingleplayerForNetplay() {
  if (!running || netplayEnabled) {
    return;
  }
  resetMatchState();
  endActiveMatch();
  setOverlayVisible(true);
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
  if (netplayState?.role === 'host' && lobbyRoom) {
    const confirmed = window.confirm('Leaving will close this lobby for everyone. Leave anyway?');
    if (!confirmed) {
      return;
    }
  }
  resetMatchState();
  endActiveMatch();
  setOverlayVisible(true);
  setActiveMenu('multiplayer');
  void leaveRoom({ skipConfirm: true });
}

function handleCourseComplete() {
  if (!running) {
    return;
  }
  if (!netplayEnabled && leaderboardsClient && leaderboardSession?.active) {
    const session = leaderboardSession;
    const packAllowed = isPackAllowed(session.packId);
    if (session.eligible && !session.hasSkipped && packAllowed) {
      const totalFrames = session.courseTimerFrames + session.penaltyFrames;
      const playerId = getLeaderboardPlayerId();
      const displayName = localProfile?.name ?? 'Player';
      const warpFlag = session.mode === 'challenge' && session.warpUsed ? 'warped' : 'warpless';
      const courseReplay: CourseReplayData = {
        version: 1,
        gameSource: session.gameSource,
        packId: session.packId ?? undefined,
        course: {
          mode: session.mode,
          difficulty: session.courseConfig?.difficulty,
          worldIndex: session.courseConfig?.worldIndex,
          stageIndex: session.courseConfig?.stageIndex,
        },
        segments: session.segments,
      };
      void leaderboardsClient.submitCourse({
        type: 'course',
        playerId,
        displayName,
        gameSource: session.gameSource,
        courseId: session.courseId,
        mode: session.mode,
        warpFlag,
        value: Math.max(0, Math.trunc(totalFrames)),
        packId: session.packId,
        replay: courseReplay,
        clientMeta: {
          version: 1,
          retries: session.retryCount,
          penaltyFrames: session.penaltyFrames,
        },
      }).catch(() => {});
    }
    leaderboardSession = null;
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
  menuFlow.openMenuOverlay(preferredMenu);
}

function closeMenuOverlay() {
  menuFlow.closeMenuOverlay();
}

localProfile = loadLocalProfile();
updateProfileUi();
privacySettings = loadPrivacySettings();
updatePrivacyUi();
setSettingsTab(activeSettingsTab);
updateChatUi();
void refreshLeaderboardAllowlist();
if (leaderboardsOpenButton) {
  leaderboardsOpenButton.disabled = !leaderboardsClient;
}

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

function resetLocalPlayersAfterNetplay() {
  const localId = game.localPlayerId;
  for (const player of [...game.players]) {
    if (player.id !== localId) {
      game.removePlayer(player.id);
    }
  }
  if (game.localPlayerId !== 0) {
    game.setLocalPlayerId(0);
  }
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
  game.setMultiplayerGameMode(MULTIPLAYER_MODE_STANDARD);
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
    lastRoomMetaKey = null;
    lastRoomPlayerCount = null;
    resetLocalPlayersAfterNetplay();
  }
  pendingSpawnStageSeq.clear();
  updateLobbyUi();
  updateChatUi();
  setIngameChatOpen(false);
}

function shouldJoinAsSpectator() {
  return running && !!game.stageRuntime && !game.loadingStage && game.stageTimerFrames > 0;
}

function markPlayerPendingSpawn(playerId: number, stageSeq: number) {
  const player = game.players.find((entry) => entry.id === playerId);
  if (!player) {
    return;
  }
  player.pendingSpawn = true;
  player.isSpectator = true;
  pendingSpawnStageSeq.set(playerId, stageSeq);
  if (player.id === game.localPlayerId) {
    game.enterLocalSpectatorFreeFly();
  }
}

function promotePendingSpawns(stageSeq: number) {
  if (pendingSpawnStageSeq.size === 0) {
    return;
  }
  for (const [playerId, joinStageSeq] of pendingSpawnStageSeq) {
    if (joinStageSeq >= stageSeq) {
      continue;
    }
    const player = game.players.find((entry) => entry.id === playerId);
    if (player) {
      player.pendingSpawn = false;
      player.isSpectator = false;
      player.freeFly = false;
    }
    pendingSpawnStageSeq.delete(playerId);
  }
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
    const playerCount = game.players.length;
    lobbyRoom.playerCount = playerCount;
    if (playerCount !== lastRoomPlayerCount) {
      lastRoomPlayerCount = playerCount;
      broadcastRoomUpdate();
    }
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
  const state = initRendererGfx(canvas);
  swapChain = state.swapChain;
  gfxDevice = state.gfxDevice;
  camera = state.camera;
  viewerInput = state.viewerInput;
}

function prewarmConfettiRenderer() {
  prewarmConfettiRenderResources(
    canvas,
    renderer,
    gfxDevice,
    swapChain,
    viewerInput,
    resizeCanvasToDisplaySize,
  );
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
    const localPlayer = game.getLocalPlayer();
    if (localPlayer?.pendingSpawn && localPlayer.isSpectator) {
      game.enterLocalSpectatorFreeFly();
    }
    preloadNextStages();
    if (leaderboardSession?.active) {
      leaderboardSession.stageScoreStart = Math.max(0, Math.trunc(game.score ?? 0));
    }
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
  const localPlayer = game.getLocalPlayer();
  if (localPlayer?.pendingSpawn && localPlayer.isSpectator) {
    game.enterLocalSpectatorFreeFly();
  }
  preloadNextStages();
  if (leaderboardSession?.active) {
    leaderboardSession.stageScoreStart = Math.max(0, Math.trunc(game.score ?? 0));
  }
  if (netplayEnabled && netplayState?.role === 'host' && lobbyRoom) {
    const meta = buildRoomMeta();
    if (meta) {
      lobbyRoom.meta = meta;
      broadcastRoomUpdate();
      sendLobbyHeartbeat(performance.now(), true);
    }
  }
}

function getLeaderboardPlayerId(): string {
  const key = 'smb_leaderboard_player_id';
  const existing = localStorage.getItem(key);
  if (existing) {
    return existing;
  }
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

function getActivePackId(): string | null {
  const pack = getActivePack();
  if (!pack) {
    return null;
  }
  const id = pack.manifest.id || pack.manifest.name;
  return id ? String(id).slice(0, 64) : null;
}

async function refreshLeaderboardAllowlist(force = false) {
  if (!leaderboardsClient) {
    leaderboardAllowlist = [];
    return;
  }
  try {
    const list = await leaderboardsClient.getAllowlist(force);
    leaderboardAllowlist = list.map((entry) => entry.packId);
  } catch {
    leaderboardAllowlist = [];
  }
}

function isPackAllowed(packId: string | null): boolean {
  if (!packId) {
    return true;
  }
  return leaderboardAllowlist.includes(packId);
}

function buildCourseId(gameSource: GameSource, config: any): string {
  if (gameSource === GAME_SOURCES.SMB1) {
    return String(config?.difficulty ?? 'beginner');
  }
  const mode = config?.mode === 'story' ? 'story' : 'challenge';
  if (mode === 'story') {
    return 'story';
  }
  return String(config?.difficulty ?? 'beginner');
}

function buildCourseMode(gameSource: GameSource, config: any): 'story' | 'challenge' | 'smb1' {
  if (gameSource === GAME_SOURCES.SMB1) {
    return 'smb1';
  }
  return config?.mode === 'story' ? 'story' : 'challenge';
}

function isFullCourseRun(gameSource: GameSource, config: any): boolean {
  if (gameSource === GAME_SOURCES.SMB1) {
    const index = Number(config?.stageIndex ?? 0);
    return index === 0;
  }
  const mode = config?.mode === 'story' ? 'story' : 'challenge';
  if (mode === 'story') {
    const worldIndex = Number(config?.worldIndex ?? 0);
    const stageIndex = Number(config?.stageIndex ?? 0);
    return worldIndex === 0 && stageIndex === 0;
  }
  const stageIndex = Number(config?.stageIndex ?? 0);
  return stageIndex === 0;
}

function startLeaderboardSession(courseConfig: any) {
  const packId = getActivePackId();
  const eligible = isFullCourseRun(activeGameSource, courseConfig);
  leaderboardSession = {
    active: true,
    eligible,
    gameSource: activeGameSource,
    packId,
    courseId: buildCourseId(activeGameSource, courseConfig),
    mode: buildCourseMode(activeGameSource, courseConfig),
    courseConfig: courseConfig ?? {},
    warpUsed: false,
    courseTimerFrames: 0,
    penaltyFrames: 0,
    retryCount: 0,
    stageScoreStart: game.score ?? 0,
    segments: [],
    hasSkipped: false,
  };
}

function handleStageGoal(info: {
  stageId: number;
  goalType: string | null;
  timerFrames: number;
  score: number;
  isBonusStage: boolean;
}) {
  if (!leaderboardsClient || netplayEnabled || info.isBonusStage) {
    return;
  }
  const packId = getActivePackId();
  if (!isPackAllowed(packId)) {
    return;
  }
  const goalType = (info.goalType ?? 'B') as 'B' | 'G' | 'R';
  const playerId = getLeaderboardPlayerId();
  const displayName = localProfile?.name ?? 'Player';
  const stageScoreDelta = Math.max(0, Math.trunc(info.score - (leaderboardSession?.stageScoreStart ?? 0)));
  const replay = game.exportReplay();
  if (replay) {
    void leaderboardsClient.submitStage({
      type: 'stage',
      playerId,
      displayName,
      gameSource: activeGameSource,
      stageId: info.stageId,
      goalType,
      metric: 'time',
      value: Math.max(0, Math.trunc(info.timerFrames)),
      packId,
      replay,
      clientMeta: { version: 1 },
    }).catch(() => {});
    void leaderboardsClient.submitStage({
      type: 'stage',
      playerId,
      displayName,
      gameSource: activeGameSource,
      stageId: info.stageId,
      goalType,
      metric: 'score',
      value: stageScoreDelta,
      packId,
      replay,
      clientMeta: { version: 1 },
    }).catch(() => {});
  }

  if (leaderboardSession && leaderboardSession.active) {
    leaderboardSession.courseTimerFrames += Math.max(0, Math.trunc(info.timerFrames));
    if (leaderboardSession.mode === 'challenge' && (goalType === 'G' || goalType === 'R')) {
      leaderboardSession.warpUsed = true;
    }
    if (replay) {
      const segment: CourseReplaySegment = {
        stageId: info.stageId,
        inputs: replay.inputs,
        inputStartTick: replay.inputStartTick ?? 0,
        ticks: replay.ticks ?? replay.inputs.length,
        endReason: 'goal',
        goalType,
      };
      leaderboardSession.segments.push(segment);
    }
  }
}

function handleStageFail(info: {
  stageId: number;
  reason: 'ringout' | 'timeover' | 'manual_reset' | 'skip';
  timerFrames: number;
  score: number;
  isBonusStage: boolean;
}) {
  if (!leaderboardSession || !leaderboardSession.active || info.isBonusStage) {
    return;
  }
  const replay = game.exportReplay();
  if (replay) {
    const segment: CourseReplaySegment = {
      stageId: info.stageId,
      inputs: replay.inputs,
      inputStartTick: replay.inputStartTick ?? 0,
      ticks: replay.ticks ?? replay.inputs.length,
      endReason: info.reason,
    };
    leaderboardSession.segments.push(segment);
  }
  leaderboardSession.courseTimerFrames += Math.max(0, Math.trunc(info.timerFrames));
  if (info.reason === 'skip') {
    leaderboardSession.hasSkipped = true;
    return;
  }
  leaderboardSession.retryCount += 1;
  leaderboardSession.penaltyFrames += 60;
}

function updateSmb2ChallengeStages() {
  courseSelection.updateSmb2ChallengeStages();
}

function updateSmb1Stages() {
  courseSelection.updateSmb1Stages();
}

function updateSmb2StoryOptions() {
  courseSelection.updateSmb2StoryOptions();
}

function updateSmb2ModeFields() {
  courseSelection.updateSmb2ModeFields();
}

function updateGameSourceFields() {
  courseSelection.updateGameSourceFields();
}

function buildSmb1CourseConfig() {
  return courseSelection.buildSmb1CourseConfig();
}

function buildSmb2CourseConfig(): Smb2CourseConfig {
  return courseSelection.buildSmb2CourseConfig();
}

function buildMb2wsCourseConfig(): Mb2wsCourseConfig {
  return courseSelection.buildMb2wsCourseConfig();
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
  if (!netplayEnabled && leaderboardsClient) {
    startLeaderboardSession(difficulty);
  } else {
    leaderboardSession = null;
  }
}

function requestSnapshot(reason: 'mismatch' | 'lag', frame?: number, force = false) {
  if (!clientPeer || !netplayState) {
    return;
  }
  const nowMs = performance.now();
  const lastRequest = netplayState.lastSnapshotRequestTimeMs ?? 0;
  const cooldownMs = reason === 'mismatch'
    ? NETPLAY_SNAPSHOT_MISMATCH_COOLDOWN_MS
    : NETPLAY_SNAPSHOT_COOLDOWN_MS;
  const cooldownOk = netplayState.lastSnapshotRequestTimeMs === null
    || (nowMs - lastRequest) >= cooldownMs;
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

function hostApplyPendingRollback() {
  if (!netplayState || netplayState.role !== 'host') {
    return;
  }
  const state = netplayState;
  const rollbackFrame = state.pendingHostRollbackFrame;
  if (rollbackFrame === null) {
    return;
  }
  const snapshotTargets = Array.from(state.pendingHostRollbackPlayers);
  state.pendingHostRollbackFrame = null;
  state.pendingHostRollbackPlayers.clear();
  if (!rollbackAndResim(rollbackFrame)) {
    for (const playerId of snapshotTargets) {
      sendSnapshotToClient(playerId, rollbackFrame);
    }
    return;
  }
  state.pendingHostUpdates.add(rollbackFrame);
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
  void getAvatarValidationCached(avatarData).then((ok) => {
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
  if (
    msgStageSeq !== undefined
    && msg.type !== 'start'
    && msg.type !== 'player_join'
    && msg.type !== 'player_leave'
    && msgStageSeq !== state.stageSeq
  ) {
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
    if (player) {
      player.isSpectator = msg.spectator;
      if (msg.pendingSpawn || msg.spectator) {
        markPlayerPendingSpawn(msg.playerId, msg.stageSeq ?? netplayState?.stageSeq ?? 0);
      } else {
        player.pendingSpawn = false;
        pendingSpawnStageSeq.delete(msg.playerId);
      }
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
    pendingSpawnStageSeq.delete(msg.playerId);
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
    const mode = getRoomGameMode(msg.room);
    const cappedMaxPlayers = mode === MULTIPLAYER_MODE_CHAINED
      ? Math.min(msg.room.settings.maxPlayers, CHAINED_MAX_PLAYERS)
      : msg.room.settings.maxPlayers;
    msg.room.settings.maxPlayers = cappedMaxPlayers;
    game.maxPlayers = cappedMaxPlayers;
    game.playerCollisionEnabled = msg.room.settings.collisionEnabled;
    game.setMultiplayerGameMode(mode);
    if (netplayState) {
      netplayState.currentGameMode = mode;
    }
    lobbyRoom = msg.room;
    updateLobbyUi();
    return;
  }
  if (msg.type === 'start') {
    if (netplayState) {
      netplayState.stageSeq = msg.stageSeq;
      netplayState.currentCourse = msg.course;
      netplayState.currentGameSource = msg.gameSource;
      netplayState.currentGameMode = normalizeMultiplayerGameMode(msg.gameMode);
      netplayState.awaitingSnapshot = false;
      netplayState.expectedHashes.clear();
      netplayState.hashHistory.clear();
    }
    if (msg.lateJoin && Number.isFinite(game.localPlayerId) && game.localPlayerId > 0) {
      markPlayerPendingSpawn(game.localPlayerId, msg.stageSeq);
    }
    promotePendingSpawns(msg.stageSeq);
    pendingSnapshot = null;
    activeGameSource = msg.gameSource;
    game.setGameSource(activeGameSource);
    game.setMultiplayerGameMode(normalizeMultiplayerGameMode(msg.gameMode));
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
      state.clientStates.delete(playerId);
      rejectHostConnection(playerId, 'Room is full');
      return;
    }
    const joinAsSpectator = shouldJoinAsSpectator();
    game.addPlayer(playerId, { spectator: joinAsSpectator });
    if (joinAsSpectator) {
      markPlayerPendingSpawn(playerId, state.stageSeq);
    }
    updateLobbyUi();
  }
  if (msg.type === 'input') {
    const frame = coerceFrame(msg.frame);
    const input = normalizeInput(msg.input);
    if (frame === null || !input) {
      return;
    }
    const player = game.players.find((entry) => entry.id === playerId);
    const awaitingSpawn = !!player?.pendingSpawn || !!player?.isSpectator;
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
    if (awaitingSpawn) {
      return;
    }
    const currentFrame = state.session.getFrame();
    const minFrame = Math.max(0, currentFrame - Math.min(state.maxRollback, NETPLAY_MAX_INPUT_BEHIND));
    const maxFrame = currentFrame + NETPLAY_MAX_INPUT_AHEAD;
    if (frame < minFrame || frame > maxFrame) {
      return;
    }
    if (frame <= currentFrame && (currentFrame - frame) > NETPLAY_HOST_MAX_INPUT_ROLLBACK) {
      const nowMs = performance.now();
      const lastSnap = clientState.lastSnapshotMs;
      if (lastSnap === null || (nowMs - lastSnap) >= NETPLAY_HOST_SNAPSHOT_COOLDOWN_MS) {
        clientState.lastSnapshotMs = nowMs;
        sendSnapshotToClient(playerId, currentFrame);
      }
      return;
    }
    const changed = recordInputForFrame(frame, playerId, input);
    if (changed && frame <= currentFrame) {
      state.pendingHostRollbackFrame = state.pendingHostRollbackFrame === null
        ? frame
        : Math.min(state.pendingHostRollbackFrame, frame);
      state.pendingHostRollbackPlayers.add(playerId);
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
    const framesToSend = new Set<number>();
    if (pendingFrames) {
      for (const frame of pendingFrames) {
        framesToSend.add(frame);
      }
    }
    for (let frame = start; frame <= currentFrame; frame += 1) {
      framesToSend.add(frame);
    }
    const bundles: FrameBundleMessage[] = [];
    for (const frame of Array.from(framesToSend).sort((a, b) => a - b)) {
      const bundle = netplayState.hostFrameBuffer.get(frame);
      if (!bundle) {
        continue;
      }
      bundles.push(bundle);
    }
    if (bundles.length > 0) {
      hostRelay.sendFrameBatch(playerId, clientState.lastAckedClientInput, bundles);
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
  const batchEntries: Array<{ frame: number; input: QuantizedInput }> = [];
  for (let frame = minFrame; frame <= end; frame += 1) {
    const input = netplayState.pendingLocalInputs.get(frame);
    if (!input) {
      continue;
    }
    batchEntries.push({ frame, input });
  }
  if (batchEntries.length > 0) {
    clientPeer.sendInputBatch(netplayState.stageSeq, netplayState.lastReceivedHostFrame, batchEntries);
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
  if (state.role === 'host') {
    hostApplyPendingRollback();
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
      requestSnapshot('lag', state.lastReceivedHostFrame, true);
    }
    if (drift > NETPLAY_LAG_FUSE_FRAMES) {
      if (state.lagBehindSinceMs === null) {
        state.lagBehindSinceMs = nowMs;
      }
      const timeBehind = nowMs - state.lagBehindSinceMs;
      if (timeBehind >= NETPLAY_LAG_FUSE_MS && canRequest) {
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
    netplayDebugOverlay.hide();
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
      netplayDebugOverlay.hide();
      return;
    }
    netplayDebugOverlay.show(warning, []);
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
  netplayDebugOverlay.show(warning, lines);
}

async function refreshLobbyList() {
  await lobbyBrowser.refreshLobbyList(joinRoom);
}

async function createRoom() {
  await lobbyBrowser.createRoom();
}

async function joinRoom(roomId: string) {
  await lobbyBrowser.joinRoom(roomId);
}

async function joinRoomByCode() {
  await lobbyBrowser.joinRoomByCode();
}

async function leaveRoom({ skipConfirm = false }: { skipConfirm?: boolean } = {}) {
  await lobbyBrowser.leaveRoom(skipConfirm);
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

function rejectHostConnection(playerId: number, reason = 'Room is full') {
  peerSession.rejectHostConnection(playerId, reason);
}

function startHost(room: LobbyRoom, playerToken: string) {
  peerSession.startHost(room, playerToken);
}

async function startClient(room: LobbyRoom, playerId: number, playerToken: string) {
  await peerSession.startClient(room, playerId, playerToken);
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

runAppBootstrap({
  setOverlayVisible,
  startButton,
  refreshPackUi: updatePackUi,
  syncPackEnabled,
  initPackFromQuery,
  onPackReady: () => {
    updateSmb2ChallengeStages();
    updateSmb2StoryOptions();
    updateSmb1Stages();
    updateGameSourceFields();
  },
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
    inputControls?.updateFalloffCurve(value);
  },
);

inputControls?.updateControlModeSettingsVisibility();
inputControls?.updateFalloffCurve(game.input?.inputFalloff ?? 1);
inputControls?.syncTouchPreviewVisibility();
updateFullscreenButtonVisibility();

packLoader.bindPickerUi({
  packPicker,
  packLoadButton,
  packLoadZipButton,
  packLoadFolderButton,
  packFileInput,
  packFolderInput,
});

replayController.bindReplayUi();

bindMainUiControls({
  smb2ModeSelect,
  smb2ChallengeSelect,
  smb2StoryWorldSelect,
  difficultySelect,
  gameSourceSelect,
  controlModeSelect,
  fullscreenButton,
  mainMenuPanel,
  multiplayerMenuPanel,
  multiplayerIngameMenuPanel,
  settingsMenuPanel,
  levelSelectMenuPanel,
  leaderboardsMenuPanel,
  gamepadCalibrationButton,
  gamepadCalibrationOverlay,
  interpolationToggle,
  multiplayerOpenButton,
  leaderboardsOpenButton,
  multiplayerBackButton,
  levelSelectOpenButton,
  levelSelectBackButton,
  leaderboardsBackButton,
  settingsOpenButton,
  settingsBackButton,
  leaderboardTypeSelect,
  leaderboardRefreshButton,
  settingsTabButtons,
  onUpdateSmb2ModeFields: updateSmb2ModeFields,
  onUpdateSmb2ChallengeStages: updateSmb2ChallengeStages,
  onUpdateSmb2StoryOptions: updateSmb2StoryOptions,
  onUpdateSmb1Stages: updateSmb1Stages,
  onSyncPackEnabled: syncPackEnabled,
  onUpdateGameSourceFields: updateGameSourceFields,
  onUpdateControlModeSettingsVisibility: () => inputControls?.updateControlModeSettingsVisibility(),
  onSyncTouchPreviewVisibility: () => inputControls?.syncTouchPreviewVisibility(),
  onUpdateFullscreenButtonVisibility: updateFullscreenButtonVisibility,
  onStartGamepadCalibration: () => inputControls?.startGamepadCalibration(),
  onStopGamepadCalibration: () => inputControls?.stopGamepadCalibration(),
  onSetActiveMenu: setActiveMenu,
  onOpenLevelSelectMenu: openLevelSelectMenu,
  onOpenSettingsMenu: () => openSettingsMenu(),
  getLevelSelectReturnMenu: () => levelSelectReturnMenu,
  getSettingsReturnMenu: () => settingsReturnMenu,
  onUpdateLeaderboardsUi: updateLeaderboardsUi,
  onRefreshLeaderboards: () => {
    void refreshLeaderboards();
  },
  onSetSettingsTab: setSettingsTab,
  setInterpolationEnabled: (enabled) => {
    interpolationEnabled = enabled;
  },
});

function handleStartRequest() {
  if (netplayEnabled && netplayState?.role === 'client') {
    if (hudStatus) {
      hudStatus.textContent = 'Waiting for host to start...';
    }
    return;
  }
  const gameMode = netplayEnabled ? getLobbyRoomGameMode() : MULTIPLAYER_MODE_STANDARD;
  const startBlockedReason = netplayEnabled
    ? getLobbyStartDisabledReason(netplayState?.role === 'host', gameMode)
    : '';
  if (startBlockedReason) {
    if (hudStatus) {
      hudStatus.textContent = startBlockedReason;
    }
    updateLobbyUi();
    return;
  }
  const resolved = resolveSelectedGameSource();
  activeGameSource = resolved.gameSource;
  game.setMultiplayerGameMode(gameMode);
  const difficulty = activeGameSource === GAME_SOURCES.SMB2
    ? buildSmb2CourseConfig()
    : activeGameSource === GAME_SOURCES.MB2WS
      ? buildMb2wsCourseConfig()
      : buildSmb1CourseConfig();
  if (netplayEnabled && netplayState?.role === 'host') {
    netplayState.currentCourse = difficulty;
    netplayState.currentGameSource = activeGameSource;
    netplayState.currentGameMode = gameMode;
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

bindUiEventHandlers({
  startButton,
  onStartRequest: handleStartRequest,
  resumeButton,
  ingameResumeButton,
  ingameLeaveButton,
  onCloseMenuOverlay: closeMenuOverlay,
  onLeaveMatchToLobbyList: leaveMatchToLobbyList,
  gyroRecalibrateButton,
  onGyroRecalibrate: () => {
    game.input?.recalibrateGyro?.();
  },
  mobileMenuButton,
  isNetplayEnabled: () => netplayEnabled,
  onOpenMenuOverlay: openMenuOverlay,
  isIngameChatOpen: () => ingameChatOpen,
  setIngameChatOpen,
  isRunning: () => running,
  overlay,
  isTextInputElement,
  blurActiveInput,
  updateIngameChatVisibility,
  ingameChatWrap,
});

bindLobbyEventHandlers({
  lobbyRefreshButton,
  lobbyCreateButton,
  lobbyJoinButton,
  lobbyLeaveButton,
  lobbyGameModeSelect,
  lobbyMaxPlayersSelect,
  lobbyCollisionToggle,
  lobbyLockToggle,
  profileNameInput,
  profileAvatarInput,
  profileAvatarClearButton,
  hidePlayerNamesToggle,
  hideLobbyNamesToggle,
  lobbyNameInput,
  lobbyRoomNameInput,
  lobbyChatInput,
  lobbyChatSendButton,
  lobbyStageButton,
  lobbyStageChooseButton,
  ingameChatInput,
  lobbyStartButton,
  onRefreshLobbyList: () => {
    void refreshLobbyList();
  },
  onCreateRoom: () => {
    void createRoom();
  },
  onJoinRoomByCode: () => {
    void joinRoomByCode();
  },
  onLeaveRoom: () => {
    void leaveRoom();
  },
  onApplyLobbyGameModeFromInputs: applyLobbyGameModeFromInputs,
  onApplyLobbySettingsFromInputs: applyLobbySettingsFromInputs,
  onProfileNameInput: (value, input) => {
    const sanitized = sanitizeProfileName(value);
    if (sanitized !== input.value) {
      input.value = sanitized;
    }
    if (sanitized !== localProfile.name) {
      localProfile = { ...localProfile, name: sanitized };
      saveLocalProfile(localProfile);
      scheduleProfileBroadcast();
    }
  },
  onProfileAvatarChange: async (file) => {
    if (!file) {
      return;
    }
    const dataUrl = await validateAvatarFile(file, setProfileAvatarError);
    if (!dataUrl) {
      return;
    }
    localProfile = { ...localProfile, avatarData: dataUrl };
    saveLocalProfile(localProfile);
    updateProfileUi();
    scheduleProfileBroadcast();
  },
  onProfileAvatarClear: () => {
    if (!localProfile.avatarData) {
      return;
    }
    localProfile = { ...localProfile, avatarData: undefined };
    saveLocalProfile(localProfile);
    updateProfileUi();
    scheduleProfileBroadcast();
    setProfileAvatarError();
  },
  onHidePlayerNamesChange: (checked) => {
    privacySettings = { ...privacySettings, hidePlayerNames: checked };
    savePrivacySettings(privacySettings);
    updateLobbyUi();
  },
  onHideLobbyNamesChange: (checked) => {
    privacySettings = { ...privacySettings, hideLobbyNames: checked };
    savePrivacySettings(privacySettings);
    updateLobbyUi();
    void refreshLobbyList();
  },
  onLobbyNameInput: (value, input) => {
    const sanitized = sanitizeLobbyNameDraft(value);
    if (sanitized !== input.value) {
      input.value = sanitized;
    }
  },
  isHost: () => netplayState?.role === 'host',
  onLobbyRoomNameInput: (value, input) => {
    const sanitized = sanitizeLobbyNameDraft(value);
    if (sanitized !== input.value) {
      input.value = sanitized;
    }
  },
  onLobbyRoomNameCommit: scheduleLobbyNameUpdate,
  onSendChatMessage: sendChatMessage,
  onOpenMultiplayerLevelSelect: () => {
    openLevelSelectMenu('multiplayer');
  },
  onApplyLobbyStageSelection: applyLobbyStageSelection,
  onSetActiveMenuMultiplayer: () => {
    setActiveMenu('multiplayer');
  },
  onSetIngameChatOpen: setIngameChatOpen,
  onStartRequest: handleStartRequest,
});
if (lobbyClient) {
  void refreshLobbyList();
} else if (multiplayerOnlineCount) {
  multiplayerOnlineCount.textContent = 'Offline';
}

startRenderLoop({
  canvas,
  hudCanvas,
  hudRenderer,
  game,
  syncState,
  getRunning: () => running,
  getLastTime: () => lastTime,
  setLastTime: (value) => {
    lastTime = value;
  },
  getLastRenderTime: () => lastRenderTime,
  setLastRenderTime: (value) => {
    lastRenderTime = value;
  },
  getLastHudTime: () => lastHudTime,
  setLastHudTime: (value) => {
    lastHudTime = value;
  },
  getInterpolationEnabled: () => interpolationEnabled,
  getViewerInput: () => viewerInput,
  getCamera: () => camera,
  getRenderer: () => renderer,
  getGfxDevice: () => gfxDevice,
  getSwapChain: () => swapChain,
  isRenderReady: () => renderReady,
  isNetplayEnabled: () => netplayEnabled,
  netplayTick,
  updateNetplayDebugOverlay,
  sendLobbyHeartbeat: (now) => {
    sendLobbyHeartbeat(now);
  },
  applyGameCamera,
  updateNameplates,
  onBeforeTick: (now) => {
    inputControls?.updateGyroHelper();
    inputControls?.maybeUpdateControlModeSettings(now);
    inputControls?.updateInputPreview();
    inputControls?.updateGamepadCalibration();
  },
});
