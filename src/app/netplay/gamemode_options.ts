import type { Game, MultiplayerGameMode } from '../../game.js';
import type { RoomMeta, RoomGameModeOptions } from '../../netcode_protocol.js';
import type { GamemodeOptionDefinition, GamemodeRegistration } from '../../mods/mod_types.js';

type GamemodeOptionsControllerArgs = {
  gamemodes: GamemodeRegistration[];
  lobbyGamemodeOptionsRoot: HTMLElement | null;
};

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(obj: AnyRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function clampNumber(value: number, min?: number, max?: number): number {
  let out = value;
  if (Number.isFinite(min)) {
    out = Math.max(min as number, out);
  }
  if (Number.isFinite(max)) {
    out = Math.min(max as number, out);
  }
  return out;
}

export class GamemodeOptionsController {
  private readonly defsByMode = new Map<string, GamemodeOptionDefinition[]>();
  private readonly lobbyGamemodeOptionsRoot: HTMLElement | null;
  private readonly inputByKey = new Map<string, HTMLInputElement | HTMLSelectElement>();
  private renderedMode: MultiplayerGameMode | null = null;

  constructor(args: GamemodeOptionsControllerArgs) {
    this.lobbyGamemodeOptionsRoot = args.lobbyGamemodeOptionsRoot;
    for (const gamemode of args.gamemodes) {
      const modeId = typeof gamemode?.id === 'string' ? gamemode.id : '';
      if (!modeId) {
        continue;
      }
      const defs = Array.isArray(gamemode.options) ? gamemode.options.filter((entry) => !!entry) : [];
      this.defsByMode.set(modeId, defs);
    }
  }

  private getDefinitions(mode: MultiplayerGameMode): GamemodeOptionDefinition[] {
    return this.defsByMode.get(mode) ?? [];
  }

  getDefaultOptions(mode: MultiplayerGameMode): RoomGameModeOptions {
    const defs = this.getDefinitions(mode);
    const out: RoomGameModeOptions = {};
    for (const def of defs) {
      if (def.kind === 'number') {
        out[def.key] = clampNumber(Number(def.defaultValue), def.min, def.max);
        continue;
      }
      if (def.kind === 'boolean') {
        out[def.key] = !!def.defaultValue;
        continue;
      }
      const choices = Array.isArray(def.choices) ? def.choices : [];
      const fallback = String(def.defaultValue ?? '');
      const hasDefault = choices.some((choice) => String(choice.value) === fallback);
      out[def.key] = hasDefault ? fallback : String(choices[0]?.value ?? '');
    }
    return out;
  }

  hasOptions(mode: MultiplayerGameMode): boolean {
    return this.getDefinitions(mode).length > 0;
  }

  private normalizeSingleOption(
    def: GamemodeOptionDefinition,
    raw: unknown,
    includeDefaults: boolean,
  ): string | number | boolean | undefined {
    if (def.kind === 'number') {
      let parsed: number;
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        parsed = raw;
      } else if (typeof raw === 'string' && raw.trim()) {
        parsed = Number(raw);
      } else if (includeDefaults) {
        parsed = Number(def.defaultValue);
      } else {
        return undefined;
      }
      if (!Number.isFinite(parsed)) {
        parsed = Number(def.defaultValue);
      }
      return clampNumber(parsed, def.min, def.max);
    }
    if (def.kind === 'boolean') {
      if (typeof raw === 'boolean') {
        return raw;
      }
      if (typeof raw === 'number') {
        return raw !== 0;
      }
      if (typeof raw === 'string') {
        const normalized = raw.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
          return true;
        }
        if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
          return false;
        }
      }
      return includeDefaults ? !!def.defaultValue : undefined;
    }
    const choices = Array.isArray(def.choices) ? def.choices : [];
    const candidate = String(raw ?? '');
    if (choices.some((choice) => String(choice.value) === candidate)) {
      return candidate;
    }
    if (!includeDefaults) {
      return undefined;
    }
    const fallback = String(def.defaultValue ?? '');
    if (choices.some((choice) => String(choice.value) === fallback)) {
      return fallback;
    }
    return String(choices[0]?.value ?? '');
  }

  normalizeOptions(mode: MultiplayerGameMode, raw: unknown, includeDefaults = true): RoomGameModeOptions {
    const defs = this.getDefinitions(mode);
    if (defs.length === 0) {
      return {};
    }
    const source = isRecord(raw) ? raw : {};
    const out: RoomGameModeOptions = {};
    for (const def of defs) {
      const rawValue = hasOwn(source, def.key) ? source[def.key] : undefined;
      const normalized = this.normalizeSingleOption(def, rawValue, includeDefaults);
      if (normalized !== undefined) {
        out[def.key] = normalized;
      }
    }
    return out;
  }

  getRoomMetaOptions(meta: RoomMeta | null | undefined, mode: MultiplayerGameMode): RoomGameModeOptions {
    return this.normalizeOptions(mode, meta?.gameModeOptions, true);
  }

  setRoomMetaOptions(meta: RoomMeta, mode: MultiplayerGameMode, raw: unknown): RoomMeta {
    const options = this.normalizeOptions(mode, raw, true);
    return {
      ...meta,
      gameModeOptions: Object.keys(options).length > 0 ? options : undefined,
    };
  }

  readOptionsFromInputs(mode: MultiplayerGameMode, fallbackRaw: unknown): RoomGameModeOptions {
    const fallback = this.normalizeOptions(mode, fallbackRaw, true);
    if (this.renderedMode !== mode) {
      return fallback;
    }
    const defs = this.getDefinitions(mode);
    const out: RoomGameModeOptions = { ...fallback };
    for (const def of defs) {
      const input = this.inputByKey.get(def.key);
      if (!input) {
        continue;
      }
      const rawValue: unknown = def.kind === 'boolean'
        ? (input as HTMLInputElement).checked
        : input.value;
      const normalized = this.normalizeSingleOption(def, rawValue, true);
      if (normalized !== undefined) {
        out[def.key] = normalized;
      }
    }
    return out;
  }

  applyOptionsToGame(game: Game, mode: MultiplayerGameMode, raw: unknown): RoomGameModeOptions {
    const normalized = this.normalizeOptions(mode, raw, true);
    (game as any).multiplayerGameModeOptions = normalized;
    return normalized;
  }

  render(mode: MultiplayerGameMode, raw: unknown, disabled: boolean): void {
    const root = this.lobbyGamemodeOptionsRoot;
    this.renderedMode = mode;
    this.inputByKey.clear();
    if (!root) {
      return;
    }
    root.innerHTML = '';
    const defs = this.getDefinitions(mode);
    if (defs.length === 0) {
      root.classList.add('hidden');
      return;
    }
    const values = this.normalizeOptions(mode, raw, true);
    for (const def of defs) {
      if (def.kind === 'boolean') {
        const checkboxField = document.createElement('label');
        checkboxField.className = 'checkbox-field';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!values[def.key];
        input.disabled = disabled;
        input.dataset.gamemodeOptionKey = def.key;
        const text = document.createElement('span');
        text.textContent = def.label;
        checkboxField.append(input, text);
        root.appendChild(checkboxField);
        this.inputByKey.set(def.key, input);
      } else if (def.kind === 'number') {
        const field = document.createElement('label');
        field.className = 'field';
        const label = document.createElement('span');
        label.textContent = def.label;
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'text-input';
        input.value = String(values[def.key] ?? def.defaultValue);
        input.disabled = disabled;
        input.dataset.gamemodeOptionKey = def.key;
        if (Number.isFinite(def.min)) {
          input.min = String(def.min);
        }
        if (Number.isFinite(def.max)) {
          input.max = String(def.max);
        }
        if (Number.isFinite(def.step) && (def.step as number) > 0) {
          input.step = String(def.step);
        }
        field.append(label, input);
        root.appendChild(field);
        this.inputByKey.set(def.key, input);
      } else {
        const field = document.createElement('label');
        field.className = 'field';
        const label = document.createElement('span');
        label.textContent = def.label;
        const select = document.createElement('select');
        select.disabled = disabled;
        select.dataset.gamemodeOptionKey = def.key;
        for (const choice of def.choices) {
          const option = document.createElement('option');
          option.value = String(choice.value);
          option.textContent = choice.label;
          select.appendChild(option);
        }
        const desiredValue = String(values[def.key] ?? def.defaultValue ?? '');
        if (Array.from(select.options).some((option) => option.value === desiredValue)) {
          select.value = desiredValue;
        }
        field.append(label, select);
        root.appendChild(field);
        this.inputByKey.set(def.key, select);
      }
      if (def.description) {
        const hint = document.createElement('div');
        hint.className = 'control-hint';
        hint.textContent = def.description;
        root.appendChild(hint);
      }
    }
    root.classList.remove('hidden');
  }
}
