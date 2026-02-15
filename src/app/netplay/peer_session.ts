import { HostRelay, ClientPeer, createHostOffer, applyHostSignal } from '../../netplay.js';
import type { Game, MultiplayerGameMode } from '../../game.js';
import type {
  RoomInfo,
  RoomGameModeOptions,
  PlayerProfile,
  ClientToHostMessage,
  HostToClientMessage,
} from '../../netcode_protocol.js';
import type { GameSource } from '../../shared/constants/index.js';

type NetplayState = {
  role: 'host' | 'client';
  stageSeq: number;
  clientStates: Map<number, {
    lastAckedHostFrame: number;
    lastAckedClientInput: number;
    lastSnapshotMs: number | null;
    lastSnapshotRequestMs: number | null;
  }>;
  currentCourse: any;
  currentGameSource: GameSource | null;
  currentGameMode: MultiplayerGameMode;
};

type LobbyRoom = RoomInfo;

type PeerSessionDeps = {
  lobbyClient: any;
  lobbyStatus: HTMLElement | null;
  game: Game;
  chainedMaxPlayers: number;
  getLobbyRoom: () => LobbyRoom | null;
  getLobbyHostToken: () => string | null;
  getLobbySignalShouldReconnect: () => boolean;
  setLobbySignalShouldReconnect: (enabled: boolean) => void;
  getLobbySignal: () => { send: (msg: any) => void; close: () => void } | null;
  setLobbySignal: (signal: { send: (msg: any) => void; close: () => void } | null) => void;
  setLobbySignalReconnectFn: (fn: (() => void) | null) => void;
  getLobbySignalReconnectFn: () => (() => void) | null;
  clearLobbySignalRetry: () => void;
  scheduleLobbySignalReconnect: () => void;
  ensureNetplayState: (role: 'host' | 'client') => NetplayState;
  getNetplayState: () => NetplayState | null;
  setNetplayEnabled: (enabled: boolean) => void;
  getRoomGameMode: (room: RoomInfo | null | undefined) => MultiplayerGameMode;
  getRoomGameModeOptions: (room: RoomInfo | null | undefined, mode: MultiplayerGameMode) => RoomGameModeOptions;
  applyGameModeOptionsToGame: (mode: MultiplayerGameMode, raw: unknown) => RoomGameModeOptions;
  applyLocalProfileToSession: () => void;
  normalizeMultiplayerGameMode: (mode: unknown) => MultiplayerGameMode;
  shouldJoinAsSpectator: () => boolean;
  markPlayerPendingSpawn: (playerId: number, stageSeq: number) => void;
  profileFallbackForPlayer: (playerId: number) => PlayerProfile;
  lobbyProfiles: Map<number, PlayerProfile>;
  pendingAvatarByPlayer: Map<number, string>;
  pendingSpawnStageSeq: Map<number, number>;
  maybeSendStageSync: () => void;
  getStageBasePath: (source: GameSource) => string;
  sendSnapshotToClient: (playerId: number) => void;
  broadcastRoomUpdate: () => void;
  sendLobbyHeartbeat: (nowMs: number, force?: boolean) => void;
  updateLobbyUi: () => void;
  startLobbyHeartbeat: (roomId: string) => void;
  broadcastLocalProfile: () => void;
  handleClientMessage: (playerId: number, msg: ClientToHostMessage) => void;
  handleHostMessage: (msg: HostToClientMessage) => void;
  handleHostDisconnect: () => Promise<void>;
  getHostRelay: () => HostRelay | null;
  setHostRelay: (relay: HostRelay | null) => void;
  getClientPeer: () => ClientPeer | null;
  setClientPeer: (peer: ClientPeer | null) => void;
};

export class PeerSessionController {
  private readonly deps: PeerSessionDeps;

  constructor(deps: PeerSessionDeps) {
    this.deps = deps;
  }

  rejectHostConnection(playerId: number, reason = 'Room is full') {
    this.deps.getHostRelay()?.sendTo(playerId, { type: 'kick', reason });
    window.setTimeout(() => {
      this.deps.getHostRelay()?.disconnect(playerId);
    }, 80);
    const lobbyRoom = this.deps.getLobbyRoom();
    const lobbyHostToken = this.deps.getLobbyHostToken();
    if (this.deps.lobbyClient && lobbyRoom && lobbyHostToken) {
      void this.deps.lobbyClient.kickPlayer(lobbyRoom.roomId, lobbyHostToken, playerId).catch(() => {
        // Ignore backend kick failures.
      });
    }
  }

