import type { Game } from '../../game.js';
import { GAME_SOURCES, type GameSource } from '../../shared/constants/index.js';
import { StageId, STAGE_INFO_MAP } from '../../noclip/SuperMonkeyBall/StageInfo.js';
import { getMb2wsStageInfo, getSmb2StageInfo } from '../../smb2_render.js';

type StageFlowDeps = {
  game: Game;
  getActiveGameSource: () => GameSource;
  setRunning: (value: boolean) => void;
  setPaused: (value: boolean) => void;
  setRenderReady: (value: boolean) => void;
  setLastTime: (value: number) => void;
  ensureGfxReady: () => void;
  hasGfxDevice: () => boolean;
  destroyRenderer: () => void;
  createRenderer: (stageData: any) => void;
  prewarmConfettiRenderer: () => void;
  applyGameCamera: () => void;
  updateMobileMenuButtonVisibility: () => void;
  updateIngameChatVisibility: () => void;
  maybeStartSmb2LikeStageFade: () => void;
  markStageReady: (stageId: number) => void;
  tryApplyPendingSnapshot: (stageId: number) => void;
  getLeaderboardSession: () => any | null;
  isNetplayHostWithLobby: () => boolean;
  buildRoomMeta: () => any;
  setLobbyRoomMeta: (meta: any) => void;
  broadcastRoomUpdate: () => void;
  sendLobbyHeartbeatNow: () => void;
  loadRenderStage: (stageId: number) => Promise<any>;
  loadRenderStageSmb2: (stageId: number, stage: any, gameSource: GameSource) => Promise<any>;
  getStageBasePath: (gameSource: GameSource) => string;
  prefetchPath: (path: string) => void;
  isNaomiStage: (stageId: number) => boolean;
};

export class StageFlowController {
  private readonly deps: StageFlowDeps;
  private stageLoadToken = 0;

  constructor(deps: StageFlowDeps) {
    this.deps = deps;
  }

  private queuePrefetch(paths: string[]) {
    for (const path of paths) {
      if (!path) {
        continue;
      }
      this.deps.prefetchPath(path);
    }
  }

  private getStageAssetPathsSmb1(stageId: number, stageBasePath: string): string[] {
    const stageInfo = STAGE_INFO_MAP.get(stageId as StageId);
    if (!stageInfo) {
      return [];
    }
    const stageIdStr = String(stageId).padStart(3, '0');
    const stagedefPath = `${stageBasePath}/st${stageIdStr}/STAGE${stageIdStr}.lz`;
    const stageGmaPath = `${stageBasePath}/st${stageIdStr}/st${stageIdStr}.gma`;
    const stageTplPath = `${stageBasePath}/st${stageIdStr}/st${stageIdStr}.tpl`;
    const commonGmaPath = `${stageBasePath}/init/common.gma`;
    const commonTplPath = `${stageBasePath}/init/common.tpl`;
    const commonNlPath = `${stageBasePath}/init/common_p.lz`;
    const commonNlTplPath = `${stageBasePath}/init/common.lz`;
    const bgName = stageInfo.bgInfo.fileName;
    const bgGmaPath = `${stageBasePath}/bg/${bgName}.gma`;
    const bgTplPath = `${stageBasePath}/bg/${bgName}.tpl`;
    const stageNlObjPath = `${stageBasePath}/st${stageIdStr}/st${stageIdStr}_p.lz`;
    const stageNlTplPath = `${stageBasePath}/st${stageIdStr}/st${stageIdStr}.lz`;
    const paths = [
      stagedefPath,
      stageGmaPath,
      stageTplPath,
      commonGmaPath,
      commonTplPath,
      commonNlPath,
      commonNlTplPath,
      bgGmaPath,
      bgTplPath,
    ];
    if (this.deps.isNaomiStage(stageId)) {
      paths.push(stageNlObjPath, stageNlTplPath);
    }
    return paths;
  }

