import { Course } from './course.js';
import { Smb2Course, type Smb2CourseConfig } from './course_smb2.js';
import { Mb2wsCourse, type Mb2wsCourseConfig } from './course_mb2ws.js';
import { loadGoalTapeAnchorY, loadStageDef, loadStageModelBounds, StageRuntime } from './stage.js';
import { Input } from './input.js';
import { AudioManager } from './audio.js';
import {
  BALL_FLAGS,
  BALL_STATES,
  DEFAULT_STAGE_TIME,
  GAME_SOURCES,
  INFO_FLAGS,
  STAGE_BASE_PATHS,
  type GameSource,
} from './constants.js';
import { intersectsMovingSpheres, tfPhysballToAnimGroupSpace } from './collision.js';
import { MatrixStack, sqrt, toS16 } from './math.js';
import { GameplayCamera } from './camera.js';
import { dequantizeStick, quantizeInput, quantizeStick, type QuantizedInput, type QuantizedStick } from './determinism.js';
import { createReplayData, type ReplayData } from './replay.js';
import { RollbackSession } from './rollback.js';
import {
  checkBallEnteredGoal,
  createBallState,
  initBallForStage,
  resetBall,
  resolveBallBallCollision,
  startBallDrop,
  startGoal,
  stepBall,
} from './physics.js';
import { GOAL_FLOAT_FRAMES } from './physics.js';
import { World } from './world.js';
import type {
  BananaRenderState,
  ConfettiRenderState,
  EffectRenderState,
  JamabarRenderState,
  GoalBagRenderState,
  GoalTapeRenderState,
  StageTiltRenderState,
  SwitchRenderState,
} from './noclip/Render.js';

const STAGE_BASE_PATH = STAGE_BASE_PATHS[GAME_SOURCES.SMB1];
const MAX_FRAME_DELTA = 5;
const BONUS_STAGE_MIN_ID = 91;
const BONUS_STAGE_MAX_ID = 95;
const BANANA_SINGLE_RADIUS = 0.5;
const BANANA_BUNCH_RADIUS = 0.75;
const BANANA_SINGLE_VALUE = 1;
const BANANA_BUNCH_VALUE = 10;
const BANANA_SINGLE_POINTS = 100;
const BANANA_BUNCH_POINTS = 1000;
const BANANA_STATE_HOLDING = 7;
const BANANA_HOLD_FRAMES = 30;
const ITEM_FLAG_COLLIDABLE = 1 << 1;
const GOAL_SEQUENCE_FRAMES = 360;
const BONUS_CLEAR_SEQUENCE_FRAMES = 180;
const GOAL_SKIP_TOTAL_FRAMES = 210;
const RINGOUT_TOTAL_FRAMES = 270;
const RINGOUT_BONUS_CUTOFF_FRAMES = 260;
const PLAYER_NO_COLLIDE_CLEAR_EPS = 0.02;
const RINGOUT_BONUS_REMAINING_FRAMES = 110;
const RINGOUT_SKIP_DELAY_FRAMES = 60;
const RINGOUT_STATUS_TEXT = 'Fall out!';
const TIMEOVER_TOTAL_FRAMES = 120;
const TIMEOVER_STATUS_TEXT = 'Time over!';
const HURRY_UP_FRAMES = 11 * 60;
const COUNTDOWN_START_FRAMES = 10 * 60;
const DEFAULT_LIVES = 3;
const SPEED_MPH_SCALE = 134.21985;
const SPEED_BAR_MAX_MPH = 70;
const fallOutStack = new MatrixStack();
const fallOutLocal = { x: 0, y: 0, z: 0 };
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

