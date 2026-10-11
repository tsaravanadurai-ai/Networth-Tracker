const jwt = require('jsonwebtoken');
const { getDb } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'family-networth-secret-key-2024';

// Short cache so every API call doesn't hit the database for the user's status.
const cache = new Map();
const CACHE_MS = 10000;

async function loadUser(id) {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.u;
  const r = await getDb().execute({ sql: 'SELECT id, username, role, status FROM users WHERE id = ?', args: [id] });
  const u = r.rows[0] || null;
  cache.set(id, { u, t: Date.now() });
  return u;
}

function clearUserCache(id) {
  if (id === undefined) cache.clear(); else cache.delete(Number(id));
}

function makeAuth(requireApproved) {
  return async function (req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }

    try {
      const u = await loadUser(Number(decoded.id));
      if (!u) return res.status(401).json({ error: 'This account no longer exists.' });
      req.user = { id: Number(u.id), username: u.username, role: u.role, status: u.status };
      if (requireApproved && u.status !== 'approved') {
        return res.status(403).json({ error: 'Waiting for the head of the family to approve your request.', pending: true });
      }
      next();
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  };
}

// Every data route: signed in AND approved by the head of the family.
const authenticateToken = makeAuth(true);
// Account routes (verify, change password): signed in, approved or still waiting.
const authenticateAny = makeAuth(false);

function requireHead(req, res, next) {
  if (req.user && req.user.role === 'head') return next();
  return res.status(403).json({ error: 'Only the head of the family can do this.', notHead: true });
}

module.exports = { authenticateToken, authenticateAny, requireHead, clearUserCache, JWT_SECRET };
