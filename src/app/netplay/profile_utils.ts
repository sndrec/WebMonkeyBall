import type { PlayerProfile } from '../../netcode_protocol.js';
import type { BallAppearanceProfile } from '../../shared/ball_appearance.js';
import {
  BALL_HEMI1_DEFAULT_COLOR,
  BALL_HEMI2_DEFAULT_COLOR,
  ballAppearanceProfilesEqual,
  normalizeBallColorHex,
  sanitizeBallColorHex,
} from '../../shared/ball_appearance.js';

const PROFILE_STORAGE_KEY = 'smb_netplay_profile';
const PRIVACY_STORAGE_KEY = 'smb_netplay_privacy';
const PROFILE_NAME_MAX = 64;
const PROFILE_NAME_SAFE = /[^A-Za-z0-9 _.-]/g;
const LOBBY_NAME_MAX = 64;
const PROFILE_AVATAR_MAX_BYTES = 150 * 1024;
const PROFILE_AVATAR_MAX_DIM = 512;
const PROFILE_AVATAR_MAX_DATA_URL_CHARS = 220000;
const PROFILE_AVATAR_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/jpg']);
const PROFILE_BALL_TEXTURE_MAX_BYTES = 100 * 1024;
const PROFILE_BALL_TEXTURE_MAX_DIM = 512;
const PROFILE_BALL_TEXTURE_MAX_DATA_URL_CHARS = 160000;
const PROFILE_BALL_TEXTURE_MIME = PROFILE_AVATAR_MIME;
const PROFILE_BILLBOARD_TEXTURE_MAX_BYTES = 200 * 1024;
const PROFILE_BILLBOARD_TEXTURE_MAX_WIDTH = 1024;
const PROFILE_BILLBOARD_TEXTURE_MAX_HEIGHT = 768;
const PROFILE_BILLBOARD_TEXTURE_MAX_DATA_URL_CHARS = 400000;
const PROFILE_BILLBOARD_TEXTURE_MIME = PROFILE_AVATAR_MIME;
const CHAT_MAX_CHARS = 200;

export function sanitizeProfileName(value: string) {
  if (typeof value !== 'string') {
    return 'Player';
  }
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(PROFILE_NAME_SAFE, '').trim();
  const collapsed = cleaned.replace(/\s+/g, ' ');
  const trimmed = collapsed.slice(0, PROFILE_NAME_MAX);
  return trimmed || 'Player';
}

export function sanitizeLobbyName(value?: string) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(PROFILE_NAME_SAFE, '').trim();
  const collapsed = cleaned.replace(/\s+/g, ' ');
  const trimmed = collapsed.slice(0, LOBBY_NAME_MAX);
  return trimmed || undefined;
}

export function sanitizeLobbyNameDraft(value: string) {
  if (typeof value !== 'string') {
    return '';
  }
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(PROFILE_NAME_SAFE, '');
  const collapsed = cleaned.replace(/\s+/g, ' ');
  return collapsed.slice(0, LOBBY_NAME_MAX);
}

export function sanitizeChatText(value: string) {
  if (typeof value !== 'string') {
    return '';
  }
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '');
  const collapsed = cleaned.replace(/\s+/g, ' ');
  const trimmed = collapsed.trim().slice(0, CHAT_MAX_CHARS);
  return trimmed;
}

