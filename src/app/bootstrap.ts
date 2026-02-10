type AppBootstrapOptions = {
  setOverlayVisible: (visible: boolean) => void;
  startButton: HTMLButtonElement;
  refreshPackUi: () => void;
  syncPackEnabled: () => void;
  initPackFromQuery: () => Promise<void>;
  onPackReady: () => void;
};

export function runAppBootstrap(options: AppBootstrapOptions) {
  options.setOverlayVisible(true);
  options.startButton.disabled = false;
  options.refreshPackUi();
  options.syncPackEnabled();
  void options.initPackFromQuery().finally(() => {
    options.onPackReady();
  });
}
