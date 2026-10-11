// Limits a login to the family members the head of the family chose for it.
//
// Every request from a limited login runs inside a "scope" holding the allowed
// family_member ids. Each SQL statement that request sends is rewritten so it
// can only read or change rows that belong to those members. Doing it here,
// instead of in each route, means totals and summaries can't leak hidden members.

const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

// Tables holding one family member's data, and the column naming that member.
const MEMBER_TABLES = {
  family_members: 'id',
  monthly_entries: 'family_member_id',
  gold_savings: 'family_member_id',
  bank_reserves: 'family_member_id',
  debt_given: 'family_member_id',
  share_holdings: 'family_member_id',
  dividends: 'family_member_id',
};
const TABLE_RE = Object.keys(MEMBER_TABLES).join('|');
const NOT_ALIAS = new Set(['where', 'join', 'left', 'right', 'inner', 'outer', 'cross', 'natural', 'on', 'using',
  'order', 'group', 'limit', 'union', 'having', 'set', 'values', 'except', 'intersect', 'window']);

class NoAccessError extends Error {
  constructor() { super("You don't have access to that family member."); this.noAccess = true; }
}

function runScoped(allowedIds, fn) {
  return als.run({ ids: allowedIds.map(Number).filter(Number.isInteger) }, fn);
}

function currentScope() {
  return als.getStore() || null;
}

function inList(ids) {
  return ids.length ? ids.join(',') : '-1';
}

function rewriteSelect(sql, ids) {
  const list = inList(ids);
  const re = new RegExp(`\\b(FROM|JOIN)\\s+(${TABLE_RE})\\b(\\s+(?:AS\\s+)?([A-Za-z_][A-Za-z0-9_]*))?`, 'gi');
  return sql.replace(re, (m, kw, table, aliasPart, alias) => {
    const t = table.toLowerCase();
    const sub = `(SELECT * FROM ${t} WHERE ${MEMBER_TABLES[t]} IN (${list}))`;
    if (alias && !NOT_ALIAS.has(alias.toLowerCase())) return `${kw} ${sub} ${alias}`;
    return `${kw} ${sub} AS ${t}${aliasPart || ''}`;
  });
}

function addWhere(sql, cond) {
  const i = sql.search(/\bWHERE\b/i);
  if (i < 0) return `${sql.trimEnd().replace(/;$/, '')} WHERE ${cond}`;
  const head = sql.slice(0, i);
  const rest = sql.slice(i + 5).trim().replace(/;$/, '');
  return `${head}WHERE (${rest}) AND ${cond}`;
}

// Returns the rewritten statement, or throws NoAccessError.
function scopeStatement(stmt, ids) {
  const isObj = typeof stmt === 'object' && stmt !== null;
  const sql = isObj ? stmt.sql : stmt;
  const args = isObj && Array.isArray(stmt.args) ? stmt.args : [];
  const allowed = new Set(ids);
  const trimmed = sql.trim();
  const verb = trimmed.split(/\s+/)[0].toUpperCase();
  const out = s => (isObj ? { ...stmt, sql: s } : s);

  if (verb === 'SELECT' || verb === 'WITH') return out(rewriteSelect(sql, ids));

  if (verb === 'INSERT') {
    const m = trimmed.match(/^INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/i);
    const table = (m ? m[1] : (trimmed.match(/^INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i) || [])[1] || '').toLowerCase();
    if (!MEMBER_TABLES[table]) return stmt;
    if (table === 'family_members' || !m) throw new NoAccessError();
    const cols = m[2].split(',').map(c => c.trim().toLowerCase());
    const vals = m[3].split(',').map(v => v.trim());
    const ci = cols.indexOf('family_member_id');
    if (ci < 0) throw new NoAccessError();
    // Work out which positional ? holds family_member_id.
    let argIndex = -1, q = 0;
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] === '?') { if (i === ci) argIndex = q; q++; }
      else if (i === ci) { const lit = Number(vals[i]); if (!allowed.has(lit)) throw new NoAccessError(); return stmt; }
    }
    if (argIndex < 0 || !allowed.has(Number(args[argIndex]))) throw new NoAccessError();
    return stmt;
  }

  if (verb === 'UPDATE' || verb === 'DELETE') {
    const tm = verb === 'UPDATE' ? trimmed.match(/^UPDATE\s+(?:OR\s+\w+\s+)?(\w+)/i) : trimmed.match(/^DELETE\s+FROM\s+(\w+)/i);
    const table = ((tm && tm[1]) || '').toLowerCase();
    if (!MEMBER_TABLES[table]) return stmt;
    if (table === 'family_members') throw new NoAccessError();
    if (verb === 'UPDATE') {
      // Moving a row to another member: the new member must be allowed too.
      const set = trimmed.match(/\bSET\s+([\s\S]*?)\bWHERE\b/i);
      if (set) {
        const parts = set[1].split(',').map(p => p.trim());
        let q = 0;
        for (const p of parts) {
          const [col, val] = p.split('=').map(s => s.trim());
          const isParam = val === '?';
          if (col.toLowerCase() === 'family_member_id' && (!isParam || !allowed.has(Number(args[q])))) throw new NoAccessError();
          q += (p.match(/\?/g) || []).length;
        }
      }
    }
    return out(addWhere(sql, `${MEMBER_TABLES[table]} IN (${inList(ids)})`));
  }

  return stmt;
}

function wrapClient(client) {
  const scoped = fn => (...a) => {
    const s = currentScope();
    return s ? fn(s.ids, ...a) : null;
  };
  return {
    execute(stmt) {
      return (scoped((ids, st) => client.execute(scopeStatement(st, ids)))(stmt)) || client.execute(stmt);
    },
    batch(stmts, mode) {
      return (scoped((ids, list) => client.batch(list.map(st => scopeStatement(st, ids)), mode))(stmts)) || client.batch(stmts, mode);
    },
    executeMultiple(sql) {
      if (currentScope()) return Promise.reject(new NoAccessError());
      return client.executeMultiple(sql);
    },
    get raw() { return client; },
  };
}

module.exports = { runScoped, currentScope, wrapClient, scopeStatement, NoAccessError };
