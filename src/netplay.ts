import type {
  ClientToHostMessage,
  HostToClientMessage,
  RoomInfo,
  RoomMeta,
  RoomSettings,
} from './netcode_protocol.js';

export type SignalMessage = {
  type: 'signal';
  from: number;
  to: number | null;
  payload: any;
};

export type RoomJoinResult = {
  room: RoomInfo;
  playerId: number;
  playerToken: string;
  hostToken?: string;
};

const DEFAULT_STUN = [{ urls: 'stun:stun.l.google.com:19302' }];
const FAST_MESSAGE_TYPES = new Set(['frame', 'input', 'ack', 'ping', 'pong']);

function isFastMessage(msg: { type: string }) {
  return FAST_MESSAGE_TYPES.has(msg.type);
}

function getChannelRole(label: string) {
  return label === 'fast' ? 'fast' : 'ctrl';
}

export class LobbyClient {
  constructor(private baseUrl: string) {}

  async listRooms(): Promise<RoomInfo[]> {
    const res = await fetch(`${this.baseUrl}/rooms`);
    const data = await res.json();
    return data.rooms ?? [];
  }

  async createRoom(room: Partial<RoomInfo>): Promise<RoomJoinResult> {
    const res = await fetch(`${this.baseUrl}/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(room),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error ?? `create_room_${res.status}`);
    }
    return {
      room: data.room,
      playerId: data.playerId,
      playerToken: data.playerToken,
      hostToken: data.hostToken,
    };
  }

  async joinRoom(roomIdOrCode: {
    roomId?: string;
    roomCode?: string;
    playerId?: number;
    token?: string;
  }): Promise<RoomJoinResult> {
    const res = await fetch(`${this.baseUrl}/rooms/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(roomIdOrCode),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error ?? `join_room_${res.status}`);
    }
    return {
      room: data.room,
      playerId: data.playerId,
      playerToken: data.playerToken,
      hostToken: data.hostToken,
    };
  }

  async heartbeat(
    roomId: string,
    playerId: number,
    token: string,
    meta?: RoomMeta,
    settings?: RoomSettings,
  ): Promise<void> {
    await fetch(`${this.baseUrl}/rooms/heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId, playerId, token, meta, settings }),
    });
  }

  async closeRoom(roomId: string, hostToken: string): Promise<void> {
    await fetch(`${this.baseUrl}/rooms/close`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId, hostToken }),
    });
  }

  async kickPlayer(roomId: string, hostToken: string, playerId: number): Promise<void> {
    await fetch(`${this.baseUrl}/rooms/kick`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId, hostToken, playerId }),
    });
  }

  openSignal(
    roomId: string,
    playerId: number,
    token: string,
    onMessage: (msg: SignalMessage) => void,
    onClose: () => void,
  ) {
    const ws = new WebSocket(
      `${this.baseUrl.replace('http', 'ws')}/room/${roomId}?playerId=${playerId}&token=${encodeURIComponent(token)}`,
    );
    const pending: SignalMessage[] = [];
    ws.addEventListener('open', () => {
      while (pending.length > 0) {
        const msg = pending.shift();
        if (msg) {
          ws.send(JSON.stringify(msg));
        }
      }
    });
    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data) as SignalMessage;
        if (msg?.type === 'signal') {
          onMessage(msg);
        }
      } catch {
        // Ignore malformed.
      }
    });
    ws.addEventListener('close', () => onClose());
    return {
      send: (msg: SignalMessage) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
        } else if (ws.readyState === WebSocket.CONNECTING) {
          pending.push(msg);
        }
      },
      close: () => ws.close(),
    };
  }

  async promoteHost(roomId: string, playerId: number, token: string): Promise<RoomJoinResult> {
    const res = await fetch(`${this.baseUrl}/rooms/promote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId, playerId, token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error ?? `promote_host_${res.status}`);
    }
    return {
      room: data.room,
      playerId,
      playerToken: token,
      hostToken: data.hostToken,
    };
  }
}

export class HostRelay {
  private peers = new Map<number, RTCPeerConnection>();
  private channels = new Map<number, { ctrl?: RTCDataChannel; fast?: RTCDataChannel }>();
  private connected = new Set<number>();