  startHost(room: LobbyRoom, playerToken: string) {
    if (!this.deps.lobbyClient) {
      return;
    }
    if (!playerToken) {
      if (this.deps.lobbyStatus) {
        this.deps.lobbyStatus.textContent = 'Lobby: auth failed';
      }
      return;
    }
    this.deps.setNetplayEnabled(true);
    const state = this.deps.ensureNetplayState('host');
    const roomMode = this.deps.getRoomGameMode(room);
    const roomModeOptions = this.deps.getRoomGameModeOptions(room, roomMode);
    state.currentGameMode = roomMode;
    this.deps.game.setLocalPlayerId(room.hostId);
    this.deps.applyLocalProfileToSession();
    const cappedMaxPlayers = roomMode === 'chained_together'
      ? Math.min(room.settings.maxPlayers, this.deps.chainedMaxPlayers)
      : room.settings.maxPlayers;
    room.settings.maxPlayers = cappedMaxPlayers;
    this.deps.game.maxPlayers = cappedMaxPlayers;
    this.deps.game.playerCollisionEnabled = room.settings.collisionEnabled;
    this.deps.game.infiniteTimeEnabled = !!(room.settings.infiniteTimeEnabled ?? false);
    this.deps.game.setMultiplayerGameMode(roomMode);
    this.deps.applyGameModeOptionsToGame(roomMode, roomModeOptions);
    this.deps.game.allowCourseAdvance = true;

    const hostRelay = new HostRelay((playerId, msg) => {
      this.deps.handleClientMessage(playerId, msg);
    });
    this.deps.setHostRelay(hostRelay);
    hostRelay.hostId = room.hostId;

    hostRelay.onConnect = (playerId) => {
      const liveState = this.deps.getNetplayState();
      if (!liveState) {
        this.rejectHostConnection(playerId, 'Host unavailable');
        return;
      }
      if (this.deps.game.players.length >= this.deps.game.maxPlayers) {
        this.rejectHostConnection(playerId, 'Room is full');
        return;
      }
      if (!liveState.clientStates.has(playerId)) {
        liveState.clientStates.set(playerId, {
          lastAckedHostFrame: -1,
          lastAckedClientInput: -1,
          lastSnapshotMs: null,
          lastSnapshotRequestMs: null,
        });
      }
      const joinAsSpectator = this.deps.shouldJoinAsSpectator();
      this.deps.game.addPlayer(playerId, { spectator: joinAsSpectator });
      const player = this.deps.game.players.find((p) => p.id === playerId);
      if (joinAsSpectator) {
        this.deps.markPlayerPendingSpawn(playerId, liveState.stageSeq);
      }
      const pendingSpawn = !!player?.pendingSpawn;
      if (!this.deps.lobbyProfiles.has(playerId)) {
        this.deps.lobbyProfiles.set(playerId, this.deps.profileFallbackForPlayer(playerId));
      }
      for (const existing of this.deps.game.players) {
        hostRelay.sendTo(playerId, {
          type: 'player_join',
          playerId: existing.id,
          stageSeq: liveState.stageSeq,
          spectator: existing.isSpectator,
          pendingSpawn: existing.pendingSpawn,
        });
      }
      hostRelay.broadcast({
        type: 'player_join',
        playerId,
        stageSeq: liveState.stageSeq,
        spectator: joinAsSpectator,
        pendingSpawn,
      });
      const nextRoom = this.deps.getLobbyRoom() ?? room;
      if (nextRoom) {
        nextRoom.playerCount = this.deps.game.players.length;
        hostRelay.sendTo(playerId, { type: 'room_update', room: nextRoom });
      }
      for (const [id, profile] of this.deps.lobbyProfiles.entries()) {
        hostRelay.sendTo(playerId, { type: 'player_profile', playerId: id, profile });
      }
      if (liveState.currentCourse && liveState.currentGameSource) {
        const liveMode = this.deps.normalizeMultiplayerGameMode(liveState.currentGameMode);
        const liveModeOptions = this.deps.getRoomGameModeOptions(this.deps.getLobbyRoom() ?? nextRoom, liveMode);
        hostRelay.sendTo(playerId, {
          type: 'start',
          stageSeq: liveState.stageSeq,
          gameSource: liveState.currentGameSource,
          gameMode: liveMode,
          gameModeOptions: Object.keys(liveModeOptions).length > 0 ? liveModeOptions : undefined,
          course: liveState.currentCourse,
          stageBasePath: this.deps.getStageBasePath(liveState.currentGameSource),
          lateJoin: joinAsSpectator,
        });
      }
      this.deps.sendSnapshotToClient(playerId);
      this.deps.broadcastRoomUpdate();
      this.deps.sendLobbyHeartbeat(performance.now(), true);
      this.deps.updateLobbyUi();
    };

    hostRelay.onDisconnect = (playerId) => {
      this.deps.game.removePlayer(playerId);
      this.deps.getNetplayState()?.clientStates.delete(playerId);
      this.deps.lobbyProfiles.delete(playerId);
      this.deps.pendingAvatarByPlayer.delete(playerId);
      this.deps.pendingSpawnStageSeq.delete(playerId);
      hostRelay.broadcast({ type: 'player_leave', playerId });
      this.deps.broadcastRoomUpdate();
      this.deps.sendLobbyHeartbeat(performance.now(), true);
      this.deps.updateLobbyUi();
      this.deps.maybeSendStageSync();
    };

    this.deps.setLobbySignalShouldReconnect(true);
    this.deps.clearLobbySignalRetry();
    this.deps.setLobbySignalReconnectFn(() => {
      this.deps.getLobbySignal()?.close();
      const signal = this.deps.lobbyClient.openSignal(room.roomId, room.hostId, playerToken, async (msg: any) => {
        if (msg.to !== room.hostId) {
          return;
        }
        if (msg.payload?.join) {
          const offer = await createHostOffer(hostRelay, msg.from);
          hostRelay.onSignal?.({ type: 'signal', from: room.hostId, to: msg.from, payload: { sdp: offer } });
          return;
        }
        await applyHostSignal(hostRelay, msg.from, msg.payload);
      }, () => {
        if (!this.deps.getLobbySignalShouldReconnect()) {
          return;
        }
        if (this.deps.lobbyStatus) {
          this.deps.lobbyStatus.textContent = 'Lobby: signal lost';
        }
        this.deps.scheduleLobbySignalReconnect();
      });
      this.deps.setLobbySignal(signal);
    });

    this.deps.getLobbySignalReconnectFn()?.();
    hostRelay.onSignal = (signal) => this.deps.getLobbySignal()?.send(signal);
    this.deps.startLobbyHeartbeat(room.roomId);
    if (this.deps.lobbyStatus) {
      this.deps.lobbyStatus.textContent = `Lobby: hosting ${room.roomCode ?? room.roomId}`;
    }
    this.deps.broadcastLocalProfile();
    this.deps.updateLobbyUi();
  }

