import { mat4, vec3 } from 'gl-matrix';
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
import { LeaderboardsClient, type CourseReplaySegment } from './leaderboards.js';
import type { QuantizedInput } from './determinism.js';
import type {
  ClientToHostMessage,
  FrameBundleMessage,
  HostToClientMessage,
  PlayerProfile,
  RoomInfo,
  RoomMeta,
  ChatMessage,
} from './netcode_protocol.js';
import type { StageData } from './noclip/SuperMonkeyBall/World.js';
import { HudRenderer } from './hud.js';
import { createDefaultModRegistry } from './mods/index.js';
import { runAppBootstrap } from './app/bootstrap.js';
import { LeaderboardsUiController } from './app/leaderboards/ui.js';
import { LeaderboardSessionController } from './app/leaderboards/session_flow.js';
import { ChatUiController } from './app/netplay/chat_ui.js';
import { NetplayConnectionStateController } from './app/netplay/connection_state.js';
import { createNetplayDebugOverlay } from './app/netplay/debug_overlay.js';
import { LobbyBrowserController } from './app/netplay/lobby_browser.js';
import { bindLobbyEventHandlers } from './app/netplay/lobby_bindings.js';
import { LobbyStateController } from './app/netplay/lobby_state.js';
import { LobbyUiController } from './app/netplay/lobby_ui.js';
import { NetplayMessageFlowController } from './app/netplay/message_flow.js';
import { NameplateController } from './app/netplay/nameplates.js';
import { PeerSessionController } from './app/netplay/peer_session.js';
import { NetplayRuntimeController } from './app/netplay/runtime.js';
import { SnapshotFlowController } from './app/netplay/snapshot_flow.js';
import { NetplayStateSyncController } from './app/netplay/state_sync.js';
import { NetplaySimulationSyncController } from './app/netplay/simulation_sync.js';
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
import { MatchFlowController } from './app/gameplay/match_flow.js';
import { initRendererGfx, prewarmConfettiRenderer as prewarmConfettiRenderResources, type ViewerInputState } from './app/render/boot.js';
import { resizeCanvasToDisplaySize, startRenderLoop } from './app/render/frame_loop.js';
import { StageLoader } from './app/render/stage_loader.js';
import { StageFlowController } from './app/render/stage_flow.js';
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

const matchFlow = new MatchFlowController({
  game,
  resumeButton,
  hudStatus,
  hideAllNameplates: () => {
    nameplates?.hideAll();
  },
  isRunning: () => running,
  setRunning: (value) => {
    running = value;
  },
  isNetplayEnabled: () => netplayEnabled,
  isHost: () => netplayState?.role === 'host',
  getLobbyRoom: () => lobbyRoom,
  setLobbyRoomMeta: (meta) => {
    if (lobbyRoom) {
      lobbyRoom.meta = meta;
    }
  },
  buildRoomMeta,
  broadcastRoomUpdate,
  sendLobbyHeartbeat,
  hostBroadcast: (msg) => {
    hostRelay?.broadcast(msg);
  },
  setOverlayVisible,
  setActiveMenu,
  leaveRoom,
  updateLobbyUi,
  updateIngameChatVisibility,
  resetNetplayForStage,
  leaderboardsClient,
  getLeaderboardSession: () => leaderboardSession,
  setLeaderboardSession: (session) => {
    leaderboardSession = session;
  },
  getPendingSnapshot: () => pendingSnapshot,
  setPendingSnapshot: (snapshot) => {
    pendingSnapshot = snapshot;
  },
  getLocalProfileName: () => localProfile?.name ?? 'Player',
  isPackAllowed,
  getLeaderboardPlayerId,
});

