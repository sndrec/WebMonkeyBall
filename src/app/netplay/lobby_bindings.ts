type LobbyBindingsOptions = {
  lobbyRefreshButton: HTMLButtonElement | null;
  lobbyCreateButton: HTMLButtonElement | null;
  lobbyJoinButton: HTMLButtonElement | null;
  lobbyCopyCodeButton: HTMLButtonElement | null;
  lobbyLeaveButton: HTMLButtonElement | null;
  lobbyGameModeSelect: HTMLSelectElement | null;
  lobbyGamemodeOptionsRoot: HTMLElement | null;
  lobbyMaxPlayersSelect: HTMLSelectElement | null;
  lobbyCollisionToggle: HTMLInputElement | null;
  lobbyInfiniteTimeToggle: HTMLInputElement | null;
  lobbyLockToggle: HTMLInputElement | null;
  profileNameInput: HTMLInputElement | null;
  profileAvatarInput: HTMLInputElement | null;
  profileAvatarClearButton: HTMLButtonElement | null;
  profileBallHemi1ColorInput: HTMLInputElement | null;
  profileBallHemi2ColorInput: HTMLInputElement | null;
  profileBallHemi1TextureInput: HTMLInputElement | null;
  profileBallHemi2TextureInput: HTMLInputElement | null;
  profileBallHemi1TextureClearButton: HTMLButtonElement | null;
  profileBallHemi2TextureClearButton: HTMLButtonElement | null;
  profilePlayerBillboardTextureInput: HTMLInputElement | null;
  profilePlayerBillboardTextureClearButton: HTMLButtonElement | null;
  hidePlayerNamesToggle: HTMLInputElement | null;
  hideLobbyNamesToggle: HTMLInputElement | null;
  hideRemoteBallTexturesToggle: HTMLInputElement | null;
  lobbyNameInput: HTMLInputElement | null;
  lobbyRoomNameInput: HTMLInputElement | null;
  lobbyChatInput: HTMLInputElement | null;
  lobbyChatSendButton: HTMLButtonElement | null;
  lobbyStageButton: HTMLButtonElement | null;
  lobbyStageChooseButton: HTMLButtonElement | null;
  ingameChatInput: HTMLInputElement | null;
  lobbyStartButton: HTMLButtonElement | null;
  onRefreshLobbyList: () => void;
  onCreateRoom: () => void;
  onJoinRoomByCode: () => void;
  onCopyRoomCode: () => void;
  onLeaveRoom: () => void;
  onApplyLobbyGameModeFromInputs: () => void;
  onApplyLobbySettingsFromInputs: () => void;
  onProfileNameInput: (value: string, input: HTMLInputElement) => void;
  onProfileAvatarChange: (file: File | null) => Promise<void>;
  onProfileAvatarClear: () => void;
  onProfileBallHemi1ColorInput: (value: string, input: HTMLInputElement) => void;
  onProfileBallHemi2ColorInput: (value: string, input: HTMLInputElement) => void;
  onProfileBallHemi1TextureChange: (file: File | null) => Promise<void>;
  onProfileBallHemi2TextureChange: (file: File | null) => Promise<void>;
  onProfilePlayerBillboardTextureChange: (file: File | null) => Promise<void>;
  onProfileBallHemi1TextureClear: () => void;
  onProfileBallHemi2TextureClear: () => void;
  onProfilePlayerBillboardTextureClear: () => void;
  onHidePlayerNamesChange: (checked: boolean) => void;
  onHideLobbyNamesChange: (checked: boolean) => void;
  onHideRemoteBallTexturesChange: (checked: boolean) => void;
  onLobbyNameInput: (value: string, input: HTMLInputElement) => void;
  isHost: () => boolean;
  onLobbyRoomNameInput: (value: string, input: HTMLInputElement) => void;
  onLobbyRoomNameCommit: () => void;
  onSendChatMessage: (value: string) => void;
  onOpenMultiplayerLevelSelect: () => void;
  onApplyLobbyStageSelection: () => void;
  onSetActiveMenuMultiplayer: () => void;
  onSetIngameChatOpen: (open: boolean) => void;
  onStartRequest: () => void;
};

