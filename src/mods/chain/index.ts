import type { ModHooks, ModManifest } from '../mod_types.js';
import { ModRegistry } from '../mod_registry.js';
import {
  BALL_FLAGS,
  BALL_STATES,
  INFO_FLAGS,
} from '../../shared/constants/index.js';
import type { Vec3 } from '../../shared/types.js';
import { collideBallWithBonusWave, collideBallWithStage } from '../../collision.js';
import { cosS16, sinS16, sqrt } from '../../math.js';
import { startGoal } from '../../physics.js';

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
const CHAIN_CONSTRAINT_ITERS = 6;
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
const CHAIN_EFFECT_ID_MASK = 0x80000000;

const GOAL_SEQUENCE_FRAMES = 330;
const GOAL_SKIP_TOTAL_FRAMES = 210;
const GOAL_SPECTATE_DESTROY_FRAMES = 180;

type ChainNodeState = {
  pos: Vec3;
  prevPos: Vec3;
  animGroupId: number;
};

type ChainLinkState = {
  id: number;
  playerAId: number;
  playerBId: number;
  nodes: ChainNodeState[];
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

function getChainState(game: object): ChainState {
  let state = chainStateByGame.get(game);
  if (!state) {
    state = {
      links: [],
      topologyKey: '',
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
    nodes: link.nodes.map((node) => ({
      pos: cloneVec3(node.pos),
      prevPos: cloneVec3(node.prevPos),
      animGroupId: node.animGroupId ?? 0,
    })),
  }));
}

function getPairKey(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
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
  const segDx = neighbor.pos.x - endpoint.pos.x;
  const segDy = neighbor.pos.y - endpoint.pos.y;
  const segDz = neighbor.pos.z - endpoint.pos.z;
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

function getChainEffectId(link: ChainLinkState, segmentIndex: number) {
  const base = (Math.imul(link.id, 31) + segmentIndex) >>> 0;
  return (CHAIN_EFFECT_ID_MASK | (base & 0x7fffffff)) >>> 0;
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
    });
  }
  state.links = nextLinks;
}

