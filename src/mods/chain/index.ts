import type { ModHooks, ModManifest } from '../mod_types.js';
import { ModRegistry } from '../mod_registry.js';
import { mat3, mat4, vec3 } from 'gl-matrix';
import {
  BALL_FLAGS,
  BALL_STATES,
  INFO_FLAGS,
} from '../../shared/constants/index.js';
import type { Vec3 } from '../../shared/types.js';
import {
  collideBallWithBonusWave,
  collideBallWithStage,
  STAGE_COLLISION_TRI_PHASE_EDGE,
  precomputeStageCollisionCellTris,
  STAGE_COLLISION_TRI_PHASE_FACE,
} from '../../collision.js';
import { cosS16, sinS16, sqrt } from '../../math.js';
import { processBallWormholeTeleport, startGoal } from '../../physics.js';

const CHAIN_MOD_MANIFEST: ModManifest = {
  id: 'chain',
  name: 'Chained Together',
  version: '0.0.0',
};

const CHAIN_MAX_PLAYERS = 4;
const CHAIN_LINK_LENGTH = 2.0;
const CHAIN_SEGMENTS = 10;
const CHAIN_SPAWN_SPACING = 1.5;
const CHAIN_NODE_RADIUS = 0.25;
const CHAIN_NODE_DAMPING = 0.992;
const CHAIN_NODE_GRAVITY = 0.0035;
const CHAIN_SUBSTEPS = 2;
const CHAIN_CONSTRAINT_ITERS = 2;
const CHAIN_LEASH_CORRECTION = 0.0;
const CHAIN_LEASH_MAX_STEP = 0.15;
const CHAIN_LEASH_VEL_BLEND = 0.2;
const CHAIN_ENDPOINT_SNAP = 0.9;
const CHAIN_ENDPOINT_TRANSFER = 0.6;
const CHAIN_ENDPOINT_TRANSFER_MAX_STEP = 0.1;
const CHAIN_ENDPOINT_SEGMENT_TRANSFER = 0.9;
const CHAIN_ENDPOINT_SEGMENT_MAX_STEP = 0.12;
const CHAIN_ENDPOINT_POS_BLEND = 0.5;
const CHAIN_ENDPOINT_PREV_BLEND = 0.9;
const CHAIN_ENDPOINT_VEL_BLEND = 0.1;
const CHAIN_RIBBON_WIDTH = 0.1;
const CHAIN_RIBBON_TEXTURE = 'src/mods/chain/chain.png';
const CHAIN_PORTAL_SEAM_MAX_CORRECTION = 0.2;

const GOAL_SEQUENCE_FRAMES = 330;
const GOAL_SKIP_TOTAL_FRAMES = 210;
const GOAL_SPECTATE_DESTROY_FRAMES = 180;

type ChainNodeState = {
  pos: Vec3;
  prevPos: Vec3;
  renderPrevPos?: Vec3;
  animGroupId: number;
  stageCellTrisByAnimGroup?: Array<readonly number[] | null>;
};

type ChainLinkState = {
  id: number;
  playerAId: number;
  playerBId: number;
  nodes: ChainNodeState[];
  portalSeamIndex: number;
  portalFollowerId: number | null;
};

type ChainPortalPlayerState = {
  lift: Float32Array;
  invLift: Float32Array;
  windingByPair: Record<string, number>;
  signature: string;
};

type ChainPortalConstraint = {
  seamIndex: number;
  bToA: Float32Array;
  aToB: Float32Array;
  bToALinear: Float32Array;
  aToBLinear: Float32Array;
};

type WormholeTeleportEvent = {
  playerId: number;
  srcWormholeId: number;
  dstWormholeId: number;
  transform: Float32Array;
};

type SavedChainPortalState = {
  playerId: number;
  lift: number[];
  winding: Array<{ pairKey: string; count: number }>;
};

type ChainBallTransferState = {
  x: number;
  y: number;
  z: number;
  endpoints: ChainNodeState[];
};

type ChainState = {
  links: ChainLinkState[];
  topologyKey: string;
  portalByPlayer: Map<number, ChainPortalPlayerState>;
  faceOnlyCollisionOptions: {
    trianglePhaseMask: number;
    includePrimitives: boolean;
    precomputedCellTrisByAnimGroup: Array<readonly number[] | null> | null;
  };
  fullCollisionOptions: {
    trianglePhaseMask: number;
    includePrimitives: boolean;
    precomputedCellTrisByAnimGroup: Array<readonly number[] | null> | null;
  };
  tmpPhysBall: {
    flags: number;
    pos: Vec3;
    prevPos: Vec3;
    vel: Vec3;
    radius: number;
    gravityAccel: number;
    restitution: number;
    hardestColiSpeed: number;
    hardestColiPlane: { point: Vec3; normal: Vec3 };
    hardestColiAnimGroupId: number;
    friction: number;
    frictionMode: 'smb1' | 'smb2';
    animGroupId: number;
  };
};

const chainStateByGame = new WeakMap<object, ChainState>();
const portalConstraintMatA = mat4.create();
const portalConstraintMatB = mat4.create();
const portalConstraintMat3 = mat3.create();
const portalConstraintMat3B = mat3.create();
const portalConstraintVecA = vec3.create();
const portalConstraintVecB = vec3.create();
const portalTransformScratch = mat4.create();

function getChainState(game: object): ChainState {
  let state = chainStateByGame.get(game);
  if (!state) {
    state = {
      links: [],
      topologyKey: '',
      portalByPlayer: new Map<number, ChainPortalPlayerState>(),
      faceOnlyCollisionOptions: {
        trianglePhaseMask: STAGE_COLLISION_TRI_PHASE_FACE,
        includePrimitives: true,
        precomputedCellTrisByAnimGroup: null,
      },
      fullCollisionOptions: {
        trianglePhaseMask: STAGE_COLLISION_TRI_PHASE_FACE | STAGE_COLLISION_TRI_PHASE_EDGE,
        includePrimitives: true,
        precomputedCellTrisByAnimGroup: null,
      },
      tmpPhysBall: {
        flags: 0,
        pos: { x: 0, y: 0, z: 0 },
        prevPos: { x: 0, y: 0, z: 0 },
        vel: { x: 0, y: 0, z: 0 },
        radius: CHAIN_NODE_RADIUS,
        gravityAccel: 0,
        restitution: 0,
        hardestColiSpeed: 0,
        hardestColiPlane: { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 } },
        hardestColiAnimGroupId: 0,
        friction: 0,
        frictionMode: 'smb1',
        animGroupId: 0,
      },
    };
    chainStateByGame.set(game, state);
  }
  return state;
}

function isChainedTogetherMode(game: any): boolean {
  if (!game) {
    return false;
  }
  if (game.multiplayerGameMode !== 'chained_together') {
    return false;
  }
  return !!game.session?.isMultiplayer?.(game);
}

function hasBallDropStarted(game: any): boolean {
  const introTimerFrames = Number.isFinite(game?.introTimerFrames) ? game.introTimerFrames : 0;
  const dropFrames = Number.isFinite(game?.dropFrames) ? game.dropFrames : 0;
  return introTimerFrames <= dropFrames;
}

function cloneVec3(source: Vec3): Vec3 {
  return {
    x: Number.isFinite(source?.x) ? source.x : 0,
    y: Number.isFinite(source?.y) ? source.y : 0,
    z: Number.isFinite(source?.z) ? source.z : 0,
  };
}

function cloneChainLinks(source: ChainLinkState[]): ChainLinkState[] {
  return source.map((link) => ({
    id: link.id,
    playerAId: link.playerAId,
    playerBId: link.playerBId,
    portalSeamIndex: Number.isFinite(link.portalSeamIndex) ? (link.portalSeamIndex | 0) : -1,
    portalFollowerId: toNonNegativeInt(link.portalFollowerId),
    nodes: link.nodes.map((node) => ({
      pos: cloneVec3(node.pos),
      prevPos: cloneVec3(node.prevPos),
      animGroupId: node.animGroupId ?? 0,
    })),
  }));
}

function createChainPortalPlayerState(): ChainPortalPlayerState {
  return {
    lift: mat4.create(),
    invLift: mat4.create(),
    windingByPair: {},
    signature: '',
  };
}

function copyMatrix16(source: ArrayLike<number> | null | undefined, out: Float32Array): boolean {
  if (!source || !Number.isFinite((source as any).length) || (source as any).length < 16) {
    return false;
  }
  for (let i = 0; i < 16; i += 1) {
    const value = Number(source[i]);
    out[i] = Number.isFinite(value) ? value : 0;
  }
  return true;
}

