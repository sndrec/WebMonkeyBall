export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };
export type InputFrame = { x: number; y: number; buttons: number };

export type BallState = ReturnType<typeof import('../physics.js').createBallState>;
export type PlayerState = import('../game.js').PlayerState;
export type GameState = ReturnType<import('../game.js').Game['saveRollbackState']>;
export type StageRuntime = import('../stage.js').StageRuntime;
