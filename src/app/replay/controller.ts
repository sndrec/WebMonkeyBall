import type { AudioManager } from '../../audio.js';
import type { Game } from '../../game.js';
import type { GameSource } from '../../shared/constants/index.js';
import type { ReplayData } from '../../replay.js';

type ReplayControllerDeps = {
  game: Game;
  audio: AudioManager;
  replayStatus: HTMLElement | null;
  replaySaveButton: HTMLButtonElement | null;
  replayLoadButton: HTMLButtonElement | null;
  replayFileInput: HTMLInputElement | null;
  resumeButton: HTMLButtonElement;
  hudStatus: HTMLElement | null;
  gameSourceSelect: HTMLSelectElement | null;
  setOverlayVisible: (visible: boolean) => void;
  updateGameSourceFields: () => void;
  setActiveGameSource: (source: GameSource) => void;
  setCurrentSmb2LikeMode: (mode: 'story' | 'challenge' | null) => void;
  getStageBasePath: (source: GameSource) => string;
};

export class ReplayController {
  private readonly deps: ReplayControllerDeps;

  constructor(deps: ReplayControllerDeps) {
    this.deps = deps;
  }

  setReplayStatus(text: string) {
    if (this.deps.replayStatus) {
      this.deps.replayStatus.textContent = text;
    }
  }

  async startReplay(replay: ReplayData) {
    const {
      setOverlayVisible,
      resumeButton,
      hudStatus,
      game,
      audio,
      gameSourceSelect,
      updateGameSourceFields,
      setActiveGameSource,
      setCurrentSmb2LikeMode,
      getStageBasePath,
    } = this.deps;
    setOverlayVisible(false);
    resumeButton.disabled = true;
    if (hudStatus) {
      hudStatus.textContent = '';
    }
    game.setReplayMode(true, true);
    setActiveGameSource(replay.gameSource);
    if (gameSourceSelect) {
      gameSourceSelect.value = replay.gameSource;
    }
    updateGameSourceFields();
    game.setGameSource(replay.gameSource);
    game.stageBasePath = getStageBasePath(replay.gameSource);
    setCurrentSmb2LikeMode(null);
    game.course = null;
    void audio.resume();
    await game.loadStage(replay.stageId);
    const localPlayer = game.getLocalPlayer?.() ?? null;
    if (localPlayer?.ball && game.stage) {
      const startTick = Math.max(0, replay.inputStartTick ?? 0);
      game.introTotalFrames = startTick;
      game.introTimerFrames = startTick;
      game.cameraController?.initForStage(localPlayer.ball, localPlayer.ball.startRotY, game.stageRuntime);
    }
    game.replayInputStartTick = Math.max(0, replay.inputStartTick ?? 0);
    game.setInputFeed(replay.inputs);
    game.paused = false;
    while (game.simTick < game.replayInputStartTick) {
      game.update(game.fixedStep);
    }
    game.replayAutoFastForward = false;
    game.setFixedTickMode(false, 1);
    this.setReplayStatus(`Replay loaded (stage ${replay.stageId})`);
  }

  downloadReplay(replay: ReplayData) {
    const label = String(replay.stageId).padStart(3, '0');
    const filename = `replay_${replay.gameSource}_st${label}.json`;
    const blob = new Blob([JSON.stringify(replay, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  bindReplayUi() {
    const { replaySaveButton, replayLoadButton, replayFileInput, game } = this.deps;

    replaySaveButton?.addEventListener('click', () => {
      if (!game || !game.stage) {
        this.setReplayStatus('Replay: no stage active');
        return;
      }
      const replay = game.exportReplay();
      if (!replay) {
        this.setReplayStatus('Replay: no inputs recorded');
        return;
      }
      this.downloadReplay(replay);
      this.setReplayStatus(`Replay saved (stage ${replay.stageId})`);
    });

    replayLoadButton?.addEventListener('click', () => {
      replayFileInput?.click();
    });

    replayFileInput?.addEventListener('change', async () => {
      const file = replayFileInput.files?.[0];
      replayFileInput.value = '';
      if (!file) {
        return;
      }
      try {
        const text = await file.text();
        const replay = JSON.parse(text) as ReplayData;
        if (!replay || replay.version !== 1 || !Array.isArray(replay.inputs)) {
          throw new Error('Invalid replay');
        }
        await this.startReplay(replay);
      } catch (error) {
        console.error(error);
        this.setReplayStatus('Replay: failed to load');
      }
    });
  }
}
