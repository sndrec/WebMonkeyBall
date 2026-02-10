export const BALL_FLAGS = {
  FLAG_00: 1 << 0,
  FLAG_01: 1 << 1,
  FLAG_02: 1 << 2,
  FLAG_03: 1 << 3,
  INVISIBLE: 1 << 4,
  FLAG_05: 1 << 5,
  FLAG_06: 1 << 6,
  FLAG_07: 1 << 7,
  FLAG_08: 1 << 8,
  FLAG_09: 1 << 9,
  FLAG_10: 1 << 10,
  FLAG_11: 1 << 11,
  GOAL: 1 << 12,
  FLAG_13: 1 << 13,
  FLAG_14: 1 << 14,
  TIMEOVER: 1 << 15,
  FLAG_16: 1 << 16,
  FLAG_17: 1 << 17,
  FLAG_18: 1 << 18,
  FLAG_19: 1 << 19,
  FLAG_20: 1 << 20,
  FLAG_21: 1 << 21,
  FLAG_22: 1 << 22,
  FLAG_23: 1 << 23,
  FLAG_24: 1 << 24,
  FLAG_25: 1 << 25,
  FLAG_26: 1 << 26,
  FLAG_27: 1 << 27,
  FLAG_28: 1 << 28,
  FLAG_29: 1 << 29,
  FLAG_30: 1 << 30,
  FLAG_31: 1 << 31,
};

export const BALL_STATES = {
  READY: 0,
  DROP: 3,
  PLAY: 4,
  GOAL_INIT: 5,
  GOAL_MAIN: 6,
};

export const INFO_FLAGS = {
  GOAL: 1 << 0,
  TIMEOVER: 1 << 1,
  FALLOUT: 1 << 2,
  TIMER_PAUSED: 1 << 3,
  REPLAY: 1 << 4,
  FLAG_05: 1 << 5,
  BONUS_STAGE: 1 << 6,
  FLAG_07: 1 << 7,
  FLAG_08: 1 << 8,
  BONUS_CLEAR: 1 << 9,
  FLAG_10: 1 << 10,
  FLAG_11: 1 << 11,
  FINAL_FLOOR: 1 << 12,
  FLAG_13: 1 << 13,
};

export const CAMERA_STATE = {
  LEVEL_MAIN: 1,
  FALLOUT_MAIN: 4,
  FALLOUT_REPLAY: 8,
  READY_INIT: 10,
  READY_MAIN: 11,
  GOAL_MAIN: 15,
  GOAL_REPLAY: 17,
  SPECTATOR_FREE: 20,
};

export const WORLD_STATE = {
  INPUT_INIT: 1,
  INPUT_MAIN: 2,
};

export const COLI_FLAGS = {
  OCCURRED: 1 << 0,
};

export const DEG_TO_S16 = 0x10000 / 360;
export const S16_TO_RAD = Math.PI / 0x8000;
export const DEFAULT_STAGE_TIME = 60 * 60;
export const GAME_SOURCES = {
  SMB1: 'smb1',
  SMB2: 'smb2',
  MB2WS: 'mb2ws',
} as const;

export const STAGE_BASE_PATHS = {
  [GAME_SOURCES.SMB1]: './smb1_content/test',
  [GAME_SOURCES.SMB2]: './smb2_content/test',
  [GAME_SOURCES.MB2WS]: './mb2ws_content/test',
};

export type GameSource = keyof typeof STAGE_BASE_PATHS;
// Derived from mb_bumper bound sphere in common.gma.
export const BUMPER_MODEL_RADIUS = 0.4243819714;
export const BUMPER_BOUND_RADIUS = 0.75 * BUMPER_MODEL_RADIUS;
export const BUMPER_BOUND_CENTER = { x: 0, y: 0.35, z: 0 };
// Extracted from common.gma NEW_SCENT_BAG_WHOLE model bounds.
export const GOAL_BAG_BASE_CENTER = { x: 0, y: -0.7499997616, z: 0 };
export const GOAL_BAG_BASE_RADIUS = 0.7500002384;
export const GOAL_BAG_OPEN_SCALE = 0.5;
export const GOAL_BAG_OFFSET = { x: 0, y: 2.8, z: 0 };
export const GOAL_BAG_GUIDE_POS = { x: 0, y: 3.5499999523, z: 0 };
export const GOAL_BAG_GUIDE_DIR = { x: 1, y: 0, z: 0 };

