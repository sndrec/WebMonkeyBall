import type { QuantizedInput } from './determinism.js';
import type { GameSource } from './constants.js';

export type PlayerId = number;

export type RoomSettings = {
  maxPlayers: number;
  collisionEnabled: boolean;
};

export type RoomInfo = {
  roomId: string;
  roomCode?: string;
  isPublic: boolean;
  hostId: PlayerId;
  courseId: string;
  settings: RoomSettings;
};

export type InputFrameMessage = {
  type: 'input';
  frame: number;
  playerId: PlayerId;
  input: QuantizedInput;
  lastAck?: number;
};

export type InputAckMessage = {
  type: 'ack';
  playerId: PlayerId;
  frame: number;
};

export type PingMessage = {
  type: 'ping';
  id: number;
};

export type PongMessage = {
  type: 'pong';
  id: number;
};

export type StageReadyMessage = {
  type: 'stage_ready';
  stageId: number;
};

export type StageSyncMessage = {
  type: 'stage_sync';
  stageId: number;
  frame: number;
};

export type FrameBundleMessage = {
  type: 'frame';
  frame: number;
  inputs: Record<number, QuantizedInput>;
  lastAck?: number;
  hashFrame?: number;
  hash?: number;
};

export type SnapshotMessage = {
  type: 'snapshot';
  frame: number;
  state: any;
  stageId?: number;
  gameSource?: GameSource;
};

export type SnapshotRequestMessage = {
  type: 'snapshot_request';
  frame: number;
  reason: 'mismatch' | 'lag';
};

export type PlayerJoinMessage = {
  type: 'player_join';
  playerId: PlayerId;
  spectator: boolean;
  pendingSpawn?: boolean;
};

export type PlayerLeaveMessage = {
  type: 'player_leave';
  playerId: PlayerId;
};

export type RoomUpdateMessage = {
  type: 'room_update';
  room: RoomInfo;
};

export type StartMatchMessage = {
  type: 'start';
  gameSource: GameSource;
  course: any;
  stageBasePath?: string;
};

export type HostToClientMessage =
  | InputFrameMessage
  | InputAckMessage
  | PongMessage
  | StageSyncMessage
  | FrameBundleMessage
  | SnapshotMessage
  | StartMatchMessage
  | PlayerJoinMessage
  | PlayerLeaveMessage
  | RoomUpdateMessage;

export type ClientToHostMessage =
  | InputFrameMessage
  | InputAckMessage
  | PingMessage
  | StageReadyMessage
  | SnapshotRequestMessage
  | PlayerJoinMessage
  | PlayerLeaveMessage;
