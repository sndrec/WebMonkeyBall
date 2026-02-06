import type {
  ClientToHostMessage,
  FrameBundleMessage,
  HostToClientMessage,
  InputFrameMessage,
  RoomInfo,
  RoomMeta,
  RoomSettings,
} from './netcode_protocol.js';
import type { QuantizedInput } from './determinism.js';

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
const FAST_CHANNEL_MAX_BUFFERED = 256 * 1024;
const CTRL_CHANNEL_MAX_BUFFERED = 1024 * 1024;
const BINARY_PACKET_INPUT_BATCH = 1;
const BINARY_PACKET_FRAME_BATCH = 2;

type InputBatchEntry = {
  frame: number;
  input: QuantizedInput;
};

type FramePlayerInputEntry = {
  playerId: number;
  input: QuantizedInput;
};

type DecodedInputBatch = {
  stageSeq: number;
  lastAck: number;
  entries: InputBatchEntry[];
};

function clampI8(value: number) {
  return Math.max(-127, Math.min(127, value | 0));
}

function asArrayBuffer(data: unknown) {
  if (data instanceof ArrayBuffer) {
    return data;
  }
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  return null;
}

function encodeInputBatchPacket(stageSeq: number, lastAck: number, entries: InputBatchEntry[]) {
  const count = Math.min(0xffff, Math.max(0, entries.length | 0));
  const buffer = new ArrayBuffer(1 + 4 + 4 + 2 + (count * (4 + 1 + 1 + 4)));
  const view = new DataView(buffer);
  let offs = 0;
  view.setUint8(offs, BINARY_PACKET_INPUT_BATCH);
  offs += 1;
  view.setUint32(offs, stageSeq >>> 0, true);
  offs += 4;
  view.setUint32(offs, lastAck >>> 0, true);
  offs += 4;
  view.setUint16(offs, count, true);
  offs += 2;
  for (let i = 0; i < count; i += 1) {
    const entry = entries[i];
    view.setUint32(offs, entry.frame >>> 0, true);
    offs += 4;
    view.setInt8(offs, clampI8(entry.input.x));
    offs += 1;
    view.setInt8(offs, clampI8(entry.input.y));
    offs += 1;
    view.setInt32(offs, (entry.input.buttons ?? 0) | 0, true);
    offs += 4;
  }
  return buffer;
}

function decodeInputBatchPacket(data: ArrayBuffer): DecodedInputBatch | null {
  const view = new DataView(data);
  const headerBytes = 1 + 4 + 4 + 2;
  if (view.byteLength < headerBytes || view.getUint8(0) !== BINARY_PACKET_INPUT_BATCH) {
    return null;
  }
  let offs = 1;
  const stageSeq = view.getUint32(offs, true);
  offs += 4;
  const lastAck = view.getUint32(offs, true);
  offs += 4;
  const count = view.getUint16(offs, true);
  offs += 2;
  const expectedBytes = headerBytes + (count * (4 + 1 + 1 + 4));
  if (view.byteLength !== expectedBytes) {
    return null;
  }
  const entries: InputBatchEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    const frame = view.getUint32(offs, true);
    offs += 4;
    const x = view.getInt8(offs);
    offs += 1;
    const y = view.getInt8(offs);
    offs += 1;
    const buttons = view.getInt32(offs, true);
    offs += 4;
    entries.push({ frame, input: { x, y, buttons } });
  }
  return { stageSeq, lastAck, entries };
}