const STAGE_BG_NAMES = [
  null, // 0
  'bg_jun', // 1
  'bg_jun', // 2
  'bg_jun', // 3
  'bg_jun', // 4
  'bg_sun', // 5
  'bg_sun', // 6
  'bg_sun', // 7
  'bg_sun', // 8
  'bg_sun', // 9
  null, // 10
  'bg_jun', // 11
  'bg_jun', // 12
  'bg_jun', // 13
  'bg_jun', // 14
  'bg_sun', // 15
  'bg_sun', // 16
  'bg_sun', // 17
  'bg_sun', // 18
  null, // 19
  null, // 20
  'bg_nig', // 21
  'bg_nig', // 22
  'bg_nig', // 23
  'bg_nig', // 24
  'bg_nig', // 25
  'bg_nig', // 26
  'bg_nig', // 27
  'bg_nig', // 28
  'bg_nig', // 29
  null, // 30
  'bg_wat', // 31
  'bg_wat', // 32
  'bg_wat', // 33
  'bg_wat', // 34
  'bg_wat', // 35
  'bg_wat', // 36
  'bg_wat', // 37
  'bg_wat', // 38
  'bg_wat', // 39
  'bg_wat', // 40
  'bg_jun', // 41
  'bg_jun', // 42
  'bg_jun', // 43
  'bg_jun', // 44
  'bg_nig', // 45
  'bg_nig', // 46
  'bg_nig', // 47
  'bg_nig', // 48
  null, // 49
  null, // 50
  'bg_wat', // 51
  'bg_wat', // 52
  'bg_wat', // 53
  'bg_wat', // 54
  'bg_wat', // 55
  'bg_wat', // 56
  'bg_wat', // 57
  'bg_wat', // 58
  'bg_wat', // 59
  null, // 60
  'bg_snd', // 61
  'bg_snd', // 62
  'bg_snd', // 63
  'bg_snd', // 64
  'bg_snd', // 65
  'bg_snd', // 66
  'bg_snd', // 67
  'bg_snd', // 68
  'bg_snd', // 69
  null, // 70
  'bg_ice', // 71
  'bg_ice', // 72
  'bg_ice', // 73
  'bg_ice', // 74
  'bg_ice', // 75
  'bg_ice', // 76
  'bg_ice', // 77
  'bg_ice', // 78
  'bg_ice', // 79
  null, // 80
  'bg_stm', // 81
  'bg_stm', // 82
  'bg_stm', // 83
  'bg_stm', // 84
  'bg_stm', // 85
  'bg_stm', // 86
  'bg_stm', // 87
  'bg_stm', // 88
  'bg_stm', // 89
  'bg_stm', // 90
  'bg_bns', // 91
  'bg_bns', // 92
  'bg_bns', // 93
  'bg_bns', // 94
  'bg_bns', // 95
  null, // 96
  null, // 97
  null, // 98
  'bg_jun', // 99
  null, // 100
  'bg_spa', // 101
  'bg_spa', // 102
  'bg_spa', // 103
  'bg_spa', // 104
  'bg_spa', // 105
  'bg_spa', // 106
  'bg_spa', // 107
  'bg_spa', // 108
  'bg_spa', // 109
  'bg_spa', // 110
  'bg_spa', // 111
  'bg_spa', // 112
  'bg_spa', // 113
  null, // 114
  'bg_mst', // 115
  'bg_mst', // 116
  'bg_mst', // 117
  'bg_mst', // 118
  'bg_mst', // 119
  'bg_mst', // 120
  'bg_mst', // 121
  'bg_mst', // 122
  'bg_mst', // 123
  'bg_mst', // 124
  'bg_mst', // 125
  'bg_mst', // 126
  'bg_mst', // 127
  'bg_mst', // 128
  'bg_mst', // 129
  'bg_mst', // 130
  'bg_spa', // 131
  'bg_snd', // 132
  'bg_jun', // 133
  'bg_ice', // 134
  'bg_nig', // 135
  'bg_wat', // 136
  'bg_nig', // 137
  'bg_snd', // 138
  'bg_sun', // 139
  'bg_spa', // 140
  'bg_spa', // 141
  'bg_wat', // 142
  'bg_jun', // 143
  'bg_ice', // 144
  'bg_spa', // 145
  'bg_spa', // 146
  'bg_spa', // 147
  'bg_spa', // 148
  'bg_spa', // 149
  'bg_jun', // 150
  'bg_pil', // 151
  'bg_pil', // 152
  'bg_pil', // 153
  'bg_pil', // 154
  'bg_pil', // 155
  'bg_pil', // 156
  'bg_pil', // 157
  'bg_pil', // 158
  'bg_pil', // 159
  'bg_pil', // 160
  'bg_jun', // 161
  'bg_jun', // 162
  'bg_jun', // 163
  'bg_jun', // 164
  'bg_jun', // 165
  'bg_jun', // 166
  'bg_jun', // 167
  'bg_jun', // 168
  'bg_jun', // 169
  'bg_jun', // 170
  'bg_jun', // 171
  'bg_jun', // 172
  'bg_jun', // 173
  'bg_jun', // 174
  'bg_jun', // 175
  'bg_jun', // 176
  'bg_jun', // 177
  'bg_jun', // 178
  'bg_bow', // 179
  null, // 180
  null, // 181
  null, // 182
  null, // 183
  null, // 184
  null, // 185
  null, // 186
  null, // 187
  null, // 188
  null, // 189
  null, // 190
  null, // 191
  null, // 192
  null, // 193
  null, // 194
  null, // 195
  null, // 196
  'bg_bns', // 197
  'bg_ending', // 198
  'bg_jun', // 199
  null, // 200
];

