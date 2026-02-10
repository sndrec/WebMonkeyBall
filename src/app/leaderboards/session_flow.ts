import type { Game } from '../../game.js';
import type { LeaderboardsClient, CourseReplaySegment } from '../../leaderboards.js';
import type { GameSource } from '../../shared/constants/index.js';
import { GAME_SOURCES } from '../../shared/constants/index.js';

export type LeaderboardSession = {
  active: boolean;
  eligible: boolean;
  gameSource: GameSource;
  packId: string | null;
  courseId: string;
  mode: 'story' | 'challenge' | 'smb1';
  courseConfig: any;
  warpUsed: boolean;
  courseTimerFrames: number;
  penaltyFrames: number;
  retryCount: number;
  stageScoreStart: number;
  segments: CourseReplaySegment[];
  hasSkipped: boolean;
};

type StageGoalInfo = {
  stageId: number;
  goalType: string | null;
  timerFrames: number;
  score: number;
  isBonusStage: boolean;
};

type StageFailInfo = {
  stageId: number;
  reason: 'ringout' | 'timeover' | 'manual_reset' | 'skip';
  timerFrames: number;
  score: number;
  isBonusStage: boolean;
};

type SessionFlowDeps = {
  game: Game;
  getActiveGameSource: () => GameSource;
  getActivePack: () => { manifest?: { id?: string } } | null;
  getLeaderboardAllowlist: () => string[];
  getLocalProfileName: () => string;
  getLocalStoragePlayerId: () => string | null;
  leaderboardsClient: LeaderboardsClient | null;
  isNetplayEnabled: () => boolean;
  getLeaderboardSession: () => LeaderboardSession | null;
  setLeaderboardSession: (session: LeaderboardSession | null) => void;
};

export class LeaderboardSessionController {
  private readonly deps: SessionFlowDeps;

  constructor(deps: SessionFlowDeps) {
    this.deps = deps;
  }

  getLeaderboardPlayerId(): string {
    const storageKey = 'smb_leaderboard_player_id';
    const existing = this.deps.getLocalStoragePlayerId();
    if (existing && /^[a-z0-9\-]{8,64}$/i.test(existing)) {
      return existing;
    }
    const generated = `p-${crypto.randomUUID()}`;
    localStorage.setItem(storageKey, generated);
    return generated;
  }

  getActivePackId(): string | null {
    const pack = this.deps.getActivePack();
    const id = pack?.manifest?.id;
    return typeof id === 'string' && id.length > 0 ? id : null;
  }

  isPackAllowed(packId: string | null): boolean {
    const allowlist = this.deps.getLeaderboardAllowlist();
    if (!packId) {
      return true;
    }
    return allowlist.includes(packId);
  }

  buildCourseId(gameSource: GameSource, config: any): string {
    if (gameSource === GAME_SOURCES.SMB1) {
      return String(config?.difficulty ?? 'beginner');
    }
    const mode = config?.mode === 'story' ? 'story' : 'challenge';
    if (mode === 'story') {
      return 'story';
    }
    return String(config?.difficulty ?? 'beginner');
  }

  buildCourseMode(gameSource: GameSource, config: any): 'story' | 'challenge' | 'smb1' {
    if (gameSource === GAME_SOURCES.SMB1) {
      return 'smb1';
    }
    return config?.mode === 'story' ? 'story' : 'challenge';
  }

  isFullCourseRun(gameSource: GameSource, config: any): boolean {
    if (gameSource === GAME_SOURCES.SMB1) {
      return Number(config?.stageIndex ?? 0) === 0;
    }
    const mode = config?.mode === 'story' ? 'story' : 'challenge';
    if (mode === 'story') {
      const worldIndex = Number(config?.worldIndex ?? 0);
      const stageIndex = Number(config?.stageIndex ?? 0);
      return worldIndex === 0 && stageIndex === 0;
    }
    return Number(config?.stageIndex ?? 0) === 0;
  }

