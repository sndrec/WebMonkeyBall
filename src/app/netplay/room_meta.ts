import type { MultiplayerGameMode } from '../../game.js';
import { GAME_SOURCES, type GameSource } from '../../shared/constants/index.js';
import type { RoomGameModeOptions, RoomInfo, RoomMeta } from '../../netcode_protocol.js';
import { formatCourseMeta } from './presence_format.js';

export function normalizeMultiplayerGameMode(mode: unknown): MultiplayerGameMode {
  return mode === 'chained_together' ? 'chained_together' : 'standard';
}

export function formatMultiplayerGameModeLabel(mode: MultiplayerGameMode) {
  return mode === 'chained_together' ? 'Chained Together' : 'Standard';
}

type RoomMetaDeps = {
  getNetplayState: () => any | null;
  getActiveGameSource: () => GameSource;
  getCurrentStageId: () => number | undefined;
  resolveSelectedGameSource: () => { gameSource: GameSource };
  buildSmb1CourseConfig: () => any;
  buildSmb2CourseConfig: () => any;
  buildMb2wsCourseConfig: () => any;
  lobbyGameModeSelect: HTMLSelectElement | null;
  lobbyRoomNameInput: HTMLInputElement | null;
  lobbyNameInput: HTMLInputElement | null;
  getLobbyRoom: () => RoomInfo | null;
  sanitizeLobbyName: (value: string) => string | undefined;
  getDefaultGameModeOptions: (mode: MultiplayerGameMode) => RoomGameModeOptions;
  normalizeGameModeOptions: (mode: MultiplayerGameMode, raw: unknown) => RoomGameModeOptions;
};

export class RoomMetaController {
  private readonly deps: RoomMetaDeps;

  constructor(deps: RoomMetaDeps) {
    this.deps = deps;
  }

  getLobbySelectedGameMode() {
    return normalizeMultiplayerGameMode(this.deps.lobbyGameModeSelect?.value);
  }

  getRoomGameMode(room: RoomInfo | null | undefined) {
    return normalizeMultiplayerGameMode(room?.meta?.gameMode);
  }

  getLobbyRoomGameMode() {
    return normalizeMultiplayerGameMode(this.deps.getLobbyRoom()?.meta?.gameMode ?? this.getLobbySelectedGameMode());
  }

  buildRoomMeta(): RoomMeta | null {
    const netplayState = this.deps.getNetplayState();
    if (!netplayState || netplayState.role !== 'host') {
      return null;
    }
    const resolvedSource = this.deps.resolveSelectedGameSource();
    const activeGameSource = this.deps.getActiveGameSource();
    const gameSource = netplayState.currentGameSource ?? resolvedSource.gameSource ?? activeGameSource;
    const course = netplayState.currentCourse ?? (() => {
      if (gameSource === GAME_SOURCES.SMB2) {
        return this.deps.buildSmb2CourseConfig();
      }
      if (gameSource === GAME_SOURCES.MB2WS) {
        return this.deps.buildMb2wsCourseConfig();
      }
      return this.deps.buildSmb1CourseConfig();
    })();
    const labels = formatCourseMeta(gameSource, course);
    const stageId = this.deps.getCurrentStageId();
    const status = netplayState.currentCourse ? 'in_game' : 'lobby';
    const gameMode = normalizeMultiplayerGameMode(netplayState.currentGameMode ?? this.getLobbySelectedGameMode());
    const gameModeOptions = this.deps.normalizeGameModeOptions(gameMode, this.deps.getLobbyRoom()?.meta?.gameModeOptions);
    const roomName = this.deps.sanitizeLobbyName(
      this.deps.lobbyRoomNameInput?.value ?? this.deps.getLobbyRoom()?.meta?.roomName ?? '',
    );
    return {
      status,
      gameSource,
      gameMode,
      gameModeOptions: Object.keys(gameModeOptions).length > 0 ? gameModeOptions : undefined,
      courseLabel: labels.courseLabel,
      stageLabel: labels.stageLabel,
      stageId,
      roomName: roomName ?? undefined,
    };
  }

  buildRoomMetaForCreation(): RoomMeta {
    const resolvedSource = this.deps.resolveSelectedGameSource();
    const activeGameSource = this.deps.getActiveGameSource();
    const gameSource = resolvedSource.gameSource ?? activeGameSource;
    const course = gameSource === GAME_SOURCES.SMB2
      ? this.deps.buildSmb2CourseConfig()
      : gameSource === GAME_SOURCES.MB2WS
        ? this.deps.buildMb2wsCourseConfig()
        : this.deps.buildSmb1CourseConfig();
    const labels = formatCourseMeta(gameSource, course);
    const roomName = this.deps.sanitizeLobbyName(this.deps.lobbyNameInput?.value ?? '');
    const gameMode = this.getLobbySelectedGameMode();
    const gameModeOptions = this.deps.getDefaultGameModeOptions(gameMode);
    return {
      status: 'lobby',
      gameSource,
      gameMode,
      gameModeOptions: Object.keys(gameModeOptions).length > 0 ? gameModeOptions : undefined,
      courseLabel: labels.courseLabel,
      stageLabel: labels.stageLabel,
      roomName: roomName ?? undefined,
    };
  }
}