const STAGE_BG_IDS = [
  1, // 0
  13, // 1
  13, // 2
  13, // 3
  13, // 4
  16, // 5
  16, // 6
  16, // 7
  16, // 8
  16, // 9
  1, // 10
  13, // 11
  13, // 12
  13, // 13
  13, // 14
  16, // 15
  16, // 16
  16, // 17
  16, // 18
  1, // 19
  1, // 20
  15, // 21
  15, // 22
  15, // 23
  15, // 24
  15, // 25
  15, // 26
  15, // 27
  15, // 28
  15, // 29
  1, // 30
  14, // 31
  14, // 32
  14, // 33
  14, // 34
  14, // 35
  14, // 36
  14, // 37
  14, // 38
  14, // 39
  14, // 40
  13, // 41
  13, // 42
  13, // 43
  13, // 44
  15, // 45
  15, // 46
  15, // 47
  15, // 48
  1, // 49
  1, // 50
  14, // 51
  14, // 52
  14, // 53
  14, // 54
  14, // 55
  14, // 56
  14, // 57
  14, // 58
  14, // 59
  1, // 60
  18, // 61
  18, // 62
  18, // 63
  18, // 64
  18, // 65
  18, // 66
  18, // 67
  18, // 68
  18, // 69
  1, // 70
  19, // 71
  19, // 72
  19, // 73
  19, // 74
  19, // 75
  19, // 76
  19, // 77
  19, // 78
  19, // 79
  1, // 80
  20, // 81
  20, // 82
  20, // 83
  20, // 84
  20, // 85
  20, // 86
  20, // 87
  20, // 88
  20, // 89
  20, // 90
  21, // 91
  21, // 92
  21, // 93
  21, // 94
  21, // 95
  1, // 96
  1, // 97
  1, // 98
  13, // 99
  1, // 100
  17, // 101
  17, // 102
  17, // 103
  17, // 104
  17, // 105
  17, // 106
  17, // 107
  17, // 108
  17, // 109
  17, // 110
  17, // 111
  17, // 112
  17, // 113
  1, // 114
  26, // 115
  26, // 116
  26, // 117
  26, // 118
  26, // 119
  26, // 120
  26, // 121
  26, // 122
  26, // 123
  26, // 124
  26, // 125
  26, // 126
  26, // 127
  26, // 128
  26, // 129
  26, // 130
  17, // 131
  18, // 132
  13, // 133
  19, // 134
  15, // 135
  14, // 136
  15, // 137
  18, // 138
  16, // 139
  17, // 140
  17, // 141
  14, // 142
  13, // 143
  19, // 144
  17, // 145
  17, // 146
  17, // 147
  17, // 148
  17, // 149
  13, // 150
  22, // 151
  22, // 152
  22, // 153
  22, // 154
  22, // 155
  22, // 156
  22, // 157
  22, // 158
  22, // 159
  22, // 160
  13, // 161
  13, // 162
  13, // 163
  13, // 164
  13, // 165
  13, // 166
  13, // 167
  13, // 168
  13, // 169
  13, // 170
  13, // 171
  13, // 172
  13, // 173
  13, // 174
  13, // 175
  13, // 176
  13, // 177
  13, // 178
  25, // 179
  23, // 180
  1, // 181
  1, // 182
  1, // 183
  1, // 184
  1, // 185
  1, // 186
  1, // 187
  1, // 188
  1, // 189
  0, // 190
  1, // 191
  1, // 192
  1, // 193
  1, // 194
  1, // 195
  1, // 196
  21, // 197
  27, // 198
  13, // 199
  1, // 200
];