function base64ByteLength(base64: string) {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function sanitizeAvatarDataUrl(value?: unknown): string | undefined {
  return sanitizeImageDataUrl(
    value,
    PROFILE_AVATAR_MAX_DATA_URL_CHARS,
    PROFILE_AVATAR_MAX_BYTES,
    PROFILE_AVATAR_MIME,
  );
}

export function sanitizeBallTextureDataUrl(value?: unknown): string | undefined {
  return sanitizeImageDataUrl(
    value,
    PROFILE_BALL_TEXTURE_MAX_DATA_URL_CHARS,
    PROFILE_BALL_TEXTURE_MAX_BYTES,
    PROFILE_BALL_TEXTURE_MIME,
  );
}

export function sanitizePlayerBillboardTextureDataUrl(value?: unknown): string | undefined {
  return sanitizeImageDataUrl(
    value,
    PROFILE_BILLBOARD_TEXTURE_MAX_DATA_URL_CHARS,
    PROFILE_BILLBOARD_TEXTURE_MAX_BYTES,
    PROFILE_BILLBOARD_TEXTURE_MIME,
  );
}

function sanitizeImageDataUrl(
  value: unknown,
  maxDataUrlChars: number,
  maxBytes: number,
  mimeAllowList: Set<string>,
): string | undefined {
  if (typeof value !== 'string' || !value) {
    return undefined;
  }
  if (value.length > maxDataUrlChars) {
    return undefined;
  }
  const match = value.match(/^data:(image\/(?:png|jpeg|webp|jpg));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    return undefined;
  }
  const mime = match[1].toLowerCase();
  if (!mimeAllowList.has(mime)) {
    return undefined;
  }
  const bytes = base64ByteLength(match[2]);
  if (bytes <= 0 || bytes > maxBytes) {
    return undefined;
  }
  return value;
}

export function sanitizeBallAppearanceProfile(appearance?: Partial<BallAppearanceProfile>): BallAppearanceProfile | undefined {
  if (!appearance) {
    return undefined;
  }
  const hemi1Color = sanitizeBallColorHex(appearance.hemi1Color);
  const hemi2Color = sanitizeBallColorHex(appearance.hemi2Color);
  const hemi1Texture = sanitizeBallTextureDataUrl(appearance.hemi1Texture);
  const hemi2Texture = sanitizeBallTextureDataUrl(appearance.hemi2Texture);
  const billboardTexture = sanitizeBallTextureDataUrl(appearance.playerBillboardTexture);
  const compact: BallAppearanceProfile = {};
  if (hemi1Color && hemi1Color !== BALL_HEMI1_DEFAULT_COLOR) {
    compact.hemi1Color = hemi1Color;
  }
  if (hemi2Color && hemi2Color !== BALL_HEMI2_DEFAULT_COLOR) {
    compact.hemi2Color = hemi2Color;
  }
  if (hemi1Texture) {
    compact.hemi1Texture = hemi1Texture;
  }
  if (hemi2Texture) {
    compact.hemi2Texture = hemi2Texture;
  }
  if (billboardTexture) {
    compact.playerBillboardTexture = billboardTexture;
  }
  return Object.keys(compact).length > 0 ? compact : undefined;
}

export function sanitizeProfileBallColorInput(value: unknown, hemi: 1 | 2): string {
  return normalizeBallColorHex(
    value,
    hemi === 1 ? BALL_HEMI1_DEFAULT_COLOR : BALL_HEMI2_DEFAULT_COLOR,
  );
}

export function sanitizeProfile(profile?: Partial<PlayerProfile>): PlayerProfile {
  return {
    name: sanitizeProfileName(profile?.name ?? ''),
    avatarData: sanitizeAvatarDataUrl(profile?.avatarData),
    ball: sanitizeBallAppearanceProfile(profile?.ball),
    playerBillboardTexture: sanitizePlayerBillboardTextureDataUrl(profile?.playerBillboardTexture),
  };
}

export function loadLocalProfile(): PlayerProfile {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) {
      return sanitizeProfile({});
    }
    return sanitizeProfile(JSON.parse(raw));
  } catch {
    return sanitizeProfile({});
  }
}

export function saveLocalProfile(profile: PlayerProfile) {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore storage errors.
  }
}

