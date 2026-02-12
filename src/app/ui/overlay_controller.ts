import { GAME_SOURCES, type GameSource } from '../../shared/constants/index.js';
import { STAGE_FADE_MS } from '../main/constants.js';

type OverlayControllerOptions = {
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
  stageFade: HTMLElement | null;
  mobileMenuButton: HTMLButtonElement | null;
  fullscreenButton: HTMLButtonElement | null;
  hasTouch: boolean;
  getRunning: () => boolean;
  getActiveGameSource: () => GameSource;
  getCurrentSmb2LikeMode: () => 'story' | 'challenge' | null;
  blurActiveInput: () => void;
  updateIngameChatVisibility: () => void;
  syncTouchPreviewVisibility: () => void;
};

export function createOverlayController(options: OverlayControllerOptions) {
  function updateMobileMenuButtonVisibility() {
    if (!options.mobileMenuButton) {
      return;
    }
    const shouldShow = options.hasTouch && options.overlay.classList.contains('hidden') && options.getRunning();
    options.mobileMenuButton.classList.toggle('hidden', !shouldShow);
  }

  function updateFullscreenButtonVisibility() {
    if (!options.fullscreenButton) {
      return;
    }
    const root = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    const supportsFullscreen = typeof root.requestFullscreen === 'function' || typeof root.webkitRequestFullscreen === 'function';
    const isFullscreen = !!(
      document.fullscreenElement ||
      (document as typeof document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement
    );
    const shouldShow = options.hasTouch && supportsFullscreen;
    options.fullscreenButton.classList.toggle('hidden', !shouldShow);
    if (!shouldShow) {
      return;
    }
    options.fullscreenButton.textContent = supportsFullscreen && isFullscreen ? 'Exit Fullscreen' : 'Fullscreen';
  }

  function setOverlayVisible(visible: boolean) {
    options.overlay.classList.toggle('hidden', !visible);
    options.canvas.style.pointerEvents = visible ? 'none' : 'auto';
    document.body.classList.toggle('gameplay-active', !visible);
    if (!visible) {
      options.blurActiveInput();
    }
    updateMobileMenuButtonVisibility();
    updateFullscreenButtonVisibility();
    options.syncTouchPreviewVisibility();
    options.updateIngameChatVisibility();
  }

  function triggerStageFade(color: string) {
    if (!options.stageFade) {
      return;
    }
    options.stageFade.style.transition = 'none';
    options.stageFade.style.backgroundColor = color;
    options.stageFade.style.opacity = '1';
    options.stageFade.getBoundingClientRect();
    options.stageFade.style.transition = `opacity ${STAGE_FADE_MS}ms linear`;
    options.stageFade.style.opacity = '0';
  }

  function maybeStartSmb2LikeStageFade() {
    if (options.getActiveGameSource() === GAME_SOURCES.SMB1 || !options.getCurrentSmb2LikeMode()) {
      return;
    }
    const color = options.getCurrentSmb2LikeMode() === 'story' ? '#fff' : '#000';
    triggerStageFade(color);
  }

  return {
    setOverlayVisible,
    updateMobileMenuButtonVisibility,
    updateFullscreenButtonVisibility,
    maybeStartSmb2LikeStageFade,
  };
}
