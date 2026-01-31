import { hashSimState } from './sim_hash.js';

export function runDeterminismTest(game, tickCount, inputFeed = null, { includeVisual = false } = {}) {
  game.setInputFeed(inputFeed);
  const hashes = [];
  for (let i = 0; i < tickCount; i += 1) {
    game.update(game.fixedStep);
    hashes.push(hashSimState(game.ball, game.world, game.stageRuntime, { includeVisual }));
  }
  return hashes;
}
