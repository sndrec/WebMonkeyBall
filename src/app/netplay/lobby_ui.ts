import type { Game, MultiplayerGameMode } from '../../game.js';
import type { PlayerProfile, RoomInfo, RoomMeta } from '../../netcode_protocol.js';

type LobbyUiDeps = {
  game: Game;
  netplayEnabled: () => boolean;
  netplayRole: () => 'host' | 'client' | null;
  netplayHasCurrentCourse: () => boolean;
  lobbyRoom: () => RoomInfo | null;
  setLobbyRoomMeta: (meta: RoomMeta) => void;
  lobbyProfiles: Map<number, PlayerProfile>;
  multiplayerBrowser: HTMLElement | null;
  multiplayerLobby: HTMLElement | null;
  multiplayerBackButton: HTMLButtonElement | null;
  lobbyLeaveButton: HTMLButtonElement | null;
  lobbyPlayerList: HTMLElement | null;
  ingamePlayerList: HTMLElement | null;
  lobbyRoomInfo: HTMLElement | null;
  lobbyRoomStatus: HTMLElement | null;
  lobbyRoomNameInput: HTMLInputElement | null;
  lobbyGameModeSelect: HTMLSelectElement | null;
  lobbyMaxPlayersSelect: HTMLSelectElement | null;
  lobbyCollisionToggle: HTMLInputElement | null;
  lobbyLockToggle: HTMLInputElement | null;
  lobbyChatPanel: HTMLElement | null;
  lobbyStartButton: HTMLButtonElement | null;
  levelSelectOpenButton: HTMLButtonElement | null;
  lobbyStageInfo: HTMLElement | null;
  lobbyStageButton: HTMLButtonElement | null;
  lobbyStageActions: HTMLElement | null;
  lobbyStageChooseButton: HTMLButtonElement | null;
  modeStandard: MultiplayerGameMode;
  modeChained: MultiplayerGameMode;
  chainedMaxPlayers: number;
  getLobbyRoomGameMode: () => MultiplayerGameMode;
  formatRoomInfoLabel: (room: RoomInfo) => string;
  formatMultiplayerGameModeLabel: (mode: MultiplayerGameMode) => string;
  formatGameSourceLabel: (source: unknown) => string;
  getPlayerDisplayName: (playerId: number, profile: PlayerProfile) => string;
  profileFallbackForPlayer: (playerId: number) => PlayerProfile;
  createAvatarElement: (profile: PlayerProfile, seed: number) => HTMLElement;
  buildRoomMeta: () => RoomMeta | null;
  updateProfileUi: () => void;
  updateChatUi: () => void;
  kickPlayerFromRoom: (playerId: number) => void;
};

export class LobbyUiController {
  private readonly deps: LobbyUiDeps;

  constructor(deps: LobbyUiDeps) {
    this.deps = deps;
  }

  private getActiveLobbyPlayerCount() {
    return this.deps.game.players.filter((player) => !player.isSpectator && !player.pendingSpawn).length;
  }

  getLobbyStartDisabledReason(isHost: boolean, mode: MultiplayerGameMode) {
    if (!isHost) {
      return 'Waiting for host...';
    }
    if (mode !== this.deps.modeChained) {
      return '';
    }
    const activePlayers = this.getActiveLobbyPlayerCount();
    if (activePlayers < 2) {
      return 'Need at least 2 active players';
    }
    if (activePlayers > this.deps.chainedMaxPlayers) {
      return 'Chained Together supports up to 4 players';
    }
    return '';
  }

  updateLevelSelectUi() {
    const showLobbyStage = !!(this.deps.netplayEnabled() && this.deps.lobbyRoom() && this.deps.netplayRole() === 'host');
    if (this.deps.lobbyStageActions) {
      this.deps.lobbyStageActions.classList.toggle('hidden', !showLobbyStage);
    }
    if (this.deps.lobbyStageChooseButton) {
      this.deps.lobbyStageChooseButton.disabled = !showLobbyStage;
    }
  }

