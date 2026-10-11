// Per-tab permissions for a login: 'none', 'view' or 'edit'.
// The head of the family, and logins with no saved permissions, can edit everything.

const TABS = {
  home: { label: 'Home', levels: ['none', 'view', 'edit'] },
  dashboard: { label: 'Dashboard', levels: ['none', 'view'] },
  entries: { label: 'Monthly Entry', levels: ['none', 'view', 'edit'] },
  reports: { label: 'Reports', levels: ['none', 'view'] },
  shares: { label: 'Shares', levels: ['none', 'view', 'edit'] },
  extras: { label: 'Gold/Bank/Debt', levels: ['none', 'view', 'edit'] },
  gold: { label: 'Gold Prices', levels: ['none', 'view', 'edit'] },
};
const RANK = { none: 0, view: 1, edit: 2 };

// What a newly approved login gets: full use of Home, view-only for the rest.
const NEW_LOGIN_PERMS = { home: 'edit', dashboard: 'view', entries: 'view', reports: 'view', shares: 'view', extras: 'view', gold: 'view' };

function fullPerms() {
  const p = {};
  for (const [k, t] of Object.entries(TABS)) p[k] = t.levels[t.levels.length - 1];
  return p;
}

function clean(input) {
  const out = {};
  for (const [k, t] of Object.entries(TABS)) {
    const v = input && input[k];
    out[k] = t.levels.includes(v) ? v : 'none';
  }
  return out;
}

function effectivePerms(u) {
  if (u.role === 'head' || u.perms == null) return fullPerms();
  try { return clean(JSON.parse(u.perms)); } catch (e) { return clean({}); }
}

const at = (perms, tab, level) => RANK[perms[tab] || 'none'] >= RANK[level];

// Decide whether this API call is allowed. Returns null if fine, or an error body.
function checkApi(perms, baseUrl, method) {
  const read = method === 'GET' || method === 'HEAD';
  const viewOnly = { status: 403, body: { error: "You can view this page but not change it. Ask the head of the family for edit access.", viewOnly: true } };
  const noAccess = { status: 403, body: { error: "You don't have access to this page.", noTab: true } };
  const need = (tab) => (read ? (at(perms, tab, 'view') ? null : noAccess) : (at(perms, tab, 'edit') ? null : (at(perms, tab, 'view') ? viewOnly : noAccess)));

  switch (baseUrl) {
    case '/api/household': return need('home');
    case '/api/shares': return need('shares');
    case '/api/extras': return need('extras');
    case '/api/excel': return need('entries');
    case '/api/reports': // Dashboard and Reports only read
      return at(perms, 'dashboard', 'view') || at(perms, 'reports', 'view') ? null : noAccess;
    case '/api/entries': // also read by the Dashboard's member pages
      if (read && (at(perms, 'entries', 'view') || at(perms, 'dashboard', 'view') || at(perms, 'reports', 'view'))) return null;
      return need('entries');
    case '/api/gold': // prices are shared reference data; changing them needs edit
      return read ? null : need('gold');
    default: return null;
  }
}

module.exports = { TABS, NEW_LOGIN_PERMS, effectivePerms, clean, checkApi, fullPerms };