  constructor(private onMessage: (playerId: number, msg: ClientToHostMessage) => void) {}

  getPeer(playerId: number): RTCPeerConnection {
    const existing = this.peers.get(playerId);
    if (existing) {
      return existing;
    }
    const pc = new RTCPeerConnection({ iceServers: DEFAULT_STUN });
    pc.addEventListener('icecandidate', (ev) => {
      if (ev.candidate) {
        this.onSignal?.({ type: 'signal', from: this.hostId, to: playerId, payload: { ice: ev.candidate } });
      }
    });
    pc.addEventListener('datachannel', (ev) => {
      this.attachChannel(playerId, ev.channel);
    });
    this.peers.set(playerId, pc);
    return pc;
  }

  attachChannel(playerId: number, channel: RTCDataChannel) {
    const role = getChannelRole(channel.label);
    const entry = this.channels.get(playerId) ?? {};
    entry[role] = channel;
    this.channels.set(playerId, entry);
    channel.binaryType = 'arraybuffer';
    channel.addEventListener('open', () => {
      if (role === 'ctrl' && !this.connected.has(playerId)) {
        this.connected.add(playerId);
        this.onConnect?.(playerId);
      }
    });
    channel.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data) as ClientToHostMessage;
        if (msg?.type) {
          this.onMessage(playerId, msg);
        }
      } catch {
        // Ignore malformed.
      }
    });
    channel.addEventListener('close', () => {
      const current = this.channels.get(playerId);
      const ctrl = current?.ctrl;
      if (role === 'ctrl' || !ctrl || ctrl.readyState === 'closed' || ctrl.readyState === 'closing') {
        if (this.connected.has(playerId)) {
          this.connected.delete(playerId);
          this.onDisconnect?.(playerId);
        }
      }
    });
  }

  private pickChannel(playerId: number, preferFast: boolean) {
    const entry = this.channels.get(playerId);
    if (!entry) {
      return null;
    }
    const primary = preferFast ? entry.fast : entry.ctrl;
    const fallback = preferFast ? entry.ctrl : entry.fast;
    if (primary && primary.readyState === 'open') {
      return primary;
    }
    if (fallback && fallback.readyState === 'open') {
      return fallback;
    }
    return null;
  }

  broadcast(msg: HostToClientMessage) {
    const payload = JSON.stringify(msg);
    const preferFast = isFastMessage(msg);
    for (const playerId of this.channels.keys()) {
      const channel = this.pickChannel(playerId, preferFast);
      if (channel) {
        channel.send(payload);
      }
    }
  }

  getChannelStates() {
    const states: Array<{ playerId: number; readyState: string }> = [];
    for (const [playerId, entry] of this.channels.entries()) {
      const ctrl = entry.ctrl?.readyState ?? 'none';
      const fast = entry.fast?.readyState ?? 'none';
      states.push({ playerId, readyState: `ctrl=${ctrl} fast=${fast}` });
    }
    return states;
  }

  sendTo(playerId: number, msg: HostToClientMessage) {
    const channel = this.pickChannel(playerId, isFastMessage(msg));
    if (!channel) {
      return;
    }
    channel.send(JSON.stringify(msg));
  }

  closeAll() {
    for (const entry of this.channels.values()) {
      for (const channel of [entry.ctrl, entry.fast]) {
        if (!channel) {
          continue;
        }
        try {
          channel.close();
        } catch {
          // Ignore.
        }
      }
    }
    for (const peer of this.peers.values()) {
      try {
        peer.close();
      } catch {
        // Ignore.
      }
    }
    this.channels.clear();
    this.peers.clear();
    this.connected.clear();
  }

  disconnect(playerId: number) {
    const entry = this.channels.get(playerId);
    if (entry) {
      for (const channel of [entry.ctrl, entry.fast]) {
        if (!channel) {
          continue;
        }
        try {
          channel.close();
        } catch {
          // Ignore.
        }
      }
    }
    const peer = this.peers.get(playerId);
    if (peer) {
      try {
        peer.close();
      } catch {
        // Ignore.
      }
    }
    this.channels.delete(playerId);
    this.peers.delete(playerId);
    if (this.connected.has(playerId)) {
      this.connected.delete(playerId);
      this.onDisconnect?.(playerId);
    }
  }

  hostId = 0;
  onSignal?: (msg: SignalMessage) => void;
  onConnect?: (playerId: number) => void;
  onDisconnect?: (playerId: number) => void;
}

