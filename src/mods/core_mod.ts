import type { ModManifest } from './mod_types.js';
import { ModRegistry } from './mod_registry.js';

export const CORE_MOD_MANIFEST: ModManifest = {
  id: 'core',
  name: 'Core',
  version: '0.0.0',
};

export function registerCoreMod(registry: ModRegistry): void {
  registry.registerManifest(CORE_MOD_MANIFEST);
  registry.registerRuleset({ id: 'smb1', label: 'SMB1' });
  registry.registerRuleset({ id: 'smb2', label: 'SMB2' });
  registry.registerParser({ id: 'smb1_stagedef', label: 'SMB1 Stagedef' });
  registry.registerParser({ id: 'smb2_stagedef', label: 'SMB2 Stagedef' });
  registry.registerGamemode({ id: 'standard', label: 'Standard' });
}
