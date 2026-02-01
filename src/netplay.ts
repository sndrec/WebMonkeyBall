import type {
  ClientToHostMessage,
  HostToClientMessage,
  RoomInfo,
} from './netcode_protocol.js';

export type SignalMessage = {
  type: 'signal';
  from: number;
  to: number | null;
  payload: any;
};

const DEFAULT_STUN = [{ urls: 'stun:stun.l.google.com:19302' }];

export class LobbyClient {
  constructor(private baseUrl: string) {}

  async listRooms(): Promise<RoomInfo[]> {
    const res = await fetch(`${this.baseUrl}/rooms`);
    const data = await res.json();
    return data.rooms ?? [];
  }

  async createRoom(room: Partial<RoomInfo>): Promise<RoomInfo> {
    const res = await fetch(`${this.baseUrl}/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(room),
    });
    const data = await res.json();
    return data.room;
  }

  async joinRoom(roomIdOrCode: { roomId?: string; roomCode?: string }): Promise<RoomInfo> {
    const res = await fetch(`${this.baseUrl}/rooms/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(roomIdOrCode),
    });
    const data = await res.json();
    return data.room;
  }

  async heartbeat(roomId: string): Promise<void> {
    await fetch(`${this.baseUrl}/rooms/heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId }),
    });
  }

  async closeRoom(roomId: string): Promise<void> {
    await fetch(`${this.baseUrl}/rooms/close`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId }),
    });
  }

  openSignal(roomId: string, playerId: number, onMessage: (msg: SignalMessage) => void, onClose: () => void) {
    const ws = new WebSocket(`${this.baseUrl.replace('http', 'ws')}/room/${roomId}?playerId=${playerId}`);
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
      send: (msg: SignalMessage) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg)),
      close: () => ws.close(),
    };
  }
}

export class HostRelay {
  private peers = new Map<number, RTCPeerConnection>();
  private channels = new Map<number, RTCDataChannel>();

  constructor(private onMessage: (playerId: number, msg: ClientToHostMessage) => void) {}

  createPeer(playerId: number): RTCPeerConnection {
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
    this.channels.set(playerId, channel);
    channel.binaryType = 'arraybuffer';
    channel.addEventListener('open', () => {
      this.onConnect?.(playerId);
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
      this.onDisconnect?.(playerId);
    });
  }

  broadcast(msg: HostToClientMessage) {
    const payload = JSON.stringify(msg);
    for (const channel of this.channels.values()) {
      if (channel.readyState === 'open') {
        channel.send(payload);
      }
    }
  }

  sendTo(playerId: number, msg: HostToClientMessage) {
    const channel = this.channels.get(playerId);
    if (!channel || channel.readyState !== 'open') {
      return;
    }
    channel.send(JSON.stringify(msg));
  }

  closeAll() {
    for (const channel of this.channels.values()) {
      try {
        channel.close();
      } catch {
        // Ignore.
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
  }

  hostId = 0;
  onSignal?: (msg: SignalMessage) => void;
  onConnect?: (playerId: number) => void;
  onDisconnect?: (playerId: number) => void;
}

export class ClientPeer {
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;

  constructor(private onMessage: (msg: HostToClientMessage) => void) {}

  private attachChannel(channel: RTCDataChannel) {
    this.channel = channel;
    channel.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data) as HostToClientMessage;
        this.onMessage(msg);
      } catch {
        // Ignore malformed.
      }
    });
    channel.addEventListener('close', () => {
      this.onDisconnect?.();
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
    if (this.channel?.readyState === 'open') {
      this.channel.send(JSON.stringify(msg));
    }
  }

  close() {
    try {
      this.channel?.close();
    } catch {
      // Ignore.
    }
    try {
      this.pc?.close();
    } catch {
      // Ignore.
    }
    this.channel = null;
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
}

export async function createHostOffer(host: HostRelay, playerId: number) {
  const pc = host.createPeer(playerId);
  const channel = pc.createDataChannel('game');
  host.attachChannel(playerId, channel);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  return pc.localDescription;
}

export async function applyHostSignal(host: HostRelay, playerId: number, payload: any) {
  const pc = host.createPeer(playerId);
  if (payload?.sdp) {
    await pc.setRemoteDescription(payload.sdp);
    if (payload.sdp.type === 'answer') {
      return;
    }
  } else if (payload?.ice) {
    await pc.addIceCandidate(payload.ice);
  }
}
