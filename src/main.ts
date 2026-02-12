import { mat4, vec3 } from 'gl-matrix';
import { Game, type MultiplayerGameMode } from './game.js';
import { AudioManager } from './audio.js';
import { GAME_SOURCES, S16_TO_RAD, type GameSource } from './shared/constants/index.js';
import ArrayBufferSlice from './noclip/ArrayBufferSlice.js';
import { Camera } from './noclip/Camera.js';
import { GfxDevice } from './noclip/gfx/platform/GfxPlatform.js';
import { createSwapChainForWebGL2 } from './noclip/gfx/platform/GfxPlatformWebGL2.js';
import { GameplaySyncState, Renderer } from './noclip/Render.js';
import { LobbyClient, HostRelay, ClientPeer } from './netplay.js';
import { LeaderboardsClient } from './leaderboards.js';
import type { QuantizedInput } from './determinism.js';
import type {
  FrameBundleMessage,
  PlayerProfile,
  RoomInfo,
  ChatMessage,
} from './netcode_protocol.js';
import type { StageData } from './noclip/SuperMonkeyBall/World.js';
import { HudRenderer } from './hud.js';
import { createDefaultModRegistry } from './mods/index.js';
import { runAppBootstrap } from './app/bootstrap.js';
import { collectMainDomRefs } from './app/main/dom_refs.js';
import {
  clampInt,
  chatTiming,
  isNaomiStage,
  lobbyHeartbeatTiming,
  multiplayerLimits,
  multiplayerModes,
  netplayConstants,
  netplayDebugStorageKey,
  profileTiming,
} from './app/main/constants.js';
import {
  getSmb1StageIdByIndex,
  getSmb2ChallengeStageId,
  getSmb2StoryStageId,
} from './app/leaderboards/course_resolvers.js';
import { LeaderboardsUiController } from './app/leaderboards/ui.js';
import { LeaderboardSessionController, type LeaderboardSession } from './app/leaderboards/session_flow.js';
import { createMainControllerGraph } from './app/composition/main_controller_graph.js';
import { ChatUiController } from './app/netplay/chat_ui.js';
import type { NetplayConnectionStateController } from './app/netplay/connection_state.js';
import { createNetplayDebugState } from './app/netplay/debug_state.js';
import { createNetplayDebugOverlay } from './app/netplay/debug_overlay.js';
import type { LobbyHeartbeatController } from './app/netplay/heartbeat.js';
import type { LobbyBrowserController } from './app/netplay/lobby_browser.js';
import { bindLobbyEventHandlers } from './app/netplay/lobby_bindings.js';
import { createPresenceUiHelpers } from './app/netplay/presence_ui.js';
import { ProfileUiController } from './app/netplay/profile_ui.js';
import type { LobbyStateController } from './app/netplay/lobby_state.js';
import {
  RoomMetaController,
  formatMultiplayerGameModeLabel,
  normalizeMultiplayerGameMode,
} from './app/netplay/room_meta.js';
import type { LobbyUiController } from './app/netplay/lobby_ui.js';
import type { NetplayMessageFlowController } from './app/netplay/message_flow.js';
import { NameplateController } from './app/netplay/nameplates.js';
import type { PeerSessionController } from './app/netplay/peer_session.js';
import type { NetplayRuntimeController } from './app/netplay/runtime.js';
import type { SnapshotFlowController } from './app/netplay/snapshot_flow.js';
import type { NetplayStateSyncController } from './app/netplay/state_sync.js';
import type { NetplaySimulationSyncController } from './app/netplay/simulation_sync.js';
import { formatGameSourceLabel } from './app/netplay/presence_format.js';
import {
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
import type { MatchFlowController } from './app/gameplay/match_flow.js';
import type { MatchStartFlowController } from './app/gameplay/start_flow.js';
import { initRendererGfx, prewarmConfettiRenderer as prewarmConfettiRenderResources, type ViewerInputState } from './app/render/boot.js';
import { resizeCanvasToDisplaySize, startRenderLoop } from './app/render/frame_loop.js';
import { StageLoader } from './app/render/stage_loader.js';
import type { StageFlowController } from './app/render/stage_flow.js';
import { bindUiEventHandlers } from './app/ui/event_bindings.js';
import { InputControlsController, bindRangeControl, bindVolumeControl } from './app/ui/input_controls.js';
import { bindMainUiControls } from './app/ui/main_bindings.js';
import { MenuFlowController, type MenuPanel } from './app/ui/menu_flow.js';
import { createOverlayController } from './app/ui/overlay_controller.js';
import { SettingsTabsController, type SettingsTab } from './app/ui/settings_tabs.js';
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

export function runMainApp() {
  
  const modRegistry = createDefaultModRegistry();
  void modRegistry;
  
  const refs = collectMainDomRefs();
  const {
    canvas,
    hudCanvas,
    overlay,
    mainMenuPanel,
    multiplayerMenuPanel,
    multiplayerIngameMenuPanel,
    settingsMenuPanel,
    levelSelectMenuPanel,
    stageFade,
    mobileMenuButton,
    fullscreenButton,
    controlModeField,
    controlModeSelect,
    gyroRecalibrateButton,
    gyroHelper,
    gyroHelperFrame,
    gyroHelperDevice,
    controlModeSettings,
    gyroSettings,
    touchSettings,
    inputFalloffBlock,
    gamepadCalibrationBlock,
    gyroSensitivityInput,
    gyroSensitivityValue,
    joystickSizeInput,
    joystickSizeValue,
    inputFalloffInput,
    inputFalloffValue,
    inputFalloffCurveWrap,
    inputFalloffPath,
    inputPreview,
    inputRawDot,
    inputProcessedDot,
    gamepadCalibrationOverlay,
    gamepadCalibrationMap,
    gamepadCalibrationButton,
    gamepadCalibrationCtx,
    ingamePlayerList,
    ingameResumeButton,
    ingameLeaveButton,
    startButton,
    resumeButton,
    difficultySelect,
    smb1StageSelect,
    gameSourceSelect,
    packLoadButton,
    packPicker,
    packLoadZipButton,
    packLoadFolderButton,
    packStatus,
    packFileInput,
    packFolderInput,
    replaySaveButton,
    replayLoadButton,
    replayFileInput,
    replayStatus,
    smb1Fields,
    smb2Fields,
    smb2ModeSelect,
    smb2ChallengeSelect,
    smb2ChallengeStageSelect,
    smb2StoryWorldSelect,
    smb2StoryStageSelect,
    interpolationToggle,
    musicVolumeInput,
    sfxVolumeInput,
    announcerVolumeInput,
    musicVolumeValue,
    sfxVolumeValue,
    announcerVolumeValue,
    hudStatus,
    multiplayerOpenButton,
    multiplayerBackButton,
    levelSelectOpenButton,
    levelSelectBackButton,
    leaderboardsOpenButton,
    leaderboardsBackButton,
    settingsOpenButton,
    settingsBackButton,
    settingsTabButtons,
    settingsTabPanels,
    leaderboardsMenuPanel,
    leaderboardTypeSelect,
    leaderboardGoalField,
    leaderboardGoalSelect,
    leaderboardMetricField,
    leaderboardMetricSelect,
    leaderboardWarpField,
    leaderboardWarpSelect,
    leaderboardRefreshButton,
    leaderboardStatus,
    leaderboardList,
    multiplayerOnlineCount,
    multiplayerLayout,
    multiplayerBrowser,
    multiplayerLobby,
    lobbyRefreshButton,
    lobbyCreateButton,
    lobbyJoinButton,
    lobbyPublicCheckbox,
    lobbyNameInput,
    lobbyCodeInput,
    lobbyLeaveButton,
    lobbyStatus,
    lobbyList,
    lobbyRoomInfo,
    lobbyRoomStatus,
    lobbyRoomNameInput,
    lobbyPlayerList,
    lobbyGameModeSelect,
    lobbyMaxPlayersSelect,
    lobbyCollisionToggle,
    lobbyLockToggle,
    lobbyStageButton,
    lobbyStageInfo,
    lobbyStageActions,
    lobbyStageChooseButton,
    lobbyStartButton,
    lobbyChatPanel,
    lobbyChatList,
    lobbyChatInput,
    lobbyChatSendButton,
    ingameChatWrap,
    ingameChatList,
    ingameChatInputRow,
    ingameChatInput,
    profileNameInput,
    profileAvatarInput,
    profileAvatarPreview,
    profileAvatarClearButton,
    profileAvatarError,
    hidePlayerNamesToggle,
    hideLobbyNamesToggle,
    nameplateLayer,
  } = refs;
  
  const packSelection = new PackSelectionController({ gameSourceSelect, packStatus });
  const netplayDebugOverlay = createNetplayDebugOverlay(document.body);
  
  const defaultChallengeOptions = Array.from(smb2ChallengeSelect?.options ?? []).map((option) => ({
    value: option.value,
    label: option.textContent ?? option.value,
  }));
  
  const hasTouch = ('ontouchstart' in window) || ((navigator.maxTouchPoints ?? 0) > 0);
  const profileUi = new ProfileUiController({
    profileNameInput,
    profileAvatarPreview,
    profileAvatarError,
    hidePlayerNamesToggle,
    hideLobbyNamesToggle,
  });
  let inputControls: InputControlsController | null = null;
  
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
    resolveSelectedGameSource: () => packSelection.resolveSelectedGameSource(),
    hasPackForGameSource,
    getPackCourseData,
  });
  
  const stageLoader = new StageLoader({
    fetchSlice,
    getStageBasePath: (gameSource) => packSelection.getStageBasePath(gameSource),
    isNaomiStage,
  });
  
  let currentSmb2LikeMode: 'story' | 'challenge' | null = null;
  
  let overlayController: ReturnType<typeof createOverlayController> | null = null;
  
  function updateMobileMenuButtonVisibility() {
    overlayController?.updateMobileMenuButtonVisibility();
  }
  
  function updateFullscreenButtonVisibility() {
    overlayController?.updateFullscreenButtonVisibility();
  }
  
  function setOverlayVisible(visible: boolean) {
    overlayController?.setOverlayVisible(visible);
  }
  
  function maybeStartSmb2LikeStageFade() {
    overlayController?.maybeStartSmb2LikeStageFade();
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
    packSelection.refreshUi();
    courseSelection.updateSmb2ChallengeStages();
    courseSelection.updateSmb2StoryOptions();
    courseSelection.updateSmb1Stages();
    courseSelection.updateGameSourceFields();
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
    onStageLoadStart: () => {
      matchStartFlow?.handleHostStageLoadStart();
    },
    onStageLoaded: (stageId) => {
      if (netplayEnabled && netplayState) {
        netplaySync?.resetNetplayForStage();
        pendingSnapshot = null;
        netplaySync?.initStageSync(stageId);
        netplayAccumulator = 0;
      }
      void stageFlow?.handleStageLoaded(stageId);
    },
    onStageGoal: (info) => leaderboardSessionFlow.handleStageGoal(info),
    onStageFail: (info) => leaderboardSessionFlow.handleStageFail(info),
    onCourseComplete: () => matchFlow.handleCourseComplete(),
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
    updateGameSourceFields: () => {
      courseSelection.updateGameSourceFields();
    },
    setActiveGameSource: (source) => {
      activeGameSource = source;
    },
    setCurrentSmb2LikeMode: (mode) => {
      currentSmb2LikeMode = mode;
    },
    getStageBasePath: (gameSource) => packSelection.getStageBasePath(gameSource),
  });
  
  let lobbyBrowser: LobbyBrowserController;
  let peerSession: PeerSessionController;
  let matchFlow: MatchFlowController;
  let lobbyState: LobbyStateController;
  
  let lobbyUiController: LobbyUiController | null = null;
  let netplayMessageFlow: NetplayMessageFlowController | null = null;
  let snapshotFlow: SnapshotFlowController | null = null;
  let netplayRuntime: NetplayRuntimeController | null = null;
  let stageFlow: StageFlowController | null = null;
  let nameplates: NameplateController | null = null;
  let netplaySync: NetplayStateSyncController | null = null;
  let netplaySimSync: NetplaySimulationSyncController | null = null;
  let netplayConnectionState: NetplayConnectionStateController | null = null;
  let lobbyHeartbeat: LobbyHeartbeatController | null = null;
  let matchStartFlow: MatchStartFlowController | null = null;
  
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
  
  const lobbyBaseUrl = (window as any).LOBBY_URL ?? "";
  const lobbyClient = lobbyBaseUrl ? new LobbyClient(lobbyBaseUrl) : null;
  const leaderboardBaseUrl = (window as any).LEADERBOARD_URL ?? lobbyBaseUrl;
  const leaderboardsClient = leaderboardBaseUrl ? new LeaderboardsClient(leaderboardBaseUrl) : null;
  
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
  let profileBroadcastTimer: number | null = null;
  let lastProfileBroadcastMs: number | null = null;
  let lobbyNameUpdateTimer: number | null = null;
  let lastLobbyNameUpdateMs: number | null = null;
  let lastRoomMetaKey: string | null = null;
  let lastRoomPlayerCount: number | null = null;
  let privacySettings = { hidePlayerNames: false, hideLobbyNames: false };
  const profileUpdateThrottle = new Map<number, number>();
  type ChatEntry = { id: number; playerId: number; text: string; time: number };
  let chatMessages: ChatEntry[] = [];
  let chatSeq = 0;
  const pendingSpawnStageSeq = new Map<number, number>();
  let lastLocalChatSentMs = 0;
  const chatRateLimitByPlayer = new Map<number, number>();
  let ingameChatOpen = false;
  
  function initControllerGraph(leaderboardSessionFlow: LeaderboardSessionController) {
    const graphState = {
      get lobbyRoom() {
        return lobbyRoom;
      },
      set lobbyRoom(value: LobbyRoom | null) {
        lobbyRoom = value;
      },
      get lobbySelfId() {
        return lobbySelfId;
      },
      set lobbySelfId(value: number | null) {
        lobbySelfId = value;
      },
      get lobbyPlayerToken() {
        return lobbyPlayerToken;
      },
      set lobbyPlayerToken(value: string | null) {
        lobbyPlayerToken = value;
      },
      get lobbyHostToken() {
        return lobbyHostToken;
      },
      set lobbyHostToken(value: string | null) {
        lobbyHostToken = value;
      },
      get lobbySignal() {
        return lobbySignal;
      },
      set lobbySignal(value: { send: (msg: any) => void; close: () => void } | null) {
        lobbySignal = value;
      },
      get lobbySignalRetryTimer() {
        return lobbySignalRetryTimer;
      },
      set lobbySignalRetryTimer(value: number | null) {
        lobbySignalRetryTimer = value;
      },
      get lobbySignalRetryMs() {
        return lobbySignalRetryMs;
      },
      set lobbySignalRetryMs(value: number) {
        lobbySignalRetryMs = value;
      },
      get lobbySignalShouldReconnect() {
        return lobbySignalShouldReconnect;
      },
      set lobbySignalShouldReconnect(value: boolean) {
        lobbySignalShouldReconnect = value;
      },
      get lobbySignalReconnectFn() {
        return lobbySignalReconnectFn;
      },
      set lobbySignalReconnectFn(value: (() => void) | null) {
        lobbySignalReconnectFn = value;
      },
      get hostRelay() {
        return hostRelay;
      },
      set hostRelay(value: HostRelay | null) {
        hostRelay = value;
      },
      get clientPeer() {
        return clientPeer;
      },
      set clientPeer(value: ClientPeer | null) {
        clientPeer = value;
      },
      get netplayEnabled() {
        return netplayEnabled;
      },
      set netplayEnabled(value: boolean) {
        netplayEnabled = value;
      },
      get localProfile() {
        return localProfile;
      },
      set localProfile(value: PlayerProfile) {
        localProfile = value;
      },
      get suppressHostDisconnectUntil() {
        return suppressHostDisconnectUntil;
      },
      set suppressHostDisconnectUntil(value: number) {
        suppressHostDisconnectUntil = value;
      },
      get pendingSnapshot() {
        return pendingSnapshot;
      },
      set pendingSnapshot(value: typeof pendingSnapshot) {
        pendingSnapshot = value;
      },
      get lobbyHeartbeatTimer() {
        return lobbyHeartbeatTimer;
      },
      set lobbyHeartbeatTimer(value: number | null) {
        lobbyHeartbeatTimer = value;
      },
      get lastLobbyHeartbeatMs() {
        return lastLobbyHeartbeatMs;
      },
      set lastLobbyHeartbeatMs(value: number | null) {
        lastLobbyHeartbeatMs = value;
      },
      get netplayAccumulator() {
        return netplayAccumulator;
      },
      set netplayAccumulator(value: number) {
        netplayAccumulator = value;
      },
      get leaderboardSession() {
        return leaderboardSession;
      },
      set leaderboardSession(value: LeaderboardSession | null) {
        leaderboardSession = value;
      },
      get profileBroadcastTimer() {
        return profileBroadcastTimer;
      },
      set profileBroadcastTimer(value: number | null) {
        profileBroadcastTimer = value;
      },
      get lastProfileBroadcastMs() {
        return lastProfileBroadcastMs;
      },
      set lastProfileBroadcastMs(value: number | null) {
        lastProfileBroadcastMs = value;
      },
      get lobbyNameUpdateTimer() {
        return lobbyNameUpdateTimer;
      },
      set lobbyNameUpdateTimer(value: number | null) {
        lobbyNameUpdateTimer = value;
      },
      get lastLobbyNameUpdateMs() {
        return lastLobbyNameUpdateMs;
      },
      set lastLobbyNameUpdateMs(value: number | null) {
        lastLobbyNameUpdateMs = value;
      },
      get lastRoomMetaKey() {
        return lastRoomMetaKey;
      },
      set lastRoomMetaKey(value: string | null) {
        lastRoomMetaKey = value;
      },
      get lastRoomPlayerCount() {
        return lastRoomPlayerCount;
      },
      set lastRoomPlayerCount(value: number | null) {
        lastRoomPlayerCount = value;
      },
      get chatMessages() {
        return chatMessages;
      },
      set chatMessages(value: ChatEntry[]) {
        chatMessages = value;
      },
      get lastLocalChatSentMs() {
        return lastLocalChatSentMs;
      },
      set lastLocalChatSentMs(value: number) {
        lastLocalChatSentMs = value;
      },
      get activeGameSource() {
        return activeGameSource;
      },
      set activeGameSource(value: GameSource) {
        activeGameSource = value;
      },
      get currentSmb2LikeMode() {
        return currentSmb2LikeMode;
      },
      set currentSmb2LikeMode(value: 'story' | 'challenge' | null) {
        currentSmb2LikeMode = value;
      },
      get running() {
        return running;
      },
      set running(value: boolean) {
        running = value;
      },
      get paused() {
        return paused;
      },
      set paused(value: boolean) {
        paused = value;
      },
      get renderReady() {
        return renderReady;
      },
      set renderReady(value: boolean) {
        renderReady = value;
      },
      get lastTime() {
        return lastTime;
      },
      set lastTime(value: number) {
        lastTime = value;
      },
      get netplayState() {
        return netplayState;
      },
      set netplayState(value: NetplayState | null) {
        netplayState = value;
      },
    };
  
    const graph = createMainControllerGraph({
      game,
      audio,
      resumeButton,
      hudStatus,
      lobbyClient,
      lobbyStatus,
      lobbyList,
      multiplayerOnlineCount,
      lobbyPublicCheckbox,
      lobbyCodeInput,
      roomMeta,
      formatMultiplayerGameModeLabel,
      formatGameSourceLabel,
      getRoomDisplayName: presenceUi.getRoomDisplayName,
      normalizeMultiplayerGameMode,
      profileFallbackForPlayer: presenceUi.profileFallbackForPlayer,
      packSelection,
      pendingSpawnStageSeq,
      handleHostDisconnect,
      leaderboardsClient,
      setOverlayVisible,
      setActiveMenu: (menu: MenuPanel) => {
        menuFlow.setActiveMenu(menu);
      },
      updateIngameChatVisibility,
      hideAllNameplates: () => {
        nameplates?.hideAll();
      },
      clearNameplates: () => {
        nameplates?.clear();
      },
      leaderboardSessionFlow,
      saveLocalProfile,
      profileUi,
      sanitizeProfile,
      lobbyMaxPlayersSelect,
      lobbyCollisionToggle,
      lobbyLockToggle,
      lobbyRoomNameInput,
      clampInt,
      sanitizeLobbyName,
      netplayPerf,
      profileUpdateThrottle,
      chatUi,
      resetLocalPlayersAfterNetplay,
      setIngameChatOpen,
      chatRateLimitByPlayer,
      multiplayerBrowser,
      multiplayerLobby,
      multiplayerBackButton,
      lobbyLeaveButton,
      lobbyPlayerList,
      ingamePlayerList,
      lobbyRoomInfo,
      lobbyRoomStatus,
      lobbyGameModeSelect,
      lobbyChatPanel,
      lobbyStartButton,
      levelSelectOpenButton,
      lobbyStageInfo,
      lobbyStageButton,
      lobbyStageActions,
      lobbyStageChooseButton,
      formatRoomInfoLabel: presenceUi.formatRoomInfoLabel,
      getPlayerDisplayName: presenceUi.getPlayerDisplayName,
      createAvatarElement: presenceUi.createAvatarElement,
      kickPlayerFromRoom,
      appendChatMessage,
      sanitizeChatText,
      getAvatarValidationCached: (dataUrl: string) => profileUi.getAvatarValidationCached(dataUrl),
      recordNetplayPerf,
      isNetplayDebugEnabled,
      netplayDebugOverlay,
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
      createRenderer: (stageData: StageData) => {
        if (!gfxDevice) {
          return;
        }
        renderer = new Renderer(gfxDevice, stageData);
      },
      prewarmConfettiRenderer,
      applyGameCamera,
      updateMobileMenuButtonVisibility,
      maybeStartSmb2LikeStageFade,
      loadRenderStage,
      loadRenderStageSmb2,
      prefetchPackSlice,
      isNaomiStage,
      courseSelection,
      getLobbyStartDisabledReason: (isHost: boolean, mode: MultiplayerGameMode) => (
        lobbyUiController?.getLobbyStartDisabledReason(isHost, mode) ?? ''
      ),
      state: graphState,
      lobbyProfiles,
      pendingAvatarByPlayer,
      constants: {
        CHAINED_MAX_PLAYERS: multiplayerLimits.chainedMaxPlayers,
        PROFILE_BROADCAST_COOLDOWN_MS: profileTiming.broadcastCooldownMs,
        LOBBY_NAME_UPDATE_COOLDOWN_MS: profileTiming.lobbyNameUpdateCooldownMs,
        CHAT_INGAME_VISIBLE_MS: chatTiming.ingameVisibleMs,
        CHAT_INGAME_FADE_MS: chatTiming.ingameFadeMs,
        MULTIPLAYER_MODE_STANDARD: multiplayerModes.standard,
        MULTIPLAYER_MODE_CHAINED: multiplayerModes.chained,
        LOBBY_HEARTBEAT_INTERVAL_MS: lobbyHeartbeatTiming.intervalMs,
        LOBBY_HEARTBEAT_FALLBACK_MS: lobbyHeartbeatTiming.fallbackMs,
        PROFILE_REMOTE_COOLDOWN_MS: profileTiming.remoteCooldownMs,
        CHAT_SEND_COOLDOWN_MS: chatTiming.sendCooldownMs,
        NETPLAY_MAX_INPUT_AHEAD: netplayConstants.maxInputAhead,
        NETPLAY_MAX_INPUT_BEHIND: netplayConstants.maxInputBehind,
        NETPLAY_HOST_MAX_INPUT_ROLLBACK: netplayConstants.hostMaxInputRollback,
        NETPLAY_HOST_SNAPSHOT_COOLDOWN_MS: netplayConstants.hostSnapshotCooldownMs,
        NETPLAY_SNAPSHOT_COOLDOWN_MS: netplayConstants.snapshotCooldownMs,
        NETPLAY_SNAPSHOT_MISMATCH_COOLDOWN_MS: netplayConstants.snapshotMismatchCooldownMs,
        NETPLAY_CLIENT_LEAD: netplayConstants.clientLead,
        NETPLAY_MAX_FRAME_DELTA: netplayConstants.maxFrameDelta,
        NETPLAY_CLIENT_AHEAD_SLACK: netplayConstants.clientAheadSlack,
        NETPLAY_CLIENT_RATE_MIN: netplayConstants.clientRateMin,
        NETPLAY_CLIENT_RATE_MAX: netplayConstants.clientRateMax,
        NETPLAY_CLIENT_DRIFT_RATE: netplayConstants.clientDriftRate,
        NETPLAY_DRIFT_FORCE_TICK: netplayConstants.driftForceTick,
        NETPLAY_DRIFT_EXTRA_TICKS: netplayConstants.driftExtraTicks,
        NETPLAY_SYNC_RATE_MIN: netplayConstants.syncRateMin,
        NETPLAY_SYNC_RATE_MAX: netplayConstants.syncRateMax,
        NETPLAY_SYNC_DRIFT_RATE: netplayConstants.syncDriftRate,
        NETPLAY_SYNC_FORCE_TICK: netplayConstants.syncForceTick,
        NETPLAY_SYNC_EXTRA_TICKS: netplayConstants.syncExtraTicks,
        NETPLAY_SYNC_MAX_TICKS: netplayConstants.syncMaxTicks,
        NETPLAY_PING_INTERVAL_MS: netplayConstants.pingIntervalMs,
        NETPLAY_HOST_STALL_MS: netplayConstants.hostStallMs,
        NETPLAY_LAG_FUSE_FRAMES: netplayConstants.lagFuseFrames,
        NETPLAY_LAG_FUSE_MS: netplayConstants.lagFuseMs,
        NETPLAY_HOST_SNAPSHOT_BEHIND_FRAMES: netplayConstants.hostSnapshotBehindFrames,
        NETPLAY_CLIENT_MAX_EXTRA_LEAD: netplayConstants.clientMaxExtraLead,
        NETPLAY_STAGE_READY_RESEND_MS: netplayConstants.stageReadyResendMs,
        NETPLAY_STAGE_READY_TIMEOUT_MS: netplayConstants.stageReadyTimeoutMs,
        LOBBY_MAX_PLAYERS: multiplayerLimits.lobbyMaxPlayers,
      },
    });
  
    lobbyBrowser = graph.lobbyBrowser;
    peerSession = graph.peerSession;
    matchFlow = graph.matchFlow;
    lobbyState = graph.lobbyState;
    lobbyUiController = graph.lobbyUiController;
    netplayMessageFlow = graph.netplayMessageFlow;
    snapshotFlow = graph.snapshotFlow;
    netplayRuntime = graph.netplayRuntime;
    stageFlow = graph.stageFlow;
    netplaySync = graph.netplaySync;
    netplaySimSync = graph.netplaySimSync;
    netplayConnectionState = graph.netplayConnectionState;
    lobbyHeartbeat = graph.lobbyHeartbeat;
    matchStartFlow = graph.matchStartFlow;
  }
  
  const {
    netplayPerf,
    recordNetplayPerf,
    isNetplayDebugEnabled,
  } = createNetplayDebugState({
    enabled: perfEnabled,
    storageKey: netplayDebugStorageKey,
    game,
  });
  
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
  const roomMeta = new RoomMetaController({
    getNetplayState: () => netplayState,
    getActiveGameSource: () => activeGameSource,
    getCurrentStageId: () => game.stage?.stageId,
    resolveSelectedGameSource: () => packSelection.resolveSelectedGameSource(),
    buildSmb1CourseConfig: () => courseSelection.buildSmb1CourseConfig(),
    buildSmb2CourseConfig: () => courseSelection.buildSmb2CourseConfig(),
    buildMb2wsCourseConfig: () => courseSelection.buildMb2wsCourseConfig(),
    lobbyGameModeSelect,
    lobbyRoomNameInput,
    lobbyNameInput,
    getLobbyRoom: () => lobbyRoom,
    sanitizeLobbyName,
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
    if (chatMessages.length > chatTiming.maxMessages) {
      chatMessages = chatMessages.slice(-chatTiming.maxMessages);
    }
    chatUi.updateChatUi(chatMessages, chatTiming.ingameVisibleMs, chatTiming.ingameFadeMs);
  }
  
  const chatUi = new ChatUiController({
    lobbyChatList,
    ingameChatList,
    ingameChatWrap,
    ingameChatInputRow,
    ingameChatInput,
    getDisplayName: (playerId) => {
      const profile = lobbyProfiles.get(playerId) ?? presenceUi.profileFallbackForPlayer(playerId);
      return presenceUi.getPlayerDisplayName(playerId, profile);
    },
    clearKeyboardState: () => {
      game.input?.clearKeyboardState?.();
    },
  });
  
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
    if ((nowMs - lastLocalChatSentMs) < chatTiming.sendCooldownMs) {
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
    chatUi.setIngameChatOpen(open, chatMessages, chatTiming.ingameVisibleMs, chatTiming.ingameFadeMs);
  }
  
  function updateIngameChatVisibility() {
    const overlayVisible = !overlay.classList.contains('hidden');
    chatUi.updateIngameVisibility(
      netplayEnabled,
      running,
      overlayVisible,
      chatMessages,
      chatTiming.ingameVisibleMs,
      chatTiming.ingameFadeMs,
    );
    ingameChatOpen = chatUi.isIngameChatOpen();
  }
  
  const presenceUi = createPresenceUiHelpers({
    getPrivacySettings: () => privacySettings,
    getLobbyRoomId: () => lobbyRoom?.roomId ?? 'solo',
  });
  
  nameplates = new NameplateController({
    game,
    canvas,
    overlay,
    getRunning: () => running,
    isNetplayEnabled: () => netplayEnabled,
    getCamera: () => camera,
    layer: nameplateLayer,
    getProfile: (playerId) => lobbyProfiles.get(playerId) ?? presenceUi.profileFallbackForPlayer(playerId),
    getPlayerDisplayName: presenceUi.getPlayerDisplayName,
    createAvatarElement: presenceUi.createAvatarElement,
  });
  
  const settingsTabs = new SettingsTabsController({
    buttons: settingsTabButtons,
    panels: settingsTabPanels,
    initialTab: 'input',
  });
  
  function updateSettingsUi() {
    // Settings UI currently only depends on stored values.
  }
  
  overlayController = createOverlayController({
    canvas,
    overlay,
    stageFade,
    mobileMenuButton,
    fullscreenButton,
    hasTouch,
    getRunning: () => running,
    getActiveGameSource: () => activeGameSource,
    getCurrentSmb2LikeMode: () => currentSmb2LikeMode,
    blurActiveInput: () => {
      chatUi.blurActiveInput();
    },
    updateIngameChatVisibility,
    syncTouchPreviewVisibility: () => {
      inputControls?.syncTouchPreviewVisibility();
    },
  });
  
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
    resolveSelectedGameSource: () => packSelection.resolveSelectedGameSource(),
    getActivePackId: () => leaderboardSessionFlow.getActivePackId(),
    getSmb1StageIdByIndex: (index) => getSmb1StageIdByIndex(String(difficultySelect?.value ?? 'beginner'), index),
    getSmb2StoryStageId,
    getSmb2ChallengeStageId,
    buildCourseConfig: (gameSource) => {
      if (gameSource === GAME_SOURCES.MB2WS) {
        return courseSelection.buildMb2wsCourseConfig();
      }
      if (gameSource === GAME_SOURCES.SMB2) {
        return courseSelection.buildSmb2CourseConfig();
      }
      return { difficulty: String(difficultySelect?.value ?? 'beginner'), stageIndex: 0 };
    },
    buildCourseId: (gameSource, config) => leaderboardSessionFlow.buildCourseId(gameSource, config),
    buildCourseMode: (gameSource, config) => leaderboardSessionFlow.buildCourseMode(gameSource, config),
  });
  
  const menuFlow = new MenuFlowController({
    mainMenuPanel,
    multiplayerLayout,
    multiplayerMenuPanel,
    multiplayerIngameMenuPanel,
    settingsMenuPanel,
    levelSelectMenuPanel,
    leaderboardsMenuPanel,
    onMenuChanged: () => {
      lobbyUiController?.updateLobbyUi();
      inputControls?.syncTouchPreviewVisibility();
    },
    onOpenMultiplayerMenu: () => {
      if (lobbyClient) {
        void lobbyBrowser.refreshLobbyList();
      }
    },
    onOpenSettingsMenu: () => {
      updateSettingsUi();
    },
    onOpenLevelSelectMenu: () => {
      lobbyUiController?.updateLevelSelectUi();
    },
    onOpenLeaderboardsMenu: () => {
      leaderboardsUi.updateUi();
      void leaderboardsUi.refresh();
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
  
  initControllerGraph(leaderboardSessionFlow);
  
  function openSettingsMenu(tab?: SettingsTab) {
    const currentMenu = menuFlow.getActiveMenu();
    if (currentMenu !== 'settings') {
      settingsTabs.setSettingsReturnMenu(currentMenu);
    }
    if (tab) {
      settingsTabs.setSettingsTab(tab);
    }
    menuFlow.setActiveMenu('settings');
  }
  
  function openLevelSelectMenu(returnMenu?: MenuPanel) {
    const currentMenu = menuFlow.getActiveMenu();
    if (currentMenu !== 'level-select') {
      settingsTabs.setLevelSelectReturnMenu(returnMenu ?? currentMenu);
    }
    menuFlow.setActiveMenu('level-select');
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
      if (netplayState) {
        netplayState.currentCourse = null;
        netplayState.currentGameSource = null;
        netplayState.currentGameMode = null;
        netplayState.awaitingSnapshot = false;
      }
      matchFlow.resetMatchState();
      matchFlow.endActiveMatch();
      setOverlayVisible(true);
    }
    netplayConnectionState?.resetNetplayConnections();
    menuFlow.setActiveMenu('multiplayer');
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
  
  localProfile = loadLocalProfile();
  profileUi.updateProfileUi(localProfile);
  privacySettings = loadPrivacySettings();
  profileUi.updatePrivacyUi(privacySettings);
  settingsTabs.setSettingsTab(settingsTabs.getActiveSettingsTab());
  chatUi.updateChatUi(chatMessages, chatTiming.ingameVisibleMs, chatTiming.ingameFadeMs);
  void refreshLeaderboardAllowlist();
  if (leaderboardsOpenButton) {
    leaderboardsOpenButton.disabled = !leaderboardsClient;
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
      lobbyHeartbeat?.broadcastRoomUpdate();
      lobbyHeartbeat?.sendLobbyHeartbeat(performance.now(), true);
    }, 80);
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
    refreshPackUi: () => packSelection.refreshUi(),
    syncPackEnabled: () => packSelection.syncEnabled(),
    initPackFromQuery,
    onPackReady: () => {
      courseSelection.updateSmb2ChallengeStages();
      courseSelection.updateSmb2StoryOptions();
      courseSelection.updateSmb1Stages();
      courseSelection.updateGameSourceFields();
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
    onUpdateSmb2ModeFields: () => courseSelection.updateSmb2ModeFields(),
    onUpdateSmb2ChallengeStages: () => courseSelection.updateSmb2ChallengeStages(),
    onUpdateSmb2StoryOptions: () => courseSelection.updateSmb2StoryOptions(),
    onUpdateSmb1Stages: () => courseSelection.updateSmb1Stages(),
    onSyncPackEnabled: () => packSelection.syncEnabled(),
    onUpdateGameSourceFields: () => courseSelection.updateGameSourceFields(),
    onUpdateControlModeSettingsVisibility: () => inputControls?.updateControlModeSettingsVisibility(),
    onSyncTouchPreviewVisibility: () => inputControls?.syncTouchPreviewVisibility(),
    onUpdateFullscreenButtonVisibility: updateFullscreenButtonVisibility,
    onStartGamepadCalibration: () => inputControls?.startGamepadCalibration(),
    onStopGamepadCalibration: () => inputControls?.stopGamepadCalibration(),
    onSetActiveMenu: (menu) => {
      menuFlow.setActiveMenu(menu);
    },
    onOpenLevelSelectMenu: openLevelSelectMenu,
    onOpenSettingsMenu: () => openSettingsMenu(),
    getLevelSelectReturnMenu: () => settingsTabs.getLevelSelectReturnMenu(),
    getSettingsReturnMenu: () => settingsTabs.getSettingsReturnMenu(),
    onUpdateLeaderboardsUi: () => {
      leaderboardsUi.updateUi();
    },
    onRefreshLeaderboards: () => {
      void leaderboardsUi.refresh();
    },
    onSetSettingsTab: (tab) => {
      settingsTabs.setSettingsTab(tab);
    },
    setInterpolationEnabled: (enabled) => {
      interpolationEnabled = enabled;
    },
  });
  
  bindUiEventHandlers({
    startButton,
    onStartRequest: () => {
      matchStartFlow?.handleStartRequest();
    },
    resumeButton,
    ingameResumeButton,
    ingameLeaveButton,
    onCloseMenuOverlay: () => {
      menuFlow.closeMenuOverlay();
    },
    onLeaveMatchToLobbyList: () => {
      void matchFlow.leaveMatchToLobbyList();
    },
    gyroRecalibrateButton,
    onGyroRecalibrate: () => {
      game.input?.recalibrateGyro?.();
    },
    mobileMenuButton,
    isNetplayEnabled: () => netplayEnabled,
    onOpenMenuOverlay: (preferredMenu) => {
      menuFlow.openMenuOverlay(preferredMenu);
    },
    isIngameChatOpen: () => ingameChatOpen,
    setIngameChatOpen,
    isRunning: () => running,
    overlay,
    isTextInputElement: (el) => chatUi.isTextInputElement(el),
    blurActiveInput: () => {
      chatUi.blurActiveInput();
    },
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
      void lobbyBrowser.refreshLobbyList();
    },
    onCreateRoom: () => {
      void lobbyBrowser.createRoom();
    },
    onJoinRoomByCode: () => {
      void lobbyBrowser.joinRoomByCode();
    },
    onLeaveRoom: () => {
      void lobbyBrowser.leaveRoom();
    },
    onApplyLobbyGameModeFromInputs: () => {
      lobbyState.applyLobbyGameModeFromInputs();
    },
    onApplyLobbySettingsFromInputs: () => {
      lobbyState.applyLobbySettingsFromInputs();
    },
    onProfileNameInput: (value, input) => {
      const sanitized = sanitizeProfileName(value);
      if (sanitized !== input.value) {
        input.value = sanitized;
      }
      if (sanitized !== localProfile.name) {
        localProfile = { ...localProfile, name: sanitized };
        saveLocalProfile(localProfile);
        lobbyState.scheduleProfileBroadcast();
      }
    },
    onProfileAvatarChange: async (file) => {
      if (!file) {
        return;
      }
      const dataUrl = await validateAvatarFile(file, (message) => {
        profileUi.setAvatarError(message);
      });
      if (!dataUrl) {
        return;
      }
      localProfile = { ...localProfile, avatarData: dataUrl };
      saveLocalProfile(localProfile);
      profileUi.updateProfileUi(localProfile);
      lobbyState.scheduleProfileBroadcast();
    },
    onProfileAvatarClear: () => {
      if (!localProfile.avatarData) {
        return;
      }
      localProfile = { ...localProfile, avatarData: undefined };
      saveLocalProfile(localProfile);
      profileUi.updateProfileUi(localProfile);
      lobbyState.scheduleProfileBroadcast();
      profileUi.setAvatarError();
    },
    onHidePlayerNamesChange: (checked) => {
      privacySettings = { ...privacySettings, hidePlayerNames: checked };
      savePrivacySettings(privacySettings);
      lobbyUiController?.updateLobbyUi();
    },
    onHideLobbyNamesChange: (checked) => {
      privacySettings = { ...privacySettings, hideLobbyNames: checked };
      savePrivacySettings(privacySettings);
      lobbyUiController?.updateLobbyUi();
      void lobbyBrowser.refreshLobbyList();
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
    onLobbyRoomNameCommit: () => {
      lobbyState.scheduleLobbyNameUpdate();
    },
    onSendChatMessage: sendChatMessage,
    onOpenMultiplayerLevelSelect: () => {
      openLevelSelectMenu('multiplayer');
    },
    onApplyLobbyStageSelection: () => {
      lobbyState.applyLobbyStageSelection();
      if (lobbyRoom?.meta) {
        lastRoomMetaKey = JSON.stringify(lobbyRoom.meta);
      }
    },
    onSetActiveMenuMultiplayer: () => {
      menuFlow.setActiveMenu('multiplayer');
    },
    onSetIngameChatOpen: setIngameChatOpen,
    onStartRequest: () => {
      matchStartFlow?.handleStartRequest();
    },
  });
  if (lobbyClient) {
    void lobbyBrowser.refreshLobbyList();
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
    netplayTick: (dtSeconds) => {
      netplayRuntime?.netplayTick(dtSeconds);
    },
    updateNetplayDebugOverlay: (nowMs) => {
      netplayRuntime?.updateNetplayDebugOverlay(nowMs);
    },
    sendLobbyHeartbeat: (now) => {
      lobbyHeartbeat?.sendLobbyHeartbeat(now);
    },
    applyGameCamera,
    updateNameplates: (interpolationAlpha) => {
      nameplates?.update(interpolationAlpha);
    },
    onBeforeTick: (now) => {
      inputControls?.updateGyroHelper();
      inputControls?.maybeUpdateControlModeSettings(now);
      inputControls?.updateInputPreview();
      inputControls?.updateGamepadCalibration();
    },
  });
}

runMainApp();
