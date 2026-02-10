import type { GameSource } from './shared/constants/index.js';
import type { QuantizedStick } from './determinism.js';

export type ReplayData = {
  version: 1;
  gameSource: GameSource;
  stageId: number;
  ticks: number;
  inputStartTick: number;
  inputs: QuantizedStick[];
  hashes?: number[];
  note?: string;
};

export function createReplayData(
  gameSource: GameSource,
  stageId: number,
  ticks: number,
  inputStartTick: number,
  inputs: QuantizedStick[],
  hashes?: number[],
  note?: string,
): ReplayData {
  return {
    version: 1,
    gameSource,
    stageId,
    ticks,
    inputStartTick,
    inputs,
    hashes,
    note,
  };
}
