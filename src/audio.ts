import { COLI_FLAGS, GAME_SOURCES, type GameSource } from './constants.js';
import { getMb2wsStageInfo, getSmb2StageInfo } from './smb2_render.js';
import { STAGE_INFO_MAP } from './noclip/SuperMonkeyBall/StageInfo.js';

const AUDIO_BASE_PATH = './audio';
const SFX_DIR = 'sfx';
const MUSIC_DIR_BY_SOURCE: Record<GameSource, string> = {
  [GAME_SOURCES.SMB1]: 'smb1-music-compressed',
  [GAME_SOURCES.SMB2]: 'smb2-music-compressed',
  [GAME_SOURCES.MB2WS]: 'smb2-music-compressed',
};
const ROLLING_SFX_NAME = 'ball_roll';
const SMB2_SPEED_MPH_SCALE = 134.21985;
const GOAL_SFX_NAME = 'goal_enter';
const GOAL_ANNOUNCER_NAME = 'an_goal';
const READY_ANNOUNCER_NAME = 'an_ready';
const GO_ANNOUNCER_NAMES = ['an_go_1', 'an_go_2'];
const PERFECT_ANNOUNCER_NAME = 'an_perfect';
const BONUS_FINISH_ANNOUNCER_NAME = 'an_bonus_finish';
const HURRY_UP_ANNOUNCER_NAME = 'an_hurryup';
const TIME_OVER_ANNOUNCER_NAME = 'an_timeover';
const BANANA_SFX_NAME = 'banana_collect';
const BANANA_BUNCH_SFX_NAME = 'banana_bunch_collect';
const FALLOUT_SFX_NAME = 'fallout';

const SMB1_BG_MUSIC: Record<string, string> = {
  bg_jun: 'jungle',
  bg_sun: 'sky',
  bg_bns: 'bonus',
  bg_nig: 'mall',
  bg_wat: 'water',
  bg_snd: 'desert',
  bg_ice: 'arctic',
  bg_stm: 'storm',
  bg_spa: 'extra',
  bg_mst: 'master',
  bg_ending: 'ending',
};

const SMB2_BG_MUSIC: Record<string, string> = {
  bg_jun2: 'jungle',
  bg_lav2: 'volcano',
  bg_wat2: 'ocean',
  bg_wha2: 'whale',
  bg_par2: 'amusement_park',
  bg_pot2: 'pot',
  bg_bub2: 'washingmachine',
  bg_gea2: 'clocktower',
  bg_spa2: 'colony',
  bg_ele2: 'badboon',
  bg_bns2: 'bonus',
};



type MusicTrackInfo = { hasIntro: boolean };

const SMB1_TRACK_INFO: Record<string, MusicTrackInfo> = {
  amusement_park: { hasIntro: false },
  arctic: { hasIntro: false },
  badboon: { hasIntro: true },
  bonus: { hasIntro: true },
  desert: { hasIntro: true },
  ending: { hasIntro: true },
  extra: { hasIntro: true },
  jungle: { hasIntro: false },
  mall: { hasIntro: true },
  master: { hasIntro: true },
  sky: { hasIntro: true },
  storm: { hasIntro: true },
  water: { hasIntro: true },
};

const SMB2_TRACK_INFO: Record<string, MusicTrackInfo> = {
  amusement_park: { hasIntro: false },
  badboon: { hasIntro: true },
  bonus: { hasIntro: true },
  clocktower: { hasIntro: false },
  colony: { hasIntro: true },
  jungle: { hasIntro: true }, // SMB2 jungle has an intro; SMB1 jungle does not.
  ocean: { hasIntro: true },
  pot: { hasIntro: true },
  volcano: { hasIntro: true },
  washingmachine: { hasIntro: true },
  whale: { hasIntro: false },
};

const MUSIC_TRACK_INFO: Partial<Record<GameSource, Record<string, MusicTrackInfo>>> = {
  [GAME_SOURCES.SMB1]: SMB1_TRACK_INFO,
  [GAME_SOURCES.SMB2]: SMB2_TRACK_INFO,
  [GAME_SOURCES.MB2WS]: SMB2_TRACK_INFO,
};

