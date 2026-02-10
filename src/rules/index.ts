import type { Ruleset } from './ruleset.js';
import { smb1Ruleset } from './smb1.js';
import { smb2Ruleset } from './smb2.js';

const RULESETS = new Map<string, Ruleset>([
  [smb1Ruleset.id, smb1Ruleset],
  [smb2Ruleset.id, smb2Ruleset],
]);

export function getRulesetById(id: string | null | undefined): Ruleset {
  if (id && RULESETS.has(id)) {
    return RULESETS.get(id)!;
  }
  return smb1Ruleset;
}

export function registerRuleset(ruleset: Ruleset): void {
  RULESETS.set(ruleset.id, ruleset);
}