function rebuildPortalSignature(windingByPair: Record<string, number>): string {
  const keys = Object.keys(windingByPair).sort();
  if (keys.length === 0) {
    return '';
  }
  return keys.map((key) => `${key}:${windingByPair[key]}`).join('|');
}

function getPortalPlayerState(state: ChainState, playerId: number): ChainPortalPlayerState {
  let portalState = state.portalByPlayer.get(playerId);
  if (!portalState) {
    portalState = createChainPortalPlayerState();
    state.portalByPlayer.set(playerId, portalState);
  }
  return portalState;
}

function syncPortalPlayers(state: ChainState, players: any[]) {
  const activeIds = new Set<number>();
  for (const player of players) {
    const playerId = toNonNegativeInt(player?.id);
    if (playerId === null) {
      continue;
    }
    activeIds.add(playerId);
    getPortalPlayerState(state, playerId);
  }
  for (const playerId of state.portalByPlayer.keys()) {
    if (!activeIds.has(playerId)) {
      state.portalByPlayer.delete(playerId);
    }
  }
}

function getPairKey(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function toNonNegativeInt(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return null;
  }
  const out = Math.trunc(num);
  if (out < 0) {
    return null;
  }
  return out;
}

function getWormholePairKey(srcWormholeId: number, dstWormholeId: number) {
  const src = toNonNegativeInt(srcWormholeId) ?? 0;
  const dst = toNonNegativeInt(dstWormholeId) ?? 0;
  return getPairKey(src, dst);
}

function getWormholeDirection(srcWormholeId: number, dstWormholeId: number) {
  const src = toNonNegativeInt(srcWormholeId) ?? 0;
  const dst = toNonNegativeInt(dstWormholeId) ?? 0;
  if (src === dst) {
    return 0;
  }
  return src < dst ? 1 : -1;
}

function getPlayersSorted(players: any[]) {
  return [...players].sort((a, b) => a.id - b.id);
}

function getChainActivePlayersSorted(players: any[]) {
  return players
    .filter((player) => !player.isSpectator && !player.pendingSpawn && !player.finished)
    .slice(0, CHAIN_MAX_PLAYERS);
}

function getChainTopologyKey(players: any[]) {
  if (players.length === 0) {
    return '';
  }
  return players.map((player) => String(player.id)).join(':');
}

function applyWormholeTeleports(state: ChainState, players: any[], wormholeTeleports: WormholeTeleportEvent[]) {
  syncPortalPlayers(state, players);
  if (!Array.isArray(wormholeTeleports) || wormholeTeleports.length === 0) {
    return;
  }
  for (const teleport of wormholeTeleports) {
    const playerId = toNonNegativeInt(teleport?.playerId);
    if (playerId === null) {
      continue;
    }
    const portalState = getPortalPlayerState(state, playerId);
    const pairKey = getWormholePairKey(teleport.srcWormholeId, teleport.dstWormholeId);
    const direction = getWormholeDirection(teleport.srcWormholeId, teleport.dstWormholeId);
    if (direction !== 0) {
      const nextCount = (portalState.windingByPair[pairKey] ?? 0) + direction;
      if (nextCount === 0) {
        delete portalState.windingByPair[pairKey];
      } else {
        portalState.windingByPair[pairKey] = nextCount;
      }
      portalState.signature = rebuildPortalSignature(portalState.windingByPair);
    }
    if (!copyMatrix16(teleport.transform, portalTransformScratch)) {
      continue;
    }
    mat4.multiply(portalConstraintMatA, portalTransformScratch, portalState.lift);
    portalState.lift.set(portalConstraintMatA);
    if (!mat4.invert(portalState.invLift, portalState.lift)) {
      mat4.identity(portalState.lift);
      mat4.identity(portalState.invLift);
    }
  }
}

function buildTeleportTransformByPlayer(wormholeTeleports: WormholeTeleportEvent[]) {
  const transforms = new Map<number, Float32Array>();
  if (!Array.isArray(wormholeTeleports)) {
    return transforms;
  }
  for (const event of wormholeTeleports) {
    const playerId = toNonNegativeInt(event?.playerId);
    if (playerId === null) {
      continue;
    }
    const tf = mat4.create();
    if (!copyMatrix16(event.transform, tf)) {
      continue;
    }
    transforms.set(playerId, tf);
  }
  return transforms;
}

function applyFollowerTeleportToLinks(links: ChainLinkState[], teleportByPlayer: Map<number, Float32Array>) {
  if (teleportByPlayer.size === 0) {
    return;
  }
  for (const link of links) {
    const followerId = toNonNegativeInt(link.portalFollowerId);
    if (followerId === null) {
      continue;
    }
    const tf = teleportByPlayer.get(followerId);
    if (!tf) {
      continue;
    }
    for (const node of link.nodes) {
      vec3.set(portalConstraintVecA, node.pos.x, node.pos.y, node.pos.z);
      vec3.transformMat4(portalConstraintVecA, portalConstraintVecA, tf);
      node.pos.x = portalConstraintVecA[0];
      node.pos.y = portalConstraintVecA[1];
      node.pos.z = portalConstraintVecA[2];

      vec3.set(portalConstraintVecA, node.prevPos.x, node.prevPos.y, node.prevPos.z);
      vec3.transformMat4(portalConstraintVecA, portalConstraintVecA, tf);
      node.prevPos.x = portalConstraintVecA[0];
      node.prevPos.y = portalConstraintVecA[1];
      node.prevPos.z = portalConstraintVecA[2];

      if (node.renderPrevPos) {
        vec3.set(portalConstraintVecA, node.renderPrevPos.x, node.renderPrevPos.y, node.renderPrevPos.z);
        vec3.transformMat4(portalConstraintVecA, portalConstraintVecA, tf);
        node.renderPrevPos.x = portalConstraintVecA[0];
        node.renderPrevPos.y = portalConstraintVecA[1];
        node.renderPrevPos.z = portalConstraintVecA[2];
      }
    }
  }
}

function updateLinkPortalFollowers(
  state: ChainState,
  links: ChainLinkState[],
  teleportedPlayerIds: Set<number>,
) {
  for (const link of links) {
    const playerA = state.portalByPlayer.get(link.playerAId);
    const playerB = state.portalByPlayer.get(link.playerBId);
    const crossing = !!playerA && !!playerB && playerA.signature !== playerB.signature;
    if (!crossing) {
      link.portalFollowerId = null;
      continue;
    }
    const teleportedA = teleportedPlayerIds.has(link.playerAId);
    const teleportedB = teleportedPlayerIds.has(link.playerBId);
    if (teleportedA && !teleportedB) {
      link.portalFollowerId = link.playerBId;
      continue;
    }
    if (teleportedB && !teleportedA) {
      link.portalFollowerId = link.playerAId;
      continue;
    }
    if (link.portalFollowerId === link.playerAId || link.portalFollowerId === link.playerBId) {
      continue;
    }
    const sigALen = playerA?.signature?.length ?? 0;
    const sigBLen = playerB?.signature?.length ?? 0;
    link.portalFollowerId = sigALen <= sigBLen ? link.playerAId : link.playerBId;
  }
}

function getPortalRenderTransformForLink(state: ChainState, link: ChainLinkState): Float32Array | null {
  const followerId = toNonNegativeInt(link.portalFollowerId);
  if (followerId === null) {
    return null;
  }
  const playerA = state.portalByPlayer.get(link.playerAId);
  const playerB = state.portalByPlayer.get(link.playerBId);
  if (!playerA || !playerB || playerA.signature === playerB.signature) {
    return null;
  }
  if (followerId === link.playerAId) {
    mat4.multiply(portalConstraintMatA, playerB.lift, playerA.invLift);
    return portalConstraintMatA;
  }
  if (followerId === link.playerBId) {
    mat4.multiply(portalConstraintMatA, playerA.lift, playerB.invLift);
    return portalConstraintMatA;
  }
  return null;
}

