import { GAME_SOURCES, type GameSource } from '../../shared/constants/index.js';
import type { LeaderboardsClient } from '../../leaderboards.js';

type StageEntry = { displayName: string; value: number };

export type LeaderboardsUiOptions = {
  leaderboardsClient: LeaderboardsClient | null;
  leaderboardTypeSelect: HTMLSelectElement | null;
  leaderboardGoalField: HTMLElement | null;
  leaderboardGoalSelect: HTMLSelectElement | null;
  leaderboardMetricField: HTMLElement | null;
  leaderboardMetricSelect: HTMLSelectElement | null;
  leaderboardWarpField: HTMLElement | null;
  leaderboardWarpSelect: HTMLSelectElement | null;
  leaderboardStatus: HTMLElement | null;
  leaderboardList: HTMLElement | null;
  difficultySelect: HTMLSelectElement | null;
  smb1StageSelect: HTMLSelectElement | null;
  smb2ModeSelect: HTMLSelectElement | null;
  smb2StoryWorldSelect: HTMLSelectElement | null;
  smb2StoryStageSelect: HTMLSelectElement | null;
  smb2ChallengeSelect: HTMLSelectElement | null;
  smb2ChallengeStageSelect: HTMLSelectElement | null;
  resolveSelectedGameSource: () => { gameSource: GameSource };
  getActivePackId: () => string | null;
  getSmb1StageIdByIndex: (index: number) => number | null;
  getSmb2StoryStageId: (gameSource: GameSource, worldIndex: number, stageIndex: number) => number | null;
  getSmb2ChallengeStageId: (
    gameSource: GameSource,
    difficulty: string,
    stageIndex: number,
  ) => number | null;
  buildCourseConfig: (gameSource: GameSource) => any;
  buildCourseId: (gameSource: GameSource, config: any) => string;
  buildCourseMode: (gameSource: GameSource, config: any) => 'story' | 'challenge' | 'smb1';
};

export class LeaderboardsUiController {
  private readonly options: LeaderboardsUiOptions;

  constructor(options: LeaderboardsUiOptions) {
    this.options = options;
  }

  updateUi() {
    const type = this.options.leaderboardTypeSelect?.value ?? 'stage';
    this.options.leaderboardGoalField?.classList.toggle('hidden', type !== 'stage');
    this.options.leaderboardMetricField?.classList.toggle('hidden', type !== 'stage');
    this.options.leaderboardWarpField?.classList.toggle('hidden', type !== 'course');
    if (this.options.leaderboardStatus) {
      this.options.leaderboardStatus.textContent = this.options.leaderboardsClient
        ? 'Leaderboards: ready'
        : 'Leaderboards: unavailable';
    }
  }

  async refresh() {
    if (!this.options.leaderboardsClient) {
      if (this.options.leaderboardStatus) {
        this.options.leaderboardStatus.textContent = 'Leaderboards: unavailable';
      }
      return;
    }
    const type = (this.options.leaderboardTypeSelect?.value ?? 'stage') as 'stage' | 'course';
    const { gameSource } = this.options.resolveSelectedGameSource();
    const packId = this.options.getActivePackId();
    if (this.options.leaderboardStatus) {
      this.options.leaderboardStatus.textContent = 'Leaderboards: loading...';
    }
    try {
      if (type === 'stage') {
        const stageId = this.resolveSelectedStageId(gameSource);
        if (!stageId) {
          throw new Error('invalid_stage');
        }
        const goalType = (this.options.leaderboardGoalSelect?.value ?? 'B') as 'B' | 'G' | 'R';
        const metric = (this.options.leaderboardMetricSelect?.value ?? 'time') as 'time' | 'score';
        const entries = await this.options.leaderboardsClient.getStageLeaderboard({
          gameSource,
          stageId,
          goalType,
          metric,
          packId,
        });
        this.renderEntries(entries, metric);
      } else {
        const config = this.options.buildCourseConfig(gameSource);
        const courseId = this.options.buildCourseId(gameSource, config);
        const mode = this.options.buildCourseMode(gameSource, config);
        const warpFlag = (this.options.leaderboardWarpSelect?.value ?? 'warpless') as 'warpless' | 'warped';
        const entries = await this.options.leaderboardsClient.getCourseLeaderboard({
          gameSource,
          courseId,
          mode,
          warpFlag,
          packId,
        });
        this.renderEntries(entries, 'time');
      }
      if (this.options.leaderboardStatus) {
        this.options.leaderboardStatus.textContent = 'Leaderboards: ready';
      }
    } catch (error) {
      console.error(error);
      if (this.options.leaderboardStatus) {
        this.options.leaderboardStatus.textContent = 'Leaderboards: failed';
      }
    }
  }

  private resolveSelectedStageId(gameSource: GameSource): number | null {
    if (gameSource === GAME_SOURCES.SMB1) {
      const index = Math.max(0, Number(this.options.smb1StageSelect?.value ?? 0));
      return this.options.getSmb1StageIdByIndex(index);
    }
    const mode = this.options.smb2ModeSelect?.value === 'story' ? 'story' : 'challenge';
    if (mode === 'story') {
      const worldIndex = Math.max(0, Number(this.options.smb2StoryWorldSelect?.value ?? 1) - 1);
      const stageIndex = Math.max(0, Number(this.options.smb2StoryStageSelect?.value ?? 1) - 1);
      return this.options.getSmb2StoryStageId(gameSource, worldIndex, stageIndex);
    }
    const difficulty = this.options.smb2ChallengeSelect?.value ?? 'beginner';
    const stageIndex = Math.max(0, Number(this.options.smb2ChallengeStageSelect?.value ?? 1) - 1);
    return this.options.getSmb2ChallengeStageId(gameSource, difficulty, stageIndex);
  }

  private renderEntries(entries: StageEntry[], metric: 'time' | 'score') {
    const target = this.options.leaderboardList;
    if (!target) {
      return;
    }
    target.innerHTML = '';
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No entries yet.';
      target.appendChild(empty);
      return;
    }
    entries.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'leaderboard-row';
      const rank = document.createElement('div');
      rank.className = 'leaderboard-rank';
      rank.textContent = String(index + 1);
      const name = document.createElement('div');
      name.textContent = entry.displayName || 'Anonymous';
      const value = document.createElement('div');
      value.className = 'leaderboard-value';
      value.textContent = metric === 'time' ? formatLeaderboardTimer(entry.value) : String(entry.value);
      row.append(rank, name, value);
      target.appendChild(row);
    });
  }
}

function formatLeaderboardTimer(frames: number): string {
  const clampedFrames = Math.max(0, Math.floor(frames));
  const totalSeconds = Math.floor(clampedFrames / 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const frameRemainder = clampedFrames % 60;
  const centis = Math.floor((frameRemainder * 100) / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}