function loadImageDimensions(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function loadImageDimensionsFromFile(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await loadImageDimensions(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read_failed'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
}

function isAllowedFileByMime(file: File, mimeAllowList: Set<string>) {
  if (mimeAllowList.has(file.type.toLowerCase())) {
    return true;
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp';
}

function isAllowedAvatarFile(file: File) {
  return isAllowedFileByMime(file, PROFILE_AVATAR_MIME);
}

function isAllowedBallTextureFile(file: File) {
  return isAllowedFileByMime(file, PROFILE_BALL_TEXTURE_MIME);
}

function isAllowedPlayerBillboardTextureFile(file: File) {
  return isAllowedFileByMime(file, PROFILE_BILLBOARD_TEXTURE_MIME);
}

export async function validateAvatarFile(
  file: File,
  setError: (message?: string) => void,
): Promise<string | null> {
  setError();
  if (!isAllowedAvatarFile(file)) {
    setError('Avatar must be PNG, JPG, or WebP.');
    return null;
  }
  if (file.size > PROFILE_AVATAR_MAX_BYTES) {
    setError('Avatar must be smaller than 150kb.');
    return null;
  }
  const dimensions = await loadImageDimensionsFromFile(file);
  if (!dimensions) {
    setError('Failed to read avatar image.');
    return null;
  }
  if (dimensions.width > PROFILE_AVATAR_MAX_DIM || dimensions.height > PROFILE_AVATAR_MAX_DIM) {
    setError('Avatar must be 512x512 or smaller.');
    return null;
  }
  let dataUrl = '';
  try {
    dataUrl = await readFileAsDataUrl(file);
  } catch {
    setError('Failed to read avatar file.');
    return null;
  }
  const sanitized = sanitizeAvatarDataUrl(dataUrl);
  if (!sanitized) {
    setError('Avatar could not be validated.');
    return null;
  }
  return sanitized;
}

export async function validateBallTextureFile(
  file: File,
  setError: (message?: string) => void,
): Promise<string | null> {
  setError();
  if (!isAllowedBallTextureFile(file)) {
    setError('Ball texture must be PNG, JPG, or WebP.');
    return null;
  }
  if (file.size > PROFILE_BALL_TEXTURE_MAX_BYTES) {
    setError('Ball texture must be smaller than 100kb.');
    return null;
  }
  const dimensions = await loadImageDimensionsFromFile(file);
  if (!dimensions) {
    setError('Failed to read ball texture.');
    return null;
  }
  if (dimensions.width > PROFILE_BALL_TEXTURE_MAX_DIM || dimensions.height > PROFILE_BALL_TEXTURE_MAX_DIM) {
    setError('Ball texture must be 512x512 or smaller.');
    return null;
  }
  let dataUrl = '';
  try {
    dataUrl = await readFileAsDataUrl(file);
  } catch {
    setError('Failed to read ball texture file.');
    return null;
  }
  const sanitized = sanitizeBallTextureDataUrl(dataUrl);
  if (!sanitized) {
    setError('Ball texture could not be validated.');
    return null;
  }
  return sanitized;
}

export async function validatePlayerBillboardTextureFile(
  file: File,
  setError: (message?: string) => void,
): Promise<string | null> {
  setError();
  if (!isAllowedPlayerBillboardTextureFile(file)) {
    setError('Player texture must be PNG, JPG, or WebP.');
    return null;
  }
  if (file.size > PROFILE_BILLBOARD_TEXTURE_MAX_BYTES) {
    setError('Player texture must be smaller than 200kb.');
    return null;
  }
  const dimensions = await loadImageDimensionsFromFile(file);
  if (!dimensions) {
    setError('Failed to read player texture.');
    return null;
  }
  if (dimensions.width > PROFILE_BILLBOARD_TEXTURE_MAX_WIDTH || dimensions.height > PROFILE_BILLBOARD_TEXTURE_MAX_HEIGHT) {
    setError('Player texture must be a spritesheet and smaller than 1024x768.');
    return null;
  }
  let dataUrl = '';
  try {
    dataUrl = await readFileAsDataUrl(file);
  } catch {
    setError('Failed to read player texture file.');
    return null;
  }
  const sanitized = sanitizePlayerBillboardTextureDataUrl(dataUrl);
  if (!sanitized) {
    setError('Player texture could not be validated.');
    return null;
  }
  return sanitized;
}

export function sanitizePrivacySettings(value: any) {
  return {
    hidePlayerNames: !!value?.hidePlayerNames,
    hideLobbyNames: !!value?.hideLobbyNames,
    hideRemoteBallTextures: !!value?.hideRemoteBallTextures,
  };
}

export function loadPrivacySettings() {
  try {
    const raw = localStorage.getItem(PRIVACY_STORAGE_KEY);
    if (!raw) {
      return sanitizePrivacySettings({});
    }
    return sanitizePrivacySettings(JSON.parse(raw));
  } catch {
    return sanitizePrivacySettings({});
  }
}

export function savePrivacySettings(settings: {
  hidePlayerNames: boolean;
  hideLobbyNames: boolean;
  hideRemoteBallTextures: boolean;
}) {
  try {
    localStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors.
  }
}

function validateAvatarDataUrlDimensions(dataUrl: string): Promise<boolean> {
  return loadImageDimensions(dataUrl).then((dims) => {
    if (!dims) {
      return false;
    }
    return dims.width <= PROFILE_AVATAR_MAX_DIM && dims.height <= PROFILE_AVATAR_MAX_DIM;
  });
}

export function getAvatarValidationPromise(
  cache: Map<string, Promise<boolean>>,
  dataUrl: string,
): Promise<boolean> {
  const cached = cache.get(dataUrl);
  if (cached) {
    return cached;
  }
  const promise = validateAvatarDataUrlDimensions(dataUrl);
  cache.set(dataUrl, promise);
  return promise;
}

export function profilesEqual(a: PlayerProfile, b: PlayerProfile): boolean {
  return a.name === b.name
    && a.avatarData === b.avatarData
    && ballAppearanceProfilesEqual(a.ball, b.ball);
}