const lobbyState = new LobbyStateController({
  game,
  lobbyProfiles,
  localProfile: () => localProfile,
  setLocalProfile: (profile) => {
    localProfile = profile;
  },
  saveLocalProfile,
  updateLobbyUi,
  updateProfileUi,
  sanitizeProfile,
  netplayRole: () => netplayState?.role ?? null,
  hostRelay: () => hostRelay,
  clientPeer: () => clientPeer,
  setLastProfileBroadcastMs: (value) => {
    lastProfileBroadcastMs = value;
  },
  getLastProfileBroadcastMs: () => lastProfileBroadcastMs,
  profileBroadcastCooldownMs: PROFILE_BROADCAST_COOLDOWN_MS,
  getProfileBroadcastTimer: () => profileBroadcastTimer,
  setProfileBroadcastTimer: (id) => {
    profileBroadcastTimer = id;
  },
  lobbyRoom: () => lobbyRoom,
  isHost: () => netplayState?.role === 'host',
  lobbyMaxPlayersSelect,
  lobbyCollisionToggle,
  lobbyLockToggle,
  lobbyRoomNameInput,
  clampInt,
  getLobbyRoomGameMode,
  getLobbySelectedGameMode,
  chainedMaxPlayers: CHAINED_MAX_PLAYERS,
  lobbyMaxPlayers: LOBBY_MAX_PLAYERS,
  broadcastRoomUpdate,
  sendLobbyHeartbeat,
  buildRoomMeta,
  setLastLobbyNameUpdateMs: (value) => {
    lastLobbyNameUpdateMs = value;
  },
  getLastLobbyNameUpdateMs: () => lastLobbyNameUpdateMs,
  lobbyNameUpdateCooldownMs: LOBBY_NAME_UPDATE_COOLDOWN_MS,
  getLobbyNameUpdateTimer: () => lobbyNameUpdateTimer,
  setLobbyNameUpdateTimer: (id) => {
    lobbyNameUpdateTimer = id;
  },
  sanitizeLobbyName,
  applyGameMode: (mode, maxPlayers, collisionEnabled) => {
    game.maxPlayers = maxPlayers;
    if (collisionEnabled !== undefined) {
      game.playerCollisionEnabled = collisionEnabled;
    }
    game.setMultiplayerGameMode(mode);
    if (netplayState) {
      netplayState.currentGameMode = mode;
    }
  },
});

let lobbyUiController: LobbyUiController | null = null;
let netplayMessageFlow: NetplayMessageFlowController | null = null;
let snapshotFlow: SnapshotFlowController | null = null;
let netplayRuntime: NetplayRuntimeController | null = null;
let stageFlow: StageFlowController | null = null;
let nameplates: NameplateController | null = null;
let netplaySync: NetplayStateSyncController | null = null;
let netplaySimSync: NetplaySimulationSyncController | null = null;
let netplayConnectionState: NetplayConnectionStateController | null = null;

let running = false;
let paused = false;
let lastTime = performance.now();
let lastRenderTime = lastTime;
let lastHudTime = lastTime;
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
const NETPLAY_DEBUG_STORAGE_KEY = 'smb_netplay_debug';
const LOBBY_HEARTBEAT_INTERVAL_MS = 15000;
const LOBBY_HEARTBEAT_FALLBACK_MS = 12000;

