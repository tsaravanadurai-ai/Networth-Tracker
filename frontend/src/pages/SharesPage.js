import React, { useState, useEffect, useCallback } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title } from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import api from '../utils/api';
import { formatCurrency, MONTHS, getCurrentMonth, getCurrentYear } from '../utils/helpers';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title);

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
      const res = await api.get('/entries/family-members');
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

  return (
    <div>
      <div className="page-header">
        <h1>Shares & Dividends</h1>
        <p>Track your stock portfolio and dividend income</p>
      </div>

      {message && <div className="alert" style={{ background: message.startsWith('Error') ? '#FEE2E2' : '#D1FAE5', color: message.startsWith('Error') ? '#991B1B' : '#065F46', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem' }}>{message}</div>}

      <div className="tabs" style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '2px solid var(--gray-200)' }}>
        {['holdings', 'dividends', 'reports'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ padding: '0.75rem 1.5rem', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.95rem', fontWeight: activeTab === tab ? '600' : '400', color: activeTab === tab ? 'var(--primary)' : 'var(--gray-500)', borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: '-2px', textTransform: 'capitalize' }}>
            {tab}
          </button>
        ))}
      </div>

      {/* ====== HOLDINGS TAB ====== */}
      {activeTab === 'holdings' && (
        <div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
            <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="form-select" style={{ width: 'auto' }}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <input type="number" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} min="2020" max="2050" className="form-input" style={{ width: '100px' }} />
            <select value={memberFilter} onChange={e => setMemberFilter(e.target.value)} className="form-select" style={{ width: 'auto' }}>
              <option value="all">All Members</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" onClick={() => { setEditingHolding(null); setHoldingForm({ family_member_id: '', instrument: '', quantity: '', avg_cost: '', ltp: '' }); setShowHoldingForm(true); }}>+ Add</button>
              <button className="btn btn-secondary" onClick={() => setShowImportHoldings(true)}>Import Excel</button>
              <button className="btn btn-secondary" onClick={handleExport}>Export</button>
            </div>
          </div>

          {/* Stats */}
          {holdings.length > 0 && (
            <div className="stats-grid" style={{ marginBottom: '1rem' }}>
              <div className="stat-card"><div className="stat-label">Invested</div><div className="stat-value">{formatCurrency(totalInvested)}</div></div>
              <div className="stat-card"><div className="stat-label">Current Value</div><div className="stat-value">{formatCurrency(totalCurrent)}</div></div>
              <div className="stat-card"><div className="stat-label">P&L</div><div className="stat-value" style={{ color: totalPnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(totalPnl)} ({totalPnlPct}%)</div></div>
              <div className="stat-card"><div className="stat-label">Stocks</div><div className="stat-value">{holdings.length}</div></div>
            </div>
          )}

          {/* Import Modal */}
          {showImportHoldings && (
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="card-header"><h3>Import Share Tracker</h3></div>
              <div className="card-body">
                <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: '1rem' }}>
                  Upload your Zerodha Kite export Excel. Each sheet tab should be named like "Jul 2026", "Mar 2025" etc.
                  Columns: Instrument, Qty., Avg. cost, LTP, Invested, Cur. val, P&L, Overall %.
                  Select which member this data belongs to.
                </p>
                <form onSubmit={handleImportHoldings} style={{ display: 'flex', gap: '0.75rem', alignItems: 'end', flexWrap: 'wrap' }}>
                  <div>
                    <label className="form-label">Member</label>
                    <select value={importMemberId} onChange={e => setImportMemberId(e.target.value)} className="form-select" required>
                      <option value="">Select member</option>
                      {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                  <div><label className="form-label">Excel File</label><input type="file" accept=".xlsx,.xls,.csv" className="form-input" required /></div>
                  <button type="submit" className="btn btn-primary">Import</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowImportHoldings(false)}>Cancel</button>
                </form>
              </div>
            </div>
          )}

          {/* Add/Edit Form */}
          {showHoldingForm && (
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="card-header"><h3>{editingHolding ? 'Edit' : 'Add'} Holding</h3></div>
              <div className="card-body">
                <form onSubmit={handleHoldingSubmit}>
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Member</label>
                      <select value={holdingForm.family_member_id} onChange={e => setHoldingForm({ ...holdingForm, family_member_id: e.target.value })} className="form-select" required>
                        <option value="">Select</option>
                        {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Instrument</label>
                      <input value={holdingForm.instrument} onChange={e => setHoldingForm({ ...holdingForm, instrument: e.target.value })} className="form-input" required placeholder="e.g. RELIANCE" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Quantity</label>
                      <input type="number" step="0.01" value={holdingForm.quantity} onChange={e => setHoldingForm({ ...holdingForm, quantity: e.target.value })} className="form-input" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Avg. Cost</label>
                      <input type="number" step="0.01" value={holdingForm.avg_cost} onChange={e => setHoldingForm({ ...holdingForm, avg_cost: e.target.value })} className="form-input" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">LTP (Current Price)</label>
                      <input type="number" step="0.01" value={holdingForm.ltp} onChange={e => setHoldingForm({ ...holdingForm, ltp: e.target.value })} className="form-input" required />
                    </div>
                  </div>
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
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
                      <td><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: h.member_color, marginRight: '6px' }}></span>{h.member_name}</td>
                      <td style={{ fontWeight: 500 }}>{h.instrument}</td>
                      <td style={{ textAlign: 'right' }}>{h.quantity}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(h.avg_cost)}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(h.ltp)}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(h.invested)}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(h.current_value)}</td>
                      <td style={{ textAlign: 'right', color: h.pnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(h.pnl)}</td>
                      <td style={{ textAlign: 'right', color: h.pnl_percent >= 0 ? 'var(--success)' : 'var(--danger)' }}>{h.pnl_percent}%</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button className="btn btn-sm" onClick={() => editHolding(h)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>Edit</button>
                          <button className="btn btn-sm btn-danger" onClick={() => deleteHolding(h.id)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>Del</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ====== DIVIDENDS TAB ====== */}
      {activeTab === 'dividends' && (
        <div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
            <select value={memberFilter} onChange={e => setMemberFilter(e.target.value)} className="form-select" style={{ width: 'auto' }}>
              <option value="all">All Members</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" onClick={() => { setEditingDividend(null); setDividendForm({ family_member_id: '', date: '', stock_name: '', amount: '', notes: '' }); setShowDividendForm(true); }}>+ Add</button>
              <button className="btn btn-secondary" onClick={() => setShowImportDividends(true)}>Import Excel</button>
              <button className="btn btn-secondary" onClick={handleExport}>Export</button>
            </div>
          </div>

          {/* Total dividends */}
          {dividends.length > 0 && (
            <div className="stats-grid" style={{ marginBottom: '1rem' }}>
              <div className="stat-card"><div className="stat-label">Total Dividends</div><div className="stat-value" style={{ color: 'var(--success)' }}>{formatCurrency(dividends.reduce((s, d) => s + d.amount, 0))}</div></div>
              <div className="stat-card"><div className="stat-label">Entries</div><div className="stat-value">{dividends.length}</div></div>
            </div>
          )}

          {/* Import Dividends */}
          {showImportDividends && (
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="card-header"><h3>Import Dividends</h3></div>
              <div className="card-body">
                <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: '1rem' }}>
                  Upload Excel with columns: Date, Dividend (stock name), Account (Saravana/Iswarya/HUF), Amount.
                  Account names are matched to family members.
                </p>
                <form onSubmit={handleImportDividends} style={{ display: 'flex', gap: '0.75rem', alignItems: 'end' }}>
                  <div><label className="form-label">Excel File</label><input type="file" accept=".xlsx,.xls,.csv" className="form-input" required /></div>
                  <button type="submit" className="btn btn-primary">Import</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowImportDividends(false)}>Cancel</button>
                </form>
              </div>
            </div>
          )}

          {/* Add/Edit Dividend Form */}
          {showDividendForm && (
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="card-header"><h3>{editingDividend ? 'Edit' : 'Add'} Dividend</h3></div>
              <div className="card-body">
                <form onSubmit={handleDividendSubmit}>
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Member</label>
                      <select value={dividendForm.family_member_id} onChange={e => setDividendForm({ ...dividendForm, family_member_id: e.target.value })} className="form-select" required>
                        <option value="">Select</option>
                        {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Date</label>
                      <input type="date" value={dividendForm.date} onChange={e => setDividendForm({ ...dividendForm, date: e.target.value })} className="form-input" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Stock</label>
                      <input value={dividendForm.stock_name} onChange={e => setDividendForm({ ...dividendForm, stock_name: e.target.value })} className="form-input" required placeholder="e.g. COALINDIA" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Amount (₹)</label>
                      <input type="number" step="0.01" value={dividendForm.amount} onChange={e => setDividendForm({ ...dividendForm, amount: e.target.value })} className="form-input" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Notes</label>
                      <input value={dividendForm.notes} onChange={e => setDividendForm({ ...dividendForm, notes: e.target.value })} className="form-input" placeholder="Optional" />
                    </div>
                  </div>
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
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
                      <td><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: d.member_color, marginRight: '6px' }}></span>{d.member_name}</td>
                      <td style={{ textAlign: 'right', color: 'var(--success)' }}>{formatCurrency(d.amount)}</td>
                      <td style={{ color: 'var(--gray-500)', fontSize: '0.85rem' }}>{d.notes}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button className="btn btn-sm" onClick={() => editDividend(d)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>Edit</button>
                          <button className="btn btn-sm btn-danger" onClick={() => deleteDividend(d.id)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>Del</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                          <td><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: ms.member.color, marginRight: '6px' }}></span>{ms.member.name}</td>
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

          {/* Charts */}
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
                    }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { ticks: { callback: v => '₹' + (v / 100000).toFixed(1) + 'L' } } } }} />
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
                    }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => v + '%' } } } }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Dividend trend */}
          {summary.dividendTrend.length > 1 && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header"><h3>Dividend Income Trend</h3></div>
              <div className="card-body">
                <div className="chart-container">
                  <Bar data={{
                    labels: summary.dividendTrend.map(t => t.label),
                    datasets: [{ label: 'Dividend Income', data: summary.dividendTrend.map(t => t.total), backgroundColor: 'rgba(16,185,129,0.7)' }]
                  }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => '₹' + v.toLocaleString('en-IN') } } } }} />
                </div>
              </div>
            </div>
          )}

          {/* Top Holdings & Dividend Stocks */}
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
                        {summary.topDivStocks.map((s, i) => (
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
