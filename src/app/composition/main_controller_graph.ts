import { MatchFlowController } from '../gameplay/match_flow.js';
import { MatchStartFlowController } from '../gameplay/start_flow.js';
import { NetplayConnectionStateController } from '../netplay/connection_state.js';
import { LobbyHeartbeatController } from '../netplay/heartbeat.js';
import { LobbyBrowserController } from '../netplay/lobby_browser.js';
import { LobbyStateController } from '../netplay/lobby_state.js';
import { LobbyUiController } from '../netplay/lobby_ui.js';
import { NetplayMessageFlowController } from '../netplay/message_flow.js';
import { PeerSessionController } from '../netplay/peer_session.js';
import { NetplayRuntimeController } from '../netplay/runtime.js';
import { SnapshotFlowController } from '../netplay/snapshot_flow.js';
import { NetplayStateSyncController } from '../netplay/state_sync.js';
import { NetplaySimulationSyncController } from '../netplay/simulation_sync.js';
import { StageFlowController } from '../render/stage_flow.js';

export function createMainControllerGraph(args: any) {
  const {
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
    getRoomDisplayName,
    normalizeMultiplayerGameMode,
    profileFallbackForPlayer,
    packSelection,
    pendingSpawnStageSeq,
    handleHostDisconnect,
    leaderboardsClient,
    setOverlayVisible,
    setActiveMenu,
    updateIngameChatVisibility,
    hideAllNameplates,
    clearNameplates,
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
    levelSelectActions,
    levelSelectConfirmButton,
    lobbyStageInfo,
    lobbyStageButton,
    lobbyStageActions,
    lobbyStageChooseButton,
    formatRoomInfoLabel,
    getPlayerDisplayName,
    createAvatarElement,
    kickPlayerFromRoom,
    appendChatMessage,
    sanitizeChatText,
    getAvatarValidationCached,
    isNetplayDebugEnabled,
    netplayDebugOverlay,
    ensureGfxReady,
    hasGfxDevice,
    destroyRenderer,
    createRenderer,
    prewarmConfettiRenderer,
    applyGameCamera,
    updateMobileMenuButtonVisibility,
    maybeStartSmb2LikeStageFade,
    loadRenderStage,
    loadRenderStageSmb2,
    prefetchPackSlice,
    isNaomiStage,
    courseSelection,
    getLobbyStartDisabledReason,
    state,
    lobbyProfiles,
    pendingAvatarByPlayer,
  } = args;

  const {
    CHAINED_MAX_PLAYERS,
    PROFILE_BROADCAST_COOLDOWN_MS,
    LOBBY_NAME_UPDATE_COOLDOWN_MS,
    CHAT_INGAME_VISIBLE_MS,
    CHAT_INGAME_FADE_MS,
    MULTIPLAYER_MODE_STANDARD,
    MULTIPLAYER_MODE_CHAINED,
    LOBBY_HEARTBEAT_INTERVAL_MS,
    LOBBY_HEARTBEAT_FALLBACK_MS,
    PROFILE_REMOTE_COOLDOWN_MS,
    CHAT_SEND_COOLDOWN_MS,
    NETPLAY_MAX_INPUT_AHEAD,
    NETPLAY_MAX_INPUT_BEHIND,
    NETPLAY_HOST_MAX_INPUT_ROLLBACK,
    NETPLAY_HOST_SNAPSHOT_COOLDOWN_MS,
    NETPLAY_SNAPSHOT_COOLDOWN_MS,
    NETPLAY_SNAPSHOT_MISMATCH_COOLDOWN_MS,
    NETPLAY_CLIENT_LEAD,
    NETPLAY_MAX_FRAME_DELTA,
    NETPLAY_CLIENT_AHEAD_SLACK,
    NETPLAY_CLIENT_RATE_MIN,
    NETPLAY_CLIENT_RATE_MAX,
    NETPLAY_CLIENT_DRIFT_RATE,
    NETPLAY_DRIFT_FORCE_TICK,
    NETPLAY_DRIFT_EXTRA_TICKS,
    NETPLAY_SYNC_RATE_MIN,
    NETPLAY_SYNC_RATE_MAX,
    NETPLAY_SYNC_DRIFT_RATE,
    NETPLAY_SYNC_FORCE_TICK,
    NETPLAY_SYNC_EXTRA_TICKS,
    NETPLAY_SYNC_MAX_TICKS,
    NETPLAY_PING_INTERVAL_MS,
    NETPLAY_HOST_STALL_MS,
    NETPLAY_LAG_FUSE_FRAMES,
    NETPLAY_LAG_FUSE_MS,
    NETPLAY_HOST_SNAPSHOT_BEHIND_FRAMES,
    NETPLAY_CLIENT_MAX_EXTRA_LEAD,
    NETPLAY_STAGE_READY_RESEND_MS,
    NETPLAY_STAGE_READY_TIMEOUT_MS,
    LOBBY_MAX_PLAYERS,
  } = args.constants;

  let lobbyUiController: LobbyUiController | null = null;
  let netplayMessageFlow: NetplayMessageFlowController | null = null;
  let snapshotFlow: SnapshotFlowController | null = null;
  let netplayRuntime: NetplayRuntimeController | null = null;
  let stageFlow: StageFlowController | null = null;
  let netplaySync: NetplayStateSyncController | null = null;
  let netplaySimSync: NetplaySimulationSyncController | null = null;
  let netplayConnectionState: NetplayConnectionStateController | null = null;
  let lobbyHeartbeat: LobbyHeartbeatController | null = null;
  let matchStartFlow: MatchStartFlowController | null = null;

const lobbyBrowser = new LobbyBrowserController({
  lobbyClient,
  lobbyStatus,
  lobbyList,
  multiplayerOnlineCount,
  lobbyPublicCheckbox,
  lobbyCodeInput,
  getLobbyRoom: () => state.lobbyRoom,
  setLobbyRoom: (room) => {
    state.lobbyRoom = room;
  },
  getLobbySelfId: () => state.lobbySelfId,
  setLobbySelfId: (id) => {
    state.lobbySelfId = id;
  },
  getLobbyPlayerToken: () => state.lobbyPlayerToken,
  setLobbyPlayerToken: (token) => {
    state.lobbyPlayerToken = token;
  },
  getLobbyHostToken: () => state.lobbyHostToken,
  setLobbyHostToken: (token) => {
    state.lobbyHostToken = token;
  },
  getNetplayRole: () => state.netplayState?.role ?? null,
  getLobbySelectedGameMode: () => roomMeta.getLobbySelectedGameMode(),
  getRoomGameMode: (room) => roomMeta.getRoomGameMode(room),
  formatMultiplayerGameModeLabel,
  formatGameSourceLabel,
  getRoomDisplayName,
  buildRoomMetaForCreation: () => roomMeta.buildRoomMetaForCreation(),
  destroySingleplayerForNetplay: () => {
    matchFlow.destroySingleplayerForNetplay();
  },
  startHost: (room, playerToken) => {
    peerSession.startHost(room, playerToken);
  },
  startClient: async (room, playerId, playerToken) => {
    await peerSession.startClient(room, playerId, playerToken);
  },
  resetNetplayConnections: () => {
    netplayConnectionState?.resetNetplayConnections();
  },
  clearLobbySignalRetry: () => {
    netplayConnectionState?.clearLobbySignalRetry();
  },
  setLobbySignalShouldReconnect: (enabled) => {
    state.lobbySignalShouldReconnect = enabled;
    if (!enabled) {
      state.lobbySignalReconnectFn = null;
    }
  },
});

const peerSession = new PeerSessionController({
  lobbyClient,
  lobbyStatus,
  game,
  chainedMaxPlayers: CHAINED_MAX_PLAYERS,
  getLobbyRoom: () => state.lobbyRoom,
  getLobbyHostToken: () => state.lobbyHostToken,
  getLobbySignalShouldReconnect: () => state.lobbySignalShouldReconnect,
  setLobbySignalShouldReconnect: (enabled) => {
    state.lobbySignalShouldReconnect = enabled;
  },
  getLobbySignal: () => state.lobbySignal,
  setLobbySignal: (signal) => {
    state.lobbySignal = signal;
  },
  getLobbySignalReconnectFn: () => state.lobbySignalReconnectFn,
  setLobbySignalReconnectFn: (fn) => {
    state.lobbySignalReconnectFn = fn;
  },
  clearLobbySignalRetry: () => {
    netplayConnectionState?.clearLobbySignalRetry();
  },
  scheduleLobbySignalReconnect: () => {
    netplayConnectionState?.scheduleLobbySignalReconnect();
  },
  ensureNetplayState: (role) => {
    if (!netplaySync) {
      throw new Error('Netplay sync controller unavailable');
    }
    return netplaySync.ensureNetplayState(role);
  },
  getNetplayState: () => state.netplayState,
  setNetplayEnabled: (enabled) => {
    state.netplayEnabled = enabled;
  },
  getRoomGameMode: (room) => roomMeta.getRoomGameMode(room),
  applyLocalProfileToSession: () => {
    lobbyState.applyLocalProfileToSession();
  },
  normalizeMultiplayerGameMode,
  shouldJoinAsSpectator: () => netplayConnectionState?.shouldJoinAsSpectator() ?? false,
  markPlayerPendingSpawn: (playerId, stageSeq) => {
    netplayConnectionState?.markPlayerPendingSpawn(playerId, stageSeq);
  },
  profileFallbackForPlayer,
  lobbyProfiles,
  pendingAvatarByPlayer,
  pendingSpawnStageSeq,
  maybeSendStageSync: () => {
    netplaySync?.maybeSendStageSync();
  },
  getStageBasePath: (gameSource) => packSelection.getStageBasePath(gameSource),
  sendSnapshotToClient: (playerId) => {
    snapshotFlow?.sendSnapshotToClient(playerId);
  },
  broadcastRoomUpdate: () => {
    lobbyHeartbeat?.broadcastRoomUpdate();
  },
  sendLobbyHeartbeat: (nowMs, force) => {
    lobbyHeartbeat?.sendLobbyHeartbeat(nowMs, force);
  },
  updateLobbyUi: () => {
    lobbyUiController?.updateLobbyUi();
  },
  startLobbyHeartbeat: (roomId) => {
    netplayConnectionState?.startLobbyHeartbeat(roomId);
  },
  broadcastLocalProfile: () => {
    lobbyState.broadcastLocalProfile();
  },
  handleClientMessage: (playerId, msg) => {
    netplayMessageFlow?.handleClientMessage(playerId, msg);
  },
  handleHostMessage: (msg) => {
    netplayMessageFlow?.handleHostMessage(msg);
  },
  handleHostDisconnect,
  getHostRelay: () => state.hostRelay,
  setHostRelay: (relay) => {
    state.hostRelay = relay;
  },
  getClientPeer: () => state.clientPeer,
  setClientPeer: (peer) => {
    state.clientPeer = peer;
  },
});

const matchFlow = new MatchFlowController({
  game,
  resumeButton,
  hudStatus,
  hideAllNameplates: () => {
    hideAllNameplates();
  },
  isRunning: () => state.running,
  setRunning: (value) => {
    state.running = value;
  },
  isNetplayEnabled: () => state.netplayEnabled,
  isHost: () => state.netplayState?.role === 'host',
  getLobbyRoom: () => state.lobbyRoom,
  setLobbyRoomMeta: (meta) => {
    if (state.lobbyRoom) {
      state.lobbyRoom.meta = meta;
    }
  },
  buildRoomMeta: () => roomMeta.buildRoomMeta(),
  broadcastRoomUpdate: () => {
    lobbyHeartbeat?.broadcastRoomUpdate();
  },
  sendLobbyHeartbeat: (nowMs, force) => {
    lobbyHeartbeat?.sendLobbyHeartbeat(nowMs, force);
  },
  hostBroadcast: (msg) => {
    state.hostRelay?.broadcast(msg);
  },
  setOverlayVisible,
  setActiveMenu: (menu) => {
    setActiveMenu(menu);
  },
  leaveRoom: async (opts) => {
    await lobbyBrowser.leaveRoom(opts?.skipConfirm);
  },
  updateLobbyUi: () => {
    lobbyUiController?.updateLobbyUi();
  },
  updateIngameChatVisibility,
  resetNetplayForStage: () => {
    netplaySync?.resetNetplayForStage();
    state.pendingSnapshot = null;
  },
  leaderboardsClient,
  getLeaderboardSession: () => state.leaderboardSession,
  setLeaderboardSession: (session) => {
    state.leaderboardSession = session;
  },
  getPendingSnapshot: () => state.pendingSnapshot,
  setPendingSnapshot: (snapshot) => {
    state.pendingSnapshot = snapshot;
  },
  getLocalProfileName: () => state.localProfile?.name ?? 'Player',
  isPackAllowed: (packId) => leaderboardSessionFlow.isPackAllowed(packId),
  getLeaderboardPlayerId: () => leaderboardSessionFlow.getLeaderboardPlayerId(),
});

const lobbyState = new LobbyStateController({
  game,
  lobbyProfiles,
  localProfile: () => state.localProfile,
  setLocalProfile: (profile) => {
    state.localProfile = profile;
  },
  saveLocalProfile,
  updateLobbyUi: () => {
    lobbyUiController?.updateLobbyUi();
  },
  updateProfileUi: () => {
    profileUi.updateProfileUi(state.localProfile);
  },
  sanitizeProfile,
  netplayRole: () => state.netplayState?.role ?? null,
  hostRelay: () => state.hostRelay,
  clientPeer: () => state.clientPeer,
  setLastProfileBroadcastMs: (value) => {
    state.lastProfileBroadcastMs = value;
  },
  getLastProfileBroadcastMs: () => state.lastProfileBroadcastMs,
  profileBroadcastCooldownMs: PROFILE_BROADCAST_COOLDOWN_MS,
  getProfileBroadcastTimer: () => state.profileBroadcastTimer,
  setProfileBroadcastTimer: (id) => {
    state.profileBroadcastTimer = id;
  },
  lobbyRoom: () => state.lobbyRoom,
  isHost: () => state.netplayState?.role === 'host',
  lobbyMaxPlayersSelect,
  lobbyCollisionToggle,
  lobbyLockToggle,
  lobbyRoomNameInput,
  clampInt,
  getLobbyRoomGameMode: () => roomMeta.getLobbyRoomGameMode(),
  getLobbySelectedGameMode: () => roomMeta.getLobbySelectedGameMode(),
  chainedMaxPlayers: CHAINED_MAX_PLAYERS,
  lobbyMaxPlayers: LOBBY_MAX_PLAYERS,
  broadcastRoomUpdate: () => {
    lobbyHeartbeat?.broadcastRoomUpdate();
  },
  sendLobbyHeartbeat: (nowMs, force) => {
    lobbyHeartbeat?.sendLobbyHeartbeat(nowMs, force);
  },
  buildRoomMeta: () => roomMeta.buildRoomMeta(),
  setLastLobbyNameUpdateMs: (value) => {
    state.lastLobbyNameUpdateMs = value;
  },
  getLastLobbyNameUpdateMs: () => state.lastLobbyNameUpdateMs,
  lobbyNameUpdateCooldownMs: LOBBY_NAME_UPDATE_COOLDOWN_MS,
  getLobbyNameUpdateTimer: () => state.lobbyNameUpdateTimer,
  setLobbyNameUpdateTimer: (id) => {
    state.lobbyNameUpdateTimer = id;
  },
  sanitizeLobbyName,
  applyGameMode: (mode, maxPlayers, collisionEnabled) => {
    game.maxPlayers = maxPlayers;
    if (collisionEnabled !== undefined) {
      game.playerCollisionEnabled = collisionEnabled;
    }
    game.setMultiplayerGameMode(mode);
    if (state.netplayState) {
      state.netplayState.currentGameMode = mode;
    }
  },
});
netplaySync = new NetplayStateSyncController({
  game,
  setNetplayState: (nextState) => {
    state.netplayState = nextState;
  },
  getNetplayState: () => state.netplayState,
  getHostRelay: () => state.hostRelay,
  getClientPeer: () => state.clientPeer,
  setNetplayAccumulator: (value) => {
    state.netplayAccumulator = value;
  },
  normalizeMultiplayerGameMode,
  getActiveGameSource: () => state.activeGameSource,
  getStageBasePath: (gameSource) => packSelection.getStageBasePath(gameSource),
  getLobbyRoom: () => state.lobbyRoom,
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
  getNetplayState: () => state.netplayState,
  getPendingSnapshot: () => state.pendingSnapshot,
  setPendingSnapshot: (snapshot) => {
    state.pendingSnapshot = snapshot;
  },
  getSimHash: () => netplaySync?.getSimHash() ?? 0,
  resetNetplaySession: () => {
    netplaySync?.resetNetplaySession();
  },
  quantizedEqual: (a, b) => netplaySync?.quantizedEqual(a, b) ?? (a.x === b.x && a.y === b.y && (a.buttons ?? 0) === (b.buttons ?? 0)),
});
netplayConnectionState = new NetplayConnectionStateController({
  game,
  getRunning: () => state.running,
  getLobbyClient: () => lobbyClient,
  getLobbyRoom: () => state.lobbyRoom,
  setLobbyRoom: (room) => {
    state.lobbyRoom = room;
  },
  getLobbySelfId: () => state.lobbySelfId,
  setLobbySelfId: (id) => {
    state.lobbySelfId = id;
  },
  getLobbyPlayerToken: () => state.lobbyPlayerToken,
  setLobbyPlayerToken: (token) => {
    state.lobbyPlayerToken = token;
  },
  setLobbyHostToken: (token) => {
    state.lobbyHostToken = token;
  },
  getLobbyHeartbeatTimer: () => state.lobbyHeartbeatTimer,
  setLobbyHeartbeatTimer: (id) => {
    state.lobbyHeartbeatTimer = id;
  },
  getLastLobbyHeartbeatMs: () => state.lastLobbyHeartbeatMs,
  setLastLobbyHeartbeatMs: (value) => {
    state.lastLobbyHeartbeatMs = value;
  },
  getLobbySignalRetryTimer: () => state.lobbySignalRetryTimer,
  setLobbySignalRetryTimer: (id) => {
    state.lobbySignalRetryTimer = id;
  },
  getLobbySignalRetryMs: () => state.lobbySignalRetryMs,
  setLobbySignalRetryMs: (value) => {
    state.lobbySignalRetryMs = value;
  },
  getLobbySignalShouldReconnect: () => state.lobbySignalShouldReconnect,
  getLobbySignalReconnectFn: () => state.lobbySignalReconnectFn,
  getLobbySignal: () => state.lobbySignal,
  setLobbySignal: (signal) => {
    state.lobbySignal = signal;
  },
  setLobbySignalShouldReconnect: (enabled) => {
    state.lobbySignalShouldReconnect = enabled;
  },
  setLobbySignalReconnectFn: (fn) => {
    state.lobbySignalReconnectFn = fn;
  },
  getHostRelay: () => state.hostRelay,
  setHostRelay: (relay) => {
    state.hostRelay = relay;
  },
  getClientPeer: () => state.clientPeer,
  setClientPeer: (peer) => {
    state.clientPeer = peer;
  },
  setNetplayEnabled: (enabled) => {
    state.netplayEnabled = enabled;
  },
  setNetplayState: (state) => {
    state.netplayState = state;
  },
  setPendingSnapshot: (snapshot) => {
    state.pendingSnapshot = snapshot;
  },
  setNetplayAccumulator: (value) => {
    state.netplayAccumulator = value;
  },
  setLastRoomMetaKey: (value) => {
    state.lastRoomMetaKey = value;
  },
  setLastRoomPlayerCount: (value) => {
    state.lastRoomPlayerCount = value;
  },
  setLastProfileBroadcastMs: (value) => {
    state.lastProfileBroadcastMs = value;
  },
  setLastLobbyNameUpdateMs: (value) => {
    state.lastLobbyNameUpdateMs = value;
  },
  lobbyProfiles,
  pendingAvatarByPlayer,
  profileUpdateThrottle,
  setChatMessages: (messages) => {
    state.chatMessages = messages;
  },
  chatRateLimitByPlayer,
  setLastLocalChatSentMs: (value) => {
    state.lastLocalChatSentMs = value;
  },
  pendingSpawnStageSeq,
  clearNameplates: () => {
    clearNameplates();
  },
  resetLocalPlayersAfterNetplay,
  updateLobbyUi: () => {
    lobbyUiController?.updateLobbyUi();
  },
  updateChatUi: () => {
    chatUi.updateChatUi(state.chatMessages, CHAT_INGAME_VISIBLE_MS, CHAT_INGAME_FADE_MS);
  },
  setIngameChatOpen,
  modeStandard: MULTIPLAYER_MODE_STANDARD,
  heartbeatIntervalMs: LOBBY_HEARTBEAT_INTERVAL_MS,
  heartbeatFallbackMs: LOBBY_HEARTBEAT_FALLBACK_MS,
  sendLobbyHeartbeat: (nowMs, force, roomId, playerId, token) => {
    lobbyHeartbeat?.sendLobbyHeartbeat(nowMs, force, roomId, playerId, token);
  },
});

lobbyHeartbeat = new LobbyHeartbeatController({
  game,
  getLobbyClient: () => lobbyClient,
  getLobbyRoom: () => state.lobbyRoom,
  getLobbySelfId: () => state.lobbySelfId,
  getLobbyPlayerToken: () => state.lobbyPlayerToken,
  getNetplayRole: () => state.netplayState?.role ?? null,
  getHostRelay: () => state.hostRelay,
  getLastLobbyHeartbeatMs: () => state.lastLobbyHeartbeatMs,
  setLastLobbyHeartbeatMs: (value) => {
    state.lastLobbyHeartbeatMs = value;
  },
  getLastRoomMetaKey: () => state.lastRoomMetaKey,
  setLastRoomMetaKey: (value) => {
    state.lastRoomMetaKey = value;
  },
  getLastRoomPlayerCount: () => state.lastRoomPlayerCount,
  setLastRoomPlayerCount: (value) => {
    state.lastRoomPlayerCount = value;
  },
  heartbeatFallbackMs: LOBBY_HEARTBEAT_FALLBACK_MS,
  buildRoomMeta: () => roomMeta.buildRoomMeta(),
});

lobbyUiController = new LobbyUiController({
  game,
  netplayEnabled: () => state.netplayEnabled,
  netplayRole: () => state.netplayState?.role ?? null,
  netplayHasCurrentCourse: () => !!state.netplayState?.currentCourse,
  lobbyRoom: () => state.lobbyRoom,
  setLobbyRoomMeta: (meta) => {
    if (state.lobbyRoom) {
      state.lobbyRoom.meta = meta;
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
  levelSelectActions,
  levelSelectConfirmButton,
  lobbyStageInfo,
  lobbyStageButton,
  lobbyStageActions,
  lobbyStageChooseButton,
  modeStandard: MULTIPLAYER_MODE_STANDARD,
  modeChained: MULTIPLAYER_MODE_CHAINED,
  chainedMaxPlayers: CHAINED_MAX_PLAYERS,
  getLobbyRoomGameMode: () => roomMeta.getLobbyRoomGameMode(),
  formatRoomInfoLabel,
  formatMultiplayerGameModeLabel,
  formatGameSourceLabel,
  getPlayerDisplayName,
  profileFallbackForPlayer,
  createAvatarElement,
  buildRoomMeta: () => roomMeta.buildRoomMeta(),
  updateProfileUi: () => {
    profileUi.updateProfileUi(state.localProfile);
  },
  updateChatUi: () => {
    chatUi.updateChatUi(state.chatMessages, CHAT_INGAME_VISIBLE_MS, CHAT_INGAME_FADE_MS);
  },
  kickPlayerFromRoom,
});
snapshotFlow = new SnapshotFlowController({
  game,
  getNetplayState: () => state.netplayState,
  getClientPeer: () => state.clientPeer,
  getHostRelay: () => state.hostRelay,
  rollbackAndResim: (startFrame) => netplaySimSync?.rollbackAndResim(startFrame) ?? false,
  snapshotCooldownMs: NETPLAY_SNAPSHOT_COOLDOWN_MS,
  snapshotMismatchCooldownMs: NETPLAY_SNAPSHOT_MISMATCH_COOLDOWN_MS,
});
netplayMessageFlow = new NetplayMessageFlowController({
  game,
  lobbyStatus,
  getNetplayState: () => state.netplayState,
  setSuppressHostDisconnectUntil: (value) => {
    state.suppressHostDisconnectUntil = value;
  },
  setLobbySignalShouldReconnect: (enabled) => {
    state.lobbySignalShouldReconnect = enabled;
  },
  setLobbySignalReconnectFn: (fn) => {
    state.lobbySignalReconnectFn = fn;
  },
  clearLobbySignalRetry: () => {
    netplayConnectionState?.clearLobbySignalRetry();
  },
  resetNetplayConnections: () => {
    netplayConnectionState?.resetNetplayConnections();
  },
  setActiveMenu: (menu) => {
    setActiveMenu(menu);
  },
  requestSnapshot: (reason, frame, force) => {
    snapshotFlow?.requestSnapshot(reason, frame, force);
  },
  coerceFrame: (value) => netplaySync?.coerceFrame(value) ?? null,
  normalizeInput: (input) => netplaySync?.normalizeInput(input) ?? null,
  recordInputForFrame: (frame, playerId, input) => netplaySimSync?.recordInputForFrame(frame, playerId, input) ?? false,
  rollbackAndResim: (startFrame) => netplaySimSync?.rollbackAndResim(startFrame) ?? false,
  setPendingSnapshot: (snapshot) => {
    state.pendingSnapshot = snapshot;
  },
  tryApplyPendingSnapshot: (stageId) => {
    netplaySimSync?.tryApplyPendingSnapshot(stageId);
  },
  markPlayerPendingSpawn: (playerId, stageSeq) => {
    netplayConnectionState?.markPlayerPendingSpawn(playerId, stageSeq);
  },
  promotePendingSpawns: (stageSeq) => {
    netplayConnectionState?.promotePendingSpawns(stageSeq);
  },
  pendingSpawnStageSeq,
  lobbyProfiles,
  pendingAvatarByPlayer,
  profileFallbackForPlayer,
  updateLobbyUi: () => {
    lobbyUiController?.updateLobbyUi();
  },
  appendChatMessage,
  endMatchToLobby: () => {
    matchFlow.endMatchToLobby();
  },
  getRoomGameMode: (room) => roomMeta.getRoomGameMode(room),
  modeChained: MULTIPLAYER_MODE_CHAINED,
  chainedMaxPlayers: CHAINED_MAX_PLAYERS,
  normalizeMultiplayerGameMode,
  setLobbyRoom: (room) => {
    state.lobbyRoom = room;
  },
  setActiveGameSource: (source) => {
    state.activeGameSource = source;
  },
  getStageBasePath: (gameSource) => packSelection.getStageBasePath(gameSource),
  setCurrentSmb2LikeMode: (mode) => {
    state.currentSmb2LikeMode = mode;
  },
  startStage: async (difficulty) => {
    await matchStartFlow?.startStage(difficulty);
  },
  sendSnapshotToClient: (playerId, frame) => {
    snapshotFlow?.sendSnapshotToClient(playerId, frame);
  },
  hostRelay: () => state.hostRelay,
  rejectHostConnection: (playerId, reason) => {
    peerSession.rejectHostConnection(playerId, reason);
  },
  shouldJoinAsSpectator: () => netplayConnectionState?.shouldJoinAsSpectator() ?? false,
  sendStageSyncToClient: (playerId) => {
    netplaySync?.sendStageSyncToClient(playerId);
  },
  maybeSendStageSync: () => {
    netplaySync?.maybeSendStageSync();
  },
  profileUpdateThrottle,
  profileRemoteCooldownMs: PROFILE_REMOTE_COOLDOWN_MS,
  sanitizeProfile,
  getAvatarValidationCached: (dataUrl) => profileUi.getAvatarValidationCached(dataUrl),
  sanitizeChatText,
  chatRateLimitByPlayer,
  chatSendCooldownMs: CHAT_SEND_COOLDOWN_MS,
  maxInputAhead: NETPLAY_MAX_INPUT_AHEAD,
  maxInputBehind: NETPLAY_MAX_INPUT_BEHIND,
  hostMaxInputRollback: NETPLAY_HOST_MAX_INPUT_ROLLBACK,
  hostSnapshotCooldownMs: NETPLAY_HOST_SNAPSHOT_COOLDOWN_MS,
  snapshotCooldownMs: NETPLAY_SNAPSHOT_COOLDOWN_MS,
});
netplayRuntime = new NetplayRuntimeController({
  game,
  netplayEnabled: () => state.netplayEnabled,
  getNetplayState: () => state.netplayState,
  getClientPeer: () => state.clientPeer,
  getHostRelay: () => state.hostRelay,
  getNetplayAccumulator: () => state.netplayAccumulator,
  setNetplayAccumulator: (value) => {
    state.netplayAccumulator = value;
  },
  buildInputsForFrame: (frame) => netplaySimSync?.buildInputsForFrame(frame) ?? new Map(),
  recordInputForFrame: (frame, playerId, input) => netplaySimSync?.recordInputForFrame(frame, playerId, input) ?? false,
  trimNetplayHistory: (frame) => {
    netplaySimSync?.trimNetplayHistory(frame);
  },
  getSimHash: () => netplaySync?.getSimHash() ?? 0,
  requestSnapshot: (reason, frame, force) => {
    snapshotFlow?.requestSnapshot(reason, frame, force);
  },
  hostApplyPendingRollback: () => {
    snapshotFlow?.hostApplyPendingRollback();
  },
  sendSnapshotToClient: (playerId, frame) => {
    snapshotFlow?.sendSnapshotToClient(playerId, frame);
  },
  maybeResendStageReady: (nowMs) => {
    netplaySync?.maybeResendStageReady(nowMs);
  },
  maybeForceStageSync: (nowMs) => {
    netplaySync?.maybeForceStageSync(nowMs);
    state.netplayAccumulator = 0;
  },
  getAuthoritativeHashFrame: (state) => netplaySync?.getAuthoritativeHashFrame(state) ?? null,
  getEstimatedHostFrame: (state) => netplaySync?.getEstimatedHostFrame(state) ?? state.lastReceivedHostFrame,
  getClientLeadFrames: (state) => netplaySync?.getClientLeadFrames(state) ?? NETPLAY_CLIENT_LEAD,
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
  getActiveGameSource: () => state.activeGameSource,
  setRunning: (value) => {
    state.running = value;
  },
  setPaused: (value) => {
    state.paused = value;
  },
  setRenderReady: (value) => {
    state.renderReady = value;
  },
  setLastTime: (value) => {
    state.lastTime = value;
  },
  ensureGfxReady,
  hasGfxDevice,
  destroyRenderer,
  createRenderer,
  prewarmConfettiRenderer,
  applyGameCamera,
  updateMobileMenuButtonVisibility,
  updateIngameChatVisibility,
  maybeStartSmb2LikeStageFade,
  markStageReady: (stageId) => {
    netplaySync?.markStageReady(stageId);
  },
  tryApplyPendingSnapshot: (stageId) => {
    netplaySimSync?.tryApplyPendingSnapshot(stageId);
  },
  getLeaderboardSession: () => state.leaderboardSession,
  isNetplayHostWithLobby: () => !!(state.netplayEnabled && state.netplayState?.role === 'host' && state.lobbyRoom),
  buildRoomMeta: () => roomMeta.buildRoomMeta(),
  setLobbyRoomMeta: (meta) => {
    if (state.lobbyRoom) {
      state.lobbyRoom.meta = meta;
    }
  },
  broadcastRoomUpdate: () => {
    lobbyHeartbeat?.broadcastRoomUpdate();
  },
  sendLobbyHeartbeatNow: () => {
    lobbyHeartbeat?.sendLobbyHeartbeat(performance.now(), true);
  },
  loadRenderStage,
  loadRenderStageSmb2,
  getStageBasePath: (gameSource) => packSelection.getStageBasePath(gameSource),
  prefetchPath: (path) => {
    void prefetchPackSlice(path);
  },
  isNaomiStage,
});
matchStartFlow = new MatchStartFlowController({
  game,
  audio,
  resumeButton,
  hudStatus,
  setOverlayVisible,
  getNetplayEnabled: () => state.netplayEnabled,
  getNetplayState: () => state.netplayState,
  getHostRelay: () => state.hostRelay,
  getLobbyRoomGameMode: () => roomMeta.getLobbyRoomGameMode(),
  getLobbyStartDisabledReason: (isHost, mode) => lobbyUiController?.getLobbyStartDisabledReason(isHost, mode) ?? '',
  updateLobbyUi: () => {
    lobbyUiController?.updateLobbyUi();
  },
  resolveSelectedGameSource: () => packSelection.resolveSelectedGameSource(),
  getActiveGameSource: () => state.activeGameSource,
  setActiveGameSource: (source) => {
    state.activeGameSource = source;
  },
  setCurrentSmb2LikeMode: (mode) => {
    state.currentSmb2LikeMode = mode;
  },
  getStageBasePath: (gameSource) => packSelection.getStageBasePath(gameSource),
  buildSmb1CourseConfig: () => courseSelection.buildSmb1CourseConfig(),
  buildSmb2CourseConfig: () => courseSelection.buildSmb2CourseConfig(),
  buildMb2wsCourseConfig: () => courseSelection.buildMb2wsCourseConfig(),
  normalizeMultiplayerGameMode,
  promotePendingSpawns: (stageSeq) => {
    netplayConnectionState?.promotePendingSpawns(stageSeq);
  },
  getLobbyRoom: () => state.lobbyRoom,
  buildRoomMeta: () => roomMeta.buildRoomMeta(),
  broadcastRoomUpdate: () => {
    lobbyHeartbeat?.broadcastRoomUpdate();
  },
  sendLobbyHeartbeatNow: () => {
    lobbyHeartbeat?.sendLobbyHeartbeat(performance.now(), true);
  },
  leaderboardsClient,
  startLeaderboardSession: (courseConfig) => {
    leaderboardSessionFlow.startLeaderboardSession(courseConfig);
  },
  clearLeaderboardSession: () => {
    state.leaderboardSession = null;
  },
  modeStandard: MULTIPLAYER_MODE_STANDARD,
});

  if (!lobbyUiController || !netplayMessageFlow || !snapshotFlow || !netplayRuntime || !stageFlow || !netplaySync || !netplaySimSync || !netplayConnectionState || !lobbyHeartbeat || !matchStartFlow) {
    throw new Error('Controller graph initialization incomplete');
  }

  return {
    lobbyBrowser,
    peerSession,
    matchFlow,
    lobbyState,
    lobbyUiController,
    netplayMessageFlow,
    snapshotFlow,
    netplayRuntime,
    stageFlow,
    netplaySync,
    netplaySimSync,
    netplayConnectionState,
    lobbyHeartbeat,
    matchStartFlow,
  };
}