function applyChainNodeCollision(state: ChainState, game: any, node: ChainNodeState, stageFormat: string) {
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

  collideBallWithStage(phys, game.stage, game.stageRuntime.animGroups);
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

function simulateChainedTogether(game: any, state: ChainState, players: any[]) {
  if (!isChainedTogetherMode(game) || !game.stage || !game.stageRuntime) {
    return;
  }
  syncChainTopology(game, state, players);
  if (state.links.length === 0) {
    return;
  }
  const playerMap = new Map<number, any>();
  for (const player of players) {
    playerMap.set(player.id, player);
  }
  const gravity = game.world?.gravity ?? { x: 0, y: -1, z: 0 };
  const stageFormat = game.stageRuntime.stage?.format ?? game.stage?.format ?? 'smb1';
  const substeps = Math.max(1, CHAIN_SUBSTEPS);
  const substepDamping = Math.pow(CHAIN_NODE_DAMPING, 1 / substeps);
  const substepGravity = CHAIN_NODE_GRAVITY / substeps;
  const segmentRestLen = CHAIN_LINK_LENGTH / CHAIN_SEGMENTS;
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

    for (let iter = 0; iter < CHAIN_CONSTRAINT_ITERS; iter += 1) {
      for (const link of state.links) {
        const playerA = playerMap.get(link.playerAId);
        const playerB = playerMap.get(link.playerBId);
        if (!playerA || !playerB) {
          continue;
        }
        const first = link.nodes[0];
        const last = link.nodes[link.nodes.length - 1];
        anchorChainEndpointToBallSurface(first, link.nodes[1], playerA.ball, CHAIN_ENDPOINT_SNAP);
        anchorChainEndpointToBallSurface(last, link.nodes[link.nodes.length - 2], playerB.ball, CHAIN_ENDPOINT_SNAP);

        for (let i = 0; i < link.nodes.length - 1; i += 1) {
          const nodeA = link.nodes[i];
          const nodeB = link.nodes[i + 1];
          const dx = nodeB.pos.x - nodeA.pos.x;
          const dy = nodeB.pos.y - nodeA.pos.y;
          const dz = nodeB.pos.z - nodeA.pos.z;
          const distSq = (dx * dx) + (dy * dy) + (dz * dz);
          if (distSq <= 1e-8) {
            continue;
          }
          const dist = sqrt(distSq);
          const diff = (dist - segmentRestLen) / dist;
          const half = diff * 0.5;
          nodeA.pos.x += dx * half;
          nodeA.pos.y += dy * half;
          nodeA.pos.z += dz * half;
          nodeB.pos.x -= dx * half;
          nodeB.pos.y -= dy * half;
          nodeB.pos.z -= dz * half;
        }

        for (let i = 1; i < link.nodes.length - 1; i += 1) {
          applyChainNodeCollision(state, game, link.nodes[i], stageFormat);
        }
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
      const first = link.nodes[0];
      const last = link.nodes[link.nodes.length - 1];
      const transferA = anchorChainEndpointToBallSurface(first, link.nodes[1], playerA.ball, CHAIN_ENDPOINT_SNAP, true);
      const transferB = anchorChainEndpointToBallSurface(
        last,
        link.nodes[link.nodes.length - 2],
        playerB.ball,
        CHAIN_ENDPOINT_SNAP,
        true,
      );
      if (transferA) {
        const pending = pendingBallTransfers.get(playerA.id) ?? { x: 0, y: 0, z: 0, endpoints: [] };
        pending.x += transferA.x;
        pending.y += transferA.y;
        pending.z += transferA.z;
        pending.endpoints.push(first);
        pendingBallTransfers.set(playerA.id, pending);
      }
      if (transferB) {
        const pending = pendingBallTransfers.get(playerB.id) ?? { x: 0, y: 0, z: 0, endpoints: [] };
        pending.x += transferB.x;
        pending.y += transferB.y;
        pending.z += transferB.z;
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
  let h = 0x811c9dc5;
  h = hashU32(h, state.links.length);
  for (const link of state.links) {
    h = hashU32(h, link.id);
    h = hashU32(h, link.playerAId);
    h = hashU32(h, link.playerBId);
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
  return h >>> 0;
}

function buildChainHooks(): ModHooks {
  return {
    onStageLoad: ({ game }) => {
      const state = getChainState(game as object);
      state.links = [];
      state.topologyKey = '';
    },
    onSaveState: ({ game, modState }) => {
      if (!isChainedTogetherMode(game)) {
        return;
      }
      const state = getChainState(game as object);
      modState.chain = {
        links: cloneChainLinks(state.links),
        topologyKey: state.topologyKey,
      };
    },
    onLoadState: ({ game, modState }) => {
      const state = getChainState(game as object);
      const saved = modState.chain as { links?: ChainLinkState[]; topologyKey?: string } | undefined;
      if (!saved) {
        state.links = [];
        state.topologyKey = '';
        return;
      }
      state.links = Array.isArray(saved.links) ? cloneChainLinks(saved.links) : [];
      state.topologyKey = saved.topologyKey ?? '';
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
    onAfterBallStep: ({ game, players, isBonusStage, resultReplayActive, stageInputEnabled, ringoutActive }) => {
      if (!isChainedTogetherMode(game)) {
        return;
      }
      const state = getChainState(game as object);
      const sortedPlayers = getPlayersSorted(players as any[]);
      syncChainTopology(game, state, sortedPlayers);
      simulateChainedTogether(game, state, sortedPlayers);
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
    onAppendEffectRender: ({ game, effects, alpha }) => {
      if (!isChainedTogetherMode(game)) {
        return;
      }
      const state = getChainState(game as object);
      if (state.links.length === 0) {
        return;
      }
      for (const link of state.links) {
        for (let i = 0; i < link.nodes.length - 1; i += 1) {
          const nodeA = link.nodes[i];
          const nodeB = link.nodes[i + 1];
          const from = {
            x: nodeA.prevPos.x + ((nodeA.pos.x - nodeA.prevPos.x) * alpha),
            y: nodeA.prevPos.y + ((nodeA.pos.y - nodeA.prevPos.y) * alpha),
            z: nodeA.prevPos.z + ((nodeA.pos.z - nodeA.prevPos.z) * alpha),
          };
          const to = {
            x: nodeB.prevPos.x + ((nodeB.pos.x - nodeB.prevPos.x) * alpha),
            y: nodeB.prevPos.y + ((nodeB.pos.y - nodeB.prevPos.y) * alpha),
            z: nodeB.prevPos.z + ((nodeB.pos.z - nodeB.prevPos.z) * alpha),
          };
          effects.push({
            kind: 'streak',
            id: getChainEffectId(link, i),
            pos: to,
            prevPos: from,
            scale: 1.5,
            alpha: 0.85,
            lifeRatio: 1,
            colorR: 0.82,
            colorG: 0.82,
            colorB: 0.86,
          });
        }
      }
    },
  };
}

export function registerChainMod(registry: ModRegistry): void {
  registry.registerManifest(CHAIN_MOD_MANIFEST);
  registry.registerGamemode({ id: 'chained_together', label: 'Chained Together' });
  registry.registerHooks(buildChainHooks());
}
