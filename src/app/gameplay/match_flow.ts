import type { LeaderboardsClient, CourseReplayData } from '../../leaderboards.js';
import type { Game } from '../../game.js';
import type { GameSource } from '../../shared/constants/index.js';
import type { MenuPanel } from '../ui/menu_flow.js';

type LeaderboardSession = {
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
  segments: any[];
  hasSkipped: boolean;
};

type MatchFlowDeps = {
  game: Game;
  resumeButton: HTMLButtonElement;
  hudStatus: HTMLElement | null;
  hideAllNameplates: () => void;
  isRunning: () => boolean;
  setRunning: (value: boolean) => void;
  isNetplayEnabled: () => boolean;
  isHost: () => boolean;
  getLobbyRoom: () => any;
  setLobbyRoomMeta: (meta: any) => void;
  buildRoomMeta: () => any;
  broadcastRoomUpdate: () => void;
  sendLobbyHeartbeat: (nowMs: number, force?: boolean) => void;
  hostBroadcast: (msg: any) => void;
  clearNetplayCurrentCourse: () => void;
  setOverlayVisible: (visible: boolean) => void;
  setActiveMenu: (menu: MenuPanel) => void;
  leaveRoom: (opts?: { skipConfirm?: boolean }) => Promise<void>;
  updateLobbyUi: () => void;
  updateIngameChatVisibility: () => void;
  resetNetplayForStage: () => void;
  leaderboardsClient: LeaderboardsClient | null;
  getLeaderboardSession: () => LeaderboardSession | null;
  setLeaderboardSession: (session: LeaderboardSession | null) => void;
  getPendingSnapshot: () => any;
  setPendingSnapshot: (snapshot: any) => void;
  getLocalProfileName: () => string;
  isPackAllowed: (packId: string | null) => boolean;
  getLeaderboardPlayerId: () => string;
};

export class MatchFlowController {
  private readonly deps: MatchFlowDeps;

  constructor(deps: MatchFlowDeps) {
    this.deps = deps;
  }

  resetMatchState() {
    this.deps.setLeaderboardSession(null);
    this.deps.setPendingSnapshot(null);
    if (this.deps.isNetplayEnabled()) {
      this.deps.clearNetplayCurrentCourse();
      this.deps.resetNetplayForStage();
    }
  }

  private hostReturnAllPlayersToLobby() {
    if (this.deps.getLobbyRoom()) {
      const meta = this.deps.buildRoomMeta();
      if (meta) {
        this.deps.setLobbyRoomMeta(meta);
      }
      this.deps.broadcastRoomUpdate();
      this.deps.sendLobbyHeartbeat(performance.now(), true);
    }
    this.deps.hostBroadcast({ type: 'match_end' });
  }

  destroySingleplayerForNetplay() {
    if (!this.deps.isRunning() || this.deps.isNetplayEnabled()) {
      return;
    }
    this.resetMatchState();
    this.endActiveMatch();
    this.deps.setOverlayVisible(true);
  }

  endActiveMatch() {
    if (!this.deps.isRunning()) {
      return;
    }
    this.deps.game.pause();
    this.deps.setRunning(false);
    this.deps.resumeButton.disabled = true;
    if (this.deps.hudStatus) {
      this.deps.hudStatus.textContent = '';
    }
    this.deps.hideAllNameplates();
    this.deps.updateIngameChatVisibility();
  }

  endMatchToMenu() {
    this.resetMatchState();
    this.endActiveMatch();
    this.deps.setOverlayVisible(true);
    this.deps.setActiveMenu('main');
  }

  endMatchToLobby() {
    this.resetMatchState();
    this.endActiveMatch();
    this.deps.setOverlayVisible(true);
    this.deps.setActiveMenu('multiplayer');
    this.deps.updateLobbyUi();
  }

  returnMatchToLobby() {
    if (!this.deps.isNetplayEnabled()) {
      this.endMatchToMenu();
      return;
    }
    if (!this.deps.isHost()) {
      return;
    }
    this.endMatchToLobby();
    this.hostReturnAllPlayersToLobby();
  }

  async leaveMatchToLobbyList() {
    if (!this.deps.isNetplayEnabled()) {
      this.endMatchToMenu();
      return;
    }
    if (this.deps.isHost() && this.deps.getLobbyRoom()) {
      const confirmed = window.confirm('Leaving will close this lobby for everyone. Leave anyway?');
      if (!confirmed) {
        return;
      }
    }
    this.resetMatchState();
    this.endActiveMatch();
    this.deps.setOverlayVisible(true);
    this.deps.setActiveMenu('multiplayer');
    await this.deps.leaveRoom({ skipConfirm: true });
  }

  handleCourseComplete() {
    if (!this.deps.isRunning()) {
      return;
    }
    const leaderboardSession = this.deps.getLeaderboardSession();
    if (!this.deps.isNetplayEnabled() && this.deps.leaderboardsClient && leaderboardSession?.active) {
      const session = leaderboardSession;
      const packAllowed = this.deps.isPackAllowed(session.packId);
      if (session.eligible && !session.hasSkipped && packAllowed) {
        const totalFrames = session.courseTimerFrames + session.penaltyFrames;
        const playerId = this.deps.getLeaderboardPlayerId();
        const displayName = this.deps.getLocalProfileName();
        const warpFlag = session.mode === 'challenge' && session.warpUsed ? 'warped' : 'warpless';
        const courseReplay: CourseReplayData = {
          version: 1,
          gameSource: session.gameSource,
          packId: session.packId ?? undefined,
          course: {
            mode: session.mode,
            difficulty: session.courseConfig?.difficulty,
            worldIndex: session.courseConfig?.worldIndex,
            stageIndex: session.courseConfig?.stageIndex,
          },
          segments: session.segments,
        };
        void this.deps.leaderboardsClient.submitCourse({
          type: 'course',
          playerId,
          displayName,
          gameSource: session.gameSource,
          courseId: session.courseId,
          mode: session.mode,
          warpFlag,
          value: Math.max(0, Math.trunc(totalFrames)),
          packId: session.packId,
          replay: courseReplay,
          clientMeta: {
            version: 1,
            retries: session.retryCount,
            penaltyFrames: session.penaltyFrames,
          },
        }).catch(() => {});
      }
      this.deps.setLeaderboardSession(null);
    }
    if (this.deps.isNetplayEnabled()) {
      if (!this.deps.isHost()) {
        return;
      }
      this.endMatchToLobby();
      this.hostReturnAllPlayersToLobby();
      return;
    }
    this.endMatchToMenu();
  }
}