netplaySync = new NetplayStateSyncController({
  game,
  setNetplayState: (state) => {
    netplayState = state;
  },
  getNetplayState: () => netplayState,
  getHostRelay: () => hostRelay,
  getClientPeer: () => clientPeer,
  setNetplayAccumulator: (value) => {
    netplayAccumulator = value;
  },
  normalizeMultiplayerGameMode,
  getActiveGameSource: () => activeGameSource,
  getStageBasePath,
  getLobbyRoom: () => lobbyRoom,
  maxRollback: 30,
  maxResend: 8,
  hashInterval: 15,
  netplayClientLead: NETPLAY_CLIENT_LEAD,
  netplayClientMaxExtraLead: NETPLAY_CLIENT_MAX_EXTRA_LEAD,
  stageReadyResendMs: NETPLAY_STAGE_READY_RESEND_MS,
  stageReadyTimeoutMs: NETPLAY_STAGE_READY_TIMEOUT_MS,
});
netplaySimSync = new NetplaySimulationSyncController({
  game,
  getNetplayState: () => netplayState,
  getPendingSnapshot: () => pendingSnapshot,
  setPendingSnapshot: (snapshot) => {
    pendingSnapshot = snapshot;
  },
  getSimHash,
  resetNetplaySession,
  quantizedEqual,
  netplayPerf,
});
netplayConnectionState = new NetplayConnectionStateController({
  game,
  getRunning: () => running,
  getLobbyClient: () => lobbyClient,
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
  setLobbyHostToken: (token) => {
    lobbyHostToken = token;
  },
  getLobbyHeartbeatTimer: () => lobbyHeartbeatTimer,
  setLobbyHeartbeatTimer: (id) => {
    lobbyHeartbeatTimer = id;
  },
  getLastLobbyHeartbeatMs: () => lastLobbyHeartbeatMs,
  setLastLobbyHeartbeatMs: (value) => {
    lastLobbyHeartbeatMs = value;
  },
  getLobbySignalRetryTimer: () => lobbySignalRetryTimer,
  setLobbySignalRetryTimer: (id) => {
    lobbySignalRetryTimer = id;
  },
  getLobbySignalRetryMs: () => lobbySignalRetryMs,
  setLobbySignalRetryMs: (value) => {
    lobbySignalRetryMs = value;
  },
  getLobbySignalShouldReconnect: () => lobbySignalShouldReconnect,
  getLobbySignalReconnectFn: () => lobbySignalReconnectFn,
  getLobbySignal: () => lobbySignal,
  setLobbySignal: (signal) => {
    lobbySignal = signal;
  },
  setLobbySignalShouldReconnect: (enabled) => {
    lobbySignalShouldReconnect = enabled;
  },
  setLobbySignalReconnectFn: (fn) => {
    lobbySignalReconnectFn = fn;
  },
  getHostRelay: () => hostRelay,
  setHostRelay: (relay) => {
    hostRelay = relay;
  },
  getClientPeer: () => clientPeer,
  setClientPeer: (peer) => {
    clientPeer = peer;
  },
  setNetplayEnabled: (enabled) => {
    netplayEnabled = enabled;
  },
  setNetplayState: (state) => {
    netplayState = state;
  },
  setPendingSnapshot: (snapshot) => {
    pendingSnapshot = snapshot;
  },
  setNetplayAccumulator: (value) => {
    netplayAccumulator = value;
  },
  setLastRoomMetaKey: (value) => {
    lastRoomMetaKey = value;
  },
  setLastRoomPlayerCount: (value) => {
    lastRoomPlayerCount = value;
  },
  setLastProfileBroadcastMs: (value) => {
    lastProfileBroadcastMs = value;
  },
  setLastLobbyNameUpdateMs: (value) => {
    lastLobbyNameUpdateMs = value;
  },
  lobbyProfiles,
  pendingAvatarByPlayer,
  profileUpdateThrottle,
  setChatMessages: (messages) => {
    chatMessages = messages;
  },
  chatRateLimitByPlayer,
  setLastLocalChatSentMs: (value) => {
    lastLocalChatSentMs = value;
  },
  pendingSpawnStageSeq,
  clearNameplates: () => {
    nameplates?.clear();
  },
  resetLocalPlayersAfterNetplay,
  updateLobbyUi,
  updateChatUi,
  setIngameChatOpen,
  modeStandard: MULTIPLAYER_MODE_STANDARD,
  heartbeatIntervalMs: LOBBY_HEARTBEAT_INTERVAL_MS,
  heartbeatFallbackMs: LOBBY_HEARTBEAT_FALLBACK_MS,
  sendLobbyHeartbeat,
});