  startLeaderboardSession(courseConfig: any) {
    const gameSource = this.deps.getActiveGameSource();
    const packId = this.getActivePackId();
    const eligible = this.isFullCourseRun(gameSource, courseConfig);
    this.deps.setLeaderboardSession({
      active: true,
      eligible,
      gameSource,
      packId,
      courseId: this.buildCourseId(gameSource, courseConfig),
      mode: this.buildCourseMode(gameSource, courseConfig),
      courseConfig: courseConfig ?? {},
      warpUsed: false,
      courseTimerFrames: 0,
      penaltyFrames: 0,
      retryCount: 0,
      stageScoreStart: this.deps.game.score ?? 0,
      segments: [],
      hasSkipped: false,
    });
  }

  handleStageGoal(info: StageGoalInfo) {
    if (!this.deps.leaderboardsClient || this.deps.isNetplayEnabled() || info.isBonusStage) {
      return;
    }
    const packId = this.getActivePackId();
    if (!this.isPackAllowed(packId)) {
      return;
    }
    const goalType = (info.goalType ?? 'B') as 'B' | 'G' | 'R';
    const playerId = this.getLeaderboardPlayerId();
    const displayName = this.deps.getLocalProfileName();
    const leaderboardSession = this.deps.getLeaderboardSession();
    const stageScoreDelta = Math.max(0, Math.trunc(info.score - (leaderboardSession?.stageScoreStart ?? 0)));
    const replay = this.deps.game.exportReplay();
    const activeGameSource = this.deps.getActiveGameSource();
    if (replay) {
      void this.deps.leaderboardsClient.submitStage({
        type: 'stage',
        playerId,
        displayName,
        gameSource: activeGameSource,
        stageId: info.stageId,
        goalType,
        metric: 'time',
        value: Math.max(0, Math.trunc(info.timerFrames)),
        packId,
        replay,
        clientMeta: { version: 1 },
      }).catch(() => {});
      void this.deps.leaderboardsClient.submitStage({
        type: 'stage',
        playerId,
        displayName,
        gameSource: activeGameSource,
        stageId: info.stageId,
        goalType,
        metric: 'score',
        value: stageScoreDelta,
        packId,
        replay,
        clientMeta: { version: 1 },
      }).catch(() => {});
    }

    if (leaderboardSession && leaderboardSession.active) {
      leaderboardSession.courseTimerFrames += Math.max(0, Math.trunc(info.timerFrames));
      if (leaderboardSession.mode === 'challenge' && (goalType === 'G' || goalType === 'R')) {
        leaderboardSession.warpUsed = true;
      }
      if (replay) {
        const segment: CourseReplaySegment = {
          stageId: info.stageId,
          inputs: replay.inputs,
          inputStartTick: replay.inputStartTick ?? 0,
          ticks: replay.ticks ?? replay.inputs.length,
          endReason: 'goal',
          goalType,
        };
        leaderboardSession.segments.push(segment);
      }
    }
  }

  handleStageFail(info: StageFailInfo) {
    const leaderboardSession = this.deps.getLeaderboardSession();
    if (!leaderboardSession || !leaderboardSession.active || info.isBonusStage) {
      return;
    }
    const replay = this.deps.game.exportReplay();
    if (replay) {
      const segment: CourseReplaySegment = {
        stageId: info.stageId,
        inputs: replay.inputs,
        inputStartTick: replay.inputStartTick ?? 0,
        ticks: replay.ticks ?? replay.inputs.length,
        endReason: info.reason,
      };
      leaderboardSession.segments.push(segment);
    }
    leaderboardSession.courseTimerFrames += Math.max(0, Math.trunc(info.timerFrames));
    if (info.reason === 'skip') {
      leaderboardSession.hasSkipped = true;
      return;
    }
    leaderboardSession.retryCount += 1;
    leaderboardSession.penaltyFrames += 60;
  }
}
