type PerfScope = {
  label: string;
  startMs: number;
};

const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function perfStart(label: string): PerfScope {
  return { label, startMs: perfNow() };
}

export function perfEnd(scope: PerfScope, log: (message: string) => void = () => {}): number {
  const elapsedMs = perfNow() - scope.startMs;
  log(`${scope.label}: ${elapsedMs.toFixed(3)}ms`);
  return elapsedMs;
}

export function perfSince(startMs: number): number {
  return perfNow() - startMs;
}
