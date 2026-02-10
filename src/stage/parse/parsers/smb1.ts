import type { StageParser } from '../parser_registry.js';
import { parseSmb1StageDef } from '../smb_stage_parser.js';

export const SMB1_PARSER_ID = 'smb1_stagedef';

export function createSmb1StageParser(): StageParser {
  return {
    id: SMB1_PARSER_ID,
    label: 'SMB1 Stagedef',
    parse: (data) => parseSmb1StageDef(data),
  };
}
