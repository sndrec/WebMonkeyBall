import { mat4, vec3, vec4 } from 'gl-matrix';
import type { Camera } from '../../noclip/Camera.js';

type NameplateEntry = {
  el: HTMLElement;
  nameEl: HTMLElement;
  avatarEl: HTMLElement;
  lastName: string;
  lastAvatarKey: string;
};

type NameplateDeps = {
  game: any;
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
  getRunning: () => boolean;
  isNetplayEnabled: () => boolean;
  getCamera: () => Camera | null;
  layer: HTMLElement;
  getProfile: (playerId: number) => any;
  getPlayerDisplayName: (playerId: number, profile: any) => string;
  createAvatarElement: (profile: any, seed: number) => HTMLElement;
};

const NAMEPLATE_OFFSET_SCALE = 1.6;
const STAGE_TILT_SCALE = 0.6;
const S16_TO_RAD = 0.00009587379924285257;

export class NameplateController {
  private readonly deps: NameplateDeps;
  private readonly entries = new Map<number, NameplateEntry>();
  private readonly scratch = vec4.create();
  private readonly tiltPivot = vec3.create();
  private readonly viewScratch = mat4.create();
  private readonly clipScratch = mat4.create();

  constructor(deps: NameplateDeps) {
    this.deps = deps;
  }

  hideAll() {
    for (const entry of this.entries.values()) {
      entry.el.classList.remove('visible');
    }
  }

  clear() {
    for (const entry of this.entries.values()) {
      entry.el.remove();
    }
    this.entries.clear();
  }

  private getEntry(playerId: number): NameplateEntry {
    let entry = this.entries.get(playerId);
    if (entry) {
      return entry;
    }
    const profile = this.deps.getProfile(playerId);
    const name = this.deps.getPlayerDisplayName(playerId, profile);
    const avatarKey = profile.avatarData ?? 'default';
    const el = document.createElement('div');
    el.className = 'nameplate';
    const avatar = this.deps.createAvatarElement(profile, playerId);
    const nameEl = document.createElement('div');
    nameEl.className = 'nameplate-name';
    nameEl.textContent = name;
    el.append(avatar, nameEl);
    this.deps.layer.appendChild(el);
    entry = { el, nameEl, avatarEl: avatar, lastName: name, lastAvatarKey: avatarKey };
    this.entries.set(playerId, entry);
    return entry;
  }

  private updateEntryContent(entry: NameplateEntry, playerId: number) {
    const profile = this.deps.getProfile(playerId);
    const name = this.deps.getPlayerDisplayName(playerId, profile);
    if (entry.lastName !== name) {
      entry.lastName = name;
      entry.nameEl.textContent = name;
    }
    const avatarKey = profile.avatarData ?? 'default';
    if (entry.lastAvatarKey !== avatarKey) {
      entry.lastAvatarKey = avatarKey;
      const avatar = this.deps.createAvatarElement(profile, playerId);
      entry.avatarEl.replaceWith(avatar);
      entry.avatarEl = avatar;
    }
  }

  private project(
    pos: { x: number; y: number; z: number },
    rect: DOMRect,
    clipFromWorld: mat4,
    offsetY = 0,
  ): { x: number; y: number } | null {
    this.scratch[0] = pos.x;
    this.scratch[1] = pos.y + offsetY;
    this.scratch[2] = pos.z;
    this.scratch[3] = 1;
    vec4.transformMat4(this.scratch, this.scratch, clipFromWorld);
    const w = this.scratch[3];
    if (w <= 0.0001) {
      return null;
    }
    const ndcX = this.scratch[0] / w;
    const ndcY = this.scratch[1] / w;
    if (ndcX < -1.05 || ndcX > 1.05 || ndcY < -1.05 || ndcY > 1.05) {
      return null;
    }
    const screenX = rect.left + (ndcX * 0.5 + 0.5) * rect.width;
    const screenY = rect.top + (1 - (ndcY * 0.5 + 0.5)) * rect.height;
    return { x: screenX, y: screenY };
  }

  update(interpolationAlpha: number) {
    const overlayVisible = !this.deps.overlay.classList.contains('hidden');
    if (!this.deps.isNetplayEnabled() || !this.deps.getRunning() || overlayVisible) {
      this.hideAll();
      return;
    }
    const localPlayer = this.deps.game.getLocalPlayer();
    const localId = this.deps.game.localPlayerId;
    const spectator = localPlayer?.isSpectator ?? false;
    const ballStates = this.deps.game.getBallRenderStates(interpolationAlpha);
    if (!ballStates) {
      return;
    }
    const rect = this.deps.canvas.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const camera = this.deps.getCamera();
    let clipFromWorld = camera?.clipFromWorldMatrix ?? null;
    const tilt = this.deps.game.getStageTiltRenderState(interpolationAlpha);
    if (camera && tilt) {
      const rotX = tilt.xrot * STAGE_TILT_SCALE * S16_TO_RAD;
      const rotZ = tilt.zrot * STAGE_TILT_SCALE * S16_TO_RAD;
      if (rotX !== 0 || rotZ !== 0) {
        const pivot = ballStates.find((state: any) => state.visible) ?? ballStates[0] ?? null;
        if (pivot) {
          vec3.set(this.tiltPivot, pivot.pos.x, pivot.pos.y, pivot.pos.z);
          mat4.copy(this.viewScratch, camera.viewMatrix);
          mat4.translate(this.viewScratch, this.viewScratch, this.tiltPivot);
          mat4.rotateX(this.viewScratch, this.viewScratch, rotX);
          mat4.rotateZ(this.viewScratch, this.viewScratch, rotZ);
          vec3.negate(this.tiltPivot, this.tiltPivot);
          mat4.translate(this.viewScratch, this.viewScratch, this.tiltPivot);
          mat4.mul(this.clipScratch, camera.projectionMatrix, this.viewScratch);
          clipFromWorld = this.clipScratch;
        }
      }
    }
    if (!clipFromWorld) {
      return;
    }
    let closestId: number | null = null;
    let closestDist = Infinity;
    const activeIds = new Set<number>();
    const positions = new Map<number, { x: number; y: number }>();
    for (let i = 0; i < this.deps.game.players.length; i += 1) {
      const player = this.deps.game.players[i];
      if (player.id === localId) {
        continue;
      }
      activeIds.add(player.id);
      const renderState = ballStates[i];
      if (!renderState?.visible) {
        continue;
      }
      const screen = this.project(
        renderState.pos,
        rect,
        clipFromWorld,
        renderState.radius * NAMEPLATE_OFFSET_SCALE,
      );
      if (!screen) {
        continue;
      }
      positions.set(player.id, screen);
      if (!spectator) {
        const dx = screen.x - centerX;
        const dy = screen.y - centerY;
        const dist = (dx * dx) + (dy * dy);
        if (dist < closestDist) {
          closestDist = dist;
          closestId = player.id;
        }
      }
    }

    for (const [playerId, entry] of this.entries.entries()) {
      if (!activeIds.has(playerId)) {
        entry.el.remove();
        this.entries.delete(playerId);
      }
    }

    for (const playerId of activeIds) {
      const entry = this.getEntry(playerId);
      const pos = positions.get(playerId) ?? null;
      const shouldShow = !!pos && (spectator || playerId === closestId);
      entry.el.classList.toggle('visible', shouldShow);
      if (pos) {
        this.updateEntryContent(entry, playerId);
        entry.el.style.left = `${pos.x}px`;
        entry.el.style.top = `${pos.y}px`;
      }
    }
  }
}
