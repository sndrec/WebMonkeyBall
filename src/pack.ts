import { unzipSync } from 'fflate';
import ArrayBufferSlice from './noclip/ArrayBufferSlice.js';
import { STAGE_BASE_PATHS, type GameSource } from './constants.js';

export type PackKeyframe = {
  t: number;
  v: number;
  ease?: number;
  in?: number;
  out?: number;
};

export type PackFogAnim = {
  start?: PackKeyframe[] | null;
  end?: PackKeyframe[] | null;
  r?: PackKeyframe[] | null;
  g?: PackKeyframe[] | null;
  b?: PackKeyframe[] | null;
};

export type PackFog = {
  type: number;
  start: number;
  end: number;
  color: [number, number, number];
  anim?: PackFogAnim;
};

export type PackBgInfo = {
  fileName: string;
  clearColor?: [number, number, number, number];
  ambientColor?: [number, number, number];
  infLightColor?: [number, number, number];
  infLightRotX?: number;
  infLightRotY?: number;
};

export type PackStageEnv = {
  bgInfo?: PackBgInfo;
  fog?: PackFog;
};

export type PackCourseData = {
  challenge?: {
    order?: Record<string, number[]>;
    bonus?: Record<string, boolean[]>;
    timers?: Record<string, (number | null)[]>;
  };
  story?: number[][];
};

export type PackManifest = {
  id: string;
  name: string;
  gameSource: GameSource;
  version: number;
  basePath?: string;
  content?: {
    stages?: number[];
    stageNames?: Record<string, string>;
    stageTimeOverrides?: Record<string, number | null>;
  };
  courses?: PackCourseData;
  stageEnv?: Record<string, PackStageEnv>;
};

export type PackProvider = {
  fetch: (path: string) => Promise<ArrayBuffer>;
};

export type LoadedPack = {
  manifest: PackManifest;
  provider: PackProvider;
  basePath: string;
};

let activePack: LoadedPack | null = null;
let packEnabled = true;
const urlSliceCache = new Map<string, ArrayBufferSlice>();
const urlSliceInFlight = new Map<string, Promise<ArrayBufferSlice>>();
const packSliceCache = new WeakMap<LoadedPack, Map<string, ArrayBufferSlice>>();
const packSliceInFlight = new WeakMap<LoadedPack, Map<string, Promise<ArrayBufferSlice>>>();

function getPackSliceCache(pack: LoadedPack) {
  let cache = packSliceCache.get(pack);
  if (!cache) {
    cache = new Map();
    packSliceCache.set(pack, cache);
  }
  return cache;
}

function getPackSliceInFlight(pack: LoadedPack) {
  let inflight = packSliceInFlight.get(pack);
  if (!inflight) {
    inflight = new Map();
    packSliceInFlight.set(pack, inflight);
  }
  return inflight;
}

async function fetchWithCache(
  cacheKey: string,
  cache: Map<string, ArrayBufferSlice>,
  inflight: Map<string, Promise<ArrayBufferSlice>>,
  fetcher: () => Promise<ArrayBufferSlice>,
) {
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const pending = inflight.get(cacheKey);
  if (pending) {
    return pending;
  }
  const promise = (async () => {
    try {
      const slice = await fetcher();
      cache.set(cacheKey, slice);
      return slice;
    } finally {
      inflight.delete(cacheKey);
    }
  })();
  inflight.set(cacheKey, promise);
  return promise;
}