export class ClientPeer {
  private pc: RTCPeerConnection | null = null;
  private ctrlChannel: RTCDataChannel | null = null;
  private fastChannel: RTCDataChannel | null = null;

  constructor(private onMessage: (msg: HostToClientMessage) => void) {}

  private attachChannel(channel: RTCDataChannel) {
    const role = getChannelRole(channel.label);
    if (role === 'fast') {
      this.fastChannel = channel;
    } else {
      this.ctrlChannel = channel;
    }
    channel.addEventListener('open', () => {
      if (role === 'ctrl') {
        this.onConnect?.();
      }
    });
    channel.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data) as HostToClientMessage;
        this.onMessage(msg);
      } catch {
        // Ignore malformed.
      }
    });
    channel.addEventListener('close', () => {
      if (role === 'ctrl') {
        this.onDisconnect?.();
      }
    });
  }

  async createConnection(): Promise<RTCPeerConnection> {
    const pc = new RTCPeerConnection({ iceServers: DEFAULT_STUN });
    pc.addEventListener('icecandidate', (ev) => {
      if (ev.candidate) {
        this.onSignal?.({ type: 'signal', from: this.playerId, to: this.hostId, payload: { ice: ev.candidate } });
      }
    });
    pc.addEventListener('datachannel', (ev) => {
      this.attachChannel(ev.channel);
    });
    this.pc = pc;
    return pc;
  }

  send(msg: ClientToHostMessage) {
    const preferFast = isFastMessage(msg);
    const primary = preferFast ? this.fastChannel : this.ctrlChannel;
    const fallback = preferFast ? this.ctrlChannel : this.fastChannel;
    if (primary?.readyState === 'open') {
      primary.send(JSON.stringify(msg));
      return;
    }
    if (fallback?.readyState === 'open') {
      fallback.send(JSON.stringify(msg));
    }
  }

  getChannelState(): string {
    const ctrl = this.ctrlChannel?.readyState ?? 'none';
    const fast = this.fastChannel?.readyState ?? 'none';
    return `ctrl=${ctrl} fast=${fast}`;
  }

  close() {
    for (const channel of [this.ctrlChannel, this.fastChannel]) {
      if (!channel) {
        continue;
      }
      try {
        channel.close();
      } catch {
        // Ignore.
      }
    }
    try {
      this.pc?.close();
    } catch {
      // Ignore.
    }
    this.ctrlChannel = null;
    this.fastChannel = null;
    this.pc = null;
  }

  async handleSignal(payload: any) {
    if (!this.pc) {
      return;
    }
    if (payload?.sdp) {
      await this.pc.setRemoteDescription(payload.sdp);
      if (payload.sdp.type === 'offer') {
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.onSignal?.({ type: 'signal', from: this.playerId, to: this.hostId, payload: { sdp: this.pc.localDescription } });
      }
    } else if (payload?.ice) {
      await this.pc.addIceCandidate(payload.ice);
    }
  }

  playerId = 0;
  hostId = 0;
  onSignal?: (msg: SignalMessage) => void;
  onDisconnect?: () => void;
  onConnect?: () => void;
}

export async function createHostOffer(host: HostRelay, playerId: number) {
  const pc = host.getPeer(playerId);
  const ctrl = pc.createDataChannel('ctrl');
  host.attachChannel(playerId, ctrl);
  const fast = pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 });
  host.attachChannel(playerId, fast);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  return pc.localDescription;
}

export async function applyHostSignal(host: HostRelay, playerId: number, payload: any) {
  const pc = host.getPeer(playerId);
  if (payload?.sdp) {
    await pc.setRemoteDescription(payload.sdp);
    if (payload.sdp.type === 'answer') {
      return;
    }
  } else if (payload?.ice) {
    await pc.addIceCandidate(payload.ice);
  }
}
