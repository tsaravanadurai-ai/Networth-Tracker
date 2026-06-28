const express = require('express');
const { getDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

function isDebtCategory(category) {
  return category.toLowerCase().includes('loan') || category.toLowerCase().includes('debt');
}

function getMonthName(month) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[month - 1] || '';
}

router.get('/summary/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    const db = getDb();

    const membersResult = await db.execute('SELECT * FROM family_members');
    const members = membersResult.rows;

    const summary = [];
    for (const member of members) {
      const entriesResult = await db.execute({
        sql: 'SELECT * FROM monthly_entries WHERE family_member_id = ? AND year = ? AND month = ?',
        args: [member.id, year, month]
      });
      const entries = entriesResult.rows;

      let totalInvested = 0, totalCurrentValue = 0, totalDebt = 0;
      const categoryBreakdown = {};

      entries.forEach(entry => {
        if (!categoryBreakdown[entry.category]) {
          categoryBreakdown[entry.category] = { invested: 0, currentValue: 0, isDebt: false, entries: [] };
        }
        if (isDebtCategory(entry.category)) {
          categoryBreakdown[entry.category].isDebt = true;
          const debtVal = Math.abs(entry.current_value);
          categoryBreakdown[entry.category].currentValue += debtVal;
          totalDebt += debtVal;
        } else {
          categoryBreakdown[entry.category].invested += entry.invested_amount;
          categoryBreakdown[entry.category].currentValue += entry.current_value;
          totalInvested += entry.invested_amount;
          totalCurrentValue += entry.current_value;
        }
        categoryBreakdown[entry.category].entries.push(entry);
      });

      const totalInterest = totalCurrentValue - totalInvested;
      const netWorth = totalCurrentValue - totalDebt;
      const interestPercentage = totalInvested > 0 ? parseFloat(((totalInterest / totalInvested) * 100).toFixed(2)) : 0;

      summary.push({
        member, totalInvested, totalCurrentValue, totalInterest, totalDebt, netWorth, interestPercentage,
        categoryBreakdown, entryCount: entries.length
      });
    }

    const consolidated = {
      totalInvested: summary.reduce((sum, s) => sum + s.totalInvested, 0),
      totalCurrentValue: summary.reduce((sum, s) => sum + s.totalCurrentValue, 0),
      totalInterest: summary.reduce((sum, s) => sum + s.totalInterest, 0),
      totalDebt: summary.reduce((sum, s) => sum + s.totalDebt, 0),
      netWorth: summary.reduce((sum, s) => sum + s.netWorth, 0),
    };
    consolidated.interestPercentage = consolidated.totalInvested > 0
      ? parseFloat(((consolidated.totalInterest / consolidated.totalInvested) * 100).toFixed(2)) : 0;

    const bankReserves = await db.execute('SELECT COALESCE(SUM(amount), 0) as total FROM bank_reserves');
    const debtGiven = await db.execute("SELECT COALESCE(SUM(amount), 0) as total FROM debt_given WHERE status = 'pending'");

    consolidated.bankReserve = bankReserves.rows[0].total;
    consolidated.debtGiven = debtGiven.rows[0].total;
    consolidated.totalNetWorth = consolidated.netWorth + bankReserves.rows[0].total + debtGiven.rows[0].total;

    res.json({ summary, consolidated, month: parseInt(month), year: parseInt(year) });
  } catch (err) {
    console.error('Summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/trend/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;
    const db = getDb();

    const result = await db.execute({
      sql: `SELECT year, month, category, SUM(invested_amount) as total_invested, SUM(current_value) as total_current_value
            FROM monthly_entries WHERE family_member_id = ? GROUP BY year, month, category ORDER BY year ASC, month ASC`,
      args: [memberId]
    });

    const monthMap = {};
    result.rows.forEach(e => {
      const key = `${e.year}-${e.month}`;
      if (!monthMap[key]) monthMap[key] = { year: e.year, month: e.month, invested: 0, currentValue: 0, debt: 0 };
      if (isDebtCategory(e.category)) {
        monthMap[key].debt += Math.abs(e.total_current_value);
      } else {
        monthMap[key].invested += e.total_invested;
        monthMap[key].currentValue += e.total_current_value;
      }
    });

    const trend = Object.values(monthMap)
      .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
      .map(e => ({
        year: e.year, month: e.month, label: `${getMonthName(e.month)} ${e.year}`,
        invested: e.invested, currentValue: e.currentValue,
        interest: e.currentValue - e.invested, debt: e.debt, netWorth: e.currentValue - e.debt
      }));

    res.json(trend);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/trend-all', async (req, res) => {
  try {
    const db = getDb();
    const membersResult = await db.execute('SELECT * FROM family_members');
    const members = membersResult.rows;

    const allTrends = {};
    for (const member of members) {
      const result = await db.execute({
        sql: `SELECT year, month, category, SUM(invested_amount) as total_invested, SUM(current_value) as total_current_value
              FROM monthly_entries WHERE family_member_id = ? GROUP BY year, month, category ORDER BY year ASC, month ASC`,
        args: [member.id]
      });

      const monthMap = {};
      result.rows.forEach(e => {
        const key = `${e.year}-${e.month}`;
        if (!monthMap[key]) monthMap[key] = { year: e.year, month: e.month, invested: 0, currentValue: 0, debt: 0 };
        if (isDebtCategory(e.category)) {
          monthMap[key].debt += Math.abs(e.total_current_value);
        } else {
          monthMap[key].invested += e.total_invested;
          monthMap[key].currentValue += e.total_current_value;
        }
      });

      allTrends[member.id] = Object.values(monthMap)
        .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
        .map(e => ({
          year: e.year, month: e.month, label: `${getMonthName(e.month)} ${e.year}`,
          invested: e.invested, currentValue: e.currentValue,
          interest: e.currentValue - e.invested, debt: e.debt, netWorth: e.currentValue - e.debt
        }));
    }

    const consolidatedMap = {};
    Object.values(allTrends).forEach(memberTrend => {
      memberTrend.forEach(entry => {
        const key = `${entry.year}-${entry.month}`;
        if (!consolidatedMap[key]) {
          consolidatedMap[key] = { year: entry.year, month: entry.month, label: entry.label, invested: 0, currentValue: 0, interest: 0, debt: 0, netWorth: 0 };
        }
        consolidatedMap[key].invested += entry.invested;
        consolidatedMap[key].currentValue += entry.currentValue;
        consolidatedMap[key].interest += entry.interest;
        consolidatedMap[key].debt += entry.debt;
        consolidatedMap[key].netWorth += entry.netWorth;
      });
    });

    const consolidated = Object.values(consolidatedMap).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

    res.json({ members, trends: allTrends, consolidated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/available-months', async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute('SELECT DISTINCT year, month FROM monthly_entries ORDER BY year DESC, month DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