  private getStageAssetPathsSmb2(stageId: number, gameSource: GameSource, stageBasePath: string): string[] {
    const stageIdStr = String(stageId).padStart(3, '0');
    const stageInfo =
      gameSource === GAME_SOURCES.MB2WS ? getMb2wsStageInfo(stageId) : getSmb2StageInfo(stageId);
    const bgName = stageInfo?.bgInfo?.fileName ?? '';
    const paths = [
      `${stageBasePath}/st${stageIdStr}/STAGE${stageIdStr}.lz`,
      `${stageBasePath}/st${stageIdStr}/st${stageIdStr}.gma`,
      `${stageBasePath}/st${stageIdStr}/st${stageIdStr}.tpl`,
      `${stageBasePath}/init/common.gma`,
      `${stageBasePath}/init/common.tpl`,
      `${stageBasePath}/init/common_p.lz`,
      `${stageBasePath}/init/common.lz`,
    ];
    if (bgName) {
      paths.push(`${stageBasePath}/bg/${bgName}.gma`, `${stageBasePath}/bg/${bgName}.tpl`);
    }
    return paths;
  }

  private preloadNextStages() {
    const course = this.deps.game.course;
    if (!course?.getNextStageIds) {
      return;
    }
    const nextStageIds = course.getNextStageIds();
    if (!nextStageIds.length) {
      return;
    }
    const activeGameSource = this.deps.getActiveGameSource();
    const stageBasePath = this.deps.game.stageBasePath ?? this.deps.getStageBasePath(activeGameSource);
    const uniqueIds = new Set(nextStageIds.filter((id: number) => typeof id === 'number' && id > 0));
    for (const stageId of uniqueIds) {
      const paths =
        activeGameSource === GAME_SOURCES.SMB1
          ? this.getStageAssetPathsSmb1(stageId, stageBasePath)
          : this.getStageAssetPathsSmb2(stageId, activeGameSource, stageBasePath);
      if (paths.length > 0) {
        this.queuePrefetch(paths);
      }
    }
  }

  private applyStageReadySideEffects(stageId: number) {
    this.deps.setRunning(true);
    this.deps.setPaused(false);
    this.deps.setRenderReady(true);
    this.deps.setLastTime(performance.now());
    this.deps.updateMobileMenuButtonVisibility();
    this.deps.updateIngameChatVisibility();
    this.deps.maybeStartSmb2LikeStageFade();
    this.deps.markStageReady(stageId);
    this.deps.tryApplyPendingSnapshot(stageId);
    const localPlayer = this.deps.game.getLocalPlayer();
    if (localPlayer?.pendingSpawn && localPlayer.isSpectator) {
      this.deps.game.enterLocalSpectatorFreeFly();
    }
    this.preloadNextStages();
    const session = this.deps.getLeaderboardSession();
    if (session?.active) {
      session.stageScoreStart = Math.max(0, Math.trunc(this.deps.game.score ?? 0));
    }
    if (this.deps.isNetplayHostWithLobby()) {
      const meta = this.deps.buildRoomMeta();
      if (meta) {
        this.deps.setLobbyRoomMeta(meta);
        this.deps.broadcastRoomUpdate();
        this.deps.sendLobbyHeartbeatNow();
      }
    }
  }

  async handleStageLoaded(stageId: number) {
    const token = ++this.stageLoadToken;
    this.deps.setRenderReady(false);
    this.deps.ensureGfxReady();
    if (!this.deps.hasGfxDevice()) {
      return;
    }

    const activeGameSource = this.deps.getActiveGameSource();
    if (activeGameSource !== GAME_SOURCES.SMB1) {
      const stage = this.deps.game.stage;
      const stageData = await this.deps.loadRenderStageSmb2(stageId, stage, activeGameSource);
      if (token !== this.stageLoadToken) {
        return;
      }
      this.deps.destroyRenderer();
      this.deps.createRenderer(stageData);
      this.deps.prewarmConfettiRenderer();
      (window as typeof window & { smbStageInfo?: { stageId: number; gameSource: GameSource; bgFile: string } }).smbStageInfo = {
        stageId,
        gameSource: activeGameSource,
        bgFile: stageData.stageInfo?.bgInfo?.fileName ?? '',
      };
      this.deps.applyGameCamera();
      this.applyStageReadySideEffects(stageId);
      return;
    }

    const stageData = await this.deps.loadRenderStage(stageId);
    if (token !== this.stageLoadToken) {
      return;
    }
    this.deps.destroyRenderer();
    this.deps.createRenderer(stageData);
    this.deps.prewarmConfettiRenderer();
    (window as typeof window & { smbStageInfo?: { stageId: number; gameSource: GameSource; bgFile: string } }).smbStageInfo = {
      stageId,
      gameSource: activeGameSource,
      bgFile: stageData.stageInfo?.bgInfo?.fileName ?? '',
    };
    this.deps.applyGameCamera();
    this.applyStageReadySideEffects(stageId);
  }
}
