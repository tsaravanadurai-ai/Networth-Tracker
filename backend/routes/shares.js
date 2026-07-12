const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const { getDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

const upload = multer({ dest: path.join(__dirname, '../uploads/') });

// Helper: map account name to family_member_id
async function getMemberMap(db) {
  const members = (await db.execute('SELECT id, name FROM family_members')).rows;
  const map = {};
  members.forEach(m => { map[m.name.toLowerCase()] = m.id; });
  return map;
}

function formatVal(v) {
  if (v >= 10000000) return (v / 10000000).toFixed(1) + 'Cr';
  if (v >= 100000) return (v / 100000).toFixed(1) + 'L';
  if (v >= 1000) return (v / 1000).toFixed(0) + 'K';
  return String(v);
}

function getMonthName(m) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[m - 1] || '';
}

// Parse month name from sheet tab like "Jul 2026", "Mar 2025"
function parseSheetName(name) {
  const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const match = name.trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;
  const monthNum = months[match[1].toLowerCase().substring(0, 3)];
  const year = parseInt(match[2]);
  if (!monthNum || !year) return null;
  return { month: monthNum, year };
}

// ============ HOLDINGS CRUD ============

// GET all holdings for a month (optional member filter)
router.get('/holdings', async (req, res) => {
  try {
    const { year, month, member_id } = req.query;
    const db = getDb();
    let sql = 'SELECT sh.*, fm.name as member_name, fm.color as member_color FROM share_holdings sh JOIN family_members fm ON sh.family_member_id = fm.id';
    const args = [];
    const conditions = [];
    if (year) { conditions.push('sh.year = ?'); args.push(parseInt(year)); }
    if (month) { conditions.push('sh.month = ?'); args.push(parseInt(month)); }
    if (member_id) { conditions.push('sh.family_member_id = ?'); args.push(parseInt(member_id)); }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY sh.current_value DESC';
    const result = await db.execute({ sql, args });
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET available months for holdings
router.get('/holdings-months', async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute('SELECT DISTINCT year, month FROM share_holdings ORDER BY year DESC, month DESC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST add single holding
router.post('/holdings', async (req, res) => {
  try {
    const { family_member_id, year, month, instrument, quantity, avg_cost, ltp } = req.body;
    if (!family_member_id || !year || !month || !instrument) return res.status(400).json({ error: 'Member, year, month, instrument required' });
    const qty = parseFloat(quantity) || 0;
    const avgC = parseFloat(avg_cost) || 0;
    const ltpVal = parseFloat(ltp) || 0;
    const invested = qty * avgC;
    const currentValue = qty * ltpVal;
    const pnl = currentValue - invested;
    const pnlPercent = invested > 0 ? ((pnl / invested) * 100) : 0;
    const db = getDb();
    await db.execute({
      sql: 'INSERT INTO share_holdings (family_member_id, year, month, instrument, quantity, avg_cost, ltp, invested, current_value, pnl, pnl_percent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [family_member_id, year, month, instrument.trim(), qty, avgC, ltpVal, invested, currentValue, pnl, parseFloat(pnlPercent.toFixed(2))]
    });
    res.json({ message: 'Holding added' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT update holding
router.put('/holdings/:id', async (req, res) => {
  try {
    const { family_member_id, year, month, instrument, quantity, avg_cost, ltp } = req.body;
    const qty = parseFloat(quantity) || 0;
    const avgC = parseFloat(avg_cost) || 0;
    const ltpVal = parseFloat(ltp) || 0;
    const invested = qty * avgC;
    const currentValue = qty * ltpVal;
    const pnl = currentValue - invested;
    const pnlPercent = invested > 0 ? ((pnl / invested) * 100) : 0;
    const db = getDb();
    await db.execute({
      sql: 'UPDATE share_holdings SET family_member_id = ?, year = ?, month = ?, instrument = ?, quantity = ?, avg_cost = ?, ltp = ?, invested = ?, current_value = ?, pnl = ?, pnl_percent = ? WHERE id = ?',
      args: [family_member_id, year, month, instrument.trim(), qty, avgC, ltpVal, invested, currentValue, pnl, parseFloat(pnlPercent.toFixed(2)), req.params.id]
    });
    res.json({ message: 'Holding updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE holding
router.delete('/holdings/:id', async (req, res) => {
  try {
    const db = getDb();
    await db.execute({ sql: 'DELETE FROM share_holdings WHERE id = ?', args: [req.params.id] });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ IMPORT SHARE TRACKER (multi-sheet Excel) ============
router.post('/import-holdings', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { family_member_id } = req.body; // optional now

    const workbook = XLSX.readFile(req.file.path);
    const db = getDb();
    const memberMap = await getMemberMap(db);
    // Get first member as fallback
    const firstMember = (await db.execute('SELECT id FROM family_members ORDER BY id LIMIT 1')).rows;
    const defaultMemberId = family_member_id ? parseInt(family_member_id) : (firstMember.length > 0 ? firstMember[0].id : 1);

    let totalImported = 0;
    const skippedSheets = [];

    for (const sheetName of workbook.SheetNames) {
      const parsed = parseSheetName(sheetName);
      if (!parsed) { skippedSheets.push(sheetName); continue; }

      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      // Check if sheet has a Member column
      const hasMemberCol = data.length > 0 && (data[0].hasOwnProperty('Member') || data[0].hasOwnProperty('member') || data[0].hasOwnProperty('Account') || data[0].hasOwnProperty('account'));

      if (hasMemberCol) {
        // Delete all entries for this month (all members) since sheet has member info
        await db.execute({
          sql: 'DELETE FROM share_holdings WHERE year = ? AND month = ?',
          args: [parsed.year, parsed.month]
        });
      } else if (family_member_id) {
        // Delete existing entries for the selected member/month
        await db.execute({
          sql: 'DELETE FROM share_holdings WHERE family_member_id = ? AND year = ? AND month = ?',
          args: [defaultMemberId, parsed.year, parsed.month]
        });
      } else {
        // No member col, no member selected — delete all for this month
        await db.execute({
          sql: 'DELETE FROM share_holdings WHERE year = ? AND month = ?',
          args: [parsed.year, parsed.month]
        });
      }

      for (const row of data) {
        const instrument = (row['Instrument'] || row['instrument'] || '').toString().trim();
        if (!instrument || instrument === '') continue;

        const qty = parseFloat(row['Qty.'] || row['Qty'] || row['quantity'] || 0) || 0;
        const avgCost = parseFloat(row['Avg. cost'] || row['Avg cost'] || row['avg_cost'] || 0) || 0;
        const ltp = parseFloat(row['LTP'] || row['ltp'] || 0) || 0;
        const invested = parseFloat(row['Invested'] || row['invested'] || 0) || 0;
        const curVal = parseFloat(row['Cur. val'] || row['Cur val'] || row['current_value'] || 0) || 0;
        const pnl = parseFloat(row['P&L'] || row['pnl'] || 0) || 0;
        let pnlPct = row['Overall %'] || row['overall_percent'] || 0;
        pnlPct = parseFloat(pnlPct) || 0;
        if (Math.abs(pnlPct) < 1 && pnlPct !== 0) pnlPct = pnlPct * 100;

        if (qty === 0 && invested === 0) continue;

        // Resolve member: from row column > from form > default
        let rowMemberId = defaultMemberId;
        if (hasMemberCol) {
          const memberName = (row['Member'] || row['member'] || row['Account'] || row['account'] || '').toString().trim().toLowerCase();
          if (memberName && memberMap[memberName]) {
            rowMemberId = memberMap[memberName];
          }
        }

        const finalInvested = invested > 0 ? invested : qty * avgCost;
        const finalCurVal = curVal > 0 ? curVal : qty * ltp;
        const finalPnl = finalCurVal - finalInvested;
        const finalPnlPct = finalInvested > 0 ? parseFloat(((finalPnl / finalInvested) * 100).toFixed(2)) : 0;

        await db.execute({
          sql: 'INSERT INTO share_holdings (family_member_id, year, month, instrument, quantity, avg_cost, ltp, invested, current_value, pnl, pnl_percent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          args: [rowMemberId, parsed.year, parsed.month, instrument, qty, avgCost, ltp, finalInvested, finalCurVal, finalPnl, finalPnlPct]
        });
        totalImported++;
      }
    }

    // Clean up uploaded file
    try { require('fs').unlinkSync(req.file.path); } catch (e) {}

    res.json({
      message: `Imported ${totalImported} holdings across ${workbook.SheetNames.length - skippedSheets.length} months`,
      skippedSheets: skippedSheets.length > 0 ? skippedSheets : undefined
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ DIVIDENDS CRUD ============

router.get('/dividends', async (req, res) => {
  try {
    const { member_id, year } = req.query;
    const db = getDb();
    let sql = 'SELECT d.*, fm.name as member_name, fm.color as member_color FROM dividends d JOIN family_members fm ON d.family_member_id = fm.id';
    const args = [];
    const conditions = [];
    if (member_id) { conditions.push('d.family_member_id = ?'); args.push(parseInt(member_id)); }
    if (year) { conditions.push("d.date LIKE ?"); args.push(`%${year}%`); }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY d.date DESC';
    const result = await db.execute({ sql, args });
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/dividends', async (req, res) => {
  try {
    const { family_member_id, date, stock_name, amount, notes } = req.body;
    if (!family_member_id || !date || !stock_name || !amount) return res.status(400).json({ error: 'Member, date, stock, amount required' });
    const db = getDb();
    await db.execute({
      sql: 'INSERT INTO dividends (family_member_id, date, stock_name, amount, notes) VALUES (?, ?, ?, ?, ?)',
      args: [family_member_id, date, stock_name.trim(), parseFloat(amount), notes || '']
    });
    res.json({ message: 'Dividend added' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/dividends/:id', async (req, res) => {
  try {
    const { family_member_id, date, stock_name, amount, notes } = req.body;
    const db = getDb();
    await db.execute({
      sql: 'UPDATE dividends SET family_member_id = ?, date = ?, stock_name = ?, amount = ?, notes = ? WHERE id = ?',
      args: [family_member_id, date, stock_name.trim(), parseFloat(amount), notes || '', req.params.id]
    });
    res.json({ message: 'Dividend updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/dividends/:id', async (req, res) => {
  try {
    const db = getDb();
    await db.execute({ sql: 'DELETE FROM dividends WHERE id = ?', args: [req.params.id] });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ IMPORT DIVIDENDS (single sheet Excel) ============
router.post('/import-dividends', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const db = getDb();
    const memberMap = await getMemberMap(db);

    let imported = 0, skipped = 0;
    for (const row of data) {
      const stockName = (row['Dividend'] || row['Stock'] || row['stock_name'] || '').toString().trim();
      const amount = parseFloat(row['Amount'] || row['amount'] || 0) || 0;
      const account = (row['Account'] || row['account'] || '').toString().trim().toLowerCase();
      let dateVal = row['Date'] || row['date'] || '';

      if (!stockName || !amount || !account) { skipped++; continue; }

      const memberId = memberMap[account];
      if (!memberId) { skipped++; continue; }

      // Parse date - handle Excel serial numbers
      if (typeof dateVal === 'number') {
        const excelDate = XLSX.SSF.parse_date_code(dateVal);
        dateVal = `${excelDate.y}-${String(excelDate.m).padStart(2, '0')}-${String(excelDate.d).padStart(2, '0')}`;
      } else {
        dateVal = dateVal.toString().trim();
        // Try to parse various date formats
        const d = new Date(dateVal);
        if (!isNaN(d.getTime())) {
          dateVal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
      }

      await db.execute({
        sql: 'INSERT INTO dividends (family_member_id, date, stock_name, amount, notes) VALUES (?, ?, ?, ?, ?)',
        args: [memberId, dateVal, stockName, amount, '']
      });
      imported++;
    }

    try { require('fs').unlinkSync(req.file.path); } catch (e) {}
    res.json({ message: `Imported ${imported} dividends${skipped > 0 ? `, skipped ${skipped} rows` : ''}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ EXPORT ============
router.get('/export', async (req, res) => {
  try {
    const db = getDb();

    // Holdings export - grouped by month
    const holdings = (await db.execute(
      'SELECT sh.*, fm.name as member_name FROM share_holdings sh JOIN family_members fm ON sh.family_member_id = fm.id ORDER BY sh.year DESC, sh.month DESC, sh.current_value DESC'
    )).rows;

    const dividends = (await db.execute(
      'SELECT d.*, fm.name as member_name FROM dividends d JOIN family_members fm ON d.family_member_id = fm.id ORDER BY d.date DESC'
    )).rows;

    const workbook = XLSX.utils.book_new();

    // Group holdings by month
    const monthGroups = {};
    holdings.forEach(h => {
      const key = `${getMonthName(h.month)} ${h.year}`;
      if (!monthGroups[key]) monthGroups[key] = [];
      monthGroups[key].push({
        'Member': h.member_name,
        'Instrument': h.instrument,
        'Qty': h.quantity,
        'Avg Cost': h.avg_cost,
        'LTP': h.ltp,
        'Invested': h.invested,
        'Current Value': h.current_value,
        'P&L': h.pnl,
        'Overall %': h.pnl_percent
      });
    });

    for (const [monthLabel, rows] of Object.entries(monthGroups)) {
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, ws, monthLabel.substring(0, 31));
    }

    // Dividends sheet
    if (dividends.length > 0) {
      const divRows = dividends.map((d, i) => ({
        'S.No': i + 1,
        'Date': d.date,
        'Stock': d.stock_name,
        'Account': d.member_name,
        'Amount': d.amount
      }));
      const divWs = XLSX.utils.json_to_sheet(divRows);
      XLSX.utils.book_append_sheet(workbook, divWs, 'Dividends');
    }

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Shares_Dividends_Export.xlsx');
    res.send(buffer);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ REPORTS / SUMMARY ============
router.get('/summary', async (req, res) => {
  try {
    const db = getDb();
    const { divYear } = req.query; // optional year filter for dividend reports
    const members = (await db.execute('SELECT * FROM family_members')).rows;

    // Get latest month with holdings data
    const latestMonth = (await db.execute('SELECT year, month FROM share_holdings ORDER BY year DESC, month DESC LIMIT 1')).rows;
    const latestYear = latestMonth.length > 0 ? latestMonth[0].year : new Date().getFullYear();
    const latestMon = latestMonth.length > 0 ? latestMonth[0].month : new Date().getMonth() + 1;

    // Build dividend year filter clause
    const divYearFilter = divYear ? " AND CAST(SUBSTR(date, 1, 4) AS INTEGER) = " + parseInt(divYear) : "";
    const divYearFilterWhere = divYear ? " WHERE CAST(SUBSTR(date, 1, 4) AS INTEGER) = " + parseInt(divYear) : "";

    // Per-member summary for latest month
    const memberSummaries = [];
    for (const m of members) {
      const holdings = (await db.execute({
        sql: 'SELECT COALESCE(SUM(invested), 0) as totalInvested, COALESCE(SUM(current_value), 0) as totalCurrent, COALESCE(SUM(pnl), 0) as totalPnl, COUNT(*) as stockCount FROM share_holdings WHERE family_member_id = ? AND year = ? AND month = ?',
        args: [m.id, latestYear, latestMon]
      })).rows[0];

      const divSql = divYear
        ? { sql: "SELECT COALESCE(SUM(amount), 0) as total FROM dividends WHERE family_member_id = ? AND CAST(SUBSTR(date, 1, 4) AS INTEGER) = ?", args: [m.id, parseInt(divYear)] }
        : { sql: 'SELECT COALESCE(SUM(amount), 0) as total FROM dividends WHERE family_member_id = ?', args: [m.id] };
      const totalDividends = (await db.execute(divSql)).rows[0].total;

      if (holdings.stockCount > 0 || totalDividends > 0) {
        memberSummaries.push({
          member: m,
          invested: holdings.totalInvested,
          currentValue: holdings.totalCurrent,
          pnl: holdings.totalPnl,
          pnlPercent: holdings.totalInvested > 0 ? parseFloat(((holdings.totalPnl / holdings.totalInvested) * 100).toFixed(2)) : 0,
          stockCount: holdings.stockCount,
          totalDividends
        });
      }
    }

    // Monthly trend
    const trend = (await db.execute(
      'SELECT year, month, SUM(invested) as invested, SUM(current_value) as current_value, SUM(pnl) as pnl FROM share_holdings GROUP BY year, month ORDER BY year ASC, month ASC'
    )).rows.map(r => ({
      ...r,
      label: `${getMonthName(r.month)} ${r.year}`,
      pnlPercent: r.invested > 0 ? parseFloat(((r.pnl / r.invested) * 100).toFixed(2)) : 0
    }));

    // Dividend by month (filtered by year if set)
    const dividendTrend = (await db.execute(
      "SELECT CAST(SUBSTR(date, 1, 4) AS INTEGER) as year, CAST(SUBSTR(date, 6, 2) AS INTEGER) as month, SUM(amount) as total FROM dividends" + divYearFilterWhere + " GROUP BY year, month ORDER BY year ASC, month ASC"
    )).rows.map(r => ({ ...r, label: `${getMonthName(r.month)} ${r.year}` }));

    // Total dividends (filtered)
    const totalDividends = (await db.execute('SELECT COALESCE(SUM(amount), 0) as total FROM dividends' + divYearFilterWhere)).rows[0].total;

    // All holdings grouped by instrument (latest month) - used for top holdings, company split, valuation distribution
    const allHoldingsGrouped = (await db.execute({
      sql: 'SELECT sh.instrument, SUM(sh.quantity) as qty, SUM(sh.invested) as invested, SUM(sh.current_value) as current_value, (SUM(sh.current_value) - SUM(sh.invested)) as pnl FROM share_holdings sh WHERE sh.year = ? AND sh.month = ? GROUP BY sh.instrument ORDER BY SUM(sh.current_value) DESC',
      args: [latestYear, latestMon]
    })).rows;

    const topHoldings = allHoldingsGrouped.slice(0, 10);

    // Valuation distribution - dynamic percentile-based buckets
    const valuationBuckets = (() => {
      if (!allHoldingsGrouped.length) return [];
      const values = allHoldingsGrouped.map(h => h.current_value).sort((a, b) => a - b);
      const max = values[values.length - 1];
      // Generate dynamic thresholds based on data range
      const thresholds = [];
      const steps = [10000, 25000, 50000, 75000, 100000, 150000, 200000, 300000, 500000, 750000, 1000000, 1500000, 2000000, 3000000, 5000000, 10000000];
      for (const t of steps) {
        if (t <= max * 1.5) thresholds.push(t);
      }
      // Build buckets
      const buckets = [];
      for (let i = 0; i < thresholds.length; i++) {
        const lower = i === 0 ? 0 : thresholds[i - 1];
        const upper = thresholds[i];
        const stocks = allHoldingsGrouped.filter(h => h.current_value > lower && h.current_value <= upper);
        if (stocks.length > 0) {
          buckets.push({ range: `${formatVal(lower)} - ${formatVal(upper)}`, count: stocks.length, stocks: stocks.map(s => s.instrument) });
        }
      }
      // Above last threshold
      const aboveLast = allHoldingsGrouped.filter(h => h.current_value > thresholds[thresholds.length - 1]);
      if (aboveLast.length > 0) {
        buckets.push({ range: `> ${formatVal(thresholds[thresholds.length - 1])}`, count: aboveLast.length, stocks: aboveLast.map(s => s.instrument) });
      }
      return buckets;
    })();

    // Top dividend stocks / Company Split (filtered)
    const topDivStocks = (await db.execute(
      'SELECT stock_name, SUM(amount) as total, COUNT(*) as count FROM dividends' + divYearFilterWhere + ' GROUP BY stock_name ORDER BY SUM(amount) DESC'
    )).rows;

    // Quarterly dividend data (filtered)
    const quarterlyDiv = (await db.execute(
      "SELECT CAST(SUBSTR(date, 1, 4) AS INTEGER) as year, CAST(SUBSTR(date, 6, 2) AS INTEGER) as month, SUM(amount) as total FROM dividends" + divYearFilterWhere + " GROUP BY year, month ORDER BY year ASC, month ASC"
    )).rows;
    const quarterMap = {};
    quarterlyDiv.forEach(r => {
      const q = Math.ceil(r.month / 3);
      const key = `Q${q} ${r.year}`;
      quarterMap[key] = (quarterMap[key] || 0) + r.total;
    });
    const quarterlyTrend = Object.entries(quarterMap).map(([label, total]) => ({ label, total }));

    // Yearly dividend data (always all years for the yearly chart)
    const yearlyDiv = (await db.execute(
      "SELECT CAST(SUBSTR(date, 1, 4) AS INTEGER) as year, SUM(amount) as total FROM dividends GROUP BY year ORDER BY year ASC"
    )).rows;

    // Available dividend years
    const dividendYears = yearlyDiv.map(r => r.year);

    // Accountwise yearly split (filtered)
    const accountYearlyDiv = (await db.execute(
      "SELECT fm.name as member_name, fm.color as member_color, CAST(SUBSTR(d.date, 1, 4) AS INTEGER) as year, SUM(d.amount) as total FROM dividends d JOIN family_members fm ON d.family_member_id = fm.id" + (divYear ? " WHERE CAST(SUBSTR(d.date, 1, 4) AS INTEGER) = " + parseInt(divYear) : "") + " GROUP BY fm.name, fm.color, year ORDER BY year ASC"
    )).rows;

    res.json({
      latestMonth: { year: latestYear, month: latestMon },
      memberSummaries,
      trend,
      dividendTrend,
      totalDividends,
      topHoldings,
      allHoldingsGrouped,
      valuationBuckets,
      topDivStocks,
      quarterlyTrend,
      yearlyDiv,
      dividendYears,
      accountYearlyDiv,
      totalInvested: memberSummaries.reduce((s, m) => s + m.invested, 0),
      totalCurrent: memberSummaries.reduce((s, m) => s + m.currentValue, 0),
      totalPnl: memberSummaries.reduce((s, m) => s + m.pnl, 0)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
