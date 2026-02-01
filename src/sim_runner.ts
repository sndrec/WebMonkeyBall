import { hashSimState } from './sim_hash.js';

export function runDeterminismTest(game, tickCount, inputFeed = null, { includeVisual = false } = {}) {
  game.setInputFeed(inputFeed);
  const hashes = [];
  for (let i = 0; i < tickCount; i += 1) {
    game.update(game.fixedStep);
    const balls = game.players ? game.players.map((player) => player.ball) : game.ball;
    const worlds = game.players ? [game.world, ...game.players.map((player) => player.world)] : game.world;
    hashes.push(hashSimState(balls, worlds, game.stageRuntime, { includeVisual }));
  }
  return hashes;
}
