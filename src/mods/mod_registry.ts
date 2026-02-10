import type { GamemodeRegistration, ModHooks, ModManifest, ParserRegistration, RulesetRegistration } from './mod_types.js';
import type { GamemodeId, ModId, ParserId, RulesetId } from '../shared/ids.js';
import type { Ruleset } from '../rules/ruleset.js';
import { registerRuleset } from '../rules/index.js';
import type { StageParser } from '../stage/parse/parser_registry.js';
import { registerStageParser } from '../stage/parse/index.js';

export class ModRegistry {
  private readonly manifests = new Map<ModId, ModManifest>();
  private readonly rulesets = new Map<RulesetId, RulesetRegistration>();
  private readonly parsers = new Map<ParserId, ParserRegistration>();
  private readonly gamemodes = new Map<GamemodeId, GamemodeRegistration>();
  private readonly hooks: ModHooks[] = [];

  registerManifest(manifest: ModManifest): void {
    if (this.manifests.has(manifest.id)) {
      throw new Error(`Mod manifest already registered: ${manifest.id}`);
    }
    this.manifests.set(manifest.id, manifest);
  }

  registerRuleset(entry: RulesetRegistration): void {
    if (this.rulesets.has(entry.id)) {
      throw new Error(`Ruleset already registered: ${entry.id}`);
    }
    this.rulesets.set(entry.id, entry);
  }

  registerRulesetImpl(ruleset: Ruleset): void {
    registerRuleset(ruleset);
  }

  registerParser(entry: ParserRegistration): void {
    if (this.parsers.has(entry.id)) {
      throw new Error(`Parser already registered: ${entry.id}`);
    }
    this.parsers.set(entry.id, entry);
  }

  registerParserImpl(id: ParserId, parser: StageParser): void {
    registerStageParser({ id, parse: parser.parse, label: parser.label });
  }

  registerGamemode(entry: GamemodeRegistration): void {
    if (this.gamemodes.has(entry.id)) {
      throw new Error(`Gamemode already registered: ${entry.id}`);
    }
    this.gamemodes.set(entry.id, entry);
  }

  registerHooks(hooks: ModHooks): void {
    this.hooks.push(hooks);
  }

  listManifests(): ModManifest[] {
    return Array.from(this.manifests.values());
  }

  listRulesets(): RulesetRegistration[] {
    return Array.from(this.rulesets.values());
  }

  listParsers(): ParserRegistration[] {
    return Array.from(this.parsers.values());
  }

  listGamemodes(): GamemodeRegistration[] {
    return Array.from(this.gamemodes.values());
  }

  listHooks(): ModHooks[] {
    return [...this.hooks];
  }
}
