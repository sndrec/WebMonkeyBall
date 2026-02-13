type NetplayDebugOptions = {
  storageKey: string;
};

export function createNetplayDebugState(options: NetplayDebugOptions) {
  function isNetplayDebugEnabled() {
    const globalFlag = (window as any).NETPLAY_DEBUG;
    if (globalFlag !== undefined) {
      return !!globalFlag;
    }
    try {
      return localStorage.getItem(options.storageKey) === '1';
    } catch {
      return false;
    }
  }

  function setNetplayDebugEnabled(enabled: boolean) {
    (window as any).NETPLAY_DEBUG = enabled;
    try {
      localStorage.setItem(options.storageKey, enabled ? '1' : '0');
    } catch {
      // Ignore storage issues.
    }
  }

  (window as any).setNetplayDebug = setNetplayDebugEnabled;

  return {
    isNetplayDebugEnabled,
    setNetplayDebugEnabled,
  };
}
