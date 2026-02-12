import type { PlayerProfile, RoomInfo } from '../../netcode_protocol.js';
import { generateAlias } from './presence_format.js';

type PrivacySettings = {
  hidePlayerNames: boolean;
  hideLobbyNames: boolean;
};

type PresenceUiOptions = {
  getPrivacySettings: () => PrivacySettings;
  getLobbyRoomId: () => string;
};

export function createPresenceUiHelpers(options: PresenceUiOptions) {
  function profileFallbackForPlayer(playerId: number): PlayerProfile {
    const suffix = String(playerId).slice(-4);
    return {
      name: `Player ${suffix}`,
    };
  }

  function getPlayerDisplayName(playerId: number, profile: PlayerProfile) {
    const privacySettings = options.getPrivacySettings();
    if (!privacySettings.hidePlayerNames) {
      return profile.name;
    }
    return generateAlias(`${options.getLobbyRoomId()}:player:${playerId}`);
  }

  function getRoomDisplayName(room: RoomInfo) {
    const roomName = room.meta?.roomName?.trim() ?? '';
    if (!roomName) {
      return room.roomCode ? `Room ${room.roomCode}` : `Room ${room.roomId.slice(0, 8)}`;
    }
    const privacySettings = options.getPrivacySettings();
    if (!privacySettings.hideLobbyNames) {
      return roomName;
    }
    return generateAlias(`room:${room.roomId}`);
  }

  function formatRoomInfoLabel(room: RoomInfo) {
    const codeLabel = room.roomCode ? `Room ${room.roomCode}` : `Room ${room.roomId.slice(0, 8)}`;
    const roomName = room.meta?.roomName?.trim();
    const privacySettings = options.getPrivacySettings();
    const displayName = roomName
      ? (privacySettings.hideLobbyNames ? generateAlias(`room:${room.roomId}`) : roomName)
      : '';
    return displayName ? `${codeLabel} • ${displayName}` : codeLabel;
  }

  function createAvatarElement(profile: PlayerProfile, seed: number) {
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    if (profile.avatarData) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = profile.avatarData;
      avatar.style.background = 'none';
      avatar.appendChild(img);
      return avatar;
    }
    const hue = (seed * 47) % 360;
    const hue2 = (hue + 40) % 360;
    avatar.style.background = `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.6), rgba(255,255,255,0) 55%), linear-gradient(135deg, hsl(${hue} 70% 60%), hsl(${hue2} 70% 45%))`;
    return avatar;
  }

  return {
    profileFallbackForPlayer,
    getPlayerDisplayName,
    getRoomDisplayName,
    formatRoomInfoLabel,
    createAvatarElement,
  };
}
