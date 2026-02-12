import type { PlayerProfile } from '../../netcode_protocol.js';
import { getAvatarValidationPromise } from './profile_utils.js';

type PrivacySettings = {
  hidePlayerNames: boolean;
  hideLobbyNames: boolean;
};

type ProfileUiDeps = {
  profileNameInput: HTMLInputElement | null;
  profileAvatarPreview: HTMLElement | null;
  profileAvatarError: HTMLElement | null;
  hidePlayerNamesToggle: HTMLInputElement | null;
  hideLobbyNamesToggle: HTMLInputElement | null;
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
  }
}