lobbyUiController = new LobbyUiController({
  game,
  netplayEnabled: () => netplayEnabled,
  netplayRole: () => netplayState?.role ?? null,
  netplayHasCurrentCourse: () => !!netplayState?.currentCourse,
  lobbyRoom: () => lobbyRoom,
  setLobbyRoomMeta: (meta) => {
    if (lobbyRoom) {
      lobbyRoom.meta = meta;
    }
  },
  lobbyProfiles,
  multiplayerBrowser,
  multiplayerLobby,
  multiplayerBackButton,
  lobbyLeaveButton,
  lobbyPlayerList,
  ingamePlayerList,
  lobbyRoomInfo,
  lobbyRoomStatus,
  lobbyRoomNameInput,
  lobbyGameModeSelect,
  lobbyMaxPlayersSelect,
  lobbyCollisionToggle,
  lobbyLockToggle,
  lobbyChatPanel,
  lobbyStartButton,
  levelSelectOpenButton,
  lobbyStageInfo,
  lobbyStageButton,
  lobbyStageActions,
  lobbyStageChooseButton,
  modeStandard: MULTIPLAYER_MODE_STANDARD,
  modeChained: MULTIPLAYER_MODE_CHAINED,
  chainedMaxPlayers: CHAINED_MAX_PLAYERS,
  getLobbyRoomGameMode,
  formatRoomInfoLabel,
  formatMultiplayerGameModeLabel,
  formatGameSourceLabel,
  getPlayerDisplayName,
  profileFallbackForPlayer,
  createAvatarElement,
  buildRoomMeta,
  updateProfileUi,
  updateChatUi,
  kickPlayerFromRoom,
});
netplayMessageFlow = new NetplayMessageFlowController({
  game,
  lobbyStatus,
  getNetplayState: () => netplayState,
  setSuppressHostDisconnectUntil: (value) => {
    suppressHostDisconnectUntil = value;
  },
  setLobbySignalShouldReconnect: (enabled) => {
    lobbySignalShouldReconnect = enabled;
  },
  setLobbySignalReconnectFn: (fn) => {
    lobbySignalReconnectFn = fn;
  },
  clearLobbySignalRetry,
  resetNetplayConnections,
  setActiveMenu,
  requestSnapshot: (reason, frame, force) => {
    requestSnapshot(reason, frame, force);
  },
  coerceFrame,
  normalizeInput,
  recordInputForFrame,
  rollbackAndResim,
  setPendingSnapshot: (snapshot) => {
    pendingSnapshot = snapshot;
  },
  tryApplyPendingSnapshot,
  markPlayerPendingSpawn,
  promotePendingSpawns,
  pendingSpawnStageSeq,
  lobbyProfiles,
  pendingAvatarByPlayer,
  profileFallbackForPlayer,
  updateLobbyUi,
  appendChatMessage,
  endMatchToLobby,
  getRoomGameMode,
  modeChained: MULTIPLAYER_MODE_CHAINED,
  chainedMaxPlayers: CHAINED_MAX_PLAYERS,
  normalizeMultiplayerGameMode,
  setLobbyRoom: (room) => {
    lobbyRoom = room;
  },
  setActiveGameSource: (source) => {
    activeGameSource = source;
  },
  getStageBasePath,
  setCurrentSmb2LikeMode: (mode) => {
    currentSmb2LikeMode = mode;
  },
  startStage,
  sendSnapshotToClient,
  hostRelay: () => hostRelay,
  rejectHostConnection,
  shouldJoinAsSpectator,
  sendStageSyncToClient,
  maybeSendStageSync,
  profileUpdateThrottle,
  profileRemoteCooldownMs: PROFILE_REMOTE_COOLDOWN_MS,
  sanitizeProfile,
  getAvatarValidationCached,
  sanitizeChatText,
  chatRateLimitByPlayer,
  chatSendCooldownMs: CHAT_SEND_COOLDOWN_MS,
  maxInputAhead: NETPLAY_MAX_INPUT_AHEAD,
  maxInputBehind: NETPLAY_MAX_INPUT_BEHIND,
  hostMaxInputRollback: NETPLAY_HOST_MAX_INPUT_ROLLBACK,
  hostSnapshotCooldownMs: NETPLAY_HOST_SNAPSHOT_COOLDOWN_MS,
  snapshotCooldownMs: NETPLAY_SNAPSHOT_COOLDOWN_MS,
});
snapshotFlow = new SnapshotFlowController({
  game,
  getNetplayState: () => netplayState,
  getClientPeer: () => clientPeer,
  getHostRelay: () => hostRelay,
  rollbackAndResim,
  snapshotCooldownMs: NETPLAY_SNAPSHOT_COOLDOWN_MS,
  snapshotMismatchCooldownMs: NETPLAY_SNAPSHOT_MISMATCH_COOLDOWN_MS,
});
netplayRuntime = new NetplayRuntimeController({
  game,
  netplayEnabled: () => netplayEnabled,
  getNetplayState: () => netplayState,
  getClientPeer: () => clientPeer,
  getHostRelay: () => hostRelay,
  getNetplayAccumulator: () => netplayAccumulator,
  setNetplayAccumulator: (value) => {
    netplayAccumulator = value;
  },
  buildInputsForFrame,
  recordInputForFrame,
  trimNetplayHistory,
  getSimHash,
  requestSnapshot: (reason, frame, force) => {
    requestSnapshot(reason, frame, force);
  },
  hostApplyPendingRollback,
  sendSnapshotToClient,
  maybeResendStageReady,
  maybeForceStageSync,
  getAuthoritativeHashFrame,
  getEstimatedHostFrame,
  getClientLeadFrames,
  recordNetplayPerf,
  isNetplayDebugEnabled,
  netplayDebugOverlay,
  constants: {
    maxFrameDelta: NETPLAY_MAX_FRAME_DELTA,
    clientAheadSlack: NETPLAY_CLIENT_AHEAD_SLACK,
    clientRateMin: NETPLAY_CLIENT_RATE_MIN,
    clientRateMax: NETPLAY_CLIENT_RATE_MAX,
    clientDriftRate: NETPLAY_CLIENT_DRIFT_RATE,
    driftForceTick: NETPLAY_DRIFT_FORCE_TICK,
    driftExtraTicks: NETPLAY_DRIFT_EXTRA_TICKS,
    syncRateMin: NETPLAY_SYNC_RATE_MIN,
    syncRateMax: NETPLAY_SYNC_RATE_MAX,
    syncDriftRate: NETPLAY_SYNC_DRIFT_RATE,
    syncForceTick: NETPLAY_SYNC_FORCE_TICK,
    syncExtraTicks: NETPLAY_SYNC_EXTRA_TICKS,
    syncMaxTicks: NETPLAY_SYNC_MAX_TICKS,
    pingIntervalMs: NETPLAY_PING_INTERVAL_MS,
    hostStallMs: NETPLAY_HOST_STALL_MS,
    lagFuseFrames: NETPLAY_LAG_FUSE_FRAMES,
    lagFuseMs: NETPLAY_LAG_FUSE_MS,
    snapshotCooldownMs: NETPLAY_SNAPSHOT_COOLDOWN_MS,
    hostSnapshotBehindFrames: NETPLAY_HOST_SNAPSHOT_BEHIND_FRAMES,
    hostSnapshotCooldownMs: NETPLAY_HOST_SNAPSHOT_COOLDOWN_MS,
  },
});
stageFlow = new StageFlowController({
  game,
  getActiveGameSource: () => activeGameSource,
  setRunning: (value) => {
    running = value;
  },
  setPaused: (value) => {
    paused = value;
  },
  setRenderReady: (value) => {
    renderReady = value;
  },
  setLastTime: (value) => {
    lastTime = value;
  },
  ensureGfxReady: () => {
    if (!swapChain || !gfxDevice) {
      initGfx();
    }
  },
  hasGfxDevice: () => !!gfxDevice,
  destroyRenderer: () => {
    if (renderer && gfxDevice) {
      renderer.destroy(gfxDevice);
    }
  },
  createRenderer: (stageData) => {
    if (!gfxDevice) {
      return;
    }
    renderer = new Renderer(gfxDevice, stageData);
  },
  prewarmConfettiRenderer,
  applyGameCamera,
  updateMobileMenuButtonVisibility,
  updateIngameChatVisibility,
  maybeStartSmb2LikeStageFade,
  markStageReady,
  tryApplyPendingSnapshot,
  getLeaderboardSession: () => leaderboardSession,
  isNetplayHostWithLobby: () => !!(netplayEnabled && netplayState?.role === 'host' && lobbyRoom),
  buildRoomMeta,
  setLobbyRoomMeta: (meta) => {
    if (lobbyRoom) {
      lobbyRoom.meta = meta;
    }
  },
  broadcastRoomUpdate,
  sendLobbyHeartbeatNow: () => {
    sendLobbyHeartbeat(performance.now(), true);
  },
  loadRenderStage,
  loadRenderStageSmb2,
  getStageBasePath,
  prefetchPath: (path) => {
    void prefetchPackSlice(path);
  },
  isNaomiStage,
});

