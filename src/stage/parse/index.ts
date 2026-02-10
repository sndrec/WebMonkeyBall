import type { GameSource } from '../../shared/constants/index.js';
import type { ParserId } from '../../shared/ids.js';
import type { StageDef } from './stage_def.js';
import { StageParserRegistry, type StageParser } from './parser_registry.js';
import { createSmb1StageParser, SMB1_PARSER_ID } from './parsers/smb1.js';
import { createSmb2StageParser, SMB2_PARSER_ID } from './parsers/smb2.js';
import { detectStageFormat, parseStageDef as parseStageDefAuto } from './smb_stage_parser.js';

const defaultRegistry = new StageParserRegistry();
defaultRegistry.register(createSmb1StageParser());
defaultRegistry.register(createSmb2StageParser());

export type ParseStageDefOptions = {
  parserId?: ParserId | null;
  gameSource?: GameSource | string | null;
  registry?: StageParserRegistry;
};

export function getDefaultStageParserRegistry(): StageParserRegistry {
  return defaultRegistry;
}

export function registerStageParser(parser: StageParser): void {
  defaultRegistry.register(parser);
}

export function parseStageDef(data: Uint8Array, options: ParseStageDefOptions = {}): StageDef {
  const registry = options.registry ?? defaultRegistry;
  if (options.parserId) {
    const parser = registry.get(options.parserId);
    if (!parser) {
      throw new Error(`Unknown stage parser: ${options.parserId}`);
    }
    return parser.parse(data, { gameSource: options.gameSource ?? undefined });
  }
  if (options.gameSource === 'smb2' || options.gameSource === 'mb2ws') {
    const parser = registry.get(SMB2_PARSER_ID);
    if (parser) {
      return parser.parse(data, { gameSource: options.gameSource ?? undefined });
    }
  }
  if (options.gameSource === 'smb1') {
    const parser = registry.get(SMB1_PARSER_ID);
    if (parser) {
      return parser.parse(data, { gameSource: options.gameSource ?? undefined });
    }
  }
  const format = detectStageFormat(data, options.gameSource ?? undefined);
  if (format === 'smb2') {
    const parser = registry.get(SMB2_PARSER_ID);
    if (parser) {
      return parser.parse(data, { gameSource: options.gameSource ?? undefined });
    }
  }
  const parser = registry.get(SMB1_PARSER_ID);
  if (parser) {
    return parser.parse(data, { gameSource: options.gameSource ?? undefined });
  }
  return parseStageDefAuto(data, options.gameSource ?? undefined);
}
