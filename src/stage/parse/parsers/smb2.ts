import type { StageParser } from '../parser_registry.js';
import { parseSmb2StageDef } from '../smb_stage_parser.js';

export const SMB2_PARSER_ID = 'smb2_stagedef';

export function createSmb2StageParser(): StageParser {
  return {
    id: SMB2_PARSER_ID,
    label: 'SMB2 Stagedef',
    parse: (data) => parseSmb2StageDef(data),
  };
}