const leaderboardSessionFlow = new LeaderboardSessionController({
  game,
  getActiveGameSource: () => activeGameSource,
  getActivePack: () => getActivePack(),
  getLeaderboardAllowlist: () => leaderboardAllowlist,
  getLocalProfileName: () => localProfile?.name ?? 'Player',
  getLocalStoragePlayerId: () => localStorage.getItem('smb_leaderboard_player_id'),
  leaderboardsClient,
  isNetplayEnabled: () => netplayEnabled,
  getLeaderboardSession: () => leaderboardSession,
  setLeaderboardSession: (session) => {
    leaderboardSession = session;
  },
});

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

function quantizedEqual(a: QuantizedInput, b: QuantizedInput) {
  return netplaySync?.quantizedEqual(a, b) ?? (a.x === b.x && a.y === b.y && (a.buttons ?? 0) === (b.buttons ?? 0));
}

function coerceFrame(value: unknown): number | null {
  return netplaySync?.coerceFrame(value) ?? null;
}

function normalizeInput(input: any): QuantizedInput | null {
  return netplaySync?.normalizeInput(input) ?? null;
}

function ensureNetplayState(role: NetplayRole) {
  if (netplaySync) {
    return netplaySync.ensureNetplayState(role);
  }
  if (!netplayState) {
    throw new Error('Netplay sync controller unavailable');
  }
  return netplayState;
}

