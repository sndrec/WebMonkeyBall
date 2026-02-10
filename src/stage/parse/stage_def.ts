import type { GameSource } from '../../shared/constants/index.js';

export type StageDef = {
  stageId?: number;
  gameSource?: GameSource | string;
  format?: string;
  [key: string]: any;
};

export type StageParseContext = {
  gameSource?: GameSource | string;
};
