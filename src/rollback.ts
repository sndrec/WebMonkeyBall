import type { QuantizedInput } from './determinism.js';

export type FrameInputs = Map<number, QuantizedInput>;

export type RollbackCallbacks<T> = {
  saveState: () => T;
  loadState: (state: T) => void;
  advanceFrame: (inputs: FrameInputs) => void;
};

export class RollbackSession<T> {
  private callbacks: RollbackCallbacks<T>;
  private maxRollbackFrames: number;
  private stateHistory = new Map<number, T>();
  private inputHistory = new Map<number, FrameInputs>();
  private lastFrame = 0;
  public suppressVisuals = false;

  constructor(callbacks: RollbackCallbacks<T>, maxRollbackFrames = 30) {
    this.callbacks = callbacks;
    this.maxRollbackFrames = Math.max(1, maxRollbackFrames | 0);
  }

  getFrame() {
    return this.lastFrame;
  }

  prime(frame: number) {
    const target = frame | 0;
    this.lastFrame = target;
    this.stateHistory.set(target, this.callbacks.saveState());
    this.inputHistory.set(target, new Map());
    this.trimHistory(target);
  }

  pushLocalFrame(frame: number, inputs: FrameInputs) {
    this.inputHistory.set(frame, inputs);
  }

  advanceTo(frame: number, inputs: FrameInputs) {
    this.inputHistory.set(frame, inputs);
    this.callbacks.advanceFrame(inputs);
    this.lastFrame = frame;
    this.stateHistory.set(frame, this.callbacks.saveState());
    this.trimHistory(frame);
  }

  rollbackTo(frame: number) {
    const state = this.stateHistory.get(frame);
    if (!state) {
      return false;
    }
    this.callbacks.loadState(state);
    this.lastFrame = frame;
    return true;
  }

  getState(frame: number) {
    return this.stateHistory.get(frame) ?? null;
  }

  getInputs(frame: number) {
    return this.inputHistory.get(frame) ?? null;
  }

  private trimHistory(frame: number) {
    const minFrame = frame - this.maxRollbackFrames;
    for (const key of this.stateHistory.keys()) {
      if (key < minFrame) {
        this.stateHistory.delete(key);
      }
    }
    for (const key of this.inputHistory.keys()) {
      if (key < minFrame) {
        this.inputHistory.delete(key);
      }
    }
  }
}
