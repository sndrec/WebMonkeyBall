import type { ParserId } from '../../shared/ids.js';
import type { StageDef, StageParseContext } from './stage_def.js';

export type StageParser = {
  id: ParserId;
  label?: string;
  parse: (data: Uint8Array, context?: StageParseContext) => StageDef;
};

export class StageParserRegistry {
  private readonly parsers = new Map<ParserId, StageParser>();

  register(parser: StageParser): void {
    if (this.parsers.has(parser.id)) {
      throw new Error(`Stage parser already registered: ${parser.id}`);
    }
    this.parsers.set(parser.id, parser);
  }

  get(id: ParserId): StageParser | undefined {
    return this.parsers.get(id);
  }

  list(): StageParser[] {
    return Array.from(this.parsers.values());
  }
}
