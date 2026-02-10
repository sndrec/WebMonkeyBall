import { GAME_SOURCES, type GameSource } from '../../shared/constants/index.js';

const ALIAS_ADJECTIVES = [
  'Brisk', 'Calm', 'Copper', 'Dusty', 'Frost', 'Golden', 'Hidden', 'Jade', 'Keen', 'Lucky',
  'Mellow', 'Neon', 'Quiet', 'Rapid', 'Rustic', 'Silver', 'Soft', 'Solar', 'Steady', 'Swift',
  'Tidy', 'Tiny', 'Vivid', 'Warm', 'Wild', 'Witty', 'Young', 'Zesty',
];

const ALIAS_NOUNS = [
  'Comet', 'Cedar', 'Drift', 'Falcon', 'Flare', 'Forest', 'Galaxy', 'Harbor', 'Horizon', 'Lagoon',
  'Maple', 'Meadow', 'Meteor', 'Orbit', 'Pebble', 'Quasar', 'River', 'Rocket', 'Signal', 'Summit',
  'Thistle', 'Voyage', 'Whisper', 'Willow', 'Zenith',
];

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let t = seed + 0x6d2b79f5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateAlias(seedText: string) {
  const seed = hashString(seedText);
  const rand = seededRandom(seed);
  const wordCount = 2 + Math.floor(rand() * 3);
  const words: string[] = [];
  for (let i = 0; i < wordCount - 1; i += 1) {
    words.push(ALIAS_ADJECTIVES[Math.floor(rand() * ALIAS_ADJECTIVES.length)]);
  }
  words.push(ALIAS_NOUNS[Math.floor(rand() * ALIAS_NOUNS.length)]);
  return words.join(' ');
}

export function formatGameSourceLabel(source?: GameSource) {
  if (source === GAME_SOURCES.SMB2) {
    return 'SMB2';
  }
  if (source === GAME_SOURCES.MB2WS) {
    return 'MB2WS';
  }
  return 'SMB1';
}

export function titleCaseLabel(value: string) {
  if (!value) {
    return '';
  }
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatCourseMeta(gameSource: GameSource, course: any) {
  if (!course) {
    return { courseLabel: formatGameSourceLabel(gameSource), stageLabel: '' };
  }
  if (gameSource === GAME_SOURCES.SMB1) {
    const difficulty = titleCaseLabel(course.difficulty ?? 'Beginner');
    const stageIndexRaw = Number(course.stageIndex ?? 0);
    const stageIndex = Number.isFinite(stageIndexRaw) ? stageIndexRaw : 0;
    return { courseLabel: difficulty || 'Beginner', stageLabel: `Stage ${stageIndex + 1}` };
  }
  const mode = course.mode ?? 'story';
  if (mode === 'story') {
    const worldIndexRaw = Number(course.worldIndex ?? 0);
    const stageIndexRaw = Number(course.stageIndex ?? 0);
    const worldIndex = Number.isFinite(worldIndexRaw) ? worldIndexRaw : 0;
    const stageIndex = Number.isFinite(stageIndexRaw) ? stageIndexRaw : 0;
    return { courseLabel: 'Story', stageLabel: `World ${worldIndex + 1}-${stageIndex + 1}` };
  }
  const difficulty = titleCaseLabel(course.difficulty ?? 'Beginner');
  const stageIndexRaw = Number(course.stageIndex ?? 0);
  const stageIndex = Number.isFinite(stageIndexRaw) ? stageIndexRaw : 0;
  const modeLabel = mode === 'challenge' ? 'Challenge' : titleCaseLabel(mode);
  return { courseLabel: `${modeLabel} ${difficulty}`.trim(), stageLabel: `Stage ${stageIndex + 1}` };
}
