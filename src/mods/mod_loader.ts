import type { ModManifest, ModModule } from './mod_types.js';

async function fetchWasmBuffers(baseUrl: string, paths: string[]): Promise<Record<string, ArrayBuffer>> {
  const entries = await Promise.all(
    paths.map(async (path) => {
      const res = await fetch(new URL(path, baseUrl));
      if (!res.ok) {
        throw new Error(`Failed to load wasm: ${path}`);
      }
      return [path, await res.arrayBuffer()] as const;
    })
  );
  return Object.fromEntries(entries);
}

export async function loadModModule(manifest: ModManifest, baseUrl: string): Promise<ModModule> {
  const module = manifest.entry ? await import(new URL(manifest.entry, baseUrl).toString()) : undefined;
  const wasm = manifest.wasm && manifest.wasm.length > 0 ? await fetchWasmBuffers(baseUrl, manifest.wasm) : undefined;
  return { manifest, module, wasm };
}
