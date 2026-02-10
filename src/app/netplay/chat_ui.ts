type ChatEntry = {
  id: number;
  playerId: number;
  text: string;
  time: number;
};

type RenderOptions = {
  limit: number | null;
  nowMs: number;
  fade: boolean;
  maxAgeMs: number;
  fadeMs: number;
};

type ChatUiOptions = {
  lobbyChatList: HTMLElement | null;
  ingameChatList: HTMLElement | null;
  ingameChatWrap: HTMLElement | null;
  ingameChatInputRow: HTMLElement | null;
  ingameChatInput: HTMLInputElement | null;
  getDisplayName: (playerId: number) => string;
  clearKeyboardState: () => void;
};

export class ChatUiController {
  private readonly options: ChatUiOptions;
  private ingameChatOpen = false;

  constructor(options: ChatUiOptions) {
    this.options = options;
  }

  isIngameChatOpen() {
    return this.ingameChatOpen;
  }

  setIngameChatOpen(open: boolean, entries: ChatEntry[], visibleMs: number, fadeMs: number) {
    this.ingameChatOpen = open;
    if (this.options.ingameChatWrap) {
      this.options.ingameChatWrap.classList.toggle('open', open);
    }
    if (this.options.ingameChatInputRow) {
      this.options.ingameChatInputRow.classList.toggle('collapsed', !open);
      this.options.ingameChatInputRow.classList.remove('hidden');
    }
    if (open) {
      this.options.clearKeyboardState();
    }
    if (open && this.options.ingameChatInput) {
      this.options.ingameChatInput.focus();
    }
    if (!open && this.options.ingameChatInput) {
      this.options.ingameChatInput.blur();
    }
    this.updateChatUi(entries, visibleMs, fadeMs);
  }

  updateIngameVisibility(
    netplayEnabled: boolean,
    running: boolean,
    overlayVisible: boolean,
    entries: ChatEntry[],
    visibleMs: number,
    fadeMs: number,
  ) {
    if (!this.options.ingameChatWrap) {
      return;
    }
    const shouldShow = netplayEnabled && running && !overlayVisible;
    this.options.ingameChatWrap.classList.toggle('hidden', !shouldShow);
    if (!shouldShow) {
      this.setIngameChatOpen(false, entries, visibleMs, fadeMs);
    }
  }

  updateChatUi(entries: ChatEntry[], visibleMs: number, fadeMs: number) {
    const nowMs = Date.now();
    this.renderChatList(this.options.lobbyChatList, entries, {
      limit: null,
      nowMs,
      fade: false,
      maxAgeMs: visibleMs,
      fadeMs,
    });
    if (this.ingameChatOpen) {
      this.renderChatList(this.options.ingameChatList, entries, {
        limit: 8,
        nowMs,
        fade: false,
        maxAgeMs: visibleMs,
        fadeMs,
      });
    } else {
      this.renderChatList(this.options.ingameChatList, entries, {
        limit: 6,
        nowMs,
        fade: true,
        maxAgeMs: visibleMs,
        fadeMs,
      });
    }
  }

  isTextInputElement(el: Element | null) {
    if (!el) {
      return false;
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return true;
    }
    return (el as HTMLElement).isContentEditable;
  }

  blurActiveInput() {
    const active = document.activeElement as HTMLElement | null;
    if (!active) {
      return;
    }
    if (this.isTextInputElement(active)) {
      active.blur();
    }
  }

  private renderChatList(target: HTMLElement | null, entriesIn: ChatEntry[], options: RenderOptions) {
    if (!target) {
      return;
    }
    const { limit, nowMs, fade, maxAgeMs, fadeMs } = options;
    const shouldStick = target.scrollHeight - target.scrollTop - target.clientHeight < 12;
    target.innerHTML = '';
    let entries = entriesIn;
    if (fade) {
      entries = entries.filter((entry) => nowMs - entry.time <= maxAgeMs + fadeMs);
    }
    if (limit) {
      entries = entries.slice(-limit);
    }
    const totalFadeMs = maxAgeMs + fadeMs;
    const totalFadeSec = totalFadeMs / 1000;
    for (const entry of entries) {
      const line = document.createElement('div');
      line.className = 'chat-line';
      if (fade) {
        const ageMs = Math.max(0, nowMs - entry.time);
        const ageSec = Math.min(ageMs, totalFadeMs) / 1000;
        line.classList.add('chat-fade');
        line.style.animationDuration = `${totalFadeSec}s`;
        line.style.animationDelay = `${-ageSec}s`;
      }
      const name = this.options.getDisplayName(entry.playerId);
      const nameSpan = document.createElement('span');
      nameSpan.className = 'chat-name';
      nameSpan.textContent = name;
      const sep = document.createElement('span');
      sep.textContent = ':';
      const textSpan = document.createElement('span');
      textSpan.className = 'chat-text';
      textSpan.textContent = entry.text;
      line.append(nameSpan, sep, textSpan);
      target.appendChild(line);
    }
    if (shouldStick) {
      target.scrollTop = target.scrollHeight;
    }
  }
}