type PlayerState = {
  id: number;
  ball: ReturnType<typeof createBallState>;
  world: World;
  cameraRotY: number;
  isSpectator: boolean;
  pendingSpawn: boolean;
  finished: boolean;
  goalType: string | null;
  goalTimerFrames: number;
  goalSkipTimerFrames: number;
  goalInfo: any;
  respawnTimerFrames: number;
  ringoutTimerFrames: number;
  ringoutSkipTimerFrames: number;
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpS16(a: number, b: number, t: number): number {
  const delta = toS16(b - a);
  return toS16(a + delta * t);
}

function nlerpQuat(out: { x: number; y: number; z: number; w: number }, a: any, b: any, t: number) {
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  let bw = b.w;
  const dot = (a.x * bx) + (a.y * by) + (a.z * bz) + (a.w * bw);
  if (dot < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  out.x = a.x + (bx - a.x) * t;
  out.y = a.y + (by - a.y) * t;
  out.z = a.z + (bz - a.z) * t;
  out.w = a.w + (bw - a.w) * t;
  const len = sqrt((out.x * out.x) + (out.y * out.y) + (out.z * out.z) + (out.w * out.w));
  if (len > 0) {
    out.x /= len;
    out.y /= len;
    out.z /= len;
    out.w /= len;
  }
}

type Vec3 = { x: number; y: number; z: number };
type CameraPose = { eye: Vec3; lookAt: Vec3; rotX: number; rotY: number; rotZ: number };

type Hud = {
  stage?: HTMLElement | null;
  timer?: HTMLElement | null;
  status?: HTMLElement | null;
  level?: HTMLElement | null;
  score?: HTMLElement | null;
  bananas?: HTMLElement | null;
  lives?: HTMLElement | null;
  speed?: HTMLElement | null;
  speedFill?: HTMLElement | null;
};

type CourseLike = {
  currentStageId: number;
  getTimeLimitFrames: () => number;
  getStageLabel: () => string;
  getFloorInfo?: () => {
    current: number;
    total: number;
    prefix: string;
    difficultyIndex?: number;
    difficultyIconIndex?: number;
    showDifficultyIcon?: boolean;
    isFinal: boolean;
  };
  peekJumpCount?: (info: {
    flags: number;
    goalType: string | null;
    timerCurr: number;
    u_currStageId: number;
  }) => number | null;
  isBonusStage?: () => boolean;
  advance: (info: {
    flags: number;
    goalType: string | null;
    timerCurr: number;
    u_currStageId: number;
  }) => boolean;
};

type Smb1CourseConfig = {
  difficulty: string;
  stageIndex: number;
};

function isSmb2CourseConfig(config: unknown): config is Smb2CourseConfig {
  return typeof config === 'object' && config !== null && 'mode' in config;
}

function isMb2wsCourseConfig(config: unknown): config is Mb2wsCourseConfig {
  return typeof config === 'object' && config !== null && 'mode' in config;
}

type GameOptions = {
  hud?: Hud;
  onReadyToResume?: () => void;
  onPaused?: () => void;
  onResumed?: () => void;
  onStageLoaded?: (stageId: number) => void;
  stageBasePath?: string;
  gameSource?: GameSource;
  audio?: AudioManager;
};

export type BallRenderState = {
  pos: Vec3;
  orientation: { x: number; y: number; z: number; w: number };
  radius: number;
  visible: boolean;
};

function formatTimer(frames: number): string {
  const clampedFrames = Math.max(0, Math.floor(frames));
  const totalSeconds = Math.floor(clampedFrames / 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const frameRemainder = clampedFrames % 60;
  const centis = Math.floor((frameRemainder * 100) / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

function isBonusStageId(stageId: number): boolean {
  return stageId >= BONUS_STAGE_MIN_ID && stageId <= BONUS_STAGE_MAX_ID;
}

function isBananaBunch(type: number): boolean {
  return (type & 1) === 1;
}

function bananaRadiusForType(type: number): number {
  return isBananaBunch(type) ? BANANA_BUNCH_RADIUS : BANANA_SINGLE_RADIUS;
}

function bananaValueForType(type: number): number {
  return isBananaBunch(type) ? BANANA_BUNCH_VALUE : BANANA_SINGLE_VALUE;
}

function bananaPointValueForType(type: number): number {
  return isBananaBunch(type) ? BANANA_BUNCH_POINTS : BANANA_SINGLE_POINTS;
}

function formatScore(value: number): string {
  return String(Math.max(0, Math.trunc(value))).padStart(9, '0');
}

function bananaTiltFactor(banana: any): number {
  if (!banana) {
    return 1;
  }
  if ((banana.state ?? 0) < 7 && !(banana.collected ?? false)) {
    return 1;
  }
  const timer = Math.max(0, banana.tiltTimer ?? 0);
  return Math.min(1, timer / 30);
}

function normalizeGoalType(goalType: string | number | null): 'B' | 'G' | 'R' {
  if (goalType === 'G' || goalType === 'R' || goalType === 'B') {
    return goalType;
  }
  if (goalType === 1) {
    return 'G';
  }
  if (goalType === 2) {
    return 'R';
  }
  return 'B';
}

function computeGoalScore(goalType: string | number | null, framesRemaining: number, timeLimitFrames: number): number {
  const normalizedGoal = normalizeGoalType(goalType);
  const timeRemaining = Math.max(0, Math.floor(framesRemaining));
  let score = Math.floor((timeRemaining * 100) / 60);
  if (normalizedGoal === 'G') {
    score += 10000;
  } else if (normalizedGoal === 'R') {
    score += 20000;
  }
  let jumpDistance = 1;
  if (timeLimitFrames > 0 && timeRemaining > (timeLimitFrames >> 1)) {
    jumpDistance *= 2;
  }
  return score * jumpDistance;
}

export class Game {
  public hud: Hud | null;
  public onReadyToResume?: () => void;
  public onPaused?: () => void;
  public onResumed?: () => void;
  public onStageLoaded?: (stageId: number) => void;
  public stageBasePath: string;
  public gameSource: GameSource;
  public audio: AudioManager | null;

  public input: Input | null;
  public world: World | null;
  public ball: ReturnType<typeof createBallState> | null;
  public players: PlayerState[];
  public localPlayerId: number;
  public maxPlayers: number;
  public playerCollisionEnabled: boolean;
  public noCollidePairs: Set<string>;
  public cameraController: GameplayCamera | null;

  public tmpPhysBall: {
    pos: Vec3;
    prevPos: Vec3;
    vel: Vec3;
    radius: number;
    animGroupId: number;
  };

  public fixedStep: number;
  public accumulator: number;
  public running: boolean;
  public paused: boolean;

  public course: CourseLike | null;
  public stage: any;
  public stageRuntime: StageRuntime | null;
  public bananasLeft: number;
  public score: number;
  public lives: number;
  public stageTimeLimitFrames: number;
  public stageTimerFrames: number;
  public statusText: string;
  public loadToken: number;
  public pendingAdvance: boolean;
  public introTimerFrames: number;
  public introTotalFrames: number;
  public dropFrames: number;
  public stageAttempts: number;
  public timeoverTimerFrames: number;
  public bonusClearPending: boolean;
  public readyAnnouncerPlayed: boolean;
  public goAnnouncerPlayed: boolean;
  public goalWooshPlayed: boolean;
  public hurryUpAnnouncerPlayed: boolean;
  public timeOverAnnouncerPlayed: boolean;
  public animGroupTransforms: Float32Array[] | null;
  public bananaGroups: { collected: boolean }[][] | null;
  public bananaCollectedByAnimGroup: boolean[][] | null;
  public renderBallState: BallRenderState | null;
  public renderBallStates: BallRenderState[] | null;
  public renderBananas: BananaRenderState[] | null;
  public renderGoalBags: GoalBagRenderState[] | null;
  public renderGoalTapes: GoalTapeRenderState[] | null;
  public renderConfetti: ConfettiRenderState[] | null;
  public renderEffects: EffectRenderState[] | null;
  public renderJamabars: JamabarRenderState[] | null;
  public renderSwitches: SwitchRenderState[] | null;
  public renderStageTilt: StageTiltRenderState | null;
  public prevCameraPose: CameraPose | null;
  public cameraPose: CameraPose | null;
  public interpolatedAnimGroupTransforms: Float32Array[] | null;
  public effectDebugLastLogTime: number;
  public loadingStage: boolean;
  public simPerf: {
    enabled: boolean;
    logEvery: number;
    tickCount: number;
    tickMs: number;
    lastTickMs: number;
  };
  public simTick: number;
  public inputFeed: (QuantizedStick | QuantizedInput)[] | null;
  public inputFeedIndex: number;
  public inputRecord: QuantizedStick[] | null;
  public playerInputFeeds: Map<number, (QuantizedStick | QuantizedInput)[]>;
  public playerInputFeedIndices: Map<number, number>;
  public rollbackEnabled: boolean;
  public rollbackSession: RollbackSession<any> | null;
  public nextPlayerId: number;
  public lastLocalInput: QuantizedInput;
  public fixedTickMode: boolean;
  public fixedTicksPerUpdate: number;
  public autoRecordInputs: boolean;
  public inputStartTick: number;
  public replayInputStartTick: number | null;
  public replayAutoFastForward: boolean;

  constructor({
    hud,
    onReadyToResume,
    onPaused,
    onResumed,
    onStageLoaded,
    stageBasePath,
    gameSource,
    audio,
  }: GameOptions = {}) {
    this.hud = hud ?? null;
    this.onReadyToResume = onReadyToResume;
    this.onPaused = onPaused;
    this.onResumed = onResumed;
    this.onStageLoaded = onStageLoaded;
    this.gameSource = gameSource ?? GAME_SOURCES.SMB1;
    this.stageBasePath = stageBasePath ?? STAGE_BASE_PATHS[this.gameSource];
    this.audio = audio ?? null;

    this.input = null;
    this.world = null;
    this.ball = null;
    this.players = [];
    this.localPlayerId = 0;
    this.maxPlayers = 8;
    this.playerCollisionEnabled = true;
    this.noCollidePairs = new Set();
    this.cameraController = null;
    this.tmpPhysBall = {
      pos: { x: 0, y: 0, z: 0 },
      prevPos: { x: 0, y: 0, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      radius: 0.5,
      animGroupId: 0,
    };

    this.fixedStep = 1 / 60;
    this.accumulator = 0;

    this.running = false;
    this.paused = true;

    this.course = null;
    this.stage = null;
    this.stageRuntime = null;
    this.bananasLeft = 0;
    this.score = 0;
    this.lives = DEFAULT_LIVES;
    this.stageTimeLimitFrames = DEFAULT_STAGE_TIME;
    this.stageTimerFrames = 0;
    this.statusText = '';
    this.loadToken = 0;
    this.pendingAdvance = false;
    this.introTimerFrames = 0;
    this.introTotalFrames = 120;
    this.dropFrames = 24;
    this.stageAttempts = 0;
    this.timeoverTimerFrames = 0;
    this.bonusClearPending = false;
    this.readyAnnouncerPlayed = false;
    this.goAnnouncerPlayed = false;
    this.goalWooshPlayed = false;
    this.hurryUpAnnouncerPlayed = false;
    this.timeOverAnnouncerPlayed = false;
    this.animGroupTransforms = null;
    this.bananaGroups = null;
    this.bananaCollectedByAnimGroup = null;
    this.renderBallState = null;
    this.renderBallStates = null;
    this.renderBananas = null;
    this.renderGoalBags = null;
    this.renderGoalTapes = null;
    this.renderConfetti = null;
    this.renderEffects = null;
    this.renderJamabars = null;
    this.renderSwitches = null;
    this.renderStageTilt = null;
    this.prevCameraPose = null;
    this.cameraPose = null;
    this.interpolatedAnimGroupTransforms = null;
    this.effectDebugLastLogTime = 0;
    this.loadingStage = false;
    this.simPerf = {
      enabled: true,
      logEvery: 120,
      tickCount: 0,
      tickMs: 0,
      lastTickMs: 0,
    };
    this.simTick = 0;
    this.inputFeed = null;
    this.inputFeedIndex = 0;
    this.inputRecord = null;
    this.playerInputFeeds = new Map();
    this.playerInputFeedIndices = new Map();
    this.rollbackEnabled = false;
    this.rollbackSession = null;
    this.nextPlayerId = 1;
    this.lastLocalInput = { x: 0, y: 0, buttons: 0 };
    this.fixedTickMode = false;
    this.fixedTicksPerUpdate = 1;
    this.autoRecordInputs = true;
    this.inputStartTick = 0;
    this.replayInputStartTick = null;
    this.replayAutoFastForward = false;
  }

  setGameSource(source: GameSource) {
    this.gameSource = source;
    this.stageBasePath = STAGE_BASE_PATHS[source] ?? STAGE_BASE_PATH;
    this.audio?.stopMusic();
  }

  setInputFeed(feed: QuantizedStick[] | null) {
    this.inputFeed = feed;
    this.inputFeedIndex = 0;
  }

  setPlayerInputFeed(playerId: number, feed: (QuantizedStick | QuantizedInput)[] | null) {
    if (!feed) {
      this.playerInputFeeds.delete(playerId);
      this.playerInputFeedIndices.delete(playerId);
      return;
    }
    this.playerInputFeeds.set(playerId, feed);
    this.playerInputFeedIndices.set(playerId, 0);
  }

  setLocalPlayerId(playerId: number) {
    if (this.localPlayerId === playerId) {
      return;
    }
    const existing = this.players.find((player) => player.id === playerId);
    const current = this.players.find((player) => player.id === this.localPlayerId);
    if (existing && existing !== current) {
      this.localPlayerId = playerId;
      this.ball = existing.ball;
      return;
    }
    if (current) {
      current.id = playerId;
      current.ball.playerId = playerId;
      this.localPlayerId = playerId;
      this.ball = current.ball;
      return;
    }
    this.localPlayerId = playerId;
  }

  applyFrameInputs(frameInputs: Map<number, QuantizedInput>) {
    for (const player of this.players) {
      const frame = frameInputs.get(player.id);
      if (frame) {
        this.setPlayerInputFeed(player.id, [frame]);
      } else {
        this.setPlayerInputFeed(player.id, null);
      }
    }
  }

  advanceOneFrame(frameInputs: Map<number, QuantizedInput>) {
    this.applyFrameInputs(frameInputs);
    const prevFixed = this.fixedTickMode;
    const prevTicks = this.fixedTicksPerUpdate;
    this.setFixedTickMode(true, 1);
    this.update(this.fixedStep);
    this.setFixedTickMode(prevFixed, prevTicks);
  }

  ensureRollbackSession() {
    if (this.rollbackSession) {
      return this.rollbackSession;
    }
    this.rollbackSession = new RollbackSession({
      saveState: () => this.saveRollbackState(),
      loadState: (state) => this.loadRollbackState(state),
      advanceFrame: (inputs) => this.advanceOneFrame(inputs),
    }, 30);
    return this.rollbackSession;
  }

  setFixedTickMode(enabled: boolean, ticksPerUpdate = 1) {
    this.fixedTickMode = enabled;
    this.fixedTicksPerUpdate = Math.max(1, ticksPerUpdate | 0);
  }

  setReplayMode(enabled: boolean, useFixedTicks = true) {
    this.autoRecordInputs = !enabled;
    this.setFixedTickMode(enabled && useFixedTicks, 1);
    if (enabled) {
      this.inputRecord = null;
      this.replayInputStartTick = 0;
      this.replayAutoFastForward = true;
    } else {
      this.inputFeed = null;
      this.inputFeedIndex = 0;
      this.replayInputStartTick = null;
      this.replayAutoFastForward = false;
    }
  }

  startInputRecording() {
    this.inputRecord = [];
  }

  stopInputRecording() {
    const record = this.inputRecord;
    this.inputRecord = null;
    return record;
  }

  exportReplay(note?: string, hashes?: number[]): ReplayData | null {
    if (!this.stage || !this.inputRecord) {
      return null;
    }
    return createReplayData(
      this.gameSource,
      this.stage.stageId,
      this.inputRecord.length,
      this.inputStartTick,
      this.inputRecord.slice(),
      hashes,
      note,
    );
  }

  init() {
    this.input = new Input();
    this.world = new World();
    this.ball = createBallState();
    this.ball.playerId = this.localPlayerId;
    this.players = [
      {
        id: this.localPlayerId,
        ball: this.ball,
        world: new World(),
        cameraRotY: 0,
        isSpectator: false,
        pendingSpawn: false,
        finished: false,
        goalType: null,
        goalTimerFrames: 0,
        goalSkipTimerFrames: 0,
        goalInfo: null,
        respawnTimerFrames: 0,
        ringoutTimerFrames: 0,
        ringoutSkipTimerFrames: 0,
      },
    ];
    this.cameraController = new GameplayCamera();
    this.running = true;
  }

  getLocalPlayer() {
    return this.players.find((player) => player.id === this.localPlayerId) ?? null;
  }

  private allActivePlayersFinished() {
    let hasActive = false;
    for (const player of this.players) {
      if (player.isSpectator || player.pendingSpawn) {
        continue;
      }
      hasActive = true;
      if (!player.finished) {
        return false;
      }
    }
    return hasActive;
  }

  private getAdvanceGoalType() {
    for (const player of this.players) {
      if (player.goalType) {
        return player.goalType;
      }
    }
    return this.stage?.goals?.[0]?.type ?? 'B';
  }

  private getPairKey(a: number, b: number) {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
  }

  private markNoCollideForPlayer(playerId: number) {
    for (const player of this.players) {
      if (player.id === playerId) {
        continue;
      }
      this.noCollidePairs.add(this.getPairKey(playerId, player.id));
    }
  }

  private resolvePlayerCollisions() {
    if (!this.playerCollisionEnabled || this.players.length < 2) {
      return;
    }
    for (let i = 0; i < this.players.length; i += 1) {
      const playerA = this.players[i];
      if (playerA.isSpectator || playerA.pendingSpawn) {
        continue;
      }
      const ballA = playerA.ball;
      if (ballA.state !== BALL_STATES.PLAY || (ballA.flags & BALL_FLAGS.INVISIBLE)) {
        continue;
      }
      for (let j = i + 1; j < this.players.length; j += 1) {
        const playerB = this.players[j];
        if (playerB.isSpectator || playerB.pendingSpawn) {
          continue;
        }
        const ballB = playerB.ball;
        if (ballB.state !== BALL_STATES.PLAY || (ballB.flags & BALL_FLAGS.INVISIBLE)) {
          continue;
        }
        const pairKey = this.getPairKey(playerA.id, playerB.id);
        if (this.noCollidePairs.has(pairKey)) {
          if (this.introTimerFrames > 0) {
            continue;
          }
          const dx = ballB.pos.x - ballA.pos.x;
          const dy = ballB.pos.y - ballA.pos.y;
          const dz = ballB.pos.z - ballA.pos.z;
          const minDist = ballA.currRadius + ballB.currRadius + PLAYER_NO_COLLIDE_CLEAR_EPS;
          if ((dx * dx + dy * dy + dz * dz) < minDist * minDist) {
            continue;
          }
          this.noCollidePairs.delete(pairKey);
        }
        resolveBallBallCollision(ballA, ballB);
      }
    }
  }

  saveRollbackState() {
    if (!this.stageRuntime) {
      return null;
    }
    return {
      simTick: this.simTick,
      stageTimerFrames: this.stageTimerFrames,
      stageTimeLimitFrames: this.stageTimeLimitFrames,
      introTimerFrames: this.introTimerFrames,
      introTotalFrames: this.introTotalFrames,
      timeoverTimerFrames: this.timeoverTimerFrames,
      bonusClearPending: this.bonusClearPending,
      hurryUpAnnouncerPlayed: this.hurryUpAnnouncerPlayed,
      timeOverAnnouncerPlayed: this.timeOverAnnouncerPlayed,
      pendingAdvance: this.pendingAdvance,
      world: this.world
        ? {
          xrot: this.world.xrot,
          zrot: this.world.zrot,
          xrotPrev: this.world.xrotPrev,
          zrotPrev: this.world.zrotPrev,
          gravity: structuredClone(this.world.gravity),
        }
        : null,
      players: this.players.map((player) => ({
        id: player.id,
        isSpectator: player.isSpectator,
        pendingSpawn: player.pendingSpawn,
        finished: player.finished,
        goalType: player.goalType,
        goalTimerFrames: player.goalTimerFrames,
        goalSkipTimerFrames: player.goalSkipTimerFrames,
        goalInfo: structuredClone(player.goalInfo),
        respawnTimerFrames: player.respawnTimerFrames,
        ringoutTimerFrames: player.ringoutTimerFrames,
        ringoutSkipTimerFrames: player.ringoutSkipTimerFrames,
        cameraRotY: player.cameraRotY,
        world: {
          xrot: player.world.xrot,
          zrot: player.world.zrot,
          xrotPrev: player.world.xrotPrev,
          zrotPrev: player.world.zrotPrev,
          gravity: structuredClone(player.world.gravity),
        },
        ball: structuredClone(player.ball),
      })),
      noCollidePairs: Array.from(this.noCollidePairs),
      playerCollisionEnabled: this.playerCollisionEnabled,
      stageRuntime: this.stageRuntime.getState(),
    };
  }

  loadRollbackState(state) {
    if (!state || !this.stageRuntime) {
      return;
    }
    this.simTick = state.simTick ?? this.simTick;
    this.stageTimerFrames = state.stageTimerFrames ?? this.stageTimerFrames;
    this.stageTimeLimitFrames = state.stageTimeLimitFrames ?? this.stageTimeLimitFrames;
    this.introTimerFrames = state.introTimerFrames ?? this.introTimerFrames;
    this.introTotalFrames = state.introTotalFrames ?? this.introTotalFrames;
    this.timeoverTimerFrames = state.timeoverTimerFrames ?? this.timeoverTimerFrames;
    this.bonusClearPending = !!state.bonusClearPending;
    this.hurryUpAnnouncerPlayed = !!state.hurryUpAnnouncerPlayed;
    this.timeOverAnnouncerPlayed = !!state.timeOverAnnouncerPlayed;
    this.pendingAdvance = !!state.pendingAdvance;
    if (state.world && this.world) {
      this.world.xrot = state.world.xrot ?? this.world.xrot;
      this.world.zrot = state.world.zrot ?? this.world.zrot;
      this.world.xrotPrev = state.world.xrotPrev ?? this.world.xrotPrev;
      this.world.zrotPrev = state.world.zrotPrev ?? this.world.zrotPrev;
      if (state.world.gravity) {
        this.world.gravity.x = state.world.gravity.x;
        this.world.gravity.y = state.world.gravity.y;
        this.world.gravity.z = state.world.gravity.z;
      }
    }
    if (Array.isArray(state.players)) {
      for (const saved of state.players) {
        const player = this.players.find((p) => p.id === saved.id);
        if (!player) {
          continue;
        }
        player.isSpectator = !!saved.isSpectator;
        player.pendingSpawn = !!saved.pendingSpawn;
        player.finished = !!saved.finished;
        player.goalType = saved.goalType ?? null;
        player.goalTimerFrames = saved.goalTimerFrames ?? 0;
        player.goalSkipTimerFrames = saved.goalSkipTimerFrames ?? 0;
        player.goalInfo = structuredClone(saved.goalInfo);
        player.respawnTimerFrames = saved.respawnTimerFrames ?? 0;
        player.ringoutTimerFrames = saved.ringoutTimerFrames ?? 0;
        player.ringoutSkipTimerFrames = saved.ringoutSkipTimerFrames ?? 0;
        player.cameraRotY = saved.cameraRotY ?? 0;
        if (saved.world) {
          player.world.xrot = saved.world.xrot ?? player.world.xrot;
          player.world.zrot = saved.world.zrot ?? player.world.zrot;
          player.world.xrotPrev = saved.world.xrotPrev ?? player.world.xrotPrev;
          player.world.zrotPrev = saved.world.zrotPrev ?? player.world.zrotPrev;
          if (saved.world.gravity) {
            player.world.gravity.x = saved.world.gravity.x;
            player.world.gravity.y = saved.world.gravity.y;
            player.world.gravity.z = saved.world.gravity.z;
          }
        }
        if (saved.ball) {
          this.applyBallState(player.ball, saved.ball);
          player.ball.playerId = player.id;
          if (player.id === this.localPlayerId) {
            this.ball = player.ball;
          }
        }
      }
    }
    this.noCollidePairs = new Set(state.noCollidePairs ?? []);
    if (state.playerCollisionEnabled !== undefined) {
      this.playerCollisionEnabled = !!state.playerCollisionEnabled;
    }
    if (state.stageRuntime) {
      this.stageRuntime.setState(state.stageRuntime);
    }
  }

  private copyVec3(target, source) {
    if (!target || !source) {
      return;
    }
    target.x = source.x ?? target.x ?? 0;
    target.y = source.y ?? target.y ?? 0;
    target.z = source.z ?? target.z ?? 0;
  }

  private copyQuat(target, source) {
    if (!target || !source) {
      return;
    }
    target.x = source.x ?? target.x ?? 0;
    target.y = source.y ?? target.y ?? 0;
    target.z = source.z ?? target.z ?? 0;
    target.w = source.w ?? target.w ?? 1;
  }

  private copyMat12(target, source) {
    if (!source) {
      return;
    }
    if (target && typeof target.set === 'function') {
      target.set(source as ArrayLike<number>);
      return;
    }
    const next = new Float32Array(12);
    next.set(source as ArrayLike<number>);
    return next;
  }

  private applyBallState(target, source) {
    if (!target || !source) {
      return;
    }
    target.playerId = source.playerId ?? target.playerId ?? 0;
    this.copyVec3(target.pos, source.pos);
    this.copyVec3(target.prevPos, source.prevPos);
    this.copyVec3(target.vel, source.vel);
    target.rotX = source.rotX ?? target.rotX ?? 0;
    target.rotY = source.rotY ?? target.rotY ?? 0;
    target.rotZ = source.rotZ ?? target.rotZ ?? 0;
    target.flags = source.flags ?? target.flags ?? 0;
    target.state = source.state ?? target.state ?? 0;
    this.copyVec3(target.startPos, source.startPos);
    target.startRotY = source.startRotY ?? target.startRotY ?? 0;
    target.goalTimer = source.goalTimer ?? target.goalTimer ?? 0;
    target.currRadius = source.currRadius ?? target.currRadius ?? 0.5;
    target.accel = source.accel ?? target.accel ?? 0;
    target.restitution = source.restitution ?? target.restitution ?? 0;
    target.unk60 = source.unk60 ?? target.unk60 ?? 0;
    target.unk62 = source.unk62 ?? target.unk62 ?? 0;
    target.unk64 = source.unk64 ?? target.unk64 ?? 0;
    target.unk80 = source.unk80 ?? target.unk80 ?? 0;
    target.unk92 = source.unk92 ?? target.unk92 ?? 0;
    target.apeYaw = source.apeYaw ?? target.apeYaw ?? 0;
    this.copyQuat(target.unkA8, source.unkA8);
    this.copyVec3(target.unkB8, source.unkB8);
    target.unkC4 = source.unkC4 ?? target.unkC4 ?? 0;
    target.unkF8 = source.unkF8 ?? target.unkF8 ?? 0;
    this.copyQuat(target.apeQuat, source.apeQuat);
    target.apeFlags = source.apeFlags ?? target.apeFlags ?? 0;
    const nextTransform = this.copyMat12(target.transform, source.transform);
    if (nextTransform) {
      target.transform = nextTransform;
    }
    const nextPrevTransform = this.copyMat12(target.prevTransform, source.prevTransform);
    if (nextPrevTransform) {
      target.prevTransform = nextPrevTransform;
    }
    this.copyVec3(target.unk114, source.unk114);
    this.copyQuat(target.deltaQuat, source.deltaQuat);
    this.copyQuat(target.orientation, source.orientation);
    this.copyQuat(target.prevOrientation, source.prevOrientation);
    target.speed = source.speed ?? target.speed ?? 0;
    target.bananas = source.bananas ?? target.bananas ?? 0;
    if (target.audio && source.audio) {
      target.audio.lastImpactFrame = source.audio.lastImpactFrame ?? target.audio.lastImpactFrame ?? 0;
      target.audio.rollingVol = source.audio.rollingVol ?? target.audio.rollingVol ?? 0;
      target.audio.rollingPitch = source.audio.rollingPitch ?? target.audio.rollingPitch ?? 0;
      target.audio.bumperHit = source.audio.bumperHit ?? target.audio.bumperHit ?? false;
      target.audio.lastColiSpeed = source.audio.lastColiSpeed ?? target.audio.lastColiSpeed ?? 0;
      target.audio.lastColiFlags = source.audio.lastColiFlags ?? target.audio.lastColiFlags ?? 0;
    }
    target.wormholeCooldown = source.wormholeCooldown ?? target.wormholeCooldown ?? 0;
    if (source.wormholeTransform) {
      if (target.wormholeTransform && typeof target.wormholeTransform.set === 'function') {
        target.wormholeTransform.set(source.wormholeTransform as ArrayLike<number>);
      } else {
        const mat = new Float32Array(16);
        mat.set(source.wormholeTransform as ArrayLike<number>);
        target.wormholeTransform = mat;
      }
    } else {
      target.wormholeTransform = null;
    }
    if (target.physBall && source.physBall) {
      const phys = target.physBall;
      const srcPhys = source.physBall;
      phys.flags = srcPhys.flags ?? phys.flags ?? 0;
      this.copyVec3(phys.pos, srcPhys.pos);
      this.copyVec3(phys.prevPos, srcPhys.prevPos);
      this.copyVec3(phys.vel, srcPhys.vel);
      phys.radius = srcPhys.radius ?? phys.radius ?? 0.5;
      phys.gravityAccel = srcPhys.gravityAccel ?? phys.gravityAccel ?? 0;
      phys.restitution = srcPhys.restitution ?? phys.restitution ?? 0;
      phys.hardestColiSpeed = srcPhys.hardestColiSpeed ?? phys.hardestColiSpeed ?? 0;
      if (phys.hardestColiPlane && srcPhys.hardestColiPlane) {
        this.copyVec3(phys.hardestColiPlane.normal, srcPhys.hardestColiPlane.normal);
        this.copyVec3(phys.hardestColiPlane.point, srcPhys.hardestColiPlane.point);
      }
      phys.hardestColiAnimGroupId = srcPhys.hardestColiAnimGroupId ?? phys.hardestColiAnimGroupId ?? 0;
    }
  }

  addPlayer(id: number, { spectator = false } = {}) {
    if (this.players.some((player) => player.id === id)) {
      return;
    }
    const ball = createBallState();
    ball.playerId = id;
    const world = new World();
    const hasActiveStage = !!this.stage && !!this.stageRuntime;
    const pendingSpawn = !spectator && hasActiveStage && this.stageTimerFrames > 0;
    if (hasActiveStage && !pendingSpawn && !spectator) {
      const start = this.stage?.startPositions?.[0];
      const startPos = start?.pos ?? { x: 0, y: 0, z: 0 };
      const startRotY = start?.rot?.y ?? 0;
      initBallForStage(ball, startPos, startRotY);
    }
    this.players.push({
      id,
      ball,
      world,
      cameraRotY: 0,
      isSpectator: spectator,
      pendingSpawn,
      finished: false,
      goalType: null,
      goalTimerFrames: 0,
      goalSkipTimerFrames: 0,
      goalInfo: null,
      respawnTimerFrames: 0,
      ringoutTimerFrames: 0,
      ringoutSkipTimerFrames: 0,
    });
    if (id === this.localPlayerId) {
      this.ball = ball;
    }
    if (!spectator && !pendingSpawn) {
      this.markNoCollideForPlayer(id);
    }
  }

  createPlayer({ spectator = false } = {}) {
    const id = this.nextPlayerId++;
    this.addPlayer(id, { spectator });
    return id;
  }

  removePlayer(id: number) {
    const idx = this.players.findIndex((player) => player.id === id);
    if (idx < 0) {
      return;
    }
    if (this.players[idx].id === this.localPlayerId) {
      return;
    }
    this.players.splice(idx, 1);
    for (const key of this.noCollidePairs) {
      if (key.startsWith(`${id}:`) || key.endsWith(`:${id}`)) {
        this.noCollidePairs.delete(key);
      }
    }
  }

  private ensureCameraPose() {
    if (!this.cameraController) {
      return null;
    }
    if (!this.cameraPose || !this.prevCameraPose) {
      this.cameraPose = {
        eye: { x: 0, y: 0, z: 0 },
        lookAt: { x: 0, y: 0, z: 0 },
        rotX: 0,
        rotY: 0,
        rotZ: 0,
      };
      this.prevCameraPose = {
        eye: { x: 0, y: 0, z: 0 },
        lookAt: { x: 0, y: 0, z: 0 },
        rotX: 0,
        rotY: 0,
        rotZ: 0,
      };
    }
    return { prev: this.prevCameraPose, curr: this.cameraPose };
  }

  private captureCameraPose(target: CameraPose) {
    if (!this.cameraController) {
      return;
    }
    target.eye.x = this.cameraController.eye.x;
    target.eye.y = this.cameraController.eye.y;
    target.eye.z = this.cameraController.eye.z;
    target.lookAt.x = this.cameraController.lookAt.x;
    target.lookAt.y = this.cameraController.lookAt.y;
    target.lookAt.z = this.cameraController.lookAt.z;
    target.rotX = this.cameraController.rotX;
    target.rotY = this.cameraController.rotY;
    target.rotZ = this.cameraController.rotZ;
  }

  private copyCameraPose(src: CameraPose, dst: CameraPose) {
    dst.eye.x = src.eye.x;
    dst.eye.y = src.eye.y;
    dst.eye.z = src.eye.z;
    dst.lookAt.x = src.lookAt.x;
    dst.lookAt.y = src.lookAt.y;
    dst.lookAt.z = src.lookAt.z;
    dst.rotX = src.rotX;
    dst.rotY = src.rotY;
    dst.rotZ = src.rotZ;
  }

  private syncCameraPose() {
    const poses = this.ensureCameraPose();
    if (!poses) {
      return;
    }
    this.captureCameraPose(poses.curr);
    this.copyCameraPose(poses.curr, poses.prev);
  }

  getInterpolationAlpha(): number {
    if (this.paused) {
      return 1;
    }
    if (this.fixedStep <= 0) {
      return 1;
    }
    return Math.min(1, Math.max(0, this.accumulator / this.fixedStep));
  }

  async start(difficulty: string | Smb2CourseConfig | Mb2wsCourseConfig | Smb1CourseConfig) {
    this.statusText = 'Loading course...';
    this.updateHud();

    try {
      if (typeof difficulty === 'string') {
        this.course = new Course(difficulty);
      } else if (isSmb2CourseConfig(difficulty) && this.gameSource === GAME_SOURCES.SMB2) {
        this.course = new Smb2Course(difficulty);
      } else if (isMb2wsCourseConfig(difficulty) && this.gameSource === GAME_SOURCES.MB2WS) {
        this.course = new Mb2wsCourse(difficulty);
      } else {
        this.course = new Course(difficulty.difficulty, difficulty.stageIndex);
      }
    } catch (err) {
      this.statusText = 'Missing course data.';
      console.error(err);
      this.updateHud();
      return;
    }

    this.score = 0;
    this.lives = DEFAULT_LIVES;
    await this.loadStage(this.course.currentStageId);
    this.paused = false;
    this.onReadyToResume?.();
  }

  pause() {
    if (this.paused) {
      return;
    }
    this.paused = true;
    this.onPaused?.();
  }

  resume() {
    if (!this.paused) {
      return;
    }
    this.paused = false;
    void this.audio?.resume();
    this.onResumed?.();
  }

  getCurrentStageId(): number | null {
    return this.course?.currentStageId ?? null;
  }

  getCameraPose(alpha = 1): { eye: Vec3; lookAt: Vec3; rotX: number; rotY: number; rotZ: number } | null {
    if (!this.cameraController) {
      return null;
    }
    const poses = this.ensureCameraPose();
    if (!poses || alpha >= 1) {
      return {
        eye: this.cameraController.eye,
        lookAt: this.cameraController.lookAt,
        rotX: this.cameraController.rotX,
        rotY: this.cameraController.rotY,
        rotZ: this.cameraController.rotZ,
      };
    }
    const { prev, curr } = poses;
    return {
      eye: {
        x: lerp(prev.eye.x, curr.eye.x, alpha),
        y: lerp(prev.eye.y, curr.eye.y, alpha),
        z: lerp(prev.eye.z, curr.eye.z, alpha),
      },
      lookAt: {
        x: lerp(prev.lookAt.x, curr.lookAt.x, alpha),
        y: lerp(prev.lookAt.y, curr.lookAt.y, alpha),
        z: lerp(prev.lookAt.z, curr.lookAt.z, alpha),
      },
      rotX: lerpS16(prev.rotX, curr.rotX, alpha),
      rotY: lerpS16(prev.rotY, curr.rotY, alpha),
      rotZ: lerpS16(prev.rotZ, curr.rotZ, alpha),
    };
  }

  getStageTimerFrames(alpha = 1): number | null {
    return this.getAnimTimeFrames(alpha);
  }

  getAnimTimeFrames(alpha = 1): number | null {
    const timerFrames = this.stageRuntime?.timerFrames ?? null;
    if (timerFrames === null) {
      return null;
    }
    if (alpha >= 1 || this.accumulator <= 0) {
      return timerFrames;
    }
    const prev = Math.max(0, timerFrames - 1);
    return prev + alpha;
  }

  getAnimGroupTransforms(alpha = 1): Float32Array[] | null {
    if (!this.stageRuntime) {
      return null;
    }
    if (alpha >= 1) {
      return this.animGroupTransforms;
    }
    if (!this.interpolatedAnimGroupTransforms || this.interpolatedAnimGroupTransforms.length !== this.stageRuntime.animGroups.length) {
      this.interpolatedAnimGroupTransforms = new Array(this.stageRuntime.animGroups.length);
      for (let i = 0; i < this.stageRuntime.animGroups.length; i += 1) {
        this.interpolatedAnimGroupTransforms[i] = new Float32Array(12);
      }
    }
    for (let i = 0; i < this.stageRuntime.animGroups.length; i += 1) {
      const group = this.stageRuntime.animGroups[i];
      const out = this.interpolatedAnimGroupTransforms[i];
      const prev = group.prevTransform ?? group.transform;
      const curr = group.transform;
      for (let j = 0; j < 12; j += 1) {
        out[j] = prev[j] + (curr[j] - prev[j]) * alpha;
      }
    }
    return this.interpolatedAnimGroupTransforms;
  }

  getBallRenderState(alpha = 1): BallRenderState | null {
    if (!this.ball) {
      return null;
    }
    const useInterpolation = alpha < 1;
    if (!this.renderBallState) {
      this.renderBallState = {
        pos: { x: this.ball.pos.x, y: this.ball.pos.y, z: this.ball.pos.z },
        orientation: {
          x: this.ball.orientation.x,
          y: this.ball.orientation.y,
          z: this.ball.orientation.z,
          w: this.ball.orientation.w,
        },
        radius: this.ball.currRadius,
        visible: (this.ball.flags & BALL_FLAGS.INVISIBLE) === 0,
      };
    }
    const renderState = this.renderBallState;
    if (useInterpolation) {
      renderState.pos.x = lerp(this.ball.prevPos.x, this.ball.pos.x, alpha);
      renderState.pos.y = lerp(this.ball.prevPos.y, this.ball.pos.y, alpha);
      renderState.pos.z = lerp(this.ball.prevPos.z, this.ball.pos.z, alpha);
      nlerpQuat(renderState.orientation, this.ball.prevOrientation, this.ball.orientation, alpha);
    } else {
      renderState.pos.x = this.ball.pos.x;
      renderState.pos.y = this.ball.pos.y;
      renderState.pos.z = this.ball.pos.z;
      renderState.orientation.x = this.ball.orientation.x;
      renderState.orientation.y = this.ball.orientation.y;
      renderState.orientation.z = this.ball.orientation.z;
      renderState.orientation.w = this.ball.orientation.w;
    }
    renderState.radius = this.ball.currRadius;
    renderState.visible = (this.ball.flags & BALL_FLAGS.INVISIBLE) === 0;
    return this.renderBallState;
  }

  getBallRenderStates(alpha = 1): BallRenderState[] | null {
    if (!this.players.length) {
      return null;
    }
    const useInterpolation = alpha < 1;
    if (!this.renderBallStates || this.renderBallStates.length !== this.players.length) {
      this.renderBallStates = new Array(this.players.length);
      for (let i = 0; i < this.players.length; i += 1) {
        const ball = this.players[i].ball;
        this.renderBallStates[i] = {
          pos: { x: ball.pos.x, y: ball.pos.y, z: ball.pos.z },
          orientation: {
            x: ball.orientation.x,
            y: ball.orientation.y,
            z: ball.orientation.z,
            w: ball.orientation.w,
          },
          radius: ball.currRadius,
          visible: (ball.flags & BALL_FLAGS.INVISIBLE) === 0,
        };
      }
    }
    for (let i = 0; i < this.players.length; i += 1) {
      const player = this.players[i];
      const ball = player.ball;
      const renderState = this.renderBallStates[i];
      if (useInterpolation) {
        renderState.pos.x = lerp(ball.prevPos.x, ball.pos.x, alpha);
        renderState.pos.y = lerp(ball.prevPos.y, ball.pos.y, alpha);
        renderState.pos.z = lerp(ball.prevPos.z, ball.pos.z, alpha);
        nlerpQuat(renderState.orientation, ball.prevOrientation, ball.orientation, alpha);
      } else {
        renderState.pos.x = ball.pos.x;
        renderState.pos.y = ball.pos.y;
        renderState.pos.z = ball.pos.z;
        renderState.orientation.x = ball.orientation.x;
        renderState.orientation.y = ball.orientation.y;
        renderState.orientation.z = ball.orientation.z;
        renderState.orientation.w = ball.orientation.w;
      }
      renderState.radius = ball.currRadius;
      renderState.visible = !player.isSpectator
        && !player.pendingSpawn
        && (ball.flags & BALL_FLAGS.INVISIBLE) === 0;
    }
    return this.renderBallStates;
  }

  getGoalBagRenderState(alpha = 1): GoalBagRenderState[] | null {
    if (!this.stageRuntime) {
      return null;
    }
    const bags = this.stageRuntime.goalBags;
    const useInterpolation = alpha < 1;
    if (!this.renderGoalBags || this.renderGoalBags.length !== bags.length) {
      this.renderGoalBags = new Array(bags.length);
      for (let i = 0; i < bags.length; i += 1) {
        const bag = bags[i];
        this.renderGoalBags[i] = {
          animGroupId: bag.animGroupId,
          rotX: bag.rotX,
          rotY: bag.rotY,
          rotZ: bag.rotZ,
          openness: bag.openness,
          uSomePos: { x: bag.uSomePos.x, y: bag.uSomePos.y, z: bag.uSomePos.z },
        };
      }
    }
    for (let i = 0; i < bags.length; i += 1) {
      const bag = bags[i];
      const renderBag = this.renderGoalBags[i];
      renderBag.animGroupId = bag.animGroupId;
      if (useInterpolation) {
        renderBag.rotX = lerpS16(bag.prevRotX ?? bag.rotX, bag.rotX, alpha);
        renderBag.rotY = lerpS16(bag.prevRotY ?? bag.rotY, bag.rotY, alpha);
        renderBag.rotZ = lerpS16(bag.prevRotZ ?? bag.rotZ, bag.rotZ, alpha);
        renderBag.openness = lerp(bag.prevOpenness ?? bag.openness, bag.openness, alpha);
      } else {
        renderBag.rotX = bag.rotX;
        renderBag.rotY = bag.rotY;
        renderBag.rotZ = bag.rotZ;
        renderBag.openness = bag.openness;
      }
      renderBag.uSomePos.x = bag.uSomePos.x;
      renderBag.uSomePos.y = bag.uSomePos.y;
      renderBag.uSomePos.z = bag.uSomePos.z;
    }
    return this.renderGoalBags;
  }

  getGoalTapeRenderState(alpha = 1): GoalTapeRenderState[] | null {
    if (!this.stageRuntime) {
      return null;
    }
    const tapes = this.stageRuntime.goalTapes;
    const useInterpolation = alpha < 1;
    if (!this.renderGoalTapes || this.renderGoalTapes.length !== tapes.length) {
      this.renderGoalTapes = new Array(tapes.length);
      for (let i = 0; i < tapes.length; i += 1) {
        const tape = tapes[i];
        const points = new Array(tape.points.length);
        for (let j = 0; j < tape.points.length; j += 1) {
          const point = tape.points[j];
          points[j] = {
            pos: { x: point.pos.x, y: point.pos.y, z: point.pos.z },
            normal: { x: point.normal.x, y: point.normal.y, z: point.normal.z },
            t: point.t,
            flags: point.flags,
          };
        }
        this.renderGoalTapes[i] = {
          animGroupId: tape.animGroupId,
          pos: { x: tape.goal.pos.x, y: tape.goal.pos.y, z: tape.goal.pos.z },
          rot: { x: tape.goal.rot.x, y: tape.goal.rot.y, z: tape.goal.rot.z },
          points,
          index: i,
        };
      }
    }
    for (let i = 0; i < tapes.length; i += 1) {
      const tape = tapes[i];
      const renderTape = this.renderGoalTapes[i];
      renderTape.animGroupId = tape.animGroupId;
      renderTape.index = i;
      renderTape.pos.x = tape.goal.pos.x;
      renderTape.pos.y = tape.goal.pos.y;
      renderTape.pos.z = tape.goal.pos.z;
      renderTape.rot.x = tape.goal.rot.x;
      renderTape.rot.y = tape.goal.rot.y;
      renderTape.rot.z = tape.goal.rot.z;
      for (let j = 0; j < tape.points.length; j += 1) {
        const point = tape.points[j];
        const renderPoint = renderTape.points[j];
        renderPoint.t = point.t;
        renderPoint.flags = point.flags;
        if (useInterpolation) {
          renderPoint.pos.x = lerp(point.prevPos?.x ?? point.pos.x, point.pos.x, alpha);
          renderPoint.pos.y = lerp(point.prevPos?.y ?? point.pos.y, point.pos.y, alpha);
          renderPoint.pos.z = lerp(point.prevPos?.z ?? point.pos.z, point.pos.z, alpha);
          renderPoint.normal.x = lerp(point.prevNormal?.x ?? point.normal.x, point.normal.x, alpha);
          renderPoint.normal.y = lerp(point.prevNormal?.y ?? point.normal.y, point.normal.y, alpha);
          renderPoint.normal.z = lerp(point.prevNormal?.z ?? point.normal.z, point.normal.z, alpha);
          const normalLen = sqrt(
            (renderPoint.normal.x * renderPoint.normal.x)
            + (renderPoint.normal.y * renderPoint.normal.y)
            + (renderPoint.normal.z * renderPoint.normal.z)
          );
          if (normalLen > 0) {
            renderPoint.normal.x /= normalLen;
            renderPoint.normal.y /= normalLen;
            renderPoint.normal.z /= normalLen;
          }
        } else {
          renderPoint.pos.x = point.pos.x;
          renderPoint.pos.y = point.pos.y;
          renderPoint.pos.z = point.pos.z;
          renderPoint.normal.x = point.normal.x;
          renderPoint.normal.y = point.normal.y;
          renderPoint.normal.z = point.normal.z;
        }
      }
    }
    return this.renderGoalTapes;
  }

  getConfettiRenderState(alpha = 1): ConfettiRenderState[] | null {
    if (!this.stageRuntime) {
      return null;
    }
    const confetti = this.stageRuntime.confetti;
    const useInterpolation = alpha < 1;
    if (!this.renderConfetti) {
      this.renderConfetti = [];
    }
    if (this.renderConfetti.length < confetti.length) {
      for (let i = this.renderConfetti.length; i < confetti.length; i += 1) {
        const frag = confetti[i];
        this.renderConfetti.push({
          modelIndex: frag.modelIndex,
          pos: { x: frag.pos.x, y: frag.pos.y, z: frag.pos.z },
          rotX: frag.rotX,
          rotY: frag.rotY,
          rotZ: frag.rotZ,
          scale: frag.scale,
        });
      }
    }
    this.renderConfetti.length = confetti.length;
    for (let i = 0; i < confetti.length; i += 1) {
      const frag = confetti[i];
      const renderFrag = this.renderConfetti[i];
      renderFrag.modelIndex = frag.modelIndex;
      if (useInterpolation) {
        renderFrag.pos.x = lerp(frag.prevPos?.x ?? frag.pos.x, frag.pos.x, alpha);
        renderFrag.pos.y = lerp(frag.prevPos?.y ?? frag.pos.y, frag.pos.y, alpha);
        renderFrag.pos.z = lerp(frag.prevPos?.z ?? frag.pos.z, frag.pos.z, alpha);
        renderFrag.rotX = lerpS16(frag.prevRotX ?? frag.rotX, frag.rotX, alpha);
        renderFrag.rotY = lerpS16(frag.prevRotY ?? frag.rotY, frag.rotY, alpha);
        renderFrag.rotZ = lerpS16(frag.prevRotZ ?? frag.rotZ, frag.rotZ, alpha);
      } else {
        renderFrag.pos.x = frag.pos.x;
        renderFrag.pos.y = frag.pos.y;
        renderFrag.pos.z = frag.pos.z;
        renderFrag.rotX = frag.rotX;
        renderFrag.rotY = frag.rotY;
        renderFrag.rotZ = frag.rotZ;
      }
      renderFrag.scale = frag.scale;
    }
    return this.renderConfetti;
  }

  getEffectRenderState(alpha = 1): EffectRenderState[] | null {
    if (!this.stageRuntime) {
      return null;
    }
    const effects = this.stageRuntime.effects;
    if (!effects || effects.length === 0) {
      this.renderEffects = null;
      return null;
    }
    let nanCount = 0;
    let nanSample: {
      kind: string;
      pos: { x: number; y: number; z: number };
      prevPos: { x: number; y: number; z: number };
    } | null = null;
    if (!this.renderEffects) {
      this.renderEffects = [];
    }
    let outIdx = 0;
    for (const effect of effects) {
      if (
        !Number.isFinite(effect.pos.x) ||
        !Number.isFinite(effect.pos.y) ||
        !Number.isFinite(effect.pos.z) ||
        !Number.isFinite(effect.prevPos.x) ||
        !Number.isFinite(effect.prevPos.y) ||
        !Number.isFinite(effect.prevPos.z)
      ) {
        nanCount += 1;
        if (!nanSample) {
          nanSample = {
            kind: effect.kind,
            pos: { x: effect.pos.x, y: effect.pos.y, z: effect.pos.z },
            prevPos: { x: effect.prevPos.x, y: effect.prevPos.y, z: effect.prevPos.z },
          };
        }
      }
      const pos = {
        x: effect.prevPos.x + (effect.pos.x - effect.prevPos.x) * alpha,
        y: effect.prevPos.y + (effect.pos.y - effect.prevPos.y) * alpha,
        z: effect.prevPos.z + (effect.pos.z - effect.prevPos.z) * alpha,
      };
      if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) {
        const now = Date.now();
        if (now - this.effectDebugLastLogTime > 1000) {
          console.warn(
            "[effects] bad-pos kind=%s alpha=%s pos=%s prev=%s curr=%s",
            effect.kind,
            alpha,
            `${pos.x},${pos.y},${pos.z}`,
            `${effect.prevPos.x},${effect.prevPos.y},${effect.prevPos.z}`,
            `${effect.pos.x},${effect.pos.y},${effect.pos.z}`,
          );
          this.effectDebugLastLogTime = now;
        }
        continue;
      }
      if (effect.kind === 'coli') {
        this.renderEffects[outIdx++] = {
          kind: 'streak',
          id: effect.id,
          pos,
          prevPos: { x: effect.prevPos.x, y: effect.prevPos.y, z: effect.prevPos.z },
          glowPos: effect.hasGround ? { x: effect.glowPos.x, y: effect.glowPos.y, z: effect.glowPos.z } : undefined,
          glowRotX: effect.hasGround ? effect.glowRotX : undefined,
          glowRotY: effect.hasGround ? effect.glowRotY : undefined,
          glowDist: effect.hasGround ? effect.glowDist : undefined,
          scale: effect.scale,
          alpha: effect.alpha,
          lifeRatio: effect.life / Math.max(1, effect.life + effect.age),
          colorR: effect.colorR,
          colorG: effect.colorG,
          colorB: effect.colorB,
        };
      } else if (effect.kind === 'colistar') {
        const rotX = lerpS16(effect.prevRotX, effect.rotX, alpha);
        const rotY = lerpS16(effect.prevRotY, effect.rotY, alpha);
        const rotZ = lerpS16(effect.prevRotZ, effect.rotZ, alpha);
        this.renderEffects[outIdx++] = {
          kind: 'streak',
          id: effect.id,
          pos,
          prevPos: { x: effect.prevPos.x, y: effect.prevPos.y, z: effect.prevPos.z },
          scale: effect.scale * 0.6,
          alpha: effect.alpha,
          lifeRatio: effect.life / Math.max(1, effect.life + effect.age),
          colorR: effect.colorR,
          colorG: effect.colorG,
          colorB: effect.colorB,
        };
        this.renderEffects[outIdx++] = {
          kind: 'star',
          id: effect.id,
          pos,
          rotX,
          rotY,
          rotZ,
          glowPos: effect.hasGround ? { x: effect.glowPos.x, y: effect.glowPos.y, z: effect.glowPos.z } : undefined,
          glowRotX: effect.hasGround ? effect.glowRotX : undefined,
          glowRotY: effect.hasGround ? effect.glowRotY : undefined,
          glowDist: effect.hasGround ? effect.glowDist : undefined,
          scale: effect.scale,
          alpha: effect.alpha,
          colorR: effect.colorR,
          colorG: effect.colorG,
          colorB: effect.colorB,
        };
      } else if (effect.kind === 'coliflash') {
        this.renderEffects[outIdx++] = {
          kind: 'flash',
          id: effect.id,
          pos,
          rotX: effect.rotX,
          rotY: effect.rotY,
          normal: { x: effect.surfaceNormal.x, y: effect.surfaceNormal.y, z: effect.surfaceNormal.z },
          glowPos: effect.hasGround ? { x: effect.glowPos.x, y: effect.glowPos.y, z: effect.glowPos.z } : undefined,
          glowRotX: effect.hasGround ? effect.glowRotX : undefined,
          glowRotY: effect.hasGround ? effect.glowRotY : undefined,
          glowDist: effect.hasGround ? effect.glowDist : undefined,
          scale: effect.scale,
          alpha: effect.alpha,
        };
      } else if (effect.kind === 'levitate') {
        this.renderEffects[outIdx++] = {
          kind: 'sparkle',
          id: effect.id,
          pos,
          rotX: effect.rotX,
          rotY: effect.rotY,
          rotZ: effect.rotZ,
          scale: effect.scale,
          alpha: effect.alpha,
        };
      }
    }
    this.renderEffects.length = outIdx;
    if (nanCount > 0) {
      const now = Date.now();
      if (now - this.effectDebugLastLogTime > 1000) {
        console.log(
          "[effects] nan=%d/%d sample=%s",
          nanCount,
          effects.length,
          nanSample ? `${nanSample.kind} pos=${nanSample.pos.x},${nanSample.pos.y},${nanSample.pos.z} prev=${nanSample.prevPos.x},${nanSample.prevPos.y},${nanSample.prevPos.z}` : "n/a",
        );
        this.effectDebugLastLogTime = now;
      }
    }
    return this.renderEffects;
  }

  getSwitchRenderState(alpha = 1): SwitchRenderState[] | null {
    if (!this.stageRuntime) {
      return null;
    }
    const switches = this.stageRuntime.switches;
    const useInterpolation = alpha < 1;
    if (!this.renderSwitches || this.renderSwitches.length !== switches.length) {
      this.renderSwitches = new Array(switches.length);
      for (let i = 0; i < switches.length; i += 1) {
        const stageSwitch = switches[i];
        this.renderSwitches[i] = {
          animGroupId: stageSwitch.animGroupIndex ?? 0,
          pos: { x: stageSwitch.pos.x, y: stageSwitch.pos.y, z: stageSwitch.pos.z },
          rotX: stageSwitch.rot.x,
          rotY: stageSwitch.rot.y,
          rotZ: stageSwitch.rot.z,
          type: stageSwitch.type & 7,
        };
      }
      return this.renderSwitches;
    }
    for (let i = 0; i < switches.length; i += 1) {
      const stageSwitch = switches[i];
      const renderSwitch = this.renderSwitches[i];
      renderSwitch.animGroupId = stageSwitch.animGroupIndex ?? 0;
      if (useInterpolation) {
        renderSwitch.pos.x = lerp(stageSwitch.prevPos?.x ?? stageSwitch.pos.x, stageSwitch.pos.x, alpha);
        renderSwitch.pos.y = lerp(stageSwitch.prevPos?.y ?? stageSwitch.pos.y, stageSwitch.pos.y, alpha);
        renderSwitch.pos.z = lerp(stageSwitch.prevPos?.z ?? stageSwitch.pos.z, stageSwitch.pos.z, alpha);
      } else {
        renderSwitch.pos.x = stageSwitch.pos.x;
        renderSwitch.pos.y = stageSwitch.pos.y;
        renderSwitch.pos.z = stageSwitch.pos.z;
      }
      renderSwitch.rotX = stageSwitch.rot.x;
      renderSwitch.rotY = stageSwitch.rot.y;
      renderSwitch.rotZ = stageSwitch.rot.z;
      renderSwitch.type = stageSwitch.type & 7;
    }
    return this.renderSwitches;
  }

  getJamabarRenderState(alpha = 1): JamabarRenderState[] | null {
    if (!this.stageRuntime) {
      return null;
    }
    const jamabarGroups = this.stageRuntime.jamabars;
    const useInterpolation = alpha < 1;
    let totalCount = 0;
    for (let i = 0; i < jamabarGroups.length; i += 1) {
      totalCount += jamabarGroups[i].length;
    }
    if (!this.renderJamabars || this.renderJamabars.length !== totalCount) {
      this.renderJamabars = new Array(totalCount);
      let initIdx = 0;
      for (let i = 0; i < jamabarGroups.length; i += 1) {
        const jamabars = jamabarGroups[i];
        for (let j = 0; j < jamabars.length; j += 1) {
          const jamabar = jamabars[j];
          this.renderJamabars[initIdx] = {
            animGroupId: jamabar.animGroupId ?? i,
            pos: { x: jamabar.pos.x, y: jamabar.pos.y, z: jamabar.pos.z },
            rot: { x: jamabar.rot.x, y: jamabar.rot.y, z: jamabar.rot.z },
            scale: { x: jamabar.scale.x, y: jamabar.scale.y, z: jamabar.scale.z },
          };
          initIdx += 1;
        }
      }
    }
    let idx = 0;
    for (let i = 0; i < jamabarGroups.length; i += 1) {
      const jamabars = jamabarGroups[i];
      for (let j = 0; j < jamabars.length; j += 1) {
        const jamabar = jamabars[j];
        const renderJamabar = this.renderJamabars[idx];
        renderJamabar.animGroupId = jamabar.animGroupId ?? i;
        if (useInterpolation) {
          renderJamabar.pos.x = lerp(jamabar.prevPos.x, jamabar.pos.x, alpha);
          renderJamabar.pos.y = lerp(jamabar.prevPos.y, jamabar.pos.y, alpha);
          renderJamabar.pos.z = lerp(jamabar.prevPos.z, jamabar.pos.z, alpha);
        } else {
          renderJamabar.pos.x = jamabar.pos.x;
          renderJamabar.pos.y = jamabar.pos.y;
          renderJamabar.pos.z = jamabar.pos.z;
        }
        renderJamabar.rot.x = jamabar.rot.x;
        renderJamabar.rot.y = jamabar.rot.y;
        renderJamabar.rot.z = jamabar.rot.z;
        renderJamabar.scale.x = jamabar.scale.x;
        renderJamabar.scale.y = jamabar.scale.y;
        renderJamabar.scale.z = jamabar.scale.z;
        idx += 1;
      }
    }
    this.renderJamabars.length = totalCount;
    return this.renderJamabars;
  }

  getStageTiltRenderState(alpha = 1): StageTiltRenderState | null {
    const localPlayer = this.getLocalPlayer();
    const tiltWorld = localPlayer?.world ?? this.world;
    if (!tiltWorld) {
      return null;
    }
    const useInterpolation = alpha < 1;
    const xrot = useInterpolation
      ? lerpS16(tiltWorld.xrotPrev, tiltWorld.xrot, alpha)
      : tiltWorld.xrot;
    const zrot = useInterpolation
      ? lerpS16(tiltWorld.zrotPrev, tiltWorld.zrot, alpha)
      : tiltWorld.zrot;
    if (!this.renderStageTilt) {
      this.renderStageTilt = {
        xrot,
        zrot,
      };
    } else {
      this.renderStageTilt.xrot = xrot;
      this.renderStageTilt.zrot = zrot;
    }
    return this.renderStageTilt;
  }

  getBananaStateRefsByAnimGroup(): boolean[][] | null {
    if (!this.stageRuntime || !this.stage || !this.bananaGroups || !this.bananaCollectedByAnimGroup) {
      return null;
    }
    for (let i = 0; i < this.bananaGroups.length; i += 1) {
      const group = this.bananaGroups[i];
      const collected = this.bananaCollectedByAnimGroup[i];
      for (let j = 0; j < group.length; j += 1) {
        collected[j] = group[j].collected;
      }
    }
    return this.bananaCollectedByAnimGroup;
  }

  getBananaRenderState(alpha = 1): BananaRenderState[] | null {
    if (!this.stageRuntime) {
      return null;
    }
    const bananas = this.stageRuntime.bananas;
    const useInterpolation = alpha < 1;
    if (!this.renderBananas || this.renderBananas.length !== bananas.length) {
      this.renderBananas = new Array(bananas.length);
      for (let i = 0; i < bananas.length; i += 1) {
        const banana = bananas[i];
        this.renderBananas[i] = {
          animGroupId: banana.animGroupId,
          pos: { x: banana.localPos.x, y: banana.localPos.y, z: banana.localPos.z },
          rotX: banana.rotX,
          rotY: banana.rotY,
          rotZ: banana.rotZ,
          scale: banana.scale,
          tiltFactor: bananaTiltFactor(banana),
          type: banana.type,
          visible: banana.state !== 0,
        };
      }
    }
    for (let i = 0; i < bananas.length; i += 1) {
      const banana = bananas[i];
      const renderBanana = this.renderBananas[i];
      renderBanana.animGroupId = banana.animGroupId;
      renderBanana.type = banana.type;
      renderBanana.visible = banana.state !== 0;
      renderBanana.tiltFactor = bananaTiltFactor(banana);
      if (useInterpolation) {
        renderBanana.pos.x = lerp(banana.prevLocalPos.x, banana.localPos.x, alpha);
        renderBanana.pos.y = lerp(banana.prevLocalPos.y, banana.localPos.y, alpha);
        renderBanana.pos.z = lerp(banana.prevLocalPos.z, banana.localPos.z, alpha);
        renderBanana.rotX = lerpS16(banana.prevRotX ?? banana.rotX, banana.rotX, alpha);
        renderBanana.rotY = lerpS16(banana.prevRotY ?? banana.rotY, banana.rotY, alpha);
        renderBanana.rotZ = lerpS16(banana.prevRotZ ?? banana.rotZ, banana.rotZ, alpha);
        renderBanana.scale = lerp(banana.prevScale ?? banana.scale, banana.scale, alpha);
      } else {
        renderBanana.pos.x = banana.localPos.x;
        renderBanana.pos.y = banana.localPos.y;
        renderBanana.pos.z = banana.localPos.z;
        renderBanana.rotX = banana.rotX;
        renderBanana.rotY = banana.rotY;
        renderBanana.rotZ = banana.rotZ;
        renderBanana.scale = banana.scale;
      }
    }
    return this.renderBananas;
  }

  async loadStage(stageId: number) {
    const loadToken = ++this.loadToken;
    const isRestart = this.stage?.stageId === stageId;
    this.loadingStage = true;
    this.accumulator = 0;
    this.input?.clearPressed();
    this.statusText = `Loading stage ${String(stageId).padStart(3, '0')}...`;
    this.updateHud();

    try {
      const stage = await loadStageDef(stageId, this.stageBasePath, this.gameSource);
      if (loadToken !== this.loadToken) {
        return;
      }

      try {
        const anchorY = await loadGoalTapeAnchorY(this.stageBasePath, this.gameSource);
        if (anchorY !== null) {
          stage.goalTapeAnchorY = anchorY;
        }
      } catch (err) {
        console.warn('Failed to load goal tape model origin.', err);
      }

      this.stage = stage;
      this.stageAttempts = isRestart ? this.stageAttempts + 1 : 1;
      this.stageRuntime = new StageRuntime(stage);
      this.simTick = 0;
      this.inputFeedIndex = 0;
      this.inputStartTick = 0;
      this.animGroupTransforms = this.stageRuntime.animGroups.map((group) => group.transform);
      this.interpolatedAnimGroupTransforms = null;
      this.bananaGroups = new Array(this.stage.animGroupCount);
      this.bananaCollectedByAnimGroup = new Array(this.stage.animGroupCount);
      for (let i = 0; i < this.stage.animGroupCount; i += 1) {
        this.bananaGroups[i] = [];
        this.bananaCollectedByAnimGroup[i] = [];
      }
      for (const banana of this.stageRuntime.bananas) {
        this.bananaGroups[banana.animGroupId].push(banana);
      }
      for (let i = 0; i < this.bananaGroups.length; i += 1) {
        this.bananaCollectedByAnimGroup[i].length = this.bananaGroups[i].length;
      }
      this.stageRuntime.resetTimer();
      this.stageRuntime.updateAnimGroups(0, 0);
      this.stageRuntime.computeBoundSphere();
      try {
        const modelData = await loadStageModelBounds(
          stageId,
          this.stageBasePath,
          this.stage?.format === 'smb2' ? this.stage.stageModelNames : null,
        );
        if (modelData) {
          this.stageRuntime.boundSphere = modelData.boundSphere;
          if (this.stageRuntime.format === 'smb2') {
            this.stageRuntime.applySwitchModelBounds(modelData.switchModelBounds);
          }
        }
      } catch (err) {
        console.warn('Failed to load stage model bounds.', err);
      }
      this.bananasLeft = this.stageRuntime.bananas.length;
      this.stageTimerFrames = 0;
      this.stageTimeLimitFrames = this.course?.getTimeLimitFrames() ?? DEFAULT_STAGE_TIME;
      this.timeoverTimerFrames = 0;
      this.hurryUpAnnouncerPlayed = false;
      this.timeOverAnnouncerPlayed = false;
      for (const player of this.players) {
        player.finished = false;
        player.goalType = null;
        player.goalTimerFrames = 0;
        player.goalSkipTimerFrames = 0;
        player.goalInfo = null;
        player.respawnTimerFrames = 0;
        player.ringoutTimerFrames = 0;
        player.ringoutSkipTimerFrames = 0;
        if (!player.isSpectator) {
          player.pendingSpawn = false;
        }
      }
      this.pendingAdvance = false;
      if (this.autoRecordInputs) {
        this.startInputRecording();
      }

      this.resetBallForStage({ withIntro: true });
      if (this.replayInputStartTick !== null) {
        const startTick = Math.max(0, this.replayInputStartTick);
        this.introTotalFrames = startTick;
        this.introTimerFrames = startTick;
        const localPlayer = this.getLocalPlayer();
        if (localPlayer) {
          this.cameraController?.initForStage(localPlayer.ball, localPlayer.ball.startRotY, this.stageRuntime);
        }
        this.replayAutoFastForward = true;
        this.setFixedTickMode(true, 1);
      }

      void this.audio?.playMusicForStage(stageId, this.gameSource);
      this.statusText = '';
      this.updateHud();
      this.onStageLoaded?.(stageId);
    } catch (err) {
      this.statusText = `Failed to load stage ${stageId}.`;
      console.error(err);
      this.updateHud();
    } finally {
      if (loadToken === this.loadToken) {
        this.loadingStage = false;
        this.input?.clearPressed();
      }
    }
  }

  resetBallForStage({ withIntro = false }: { withIntro?: boolean } = {}) {
    if (!this.stage) {
      return;
    }
    const localPlayer = this.getLocalPlayer();
    if (localPlayer) {
      localPlayer.finished = false;
      localPlayer.goalType = null;
      localPlayer.goalTimerFrames = 0;
      localPlayer.goalSkipTimerFrames = 0;
      localPlayer.goalInfo = null;
      localPlayer.respawnTimerFrames = 0;
      localPlayer.ringoutTimerFrames = 0;
      localPlayer.ringoutSkipTimerFrames = 0;
    }
    this.world?.reset();
    const start = this.stage.startPositions?.[0];
    const startPos = start?.pos ?? { x: 0, y: 0, z: 0 };
    const startRotY = start?.rot?.y ?? 0;
    for (const player of this.players) {
      if (player.isSpectator) {
        continue;
      }
      player.world.reset();
      player.pendingSpawn = false;
      if (player.ball.audio) {
        player.ball.audio.lastImpactFrame = -9999;
        player.ball.audio.rollingVol = 0;
        player.ball.audio.rollingPitch = 0;
        player.ball.audio.bumperHit = false;
      }
      player.finished = false;
      player.goalType = null;
      player.goalTimerFrames = 0;
      player.goalSkipTimerFrames = 0;
      player.goalInfo = null;
      player.respawnTimerFrames = 0;
      player.ringoutTimerFrames = 0;
      player.ringoutSkipTimerFrames = 0;
      if (withIntro) {
        initBallForStage(player.ball, startPos, startRotY);
      } else {
        resetBall(player.ball, startPos, startRotY);
      }
      player.ball.bananas = 0;
    }
    this.noCollidePairs.clear();
    for (const player of this.players) {
      if (player.isSpectator) {
        continue;
      }
      this.markNoCollideForPlayer(player.id);
    }
    if (withIntro) {
      const isFirstAttempt = this.stageAttempts <= 1;
      const introFrames = isFirstAttempt ? 360 : 120;
      const flyInFrames = isFirstAttempt ? 350 : 90;
      this.introTotalFrames = introFrames;
      this.introTimerFrames = introFrames;
      this.bonusClearPending = false;
      this.readyAnnouncerPlayed = false;
      this.goAnnouncerPlayed = false;
      this.goalWooshPlayed = false;
      if (!isFirstAttempt) {
        void this.audio?.playAnnouncerReady();
        this.readyAnnouncerPlayed = true;
      }
      this.cameraController?.initReady(this.stageRuntime, startRotY, startPos, flyInFrames);
    } else {
      this.introTimerFrames = 0;
      this.bonusClearPending = false;
      this.readyAnnouncerPlayed = false;
      this.goAnnouncerPlayed = false;
      this.goalWooshPlayed = false;
      if (localPlayer) {
        this.cameraController?.initForStage(localPlayer.ball, startRotY, this.stageRuntime);
      }
    }
    if (localPlayer) {
      this.syncCameraPose();
    }
    this.timeoverTimerFrames = 0;
    this.hurryUpAnnouncerPlayed = false;
    this.timeOverAnnouncerPlayed = false;
    this.accumulator = 0;
  }

  private respawnPlayerBall(player: PlayerState) {
    if (!this.stage) {
      return;
    }
    const start = this.stage.startPositions?.[0];
    const startPos = start?.pos ?? { x: 0, y: 0, z: 0 };
    const startRotY = start?.rot?.y ?? 0;
    resetBall(player.ball, startPos, startRotY);
    player.finished = false;
    player.goalType = null;
    player.goalTimerFrames = 0;
    player.goalSkipTimerFrames = 0;
    player.goalInfo = null;
    player.ringoutTimerFrames = 0;
    player.ringoutSkipTimerFrames = 0;
    player.respawnTimerFrames = 0;
    this.markNoCollideForPlayer(player.id);
    if (player.id === this.localPlayerId) {
      this.cameraController?.initForStage(player.ball, startRotY, this.stageRuntime);
      this.syncCameraPose();
    }
  }

  beginFalloutSequence(isBonusStage: boolean) {
    const localPlayer = this.getLocalPlayer();
    const localBall = localPlayer?.ball ?? null;
    if (!localBall || !localPlayer || localPlayer.ringoutTimerFrames > 0) {
      return;
    }
    localPlayer.ringoutTimerFrames = RINGOUT_TOTAL_FRAMES;
    localPlayer.ringoutSkipTimerFrames = RINGOUT_SKIP_DELAY_FRAMES;
    this.statusText = RINGOUT_STATUS_TEXT;
    if (!isBonusStage && this.lives > 0) {
      this.lives -= 1;
    }
    void this.audio?.playFallout(this.gameSource);
    if (isBonusStage) {
      void this.audio?.playAnnouncerBonusFinish();
    }
    this.cameraController?.initFalloutReplay(localBall);
    this.updateHud();
  }

  beginTimeoverSequence(isBonusStage: boolean) {
    const localPlayer = this.getLocalPlayer();
    const localBall = localPlayer?.ball ?? null;
    if (!localBall || this.timeoverTimerFrames > 0) {
      return;
    }
    this.timeoverTimerFrames = TIMEOVER_TOTAL_FRAMES;
    this.statusText = TIMEOVER_STATUS_TEXT;
    localBall.state = BALL_STATES.READY;
    localBall.flags |= BALL_FLAGS.TIMEOVER;
    localBall.vel.x = 0;
    localBall.vel.y = 0;
    localBall.vel.z = 0;
    localBall.prevPos.x = localBall.pos.x;
    localBall.prevPos.y = localBall.pos.y;
    localBall.prevPos.z = localBall.pos.z;
    localBall.speed = 0;
    if (!isBonusStage && this.lives > 0) {
      this.lives -= 1;
    }
    if (!this.timeOverAnnouncerPlayed) {
      void this.audio?.playAnnouncerTimeOver();
      this.timeOverAnnouncerPlayed = true;
    }
    this.updateHud();
  }

  beginBonusClearSequence() {
    const localPlayer = this.getLocalPlayer();
    const localBall = localPlayer?.ball ?? null;
    if (!localBall || !localPlayer || localPlayer.goalTimerFrames > 0) {
      return;
    }
    this.bonusClearPending = true;
    localPlayer.goalTimerFrames = BONUS_CLEAR_SEQUENCE_FRAMES;
    localPlayer.goalSkipTimerFrames = GOAL_SKIP_TOTAL_FRAMES;
    localPlayer.goalInfo = null;
    startGoal(localBall);
    void this.audio?.playAnnouncerPerfect();
  }

  updateRingout(isBonusStage: boolean) {
    const localPlayer = this.getLocalPlayer();
    if (this.paused || !localPlayer || localPlayer.ringoutTimerFrames <= 0) {
      return false;
    }
    localPlayer.ringoutTimerFrames -= 1;
    if (localPlayer.ringoutSkipTimerFrames > 0) {
      localPlayer.ringoutSkipTimerFrames -= 1;
    }
    if (isBonusStage && localPlayer.ringoutTimerFrames === RINGOUT_BONUS_CUTOFF_FRAMES) {
      localPlayer.ringoutTimerFrames = RINGOUT_BONUS_REMAINING_FRAMES;
    }
    const canSkip = !isBonusStage
      && localPlayer.ringoutSkipTimerFrames <= 0
      && this.players.length <= 1
      && this.input?.isPrimaryActionDown?.();
    if (canSkip) {
      localPlayer.ringoutTimerFrames = 0;
    }
    if (localPlayer.ringoutTimerFrames > 0) {
      return false;
    }

    localPlayer.ringoutSkipTimerFrames = 0;
    this.statusText = '';
    if (isBonusStage) {
      this.accumulator = 0;
      void this.advanceCourse(this.makeAdvanceInfo(INFO_FLAGS.FALLOUT));
      return true;
    }
    this.accumulator = 0;
    if (this.players.length <= 1 && this.stage) {
      void this.loadStage(this.stage.stageId);
    } else {
      this.respawnPlayerBall(localPlayer);
    }
    return true;
  }

  updateTimeover(isBonusStage: boolean) {
    if (this.paused || this.timeoverTimerFrames <= 0) {
      return false;
    }
    this.timeoverTimerFrames -= 1;
    if (this.timeoverTimerFrames > 0) {
      return false;
    }
    this.statusText = '';
    if (isBonusStage) {
      this.accumulator = 0;
      void this.advanceCourse(this.makeAdvanceInfo(INFO_FLAGS.TIMEOVER));
      return true;
    }
    this.accumulator = 0;
    if (this.players.length <= 1 && this.stage) {
      void this.loadStage(this.stage.stageId);
    } else {
      void this.advanceCourse(this.makeAdvanceInfo(INFO_FLAGS.TIMEOVER));
    }
    return true;
  }

  isBallFalloutForBall(ball: ReturnType<typeof createBallState>): boolean {
    if (!ball || !this.stage || !this.stageRuntime) {
      return false;
    }
    if (ball.pos.y < this.stage.fallOutY) {
      return true;
    }

    const stage = this.stage;
    const animGroups = this.stageRuntime.animGroups;
    const physBall = this.tmpPhysBall;
    physBall.pos.x = ball.pos.x;
    physBall.pos.y = ball.pos.y;
    physBall.pos.z = ball.pos.z;
    physBall.prevPos.x = ball.prevPos.x;
    physBall.prevPos.y = ball.prevPos.y;
    physBall.prevPos.z = ball.prevPos.z;
    physBall.vel.x = ball.vel.x;
    physBall.vel.y = ball.vel.y;
    physBall.vel.z = ball.vel.z;
    physBall.animGroupId = ball.physBall?.animGroupId ?? 0;

    for (let animGroupId = 0; animGroupId < stage.animGroupCount; animGroupId += 1) {
      const stageAg = stage.animGroups[animGroupId];
      const fallOutBoxes = stageAg?.fallOutBoxes;
      if (!fallOutBoxes || fallOutBoxes.length === 0) {
        continue;
      }
      if (animGroupId !== physBall.animGroupId) {
        tfPhysballToAnimGroupSpace(physBall, animGroupId, animGroups);
      }
      for (const box of fallOutBoxes) {
        fallOutStack.fromTranslate(box.pos);
        fallOutStack.rotateZ(box.rot.z);
        fallOutStack.rotateY(box.rot.y);
        fallOutStack.rotateX(box.rot.x);
        fallOutStack.rigidInvTfPoint(physBall.pos, fallOutLocal);
        const scaleX = box.scale.x;
        const scaleY = box.scale.y;
        const scaleZ = box.scale.z;
        if (Math.abs(scaleX) < 1e-7 || Math.abs(scaleY) < 1e-7 || Math.abs(scaleZ) < 1e-7) {
          continue;
        }
        const localX = fallOutLocal.x / scaleX;
        const localY = fallOutLocal.y / scaleY;
        const localZ = fallOutLocal.z / scaleZ;
        if (localX < -0.5 || localX > 0.5) {
          continue;
        }
        if (localY < -0.5 || localY > 0.5) {
          continue;
        }
        if (localZ < -0.5 || localZ > 0.5) {
          continue;
        }
        if (physBall.animGroupId !== 0) {
          tfPhysballToAnimGroupSpace(physBall, 0, animGroups);
        }
        return true;
      }
    }

    if (physBall.animGroupId !== 0) {
      tfPhysballToAnimGroupSpace(physBall, 0, animGroups);
    }
    return false;
  }

  isBonusStageActive(): boolean {
    const bonus = this.course?.isBonusStage?.();
    if (bonus !== undefined) {
      return bonus;
    }
    const stageId = this.course?.currentStageId ?? 0;
    return isBonusStageId(stageId);
  }

  makeAdvanceInfo(flags: number, goalType: string | null = null) {
    let resolvedGoalType = goalType;
    if (this.players.length > 1) {
      const normalized = normalizeGoalType(goalType);
      if (normalized === 'G' || normalized === 'R') {
        resolvedGoalType = 'B';
      }
    }
    return {
      flags,
      goalType: resolvedGoalType,
      timerCurr: this.stageTimerFrames,
      u_currStageId: this.course?.currentStageId ?? 0,
    };
  }

  async advanceCourse(info: { flags: number; goalType: string | null; timerCurr: number; u_currStageId: number }) {
    if (this.pendingAdvance || !this.course || !this.stage) {
      return;
    }
    this.pendingAdvance = true;
    const advanced = this.course.advance(info);
    if (!advanced) {
      this.statusText = 'Course complete.';
      this.updateHud();
      this.pendingAdvance = false;
      return;
    }
    try {
      await this.loadStage(this.course.currentStageId);
    } finally {
      this.pendingAdvance = false;
    }
  }

  collectBananas(): boolean {
    if (!this.stageRuntime || !this.players.length) {
      return false;
    }
    const animGroups = this.stageRuntime.animGroups;
    const physBall = this.tmpPhysBall;
    let collectedAny = false;
    for (const banana of this.stageRuntime.bananas) {
      if (banana.collected) {
        continue;
      }
      if (!(banana.flags & ITEM_FLAG_COLLIDABLE) || banana.cooldown > 0) {
        continue;
      }
      for (const player of this.players) {
        if (player.isSpectator || player.pendingSpawn) {
          continue;
        }
        const ball = player.ball;
        physBall.pos.x = ball.pos.x;
        physBall.pos.y = ball.pos.y;
        physBall.pos.z = ball.pos.z;
        physBall.prevPos.x = ball.prevPos.x;
        physBall.prevPos.y = ball.prevPos.y;
        physBall.prevPos.z = ball.prevPos.z;
        physBall.vel.x = ball.vel.x;
        physBall.vel.y = ball.vel.y;
        physBall.vel.z = ball.vel.z;
        physBall.radius = ball.currRadius;
        physBall.animGroupId = 0;
        if (physBall.animGroupId !== banana.animGroupId) {
          tfPhysballToAnimGroupSpace(physBall, banana.animGroupId, animGroups);
        }
        const radius = bananaRadiusForType(banana.type);
        if (!intersectsMovingSpheres(
          physBall.prevPos,
          physBall.pos,
          banana.prevLocalPos,
          banana.localPos,
          physBall.radius,
          radius,
        )) {
          continue;
        }
        banana.cooldown = 8;
        banana.flags &= ~ITEM_FLAG_COLLIDABLE;
        banana.state = BANANA_STATE_HOLDING;
        banana.collectTimer = 0;
        banana.holdTimer = BANANA_HOLD_FRAMES;
        banana.holdOffset.x = banana.localPos.x - physBall.pos.x;
        banana.holdOffset.y = banana.localPos.y - physBall.pos.y;
        banana.holdOffset.z = banana.localPos.z - physBall.pos.z;
        banana.holdScaleTarget = banana.scale * 0.5;
        banana.holdRotVel = 0;
        banana.flyTimer = 0;
        banana.flyScaleTarget = 0;
        banana.tiltTimer = 30;
        banana.vel.x = 0;
        banana.vel.y = 0;
        banana.vel.z = 0;
        if (this.bananasLeft > 0) {
          this.bananasLeft -= 1;
        }
        ball.bananas += bananaValueForType(banana.type);
        this.score += bananaPointValueForType(banana.type);
        void this.audio?.playBananaCollect(isBananaBunch(banana.type));
        collectedAny = true;
        break;
      }
    }
    return collectedAny;
  }

  handleInput() {
    if (!this.input) {
      return;
    }
    if (this.input.wasPressed('KeyR')) {
      if (this.course) {
        void this.loadStage(this.course.currentStageId);
      }
    }
    if (this.input.wasPressed('KeyN')) {
      this.skipStage();
    }
  }

  skipStage() {
    if (!this.course || !this.stage) {
      return;
    }
    const goalType = this.stage.goals?.[0]?.type ?? 'B';
    const advanced = this.course.advance({
      flags: INFO_FLAGS.GOAL,
      goalType,
      timerCurr: this.stageTimerFrames,
      u_currStageId: this.course.currentStageId,
    });
    if (!advanced) {
      this.statusText = 'Course complete.';
      return;
    }
    void this.loadStage(this.course.currentStageId);
  }

  beginGoalSequence(goalHit: any) {
    const localPlayer = this.getLocalPlayer();
    const localBall = localPlayer?.ball ?? null;
    if (!localPlayer || localPlayer.goalTimerFrames > 0 || !this.stage || !localBall) {
      return;
    }
    localPlayer.goalInfo = goalHit;
    localPlayer.finished = true;
    localPlayer.goalType = goalHit?.goalType ?? null;
    const timeRemaining = Math.max(0, this.stageTimeLimitFrames - this.stageTimerFrames);
    this.score += computeGoalScore(goalHit?.goalType ?? this.stage.goals?.[0]?.type ?? 'B', timeRemaining, this.stageTimeLimitFrames);
    if (this.score > 999999999) {
      this.score = 999999999;
    }
    localPlayer.goalTimerFrames = GOAL_SEQUENCE_FRAMES;
    localPlayer.goalSkipTimerFrames = GOAL_SKIP_TOTAL_FRAMES;
    startGoal(localBall);
    void this.audio?.playGoal(this.gameSource);
    void this.audio?.playAnnouncerGoal(0.5);
    if (this.audio && this.stageTimeLimitFrames > 0) {
      const timeLeft = Math.max(0, this.stageTimeLimitFrames - this.stageTimerFrames);
      const isHigh = timeLeft > (this.stageTimeLimitFrames >> 1);
      void this.audio.playAnnouncerTimeBonus(this.gameSource, isHigh);
    }
    this.breakGoalTapeForBall(localBall, goalHit);
    this.cameraController?.setGoalMain();
  }

  private breakGoalTapeForBall(ball: ReturnType<typeof createBallState>, goalHit: any) {
    if (!this.stageRuntime || this.stageRuntime.goalBags.length === 0 || !goalHit) {
      return;
    }
    const tempBall = this.tmpPhysBall;
    tempBall.pos.x = ball.pos.x;
    tempBall.pos.y = ball.pos.y;
    tempBall.pos.z = ball.pos.z;
    tempBall.prevPos.x = ball.prevPos.x;
    tempBall.prevPos.y = ball.prevPos.y;
    tempBall.prevPos.z = ball.prevPos.z;
    tempBall.vel.x = ball.vel.x;
    tempBall.vel.y = ball.vel.y;
    tempBall.vel.z = ball.vel.z;
    tempBall.animGroupId = 0;
    tfPhysballToAnimGroupSpace(tempBall, goalHit.animGroupId, this.stageRuntime.animGroups);
    this.stageRuntime.breakGoalTape(goalHit.goalId, tempBall);
  }

  async finishGoalSequence() {
    if (!this.course || !this.stage) {
      return;
    }
    const localPlayer = this.getLocalPlayer();
    if (this.bonusClearPending) {
      this.bonusClearPending = false;
      if (this.players.length <= 1) {
        await this.advanceCourse(this.makeAdvanceInfo(INFO_FLAGS.BONUS_CLEAR));
      } else if (localPlayer) {
        localPlayer.finished = true;
      }
      return;
    }
    const goalType = localPlayer?.goalInfo?.goalType ?? this.stage.goals?.[0]?.type ?? 'B';
    if (localPlayer) {
      localPlayer.finished = true;
      localPlayer.goalType = goalType;
    }
    if (this.players.length <= 1) {
      await this.advanceCourse(this.makeAdvanceInfo(INFO_FLAGS.GOAL, goalType));
    }
  }

  updateHud() {
    if (!this.hud) {
      return;
    }
    const stageId = this.stage?.stageId ?? this.course?.currentStageId ?? null;
    if (this.hud.stage) {
      this.hud.stage.textContent = this.course ? this.course.getStageLabel() : 'Stage';
    }
    if (this.hud.level) {
      this.hud.level.textContent = stageId !== null
        ? `Stage ${String(stageId).padStart(3, '0')}`
        : 'Stage';
    }
    if (this.hud.timer) {
      const timeLeft = Math.max(0, this.stageTimeLimitFrames - this.stageTimerFrames);
      this.hud.timer.textContent = formatTimer(timeLeft);
    }
    if (this.hud.score) {
      this.hud.score.textContent = formatScore(this.score);
    }
    if (this.hud.bananas) {
      const localPlayer = this.getLocalPlayer();
      this.hud.bananas.textContent = String(localPlayer?.ball?.bananas ?? 0);
    }
    if (this.hud.lives) {
      this.hud.lives.textContent = String(this.lives);
    }
    if (this.hud.speed || this.hud.speedFill) {
      const localPlayer = this.getLocalPlayer();
      const speedMph = Math.max(0, (localPlayer?.ball?.speed ?? 0) * SPEED_MPH_SCALE);
      if (this.hud.speed) {
        this.hud.speed.textContent = `${speedMph.toFixed(1)} mph`;
      }
      if (this.hud.speedFill) {
        const pct = Math.min(100, (speedMph / SPEED_BAR_MAX_MPH) * 100);
        this.hud.speedFill.style.width = `${pct}%`;
      }
    }
    if (this.hud.status) {
      let status = this.statusText;
      if (this.paused) {
        status = status ? `${status} (Paused)` : 'Paused';
      }
      this.hud.status.textContent = status;
    }
  }

  private readDeterministicStick(inputEnabled: boolean) {
    let frame = null;
    const canConsumeReplay = this.replayInputStartTick === null || this.simTick >= this.replayInputStartTick;
    if (this.inputFeed && canConsumeReplay) {
      frame = this.inputFeed[this.inputFeedIndex] ?? { x: 0, y: 0 };
      this.inputFeedIndex += 1;
    }
    if (frame && frame.buttons !== undefined) {
      this.lastLocalInput = { x: frame.x, y: frame.y, buttons: frame.buttons ?? 0 };
    }

    if (!inputEnabled) {
      return { x: 0, y: 0 };
    }

    if (this.inputRecord && this.autoRecordInputs) {
      if (this.inputRecord.length === 0) {
        this.inputStartTick = this.simTick;
      }
      if (!frame) {
        const raw = this.input?.getStick?.() ?? { x: 0, y: 0 };
        const buttons = this.input?.getButtonsBitmask?.() ?? 0;
        frame = quantizeInput(raw, buttons);
      }
      this.inputRecord.push({ x: frame.x, y: frame.y });
    }

    if (!frame) {
      const raw = this.input?.getStick?.() ?? { x: 0, y: 0 };
      const buttons = this.input?.getButtonsBitmask?.() ?? 0;
      frame = quantizeInput(raw, buttons);
    }

    this.lastLocalInput = { x: frame.x, y: frame.y, buttons: frame.buttons ?? 0 };
    return dequantizeStick(frame);
  }

  sampleLocalInput() {
    if (!this.input) {
      return this.lastLocalInput;
    }
    const raw = this.input.getStick();
    const buttons = this.input.getButtonsBitmask?.() ?? 0;
    const frame = quantizeInput(raw, buttons);
    this.lastLocalInput = { x: frame.x, y: frame.y, buttons: frame.buttons ?? 0 };
    return this.lastLocalInput;
  }

  private readDeterministicStickForPlayer(player: PlayerState, inputEnabled: boolean) {
    if (!inputEnabled) {
      return { x: 0, y: 0 };
    }
    const feed = this.playerInputFeeds.get(player.id);
    if (feed && (this.replayInputStartTick === null || this.simTick >= this.replayInputStartTick)) {
      const idx = this.playerInputFeedIndices.get(player.id) ?? 0;
      const useSticky = feed.length === 1;
      const frame = useSticky ? feed[0] : (feed[idx] ?? { x: 0, y: 0 });
      this.playerInputFeedIndices.set(player.id, useSticky ? 0 : idx + 1);
      return dequantizeStick(frame);
    }
    if (player.id === this.localPlayerId) {
      return this.readDeterministicStick(inputEnabled);
    }
    return { x: 0, y: 0 };
  }

  update(dtSeconds: number) {
    if (!this.running) {
      return;
    }

    if (this.loadingStage) {
      this.accumulator = 0;
      this.updateHud();
      return;
    }

    if (this.paused) {
      this.accumulator = 0;
    } else if (this.fixedTickMode) {
      this.accumulator = this.fixedStep * this.fixedTicksPerUpdate;
    } else {
      this.accumulator = Math.min(this.accumulator + dtSeconds, this.fixedStep * MAX_FRAME_DELTA);
    }

    this.handleInput();

    const localPlayer = this.getLocalPlayer();
    const localBall = localPlayer?.ball ?? null;
    if (this.stageRuntime && this.stage && localBall && this.cameraController && this.world && localPlayer) {
      if (this.pendingAdvance) {
        this.accumulator = 0;
      }
      while (!this.pendingAdvance && this.accumulator >= this.fixedStep) {
        const tickStart = this.simPerf.enabled ? nowMs() : 0;
        try {
        const ringoutActive = localPlayer.ringoutTimerFrames > 0;
        const timeoverActive = this.timeoverTimerFrames > 0;
        const stageInputEnabled = this.introTimerFrames <= 0 && !timeoverActive;
        const localInputEnabled = stageInputEnabled
          && localPlayer.goalTimerFrames <= 0
          && !ringoutActive;
        const switchesEnabled = this.players.length <= 1
          ? (localPlayer.goalTimerFrames <= 0 && !ringoutActive && !timeoverActive)
          : stageInputEnabled;
        const isBonusStage = this.isBonusStageActive();
        this.input?.setGyroTapMode?.(localInputEnabled ? 'recalibrate' : 'action');
        const fastForwardIntro = this.players.length <= 1
          && this.stageAttempts === 1
          && this.introTimerFrames > 120
          && this.input?.isPrimaryActionDown?.();
        const isSmb2 = this.stage?.format === 'smb2';
        const animTimerOverride = !isSmb2 && this.introTimerFrames > 0
          ? Math.max(0, 120 - this.introTimerFrames)
          : null;
        const smb2LoadInFrames = isSmb2 && this.introTimerFrames > 0
          ? this.introTimerFrames
          : null;
        this.stageRuntime.switchesEnabled = switchesEnabled;
        this.stageRuntime.goalHoldOpen = this.players.length <= 1
          ? localPlayer.goalTimerFrames > 0
          : this.players.some((player) => player.goalTimerFrames > 0);
        localPlayer.cameraRotY = this.cameraController.rotY;
        let tiltCount = 0;
        let avgGravX = 0;
        let avgGravY = 0;
        let avgGravZ = 0;
        for (const player of this.players) {
          if (player.isSpectator || player.pendingSpawn) {
            continue;
          }
          const playerInputEnabled = stageInputEnabled
            && player.goalTimerFrames <= 0
            && player.ringoutTimerFrames <= 0;
          const stick = this.readDeterministicStickForPlayer(player, playerInputEnabled);
          tiltCount += 1;
          player.world.updateInput(stick, player.cameraRotY);
          avgGravX += player.world.gravity.x;
          avgGravY += player.world.gravity.y;
          avgGravZ += player.world.gravity.z;
        }
        if (this.world) {
          if (tiltCount > 0) {
            const inv = 1 / tiltCount;
            avgGravX *= inv;
            avgGravY *= inv;
            avgGravZ *= inv;
            const len = sqrt(avgGravX * avgGravX + avgGravY * avgGravY + avgGravZ * avgGravZ);
            if (len > 1e-6) {
              this.world.gravity.x = avgGravX / len;
              this.world.gravity.y = avgGravY / len;
              this.world.gravity.z = avgGravZ / len;
            }
          } else {
            this.world.gravity.x = 0;
            this.world.gravity.y = -1;
            this.world.gravity.z = 0;
          }
        }
        const stagePaused = this.paused || timeoverActive;
        const stageBall = this.players.length <= 1 ? localBall : null;
        const stageCamera = this.players.length <= 1 ? this.cameraController : null;
        this.stageRuntime.advance(
          1,
          stagePaused,
          this.world,
          animTimerOverride,
          smb2LoadInFrames,
          stageBall,
          stageCamera,
        );
        if (localPlayer.goalTimerFrames > 0) {
          localPlayer.goalTimerFrames -= 1;
          localPlayer.goalSkipTimerFrames -= 1;
          if (!this.goalWooshPlayed && localBall.goalTimer >= GOAL_FLOAT_FRAMES) {
            void this.audio?.playSfx('ball_woosh', this.gameSource, 0.85);
            this.goalWooshPlayed = true;
          }
          const canSkipGoal = this.players.length <= 1
            && localPlayer.goalSkipTimerFrames <= 0
            && (localBall.flags & BALL_FLAGS.FLAG_09)
            && this.input?.isPrimaryActionDown?.();
          if (canSkipGoal) {
            localPlayer.goalTimerFrames = 0;
            this.accumulator = 0;
            void this.finishGoalSequence();
            break;
          }
          if (localPlayer.goalTimerFrames === 0) {
            this.accumulator = 0;
            void this.finishGoalSequence();
            break;
          }
        }
        if (this.introTimerFrames > 0) {
          const prevIntroTimerFrames = this.introTimerFrames;
          this.introTimerFrames -= 1;
          if (fastForwardIntro) {
            this.introTimerFrames -= 1;
          }
          if (!this.readyAnnouncerPlayed && prevIntroTimerFrames > 120 && this.introTimerFrames <= 120) {
            void this.audio?.playAnnouncerReady();
            this.readyAnnouncerPlayed = true;
          }
          if (this.introTimerFrames === this.dropFrames) {
            for (const player of this.players) {
              if (player.isSpectator || player.pendingSpawn) {
                continue;
              }
              startBallDrop(player.ball, this.dropFrames);
            }
          }
          if (this.introTimerFrames === 0) {
            this.cameraController.initForStage(localBall, localBall.startRotY, this.stageRuntime);
            if (!this.goAnnouncerPlayed) {
              void this.audio?.playAnnouncerGo();
              this.goAnnouncerPlayed = true;
            }
          }
        }
        if (!timeoverActive) {
          for (const player of this.players) {
            if (player.isSpectator || player.pendingSpawn) {
              continue;
            }
            const ball = player.ball;
            if (ball.state !== BALL_STATES.PLAY && ball.state !== BALL_STATES.GOAL_MAIN) {
              continue;
            }
            stepBall(ball, this.stageRuntime, player.world);
            if (player.id === this.localPlayerId) {
              if (ball.wormholeTransform) {
                this.cameraController.applyWormholeTransform(ball.wormholeTransform);
                ball.wormholeTransform = null;
              }
              if (!ringoutActive && localPlayer.goalTimerFrames <= 0 && this.isBallFalloutForBall(ball)) {
                this.beginFalloutSequence(isBonusStage);
              }
            } else if (player.ringoutTimerFrames <= 0 && this.isBallFalloutForBall(ball)) {
              player.ringoutTimerFrames = RINGOUT_TOTAL_FRAMES;
              player.ringoutSkipTimerFrames = 0;
            }
          }
          this.resolvePlayerCollisions();
          const switchPresses = this.stageRuntime.switchPressCount ?? 0;
          if (switchPresses > 0) {
            this.stageRuntime.switchPressCount = 0;
            for (let i = 0; i < switchPresses; i += 1) {
              void this.audio?.playSfx('switch_press', this.gameSource, 0.6);
            }
          }
        }
        if (this.audio && localBall) {
          const frameCount = this.stageRuntime?.timerFrames ?? 0;
          void this.audio.updateRollingSound(localBall, this.gameSource, frameCount);
          void this.audio.playImpactForBall(localBall, this.gameSource, frameCount);
          void this.audio.consumeBallEvents(localBall, this.gameSource);
        }
        const timerShouldRun = this.players.length <= 1
          ? (localInputEnabled && !this.paused && localPlayer.ringoutTimerFrames <= 0 && !timeoverActive)
          : (!this.paused && stageInputEnabled);
        if (timerShouldRun) {
          this.stageTimerFrames += 1;
          if (this.stageTimeLimitFrames > 0) {
            const timeLeft = this.stageTimeLimitFrames - this.stageTimerFrames;
            if (timeLeft === HURRY_UP_FRAMES && !this.hurryUpAnnouncerPlayed) {
              void this.audio?.playAnnouncerHurryUp();
              this.hurryUpAnnouncerPlayed = true;
            }
            if (timeLeft <= COUNTDOWN_START_FRAMES && timeLeft >= 60 && timeLeft % 60 === 0) {
              const count = Math.trunc(timeLeft / 60) - 1;
              void this.audio?.playAnnouncerCount(count);
            }
            if (timeLeft <= 0 && this.timeoverTimerFrames <= 0) {
              this.accumulator = 0;
              if (this.players.length <= 1) {
                this.beginTimeoverSequence(isBonusStage);
              } else {
                void this.advanceCourse(this.makeAdvanceInfo(INFO_FLAGS.TIMEOVER));
              }
              break;
            }
          }
        }
        let hasPlayableBall = false;
        for (const player of this.players) {
          if (player.isSpectator || player.pendingSpawn) {
            continue;
          }
          if (player.ball.state === BALL_STATES.PLAY || player.ball.state === BALL_STATES.GOAL_MAIN) {
            hasPlayableBall = true;
            break;
          }
        }
        const canCollectBananas = !ringoutActive && !timeoverActive && hasPlayableBall;
        if (canCollectBananas) {
          const collected = this.collectBananas();
          if (
            collected
            && isBonusStage
            && this.bananasLeft <= 0
            && stageInputEnabled
            && localBall.state === BALL_STATES.PLAY
          ) {
            this.accumulator = 0;
            this.beginBonusClearSequence();
            break;
          }
        }
        if (stageInputEnabled) {
          for (const player of this.players) {
            if (player.isSpectator || player.pendingSpawn) {
              continue;
            }
            const ball = player.ball;
            if (ball.state !== BALL_STATES.PLAY) {
              continue;
            }
            const goalHit = checkBallEnteredGoal(ball, this.stageRuntime);
            if (!goalHit) {
              continue;
            }
            player.finished = true;
            player.goalType = goalHit?.goalType ?? null;
            if (player.id === this.localPlayerId) {
              this.beginGoalSequence(goalHit);
            } else {
              startGoal(ball);
              this.breakGoalTapeForBall(ball, goalHit);
            }
          }
        }
        if (ringoutActive) {
          if (this.updateRingout(isBonusStage)) {
            break;
          }
        }
        if (timeoverActive) {
          if (this.updateTimeover(isBonusStage)) {
            break;
          }
        }
        for (const player of this.players) {
          if (player.id === this.localPlayerId || player.isSpectator || player.pendingSpawn) {
            continue;
          }
          if (player.ringoutTimerFrames > 0) {
            player.ringoutTimerFrames -= 1;
            if (player.ringoutTimerFrames <= 0) {
              this.respawnPlayerBall(player);
            }
          }
        }
        if (this.players.length > 1 && this.allActivePlayersFinished()) {
          if (localPlayer.goalTimerFrames <= 0) {
            this.accumulator = 0;
            void this.advanceCourse(this.makeAdvanceInfo(INFO_FLAGS.GOAL, this.getAdvanceGoalType()));
            break;
          }
        }
        const cameraPoses = this.ensureCameraPose();
        if (cameraPoses) {
          this.copyCameraPose(cameraPoses.curr, cameraPoses.prev);
        }
        const cameraPaused = this.paused || timeoverActive;
        this.cameraController.update(localBall, this.stageRuntime, cameraPaused, fastForwardIntro);
        if (cameraPoses) {
          this.captureCameraPose(cameraPoses.curr);
        }
        this.accumulator -= this.fixedStep;
        } finally {
          if (this.simPerf.enabled) {
            const tickMs = nowMs() - tickStart;
            this.simPerf.lastTickMs = tickMs;
            this.simPerf.tickMs += tickMs;
            this.simPerf.tickCount += 1;
          }
          this.simTick += 1;
          if (this.replayAutoFastForward && this.replayInputStartTick !== null) {
            if (this.simTick >= this.replayInputStartTick) {
              this.replayAutoFastForward = false;
              this.setFixedTickMode(false, 1);
            }
          }
        }
      }
      if (this.simPerf.enabled && this.simPerf.tickCount >= this.simPerf.logEvery) {
        const avgMs = this.simPerf.tickMs / Math.max(1, this.simPerf.tickCount);
        console.log(
          "[perf] sim-tick avg=%sms last=%sms over=%d",
          avgMs.toFixed(3),
          this.simPerf.lastTickMs.toFixed(3),
          this.simPerf.tickCount,
        );
        this.simPerf.tickCount = 0;
        this.simPerf.tickMs = 0;
      }
    }

    this.updateHud();
  }
}