export function bindLobbyEventHandlers(options: LobbyBindingsOptions) {
  options.lobbyRefreshButton?.addEventListener('click', () => {
    options.onRefreshLobbyList();
  });
  options.lobbyCreateButton?.addEventListener('click', () => {
    options.onCreateRoom();
  });
  options.lobbyJoinButton?.addEventListener('click', () => {
    options.onJoinRoomByCode();
  });
  options.lobbyCopyCodeButton?.addEventListener('click', () => {
    options.onCopyRoomCode();
  });
  options.lobbyLeaveButton?.addEventListener('click', () => {
    options.onLeaveRoom();
  });
  options.lobbyGameModeSelect?.addEventListener('change', () => {
    options.onApplyLobbyGameModeFromInputs();
  });
  options.lobbyGamemodeOptionsRoot?.addEventListener('change', () => {
    options.onApplyLobbySettingsFromInputs();
  });
  options.lobbyMaxPlayersSelect?.addEventListener('change', () => {
    options.onApplyLobbySettingsFromInputs();
  });
  options.lobbyCollisionToggle?.addEventListener('change', () => {
    options.onApplyLobbySettingsFromInputs();
  });
  options.lobbyInfiniteTimeToggle?.addEventListener('change', () => {
    options.onApplyLobbySettingsFromInputs();
  });
  options.lobbyLockToggle?.addEventListener('change', () => {
    options.onApplyLobbySettingsFromInputs();
  });

  options.profileNameInput?.addEventListener('input', () => {
    options.onProfileNameInput(options.profileNameInput?.value ?? '', options.profileNameInput!);
  });
  options.profileAvatarInput?.addEventListener('change', async () => {
    const file = options.profileAvatarInput?.files?.[0] ?? null;
    if (options.profileAvatarInput) {
      options.profileAvatarInput.value = '';
    }
    await options.onProfileAvatarChange(file);
  });
  options.profileAvatarClearButton?.addEventListener('click', () => {
    options.onProfileAvatarClear();
  });
  options.profileBallHemi1ColorInput?.addEventListener('input', () => {
    options.onProfileBallHemi1ColorInput(
      options.profileBallHemi1ColorInput?.value ?? '',
      options.profileBallHemi1ColorInput!,
    );
  });
  options.profileBallHemi2ColorInput?.addEventListener('input', () => {
    options.onProfileBallHemi2ColorInput(
      options.profileBallHemi2ColorInput?.value ?? '',
      options.profileBallHemi2ColorInput!,
    );
  });
  options.profileBallHemi1TextureInput?.addEventListener('change', async () => {
    const file = options.profileBallHemi1TextureInput?.files?.[0] ?? null;
    if (options.profileBallHemi1TextureInput) {
      options.profileBallHemi1TextureInput.value = '';
    }
    await options.onProfileBallHemi1TextureChange(file);
  });
  options.profileBallHemi2TextureInput?.addEventListener('change', async () => {
    const file = options.profileBallHemi2TextureInput?.files?.[0] ?? null;
    if (options.profileBallHemi2TextureInput) {
      options.profileBallHemi2TextureInput.value = '';
    }
    await options.onProfileBallHemi2TextureChange(file);
  });
  options.profilePlayerBillboardTextureInput?.addEventListener('change', async () => {
    const file = options.profilePlayerBillboardTextureInput?.files?.[0] ?? null;
    if (options.profilePlayerBillboardTextureInput) {
      options.profilePlayerBillboardTextureInput.value = '';
    }
    await options.onProfilePlayerBillboardTextureChange(file);
  });
  options.profileBallHemi1TextureClearButton?.addEventListener('click', () => {
    options.onProfileBallHemi1TextureClear();
  });
  options.profileBallHemi2TextureClearButton?.addEventListener('click', () => {
    options.onProfileBallHemi2TextureClear();
  });
  options.profilePlayerBillboardTextureClearButton?.addEventListener('click', () => {
    options.onProfilePlayerBillboardTextureClear();
  });
  options.hidePlayerNamesToggle?.addEventListener('change', () => {
    options.onHidePlayerNamesChange(!!options.hidePlayerNamesToggle?.checked);
  });
  options.hideLobbyNamesToggle?.addEventListener('change', () => {
    options.onHideLobbyNamesChange(!!options.hideLobbyNamesToggle?.checked);
  });
  options.hideRemoteBallTexturesToggle?.addEventListener('change', () => {
    options.onHideRemoteBallTexturesChange(!!options.hideRemoteBallTexturesToggle?.checked);
  });

  options.lobbyNameInput?.addEventListener('input', () => {
    options.onLobbyNameInput(options.lobbyNameInput?.value ?? '', options.lobbyNameInput!);
  });

  if (options.lobbyRoomNameInput) {
    options.lobbyRoomNameInput.addEventListener('input', () => {
      if (!options.isHost()) {
        return;
      }
      options.onLobbyRoomNameInput(options.lobbyRoomNameInput?.value ?? '', options.lobbyRoomNameInput!);
    });
    options.lobbyRoomNameInput.addEventListener('blur', () => {
      if (!options.isHost()) {
        return;
      }
      options.onLobbyRoomNameCommit();
    });
    options.lobbyRoomNameInput.addEventListener('keydown', (event) => {
      if (!options.isHost()) {
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        options.lobbyRoomNameInput?.blur();
        options.onLobbyRoomNameCommit();
      }
    });
  }

  options.lobbyChatInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    const value = options.lobbyChatInput?.value ?? '';
    if (options.lobbyChatInput) {
      options.lobbyChatInput.value = '';
    }
    options.onSendChatMessage(value);
  });
  options.lobbyChatSendButton?.addEventListener('click', () => {
    const value = options.lobbyChatInput?.value ?? '';
    if (options.lobbyChatInput) {
      options.lobbyChatInput.value = '';
      options.lobbyChatInput.focus();
    }
    options.onSendChatMessage(value);
  });

  options.lobbyStageButton?.addEventListener('click', () => {
    if (!options.isHost()) {
      return;
    }
    options.onOpenMultiplayerLevelSelect();
  });
  options.lobbyStageChooseButton?.addEventListener('click', () => {
    options.onApplyLobbyStageSelection();
    options.onSetActiveMenuMultiplayer();
  });
  options.ingameChatInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const value = options.ingameChatInput?.value ?? '';
    if (options.ingameChatInput) {
      options.ingameChatInput.value = '';
    }
    options.onSendChatMessage(value);
    options.onSetIngameChatOpen(false);
  });
  options.lobbyStartButton?.addEventListener('click', () => {
    options.onStartRequest();
  });
}