function normalizePackPath(path: string): string {
  return path.replace(/^\.\//, '').replace(/^\//, '');
}

function joinBasePath(basePath: string, path: string): string {
  const normalized = normalizePackPath(path);
  const normalizedBase = basePath.replace(/\/+$/, '');
  if (!basePath) {
    return normalized;
  }
  if (normalizedBase && (normalized === normalizedBase || normalized.startsWith(`${normalizedBase}/`))) {
    return normalized;
  }
  if (/^https?:\/\//.test(normalized)) {
    return normalized;
  }
  return `${normalizedBase}/${normalized}`;
}

export function setActivePack(pack: LoadedPack | null) {
  activePack = pack;
}

export function setPackEnabled(enabled: boolean) {
  packEnabled = enabled;
}

export function isPackEnabled() {
  return packEnabled;
}

export function getActivePack() {
  return activePack;
}

export function getPackStageEnv(stageId: number): PackStageEnv | null {
  if (!packEnabled || !activePack?.manifest.stageEnv) {
    return null;
  }
  return activePack.manifest.stageEnv[String(stageId)] ?? null;
}

export function getPackCourseData(): PackCourseData | null {
  if (!packEnabled) {
    return null;
  }
  return activePack?.manifest.courses ?? null;
}

export function getPackStageName(stageId: number): string | null {
  if (!packEnabled) {
    return null;
  }
  const name = activePack?.manifest.content?.stageNames?.[String(stageId)];
  return name ?? null;
}

export function getPackStageTimeOverride(stageId: number): number | null {
  if (!packEnabled) {
    return null;
  }
  const override = activePack?.manifest.content?.stageTimeOverrides?.[String(stageId)];
  if (override === undefined) {
    return null;
  }
  return override === null ? 0 : override;
}

export function getPackStageBasePath(gameSource: GameSource): string | null {
  if (!activePack) {
    return null;
  }
  if (!packEnabled) {
    return null;
  }
  if (activePack.manifest.gameSource !== gameSource) {
    return null;
  }
  return activePack.basePath;
}

export function hasPackForGameSource(gameSource: GameSource): boolean {
  return !!packEnabled && activePack?.manifest.gameSource === gameSource;
}

export async function fetchPackSlice(path: string): Promise<ArrayBufferSlice> {
  const pack = activePack;
  const normalized = normalizePackPath(path);
  const defaultBasePaths = Object.values(STAGE_BASE_PATHS).map((base) => normalizePackPath(base));
  const isDefaultPath = defaultBasePaths.some((base) => normalized === base || normalized.startsWith(`${base}/`));
  if (pack && isDefaultPath) {
    const cacheKey = normalizePackPath(path);
    return fetchWithCache(cacheKey, urlSliceCache, urlSliceInFlight, async () => {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
      }
      return new ArrayBufferSlice(await response.arrayBuffer());
    });
  }
  if (!pack) {
    const cacheKey = normalizePackPath(path);
    return fetchWithCache(cacheKey, urlSliceCache, urlSliceInFlight, async () => {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
      }
      return new ArrayBufferSlice(await response.arrayBuffer());
    });
  }
  const resolved = joinBasePath(pack.basePath, normalized);
  const cacheKey = normalizePackPath(resolved);
  const cache = getPackSliceCache(pack);
  const inflight = getPackSliceInFlight(pack);
  return fetchWithCache(cacheKey, cache, inflight, async () => new ArrayBufferSlice(await pack.provider.fetch(resolved)));
}

export async function prefetchPackSlice(path: string): Promise<void> {
  try {
    await fetchPackSlice(path);
  } catch (err) {
    console.warn(`Prefetch failed for ${path}.`, err);
  }
}

export async function fetchPackBuffer(path: string): Promise<ArrayBuffer> {
  const slice = await fetchPackSlice(path);
  return slice.arrayBuffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength);
}

export async function loadPackFromUrl(url: string): Promise<LoadedPack> {
  if (url.endsWith('.zip')) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load pack: ${response.status} ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    return loadPackFromZipBuffer(buffer, '');
  }
  const basePath = url.endsWith('/') || url.endsWith('pack.json')
    ? url.replace(/\/pack\.json$/, '')
    : url;
  const response = await fetch(`${basePath.replace(/\/+$/, '')}/pack.json`);
  if (!response.ok) {
    throw new Error(`Failed to load pack.json: ${response.status} ${response.statusText}`);
  }
  const manifest = await response.json();
  const provider: PackProvider = {
    fetch: async (path: string) => {
      const res = await fetch(path);
      if (!res.ok) {
        throw new Error(`Failed to load ${path}: ${res.status} ${res.statusText}`);
      }
      return res.arrayBuffer();
    },
  };
  return { manifest, provider, basePath: manifest.basePath ?? basePath };
}

export async function loadPackFromZipFile(file: File): Promise<LoadedPack> {
  const buffer = await file.arrayBuffer();
  return loadPackFromZipBuffer(buffer, '');
}

export async function loadPackFromFileList(fileList: FileList): Promise<LoadedPack> {
  const files = Array.from(fileList);
  const map = new Map<string, File>();
  for (const file of files) {
    const rawPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const normalized = normalizePackPath(rawPath.replace(/^[^/]+\//, ''));
    map.set(normalized, file);
  }
  const manifestFile = map.get('pack.json');
  if (!manifestFile) {
    throw new Error('pack.json not found in selected folder');
  }
  const manifest = JSON.parse(await manifestFile.text()) as PackManifest;
  const provider: PackProvider = {
    fetch: async (path: string) => {
      const normalized = normalizePackPath(path);
      const file = map.get(normalized);
      if (!file) {
        throw new Error(`Missing pack entry: ${normalized}`);
      }
      return file.arrayBuffer();
    },
  };
  return { manifest, provider, basePath: '' };
}

function loadPackFromZipBuffer(buffer: ArrayBuffer, basePath: string): LoadedPack {
  const entries = unzipSync(new Uint8Array(buffer));
  const map = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(entries)) {
    map.set(normalizePackPath(name), data as Uint8Array);
  }
  const manifestBytes = map.get('pack.json');
  if (!manifestBytes) {
    throw new Error('pack.json not found in zip');
  }
  const manifest = JSON.parse(new TextDecoder('utf-8').decode(manifestBytes)) as PackManifest;
  const provider: PackProvider = {
    fetch: async (path: string) => {
      const normalized = normalizePackPath(path);
      const entry = map.get(normalized);
      if (!entry) {
        throw new Error(`Missing pack entry: ${normalized}`);
      }
      return entry.buffer.slice(entry.byteOffset, entry.byteOffset + entry.byteLength);
    },
  };
  return { manifest, provider, basePath };
}