function resetNetplaySession() {
  netplaySync?.resetNetplaySession();
}

function resetNetplayForStage() {
  netplaySync?.resetNetplayForStage();
  pendingSnapshot = null;
}

function maybeSendStageSync() {
  netplaySync?.maybeSendStageSync();
}

function sendStageSyncToClient(playerId: number) {
  netplaySync?.sendStageSyncToClient(playerId);
}

function initStageSync(stageId: number) {
  netplaySync?.initStageSync(stageId);
  netplayAccumulator = 0;
}

function markStageReady(stageId: number) {
  netplaySync?.markStageReady(stageId);
}

function maybeResendStageReady(nowMs: number) {
  netplaySync?.maybeResendStageReady(nowMs);
}

function maybeForceStageSync(nowMs: number) {
  netplaySync?.maybeForceStageSync(nowMs);
  netplayAccumulator = 0;
}

function getSimHash() {
  return netplaySync?.getSimHash() ?? 0;
}

function getAuthoritativeHashFrame(state: NetplayState) {
  return netplaySync?.getAuthoritativeHashFrame(state) ?? null;
}

function getEstimatedHostFrame(state: NetplayState) {
  return netplaySync?.getEstimatedHostFrame(state) ?? state.lastReceivedHostFrame;
}

function getClientLeadFrames(state: NetplayState) {
  return netplaySync?.getClientLeadFrames(state) ?? NETPLAY_CLIENT_LEAD;
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

function updateNameplates(interpolationAlpha: number) {
  nameplates?.update(interpolationAlpha);
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

nameplates = new NameplateController({
  game,
  canvas,
  overlay,
  getRunning: () => running,
  isNetplayEnabled: () => netplayEnabled,
  getCamera: () => camera,
  layer: nameplateLayer,
  getProfile: (playerId) => lobbyProfiles.get(playerId) ?? profileFallbackForPlayer(playerId),
  getPlayerDisplayName,
  createAvatarElement,
});

function getLobbySelectedGameMode() {
  return normalizeMultiplayerGameMode(lobbyGameModeSelect?.value);
}

function getRoomGameMode(room: RoomInfo | null | undefined) {
  return normalizeMultiplayerGameMode(room?.meta?.gameMode);
}

function getLobbyRoomGameMode() {
  return normalizeMultiplayerGameMode(lobbyRoom?.meta?.gameMode ?? getLobbySelectedGameMode());
}

function getLobbyStartDisabledReason(isHost: boolean, mode: MultiplayerGameMode) {
  return lobbyUiController?.getLobbyStartDisabledReason(isHost, mode) ?? '';
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

function updateLobbyUi() {
  lobbyUiController?.updateLobbyUi();
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
  lobbyUiController?.updateLevelSelectUi();
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
  lobbyState.applyLobbySettingsFromInputs();
}

function applyLobbyGameModeFromInputs() {
  lobbyState.applyLobbyGameModeFromInputs();
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
  lobbyState.applyLocalProfileToSession();
}

function broadcastLocalProfile() {
  lobbyState.broadcastLocalProfile();
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
  lobbyState.scheduleProfileBroadcast();
}

function applyLobbyNameFromInput() {
  lobbyState.applyLobbyNameFromInput();
}

function scheduleLobbyNameUpdate() {
  lobbyState.scheduleLobbyNameUpdate();
}

function applyLobbyStageSelection() {
  lobbyState.applyLobbyStageSelection();
  if (lobbyRoom?.meta) {
    lastRoomMetaKey = JSON.stringify(lobbyRoom.meta);
  }
}

function resetMatchState() {
  if (netplayState) {
    netplayState.currentCourse = null;
    netplayState.currentGameSource = null;
    netplayState.currentGameMode = null;
    netplayState.awaitingSnapshot = false;
  }
  matchFlow.resetMatchState();
}

function destroySingleplayerForNetplay() {
  matchFlow.destroySingleplayerForNetplay();
}

function endActiveMatch() {
  matchFlow.endActiveMatch();
}

function endMatchToMenu() {
  matchFlow.endMatchToMenu();
}

function endMatchToLobby() {
  matchFlow.endMatchToLobby();
}

function leaveMatchToLobbyList() {
  void matchFlow.leaveMatchToLobbyList();
}

function handleCourseComplete() {
  matchFlow.handleCourseComplete();
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
  netplayConnectionState?.startLobbyHeartbeat(roomId);
}

function stopLobbyHeartbeat() {
  netplayConnectionState?.stopLobbyHeartbeat();
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
  netplayConnectionState?.clearLobbySignalRetry();
}

function scheduleLobbySignalReconnect() {
  netplayConnectionState?.scheduleLobbySignalReconnect();
}

function resetNetplayConnections({ preserveLobby = false }: { preserveLobby?: boolean } = {}) {
  netplayConnectionState?.resetNetplayConnections({ preserveLobby });
}

function shouldJoinAsSpectator() {
  return netplayConnectionState?.shouldJoinAsSpectator() ?? false;
}

function markPlayerPendingSpawn(playerId: number, stageSeq: number) {
  netplayConnectionState?.markPlayerPendingSpawn(playerId, stageSeq);
}

function promotePendingSpawns(stageSeq: number) {
  netplayConnectionState?.promotePendingSpawns(stageSeq);
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
  return netplaySimSync?.recordInputForFrame(frame, playerId, input) ?? false;
}

function buildInputsForFrame(frame: number) {
  return netplaySimSync?.buildInputsForFrame(frame) ?? new Map<number, QuantizedInput>();
}

function trimNetplayHistory(frame: number) {
  netplaySimSync?.trimNetplayHistory(frame);
}

function rollbackAndResim(startFrame: number) {
  return netplaySimSync?.rollbackAndResim(startFrame) ?? false;
}

function tryApplyPendingSnapshot(stageId: number) {
  netplaySimSync?.tryApplyPendingSnapshot(stageId);
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

async function handleStageLoaded(stageId: number) {
  await stageFlow?.handleStageLoaded(stageId);
}

function getLeaderboardPlayerId(): string {
  return leaderboardSessionFlow.getLeaderboardPlayerId();
}

function getActivePackId(): string | null {
  return leaderboardSessionFlow.getActivePackId();
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
  return leaderboardSessionFlow.isPackAllowed(packId);
}

function buildCourseId(gameSource: GameSource, config: any): string {
  return leaderboardSessionFlow.buildCourseId(gameSource, config);
}

function buildCourseMode(gameSource: GameSource, config: any): 'story' | 'challenge' | 'smb1' {
  return leaderboardSessionFlow.buildCourseMode(gameSource, config);
}

function isFullCourseRun(gameSource: GameSource, config: any): boolean {
  return leaderboardSessionFlow.isFullCourseRun(gameSource, config);
}

function startLeaderboardSession(courseConfig: any) {
  leaderboardSessionFlow.startLeaderboardSession(courseConfig);
}

function handleStageGoal(info: {
  stageId: number;
  goalType: string | null;
  timerFrames: number;
  score: number;
  isBonusStage: boolean;
}) {
  leaderboardSessionFlow.handleStageGoal(info);
}

function handleStageFail(info: {
  stageId: number;
  reason: 'ringout' | 'timeover' | 'manual_reset' | 'skip';
  timerFrames: number;
  score: number;
  isBonusStage: boolean;
}) {
  leaderboardSessionFlow.handleStageFail(info);
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
  snapshotFlow?.requestSnapshot(reason, frame, force);
}

function hostApplyPendingRollback() {
  snapshotFlow?.hostApplyPendingRollback();
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
  netplayMessageFlow?.handleHostMessage(msg);
}

function handleClientMessage(playerId: number, msg: ClientToHostMessage) {
  netplayMessageFlow?.handleClientMessage(playerId, msg);
}

function sendSnapshotToClient(playerId: number, frame?: number) {
  snapshotFlow?.sendSnapshotToClient(playerId, frame);
}

function netplayTick(dtSeconds: number) {
  netplayRuntime?.netplayTick(dtSeconds);
}

function updateNetplayDebugOverlay(nowMs: number) {
  netplayRuntime?.updateNetplayDebugOverlay(nowMs);
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