function encodeFrameBatchPacket(lastAck: number, frames: FrameBundleMessage[]) {
  const count = Math.min(0xffff, Math.max(0, frames.length | 0));
  const stageSeq = count > 0 ? (frames[0].stageSeq >>> 0) : 0;
  let byteLength = 1 + 4 + 4 + 2;
  const frameInputs = new Array<{ frame: number; hash?: number; hashFrame?: number; inputs: FramePlayerInputEntry[] }>(count);
  for (let i = 0; i < count; i += 1) {
    const bundle = frames[i];
    const inputs: FramePlayerInputEntry[] = [];
    for (const [playerId, input] of Object.entries(bundle.inputs)) {
      inputs.push({
        playerId: Number(playerId) | 0,
        input: {
          x: clampI8(input.x),
          y: clampI8(input.y),
          buttons: (input.buttons ?? 0) | 0,
        },
      });
    }
    const hasHash = Number.isFinite(bundle.hashFrame) && Number.isFinite(bundle.hash);
    frameInputs[i] = {
      frame: bundle.frame >>> 0,
      hash: hasHash ? (bundle.hash! >>> 0) : undefined,
      hashFrame: hasHash ? (bundle.hashFrame! >>> 0) : undefined,
      inputs,
    };
    byteLength += 4 + 1 + 1;
    if (hasHash) {
      byteLength += 4 + 4;
    }
    byteLength += inputs.length * (2 + 1 + 1 + 4);
  }
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);
  let offs = 0;
  view.setUint8(offs, BINARY_PACKET_FRAME_BATCH);
  offs += 1;
  view.setUint32(offs, stageSeq, true);
  offs += 4;
  view.setInt32(offs, lastAck | 0, true);
  offs += 4;
  view.setUint16(offs, count, true);
  offs += 2;
  for (let i = 0; i < count; i += 1) {
    const frame = frameInputs[i];
    const hasHash = frame.hash !== undefined && frame.hashFrame !== undefined;
    const inputCount = Math.min(0xff, frame.inputs.length);
    view.setUint32(offs, frame.frame >>> 0, true);
    offs += 4;
    view.setUint8(offs, hasHash ? 1 : 0);
    offs += 1;
    view.setUint8(offs, inputCount);
    offs += 1;
    if (hasHash) {
      view.setUint32(offs, frame.hashFrame! >>> 0, true);
      offs += 4;
      view.setUint32(offs, frame.hash! >>> 0, true);
      offs += 4;
    }
    for (let j = 0; j < inputCount; j += 1) {
      const input = frame.inputs[j];
      view.setUint16(offs, input.playerId >>> 0, true);
      offs += 2;
      view.setInt8(offs, clampI8(input.input.x));
      offs += 1;
      view.setInt8(offs, clampI8(input.input.y));
      offs += 1;
      view.setInt32(offs, (input.input.buttons ?? 0) | 0, true);
      offs += 4;
    }
  }
  return buffer;
}

function decodeFrameBatchPacket(data: ArrayBuffer): FrameBundleMessage[] | null {
  const view = new DataView(data);
  const headerBytes = 1 + 4 + 4 + 2;
  if (view.byteLength < headerBytes || view.getUint8(0) !== BINARY_PACKET_FRAME_BATCH) {
    return null;
  }
  let offs = 1;
  const stageSeq = view.getUint32(offs, true);
  offs += 4;
  const lastAck = view.getInt32(offs, true);
  offs += 4;
  const count = view.getUint16(offs, true);
  offs += 2;
  const frames: FrameBundleMessage[] = [];
  for (let i = 0; i < count; i += 1) {
    if ((offs + 6) > view.byteLength) {
      return null;
    }
    const frame = view.getUint32(offs, true);
    offs += 4;
    const flags = view.getUint8(offs);
    offs += 1;
    const inputCount = view.getUint8(offs);
    offs += 1;
    let hashFrame: number | undefined;
    let hash: number | undefined;
    if ((flags & 1) !== 0) {
      if ((offs + 8) > view.byteLength) {
        return null;
      }
      hashFrame = view.getUint32(offs, true);
      offs += 4;
      hash = view.getUint32(offs, true);
      offs += 4;
    }
    const inputs: Record<number, QuantizedInput> = {};
    for (let j = 0; j < inputCount; j += 1) {
      if ((offs + 8) > view.byteLength) {
        return null;
      }
      const playerId = view.getUint16(offs, true);
      offs += 2;
      const x = view.getInt8(offs);
      offs += 1;
      const y = view.getInt8(offs);
      offs += 1;
      const buttons = view.getInt32(offs, true);
      offs += 4;
      inputs[playerId] = { x, y, buttons };
    }
    const msg: FrameBundleMessage = {
      type: 'frame',
      stageSeq,
      frame,
      inputs,
      lastAck,
    };
    if (hashFrame !== undefined && hash !== undefined) {
      msg.hashFrame = hashFrame;
      msg.hash = hash;
    }
    frames.push(msg);
  }
  if (offs !== view.byteLength) {
    return null;
  }
  return frames;
}