  async startClient(room: LobbyRoom, playerId: number, playerToken: string) {
    if (!this.deps.lobbyClient) {
      return;
    }
    if (!playerToken) {
      if (this.deps.lobbyStatus) {
        this.deps.lobbyStatus.textContent = 'Lobby: auth failed';
      }
      return;
    }
    this.deps.setNetplayEnabled(true);
    const state = this.deps.ensureNetplayState('client');
    const roomMode = this.deps.getRoomGameMode(room);
    const roomModeOptions = this.deps.getRoomGameModeOptions(room, roomMode);
    state.currentGameMode = roomMode;
    this.deps.game.setLocalPlayerId(playerId);
    this.deps.applyLocalProfileToSession();
    const cappedMaxPlayers = roomMode === 'chained_together'
      ? Math.min(room.settings.maxPlayers, this.deps.chainedMaxPlayers)
      : room.settings.maxPlayers;
    room.settings.maxPlayers = cappedMaxPlayers;
    this.deps.game.maxPlayers = cappedMaxPlayers;
    this.deps.game.playerCollisionEnabled = room.settings.collisionEnabled;
    this.deps.game.infiniteTimeEnabled = !!(room.settings.infiniteTimeEnabled ?? false);
    this.deps.game.setMultiplayerGameMode(roomMode);
    this.deps.applyGameModeOptionsToGame(roomMode, roomModeOptions);
    this.deps.game.allowCourseAdvance = false;
    this.deps.game.addPlayer(room.hostId, { spectator: false });

    const clientPeer = new ClientPeer((msg) => {
      this.deps.handleHostMessage(msg);
    });
    this.deps.setClientPeer(clientPeer);
    clientPeer.playerId = playerId;
    clientPeer.hostId = room.hostId;
    clientPeer.onConnect = () => {
      this.deps.broadcastLocalProfile();
    };
    await clientPeer.createConnection();

    this.deps.setLobbySignalShouldReconnect(true);
    this.deps.clearLobbySignalRetry();
    this.deps.setLobbySignalReconnectFn(() => {
      this.deps.getLobbySignal()?.close();
      const signal = this.deps.lobbyClient.openSignal(room.roomId, playerId, playerToken, async (msg: any) => {
        if (msg.to !== playerId) {
          return;
        }
        await clientPeer.handleSignal(msg.payload);
      }, () => {
        if (!this.deps.getLobbySignalShouldReconnect()) {
          return;
        }
        if (this.deps.lobbyStatus) {
          this.deps.lobbyStatus.textContent = 'Lobby: signal lost';
        }
        this.deps.scheduleLobbySignalReconnect();
      });
      this.deps.setLobbySignal(signal);
    });

    this.deps.getLobbySignalReconnectFn()?.();
    clientPeer.onSignal = (signal) => this.deps.getLobbySignal()?.send(signal);
    clientPeer.onDisconnect = () => {
      if (this.deps.lobbyStatus) {
        this.deps.lobbyStatus.textContent = 'Lobby: disconnected';
      }
      void this.deps.handleHostDisconnect();
    };
    this.deps.getLobbySignal()?.send({ type: 'signal', from: playerId, to: room.hostId, payload: { join: true } });
    this.deps.startLobbyHeartbeat(room.roomId);
    if (this.deps.lobbyStatus) {
      this.deps.lobbyStatus.textContent = `Lobby: connected ${room.roomCode ?? room.roomId}`;
    }
    this.deps.updateLobbyUi();
  }
}
