export type NetplayDebugOverlay = {
  hide: () => void;
  show: (warning: string | null, lines: string[]) => void;
};

export function createNetplayDebugOverlay(parent: HTMLElement = document.body): NetplayDebugOverlay {
  const wrap = document.createElement('div');
  const warningEl = document.createElement('div');
  const infoEl = document.createElement('div');

  wrap.id = 'netplay-debug';
  wrap.style.position = 'fixed';
  wrap.style.left = '12px';
  wrap.style.top = '120px';
  wrap.style.zIndex = '10000';
  wrap.style.color = '#ffffff';
  wrap.style.font = '12px/1.4 system-ui, sans-serif';
  wrap.style.whiteSpace = 'pre';
  wrap.style.pointerEvents = 'none';
  wrap.style.textShadow = '0 1px 2px rgba(0,0,0,0.7)';
  wrap.style.display = 'none';

  warningEl.style.color = '#ff6666';
  warningEl.style.fontWeight = '600';
  warningEl.style.marginBottom = '4px';
  infoEl.style.whiteSpace = 'pre';

  wrap.append(warningEl, infoEl);
  parent.appendChild(wrap);

  return {
    hide: () => {
      wrap.style.display = 'none';
    },
    show: (warning, lines) => {
      warningEl.textContent = warning ?? '';
      infoEl.textContent = lines.join('\n');
      wrap.style.display = 'block';
    },
  };
}
