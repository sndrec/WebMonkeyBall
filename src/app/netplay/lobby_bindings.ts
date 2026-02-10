type LobbyBindingsOptions = {
  lobbyRefreshButton: HTMLButtonElement | null;
  lobbyCreateButton: HTMLButtonElement | null;
  lobbyJoinButton: HTMLButtonElement | null;
  lobbyLeaveButton: HTMLButtonElement | null;
  lobbyGameModeSelect: HTMLSelectElement | null;
  lobbyMaxPlayersSelect: HTMLSelectElement | null;
  lobbyCollisionToggle: HTMLInputElement | null;
  lobbyLockToggle: HTMLInputElement | null;
  profileNameInput: HTMLInputElement | null;
  profileAvatarInput: HTMLInputElement | null;
  profileAvatarClearButton: HTMLButtonElement | null;
  hidePlayerNamesToggle: HTMLInputElement | null;
  hideLobbyNamesToggle: HTMLInputElement | null;
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
  onLeaveRoom: () => void;
  onApplyLobbyGameModeFromInputs: () => void;
  onApplyLobbySettingsFromInputs: () => void;
  onProfileNameInput: (value: string, input: HTMLInputElement) => void;
  onProfileAvatarChange: (file: File | null) => Promise<void>;
  onProfileAvatarClear: () => void;
  onHidePlayerNamesChange: (checked: boolean) => void;
  onHideLobbyNamesChange: (checked: boolean) => void;
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
  options.lobbyLeaveButton?.addEventListener('click', () => {
    options.onLeaveRoom();
  });
  options.lobbyGameModeSelect?.addEventListener('change', () => {
    options.onApplyLobbyGameModeFromInputs();
  });
  options.lobbyMaxPlayersSelect?.addEventListener('change', () => {
    options.onApplyLobbySettingsFromInputs();
  });
  options.lobbyCollisionToggle?.addEventListener('change', () => {
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
  options.hidePlayerNamesToggle?.addEventListener('change', () => {
    options.onHidePlayerNamesChange(!!options.hidePlayerNamesToggle?.checked);
  });
  options.hideLobbyNamesToggle?.addEventListener('change', () => {
    options.onHideLobbyNamesChange(!!options.hideLobbyNamesToggle?.checked);
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
