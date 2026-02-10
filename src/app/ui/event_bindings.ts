import type { MenuPanel } from './menu_flow.js';

type UiEventBindingsOptions = {
  startButton: HTMLButtonElement;
  onStartRequest: () => void;
  resumeButton: HTMLButtonElement;
  ingameResumeButton: HTMLButtonElement | null;
  ingameLeaveButton: HTMLButtonElement | null;
  onCloseMenuOverlay: () => void;
  onLeaveMatchToLobbyList: () => void;
  gyroRecalibrateButton: HTMLButtonElement | null;
  onGyroRecalibrate: () => void;
  mobileMenuButton: HTMLButtonElement | null;
  isNetplayEnabled: () => boolean;
  onOpenMenuOverlay: (preferredMenu?: MenuPanel) => void;
  isIngameChatOpen: () => boolean;
  setIngameChatOpen: (open: boolean) => void;
  isRunning: () => boolean;
  overlay: HTMLElement;
  isTextInputElement: (el: Element | null) => boolean;
  blurActiveInput: () => void;
  updateIngameChatVisibility: () => void;
  ingameChatWrap: HTMLElement | null;
};

export function bindUiEventHandlers(options: UiEventBindingsOptions) {
  options.startButton.addEventListener('click', options.onStartRequest);

  options.resumeButton.addEventListener('click', () => {
    options.onCloseMenuOverlay();
  });

  options.ingameResumeButton?.addEventListener('click', () => {
    options.onCloseMenuOverlay();
  });

  options.ingameLeaveButton?.addEventListener('click', () => {
    options.onLeaveMatchToLobbyList();
  });

  options.gyroRecalibrateButton?.addEventListener('click', () => {
    options.onGyroRecalibrate();
  });

  options.mobileMenuButton?.addEventListener('click', () => {
    if (options.isNetplayEnabled()) {
      options.onOpenMenuOverlay();
    } else {
      options.onOpenMenuOverlay('main');
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (options.isIngameChatOpen()) {
        event.preventDefault();
        options.setIngameChatOpen(false);
        return;
      }
      if (options.isRunning() && !options.overlay.classList.contains('hidden')) {
        event.preventDefault();
        options.onCloseMenuOverlay();
        return;
      }
      if (options.isRunning()) {
        event.preventDefault();
        options.onOpenMenuOverlay(options.isNetplayEnabled() ? 'multiplayer-ingame' : 'main');
      }
      return;
    }

    if (event.key !== 'Enter') {
      return;
    }
    if (!options.isNetplayEnabled() || !options.isRunning()) {
      return;
    }
    if (!options.overlay.classList.contains('hidden')) {
      return;
    }
    if (options.isIngameChatOpen()) {
      return;
    }
    if (options.isTextInputElement(document.activeElement)) {
      options.blurActiveInput();
      if (options.isTextInputElement(document.activeElement)) {
        return;
      }
    }
    options.updateIngameChatVisibility();
    if (options.ingameChatWrap?.classList.contains('hidden')) {
      return;
    }
    event.preventDefault();
    options.setIngameChatOpen(true);
  });
}
