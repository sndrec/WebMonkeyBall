import type { MenuPanel } from './menu_flow.js';

export type SettingsTab = 'input' | 'audio' | 'multiplayer';

type SettingsTabsOptions = {
  buttons: HTMLButtonElement[];
  panels: HTMLElement[];
  initialTab?: SettingsTab;
};

export class SettingsTabsController {
  private readonly buttons: HTMLButtonElement[];
  private readonly panels: HTMLElement[];
  private activeSettingsTab: SettingsTab;
  private settingsReturnMenu: MenuPanel = 'main';
  private levelSelectReturnMenu: MenuPanel = 'main';

  constructor(options: SettingsTabsOptions) {
    this.buttons = options.buttons;
    this.panels = options.panels;
    this.activeSettingsTab = options.initialTab ?? 'input';
  }

  getActiveSettingsTab() {
    return this.activeSettingsTab;
  }

  getSettingsReturnMenu() {
    return this.settingsReturnMenu;
  }

  setSettingsReturnMenu(menu: MenuPanel) {
    this.settingsReturnMenu = menu;
  }

  getLevelSelectReturnMenu() {
    return this.levelSelectReturnMenu;
  }

  setLevelSelectReturnMenu(menu: MenuPanel) {
    this.levelSelectReturnMenu = menu;
  }

  setSettingsTab(tab: SettingsTab) {
    this.activeSettingsTab = tab;
    for (const button of this.buttons) {
      button.classList.toggle('active', button.dataset.settingsTab === tab);
    }
    for (const panel of this.panels) {
      panel.classList.toggle('hidden', panel.dataset.settingsPanel !== tab);
    }
  }
}
