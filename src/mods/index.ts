import { registerCoreMod } from './core_mod.js';
import { registerChainMod } from './chain/index.js';
import { ModRegistry } from './mod_registry.js';

export function createDefaultModRegistry(): ModRegistry {
  const registry = new ModRegistry();
  registerCoreMod(registry);
  registerChainMod(registry);
  return registry;
}

export { ModRegistry } from './mod_registry.js';
export type {
  ModManifest,
  ModModule,
  RulesetRegistration,
  ParserRegistration,
  GamemodeRegistration,
  GamemodeOptionDefinition,
  GamemodeOptionPrimitive,
  ModHooks,
} from './mod_types.js';
export { loadModModule } from './mod_loader.js';
