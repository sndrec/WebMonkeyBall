export function normalizeGoalType(goalType: string | number | null): 'B' | 'G' | 'R' {
  if (goalType === 'G' || goalType === 'R' || goalType === 'B') {
    return goalType;
  }
  if (goalType === 1) {
    return 'G';
  }
  if (goalType === 2) {
    return 'R';
  }
  return 'B';
}

export function computeGoalScore(goalType: string | number | null, framesRemaining: number, timeLimitFrames: number): number {
  const normalizedGoal = normalizeGoalType(goalType);
  const timeRemaining = Math.max(0, Math.floor(framesRemaining));
  let score = Math.floor((timeRemaining * 100) / 60);
  if (normalizedGoal === 'G') {
    score += 10000;
  } else if (normalizedGoal === 'R') {
    score += 20000;
  }
  let jumpDistance = 1;
  if (timeLimitFrames > 0 && timeRemaining > (timeLimitFrames >> 1)) {
    jumpDistance *= 2;
  }
  return score * jumpDistance;
}
