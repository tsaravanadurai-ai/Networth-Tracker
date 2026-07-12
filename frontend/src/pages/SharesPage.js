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
  const [dividendForm, setDividendForm] = useState({ family_member_id: '', date: '', stock_name: '', amount: '', notes: '' });

  // Import states
  const [showImportHoldings, setShowImportHoldings] = useState(false);
  const [importMemberId, setImportMemberId] = useState('');
  const [showImportDividends, setShowImportDividends] = useState(false);

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
      const res = await api.get('/shares/dividends', { params });
      setDividends(res.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [memberFilter]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await api.get('/shares/summary');
      setSummary(res.data);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchMembers(); fetchAvailableMonths(); fetchSummary(); }, [fetchMembers, fetchAvailableMonths, fetchSummary]);
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
  const handleDividendSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingDividend) {
        await api.put(`/shares/dividends/${editingDividend.id}`, dividendForm);
        showMsg('Dividend updated');
      } else {
        await api.post('/shares/dividends', dividendForm);
        showMsg('Dividend added');
      }
      setShowDividendForm(false); setEditingDividend(null);
      setDividendForm({ family_member_id: '', date: '', stock_name: '', amount: '', notes: '' });
      fetchDividends(); fetchSummary();
    } catch (err) { showMsg('Error: ' + (err.response?.data?.error || err.message)); }
  };

  const editDividend = (d) => {
    setEditingDividend(d);
    setDividendForm({ family_member_id: d.family_member_id, date: d.date, stock_name: d.stock_name, amount: d.amount, notes: d.notes || '' });
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
    if (!fileInput.files[0] || !importMemberId) return showMsg('Select file and member');
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('family_member_id', importMemberId);
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

  // Calc totals for current view
  const totalInvested = holdings.reduce((s, h) => s + h.invested, 0);
  const totalCurrent = holdings.reduce((s, h) => s + h.current_value, 0);
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
          {holdings.length > 0 && (
            <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
              <div className="stat-card"><div className="stat-label">Invested</div><div className="stat-value">{formatCurrency(totalInvested)}</div></div>
              <div className="stat-card"><div className="stat-label">Current Value</div><div className="stat-value">{formatCurrency(totalCurrent)}</div></div>
              <div className="stat-card"><div className="stat-label">P&L</div><div className="stat-value" style={{ color: totalPnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(totalPnl)} ({totalPnlPct}%)</div></div>
              <div className="stat-card"><div className="stat-label">Stocks</div><div className="stat-value">{holdings.length}</div></div>
            </div>
          )}

          {/* Import Modal */}
          {showImportHoldings && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header"><h3>Import Share Tracker</h3></div>
              <div className="card-body">
                <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: '1rem' }}>
                  Upload your Zerodha Kite export Excel. Each sheet tab should be named like "Jul 2026", "Mar 2025" etc.
                  Columns: Instrument, Qty., Avg. cost, LTP, Invested, Cur. val, P&L, Overall %.
                  Select which member this data belongs to.
                </p>
                <form onSubmit={handleImportHoldings}>
                  <div className="form-row" style={{ marginBottom: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label">Member</label>
                      <select value={importMemberId} onChange={e => setImportMemberId(e.target.value)} className="form-control" required>
                        <option value="">Select member</option>
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
          {loading ? <p>Loading...</p> : holdings.length === 0 ? (
            <div className="empty-state"><h3>No holdings for this month</h3><p>Add manually or import from Excel.</p></div>
          ) : (
            <div className="card">
              <div className="card-body">
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Member</th><th>Instrument</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Avg Cost</th>
                        <th style={{ textAlign: 'right' }}>LTP</th><th style={{ textAlign: 'right' }}>Invested</th><th style={{ textAlign: 'right' }}>Current</th>
                        <th style={{ textAlign: 'right' }}>P&L</th><th style={{ textAlign: 'right' }}>%</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holdings.map(h => (
                        <tr key={h.id}>
                          <td><span className="member-dot" style={{ backgroundColor: h.member_color }}></span>{h.member_name}</td>
                          <td style={{ fontWeight: 500 }}>{h.instrument}</td>
                          <td style={{ textAlign: 'right' }}>{h.quantity}</td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(h.avg_cost)}</td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(h.ltp)}</td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(h.invested)}</td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(h.current_value)}</td>
                          <td style={{ textAlign: 'right', color: h.pnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(h.pnl)}</td>
                          <td style={{ textAlign: 'right', color: h.pnl_percent >= 0 ? 'var(--success)' : 'var(--danger)' }}>{h.pnl_percent}%</td>
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
            <label>Member:</label>
            <select value={memberFilter} onChange={e => setMemberFilter(e.target.value)}>
              <option value="all">All Members</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" onClick={() => { setEditingDividend(null); setDividendForm({ family_member_id: members[0]?.id || '', date: '', stock_name: '', amount: '', notes: '' }); setShowDividendForm(true); }}>+ Add</button>
              <button className="btn btn-secondary" onClick={() => setShowImportDividends(true)}>Import Excel</button>
              <button className="btn btn-secondary" onClick={handleExport}>Export</button>
            </div>
          </div>

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
                      <label className="form-label">Date</label>
                      <input type="date" value={dividendForm.date} onChange={e => setDividendForm({ ...dividendForm, date: e.target.value })} className="form-control" required />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Stock</label>
                      <input value={dividendForm.stock_name} onChange={e => setDividendForm({ ...dividendForm, stock_name: e.target.value })} className="form-control" required placeholder="e.g. COALINDIA" />
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
                      <tr><th>Date</th><th>Stock</th><th>Account</th><th style={{ textAlign: 'right' }}>Amount</th><th>Notes</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {dividends.map(d => (
                        <tr key={d.id}>
                          <td>{d.date}</td>
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
                      <thead><tr><th>Stock</th><th style={{ textAlign: 'right' }}>Invested</th><th style={{ textAlign: 'right' }}>Current</th><th style={{ textAlign: 'right' }}>P&L</th></tr></thead>
                      <tbody>
                        {summary.topHoldings.map((h, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 500 }}>{h.instrument}</td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(h.invested)}</td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(h.current_value)}</td>
                            <td style={{ textAlign: 'right', color: h.pnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(h.pnl)}</td>
                          </tr>
                        ))}
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
