import type { GameplayCamera } from '../camera.js';
import type { createBallState } from '../physics.js';
import type { World } from '../world.js';
import type { Quat, Vec3 } from '../shared/types.js';
import type { QuantizedInput } from '../determinism.js';

export type MultiplayerGameMode = 'standard' | 'chained_together';

export type PlayerState = {
  id: number;
  ball: ReturnType<typeof createBallState>;
  world: World;
  camera: GameplayCamera;
  cameraRotY: number;
  isSpectator: boolean;
  pendingSpawn: boolean;
  finished: boolean;
  freeFly: boolean;
  goalType: string | null;
  goalTimerFrames: number;
  goalSkipTimerFrames: number;
  goalInfo: any;
  spectateTimerFrames: number;
  respawnTimerFrames: number;
  ringoutTimerFrames: number;
  ringoutSkipTimerFrames: number;
};

export type ResultReplayHistoryFrame = {
  state: any;
  input: QuantizedInput;
  cameraRotY: number;
};

export type ActiveResultReplay = {
  kind: 'goal' | 'fallout';
  totalFrames: number;
  stateFrames: any[];
  inputFrames: QuantizedInput[];
  cameraRotYFrames: number[];
  ballPath: Vec3[];
  replayStartBallPos: Vec3 | null;
  replayEventBallPos: Vec3 | null;
  goalId: number;
  goalAnimGroupId: number;
  goalLocalPos: Vec3 | null;
  goalRot: { x: number; y: number; z: number } | null;
  goalWorldPos: Vec3 | null;
  goalEntryVel: Vec3 | null;
  falloutSecondaryCutDone: boolean;
  playbackIndex: number;
  elapsedFrames: number;
  resumeState: any;
  resumeStatusText: string;
  replayStatusText: string;
  goalHit: any;
  deferredGoalTapeBreak: boolean;
};

export type BallRenderState = {
  pos: Vec3;
  orientation: { x: number; y: number; z: number; w: number };
  radius: number;
  visible: boolean;
};

export type CameraPose = { eye: Vec3; lookAt: Vec3; rotX: number; rotY: number; rotZ: number };