const BG_LIGHTING = [
  { ambient: [0.8, 0.8, 0.8], infColor: [1, 1, 1], rotX: 8192, rotY: 24576 }, // 0
  { ambient: [0.8, 0.8, 0.8], infColor: [1, 1, 1], rotX: 8192, rotY: 24576 }, // 1
  { ambient: [0.8, 0.8, 0.8], infColor: [0.1, 0.11, 0.1], rotX: 4096, rotY: 0 }, // 2
  { ambient: [0.8, 0.8, 0.8], infColor: [0, 0, 0], rotX: 16384, rotY: 0 }, // 3
  { ambient: [0.8, 0.8, 0.8], infColor: [0, 0.05, 0.05], rotX: 8192, rotY: 24576 }, // 4
  { ambient: [0.8, 0.8, 0.8], infColor: [0.1, 0.1, 0.5], rotX: 12288, rotY: 8192 }, // 5
  { ambient: [0.8, 0.8, 0.8], infColor: [0.3, 0.3, 0.3], rotX: 8192, rotY: 24576 }, // 6
  { ambient: [0.8, 0.8, 0.8], infColor: [0.25, 0.2, 0], rotX: 8192, rotY: 24576 }, // 7
  { ambient: [0.8, 0.8, 0.8], infColor: [0.1, 0.05, 0.05], rotX: 8192, rotY: 24576 }, // 8
  { ambient: [0.8, 0.8, 0.8], infColor: [1, 1, 1], rotX: 8192, rotY: 24576 }, // 9
  { ambient: [0.3, 0.4, 0.8], infColor: [1, 1, 1], rotX: -6272, rotY: 26752 }, // 10
  { ambient: [0.8, 0.8, 0.8], infColor: [0.05, 0.05, 0.1], rotX: 8192, rotY: 24576 }, // 11
  { ambient: [0.6, 0.6, 0.6], infColor: [1, 1, 1], rotX: 8192, rotY: 24576 }, // 12
  { ambient: [0.6, 0.6, 0.6], infColor: [1, 1, 1], rotX: 8192, rotY: 24576 }, // 13
  { ambient: [0.28, 0.48, 0.63], infColor: [0.6, 0.85, 1], rotX: 8192, rotY: 24576 }, // 14
  { ambient: [0.4, 0.4, 0.7], infColor: [1, 1, 1], rotX: 8192, rotY: 24576 }, // 15
  { ambient: [0.4, 0.4, 0.7], infColor: [1, 1, 1], rotX: 8192, rotY: 24576 }, // 16
  { ambient: [0.5, 0.45, 0.6], infColor: [1, 1, 1], rotX: 29184, rotY: 17664 }, // 17
  { ambient: [0.45, 0.4, 0.25], infColor: [1, 1, 1], rotX: 24576, rotY: 24576 }, // 18
  { ambient: [0.55, 0.6, 0.85], infColor: [1, 1, 1], rotX: 8192, rotY: 24576 }, // 19
  { ambient: [0.3, 0.3, 0.45], infColor: [1, 1, 1], rotX: 8192, rotY: 24576 }, // 20
  { ambient: [0.6, 0.7, 0.8], infColor: [0.8, 0.8, 0.8], rotX: -11776, rotY: 21888 }, // 21
  { ambient: [0.6, 0.6, 0.6], infColor: [1, 1, 1], rotX: 8192, rotY: 24576 }, // 22
  { ambient: [0.4, 0.4, 0.55], infColor: [0, 0, 0], rotX: 8192, rotY: 24576 }, // 23
  { ambient: [0.6, 0.6, 0.6], infColor: [1, 1, 1], rotX: 8192, rotY: 24576 }, // 24
  { ambient: [0.6, 0.6, 0.6], infColor: [1, 1, 1], rotX: 8192, rotY: 24576 }, // 25
  { ambient: [0.6, 0.6, 0.6], infColor: [1, 1, 1], rotX: 8192, rotY: 24576 }, // 26
  { ambient: [0.6, 0.6, 0.6], infColor: [1, 1, 1], rotX: 8192, rotY: 24576 }, // 27
  { ambient: [0.6, 0.6, 0.6], infColor: [1, 1, 1], rotX: 8192, rotY: 24576 }, // 28
  { ambient: [0.6, 0.6, 0.6], infColor: [1, 1, 1], rotX: 8192, rotY: 24576 }, // 29
  { ambient: [0.6, 0.6, 0.6], infColor: [1, 1, 1], rotX: 8192, rotY: 24576 }, // 30
  { ambient: [0.6, 0.6, 0.6], infColor: [1, 1, 1], rotX: 8192, rotY: 24576 }, // 31
  { ambient: [0.6, 0.6, 0.6], infColor: [1, 1, 1], rotX: 8192, rotY: 24576 }, // 32
];

export function goalTypeFromValue(value) {
  const high = (value >> 8) & 0xff;
  const low = value & 0xff;
  if (high === 0x42 || low === 0x42) {
    return 'B';
  }
  if (high === 0x47 || low === 0x47) {
    return 'G';
  }
  if (high === 0x52 || low === 0x52) {
    return 'R';
  }
  if (low === 0x01) {
    if (high === 0x01) {
      return 'G';
    }
    if (high === 0x02) {
      return 'R';
    }
    return 'B';
  }
  return 'B';
}

export function stageIdFromName(name) {
  const match = /ST_(\d{3})/.exec(name);
  if (!match) {
    return 0;
  }
  return Number.parseInt(match[1], 10);
}

export function stageLabelFromName(name) {
  const match = /ST_\d{3}_(.*)/.exec(name);
  if (!match) {
    return name;
  }
  return match[1].replace(/_/g, ' ');
}

export function backgroundNameForStage(stageId) {
  return STAGE_BG_NAMES[stageId] ?? null;
}

export function backgroundLightingForStage(stageId) {
  const bgId = STAGE_BG_IDS[stageId] ?? 0;
  return BG_LIGHTING[bgId] ?? BG_LIGHTING[0];
}
