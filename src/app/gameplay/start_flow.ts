import type { AudioManager } from '../../audio.js';
import type { Game, MultiplayerGameMode } from '../../game.js';
import { GAME_SOURCES, type GameSource } from '../../shared/constants/index.js';
import type { LeaderboardsClient } from '../../leaderboards.js';
import type { RoomGameModeOptions } from '../../netcode_protocol.js';

type StartFlowDeps = {
  game: Game;
  audio: AudioManager;
  resumeButton: HTMLButtonElement;
  hudStatus: HTMLElement | null;
  setOverlayVisible: (visible: boolean) => void;
  getNetplayEnabled: () => boolean;
  getNetplayState: () => any | null;
  getHostRelay: () => { broadcast: (msg: any) => void } | null;
  getLobbyRoomGameMode: () => MultiplayerGameMode;
  getLobbyRoomGameModeOptions: () => RoomGameModeOptions;
  getLobbyStartDisabledReason: (isHost: boolean, mode: MultiplayerGameMode) => string;
  updateLobbyUi: () => void;
  resolveSelectedGameSource: () => { gameSource: GameSource };
  getActiveGameSource: () => GameSource;
  setActiveGameSource: (source: GameSource) => void;
  setCurrentSmb2LikeMode: (mode: 'story' | 'challenge' | null) => void;
  getStageBasePath: (gameSource: GameSource) => string;
  buildSmb1CourseConfig: () => { difficulty: string; stageIndex: number };
  buildSmb2CourseConfig: () => any;
  buildMb2wsCourseConfig: () => any;
  normalizeMultiplayerGameMode: (mode: unknown) => MultiplayerGameMode;
  promotePendingSpawns: (stageSeq: number) => void;
  getLobbyRoom: () => any;
  buildRoomMeta: () => any | null;
  broadcastRoomUpdate: () => void;
  sendLobbyHeartbeatNow: () => void;
  leaderboardsClient: LeaderboardsClient | null;
  startLeaderboardSession: (courseConfig: any) => void;
  clearLeaderboardSession: () => void;
  modeStandard: MultiplayerGameMode;
};

export class MatchStartFlowController {
  private readonly deps: StartFlowDeps;

  constructor(deps: StartFlowDeps) {
    this.deps = deps;
  }

  private hasSmb2LikeMode(config: unknown): config is { mode: 'story' | 'challenge' } {
    return typeof config === 'object' && config !== null && 'mode' in config;
  }

  private cloneCourseConfig(config: any) {
    if (!config || typeof config !== 'object') {
      return config;
    }
    return JSON.parse(JSON.stringify(config));
  }

  private getHostCourseConfig() {
    const netplayState = this.deps.getNetplayState();
    if (!netplayState?.currentCourse || !this.deps.game.course) {
      return netplayState?.currentCourse ?? null;
    }
    const activeGameSource = this.deps.getActiveGameSource();
    const config = this.cloneCourseConfig(netplayState.currentCourse);
    if (activeGameSource === GAME_SOURCES.SMB1) {
      const course = this.deps.game.course as any;
      if (typeof course.currentFloor === 'number') {
        config.stageIndex = Math.max(0, course.currentFloor - 1);
      }
      if (typeof course.difficulty === 'string') {
        config.difficulty = course.difficulty;
      }
      return config;
    }
    const course = this.deps.game.course as any;
    if (typeof course.currentIndex === 'number') {
      if (config.mode === 'story') {
        config.worldIndex = Math.floor(course.currentIndex / 10);
        config.stageIndex = course.currentIndex % 10;
      } else {
        config.stageIndex = course.currentIndex;
      }
    }
    return config;
  }

