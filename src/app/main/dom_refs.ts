export type MainDomRefs = ReturnType<typeof collectMainDomRefs>;

export function collectMainDomRefs() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const hudCanvas = document.getElementById('hud-canvas') as HTMLCanvasElement;
  const overlay = document.getElementById('overlay') as HTMLElement;
  const mainMenuPanel = document.getElementById('main-menu') as HTMLElement | null;
  const multiplayerMenuPanel = document.getElementById('multiplayer-menu') as HTMLElement | null;
  const multiplayerIngameMenuPanel = document.getElementById('multiplayer-ingame-menu') as HTMLElement | null;
  const settingsMenuPanel = document.getElementById('settings-menu') as HTMLElement | null;
  const levelSelectMenuPanel = document.getElementById('level-select-menu') as HTMLElement | null;
  const stageFade = document.getElementById('stage-fade') as HTMLElement | null;
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
  const ingameReturnLobbyButton = document.getElementById('ingame-return-lobby') as HTMLButtonElement | null;
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

  const multiplayerOpenButton = document.getElementById('open-multiplayer') as HTMLButtonElement | null;
  const multiplayerBackButton = document.getElementById('multiplayer-back') as HTMLButtonElement | null;
  const levelSelectOpenButton = document.getElementById('open-level-select') as HTMLButtonElement | null;
  const levelSelectBackButton = document.getElementById('level-select-back') as HTMLButtonElement | null;
  const levelSelectActions = document.getElementById('level-select-actions') as HTMLElement | null;
  const levelSelectConfirmButton = document.getElementById('level-select-confirm') as HTMLButtonElement | null;
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
  const lobbyInfiniteTimeToggle = document.getElementById('lobby-infinite-time') as HTMLInputElement | null;
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

  const nameplateLayer = document.createElement('div');
  nameplateLayer.id = 'nameplate-layer';
  document.body.appendChild(nameplateLayer);

  return {
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
    ingameReturnLobbyButton,
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
    levelSelectActions,
    levelSelectConfirmButton,
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
    lobbyInfiniteTimeToggle,
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
  };
}