  private renderLobbyPlayerList(target: HTMLElement | null, isHost: boolean) {
    if (!target) {
      return;
    }
    target.innerHTML = '';
    const lobbyRoom = this.deps.lobbyRoom();
    if (!lobbyRoom) {
      return;
    }
    for (const player of this.deps.game.players) {
      const profile = this.deps.lobbyProfiles.get(player.id) ?? this.deps.profileFallbackForPlayer(player.id);
      const row = document.createElement('div');
      row.className = 'lobby-player';
      const avatar = this.deps.createAvatarElement(profile, player.id);
      avatar.setAttribute('aria-hidden', 'true');
      const info = document.createElement('div');
      info.className = 'lobby-player-info';
      const name = document.createElement('div');
      name.className = 'lobby-player-name';
      name.textContent = this.deps.getPlayerDisplayName(player.id, profile);
      const tags = document.createElement('span');
      tags.className = 'lobby-player-tags';
      const tagParts: string[] = [];
      if (player.id === lobbyRoom.hostId) {
        tagParts.push('Host');
      }
      if (player.id === this.deps.game.localPlayerId) {
        tagParts.push('You');
      }
      if (tagParts.length > 0) {
        tags.textContent = ` (${tagParts.join(', ')})`;
        name.appendChild(tags);
      }
      const sub = document.createElement('div');
      sub.className = 'lobby-player-sub';
      sub.textContent = `ID ${player.id}`;
      info.append(name, sub);
      row.append(avatar, info);
      if (isHost && player.id !== lobbyRoom.hostId) {
        const kickButton = document.createElement('button');
        kickButton.type = 'button';
        kickButton.className = 'ghost kick-button';
        kickButton.textContent = 'Kick';
        kickButton.addEventListener('click', () => {
          void this.deps.kickPlayerFromRoom(player.id);
        });
        row.append(kickButton);
      }
      target.appendChild(row);
    }
  }