function isFastMessage(msg: { type: string }) {
  return FAST_MESSAGE_TYPES.has(msg.type);
}

function getChannelRole(label: string) {
  return label === 'fast' ? 'fast' : 'ctrl';
}

function getChannelBufferedLimit(channel: RTCDataChannel) {
  return getChannelRole(channel.label) === 'fast' ? FAST_CHANNEL_MAX_BUFFERED : CTRL_CHANNEL_MAX_BUFFERED;
}

function isChannelWritable(channel: RTCDataChannel | null | undefined) {
  if (!channel || channel.readyState !== 'open') {
    return false;
  }
  return channel.bufferedAmount <= getChannelBufferedLimit(channel);
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
      const binary = asArrayBuffer(event.data);
      if (binary) {
        const packet = decodeInputBatchPacket(binary);
        if (!packet) {
          return;
        }
        for (const entry of packet.entries) {
          const msg: InputFrameMessage = {
            type: 'input',
            stageSeq: packet.stageSeq,
            frame: entry.frame,
            playerId,
            input: entry.input,
            lastAck: packet.lastAck,
          };
          this.onMessage(playerId, msg);
        }
        return;
      }
      if (typeof event.data !== 'string') {
        return;
      }
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
    if (isChannelWritable(primary)) {
      return primary;
    }
    if (isChannelWritable(fallback)) {
      return fallback;
    }
    return null;
  }

  private sendPayload(playerId: number, payload: string | ArrayBuffer, preferFast: boolean) {
    const channel = this.pickChannel(playerId, preferFast);
    if (!channel) {
      return false;
    }
    try {
      channel.send(payload);
      return true;
    } catch {
      this.disconnect(playerId);
      return false;
    }
  }

  broadcast(msg: HostToClientMessage) {
    const payload = JSON.stringify(msg);
    const preferFast = isFastMessage(msg);
    for (const playerId of Array.from(this.channels.keys())) {
      this.sendPayload(playerId, payload, preferFast);
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
    this.sendPayload(playerId, JSON.stringify(msg), isFastMessage(msg));
  }

  sendFrameBatch(playerId: number, lastAck: number, frames: FrameBundleMessage[]) {
    if (frames.length <= 0) {
      return;
    }
    this.sendPayload(playerId, encodeFrameBatchPacket(lastAck, frames), true);
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
    channel.binaryType = 'arraybuffer';
    channel.addEventListener('open', () => {
      if (role === 'ctrl') {
        this.onConnect?.();
      }
    });
    channel.addEventListener('message', (event) => {
      const binary = asArrayBuffer(event.data);
      if (binary) {
        const frames = decodeFrameBatchPacket(binary);
        if (!frames) {
          return;
        }
        for (const frame of frames) {
          this.onMessage(frame);
        }
        return;
      }
      if (typeof event.data !== 'string') {
        return;
      }
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

  private sendPayload(payload: string | ArrayBuffer, preferFast: boolean) {
    const primary = preferFast ? this.fastChannel : this.ctrlChannel;
    const fallback = preferFast ? this.ctrlChannel : this.fastChannel;
    if (isChannelWritable(primary)) {
      try {
        primary.send(payload);
        return;
      } catch {
        // Try fallback below.
      }
    }
    if (isChannelWritable(fallback)) {
      try {
        fallback.send(payload);
      } catch {
        // Ignore send failures from a stale/closing channel.
      }
    }
  }

  send(msg: ClientToHostMessage) {
    this.sendPayload(JSON.stringify(msg), isFastMessage(msg));
  }

  sendInputBatch(stageSeq: number, lastAck: number, entries: InputBatchEntry[]) {
    if (entries.length <= 0) {
      return;
    }
    this.sendPayload(encodeInputBatchPacket(stageSeq, lastAck, entries), true);
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
