const express = require('express');
const jwt = require('jsonwebtoken');
const { getDb, hashPassword, verifyPassword } = require('../db');
const { JWT_SECRET, authenticateAny } = require('../middleware/auth');

const router = express.Router();

router.post('/signup', async (req, res) => {
  try {
    const { username, password, familyCode } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const db = getDb();
    const count = Number((await db.execute('SELECT COUNT(*) AS count FROM users')).rows[0].count);
    const firstUser = count === 0;

    // Everyone after the first person needs the family code, and then waits for approval.
    if (!firstUser) {
      const code = (await db.execute("SELECT value FROM settings WHERE key = 'family_code'")).rows[0]?.value;
      if (!familyCode || !code || String(familyCode).trim().toUpperCase() !== code) {
        return res.status(403).json({ error: 'That family code is not right. Ask the head of your family for the current code.', badCode: true });
      }
    }

    const existing = await db.execute({ sql: 'SELECT id FROM users WHERE username = ?', args: [username.toLowerCase()] });
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const hashedPassword = hashPassword(password);
    await db.execute({
      sql: 'INSERT INTO users (username, password, role, status) VALUES (?, ?, ?, ?)',
      args: [username.toLowerCase(), hashedPassword, firstUser ? 'head' : 'member', firstUser ? 'approved' : 'pending'],
    });

    const user = (await db.execute({ sql: 'SELECT * FROM users WHERE username = ?', args: [username.toLowerCase()] })).rows[0];
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({ token, username: user.username, role: user.role, status: user.status });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const db = getDb();
    const result = await db.execute({ sql: 'SELECT * FROM users WHERE username = ?', args: [username.toLowerCase()] });
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = verifyPassword(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, username: user.username, role: user.role, status: user.status });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/change-password', authenticateAny, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    const db = getDb();
    const result = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [req.user.id] });
    const user = result.rows[0];

    const validPassword = verifyPassword(currentPassword, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = hashPassword(newPassword);
    await db.execute({ sql: 'UPDATE users SET password = ? WHERE id = ?', args: [hashedPassword, req.user.id] });

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/verify', authenticateAny, (req, res) => {
  res.json({ valid: true, username: req.user.username, role: req.user.role, status: req.user.status });
});

module.exports = router;