  updateLobbyUi() {
    const lobbyRoom = this.deps.lobbyRoom();
    const inLobby = !!(this.deps.netplayEnabled() && lobbyRoom);
    this.deps.multiplayerBrowser?.classList.toggle('hidden', inLobby);
    this.deps.multiplayerLobby?.classList.toggle('hidden', !inLobby);
    this.deps.multiplayerBackButton?.classList.toggle('hidden', inLobby);

    if (!this.deps.lobbyLeaveButton) {
      return;
    }
    if (!inLobby || !lobbyRoom) {
      this.deps.lobbyLeaveButton.classList.add('hidden');
      if (this.deps.lobbyPlayerList) {
        this.deps.lobbyPlayerList.innerHTML = '';
      }
      if (this.deps.ingamePlayerList) {
        this.deps.ingamePlayerList.innerHTML = '';
      }
      if (this.deps.lobbyRoomInfo) {
        this.deps.lobbyRoomInfo.textContent = '';
      }
      if (this.deps.lobbyRoomStatus) {
        this.deps.lobbyRoomStatus.textContent = '';
      }
      if (this.deps.lobbyRoomNameInput) {
        this.deps.lobbyRoomNameInput.value = '';
        this.deps.lobbyRoomNameInput.disabled = true;
      }
      if (this.deps.lobbyGameModeSelect) {
        this.deps.lobbyGameModeSelect.value = this.deps.modeStandard;
        this.deps.lobbyGameModeSelect.disabled = true;
      }
      if (this.deps.lobbyLockToggle) {
        this.deps.lobbyLockToggle.checked = false;
        this.deps.lobbyLockToggle.disabled = true;
      }
      if (this.deps.lobbyChatPanel) {
        this.deps.lobbyChatPanel.classList.add('hidden');
      }
      if (this.deps.lobbyStartButton) {
        this.deps.lobbyStartButton.classList.add('hidden');
        this.deps.lobbyStartButton.disabled = true;
        this.deps.lobbyStartButton.textContent = 'Start Match';
      }
      if (this.deps.levelSelectOpenButton) {
        this.deps.levelSelectOpenButton.disabled = false;
      }
      this.updateLevelSelectUi();
      return;
    }

    this.deps.lobbyLeaveButton.classList.remove('hidden');
    const roomLabel = this.deps.formatRoomInfoLabel(lobbyRoom);
    const statusLabel = lobbyRoom.meta?.status === 'in_game' ? 'In Game' : 'Waiting';
    const playerCount = this.deps.game.players.length;
    const maxPlayers = lobbyRoom.settings?.maxPlayers ?? this.deps.game.maxPlayers;
    const isHost = this.deps.netplayRole() === 'host';
    const gameMode = this.deps.getLobbyRoomGameMode();
    this.deps.game.setMultiplayerGameMode(gameMode);
    if (this.deps.lobbyRoomInfo) {
      this.deps.lobbyRoomInfo.textContent = roomLabel;
    }
    if (this.deps.lobbyRoomNameInput) {
      const desiredName = lobbyRoom.meta?.roomName ?? '';
      const isEditing = document.activeElement === this.deps.lobbyRoomNameInput;
      if (!isEditing && this.deps.lobbyRoomNameInput.value !== desiredName) {
        this.deps.lobbyRoomNameInput.value = desiredName;
      }
      this.deps.lobbyRoomNameInput.disabled = !isHost;
    }
    if (this.deps.lobbyRoomStatus) {
      this.deps.lobbyRoomStatus.textContent = `${statusLabel} • ${playerCount}/${maxPlayers} players • ${this.deps.formatMultiplayerGameModeLabel(gameMode)}`;
    }

    const inMatch = lobbyRoom.meta?.status === 'in_game' || this.deps.netplayHasCurrentCourse();
    if (this.deps.lobbyChatPanel) {
      this.deps.lobbyChatPanel.classList.toggle('hidden', inMatch);
    }

    this.renderLobbyPlayerList(this.deps.lobbyPlayerList, isHost);
    this.renderLobbyPlayerList(this.deps.ingamePlayerList, isHost);

    const meta = lobbyRoom.meta ?? this.deps.buildRoomMeta();
    if (meta && !lobbyRoom.meta) {
      this.deps.setLobbyRoomMeta(meta);
    }
    if (this.deps.lobbyStageInfo) {
      if (meta) {
        const sourceLabel = this.deps.formatGameSourceLabel(meta.gameSource);
        const courseLabel = meta.courseLabel ?? 'Unknown';
        const stageLabel = meta.stageLabel ? ` • ${meta.stageLabel}` : '';
        this.deps.lobbyStageInfo.textContent = `${sourceLabel} • ${courseLabel}${stageLabel} • ${this.deps.formatMultiplayerGameModeLabel(gameMode)}`;
      } else {
        this.deps.lobbyStageInfo.textContent = 'Unknown';
      }
    }

    if (this.deps.lobbyGameModeSelect) {
      this.deps.lobbyGameModeSelect.value = gameMode;
      this.deps.lobbyGameModeSelect.disabled = !isHost;
    }
    if (this.deps.lobbyMaxPlayersSelect) {
      this.deps.lobbyMaxPlayersSelect.value = String(maxPlayers);
      for (const option of Array.from(this.deps.lobbyMaxPlayersSelect.options)) {
        const value = Number(option.value);
        option.disabled = gameMode === this.deps.modeChained
          && Number.isFinite(value)
          && value > this.deps.chainedMaxPlayers;
      }
    }
    if (this.deps.lobbyCollisionToggle) {
      this.deps.lobbyCollisionToggle.checked = !!(lobbyRoom.settings?.collisionEnabled ?? true);
    }
    if (this.deps.lobbyLockToggle) {
      this.deps.lobbyLockToggle.checked = !!(lobbyRoom.settings?.locked ?? false);
    }
    if (this.deps.lobbyMaxPlayersSelect) {
      this.deps.lobbyMaxPlayersSelect.disabled = !isHost;
    }
    if (this.deps.lobbyCollisionToggle) {
      this.deps.lobbyCollisionToggle.disabled = !isHost;
    }
    if (this.deps.lobbyLockToggle) {
      this.deps.lobbyLockToggle.disabled = !isHost;
    }
    if (this.deps.lobbyStageButton) {
      this.deps.lobbyStageButton.disabled = !isHost;
    }
    if (this.deps.lobbyStartButton) {
      const startBlockedReason = this.getLobbyStartDisabledReason(!!isHost, gameMode);
      this.deps.lobbyStartButton.classList.remove('hidden');
      this.deps.lobbyStartButton.disabled = !!startBlockedReason;
      this.deps.lobbyStartButton.textContent = startBlockedReason || 'Start Match';
    }
    if (this.deps.levelSelectOpenButton) {
      this.deps.levelSelectOpenButton.disabled = !isHost;
    }
    this.deps.updateProfileUi();
    this.deps.updateChatUi();
    this.updateLevelSelectUi();
  }
}