function resolvePortalSeamIndex(link: ChainLinkState, bToA: Float32Array): number {
  const segmentCount = link.nodes.length - 1;
  if (segmentCount <= 0) {
    return -1;
  }
  const minIndex = 0;
  const maxIndex = segmentCount - 1;
  if (maxIndex < minIndex) {
    return -1;
  }
  const defaultIndex = minIndex + ((maxIndex - minIndex) >> 1);
  const prevIndex = Number.isFinite(link.portalSeamIndex) ? (link.portalSeamIndex | 0) : defaultIndex;
  let bestIndex = Math.min(maxIndex, Math.max(minIndex, prevIndex));
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = minIndex; i <= maxIndex; i += 1) {
    const nodeA = link.nodes[i];
    const nodeB = link.nodes[i + 1];
    vec3.set(portalConstraintVecA, nodeB.pos.x, nodeB.pos.y, nodeB.pos.z);
    vec3.transformMat4(portalConstraintVecA, portalConstraintVecA, bToA);
    const dx = portalConstraintVecA[0] - nodeA.pos.x;
    const dy = portalConstraintVecA[1] - nodeA.pos.y;
    const dz = portalConstraintVecA[2] - nodeA.pos.z;
    const continuityPenalty = Math.abs(i - prevIndex) * 0.05;
    const score = (dx * dx) + (dy * dy) + (dz * dz) + continuityPenalty;
    if (score < bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function getPortalConstraintForLink(
  state: ChainState,
  link: ChainLinkState,
  forcedSeamIndex: number | null = null,
): ChainPortalConstraint | null {
  const playerA = state.portalByPlayer.get(link.playerAId);
  const playerB = state.portalByPlayer.get(link.playerBId);
  if (!playerA || !playerB) {
    return null;
  }
  if (playerA.signature === playerB.signature) {
    link.portalSeamIndex = -1;
    return null;
  }
  mat4.multiply(portalConstraintMatA, playerA.lift, playerB.invLift);
  const maxSegmentIndex = link.nodes.length - 2;
  let seamIndex = -1;
  if (forcedSeamIndex !== null && forcedSeamIndex >= 0 && forcedSeamIndex <= maxSegmentIndex) {
    seamIndex = forcedSeamIndex;
  } else {
    seamIndex = resolvePortalSeamIndex(link, portalConstraintMatA);
  }
  if (seamIndex < 0) {
    link.portalSeamIndex = -1;
    return null;
  }
  link.portalSeamIndex = seamIndex;
  mat4.multiply(portalConstraintMatB, playerB.lift, playerA.invLift);
  mat3.fromMat4(portalConstraintMat3B, portalConstraintMatA);
  mat3.fromMat4(portalConstraintMat3, portalConstraintMatB);
  return {
    seamIndex,
    bToA: portalConstraintMatA,
    aToB: portalConstraintMatB,
    bToALinear: portalConstraintMat3B,
    aToBLinear: portalConstraintMat3,
  };
}

function clonePortalConstraint(source: ChainPortalConstraint | null): ChainPortalConstraint | null {
  if (!source) {
    return null;
  }
  const bToA = mat4.create();
  const aToB = mat4.create();
  const bToALinear = mat3.create();
  const aToBLinear = mat3.create();
  bToA.set(source.bToA);
  aToB.set(source.aToB);
  bToALinear.set(source.bToALinear);
  aToBLinear.set(source.aToBLinear);
  return {
    seamIndex: source.seamIndex,
    bToA,
    aToB,
    bToALinear,
    aToBLinear,
  };
}

function createInitialChainNodes(start: Vec3, end: Vec3): ChainNodeState[] {
  const nodes: ChainNodeState[] = new Array(CHAIN_SEGMENTS + 1);
  for (let i = 0; i <= CHAIN_SEGMENTS; i += 1) {
    const t = i / CHAIN_SEGMENTS;
    const x = start.x + ((end.x - start.x) * t);
    const y = start.y + ((end.y - start.y) * t);
    const z = start.z + ((end.z - start.z) * t);
    nodes[i] = {
      pos: { x, y, z },
      prevPos: { x, y, z },
      renderPrevPos: { x, y, z },
      animGroupId: 0,
    };
  }
  return nodes;
}

function getChainEndpointTarget(
  endpoint: ChainNodeState,
  neighbor: ChainNodeState,
  ball: any,
  usePrev: boolean,
): Vec3 {
  const center = usePrev ? ball.prevPos : ball.pos;
  const radius = Math.max(0.01, ball.currRadius ?? 0.5);
  let dx = endpoint.pos.x - ball.pos.x;
  let dy = endpoint.pos.y - ball.pos.y;
  let dz = endpoint.pos.z - ball.pos.z;
  let len = sqrt((dx * dx) + (dy * dy) + (dz * dz));
  if (len <= 1e-6) {
    dx = neighbor.pos.x - ball.pos.x;
    dy = neighbor.pos.y - ball.pos.y;
    dz = neighbor.pos.z - ball.pos.z;
    len = sqrt((dx * dx) + (dy * dy) + (dz * dz));
  }
  if (len <= 1e-6) {
    return { x: center.x + radius, y: center.y, z: center.z };
  }
  const invLen = 1 / len;
  return {
    x: center.x + (dx * invLen * radius),
    y: center.y + (dy * invLen * radius),
    z: center.z + (dz * invLen * radius),
  };
}

function anchorChainEndpointToBallSurface(
  endpoint: ChainNodeState,
  neighbor: ChainNodeState,
  ball: any,
  snap = 1,
  transferToBall = false,
  neighborToEndpoint: Float32Array | null = null,
): Vec3 | null {
  const radius = Math.max(0.01, ball.currRadius ?? 0.5);
  const segmentRestLen = CHAIN_LINK_LENGTH / CHAIN_SEGMENTS;
  const preDx = endpoint.pos.x - ball.pos.x;
  const preDy = endpoint.pos.y - ball.pos.y;
  const preDz = endpoint.pos.z - ball.pos.z;
  const preDist = sqrt((preDx * preDx) + (preDy * preDy) + (preDz * preDz));
  const preStretch = Math.max(0, preDist - radius);
  const targetPos = getChainEndpointTarget(endpoint, neighbor, ball, false);
  const targetPrevPos = getChainEndpointTarget(endpoint, neighbor, ball, true);
  const corrX = (targetPos.x - endpoint.pos.x) * snap;
  const corrY = (targetPos.y - endpoint.pos.y) * snap;
  const corrZ = (targetPos.z - endpoint.pos.z) * snap;
  const corrPrevX = (targetPrevPos.x - endpoint.prevPos.x) * snap;
  const corrPrevY = (targetPrevPos.y - endpoint.prevPos.y) * snap;
  const corrPrevZ = (targetPrevPos.z - endpoint.prevPos.z) * snap;
  endpoint.pos.x += corrX;
  endpoint.pos.y += corrY;
  endpoint.pos.z += corrZ;
  endpoint.prevPos.x += corrPrevX;
  endpoint.prevPos.y += corrPrevY;
  endpoint.prevPos.z += corrPrevZ;
  endpoint.animGroupId = ball.physBall?.animGroupId ?? 0;
  if (!transferToBall) {
    return null;
  }
  let segDx = neighbor.pos.x - endpoint.pos.x;
  let segDy = neighbor.pos.y - endpoint.pos.y;
  let segDz = neighbor.pos.z - endpoint.pos.z;
  if (neighborToEndpoint) {
    vec3.set(portalConstraintVecA, neighbor.pos.x, neighbor.pos.y, neighbor.pos.z);
    vec3.transformMat4(portalConstraintVecA, portalConstraintVecA, neighborToEndpoint);
    segDx = portalConstraintVecA[0] - endpoint.pos.x;
    segDy = portalConstraintVecA[1] - endpoint.pos.y;
    segDz = portalConstraintVecA[2] - endpoint.pos.z;
  }
  const segDist = sqrt((segDx * segDx) + (segDy * segDy) + (segDz * segDz));
  const segStretch = Math.max(0, segDist - segmentRestLen);
  let transferX = 0;
  let transferY = 0;
  let transferZ = 0;

  if (preStretch > 1e-6) {
    const stretchRatio = Math.min(1, preStretch / radius);
    let radialX = -corrX * CHAIN_ENDPOINT_TRANSFER * stretchRatio;
    let radialY = -corrY * CHAIN_ENDPOINT_TRANSFER * stretchRatio;
    let radialZ = -corrZ * CHAIN_ENDPOINT_TRANSFER * stretchRatio;
    const radialLen = sqrt((radialX * radialX) + (radialY * radialY) + (radialZ * radialZ));
    if (radialLen > CHAIN_ENDPOINT_TRANSFER_MAX_STEP && radialLen > 1e-6) {
      const scale = CHAIN_ENDPOINT_TRANSFER_MAX_STEP / radialLen;
      radialX *= scale;
      radialY *= scale;
      radialZ *= scale;
    }
    transferX += radialX;
    transferY += radialY;
    transferZ += radialZ;
  }

  if (segStretch > 1e-6 && segDist > 1e-6) {
    const segPull = Math.min(CHAIN_ENDPOINT_SEGMENT_MAX_STEP, segStretch * CHAIN_ENDPOINT_SEGMENT_TRANSFER);
    const invSegDist = 1 / segDist;
    transferX += segDx * invSegDist * segPull;
    transferY += segDy * invSegDist * segPull;
    transferZ += segDz * invSegDist * segPull;
  }

  const transferLen = sqrt((transferX * transferX) + (transferY * transferY) + (transferZ * transferZ));
  if (transferLen <= 1e-6) {
    return null;
  }
  return { x: transferX, y: transferY, z: transferZ };
}

function applyChainBallTransfer(ball: any, transfer: Vec3, endpoints: ChainNodeState[]) {
  ball.vel.x += transfer.x * CHAIN_ENDPOINT_VEL_BLEND;
  ball.vel.y += transfer.y * CHAIN_ENDPOINT_VEL_BLEND;
  ball.vel.z += transfer.z * CHAIN_ENDPOINT_VEL_BLEND;
  if (CHAIN_ENDPOINT_POS_BLEND <= 0) {
    return;
  }
  const posX = transfer.x * CHAIN_ENDPOINT_POS_BLEND;
  const posY = transfer.y * CHAIN_ENDPOINT_POS_BLEND;
  const posZ = transfer.z * CHAIN_ENDPOINT_POS_BLEND;
  ball.pos.x += posX;
  ball.pos.y += posY;
  ball.pos.z += posZ;
  ball.prevPos.x += posX * CHAIN_ENDPOINT_PREV_BLEND;
  ball.prevPos.y += posY * CHAIN_ENDPOINT_PREV_BLEND;
  ball.prevPos.z += posZ * CHAIN_ENDPOINT_PREV_BLEND;
  for (const endpoint of endpoints) {
    endpoint.pos.x += posX;
    endpoint.pos.y += posY;
    endpoint.pos.z += posZ;
    endpoint.prevPos.x += posX * CHAIN_ENDPOINT_PREV_BLEND;
    endpoint.prevPos.y += posY * CHAIN_ENDPOINT_PREV_BLEND;
    endpoint.prevPos.z += posZ * CHAIN_ENDPOINT_PREV_BLEND;
  }
}

function syncChainTopology(game: any, state: ChainState, players: any[], forceRebuild = false) {
  if (!isChainedTogetherMode(game)) {
    state.links = [];
    state.topologyKey = '';
    return;
  }
  const chainPlayers = getChainActivePlayersSorted(players);
  const nextKey = getChainTopologyKey(chainPlayers);
  const expectedLinkCount = Math.max(0, chainPlayers.length - 1);
  if (!forceRebuild && nextKey === state.topologyKey && state.links.length === expectedLinkCount) {
    return;
  }
  state.topologyKey = nextKey;
  if (chainPlayers.length < 2) {
    state.links = [];
    return;
  }
  const prevLinks = new Map<string, ChainLinkState>();
  if (!forceRebuild) {
    for (const link of state.links) {
      prevLinks.set(getPairKey(link.playerAId, link.playerBId), link);
    }
  }
  const nextLinks: ChainLinkState[] = [];
  for (let i = 0; i < chainPlayers.length - 1; i += 1) {
    const playerA = chainPlayers[i];
    const playerB = chainPlayers[i + 1];
    const pairKey = getPairKey(playerA.id, playerB.id);
    const prev = forceRebuild ? undefined : prevLinks.get(pairKey);
    const linkId = ((playerA.id & 0xffff) << 16) | (playerB.id & 0xffff);
    const nodes = prev && prev.nodes.length === (CHAIN_SEGMENTS + 1)
      ? prev.nodes.map((node) => ({
        pos: cloneVec3(node.pos),
        prevPos: cloneVec3(node.prevPos),
        renderPrevPos: cloneVec3(node.renderPrevPos ?? node.pos),
        animGroupId: node.animGroupId ?? 0,
      }))
      : createInitialChainNodes(playerA.ball.pos, playerB.ball.pos);
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    anchorChainEndpointToBallSurface(first, nodes[1], playerA.ball, 1);
    anchorChainEndpointToBallSurface(last, nodes[nodes.length - 2], playerB.ball, 1);
    nextLinks.push({
      id: linkId >>> 0,
      playerAId: playerA.id,
      playerBId: playerB.id,
      nodes,
      portalSeamIndex: Number.isFinite(prev?.portalSeamIndex) ? (prev.portalSeamIndex | 0) : -1,
      portalFollowerId: toNonNegativeInt(prev?.portalFollowerId),
    });
  }
  state.links = nextLinks;
}

function applyChainNodeCollision(
  state: ChainState,
  game: any,
  node: ChainNodeState,
  stageFormat: string,
  useFullCollision: boolean,
) {
  if (!game.stage || !game.stageRuntime) {
    return;
  }
  const phys = state.tmpPhysBall;
  phys.flags = 0;
  phys.pos.x = node.pos.x;
  phys.pos.y = node.pos.y;
  phys.pos.z = node.pos.z;
  phys.prevPos.x = node.prevPos.x;
  phys.prevPos.y = node.prevPos.y;
  phys.prevPos.z = node.prevPos.z;
  phys.vel.x = phys.pos.x - phys.prevPos.x;
  phys.vel.y = phys.pos.y - phys.prevPos.y;
  phys.vel.z = phys.pos.z - phys.prevPos.z;
  phys.radius = CHAIN_NODE_RADIUS;
  phys.gravityAccel = 0;
  phys.restitution = 0.25;
  phys.hardestColiSpeed = 0;
  phys.hardestColiAnimGroupId = 0;
  phys.friction = 0.01;
  phys.frictionMode = stageFormat === 'smb2' ? 'smb2' : 'smb1';
  phys.animGroupId = node.animGroupId ?? 0;

  const collisionOptions = useFullCollision ? state.fullCollisionOptions : state.faceOnlyCollisionOptions;
  collisionOptions.precomputedCellTrisByAnimGroup = node.stageCellTrisByAnimGroup ?? null;
  collideBallWithStage(phys, game.stage, game.stageRuntime.animGroups, collisionOptions);
  collideBallWithBonusWave(phys, game.stageRuntime);

  node.pos.x = phys.pos.x;
  node.pos.y = phys.pos.y;
  node.pos.z = phys.pos.z;
  node.prevPos.x = phys.prevPos.x;
  node.prevPos.y = phys.prevPos.y;
  node.prevPos.z = phys.prevPos.z;
  node.animGroupId = phys.animGroupId ?? 0;
}

function applyChainLeashCorrection(ballA: any, ballB: any) {
  const dx = ballB.pos.x - ballA.pos.x;
  const dy = ballB.pos.y - ballA.pos.y;
  const dz = ballB.pos.z - ballA.pos.z;
  const distSq = (dx * dx) + (dy * dy) + (dz * dz);
  if (distSq <= 1e-8) {
    return;
  }
  const dist = sqrt(distSq);
  if (dist <= CHAIN_LINK_LENGTH) {
    return;
  }
  const over = dist - CHAIN_LINK_LENGTH;
  const pull = Math.min(CHAIN_LEASH_MAX_STEP, over * CHAIN_LEASH_CORRECTION);
  if (pull <= 1e-6) {
    return;
  }
  const invDist = 1 / dist;
  const nx = dx * invDist;
  const ny = dy * invDist;
  const nz = dz * invDist;
  const corr = pull * 0.5;
  const corrX = nx * corr;
  const corrY = ny * corr;
  const corrZ = nz * corr;
  ballA.pos.x += corrX;
  ballA.pos.y += corrY;
  ballA.pos.z += corrZ;
  ballB.pos.x -= corrX;
  ballB.pos.y -= corrY;
  ballB.pos.z -= corrZ;
  ballA.prevPos.x += corrX;
  ballA.prevPos.y += corrY;
  ballA.prevPos.z += corrZ;
  ballB.prevPos.x -= corrX;
  ballB.prevPos.y -= corrY;
  ballB.prevPos.z -= corrZ;
  const velCorr = corr * CHAIN_LEASH_VEL_BLEND;
  ballA.vel.x += nx * velCorr;
  ballA.vel.y += ny * velCorr;
  ballA.vel.z += nz * velCorr;
  ballB.vel.x -= nx * velCorr;
  ballB.vel.y -= ny * velCorr;
  ballB.vel.z -= nz * velCorr;
}

function solveChainSegmentConstraint(
  nodeA: ChainNodeState,
  nodeB: ChainNodeState,
  segmentRestLen: number,
  portalConstraint: ChainPortalConstraint | null = null,
) {
  let dx = nodeB.pos.x - nodeA.pos.x;
  let dy = nodeB.pos.y - nodeA.pos.y;
  let dz = nodeB.pos.z - nodeA.pos.z;
  if (portalConstraint) {
    vec3.set(portalConstraintVecA, nodeB.pos.x, nodeB.pos.y, nodeB.pos.z);
    vec3.transformMat4(portalConstraintVecA, portalConstraintVecA, portalConstraint.bToA);
    dx = portalConstraintVecA[0] - nodeA.pos.x;
    dy = portalConstraintVecA[1] - nodeA.pos.y;
    dz = portalConstraintVecA[2] - nodeA.pos.z;
  }
  const distSq = (dx * dx) + (dy * dy) + (dz * dz);
  if (distSq <= 1e-8) {
    return;
  }
  const dist = sqrt(distSq);
  const diff = (dist - segmentRestLen) / dist;
  const half = diff * 0.5;
  let corrAx = dx * half;
  let corrAy = dy * half;
  let corrAz = dz * half;
  if (portalConstraint) {
    const corrLen = sqrt((corrAx * corrAx) + (corrAy * corrAy) + (corrAz * corrAz));
    if (corrLen > CHAIN_PORTAL_SEAM_MAX_CORRECTION && corrLen > 1e-6) {
      const scale = CHAIN_PORTAL_SEAM_MAX_CORRECTION / corrLen;
      corrAx *= scale;
      corrAy *= scale;
      corrAz *= scale;
    }
  }
  nodeA.pos.x += corrAx;
  nodeA.pos.y += corrAy;
  nodeA.pos.z += corrAz;
  if (!portalConstraint) {
    nodeB.pos.x -= corrAx;
    nodeB.pos.y -= corrAy;
    nodeB.pos.z -= corrAz;
    return;
  }
  vec3.set(portalConstraintVecB, -corrAx, -corrAy, -corrAz);
  vec3.transformMat3(portalConstraintVecB, portalConstraintVecB, portalConstraint.aToBLinear);
  nodeB.pos.x += portalConstraintVecB[0];
  nodeB.pos.y += portalConstraintVecB[1];
  nodeB.pos.z += portalConstraintVecB[2];
}

function solveChainSegmentConstraints(
  nodes: ChainNodeState[],
  segmentRestLen: number,
  reverse = false,
  portalConstraint: ChainPortalConstraint | null = null,
) {
  if (!reverse) {
    for (let i = 0; i < nodes.length - 1; i += 1) {
      solveChainSegmentConstraint(
        nodes[i],
        nodes[i + 1],
        segmentRestLen,
        portalConstraint && portalConstraint.seamIndex === i ? portalConstraint : null,
      );
    }
    return;
  }
  for (let i = nodes.length - 2; i >= 0; i -= 1) {
    solveChainSegmentConstraint(
      nodes[i],
      nodes[i + 1],
      segmentRestLen,
      portalConstraint && portalConstraint.seamIndex === i ? portalConstraint : null,
    );
  }
}

function shouldSkipPortalSeamCollision(link: ChainLinkState, nodeIndex: number) {
  const followerId = toNonNegativeInt(link.portalFollowerId);
  if (followerId === null) {
    return false;
  }
  const seamIndex = Number.isFinite(link.portalSeamIndex) ? (link.portalSeamIndex | 0) : -1;
  if (seamIndex < 0) {
    return false;
  }
  const minSkip = Math.max(1, seamIndex - 1);
  const maxSkip = Math.min(link.nodes.length - 2, seamIndex + 1);
  return nodeIndex >= minSkip && nodeIndex <= maxSkip;
}

function collideChainInteriorNodes(
  state: ChainState,
  game: any,
  link: ChainLinkState,
  stageFormat: string,
  useFullCollision: boolean,
  reverse = false,
) {
  if (!reverse) {
    for (let i = 1; i < link.nodes.length - 1; i += 1) {
      if (shouldSkipPortalSeamCollision(link, i)) {
        continue;
      }
      applyChainNodeCollision(state, game, link.nodes[i], stageFormat, useFullCollision);
    }
    return;
  }
  for (let i = link.nodes.length - 2; i >= 1; i -= 1) {
    if (shouldSkipPortalSeamCollision(link, i)) {
      continue;
    }
    applyChainNodeCollision(state, game, link.nodes[i], stageFormat, useFullCollision);
  }
}

function vec3Length(v: Vec3): number {
  return sqrt((v.x * v.x) + (v.y * v.y) + (v.z * v.z));
}

function scaleVec3(v: Vec3, scale: number): Vec3 {
  return { x: v.x * scale, y: v.y * scale, z: v.z * scale };
}

function equalizeLinkEndpointTransfers(
  transferA: Vec3 | null,
  transferB: Vec3 | null,
): { transferA: Vec3 | null; transferB: Vec3 | null } {
  if (!transferA || !transferB) {
    return { transferA, transferB };
  }
  const lenA = vec3Length(transferA);
  const lenB = vec3Length(transferB);
  if (lenA <= 1e-6 || lenB <= 1e-6) {
    return { transferA, transferB };
  }
  const targetLen = (lenA + lenB) * 0.5;
  return {
    transferA: scaleVec3(transferA, targetLen / lenA),
    transferB: scaleVec3(transferB, targetLen / lenB),
  };
}

function createBallProxyInSpace(ball: any, transform: Float32Array, animGroupId: number) {
  vec3.set(portalConstraintVecA, ball.pos.x, ball.pos.y, ball.pos.z);
  vec3.transformMat4(portalConstraintVecA, portalConstraintVecA, transform);
  vec3.set(portalConstraintVecB, ball.prevPos.x, ball.prevPos.y, ball.prevPos.z);
  vec3.transformMat4(portalConstraintVecB, portalConstraintVecB, transform);
  return {
    pos: { x: portalConstraintVecA[0], y: portalConstraintVecA[1], z: portalConstraintVecA[2] },
    prevPos: { x: portalConstraintVecB[0], y: portalConstraintVecB[1], z: portalConstraintVecB[2] },
    currRadius: ball.currRadius,
    physBall: {
      animGroupId,
    },
  };
}

function anchorLinkEndpoints(
  link: ChainLinkState,
  playerA: any,
  playerB: any,
  snap: number,
  transferToBall = false,
  reverseOrder = false,
  portalConstraint: ChainPortalConstraint | null = null,
  portalFollowerId: number | null = null,
) {
  const first = link.nodes[0];
  const last = link.nodes[link.nodes.length - 1];
  const seamIndex = portalConstraint?.seamIndex ?? -1;
  const firstNeighborToEndpoint = seamIndex === 0 ? (portalConstraint?.bToA ?? null) : null;
  const lastNeighborToEndpoint = seamIndex === (link.nodes.length - 2) ? (portalConstraint?.aToB ?? null) : null;
  const followerId = toNonNegativeInt(portalFollowerId);
  let ballAForChain = playerA.ball;
  let ballBForChain = playerB.ball;
  let allowTransferA = transferToBall;
  let allowTransferB = transferToBall;
  let transferAToRealLinear: Float32Array | null = null;
  let transferBToRealLinear: Float32Array | null = null;
  if (portalConstraint && followerId === link.playerAId) {
    const animGroupId = playerA.ball?.physBall?.animGroupId ?? 0;
    ballBForChain = createBallProxyInSpace(playerB.ball, portalConstraint.bToA, animGroupId);
    transferBToRealLinear = portalConstraint.aToBLinear;
  } else if (portalConstraint && followerId === link.playerBId) {
    const animGroupId = playerB.ball?.physBall?.animGroupId ?? 0;
    ballAForChain = createBallProxyInSpace(playerA.ball, portalConstraint.aToB, animGroupId);
    transferAToRealLinear = portalConstraint.bToALinear;
  }
  let transferA: Vec3 | null = null;
  let transferB: Vec3 | null = null;
  if (!reverseOrder) {
    transferA = anchorChainEndpointToBallSurface(
      first,
      link.nodes[1],
      ballAForChain,
      snap,
      allowTransferA,
      firstNeighborToEndpoint,
    );
    transferB = anchorChainEndpointToBallSurface(
      last,
      link.nodes[link.nodes.length - 2],
      ballBForChain,
      snap,
      allowTransferB,
      lastNeighborToEndpoint,
    );
  } else {
    transferB = anchorChainEndpointToBallSurface(
      last,
      link.nodes[link.nodes.length - 2],
      ballBForChain,
      snap,
      allowTransferB,
      lastNeighborToEndpoint,
    );
    transferA = anchorChainEndpointToBallSurface(
      first,
      link.nodes[1],
      ballAForChain,
      snap,
      allowTransferA,
      firstNeighborToEndpoint,
    );
  }
  if (transferA && transferAToRealLinear) {
    vec3.set(portalConstraintVecA, transferA.x, transferA.y, transferA.z);
    vec3.transformMat3(portalConstraintVecA, portalConstraintVecA, transferAToRealLinear);
    transferA = { x: portalConstraintVecA[0], y: portalConstraintVecA[1], z: portalConstraintVecA[2] };
  }
  if (transferB && transferBToRealLinear) {
    vec3.set(portalConstraintVecA, transferB.x, transferB.y, transferB.z);
    vec3.transformMat3(portalConstraintVecA, portalConstraintVecA, transferBToRealLinear);
    transferB = { x: portalConstraintVecA[0], y: portalConstraintVecA[1], z: portalConstraintVecA[2] };
  }
  return { first, last, transferA, transferB };
}

function simulateChainedTogether(
  game: any,
  state: ChainState,
  players: any[],
  wormholeTeleports: WormholeTeleportEvent[],
) {
  if (!isChainedTogetherMode(game) || !game.stage || !game.stageRuntime) {
    return;
  }
  syncChainTopology(game, state, players);
  const teleportByPlayer = buildTeleportTransformByPlayer(wormholeTeleports);
  applyFollowerTeleportToLinks(state.links, teleportByPlayer);
  applyWormholeTeleports(state, players, wormholeTeleports);
  if (state.links.length === 0) {
    return;
  }
  const playerMap = new Map<number, any>();
  for (const player of players) {
    playerMap.set(player.id, player);
  }
  const gravity = game.world?.gravity ?? { x: 0, y: -1, z: 0 };
  const stageFormat = game.stageRuntime.stage?.format ?? game.stage?.format ?? 'smb1';
  const animGroups = game.stageRuntime.animGroups;
  const substeps = Math.max(1, CHAIN_SUBSTEPS);
  const substepDamping = Math.pow(CHAIN_NODE_DAMPING, 1 / substeps);
  const substepGravity = CHAIN_NODE_GRAVITY / substeps;
  const segmentRestLen = CHAIN_LINK_LENGTH / CHAIN_SEGMENTS;
  const teleportedPlayerIds = new Set<number>();
  for (const event of wormholeTeleports) {
    const eventPlayerId = toNonNegativeInt(event?.playerId);
    if (eventPlayerId !== null) {
      teleportedPlayerIds.add(eventPlayerId);
    }
  }
  updateLinkPortalFollowers(state, state.links, teleportedPlayerIds);
  for (const link of state.links) {
    for (const node of link.nodes) {
      if (!node.renderPrevPos) {
        node.renderPrevPos = cloneVec3(node.pos);
      } else {
        node.renderPrevPos.x = node.pos.x;
        node.renderPrevPos.y = node.pos.y;
        node.renderPrevPos.z = node.pos.z;
      }
    }
  }
  for (const link of state.links) {
    for (let i = 1; i < link.nodes.length - 1; i += 1) {
      const node = link.nodes[i];
      node.stageCellTrisByAnimGroup = precomputeStageCollisionCellTris(
        node.pos,
        game.stage,
        animGroups,
        node.stageCellTrisByAnimGroup ?? null,
      );
    }
  }
  for (let substep = 0; substep < substeps; substep += 1) {
    for (const link of state.links) {
      for (let i = 1; i < link.nodes.length - 1; i += 1) {
        const node = link.nodes[i];
        const oldX = node.pos.x;
        const oldY = node.pos.y;
        const oldZ = node.pos.z;
        const velX = (node.pos.x - node.prevPos.x) * substepDamping;
        const velY = (node.pos.y - node.prevPos.y) * substepDamping;
        const velZ = (node.pos.z - node.prevPos.z) * substepDamping;
        node.prevPos.x = oldX;
        node.prevPos.y = oldY;
        node.prevPos.z = oldZ;
        node.pos.x = oldX + velX + (gravity.x * substepGravity);
        node.pos.y = oldY + velY + (gravity.y * substepGravity);
        node.pos.z = oldZ + velZ + (gravity.z * substepGravity);
      }
    }

    const portalConstraintByLink = new Map<ChainLinkState, ChainPortalConstraint | null>();
    for (const link of state.links) {
      const followerId = toNonNegativeInt(link.portalFollowerId);
      const teleportedA = teleportedPlayerIds.has(link.playerAId);
      const teleportedB = teleportedPlayerIds.has(link.playerBId);
      let forcedSeamIndex: number | null = null;
      if (followerId === link.playerBId) {
        forcedSeamIndex = 0;
      } else if (followerId === link.playerAId) {
        forcedSeamIndex = Math.max(0, link.nodes.length - 2);
      } else if (teleportedA && !teleportedB) {
        forcedSeamIndex = 0;
      } else if (teleportedB && !teleportedA) {
        forcedSeamIndex = Math.max(0, link.nodes.length - 2);
      }
      const constraint = clonePortalConstraint(getPortalConstraintForLink(state, link, forcedSeamIndex));
      if (constraint && followerId !== null) {
        // In follower/ghost mode, do not apply seam-space segment corrections in physics;
        // the chain already lives in follower space.
        constraint.seamIndex = -1;
      }
      portalConstraintByLink.set(link, constraint);
    }

    for (let iter = 0; iter < CHAIN_CONSTRAINT_ITERS; iter += 1) {
      for (const link of state.links) {
        const playerA = playerMap.get(link.playerAId);
        const playerB = playerMap.get(link.playerBId);
        if (!playerA || !playerB) {
          continue;
        }
        const portalConstraint = portalConstraintByLink.get(link) ?? null;
        const reverseEndpoints = ((substep + iter) & 1) === 1;
        anchorLinkEndpoints(
          link,
          playerA,
          playerB,
          CHAIN_ENDPOINT_SNAP,
          false,
          reverseEndpoints,
          portalConstraint,
          link.portalFollowerId,
        );
        // Solve constraints in both directions to avoid persistent endpoint-order bias.
        solveChainSegmentConstraints(link.nodes, segmentRestLen, false, portalConstraint);
        solveChainSegmentConstraints(link.nodes, segmentRestLen, true, portalConstraint);
        const useFullCollision = iter === (CHAIN_CONSTRAINT_ITERS - 1);
        collideChainInteriorNodes(state, game, link, stageFormat, useFullCollision, (iter & 1) === 1);
      }
    }

    for (const link of state.links) {
      const playerA = playerMap.get(link.playerAId);
      const playerB = playerMap.get(link.playerBId);
      if (!playerA || !playerB) {
        continue;
      }
      if (CHAIN_LEASH_CORRECTION > 0) {
        applyChainLeashCorrection(playerA.ball, playerB.ball);
      }
    }

    const pendingBallTransfers = new Map<number, ChainBallTransferState>();
    for (const link of state.links) {
      const playerA = playerMap.get(link.playerAId);
      const playerB = playerMap.get(link.playerBId);
      if (!playerA || !playerB) {
        continue;
      }
      const portalConstraint = portalConstraintByLink.get(link) ?? null;
      const reverseEndpoints = (substep & 1) === 1;
      const { first, last, transferA, transferB } = anchorLinkEndpoints(
        link,
        playerA,
        playerB,
        CHAIN_ENDPOINT_SNAP,
        true,
        reverseEndpoints,
        portalConstraint,
        link.portalFollowerId,
      );
      const balancedTransfers = portalConstraint
        ? { transferA, transferB }
        : equalizeLinkEndpointTransfers(transferA, transferB);
      if (balancedTransfers.transferA) {
        const pending = pendingBallTransfers.get(playerA.id) ?? { x: 0, y: 0, z: 0, endpoints: [] };
        pending.x += balancedTransfers.transferA.x;
        pending.y += balancedTransfers.transferA.y;
        pending.z += balancedTransfers.transferA.z;
        pending.endpoints.push(first);
        pendingBallTransfers.set(playerA.id, pending);
      }
      if (balancedTransfers.transferB) {
        const pending = pendingBallTransfers.get(playerB.id) ?? { x: 0, y: 0, z: 0, endpoints: [] };
        pending.x += balancedTransfers.transferB.x;
        pending.y += balancedTransfers.transferB.y;
        pending.z += balancedTransfers.transferB.z;
        pending.endpoints.push(last);
        pendingBallTransfers.set(playerB.id, pending);
      }
    }

    for (const [playerId, transferState] of pendingBallTransfers.entries()) {
      const player = playerMap.get(playerId);
      if (!player) {
        continue;
      }
      applyChainBallTransfer(
        player.ball,
        { x: transferState.x, y: transferState.y, z: transferState.z },
        transferState.endpoints,
      );
    }
  }
}

function updateChainedTogetherFalloutState(
  game: any,
  players: any[],
  isBonusStage: boolean,
  resultReplayActive: boolean,
  stageInputEnabled: boolean,
) {
  if (!isChainedTogetherMode(game) || resultReplayActive || !stageInputEnabled) {
    return;
  }
  const activePlayers = getChainActivePlayersSorted(players);
  if (activePlayers.length === 0) {
    return;
  }
  let allOut = true;
  for (const player of activePlayers) {
    const ball = player.ball;
    const playable = !(ball.flags & BALL_FLAGS.INVISIBLE)
      && (ball.state === BALL_STATES.PLAY || ball.state === BALL_STATES.GOAL_MAIN);
    const isOut = !playable || game.isBallFalloutForBall(ball);
    if (!isOut) {
      allOut = false;
      break;
    }
  }
  if (allOut) {
    game.beginFalloutSequence(isBonusStage);
    return;
  }
  for (const player of activePlayers) {
    player.ringoutTimerFrames = 0;
    player.ringoutSkipTimerFrames = 0;
  }
}

function beginChainedTeamGoalSequence(game: any, players: any[], goalHit: any, resultReplayActive: boolean) {
  const activePlayers = getChainActivePlayersSorted(players);
  if (activePlayers.length === 0) {
    return;
  }
  const goalType = goalHit?.goalType ?? game.stage?.goals?.[0]?.type ?? 'B';
  const localPlayer = game.getLocalPlayer?.();
  const localActive = !!localPlayer && activePlayers.some((player) => player.id === localPlayer.id);

  if (localPlayer && localActive) {
    if (resultReplayActive) {
      localPlayer.finished = true;
      localPlayer.goalType = goalType;
      if (!localPlayer.goalInfo) {
        localPlayer.goalInfo = goalHit;
      }
      localPlayer.goalTimerFrames = Math.max(localPlayer.goalTimerFrames, GOAL_SEQUENCE_FRAMES);
      localPlayer.goalSkipTimerFrames = Math.max(localPlayer.goalSkipTimerFrames, GOAL_SKIP_TOTAL_FRAMES);
      if (!(localPlayer.ball.flags & BALL_FLAGS.GOAL)) {
        startGoal(localPlayer.ball);
      }
      (game as any).breakGoalTapeForBall?.(localPlayer.ball, goalHit);
    } else if (localPlayer.goalTimerFrames <= 0) {
      game.beginGoalSequence(goalHit);
    }
  }

  for (const player of activePlayers) {
    if (localActive && player.id === game.localPlayerId) {
      continue;
    }
    player.finished = true;
    player.goalType = goalType;
    player.goalInfo = goalHit;
    player.goalTimerFrames = GOAL_SEQUENCE_FRAMES;
    player.goalSkipTimerFrames = GOAL_SKIP_TOTAL_FRAMES;
    if (!(player.ball.flags & BALL_FLAGS.GOAL)) {
      startGoal(player.ball);
    }
    (game as any).breakGoalTapeForBall?.(player.ball, goalHit);
    player.camera.setGoalMain();
    if (game.session?.isMultiplayer?.(game)) {
      player.spectateTimerFrames = GOAL_SPECTATE_DESTROY_FRAMES;
    }
  }
}

function serializePortalStates(portalByPlayer: Map<number, ChainPortalPlayerState>): SavedChainPortalState[] {
  const entries = Array.from(portalByPlayer.entries()).sort((a, b) => a[0] - b[0]);
  const out: SavedChainPortalState[] = [];
  for (const [playerId, portalState] of entries) {
    const windingKeys = Object.keys(portalState.windingByPair).sort();
    out.push({
      playerId,
      lift: Array.from(portalState.lift),
      winding: windingKeys.map((pairKey) => ({
        pairKey,
        count: portalState.windingByPair[pairKey] | 0,
      })),
    });
  }
  return out;
}

function deserializePortalStates(source: SavedChainPortalState[] | undefined): Map<number, ChainPortalPlayerState> {
  const out = new Map<number, ChainPortalPlayerState>();
  if (!Array.isArray(source)) {
    return out;
  }
  for (const entry of source) {
    const playerId = toNonNegativeInt(entry?.playerId);
    if (playerId === null) {
      continue;
    }
    const portalState = createChainPortalPlayerState();
    if (!copyMatrix16(entry.lift, portalState.lift)) {
      mat4.identity(portalState.lift);
    }
    if (!mat4.invert(portalState.invLift, portalState.lift)) {
      mat4.identity(portalState.lift);
      mat4.identity(portalState.invLift);
    }
    if (Array.isArray(entry.winding)) {
      for (const windingEntry of entry.winding) {
        const pairKey = typeof windingEntry?.pairKey === 'string' ? windingEntry.pairKey : '';
        const count = Number.isFinite(windingEntry?.count) ? (windingEntry.count | 0) : 0;
        if (!pairKey || count === 0) {
          continue;
        }
        portalState.windingByPair[pairKey] = count;
      }
    }
    portalState.signature = rebuildPortalSignature(portalState.windingByPair);
    out.set(playerId, portalState);
  }
  return out;
}

function buildChainHash(state: ChainState): number {
  const f32 = new Float32Array(1);
  const u32 = new Uint32Array(f32.buffer);
  const hashU32 = (hash: number, value: number) => {
    let h = hash ^ (value >>> 0);
    h = Math.imul(h, 16777619) >>> 0;
    return h;
  };
  const hashF32 = (hash: number, value: number) => {
    f32[0] = value;
    return hashU32(hash, u32[0]);
  };
  const hashString = (hash: number, value: string) => {
    let h = hash;
    for (let i = 0; i < value.length; i += 1) {
      h = hashU32(h, value.charCodeAt(i));
    }
    return h;
  };
  let h = 0x811c9dc5;
  h = hashU32(h, state.links.length);
  for (const link of state.links) {
    h = hashU32(h, link.id);
    h = hashU32(h, link.playerAId);
    h = hashU32(h, link.playerBId);
    h = hashU32(h, link.portalSeamIndex ?? -1);
    h = hashU32(h, toNonNegativeInt(link.portalFollowerId) ?? 0xffffffff);
    h = hashU32(h, link.nodes.length);
    for (const node of link.nodes) {
      h = hashF32(h, node.pos.x);
      h = hashF32(h, node.pos.y);
      h = hashF32(h, node.pos.z);
      h = hashF32(h, node.prevPos.x);
      h = hashF32(h, node.prevPos.y);
      h = hashF32(h, node.prevPos.z);
      h = hashU32(h, node.animGroupId ?? 0);
    }
  }
  const portalEntries = Array.from(state.portalByPlayer.entries()).sort((a, b) => a[0] - b[0]);
  h = hashU32(h, portalEntries.length);
  for (const [playerId, portalState] of portalEntries) {
    h = hashU32(h, playerId);
    for (let i = 0; i < 16; i += 1) {
      h = hashF32(h, Number(portalState.lift[i]) || 0);
    }
    const windingKeys = Object.keys(portalState.windingByPair).sort();
    h = hashU32(h, windingKeys.length);
    for (const pairKey of windingKeys) {
      h = hashString(h, pairKey);
      h = hashU32(h, portalState.windingByPair[pairKey] | 0);
    }
  }
  return h >>> 0;
}

function pushChainRibbonPrimitive(primitives: any[], id: number, points: Vec3[]) {
  if (!Array.isArray(points) || points.length < 2) {
    return;
  }
  primitives.push({
    kind: 'ribbon',
    id: id >>> 0,
    points,
    width: CHAIN_RIBBON_WIDTH,
    alpha: 0.92,
    alphaClip: true,
    colorR: 0.78,
    colorG: 0.79,
    colorB: 0.82,
    textureName: CHAIN_RIBBON_TEXTURE,
    depthTest: true,
    additiveBlend: false,
  });
}

function processPostChainBallWormholes(game: any, state: ChainState, players: any[]): WormholeTeleportEvent[] {
  if (!game?.stageRuntime) {
    return [];
  }
  const extraTeleports: WormholeTeleportEvent[] = [];
  for (const player of players) {
    if (player?.isSpectator || player?.pendingSpawn) {
      continue;
    }
    const ball = player?.ball;
    if (!ball) {
      continue;
    }
    if (ball.flags & BALL_FLAGS.INVISIBLE) {
      continue;
    }
    if (ball.state !== BALL_STATES.PLAY && ball.state !== BALL_STATES.GOAL_MAIN) {
      continue;
    }
    if (!processBallWormholeTeleport(ball, game.stageRuntime)) {
      continue;
    }
    const tf = mat4.create();
    if (copyMatrix16(ball.wormholeTransform, tf)) {
      const traversal = ball.wormholeTraversal;
      extraTeleports.push({
        playerId: player.id,
        srcWormholeId: toNonNegativeInt(traversal?.srcWormholeId) ?? 0,
        dstWormholeId: toNonNegativeInt(traversal?.dstWormholeId) ?? 0,
        transform: tf,
      });
      player.camera?.applyWormholeTransform?.(ball.wormholeTransform);
    }
    ball.wormholeTransform = null;
    ball.wormholeTraversal = null;
  }
  if (extraTeleports.length === 0) {
    return extraTeleports;
  }
  const teleportByPlayer = buildTeleportTransformByPlayer(extraTeleports);
  applyFollowerTeleportToLinks(state.links, teleportByPlayer);
  applyWormholeTeleports(state, players, extraTeleports);
  const teleportedPlayerIds = new Set<number>();
  for (const event of extraTeleports) {
    const eventPlayerId = toNonNegativeInt(event.playerId);
    if (eventPlayerId !== null) {
      teleportedPlayerIds.add(eventPlayerId);
    }
  }
  updateLinkPortalFollowers(state, state.links, teleportedPlayerIds);
  return extraTeleports;
}

function buildChainHooks(): ModHooks {
  return {
    onStageLoad: ({ game }) => {
      const state = getChainState(game as object);
      state.links = [];
      state.topologyKey = '';
      state.portalByPlayer.clear();
    },
    onSaveState: ({ game, modState }) => {
      if (!isChainedTogetherMode(game)) {
        return;
      }
      const state = getChainState(game as object);
      modState.chain = {
        links: cloneChainLinks(state.links),
        topologyKey: state.topologyKey,
        portalStates: serializePortalStates(state.portalByPlayer),
      };
    },
    onLoadState: ({ game, modState }) => {
      const state = getChainState(game as object);
      const saved = modState.chain as {
        links?: ChainLinkState[];
        topologyKey?: string;
        portalStates?: SavedChainPortalState[];
      } | undefined;
      if (!saved) {
        state.links = [];
        state.topologyKey = '';
        state.portalByPlayer.clear();
        return;
      }
      state.links = Array.isArray(saved.links) ? cloneChainLinks(saved.links) : [];
      state.topologyKey = saved.topologyKey ?? '';
      state.portalByPlayer = deserializePortalStates(saved.portalStates);
    },
    onDeterminismHash: ({ game }) => {
      if (!isChainedTogetherMode(game)) {
        return;
      }
      return buildChainHash(getChainState(game as object));
    },
    onResolveSpawnPosition: ({ game, player, activePlayers, startPos, startRotY, defaultPos }) => {
      if (!isChainedTogetherMode(game)) {
        return null;
      }
      if (!Array.isArray(activePlayers) || activePlayers.length <= 1) {
        return null;
      }
      const index = activePlayers.findIndex((entry) => entry.id === (player as any).id);
      if (index < 0) {
        return null;
      }
      const offset = (index - ((activePlayers.length - 1) * 0.5)) * CHAIN_SPAWN_SPACING;
      const rightX = cosS16(startRotY);
      const rightZ = -sinS16(startRotY);
      return {
        x: startPos.x + (rightX * offset),
        y: defaultPos.y,
        z: startPos.z + (rightZ * offset),
      };
    },
    onAfterBallStep: ({
      game,
      players,
      isBonusStage,
      resultReplayActive,
      stageInputEnabled,
      ringoutActive,
      wormholeTeleports,
    }) => {
      if (!isChainedTogetherMode(game)) {
        return;
      }
      const state = getChainState(game as object);
      const sortedPlayers = getPlayersSorted(players as any[]);
      const teleportEvents = Array.isArray(wormholeTeleports) ? (wormholeTeleports as WormholeTeleportEvent[]) : [];
      if (hasBallDropStarted(game)) {
        syncChainTopology(game, state, sortedPlayers);
        simulateChainedTogether(game, state, sortedPlayers, teleportEvents);
        processPostChainBallWormholes(game, state, sortedPlayers);
      } else {
        state.links = [];
        state.topologyKey = '';
        state.portalByPlayer.clear();
      }
      updateChainedTogetherFalloutState(game, sortedPlayers, isBonusStage, resultReplayActive, stageInputEnabled);
      const localPlayer = game.getLocalPlayer?.();
      const replayFalloutActive = game.activeResultReplay?.kind === 'fallout';
      const nextRingoutActive = (localPlayer?.ringoutTimerFrames ?? 0) > 0 || replayFalloutActive || ringoutActive;
      return { ringoutActive: nextRingoutActive, skipStandardRingout: true };
    },
    onGoalHit: ({ game, goalHit, resultReplayActive }) => {
      if (!isChainedTogetherMode(game)) {
        return false;
      }
      const state = getChainState(game as object);
      const sortedPlayers = getPlayersSorted((game as any).players ?? []);
      syncChainTopology(game, state, sortedPlayers);
      beginChainedTeamGoalSequence(game, sortedPlayers, goalHit, resultReplayActive);
      return true;
    },
    onRingoutComplete: ({ game, isBonusStage }) => {
      if (!isChainedTogetherMode(game)) {
        return false;
      }
      game.accumulator = 0;
      if (isBonusStage) {
        if (game.allowCourseAdvance) {
          void game.advanceCourse(game.makeAdvanceInfo(INFO_FLAGS.FALLOUT));
        }
        return true;
      }
      if (game.stage) {
        void game.loadStage(game.stage.stageId);
      }
      return true;
    },
    onAppendRenderPrimitives: ({ game, primitives, alpha }) => {
      if (!isChainedTogetherMode(game)) {
        return;
      }
      if (!hasBallDropStarted(game)) {
        return;
      }
      const state = getChainState(game as object);
      if (state.links.length === 0) {
        return;
      }
      for (const link of state.links) {
        if (link.nodes.length < 2) {
          continue;
        }
        const portalRenderTransform = getPortalRenderTransformForLink(state, link);
        const points = new Array(link.nodes.length);
        for (let i = 0; i < link.nodes.length; i += 1) {
          const node = link.nodes[i];
          const renderPrev = node.renderPrevPos ?? node.prevPos;
          points[i] = {
            x: renderPrev.x + ((node.pos.x - renderPrev.x) * alpha),
            y: renderPrev.y + ((node.pos.y - renderPrev.y) * alpha),
            z: renderPrev.z + ((node.pos.z - renderPrev.z) * alpha),
          };
        }
        pushChainRibbonPrimitive(primitives, link.id >>> 0, points);
        if (!portalRenderTransform) {
          continue;
        }
        const liftedPoints = new Array(points.length);
        for (let i = 0; i < points.length; i += 1) {
          const point = points[i];
          vec3.set(portalConstraintVecA, point.x, point.y, point.z);
          vec3.transformMat4(portalConstraintVecA, portalConstraintVecA, portalRenderTransform);
          liftedPoints[i] = {
            x: portalConstraintVecA[0],
            y: portalConstraintVecA[1],
            z: portalConstraintVecA[2],
          };
        }
        pushChainRibbonPrimitive(primitives, (link.id ^ 0x9e3779b9) >>> 0, liftedPoints);
      }
    },
  };
}

export function registerChainMod(registry: ModRegistry): void {
  registry.registerManifest(CHAIN_MOD_MANIFEST);
  registry.registerGamemode({ id: 'chained_together', label: 'Chained Together' });
  registry.registerHooks(buildChainHooks());
}