type RollingState = {
  source: AudioBufferSourceNode | null;
  gain: GainNode;
  rate: number;
  volume: number;
  creating: boolean;
};

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private announcerGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private bufferCache = new Map<string, Promise<AudioBuffer>>();
  private rolling = new Map<number, RollingState>();
  private musicIntroSource: AudioBufferSourceNode | null = null;
  private musicLoopSource: AudioBufferSourceNode | null = null;
  private currentMusicKey: string | null = null;
  private musicToken = 0;
  private musicVolume = 0.5;
  private sfxVolume = 0.3;
  private announcerVolume = 0.3;

  async resume() {
    const ctx = await this.ensureContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }

  async playSfx(sfx: number | string, gameSource: GameSource, volume = 1, rate = 1, delaySeconds = 0) {
    const url =
      typeof sfx === 'number' ? this.resolveSfxUrl(sfx, gameSource) : this.resolveNamedSfxUrl(sfx);
    if (!url) {
      return;
    }
    const ctx = await this.ensureContext();
    const buffer = await this.getBuffer(url);
    if (!buffer) {
      return;
    }
    this.playBuffer(buffer, this.sfxGain ?? ctx.destination, volume, rate, delaySeconds);
  }

  async playGoal(gameSource: GameSource) {
    await this.playSfx(GOAL_SFX_NAME, gameSource, 0.9);
  }

  async playAnnouncerGoal(delaySeconds = 1) {
    await this.playAnnouncer(GOAL_ANNOUNCER_NAME, 0.9, delaySeconds);
  }

  async playAnnouncerReady() {
    await this.playAnnouncer(READY_ANNOUNCER_NAME, 0.9);
  }

  async playAnnouncerGo() {
    const name = GO_ANNOUNCER_NAMES[Math.floor(Math.random() * GO_ANNOUNCER_NAMES.length)];
    await this.playAnnouncer(name, 0.9);
  }

  async playAnnouncerPerfect() {
    await this.playAnnouncer(PERFECT_ANNOUNCER_NAME, 0.9);
  }

  async playAnnouncerBonusFinish() {
    await this.playAnnouncer(BONUS_FINISH_ANNOUNCER_NAME, 0.9);
  }

  async playAnnouncerHurryUp() {
    await this.playAnnouncer(HURRY_UP_ANNOUNCER_NAME, 0.9);
  }

  async playAnnouncerTimeOver() {
    await this.playAnnouncer(TIME_OVER_ANNOUNCER_NAME, 0.9);
  }

  async playAnnouncerCount(count: number) {
    const clamped = Math.max(0, Math.min(10, Math.trunc(count)));
    await this.playAnnouncer(`an_count_${clamped}`, 0.9);
  }

  async playBananaCollect(isBunch: boolean) {
    const name = isBunch ? BANANA_BUNCH_SFX_NAME : BANANA_SFX_NAME;
    await this.playSfx(name, GAME_SOURCES.SMB1, 0.85);
  }

  async playFallout(gameSource: GameSource) {
    await this.playSfx(FALLOUT_SFX_NAME, gameSource, 0.9);
  }

  async playBumper(gameSource: GameSource) {
    await this.playSfx('bumper_hit', gameSource, 0.9);
  }

  async playAnnouncerTimeBonus(gameSource: GameSource, isHigh: boolean) {
    void gameSource;
    void isHigh;
  }

  async playMusicForStage(stageId: number, gameSource: GameSource) {
    const bgFile = this.getBgFileName(stageId, gameSource);
    if (!bgFile) {
      return;
    }
    const track = this.getMusicTrackPrefix(bgFile, gameSource);
    if (!track) {
      return;
    }
    const ctx = await this.ensureContext();
    const musicKey = `${gameSource}:${track}`;
    if (this.currentMusicKey === musicKey) {
      return;
    }
    this.stopMusic();
    const token = ++this.musicToken;
    const { introUrl, loopUrl, oneshotUrl } = this.resolveMusicUrls(track, gameSource);
    const loopBuffer = loopUrl ? await this.getBuffer(loopUrl) : null;
    const introBuffer = introUrl ? await this.getBuffer(introUrl) : null;
    const oneshotBuffer = loopBuffer ? null : oneshotUrl ? await this.getBuffer(oneshotUrl) : null;
    if (token !== this.musicToken) {
      return;
    }
    if (loopBuffer) {
      const startTime = ctx.currentTime + 0.01;
      if (introBuffer) {
        const introSource = ctx.createBufferSource();
        introSource.buffer = introBuffer;
        introSource.connect(this.musicGain ?? ctx.destination);
        introSource.start(startTime);
        this.musicIntroSource = introSource;

        const loopSource = ctx.createBufferSource();
        loopSource.buffer = loopBuffer;
        loopSource.loop = true;
        loopSource.connect(this.musicGain ?? ctx.destination);
        loopSource.start(startTime + introBuffer.duration);
        this.musicLoopSource = loopSource;
      } else {
        const loopSource = ctx.createBufferSource();
        loopSource.buffer = loopBuffer;
        loopSource.loop = true;
        loopSource.connect(this.musicGain ?? ctx.destination);
        loopSource.start(startTime);
        this.musicLoopSource = loopSource;
      }
      this.currentMusicKey = musicKey;
      return;
    }
    if (oneshotBuffer) {
      const source = ctx.createBufferSource();
      source.buffer = oneshotBuffer;
      source.connect(this.musicGain ?? ctx.destination);
      source.start();
      this.musicLoopSource = source;
      this.currentMusicKey = musicKey;
    }
  }

  stopMusic() {
    if (this.musicIntroSource) {
      this.musicIntroSource.stop();
      this.musicIntroSource.disconnect();
      this.musicIntroSource = null;
    }
    if (this.musicLoopSource) {
      this.musicLoopSource.stop();
      this.musicLoopSource.disconnect();
      this.musicLoopSource = null;
    }
    this.currentMusicKey = null;
    this.musicToken += 1;
  }

  async updateRollingSound(ball, gameSource: GameSource, frameCount: number) {
    if (!ball?.physBall) {
      return;
    }
    if ((frameCount & 7) !== 0 && ball.audio?.rollingVol !== 0) {
      return;
    }
    const onGround = (ball.audio?.lastColiFlags & COLI_FLAGS.OCCURRED) !== 0;
    const speedScaled = ball.speed * 216.0;
    let vol = 0;
    let pitch = 0;
    let rate = 1;
    if (onGround && speedScaled > 10.0) {
      vol = Math.min((speedScaled - 10.0) * 1.5, 100.0);
      pitch = Math.min((speedScaled - 10.0) * 15.0, 80.0) * 0.85;
      const speedMph = ball.speed * SMB2_SPEED_MPH_SCALE;
      const pitchFactor = Math.min(Math.max((speedMph - 10) / 60, 0), 1);
      rate = 0.65 + pitchFactor * 1.25;
    }
    ball.audio.rollingVol = vol;
    ball.audio.rollingPitch = pitch;
    await this.setRollingLoop(ball.playerId ?? 0, gameSource, vol, rate);
  }

  async playImpactForBall(ball, gameSource: GameSource, frameCount: number) {
    if (!ball?.physBall || !ball.audio) {
      return;
    }
    const onGround = (ball.audio?.lastColiFlags & COLI_FLAGS.OCCURRED) !== 0;
    if (!onGround) {
      return;
    }
    const impact = Math.max(0, -ball.audio.lastColiSpeed);
    if (impact <= 0.05 || frameCount - ball.audio.lastImpactFrame < 6) {
      return;
    }
    ball.audio.lastImpactFrame = frameCount;
    let sfxName = '';
    if (impact > 0.18699999898672104) {
      sfxName = 'ball_hit_hard';
    } else if (impact > 0.14299999922513962) {
      sfxName = 'ball_hit_med';
    } else if (impact > 0.0989999994635582) {
      sfxName = 'ball_hit_soft';
    }
    if (sfxName) {
      await this.playSfx(sfxName, gameSource, 0.9);
    }
  }

  async consumeBallEvents(ball, gameSource: GameSource) {
    if (!ball?.audio) {
      return;
    }
    if (ball.audio.bumperHit) {
      ball.audio.bumperHit = false;
      await this.playBumper(gameSource);
    }
  }

  private async setRollingLoop(playerId: number, gameSource: GameSource, vol: number, rate: number) {
    const ctx = await this.ensureContext();
    let rolling = this.rolling.get(playerId);
    if (!rolling) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.sfxGain ?? ctx.destination);
      rolling = { source: null, gain, rate: 1, volume: 0, creating: false };
      this.rolling.set(playerId, rolling);
    }
    if (vol <= 0) {
      if (rolling.source) {
        rolling.source.stop();
        rolling.source.disconnect();
        rolling.source = null;
      }
      rolling.gain.gain.value = 0;
      rolling.volume = 0;
      return;
    }
    const targetVolume = Math.min(vol / 127, 1);
    const targetRate = rate;
    rolling.volume = targetVolume;
    rolling.rate = targetRate;
    if (!rolling.source) {
      if (rolling.creating) {
        return;
      }
      rolling.creating = true;
      const url = this.resolveNamedSfxUrl(ROLLING_SFX_NAME);
      const buffer = url ? await this.getBuffer(url) : null;
      rolling.creating = false;
      if (!buffer) {
        return;
      }
      if (rolling.source || rolling.volume <= 0) {
        return;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(rolling.gain);
      source.start();
      rolling.source = source;
    }
    rolling.gain.gain.value = rolling.volume;
    if (rolling.source) {
      rolling.source.playbackRate.value = rolling.rate;
    }
  }

  private async ensureContext() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.announcerGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.9;
      this.sfxGain.gain.value = this.sfxVolume;
      this.announcerGain.gain.value = this.announcerVolume;
      this.musicGain.gain.value = this.musicVolume;
      this.sfxGain.connect(this.masterGain);
      this.announcerGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  setMusicVolume(value: number) {
    this.musicVolume = this.clampVolume(value);
    if (this.musicGain) {
      this.musicGain.gain.value = this.musicVolume;
    }
  }

  setSfxVolume(value: number) {
    this.sfxVolume = this.clampVolume(value);
    if (this.sfxGain) {
      this.sfxGain.gain.value = this.sfxVolume;
    }
  }

  setAnnouncerVolume(value: number) {
    this.announcerVolume = this.clampVolume(value);
    if (this.announcerGain) {
      this.announcerGain.gain.value = this.announcerVolume;
    }
  }

  private async getBuffer(url: string) {
    if (!this.bufferCache.has(url)) {
      this.bufferCache.set(
        url,
        fetch(url)
          .then((res) => (res.ok ? res.arrayBuffer() : null))
          .then((buf) => (buf ? this.ensureContext().then((ctx) => ctx.decodeAudioData(buf)) : null)),
      );
    }
    return this.bufferCache.get(url) ?? null;
  }

  private resolveSfxUrl(id: number, gameSource: GameSource) {
    const hex = `0x${id.toString(16).toUpperCase().padStart(4, '0')}`;
    return `${AUDIO_BASE_PATH}/${SFX_DIR}/${hex}.wav`;
  }

  private resolveNamedSfxUrl(name: string) {
    return `${AUDIO_BASE_PATH}/${SFX_DIR}/${name}.wav`;
  }

  private resolveBgmUrl(track: string, suffix: string, gameSource: GameSource) {
    const folder = MUSIC_DIR_BY_SOURCE[gameSource] ?? MUSIC_DIR_BY_SOURCE[GAME_SOURCES.SMB1];
    return `${AUDIO_BASE_PATH}/${folder}/${track}${suffix}.ogg`;
  }

  private resolveMusicUrls(track: string, gameSource: GameSource) {
  const info = MUSIC_TRACK_INFO[gameSource]?.[track];
  if (!info) {
    console.warn(`Missing MUSIC_TRACK_INFO for ${gameSource}:${track} (assuming no intro)`);
  }
  const hasIntro = info?.hasIntro ?? false;
  return {
    introUrl: hasIntro ? this.resolveBgmUrl(track, '_intro', gameSource) : null,
    loopUrl: this.resolveBgmUrl(track, '_loop', gameSource),
    oneshotUrl: this.resolveBgmUrl(track, '', gameSource),
  };
}

  private getMusicTrackPrefix(bgFile: string, gameSource: GameSource) {
    if (gameSource === GAME_SOURCES.SMB2 || gameSource === GAME_SOURCES.MB2WS) {
      return SMB2_BG_MUSIC[bgFile] ?? null;
    }
    return SMB1_BG_MUSIC[bgFile] ?? null;
  }

  private async playAnnouncer(name: string, volume = 1, delaySeconds = 0) {
    const url = this.resolveNamedSfxUrl(name);
    if (!url) {
      return;
    }
    const ctx = await this.ensureContext();
    const buffer = await this.getBuffer(url);
    if (!buffer) {
      return;
    }
    this.playBuffer(buffer, this.announcerGain ?? ctx.destination, volume, 1, delaySeconds);
  }

  private playBuffer(
    buffer: AudioBuffer,
    destination: AudioNode,
    volume: number,
    rate: number,
    delaySeconds: number,
  ) {
    if (!this.ctx) {
      return;
    }
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(destination);
    const startTime = this.ctx.currentTime + Math.max(0, delaySeconds);
    source.start(startTime);
  }

  private clampVolume(value: number) {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(1, value));
  }

  private getBgFileName(stageId: number, gameSource: GameSource) {
    if (gameSource === GAME_SOURCES.SMB2) {
      return getSmb2StageInfo(stageId)?.bgInfo?.fileName ?? null;
    }
    if (gameSource === GAME_SOURCES.MB2WS) {
      return getMb2wsStageInfo(stageId)?.bgInfo?.fileName ?? null;
    }
    return STAGE_INFO_MAP.get(stageId as any)?.bgInfo?.fileName ?? null;
  }
}
