import React, { useState, useEffect, useCallback } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Filler } from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import api from '../utils/api';
import { formatCurrency, MONTHS, getCurrentMonth, getCurrentYear } from '../utils/helpers';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Filler);

function SharesPage() {
  const [activeTab, setActiveTab] = useState('holdings');
  const [members, setMembers] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [dividends, setDividends] = useState([]);
  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedYear, setSelectedYear] = useState(getCurrentYear());
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [memberFilter, setMemberFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [summary, setSummary] = useState(null);

  // Form states
  const [showHoldingForm, setShowHoldingForm] = useState(false);
  const [editingHolding, setEditingHolding] = useState(null);
  const [holdingForm, setHoldingForm] = useState({ family_member_id: '', instrument: '', quantity: '', avg_cost: '', ltp: '' });

  const [showDividendForm, setShowDividendForm] = useState(false);
  const [editingDividend, setEditingDividend] = useState(null);
  const [dividendForm, setDividendForm] = useState({ family_member_id: '', div_month: new Date().getMonth() + 1, div_year: new Date().getFullYear(), stock_name: '', amount: '', notes: '' });

  // Import states
  const [showImportHoldings, setShowImportHoldings] = useState(false);
  const [importMemberId, setImportMemberId] = useState('');
  const [showImportDividends, setShowImportDividends] = useState(false);

  // Dividend year filter (for dividends tab and reports tab)
  const [divReportYear, setDivReportYear] = useState('all');

  // Stock name autocomplete
  const [stockNames, setStockNames] = useState([]);
  const [stockSuggestions, setStockSuggestions] = useState([]);
  const [showStockSuggestions, setShowStockSuggestions] = useState(false);

  // Stock rename
  const [showRenamePanel, setShowRenamePanel] = useState(false);
  const [mismatches, setMismatches] = useState([]);
  const [holdingInstruments, setHoldingInstruments] = useState([]);
  const [renameMap, setRenameMap] = useState({});


  // Sorting state for holdings table
  const [sortField, setSortField] = useState('current_value');
  const [sortDir, setSortDir] = useState('desc');

  const fetchMembers = useCallback(async () => {
    try {
      const res = await api.get('/entries/members');
      setMembers(res.data);
    } catch (err) { console.error(err); }
  }, []);

  const fetchHoldings = useCallback(async () => {
    setLoading(true);
    try {
      const params = { year: selectedYear, month: selectedMonth };
      if (memberFilter !== 'all') params.member_id = memberFilter;
      const res = await api.get('/shares/holdings', { params });
      setHoldings(res.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [selectedYear, selectedMonth, memberFilter]);

  const fetchAvailableMonths = useCallback(async () => {
    try {
      const res = await api.get('/shares/holdings-months');
      setAvailableMonths(res.data);
    } catch (err) { console.error(err); }
  }, []);

  const fetchDividends = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (memberFilter !== 'all') params.member_id = memberFilter;
      if (divReportYear !== 'all') params.year = divReportYear;
      const res = await api.get('/shares/dividends', { params });
      setDividends(res.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [memberFilter, divReportYear]);

  const fetchSummary = useCallback(async () => {
    try {
      const params = {};
      if (divReportYear !== 'all') params.divYear = divReportYear;
      const res = await api.get('/shares/summary', { params });
      setSummary(res.data);
    } catch (err) { console.error(err); }
  }, [divReportYear]);

  const fetchStockNames = useCallback(async () => {
    try { const res = await api.get('/shares/stock-names'); setStockNames(res.data); } catch (e) {}
  }, []);

  const fetchMismatches = async () => {
    try {
      const res = await api.get('/shares/stock-mismatches');
      setMismatches(res.data.mismatches);
      setHoldingInstruments(res.data.holdingNames);
      setRenameMap({});
    } catch (e) {}
  };

  const handleRename = async (oldName) => {
    const newName = renameMap[oldName];
    if (!newName) return;
    try {
      const res = await api.put('/shares/dividends/rename-stock', { oldName, newName });
      showMsg(res.data.message);
      fetchMismatches(); fetchDividends(); fetchSummary(); fetchStockNames();
    } catch (err) { showMsg('Error renaming', true); }
  };

  const handleRenameAll = async () => {
    const entries = Object.entries(renameMap).filter(([, v]) => v);
    if (entries.length === 0) return;
    for (const [oldName, newName] of entries) {
      await api.put('/shares/dividends/rename-stock', { oldName, newName });
    }
    showMsg(`Renamed ${entries.length} stock(s)`);
    fetchMismatches(); fetchDividends(); fetchSummary(); fetchStockNames();
  };


  useEffect(() => { fetchMembers(); fetchAvailableMonths(); fetchStockNames(); }, [fetchMembers, fetchAvailableMonths, fetchStockNames]);
  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { if (activeTab === 'holdings') fetchHoldings(); }, [activeTab, fetchHoldings]);
  useEffect(() => { if (activeTab === 'dividends') fetchDividends(); }, [activeTab, fetchDividends]);

  const showMsg = (msg) => { setMessage(msg); setTimeout(() => setMessage(''), 3000); };

  // Holdings CRUD
  const handleHoldingSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...holdingForm, year: selectedYear, month: selectedMonth };
      if (editingHolding) {
        await api.put(`/shares/holdings/${editingHolding.id}`, payload);
        showMsg('Holding updated');
      } else {
        await api.post('/shares/holdings', payload);
        showMsg('Holding added');
      }
      setShowHoldingForm(false); setEditingHolding(null);
      setHoldingForm({ family_member_id: '', instrument: '', quantity: '', avg_cost: '', ltp: '' });
      fetchHoldings(); fetchSummary();
    } catch (err) { showMsg('Error: ' + (err.response?.data?.error || err.message)); }
  };

  const editHolding = (h) => {
    setEditingHolding(h);
    setHoldingForm({ family_member_id: h.family_member_id, instrument: h.instrument, quantity: h.quantity, avg_cost: h.avg_cost, ltp: h.ltp });
    setShowHoldingForm(true);
  };

  const deleteHolding = async (id) => {
    if (!window.confirm('Delete this holding?')) return;
    await api.delete(`/shares/holdings/${id}`);
    fetchHoldings(); fetchSummary(); showMsg('Deleted');
  };

  // Dividend CRUD
  const emptyDivForm = () => ({ family_member_id: '', div_month: new Date().getMonth() + 1, div_year: new Date().getFullYear(), stock_name: '', amount: '', notes: '' });

  const handleDividendSubmit = async (e, addAndNew = false) => {
    e.preventDefault();
    try {
      // Build date as YYYY-MM-01 from month/year
      const submitData = { ...dividendForm, date: `${dividendForm.div_year}-${String(dividendForm.div_month).padStart(2, '0')}-01` };
      if (editingDividend) {
        await api.put(`/shares/dividends/${editingDividend.id}`, submitData);
        showMsg('Dividend updated');
        setShowDividendForm(false); setEditingDividend(null);
        setDividendForm(emptyDivForm());
      } else {
        await api.post('/shares/dividends', submitData);
        showMsg('Dividend added');
        if (addAndNew) {
          setDividendForm(prev => ({ ...prev, stock_name: '', amount: '', notes: '' }));
        } else {
          setShowDividendForm(false); setEditingDividend(null);
          setDividendForm(emptyDivForm());
        }
      }
      fetchDividends(); fetchSummary(); fetchStockNames();
    } catch (err) { showMsg('Error: ' + (err.response?.data?.error || err.message)); }
  };

  const editDividend = (d) => {
    setEditingDividend(d);
    const dMonth = d.date ? parseInt(d.date.substring(5, 7)) : new Date().getMonth() + 1;
    const dYear = d.date ? parseInt(d.date.substring(0, 4)) : new Date().getFullYear();
    setDividendForm({ family_member_id: d.family_member_id, div_month: dMonth, div_year: dYear, stock_name: d.stock_name, amount: d.amount, notes: d.notes || '' });
    setShowDividendForm(true);
  };

  const deleteDividend = async (id) => {
    if (!window.confirm('Delete this dividend?')) return;
    await api.delete(`/shares/dividends/${id}`);
    fetchDividends(); fetchSummary(); showMsg('Deleted');
  };

  // Import handlers
  const handleImportHoldings = async (e) => {
    e.preventDefault();
    const fileInput = e.target.querySelector('input[type="file"]');
    if (!fileInput.files[0]) return showMsg('Select a file');
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    if (importMemberId) formData.append('family_member_id', importMemberId);
    formData.append('year', selectedYear);
    formData.append('month', selectedMonth);
    try {
      const res = await api.post('/shares/import-holdings', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      showMsg(res.data.message);
      setShowImportHoldings(false);
      fetchHoldings(); fetchAvailableMonths(); fetchSummary();
    } catch (err) { showMsg('Error: ' + (err.response?.data?.error || err.message)); }
  };

  const handleImportDividends = async (e) => {
    e.preventDefault();
    const fileInput = e.target.querySelector('input[type="file"]');
    if (!fileInput.files[0]) return showMsg('Select a file');
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    try {
      const res = await api.post('/shares/import-dividends', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      showMsg(res.data.message);
      setShowImportDividends(false);
      fetchDividends(); fetchSummary();
    } catch (err) { showMsg('Error: ' + (err.response?.data?.error || err.message)); }
  };

  const handleExport = async () => {
    try {
      const res = await api.get('/shares/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url;
      a.download = 'Shares_Dividends_Export.xlsx';
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) { showMsg('Export failed'); }
  };

  // Enrich holdings with computed P&L
  const enrichedHoldings = holdings.map(h => {
    const pnl = h.current_value - h.invested;
    const pnlPercent = h.invested > 0 ? parseFloat(((pnl / h.invested) * 100).toFixed(2)) : 0;
    return { ...h, calcPnl: pnl, calcPnlPercent: pnlPercent };
  });

  // Sort holdings
  const toggleSort = (field) => {
    if (sortField === field) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }
    else { setSortField(field); setSortDir(field === 'instrument' ? 'asc' : 'desc'); }
  };
  const sortArrow = (field) => sortField === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  const sortedHoldings = [...enrichedHoldings].sort((a, b) => {
    let valA, valB;
    switch (sortField) {
      case 'instrument': valA = a.instrument.toLowerCase(); valB = b.instrument.toLowerCase(); return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      case 'invested': valA = a.invested; valB = b.invested; break;
      case 'current_value': valA = a.current_value; valB = b.current_value; break;
      case 'pnl': valA = a.calcPnl; valB = b.calcPnl; break;
      case 'pnlPercent': valA = a.calcPnlPercent; valB = b.calcPnlPercent; break;
      default: valA = a.current_value; valB = b.current_value;
    }
    return sortDir === 'asc' ? valA - valB : valB - valA;
  });

  // Calc totals for current view
  const totalInvested = enrichedHoldings.reduce((s, h) => s + h.invested, 0);
  const totalCurrent = enrichedHoldings.reduce((s, h) => s + h.current_value, 0);
  const totalPnl = totalCurrent - totalInvested;
  const totalPnlPct = totalInvested > 0 ? ((totalPnl / totalInvested) * 100).toFixed(2) : 0;

  // Build accountwise yearly stacked bar data
  const buildAccountYearlyChart = () => {
    if (!summary?.accountYearlyDiv?.length) return null;
    const years = [...new Set(summary.accountYearlyDiv.map(r => r.year))].sort();
    const memberNames = [...new Set(summary.accountYearlyDiv.map(r => r.member_name))];
    const colorMap = {};
    summary.accountYearlyDiv.forEach(r => { colorMap[r.member_name] = r.member_color; });

    const datasets = memberNames.map(name => ({
      label: name,
      data: years.map(y => {
        const entry = summary.accountYearlyDiv.find(r => r.member_name === name && r.year === y);
        return entry ? entry.total : 0;
      }),
      backgroundColor: colorMap[name] || '#6366F1',
    }));

    return { labels: years.map(String), datasets };
  };

  const chartOpts = (yFormatter) => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'top' } },
    scales: { y: { beginAtZero: true, ticks: { callback: yFormatter || (v => '₹' + (v / 1000).toFixed(0) + 'K') } } }
  });

  return (
    <div>
      <div className="page-header">
        <h1>Shares & Dividends</h1>
        <p>Track your stock portfolio and dividend income</p>
      </div>

      {message && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', background: message.startsWith('Error') ? '#FEF2F2' : '#D1FAE5', color: message.startsWith('Error') ? '#991B1B' : '#065F46', border: `1px solid ${message.startsWith('Error') ? '#FECACA' : '#A7F3D0'}`, fontSize: '0.9rem' }}>
          {message}
        </div>
      )}

      <div className="tabs">
        <button className={`tab ${activeTab === 'holdings' ? 'active' : ''}`} onClick={() => setActiveTab('holdings')}>Holdings</button>
        <button className={`tab ${activeTab === 'dividends' ? 'active' : ''}`} onClick={() => setActiveTab('dividends')}>Dividends</button>
        <button className={`tab ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>Reports</button>
      </div>

      {/* ====== HOLDINGS TAB ====== */}
      {activeTab === 'holdings' && (
        <div>
          <div className="month-selector">
            <label>Month:</label>
            <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <label>Year:</label>
            <input type="number" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} min="2020" max="2050" />
            <label>Member:</label>
            <select value={memberFilter} onChange={e => setMemberFilter(e.target.value)}>
              <option value="all">All Members</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" onClick={() => { setEditingHolding(null); setHoldingForm({ family_member_id: members[0]?.id || '', instrument: '', quantity: '', avg_cost: '', ltp: '' }); setShowHoldingForm(true); }}>+ Add</button>
              <button className="btn btn-secondary" onClick={() => setShowImportHoldings(true)}>Import Excel</button>
              <button className="btn btn-secondary" onClick={handleExport}>Export</button>
            </div>
          </div>

          {/* Stats */}
          {sortedHoldings.length > 0 && (
            <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
              <div className="stat-card"><div className="stat-label">Invested</div><div className="stat-value">{formatCurrency(totalInvested)}</div></div>
              <div className="stat-card"><div className="stat-label">Current Value</div><div className="stat-value">{formatCurrency(totalCurrent)}</div></div>
              <div className="stat-card"><div className="stat-label">P&L</div><div className="stat-value" style={{ color: totalPnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(totalPnl)} ({totalPnlPct}%)</div></div>
              <div className="stat-card"><div className="stat-label">Stocks</div><div className="stat-value">{sortedHoldings.length}</div></div>
            </div>
          )}

          {/* Import Modal */}
          {showImportHoldings && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header"><h3>Import Share Tracker</h3></div>
              <div className="card-body">
                <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: '1rem' }}>
                  Upload holdings from any broker — Zerodha, Upstox, Angel One, Groww, Paytm Money (CSV or Excel).
                  Format is auto-detected from column headers. For multi-month trackers, name sheet tabs like "Jul 2026".
                  Single-sheet files import into the currently selected month. Member column auto-detected if present.
                </p>
                <form onSubmit={handleImportHoldings}>
                  <div className="form-row" style={{ marginBottom: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label">Member (optional)</label>
                      <select value={importMemberId} onChange={e => setImportMemberId(e.target.value)} className="form-control">
                        <option value="">Auto-detect from sheet</option>
                        {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Excel File</label>
                      <input type="file" accept=".xlsx,.xls,.csv" className="form-control" required />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="submit" className="btn btn-primary">Import</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowImportHoldings(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Add/Edit Form */}
          {showHoldingForm && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header"><h3>{editingHolding ? 'Edit' : 'Add'} Holding</h3></div>
              <div className="card-body">
                <form onSubmit={handleHoldingSubmit}>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Member</label>
                      <select value={holdingForm.family_member_id} onChange={e => setHoldingForm({ ...holdingForm, family_member_id: e.target.value })} className="form-control" required>
                        <option value="">Select</option>
                        {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Instrument</label>
                      <input value={holdingForm.instrument} onChange={e => setHoldingForm({ ...holdingForm, instrument: e.target.value })} className="form-control" required placeholder="e.g. RELIANCE" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Quantity</label>
                      <input type="number" step="0.01" value={holdingForm.quantity} onChange={e => setHoldingForm({ ...holdingForm, quantity: e.target.value })} className="form-control" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Avg. Cost</label>
                      <input type="number" step="0.01" value={holdingForm.avg_cost} onChange={e => setHoldingForm({ ...holdingForm, avg_cost: e.target.value })} className="form-control" required />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">LTP (Current Price)</label>
                    <input type="number" step="0.01" value={holdingForm.ltp} onChange={e => setHoldingForm({ ...holdingForm, ltp: e.target.value })} className="form-control" required style={{ maxWidth: '300px' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="submit" className="btn btn-primary">{editingHolding ? 'Update' : 'Add'}</button>
                    <button type="button" className="btn btn-secondary" onClick={() => { setShowHoldingForm(false); setEditingHolding(null); }}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Holdings Table */}
          {loading ? <p>Loading...</p> : sortedHoldings.length === 0 ? (
            <div className="empty-state"><h3>No holdings for this month</h3><p>Add manually or import from Excel.</p></div>
          ) : (
            <div className="card">
              <div className="card-body">
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th onClick={() => toggleSort('instrument')} style={{ cursor: 'pointer' }}>Instrument{sortArrow('instrument')}</th>
                        <th style={{ textAlign: 'right' }}>Qty</th>
                        <th style={{ textAlign: 'right' }}>Avg Cost</th>
                        <th style={{ textAlign: 'right' }}>LTP</th>
                        <th onClick={() => toggleSort('invested')} style={{ textAlign: 'right', cursor: 'pointer' }}>Invested{sortArrow('invested')}</th>
                        <th onClick={() => toggleSort('current_value')} style={{ textAlign: 'right', cursor: 'pointer' }}>Current{sortArrow('current_value')}</th>
                        <th onClick={() => toggleSort('pnl')} style={{ textAlign: 'right', cursor: 'pointer' }}>P&L{sortArrow('pnl')}</th>
                        <th onClick={() => toggleSort('pnlPercent')} style={{ textAlign: 'right', cursor: 'pointer' }}>%{sortArrow('pnlPercent')}</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedHoldings.map(h => (
                        <tr key={h.id}>
                          <td><span className="member-dot" style={{ backgroundColor: h.member_color }}></span>{h.member_name}</td>
                          <td style={{ fontWeight: 500 }}>{h.instrument}</td>
                          <td style={{ textAlign: 'right' }}>{h.quantity}</td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(h.avg_cost)}</td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(h.ltp)}</td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(h.invested)}</td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(h.current_value)}</td>
                          <td style={{ textAlign: 'right', color: h.calcPnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(h.calcPnl)}</td>
                          <td style={{ textAlign: 'right', color: h.calcPnlPercent >= 0 ? 'var(--success)' : 'var(--danger)' }}>{h.calcPnlPercent}%</td>
                          <td>
                            <button className="btn btn-secondary btn-sm" onClick={() => editHolding(h)} style={{ marginRight: '0.25rem' }}>Edit</button>
                            <button className="btn btn-danger btn-sm" onClick={() => deleteHolding(h.id)}>Del</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====== DIVIDENDS TAB ====== */}
      {activeTab === 'dividends' && (
        <div>
          <div className="month-selector">
            <label>Year:</label>
            <select value={divReportYear} onChange={e => setDivReportYear(e.target.value)}>
              <option value="all">All Years</option>
              {(summary?.dividendYears || []).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <label>Member:</label>
            <select value={memberFilter} onChange={e => setMemberFilter(e.target.value)}>
              <option value="all">All Members</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" onClick={() => { setEditingDividend(null); setDividendForm({ family_member_id: members[0]?.id || '', div_month: new Date().getMonth() + 1, div_year: new Date().getFullYear(), stock_name: '', amount: '', notes: '' }); setShowDividendForm(true); }}>+ Add</button>
              <button className="btn btn-secondary" onClick={() => setShowImportDividends(true)}>Import Excel</button>
              <button className="btn btn-secondary" onClick={handleExport}>Export</button>
              <button className="btn btn-secondary" onClick={() => { setShowRenamePanel(!showRenamePanel); if (!showRenamePanel) fetchMismatches(); }}>Rename Stocks</button>
            </div>
          </div>

          {/* Rename Stocks Panel */}
          {showRenamePanel && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header"><h3>Rename Dividend Stock Names</h3></div>
              <div className="card-body">
                <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: '1rem' }}>
                  Dividend stock names that don't exactly match a holdings instrument (including case differences like Indiamart vs INDIAMART).
                </p>
                {mismatches.length === 0 ? (
                  <p style={{ color: 'var(--success)', fontWeight: 500 }}>All dividend stock names match holdings instruments.</p>
                ) : (
                  <>
                    <div className="table-container">
                      <table>
                        <thead>
                          <tr>
                            <th>Dividend Name</th>
                            <th>Entries</th>
                            <th>Rename To</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mismatches.map(m => (
                            <tr key={m.name}>
                              <td style={{ fontWeight: 500 }}>{m.name}</td>
                              <td>{m.count}</td>
                              <td>
                                <select
                                  className="form-control"
                                  style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem' }}
                                  value={renameMap[m.name] || ''}
                                  onChange={e => setRenameMap(prev => ({ ...prev, [m.name]: e.target.value }))}
                                >
                                  <option value="">-- Select --</option>
                                  {holdingInstruments.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                              </td>
                              <td>
                                <button className="btn btn-primary btn-sm" disabled={!renameMap[m.name]} onClick={() => handleRename(m.name)}>Rename</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {mismatches.length > 1 && (
                      <button className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={handleRenameAll} disabled={Object.values(renameMap).filter(Boolean).length === 0}>
                        Rename All Mapped ({Object.values(renameMap).filter(Boolean).length})
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Total dividends */}
          {dividends.length > 0 && (
            <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
              <div className="stat-card"><div className="stat-label">Total Dividends</div><div className="stat-value" style={{ color: 'var(--success)' }}>{formatCurrency(dividends.reduce((s, d) => s + d.amount, 0))}</div></div>
              <div className="stat-card"><div className="stat-label">Entries</div><div className="stat-value">{dividends.length}</div></div>
            </div>
          )}

          {/* Import Dividends */}
          {showImportDividends && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header"><h3>Import Dividends</h3></div>
              <div className="card-body">
                <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: '1rem' }}>
                  Upload Excel with columns: Date, Dividend (stock name), Account (Saravana/Iswarya/HUF), Amount.
                  Account names are matched to family members.
                </p>
                <form onSubmit={handleImportDividends}>
                  <div className="form-group">
                    <label className="form-label">Excel File</label>
                    <input type="file" accept=".xlsx,.xls,.csv" className="form-control" required style={{ maxWidth: '400px' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="submit" className="btn btn-primary">Import</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowImportDividends(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Add/Edit Dividend Form */}
          {showDividendForm && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header"><h3>{editingDividend ? 'Edit' : 'Add'} Dividend</h3></div>
              <div className="card-body">
                <form onSubmit={handleDividendSubmit}>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Member</label>
                      <select value={dividendForm.family_member_id} onChange={e => setDividendForm({ ...dividendForm, family_member_id: e.target.value })} className="form-control" required>
                        <option value="">Select</option>
                        {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Month</label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <select value={dividendForm.div_month} onChange={e => setDividendForm({ ...dividendForm, div_month: Number(e.target.value) })} className="form-control">
                          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                        </select>
                        <input type="number" value={dividendForm.div_year} onChange={e => setDividendForm({ ...dividendForm, div_year: Number(e.target.value) })} className="form-control" min="2020" max="2050" style={{ width: '100px' }} />
                      </div>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group" style={{ position: 'relative' }}>
                      <label className="form-label">Stock</label>
                      <input
                        value={dividendForm.stock_name}
                        onChange={e => {
                          const val = e.target.value;
                          setDividendForm({ ...dividendForm, stock_name: val });
                          if (val.length > 0) {
                            const filtered = stockNames.filter(s => s.toLowerCase().includes(val.toLowerCase()));
                            setStockSuggestions(filtered);
                            setShowStockSuggestions(filtered.length > 0);
                          } else {
                            setShowStockSuggestions(false);
                          }
                        }}
                        onFocus={() => {
                          if (dividendForm.stock_name.length === 0 && stockNames.length > 0) {
                            setStockSuggestions(stockNames);
                            setShowStockSuggestions(true);
                          }
                        }}
                        onBlur={() => setTimeout(() => setShowStockSuggestions(false), 200)}
                        className="form-control" required placeholder="e.g. COALINDIA"
                        autoComplete="off"
                      />
                      {showStockSuggestions && stockSuggestions.length > 0 && (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                          background: 'white', border: '1px solid var(--gray-200)', borderRadius: '8px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: '200px', overflowY: 'auto'
                        }}>
                          {stockSuggestions.map((s, i) => (
                            <div key={i}
                              style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.9rem', borderBottom: '1px solid var(--gray-50)' }}
                              onMouseDown={() => {
                                setDividendForm({ ...dividendForm, stock_name: s });
                                setShowStockSuggestions(false);
                              }}
                              onMouseEnter={e => e.target.style.background = 'var(--gray-50)'}
                              onMouseLeave={e => e.target.style.background = 'white'}
                            >{s}</div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Amount (₹)</label>
                      <input type="number" step="0.01" value={dividendForm.amount} onChange={e => setDividendForm({ ...dividendForm, amount: e.target.value })} className="form-control" required />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Notes</label>
                    <input value={dividendForm.notes} onChange={e => setDividendForm({ ...dividendForm, notes: e.target.value })} className="form-control" placeholder="Optional" style={{ maxWidth: '400px' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="submit" className="btn btn-primary">{editingDividend ? 'Update' : 'Add'}</button>
                    {!editingDividend && (
                      <button type="button" className="btn btn-primary" style={{ background: 'var(--success)' }} onClick={(e) => {
                        const form = e.target.closest('form');
                        if (form.reportValidity()) handleDividendSubmit(e, true);
                      }}>Add & New</button>
                    )}
                    <button type="button" className="btn btn-secondary" onClick={() => { setShowDividendForm(false); setEditingDividend(null); }}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Dividends Table */}
          {loading ? <p>Loading...</p> : dividends.length === 0 ? (
            <div className="empty-state"><h3>No dividends recorded</h3><p>Add manually or import from Excel.</p></div>
          ) : (
            <div className="card">
              <div className="card-body">
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr><th>Month</th><th>Stock</th><th>Account</th><th style={{ textAlign: 'right' }}>Amount</th><th>Notes</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {dividends.map(d => (
                        <tr key={d.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{d.date ? `${MONTHS[parseInt(d.date.substring(5, 7)) - 1]} ${d.date.substring(0, 4)}` : d.date}</td>
                          <td style={{ fontWeight: 500 }}>{d.stock_name}</td>
                          <td><span className="member-dot" style={{ backgroundColor: d.member_color }}></span>{d.member_name}</td>
                          <td style={{ textAlign: 'right', color: 'var(--success)' }}>{formatCurrency(d.amount)}</td>
                          <td style={{ color: 'var(--gray-500)', fontSize: '0.85rem' }}>{d.notes}</td>
                          <td>
                            <button className="btn btn-secondary btn-sm" onClick={() => editDividend(d)} style={{ marginRight: '0.25rem' }}>Edit</button>
                            <button className="btn btn-danger btn-sm" onClick={() => deleteDividend(d.id)}>Del</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====== REPORTS TAB ====== */}
      {activeTab === 'reports' && summary && (
        <div>
          <div className="month-selector">
            <label>Dividend Year:</label>
            <select value={divReportYear} onChange={e => setDivReportYear(e.target.value)}>
              <option value="all">All Years</option>
              {(summary?.dividendYears || []).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Summary Stats */}
          <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
            <div className="stat-card">
              <div className="stat-label">Portfolio Invested</div>
              <div className="stat-value">{formatCurrency(summary.totalInvested)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Portfolio Value</div>
              <div className="stat-value">{formatCurrency(summary.totalCurrent)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total P&L</div>
              <div className="stat-value" style={{ color: summary.totalPnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {formatCurrency(summary.totalPnl)}
                <span style={{ fontSize: '0.8rem', marginLeft: '0.25rem' }}>
                  ({summary.totalInvested > 0 ? ((summary.totalPnl / summary.totalInvested) * 100).toFixed(2) : 0}%)
                </span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Dividends</div>
              <div className="stat-value" style={{ color: 'var(--success)' }}>{formatCurrency(summary.totalDividends)}</div>
            </div>
          </div>

          {/* Member breakdown */}
          {summary.memberSummaries.length > 0 && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header"><h3>Member Portfolio ({MONTHS[summary.latestMonth.month - 1]} {summary.latestMonth.year})</h3></div>
              <div className="card-body">
                <div className="table-container">
                  <table className="data-table">
                    <thead><tr><th>Member</th><th style={{ textAlign: 'right' }}>Invested</th><th style={{ textAlign: 'right' }}>Current</th><th style={{ textAlign: 'right' }}>P&L</th><th style={{ textAlign: 'right' }}>%</th><th style={{ textAlign: 'right' }}>Stocks</th><th style={{ textAlign: 'right' }}>Dividends</th></tr></thead>
                    <tbody>
                      {summary.memberSummaries.map(ms => (
                        <tr key={ms.member.id}>
                          <td><span className="member-dot" style={{ backgroundColor: ms.member.color }}></span>{ms.member.name}</td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(ms.invested)}</td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(ms.currentValue)}</td>
                          <td style={{ textAlign: 'right', color: ms.pnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(ms.pnl)}</td>
                          <td style={{ textAlign: 'right', color: ms.pnlPercent >= 0 ? 'var(--success)' : 'var(--danger)' }}>{ms.pnlPercent}%</td>
                          <td style={{ textAlign: 'right' }}>{ms.stockCount}</td>
                          <td style={{ textAlign: 'right', color: 'var(--success)' }}>{formatCurrency(ms.totalDividends)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Portfolio Charts */}
          {summary.trend.length > 1 && (
            <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
              <div className="card">
                <div className="card-header"><h3>Portfolio Value Trend</h3></div>
                <div className="card-body">
                  <div className="chart-container">
                    <Line data={{
                      labels: summary.trend.map(t => t.label),
                      datasets: [
                        { label: 'Invested', data: summary.trend.map(t => t.invested), borderColor: '#6366F1', backgroundColor: 'rgba(99,102,241,0.1)', fill: true, tension: 0.3 },
                        { label: 'Current Value', data: summary.trend.map(t => t.current_value), borderColor: '#10B981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.3 }
                      ]
                    }} options={chartOpts(v => '₹' + (v / 100000).toFixed(1) + 'L')} />
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="card-header"><h3>P&L % Trend</h3></div>
                <div className="card-body">
                  <div className="chart-container">
                    <Bar data={{
                      labels: summary.trend.map(t => t.label),
                      datasets: [{ label: 'P&L %', data: summary.trend.map(t => t.pnlPercent), backgroundColor: summary.trend.map(t => t.pnlPercent >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)') }]
                    }} options={{ ...chartOpts(v => v + '%'), plugins: { legend: { display: false } } }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Holdings Company Split - Doughnut */}
          {summary.allHoldingsGrouped?.length > 0 && (
            <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
              <div className="card">
                <div className="card-header"><h3>Holdings - Company Split</h3></div>
                <div className="card-body">
                  <div className="chart-container">
                    <Doughnut data={{
                      labels: summary.allHoldingsGrouped.map(s => s.instrument),
                      datasets: [{
                        data: summary.allHoldingsGrouped.map(s => s.current_value),
                        backgroundColor: ['#4F46E5', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#EF4444', '#06B6D4', '#F97316', '#84CC16', '#6366F1', '#14B8A6', '#D946EF', '#FB923C', '#A3E635', '#2DD4BF', '#C084FC', '#FB7185', '#FBBF24', '#34D399', '#818CF8', '#0EA5E9', '#E11D48', '#65A30D', '#7C3AED', '#0891B2', '#BE185D', '#CA8A04', '#059669', '#4338CA', '#DB2777'],
                        borderWidth: 1, borderColor: '#fff'
                      }]
                    }} options={{
                      responsive: true, maintainAspectRatio: false,
                      plugins: {
                        legend: { position: 'left', labels: { font: { size: 10 }, boxWidth: 12, padding: 4, generateLabels: (chart) => {
                          const data = chart.data;
                          const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
                          return data.labels.map((label, i) => ({
                            text: `${((data.datasets[0].data[i] / total) * 100).toFixed(1)}% ${label}`,
                            fillStyle: data.datasets[0].backgroundColor[i % 30],
                            hidden: false, index: i
                          }));
                        } } },
                        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ₹${ctx.raw.toLocaleString('en-IN')}` } }
                      }
                    }} />
                  </div>
                </div>
              </div>

              {/* Valuation Distribution */}
              {summary.valuationBuckets?.length > 0 && (
                <div className="card">
                  <div className="card-header"><h3>Stock Valuation Distribution</h3></div>
                  <div className="card-body">
                    <div className="chart-container">
                      <Bar data={{
                        labels: summary.valuationBuckets.map(b => b.range),
                        datasets: [{
                          label: 'Number of Stocks',
                          data: summary.valuationBuckets.map(b => b.count),
                          backgroundColor: summary.valuationBuckets.map((_, i) => {
                            const colors = ['#6366F1', '#8B5CF6', '#A78BFA', '#10B981', '#34D399', '#F59E0B', '#FBBF24', '#EC4899', '#F472B6', '#EF4444', '#06B6D4', '#14B8A6'];
                            return colors[i % colors.length];
                          }),
                          borderRadius: 4
                        }]
                      }} options={{
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                          legend: { display: false },
                          tooltip: { callbacks: { afterLabel: (ctx) => {
                            const bucket = summary.valuationBuckets[ctx.dataIndex];
                            return bucket.stocks.join(', ');
                          } } }
                        },
                        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } }, x: { ticks: { font: { size: 10 }, maxRotation: 45 } } }
                      }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Valuation Distribution Table */}
          {summary.valuationBuckets?.length > 0 && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header"><h3>Valuation Breakdown</h3></div>
              <div className="card-body">
                <div className="table-container">
                  <table className="data-table">
                    <thead><tr><th>Valuation Range</th><th style={{ textAlign: 'right' }}>Count</th><th>Stocks</th></tr></thead>
                    <tbody>
                      {summary.valuationBuckets.map((b, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 500 }}>{b.range}</td>
                          <td style={{ textAlign: 'right' }}>{b.count}</td>
                          <td style={{ fontSize: '0.85rem', color: 'var(--gray-500)' }}>{b.stocks.join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Dividend Report Charts - 4 panel grid */}
          {summary.totalDividends > 0 && (
            <>
              <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem', fontWeight: '600' }}>Dividend Reports</h2>
              <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
                {/* Company Split - Doughnut */}
                {summary.topDivStocks?.length > 0 && (
                  <div className="card">
                    <div className="card-header"><h3>Company Split</h3></div>
                    <div className="card-body">
                      <div className="chart-container">
                        <Doughnut data={{
                          labels: summary.topDivStocks.map(s => s.stock_name),
                          datasets: [{
                            data: summary.topDivStocks.map(s => s.total),
                            backgroundColor: ['#4F46E5', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#EF4444', '#06B6D4', '#F97316', '#84CC16', '#6366F1', '#14B8A6', '#D946EF', '#FB923C', '#A3E635', '#2DD4BF', '#C084FC', '#FB7185', '#FBBF24', '#34D399', '#818CF8'],
                            borderWidth: 1, borderColor: '#fff'
                          }]
                        }} options={{
                          responsive: true, maintainAspectRatio: false,
                          plugins: {
                            legend: { position: 'left', labels: { font: { size: 10 }, boxWidth: 12, padding: 6, generateLabels: (chart) => {
                              const data = chart.data;
                              const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
                              return data.labels.map((label, i) => ({
                                text: `${((data.datasets[0].data[i] / total) * 100).toFixed(1)}%, ${label}`,
                                fillStyle: data.datasets[0].backgroundColor[i],
                                hidden: false, index: i
                              }));
                            } } },
                            tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ₹${ctx.raw.toLocaleString('en-IN')}` } }
                          }
                        }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Quarterly Report - Line */}
                {summary.quarterlyTrend?.length > 1 && (
                  <div className="card">
                    <div className="card-header"><h3>Quarterly Report</h3></div>
                    <div className="card-body">
                      <div className="chart-container">
                        <Line data={{
                          labels: summary.quarterlyTrend.map(q => q.label),
                          datasets: [{ label: 'Dividend', data: summary.quarterlyTrend.map(q => q.total), borderColor: '#4285F4', backgroundColor: 'rgba(66,133,244,0.05)', fill: false, tension: 0.3, pointRadius: 3 }]
                        }} options={{ ...chartOpts(), plugins: { legend: { display: false } } }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Accountwise Split - Stacked Bar by Year */}
                {buildAccountYearlyChart() && (
                  <div className="card">
                    <div className="card-header"><h3>Accountwise Split</h3></div>
                    <div className="card-body">
                      <div className="chart-container">
                        <Bar data={buildAccountYearlyChart()} options={{
                          responsive: true, maintainAspectRatio: false,
                          plugins: { legend: { position: 'top' } },
                          scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { callback: v => '₹' + (v / 1000).toFixed(0) + 'K' } } }
                        }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Yearly Report - Line */}
                {summary.yearlyDiv?.length > 1 && (
                  <div className="card">
                    <div className="card-header"><h3>Yearly Report</h3></div>
                    <div className="card-body">
                      <div className="chart-container">
                        <Line data={{
                          labels: summary.yearlyDiv.map(y => String(y.year)),
                          datasets: [{ label: 'Amount', data: summary.yearlyDiv.map(y => y.total), borderColor: '#4285F4', backgroundColor: 'rgba(66,133,244,0.05)', fill: false, tension: 0.3, pointRadius: 4, pointBackgroundColor: '#4285F4' }]
                        }} options={chartOpts()} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Top Holdings & Dividend Stocks Tables */}
          <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
            {summary.topHoldings.length > 0 && (
              <div className="card">
                <div className="card-header"><h3>Top 10 Holdings by Value</h3></div>
                <div className="card-body">
                  <div className="table-container">
                    <table className="data-table">
                      <thead><tr><th>Stock</th><th style={{ textAlign: 'right' }}>Invested</th><th style={{ textAlign: 'right' }}>Current</th><th style={{ textAlign: 'right' }}>P&L</th><th style={{ textAlign: 'right' }}>%</th></tr></thead>
                      <tbody>
                        {summary.topHoldings.map((h, i) => {
                          const pnl = h.current_value - h.invested;
                          const pnlPct = h.invested > 0 ? ((pnl / h.invested) * 100).toFixed(1) : 0;
                          return (
                            <tr key={i}>
                              <td style={{ fontWeight: 500 }}>{h.instrument}</td>
                              <td style={{ textAlign: 'right' }}>{formatCurrency(h.invested)}</td>
                              <td style={{ textAlign: 'right' }}>{formatCurrency(h.current_value)}</td>
                              <td style={{ textAlign: 'right', color: pnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(pnl)}</td>
                              <td style={{ textAlign: 'right', color: pnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>{pnlPct}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
            {summary.topDivStocks.length > 0 && (
              <div className="card">
                <div className="card-header"><h3>Top Dividend Stocks</h3></div>
                <div className="card-body">
                  <div className="table-container">
                    <table className="data-table">
                      <thead><tr><th>Stock</th><th style={{ textAlign: 'right' }}>Total Dividends</th><th style={{ textAlign: 'right' }}>Payouts</th></tr></thead>
                      <tbody>
                        {summary.topDivStocks.slice(0, 10).map((s, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 500 }}>{s.stock_name}</td>
                            <td style={{ textAlign: 'right', color: 'var(--success)' }}>{formatCurrency(s.total)}</td>
                            <td style={{ textAlign: 'right' }}>{s.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Portfolio Doughnut by Member */}
          {summary.memberSummaries.length > 1 && (
            <div className="card" style={{ marginBottom: '1.5rem', maxWidth: '400px' }}>
              <div className="card-header"><h3>Portfolio Split by Member</h3></div>
              <div className="card-body">
                <div className="chart-container">
                  <Doughnut data={{
                    labels: summary.memberSummaries.map(m => m.member.name),
                    datasets: [{ data: summary.memberSummaries.map(m => m.currentValue), backgroundColor: summary.memberSummaries.map(m => m.member.color), borderWidth: 2, borderColor: '#fff' }]
                  }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {activeTab === 'reports' && !summary && <div className="empty-state"><h3>Loading reports...</h3></div>}
    </div>
  );
}

export default SharesPage;
