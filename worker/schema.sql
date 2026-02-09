CREATE TABLE IF NOT EXISTS submissions (
  submission_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  player_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  game_source TEXT NOT NULL,
  stage_id INTEGER,
  goal_type TEXT,
  metric TEXT,
  course_id TEXT,
  mode TEXT,
  warp_flag TEXT,
  pack_id TEXT,
  replay_key TEXT NOT NULL,
  client_value INTEGER,
  verified_value INTEGER,
  verified_details TEXT,
  client_meta TEXT,
  submitted_at INTEGER NOT NULL,
  verified_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_type ON submissions(type);

CREATE TABLE IF NOT EXISTS entries (
  entry_id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  type TEXT NOT NULL,
  player_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  game_source TEXT NOT NULL,
  stage_id INTEGER,
  goal_type TEXT,
  metric TEXT,
  course_id TEXT,
  mode TEXT,
  warp_flag TEXT,
  pack_id TEXT,
  value INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_stage ON entries(type, game_source, stage_id, goal_type, metric, pack_id);
CREATE INDEX IF NOT EXISTS idx_entries_course ON entries(type, game_source, course_id, mode, warp_flag, pack_id);

CREATE TABLE IF NOT EXISTS allowlist (
  pack_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_audit (
  audit_id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  target_id TEXT,
  metadata TEXT,
  actor_ip TEXT,
  created_at INTEGER NOT NULL
);
