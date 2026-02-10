import type { MenuPanel } from './menu_flow.js';

export type SettingsTab = 'input' | 'audio' | 'multiplayer';

type BindMainUiDeps = {
  smb2ModeSelect: HTMLSelectElement | null;
  smb2ChallengeSelect: HTMLSelectElement | null;
  smb2StoryWorldSelect: HTMLSelectElement | null;
  difficultySelect: HTMLSelectElement | null;
  gameSourceSelect: HTMLSelectElement | null;
  controlModeSelect: HTMLSelectElement | null;
  fullscreenButton: HTMLButtonElement | null;
  mainMenuPanel: HTMLElement | null;
  multiplayerMenuPanel: HTMLElement | null;
  multiplayerIngameMenuPanel: HTMLElement | null;
  settingsMenuPanel: HTMLElement | null;
  levelSelectMenuPanel: HTMLElement | null;
  leaderboardsMenuPanel: HTMLElement | null;
  gamepadCalibrationButton: HTMLButtonElement | null;
  gamepadCalibrationOverlay: HTMLElement | null;
  interpolationToggle: HTMLInputElement | null;
  multiplayerOpenButton: HTMLButtonElement | null;
  leaderboardsOpenButton: HTMLButtonElement | null;
  multiplayerBackButton: HTMLButtonElement | null;
  levelSelectOpenButton: HTMLButtonElement | null;
  levelSelectBackButton: HTMLButtonElement | null;
  leaderboardsBackButton: HTMLButtonElement | null;
  settingsOpenButton: HTMLButtonElement | null;
  settingsBackButton: HTMLButtonElement | null;
  leaderboardTypeSelect: HTMLSelectElement | null;
  leaderboardRefreshButton: HTMLButtonElement | null;
  settingsTabButtons: HTMLButtonElement[];
  onUpdateSmb2ModeFields: () => void;
  onUpdateSmb2ChallengeStages: () => void;
  onUpdateSmb2StoryOptions: () => void;
  onUpdateSmb1Stages: () => void;
  onSyncPackEnabled: () => void;
  onUpdateGameSourceFields: () => void;
  onUpdateControlModeSettingsVisibility: () => void;
  onSyncTouchPreviewVisibility: () => void;
  onUpdateFullscreenButtonVisibility: () => void;
  onStartGamepadCalibration: () => void;
  onStopGamepadCalibration: () => void;
  onSetActiveMenu: (menu: MenuPanel) => void;
  onOpenLevelSelectMenu: (menu: MenuPanel) => void;
  onOpenSettingsMenu: () => void;
  getLevelSelectReturnMenu: () => MenuPanel;
  getSettingsReturnMenu: () => MenuPanel;
  onUpdateLeaderboardsUi: () => void;
  onRefreshLeaderboards: () => void;
  onSetSettingsTab: (tab: SettingsTab) => void;
  setInterpolationEnabled: (enabled: boolean) => void;
};

export function bindMainUiControls(deps: BindMainUiDeps) {
  deps.smb2ModeSelect?.addEventListener('change', () => {
    deps.onUpdateSmb2ModeFields();
  });

  deps.smb2ChallengeSelect?.addEventListener('change', () => {
    deps.onUpdateSmb2ChallengeStages();
  });

  deps.smb2StoryWorldSelect?.addEventListener('change', () => {
    deps.onUpdateSmb2StoryOptions();
  });

  deps.difficultySelect?.addEventListener('change', () => {
    deps.onUpdateSmb1Stages();
  });

  deps.gameSourceSelect?.addEventListener('change', () => {
    deps.onSyncPackEnabled();
    deps.onUpdateGameSourceFields();
  });

  deps.controlModeSelect?.addEventListener('change', () => {
    deps.onUpdateControlModeSettingsVisibility();
    deps.onSyncTouchPreviewVisibility();
  });

  deps.fullscreenButton?.addEventListener('click', async () => {
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
    deps.onUpdateFullscreenButtonVisibility();
  });

  document.addEventListener('fullscreenchange', () => {
    deps.onUpdateFullscreenButtonVisibility();
  });

  document.addEventListener('webkitfullscreenchange', () => {
    deps.onUpdateFullscreenButtonVisibility();
  });

  for (const panel of [
    deps.mainMenuPanel,
    deps.multiplayerMenuPanel,
    deps.multiplayerIngameMenuPanel,
    deps.settingsMenuPanel,
    deps.levelSelectMenuPanel,
    deps.leaderboardsMenuPanel,
  ]) {
    panel?.addEventListener('scroll', () => {
      deps.onSyncTouchPreviewVisibility();
    });
  }

  deps.gamepadCalibrationButton?.addEventListener('click', () => {
    deps.onStartGamepadCalibration();
  });

  deps.gamepadCalibrationOverlay?.addEventListener('click', () => {
    deps.onStopGamepadCalibration();
  });

  window.addEventListener('gamepadconnected', () => {
    deps.onUpdateControlModeSettingsVisibility();
  });

  window.addEventListener('gamepaddisconnected', () => {
    deps.onUpdateControlModeSettingsVisibility();
  });

  if (deps.interpolationToggle) {
    deps.interpolationToggle.checked = true;
    deps.setInterpolationEnabled(true);
  }

  deps.multiplayerOpenButton?.addEventListener('click', () => {
    deps.onSetActiveMenu('multiplayer');
  });

  deps.leaderboardsOpenButton?.addEventListener('click', () => {
    deps.onSetActiveMenu('leaderboards');
  });

  deps.multiplayerBackButton?.addEventListener('click', () => {
    deps.onSetActiveMenu('main');
  });

  deps.levelSelectOpenButton?.addEventListener('click', () => {
    deps.onOpenLevelSelectMenu('main');
  });

  deps.levelSelectBackButton?.addEventListener('click', () => {
    deps.onSetActiveMenu(deps.getLevelSelectReturnMenu());
  });

  deps.leaderboardsBackButton?.addEventListener('click', () => {
    deps.onSetActiveMenu('main');
  });

  deps.settingsOpenButton?.addEventListener('click', () => {
    deps.onOpenSettingsMenu();
  });

  deps.settingsBackButton?.addEventListener('click', () => {
    deps.onSetActiveMenu(deps.getSettingsReturnMenu());
  });

  deps.leaderboardTypeSelect?.addEventListener('change', () => {
    deps.onUpdateLeaderboardsUi();
  });

  deps.leaderboardRefreshButton?.addEventListener('click', () => {
    deps.onRefreshLeaderboards();
  });

  for (const button of deps.settingsTabButtons) {
    button.addEventListener('click', () => {
      const tab = button.dataset.settingsTab as SettingsTab | undefined;
      if (tab) {
        deps.onSetSettingsTab(tab);
      }
    });
  }
}
