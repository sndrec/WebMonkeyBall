import type { GameSource } from './constants.js';
import type { ReplayData } from './replay.js';
import type { QuantizedStick } from './determinism.js';

export type LeaderboardEntry = {
  entryId: string;
  playerId: string;
  displayName: string;
  value: number;
  createdAt: number;
};

export type AllowlistEntry = {
  packId: string;
  label: string;
};

export type CourseReplaySegment = {
  stageId: number;
  inputs: QuantizedStick[];
  inputStartTick: number;
  ticks: number;
  endReason: 'goal' | 'ringout' | 'timeover' | 'manual_reset' | 'skip';
  goalType?: 'B' | 'G' | 'R';
};

export type CourseReplayData = {
  version: 1;
  gameSource: GameSource;
  packId?: string;
  course: {
    mode: 'story' | 'challenge' | 'smb1';
    difficulty?: string;
    worldIndex?: number;
    stageIndex?: number;
  };
  segments: CourseReplaySegment[];
};

type StageSubmitPayload = {
  type: 'stage';
  playerId: string;
  displayName: string;
  gameSource: GameSource;
  stageId: number;
  goalType: 'B' | 'G' | 'R';
  metric: 'time' | 'score';
  value: number;
  packId?: string | null;
  replay: ReplayData;
  clientMeta?: Record<string, any>;
};

type CourseSubmitPayload = {
  type: 'course';
  playerId: string;
  displayName: string;
  gameSource: GameSource;
  courseId: string;
  mode: 'story' | 'challenge' | 'smb1';
  warpFlag: 'warpless' | 'warped';
  value: number;
  packId?: string | null;
  replay: CourseReplayData;
  clientMeta?: Record<string, any>;
};

export class LeaderboardsClient {
  private baseUrl: string;
  private allowlistCache: AllowlistEntry[] | null = null;
  private allowlistFetchedAt: number | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, init);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error ?? `http_${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  async getAllowlist(force = false): Promise<AllowlistEntry[]> {
    const now = Date.now();
    if (!force && this.allowlistCache && this.allowlistFetchedAt && (now - this.allowlistFetchedAt) < 60_000) {
      return this.allowlistCache;
    }
    const data = await this.fetchJson<{ packs?: AllowlistEntry[] }>('/leaderboards/allowlist');
    this.allowlistCache = data.packs ?? [];
    this.allowlistFetchedAt = now;
    return this.allowlistCache;
  }

  async submitStage(payload: StageSubmitPayload): Promise<{ submissionId: string; status: string }> {
    return this.fetchJson('/leaderboards/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async submitCourse(payload: CourseSubmitPayload): Promise<{ submissionId: string; status: string }> {
    return this.fetchJson('/leaderboards/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async getStageLeaderboard(params: {
    gameSource: GameSource;
    stageId: number;
    goalType: 'B' | 'G' | 'R';
    metric: 'time' | 'score';
    packId?: string | null;
    limit?: number;
  }): Promise<LeaderboardEntry[]> {
    const query = new URLSearchParams({
      gameSource: params.gameSource,
      stageId: String(params.stageId),
      goalType: params.goalType,
      metric: params.metric,
      limit: String(params.limit ?? 50),
    });
    if (params.packId) {
      query.set('packId', params.packId);
    }
    const data = await this.fetchJson<{ entries?: LeaderboardEntry[] }>(`/leaderboards/stage?${query.toString()}`);
    return data.entries ?? [];
  }

  async getCourseLeaderboard(params: {
    gameSource: GameSource;
    courseId: string;
    mode: 'story' | 'challenge' | 'smb1';
    warpFlag: 'warpless' | 'warped';
    packId?: string | null;
    limit?: number;
  }): Promise<LeaderboardEntry[]> {
    const query = new URLSearchParams({
      gameSource: params.gameSource,
      courseId: params.courseId,
      mode: params.mode,
      warpFlag: params.warpFlag,
      limit: String(params.limit ?? 50),
    });
    if (params.packId) {
      query.set('packId', params.packId);
    }
    const data = await this.fetchJson<{ entries?: LeaderboardEntry[] }>(`/leaderboards/course?${query.toString()}`);
    return data.entries ?? [];
  }
}
