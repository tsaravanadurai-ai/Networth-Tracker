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

      // Get gold savings for this member
      const memberGold = await db.execute({
        sql: 'SELECT COALESCE(SUM(grams), 0) as totalGrams, COALESCE(SUM(purchase_amount), 0) as totalPurchase FROM gold_savings WHERE family_member_id = ?',
        args: [member.id]
      });
      const goldGrams = memberGold.rows[0].totalGrams || 0;
      const goldPurchaseValue = memberGold.rows[0].totalPurchase || 0;

      // Get share holdings for this member (for selected month)
      const memberShares = await db.execute({
        sql: 'SELECT COALESCE(SUM(invested), 0) as sharesInvested, COALESCE(SUM(current_value), 0) as sharesCurrent FROM share_holdings WHERE family_member_id = ? AND year = ? AND month = ?',
        args: [member.id, year, month]
      });
      const sharesInvested = memberShares.rows[0].sharesInvested || 0;
      const sharesCurrent = memberShares.rows[0].sharesCurrent || 0;

      const totalInterest = totalCurrentValue - totalInvested;
      const netWorth = totalCurrentValue - totalDebt;
      const interestPercentage = totalInvested > 0 ? parseFloat(((totalInterest / totalInvested) * 100).toFixed(2)) : 0;

      summary.push({
        member, totalInvested, totalCurrentValue, totalInterest, totalDebt, netWorth, interestPercentage,
        categoryBreakdown, entryCount: entries.length, goldGrams, goldPurchaseValue, sharesInvested, sharesCurrent
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

    // Calculate gold savings value
    const goldSavings = await db.execute('SELECT COALESCE(SUM(grams), 0) as totalGrams, COALESCE(SUM(purchase_amount), 0) as totalPurchase FROM gold_savings');
    const totalGoldGrams = goldSavings.rows[0].totalGrams || 0;
    const totalGoldPurchase = goldSavings.rows[0].totalPurchase || 0;

    // Get gold price for the selected month (or latest available)
    let goldPriceResult = await db.execute({ sql: 'SELECT price_per_gram FROM gold_prices WHERE year = ? AND month = ? LIMIT 1', args: [year, month] });
    if (goldPriceResult.rows.length === 0) {
      goldPriceResult = await db.execute('SELECT price_per_gram FROM gold_prices ORDER BY year DESC, month DESC LIMIT 1');
    }
    const goldPricePerGram = goldPriceResult.rows.length > 0 ? goldPriceResult.rows[0].price_per_gram : 0;
    const goldCurrentValue = totalGoldGrams * goldPricePerGram;

    consolidated.bankReserve = bankReserves.rows[0].total;
    consolidated.debtGiven = debtGiven.rows[0].total;
    consolidated.goldGrams = totalGoldGrams;
    consolidated.goldPurchaseValue = totalGoldPurchase;
    consolidated.goldCurrentValue = goldCurrentValue;
    consolidated.goldPricePerGram = goldPricePerGram;
    // Share holdings totals for this month
    const shareHoldings = await db.execute({
      sql: 'SELECT COALESCE(SUM(invested), 0) as totalSharesInvested, COALESCE(SUM(current_value), 0) as totalSharesCurrent FROM share_holdings WHERE year = ? AND month = ?',
      args: [year, month]
    });
    consolidated.sharesInvested = shareHoldings.rows[0].totalSharesInvested || 0;
    consolidated.sharesCurrent = shareHoldings.rows[0].totalSharesCurrent || 0;
    consolidated.sharesPnl = consolidated.sharesCurrent - consolidated.sharesInvested;

    consolidated.totalNetWorth = consolidated.netWorth + bankReserves.rows[0].total + debtGiven.rows[0].total + goldCurrentValue + consolidated.sharesCurrent;

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

    // Add gold savings value to each month in consolidated trend
    const goldEntries = (await db.execute('SELECT family_member_id, grams, purchase_amount, purchase_month, purchase_year FROM gold_savings')).rows;
    const goldPrices = (await db.execute('SELECT year, month, price_per_gram FROM gold_prices ORDER BY year, month')).rows;

    const goldPriceMap = {};
    goldPrices.forEach(p => { goldPriceMap[`${p.year}-${p.month}`] = p.price_per_gram; });
    const getGoldPrice = (year, month) => {
      if (goldPriceMap[`${year}-${month}`]) return goldPriceMap[`${year}-${month}`];
      let latest = 0;
      for (const p of goldPrices) {
        if (p.year < year || (p.year === year && p.month <= month)) latest = p.price_per_gram;
      }
      return latest;
    };

    consolidated.forEach(row => {
      let goldGrams = 0, goldPurchaseValue = 0;
      goldEntries.forEach(g => {
        if (g.purchase_year < row.year || (g.purchase_year === row.year && g.purchase_month <= row.month)) {
          goldGrams += g.grams;
          goldPurchaseValue += g.purchase_amount;
        }
      });
      const goldCurrentValue = goldGrams * getGoldPrice(row.year, row.month);
      row.invested += goldPurchaseValue;
      row.currentValue += goldCurrentValue;
      row.interest = row.currentValue - row.invested;
      row.netWorth = row.currentValue - row.debt;
    });

    for (const member of members) {
      const memberGold = goldEntries.filter(g => g.family_member_id === member.id);
      if (memberGold.length === 0) continue;
      const memberTrend = allTrends[member.id] || [];
      memberTrend.forEach(row => {
        let goldGrams = 0, goldPurchaseValue = 0;
        memberGold.forEach(g => {
          if (g.purchase_year < row.year || (g.purchase_year === row.year && g.purchase_month <= row.month)) {
            goldGrams += g.grams;
            goldPurchaseValue += g.purchase_amount;
          }
        });
        const goldCurrentValue = goldGrams * getGoldPrice(row.year, row.month);
        row.invested += goldPurchaseValue;
        row.currentValue += goldCurrentValue;
        row.interest = row.currentValue - row.invested;
        row.netWorth = row.currentValue - row.debt;
      });
    }

    // Add share holdings to each month in consolidated trend
    const shareHoldingsAll = (await db.execute('SELECT family_member_id, year, month, SUM(invested) as invested, SUM(current_value) as current_value FROM share_holdings GROUP BY family_member_id, year, month')).rows;

    const sharesByMonth = {};
    shareHoldingsAll.forEach(s => {
      const key = `${s.year}-${s.month}`;
      if (!sharesByMonth[key]) sharesByMonth[key] = { invested: 0, currentValue: 0 };
      sharesByMonth[key].invested += s.invested;
      sharesByMonth[key].currentValue += s.current_value;
    });

    consolidated.forEach(row => {
      const key = `${row.year}-${row.month}`;
      const shares = sharesByMonth[key];
      if (shares) {
        row.invested += shares.invested;
        row.currentValue += shares.currentValue;
        row.interest = row.currentValue - row.invested;
        row.netWorth = row.currentValue - row.debt;
      }
    });

    // Also add shares that exist in months not yet in consolidated
    Object.entries(sharesByMonth).forEach(([key, shares]) => {
      if (!consolidated.find(c => `${c.year}-${c.month}` === key)) {
        const [y, m] = key.split('-').map(Number);
        consolidated.push({
          year: y, month: m, label: `${getMonthName(m)} ${y}`,
          invested: shares.invested, currentValue: shares.currentValue,
          interest: shares.currentValue - shares.invested, debt: 0,
          netWorth: shares.currentValue
        });
      }
    });
    consolidated.sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

    // Add shares to per-member trends
    for (const member of members) {
      const memberShares = shareHoldingsAll.filter(s => s.family_member_id === member.id);
      if (memberShares.length === 0) continue;
      const memberTrend = allTrends[member.id] || [];
      memberShares.forEach(s => {
        const existing = memberTrend.find(r => r.year === s.year && r.month === s.month);
        if (existing) {
          existing.invested += s.invested;
          existing.currentValue += s.current_value;
          existing.interest = existing.currentValue - existing.invested;
          existing.netWorth = existing.currentValue - existing.debt;
        } else {
          memberTrend.push({
            year: s.year, month: s.month, label: `${getMonthName(s.month)} ${s.year}`,
            invested: s.invested, currentValue: s.current_value,
            interest: s.current_value - s.invested, debt: 0, netWorth: s.current_value
          });
        }
      });
      memberTrend.sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
    }

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
