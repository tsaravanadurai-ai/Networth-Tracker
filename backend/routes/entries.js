const express = require('express');
const { getDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

const DEBT_CATEGORIES = ['Personal Loan (Debt)', 'Home Loan (Debt)', 'Car Loan (Debt)', 'Other Loan (Debt)'];

function isDebtCategory(category) {
  return DEBT_CATEGORIES.includes(category) || category.toLowerCase().includes('loan') || category.toLowerCase().includes('debt');
}

router.get('/members', async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute('SELECT * FROM family_members');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/debt-categories', (req, res) => {
  res.json(DEBT_CATEGORIES);
});

router.get('/:memberId/:year/:month', async (req, res) => {
  try {
    const { memberId, year, month } = req.params;
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM monthly_entries WHERE family_member_id = ? AND year = ? AND month = ? ORDER BY category, description',
      args: [memberId, year, month]
    });
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM monthly_entries WHERE family_member_id = ? ORDER BY year DESC, month DESC, category, description',
      args: [memberId]
    });
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { family_member_id, month, year, category, description, invested_amount, current_value, debt_amount } = req.body;

    if (!family_member_id || !month || !year || !category) {
      return res.status(400).json({ error: 'Member, month, year, and category are required' });
    }

    const db = getDb();
    const desc = description || category;
    let invAmount = 0, curValue = 0;

    if (isDebtCategory(category)) {
      const debtAmt = parseFloat(debt_amount) || parseFloat(current_value) || 0;
      curValue = -Math.abs(debtAmt);
    } else {
      invAmount = parseFloat(invested_amount) || 0;
      curValue = parseFloat(current_value) || 0;
    }

    const result = await db.execute({
      sql: 'INSERT INTO monthly_entries (family_member_id, month, year, category, description, invested_amount, current_value) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [family_member_id, month, year, category, desc, invAmount, curValue]
    });

    res.json({ id: Number(result.lastInsertRowid), message: 'Entry added successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { family_member_id, month, year, category, description, invested_amount, current_value, debt_amount } = req.body;
    const db = getDb();
    const desc = description || category;
    let invAmount = 0, curValue = 0;

    if (isDebtCategory(category)) {
      const debtAmt = parseFloat(debt_amount) || parseFloat(current_value) || 0;
      curValue = -Math.abs(debtAmt);
    } else {
      invAmount = parseFloat(invested_amount) || 0;
      curValue = parseFloat(current_value) || 0;
    }

    await db.execute({
      sql: 'UPDATE monthly_entries SET family_member_id = ?, month = ?, year = ?, category = ?, description = ?, invested_amount = ?, current_value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      args: [family_member_id, month, year, category, desc, invAmount, curValue, id]
    });

    res.json({ message: 'Entry updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    await db.execute({ sql: 'DELETE FROM monthly_entries WHERE id = ?', args: [req.params.id] });
    res.json({ message: 'Entry deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bulk', async (req, res) => {
  try {
    const { entries } = req.body;
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'Entries array is required' });
    }

    const db = getDb();
    const stmts = entries.map(entry => ({
      sql: 'INSERT INTO monthly_entries (family_member_id, month, year, category, description, invested_amount, current_value) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [entry.family_member_id, entry.month, entry.year, entry.category, entry.description || entry.category, entry.invested_amount || 0, entry.current_value || 0]
    }));
    await db.batch(stmts);
    res.json({ message: `${entries.length} entries added successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: get previous N months as [{month, year}, ...]
function getPrevMonths(month, year, count) {
  const result = [];
  let m = month, y = year;
  for (let i = 0; i < count; i++) {
    m--;
    if (m < 1) { m = 12; y--; }
    result.push({ month: m, year: y });
  }
  return result;
}

router.post('/copy-month', async (req, res) => {
  try {
    const { fromMonth, fromYear, toMonth, toYear } = req.body;
    if (!fromMonth || !fromYear || !toMonth || !toYear) {
      return res.status(400).json({ error: 'Source and destination month/year are required' });
    }

    const db = getDb();
    const existing = await db.execute({ sql: 'SELECT COUNT(*) as count FROM monthly_entries WHERE month = ? AND year = ?', args: [toMonth, toYear] });
    if (existing.rows[0].count > 0) {
      return res.status(400).json({ error: 'Destination month already has entries.' });
    }

    const source = await db.execute({
      sql: 'SELECT family_member_id, category, description, invested_amount, current_value FROM monthly_entries WHERE month = ? AND year = ?',
      args: [fromMonth, fromYear]
    });
    if (source.rows.length === 0) {
      return res.status(404).json({ error: 'No entries found for the source month' });
    }

    // Smart projection: look back 3 months to detect arithmetic progression
    // Get entries for the 3 months before the destination month (including source)
    const prev3 = getPrevMonths(parseInt(toMonth), parseInt(toYear), 3);
    const historyEntries = {};
    for (const pm of prev3) {
      const rows = (await db.execute({
        sql: 'SELECT family_member_id, category, description, invested_amount, current_value FROM monthly_entries WHERE month = ? AND year = ?',
        args: [pm.month, pm.year]
      })).rows;
      rows.forEach(r => {
        const key = `${r.family_member_id}|${r.category}|${r.description}`;
        if (!historyEntries[key]) historyEntries[key] = [];
        historyEntries[key].push({ month: pm.month, year: pm.year, invested: r.invested_amount, current: r.current_value });
      });
    }

    // For each entry, sort history chronologically and detect constant increment
    let projected = 0;
    const stmts = source.rows.map(e => {
      const key = `${e.family_member_id}|${e.category}|${e.description}`;
      const history = (historyEntries[key] || []).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

      let newInvested = e.invested_amount;
      let newCurrent = e.current_value;

      if (history.length >= 3) {
        // Check invested_amount for arithmetic progression
        const invVals = history.map(h => h.invested);
        const invDiff1 = invVals[1] - invVals[0];
        const invDiff2 = invVals[2] - invVals[1];
        // Allow small floating point tolerance
        if (Math.abs(invDiff1 - invDiff2) < 0.01 && invDiff1 !== 0) {
          newInvested = invVals[2] + invDiff1;
          projected++;
        }

        // Check current_value for arithmetic progression
        const curVals = history.map(h => h.current);
        const curDiff1 = curVals[1] - curVals[0];
        const curDiff2 = curVals[2] - curVals[1];
        if (Math.abs(curDiff1 - curDiff2) < 0.01 && curDiff1 !== 0) {
          newCurrent = curVals[2] + curDiff1;
        }
      }

      return {
        sql: 'INSERT INTO monthly_entries (family_member_id, month, year, category, description, invested_amount, current_value) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [e.family_member_id, toMonth, toYear, e.category, e.description, parseFloat(newInvested.toFixed(2)), parseFloat(newCurrent.toFixed(2))]
      };
    });
    await db.batch(stmts);
    const projMsg = projected > 0 ? ` (${projected} entries auto-incremented based on pattern)` : '';
    res.json({ message: `${source.rows.length} entries copied successfully${projMsg}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
