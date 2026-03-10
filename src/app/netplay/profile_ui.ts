import type { PlayerProfile } from '../../netcode_protocol.js';
import { BALL_HEMI1_DEFAULT_COLOR, BALL_HEMI2_DEFAULT_COLOR, resolveBallAppearance } from '../../shared/ball_appearance.js';
import { getAvatarValidationPromise } from './profile_utils.js';

type PrivacySettings = {
  hidePlayerNames: boolean;
  hideLobbyNames: boolean;
  hideRemoteBallTextures: boolean;
};

type ProfileUiDeps = {
  profileNameInput: HTMLInputElement | null;
  profileAvatarPreview: HTMLElement | null;
  profileAvatarError: HTMLElement | null;
  profileBallTextureError: HTMLElement | null;
  profileBallHemi1ColorInput: HTMLInputElement | null;
  profileBallHemi2ColorInput: HTMLInputElement | null;
  profilePlayerBillboardTextureInput: HTMLInputElement | null;
  profileBallHemi1TextureClearButton: HTMLButtonElement | null;
  profileBallHemi2TextureClearButton: HTMLButtonElement | null;
  profilePlayerBillboardTextureClearButton: HTMLButtonElement | null;
  profilePlayerBillboardTextureError: HTMLElement | null;
  hidePlayerNamesToggle: HTMLInputElement | null;
  hideLobbyNamesToggle: HTMLInputElement | null;
  hideRemoteBallTexturesToggle: HTMLInputElement | null;
};

export class ProfileUiController {
  private readonly deps: ProfileUiDeps;
  private readonly avatarValidationCache = new Map<string, Promise<boolean>>();

  constructor(deps: ProfileUiDeps) {
    this.deps = deps;
  }

  setAvatarError(message?: string) {
    const { profileAvatarError } = this.deps;
    if (!profileAvatarError) {
      return;
    }
    if (message) {
      profileAvatarError.textContent = message;
      profileAvatarError.classList.remove('hidden');
      profileAvatarError.classList.add('error');
      return;
    }
    profileAvatarError.textContent = '';
    profileAvatarError.classList.add('hidden');
    profileAvatarError.classList.remove('error');
  }

  setBallTextureError(message?: string) {
    const { profileBallTextureError } = this.deps;
    if (!profileBallTextureError) {
      return;
    }
    if (message) {
      profileBallTextureError.textContent = message;
      profileBallTextureError.classList.remove('hidden');
      profileBallTextureError.classList.add('error');
      return;
    }
    profileBallTextureError.textContent = '';
    profileBallTextureError.classList.add('hidden');
    profileBallTextureError.classList.remove('error');
  }

  setPlayerBillboardTextureError(message?: string) {
    const { profilePlayerBillboardTextureError } = this.deps;
    if (!profilePlayerBillboardTextureError) {
      return;
    }
    if (message) {
      profilePlayerBillboardTextureError.textContent = message;
      profilePlayerBillboardTextureError.classList.remove('hidden');
      profilePlayerBillboardTextureError.classList.add('error');
      return;
    }
    profilePlayerBillboardTextureError.textContent = '';
    profilePlayerBillboardTextureError.classList.add('hidden');
    profilePlayerBillboardTextureError.classList.remove('error');
  }

  getAvatarValidationCached(dataUrl: string): Promise<boolean> {
    return getAvatarValidationPromise(this.avatarValidationCache, dataUrl);
  }

  updatePrivacyUi(privacySettings: PrivacySettings) {
    if (this.deps.hidePlayerNamesToggle) {
      this.deps.hidePlayerNamesToggle.checked = privacySettings.hidePlayerNames;
    }
    if (this.deps.hideLobbyNamesToggle) {
      this.deps.hideLobbyNamesToggle.checked = privacySettings.hideLobbyNames;
    }
    if (this.deps.hideRemoteBallTexturesToggle) {
      this.deps.hideRemoteBallTexturesToggle.checked = privacySettings.hideRemoteBallTextures;
    }
  }

  updateProfileUi(localProfile: PlayerProfile) {
    if (this.deps.profileNameInput) {
      const isEditing = document.activeElement === this.deps.profileNameInput;
      if (!isEditing && this.deps.profileNameInput.value !== localProfile.name) {
        this.deps.profileNameInput.value = localProfile.name;
      }
    }
    if (this.deps.profileAvatarPreview) {
      this.deps.profileAvatarPreview.innerHTML = '';
      if (localProfile.avatarData) {
        const img = document.createElement('img');
        img.alt = '';
        img.src = localProfile.avatarData;
        this.deps.profileAvatarPreview.appendChild(img);
      }
    }
    const appearance = resolveBallAppearance(localProfile.ball);
    const hemi1ColorInput = this.deps.profileBallHemi1ColorInput;
    if (hemi1ColorInput) {
      const isEditing = document.activeElement === hemi1ColorInput;
      const value = appearance.hemi1Color || BALL_HEMI1_DEFAULT_COLOR;
      if (!isEditing && hemi1ColorInput.value !== value) {
        hemi1ColorInput.value = value;
      }
    }
    const hemi2ColorInput = this.deps.profileBallHemi2ColorInput;
    if (hemi2ColorInput) {
      const isEditing = document.activeElement === hemi2ColorInput;
      const value = appearance.hemi2Color || BALL_HEMI2_DEFAULT_COLOR;
      if (!isEditing && hemi2ColorInput.value !== value) {
        hemi2ColorInput.value = value;
      }
    }
    if (this.deps.profileBallHemi1TextureClearButton) {
      this.deps.profileBallHemi1TextureClearButton.disabled = !appearance.hemi1Texture;
    }
    if (this.deps.profileBallHemi2TextureClearButton) {
      this.deps.profileBallHemi2TextureClearButton.disabled = !appearance.hemi2Texture;
    }
    if (this.deps.profilePlayerBillboardTextureClearButton) {
      this.deps.profilePlayerBillboardTextureClearButton.disabled = !localProfile.playerBillboardTexture;
    }
  }
}
