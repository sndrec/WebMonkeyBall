import type { QuantizedInput } from './determinism.js';
import type { GameSource } from './constants.js';

export type PlayerId = number;

export type RoomSettings = {
  maxPlayers: number;
  collisionEnabled: boolean;
  locked: boolean;
};

export type RoomMeta = {
  status: 'lobby' | 'in_game';
  gameSource?: GameSource;
  courseLabel?: string;
  stageLabel?: string;
  stageId?: number;
  roomName?: string;
};

export type RoomInfo = {
  roomId: string;
  roomCode?: string;
  isPublic: boolean;
  hostId: PlayerId;
  courseId: string;
  settings: RoomSettings;
  playerCount?: number;
  meta?: RoomMeta;
};

export type InputFrameMessage = {
  type: 'input';
  stageSeq: number;
  frame: number;
  playerId: PlayerId;
  input: QuantizedInput;
  lastAck?: number;
};

export type InputAckMessage = {
  type: 'ack';
  stageSeq: number;
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
  stageSeq: number;
  stageId: number;
};

export type StageSyncMessage = {
  type: 'stage_sync';
  stageSeq: number;
  stageId: number;
  frame: number;
};

export type FrameBundleMessage = {
  type: 'frame';
  stageSeq: number;
  frame: number;
  inputs: Record<number, QuantizedInput>;
  lastAck?: number;
  hashFrame?: number;
  hash?: number;
};

export type SnapshotMessage = {
  type: 'snapshot';
  stageSeq: number;
  frame: number;
  state: any;
  stageId?: number;
  gameSource?: GameSource;
};

export type SnapshotRequestMessage = {
  type: 'snapshot_request';
  stageSeq: number;
  frame: number;
  reason: 'mismatch' | 'lag';
};

export type PlayerJoinMessage = {
  type: 'player_join';
  playerId: PlayerId;
  stageSeq?: number;
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

export type PlayerProfile = {
  name: string;
  avatarData?: string;
};

export type PlayerProfileMessage = {
  type: 'player_profile';
  playerId: PlayerId;
  profile: PlayerProfile;
};

export type ChatMessage = {
  type: 'chat';
  playerId: PlayerId;
  text: string;
};

export type KickMessage = {
  type: 'kick';
  reason?: string;
};

export type MatchEndMessage = {
  type: 'match_end';
  reason?: string;
};

export type StartMatchMessage = {
  type: 'start';
  stageSeq: number;
  gameSource: GameSource;
  course: any;
  stageBasePath?: string;
  lateJoin?: boolean;
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
  | RoomUpdateMessage
  | PlayerProfileMessage
  | ChatMessage
  | KickMessage
  | MatchEndMessage;

export type ClientToHostMessage =
  | InputFrameMessage
  | InputAckMessage
  | PingMessage
  | StageReadyMessage
  | SnapshotRequestMessage
  | PlayerJoinMessage
  | PlayerLeaveMessage
  | PlayerProfileMessage
  | ChatMessage;