  async startStage(
    difficulty: any,
  ) {
    this.deps.setOverlayVisible(false);
    this.deps.resumeButton.disabled = true;
    if (this.deps.hudStatus) {
      this.deps.hudStatus.textContent = '';
    }

    const activeGameSource = this.deps.getActiveGameSource();
    this.deps.game.setReplayMode(false);
    this.deps.game.setGameSource(activeGameSource);
    this.deps.game.stageBasePath = this.deps.getStageBasePath(activeGameSource);
    this.deps.setCurrentSmb2LikeMode(
      activeGameSource !== GAME_SOURCES.SMB1 && this.hasSmb2LikeMode(difficulty) ? difficulty.mode : null,
    );
    void this.deps.audio.resume();
    await this.deps.game.start(difficulty);
    if (!this.deps.getNetplayEnabled() && this.deps.leaderboardsClient) {
      this.deps.startLeaderboardSession(difficulty);
    } else {
      this.deps.clearLeaderboardSession();
    }
  }

  handleHostStageLoadStart() {
    const netplayState = this.deps.getNetplayState();
    const hostRelay = this.deps.getHostRelay();
    if (!this.deps.getNetplayEnabled() || netplayState?.role !== 'host' || !hostRelay) {
      return;
    }
    const config = this.getHostCourseConfig();
    if (!config) {
      return;
    }
    const activeGameSource = this.deps.getActiveGameSource();
    netplayState.currentCourse = config;
    netplayState.currentGameSource = activeGameSource;
    netplayState.currentGameMode = this.deps.normalizeMultiplayerGameMode(
      netplayState.currentGameMode ?? this.deps.game.getMultiplayerGameMode(),
    );
    const gameModeOptions = this.deps.getLobbyRoomGameModeOptions();
    netplayState.stageSeq += 1;
    this.deps.promotePendingSpawns(netplayState.stageSeq);
    hostRelay.broadcast({
      type: 'start',
      stageSeq: netplayState.stageSeq,
      gameSource: activeGameSource,
      gameMode: netplayState.currentGameMode,
      gameModeOptions: Object.keys(gameModeOptions).length > 0 ? gameModeOptions : undefined,
      course: config,
      stageBasePath: this.deps.getStageBasePath(activeGameSource),
    });
  }

  handleStartRequest() {
    const netplayState = this.deps.getNetplayState();
    if (this.deps.getNetplayEnabled() && netplayState?.role === 'client') {
      if (this.deps.hudStatus) {
        this.deps.hudStatus.textContent = 'Waiting for host to start...';
      }
      return;
    }
    const gameMode = this.deps.getNetplayEnabled() ? this.deps.getLobbyRoomGameMode() : this.deps.modeStandard;
    const startBlockedReason = this.deps.getNetplayEnabled()
      ? this.deps.getLobbyStartDisabledReason(netplayState?.role === 'host', gameMode)
      : '';
    if (startBlockedReason) {
      if (this.deps.hudStatus) {
        this.deps.hudStatus.textContent = startBlockedReason;
      }
      this.deps.updateLobbyUi();
      return;
    }
    const resolved = this.deps.resolveSelectedGameSource();
    this.deps.setActiveGameSource(resolved.gameSource);
    const activeGameSource = this.deps.getActiveGameSource();
    this.deps.game.setMultiplayerGameMode(gameMode);
    const difficulty = activeGameSource === GAME_SOURCES.SMB2
      ? this.deps.buildSmb2CourseConfig()
      : activeGameSource === GAME_SOURCES.MB2WS
        ? this.deps.buildMb2wsCourseConfig()
        : this.deps.buildSmb1CourseConfig();
    if (this.deps.getNetplayEnabled() && netplayState?.role === 'host') {
      netplayState.currentCourse = difficulty;
      netplayState.currentGameSource = activeGameSource;
      netplayState.currentGameMode = gameMode;
      if (this.deps.getLobbyRoom()) {
        const meta = this.deps.buildRoomMeta();
        if (meta) {
          this.deps.getLobbyRoom()!.meta = meta;
        }
        this.deps.broadcastRoomUpdate();
        this.deps.sendLobbyHeartbeatNow();
      }
    }
    this.startStage(difficulty).catch((error) => {
      if (this.deps.hudStatus) {
        this.deps.hudStatus.textContent = 'Failed to load stage.';
      }
      console.error(error);
    });
  }
}
