export type MenuPanel = 'main' | 'multiplayer' | 'multiplayer-ingame' | 'settings' | 'level-select' | 'leaderboards';

type MenuFlowOptions = {
  mainMenuPanel: HTMLElement | null;
  multiplayerLayout: HTMLElement | null;
  multiplayerMenuPanel: HTMLElement | null;
  multiplayerIngameMenuPanel: HTMLElement | null;
  settingsMenuPanel: HTMLElement | null;
  levelSelectMenuPanel: HTMLElement | null;
  leaderboardsMenuPanel: HTMLElement | null;
  onMenuChanged: () => void;
  onOpenMultiplayerMenu: () => void;
  onOpenSettingsMenu: () => void;
  onOpenLevelSelectMenu: () => void;
  onOpenLeaderboardsMenu: () => void;
  setOverlayVisible: (visible: boolean) => void;
  isRunning: () => boolean;
  isNetplayEnabled: () => boolean;
  onPauseSingleplayer: () => void;
  onResumeSingleplayer: () => void;
};

export class MenuFlowController {
  private readonly options: MenuFlowOptions;
  private activeMenu: MenuPanel = 'main';

  constructor(options: MenuFlowOptions) {
    this.options = options;
  }

  getActiveMenu() {
    return this.activeMenu;
  }

  setActiveMenu(menu: MenuPanel) {
    if (this.activeMenu === menu) {
      return;
    }
    this.activeMenu = menu;
    this.options.mainMenuPanel?.classList.toggle('hidden', menu !== 'main');
    this.options.multiplayerLayout?.classList.toggle('hidden', menu !== 'multiplayer');
    this.options.multiplayerMenuPanel?.classList.toggle('hidden', menu !== 'multiplayer');
    this.options.multiplayerIngameMenuPanel?.classList.toggle('hidden', menu !== 'multiplayer-ingame');
    this.options.settingsMenuPanel?.classList.toggle('hidden', menu !== 'settings');
    this.options.levelSelectMenuPanel?.classList.toggle('hidden', menu !== 'level-select');
    this.options.leaderboardsMenuPanel?.classList.toggle('hidden', menu !== 'leaderboards');
    this.options.onMenuChanged();
    if (menu === 'multiplayer') {
      this.options.onOpenMultiplayerMenu();
    }
    if (menu === 'settings') {
      this.options.onOpenSettingsMenu();
    }
    if (menu === 'level-select') {
      this.options.onOpenLevelSelectMenu();
    }
    if (menu === 'leaderboards') {
      this.options.onOpenLeaderboardsMenu();
    }
  }

  openMenuOverlay(preferredMenu?: MenuPanel) {
    if (!this.options.isRunning()) {
      return;
    }
    if (this.options.isNetplayEnabled()) {
      this.setActiveMenu('multiplayer-ingame');
      this.options.setOverlayVisible(true);
      return;
    }
    this.setActiveMenu(preferredMenu ?? 'main');
    this.options.onPauseSingleplayer();
  }

  closeMenuOverlay() {
    if (!this.options.isRunning()) {
      return;
    }
    if (this.options.isNetplayEnabled()) {
      this.options.setOverlayVisible(false);
      return;
    }
    this.options.onResumeSingleplayer();
  }
}
