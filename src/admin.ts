type AdminEntry = {
  entryId: string;
  displayName: string;
  value: number;
  createdAt: number;
};

const adminPasswordInput = document.getElementById('admin-password') as HTMLInputElement | null;
const adminLoginButton = document.getElementById('admin-login') as HTMLButtonElement | null;
const adminStatus = document.getElementById('admin-status') as HTMLElement | null;
const adminLoginSection = document.getElementById('admin-login-section') as HTMLElement | null;
const adminActionsSection = document.getElementById('admin-actions-section') as HTMLElement | null;
const adminAllowlistSection = document.getElementById('admin-allowlist-section') as HTMLElement | null;
const adminTypeSelect = document.getElementById('admin-type') as HTMLSelectElement | null;
const adminRefreshButton = document.getElementById('admin-refresh') as HTMLButtonElement | null;
const adminLeaderboards = document.getElementById('admin-leaderboards') as HTMLElement | null;
const adminAllowlistField = document.getElementById('admin-allowlist') as HTMLTextAreaElement | null;
const adminAllowlistSave = document.getElementById('admin-allowlist-save') as HTMLButtonElement | null;

const baseUrl = ((window as any).LEADERBOARD_URL ?? (window as any).LOBBY_URL ?? '').replace(/\/+$/, '');
const tokenKey = 'smb_admin_token';

function setAdminStatus(text: string) {
  if (adminStatus) {
    adminStatus.textContent = text;
  }
}

function getToken() {
  return sessionStorage.getItem(tokenKey);
}

function setToken(token: string | null) {
  if (!token) {
    sessionStorage.removeItem(tokenKey);
  } else {
    sessionStorage.setItem(tokenKey, token);
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, init);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error ?? `http_${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function login() {
  const password = adminPasswordInput?.value ?? '';
  if (!password) {
    setAdminStatus('Admin: enter password');
    return;
  }
  setAdminStatus('Admin: logging in...');
  const data = await fetchJson<{ token: string }>('/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  setToken(data.token);
  adminLoginSection?.classList.add('hidden');
  adminActionsSection?.classList.remove('hidden');
  adminAllowlistSection?.classList.remove('hidden');
  setAdminStatus('Admin: logged in');
  await refreshLeaderboards();
  await refreshAllowlist();
}

async function refreshLeaderboards() {
  const token = getToken();
  if (!token || !adminLeaderboards) {
    return;
  }
  const type = adminTypeSelect?.value ?? 'stage';
  setAdminStatus('Admin: loading...');
  const data = await fetchJson<{ entries: AdminEntry[] }>(`/admin/leaderboards?type=${type}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  adminLeaderboards.innerHTML = '';
  if (!data.entries || data.entries.length === 0) {
    adminLeaderboards.textContent = 'No entries.';
    setAdminStatus('Admin: ready');
    return;
  }
  data.entries.forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row admin-row';
    const rank = document.createElement('div');
    rank.className = 'leaderboard-rank';
    rank.textContent = String(index + 1);
    const name = document.createElement('div');
    name.textContent = entry.displayName || 'Anonymous';
    const value = document.createElement('div');
    value.className = 'leaderboard-value';
    value.textContent = String(entry.value);
    const remove = document.createElement('button');
    remove.className = 'ghost compact';
    remove.textContent = 'Delete';
    remove.addEventListener('click', async () => {
      const confirmed = window.confirm('Delete this entry?');
      if (!confirmed) {
        return;
      }
      await fetchJson(`/admin/entries/${entry.entryId}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      });
      void refreshLeaderboards();
    });
    row.append(rank, name, value, remove);
    adminLeaderboards.appendChild(row);
  });
  setAdminStatus('Admin: ready');
}

async function refreshAllowlist() {
  const token = getToken();
  if (!token || !adminAllowlistField) {
    return;
  }
  const data = await fetchJson<{ packs: Array<{ packId: string; label: string }> }>('/admin/allowlist', {
    headers: { authorization: `Bearer ${token}` },
  });
  const lines = (data.packs ?? []).map((entry) => `${entry.packId}${entry.label && entry.label !== entry.packId ? `|${entry.label}` : ''}`);
  adminAllowlistField.value = lines.join('\n');
}

async function saveAllowlist() {
  const token = getToken();
  if (!token || !adminAllowlistField) {
    return;
  }
  const packs = adminAllowlistField.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [packId, label] = line.split('|').map((part) => part.trim());
      return { packId, label };
    });
  await fetchJson('/admin/allowlist', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ packs }),
  });
  setAdminStatus('Admin: allowlist saved');
}

adminLoginButton?.addEventListener('click', () => {
  void login().catch((error) => {
    console.error(error);
    setAdminStatus('Admin: login failed');
  });
});

adminRefreshButton?.addEventListener('click', () => {
  void refreshLeaderboards().catch((error) => {
    console.error(error);
    setAdminStatus('Admin: refresh failed');
  });
});

adminTypeSelect?.addEventListener('change', () => {
  void refreshLeaderboards();
});

adminAllowlistSave?.addEventListener('click', () => {
  void saveAllowlist().catch((error) => {
    console.error(error);
    setAdminStatus('Admin: save failed');
  });
});

const existingToken = getToken();
if (existingToken) {
  adminLoginSection?.classList.add('hidden');
  adminActionsSection?.classList.remove('hidden');
  adminAllowlistSection?.classList.remove('hidden');
  void refreshLeaderboards();
  void refreshAllowlist();
  setAdminStatus('Admin: logged in');
}
