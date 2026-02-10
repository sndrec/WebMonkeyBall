import type { StageRuntime } from './stage_runtime.js';

export type StageElementInitializer = (runtime: StageRuntime) => void;

export class StageElementRegistry {
  private initializers: StageElementInitializer[] = [];

  register(initializer: StageElementInitializer): void {
    this.initializers.push(initializer);
  }

  init(runtime: StageRuntime): void {
    for (const initializer of this.initializers) {
      initializer(runtime);
    }
  }
}

const registry = new StageElementRegistry();

export function getStageElementRegistry(): StageElementRegistry {
  return registry;
}
