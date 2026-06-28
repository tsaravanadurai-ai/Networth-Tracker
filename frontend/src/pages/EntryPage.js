import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { formatCurrency, MONTHS, CATEGORIES, getCurrentMonth, getCurrentYear } from '../utils/helpers';

const DEBT_CATEGORIES = ['Personal Loan (Debt)', 'Home Loan (Debt)', 'Car Loan (Debt)', 'Other Loan (Debt)'];

function isDebtCategory(cat) {
  return DEBT_CATEGORIES.includes(cat) || cat.toLowerCase().includes('loan') || cat.toLowerCase().includes('debt');
}

function EntryPage() {
  const [members, setMembers] = useState([]);
  const [entries, setEntries] = useState([]);
  const [month, setMonth] = useState(getCurrentMonth());
  const [year, setYear] = useState(getCurrentYear());
  const [selectedMember, setSelectedMember] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [formData, setFormData] = useState({
    category: '',
    description: '',
    invested_amount: '',
    current_value: '',
    debt_amount: ''
  });
  const [copyData, setCopyData] = useState({
    fromMonth: getCurrentMonth(),
    fromYear: getCurrentYear(),
  });
  const [message, setMessage] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [replaceData, setReplaceData] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [goldGrams, setGoldGrams] = useState('');
  const [goldPrice, setGoldPrice] = useState(null);
  const [goldLoading, setGoldLoading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchMembers();
  }, []);

  useEffect(() => {
    if (selectedMember) {
      fetchEntries();
    }
  }, [selectedMember, month, year]);

  const fetchMembers = async () => {
    try {
      const res = await api.get('/entries/members');
      setMembers(res.data);
      if (res.data.length > 0) {
        setSelectedMember(res.data[0].id.toString());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEntries = async () => {
    try {
      const res = await api.get(`/entries/${selectedMember}/${year}/${month}`);
      setEntries(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const calculateGoldValue = async (grams) => {
    if (!grams || parseFloat(grams) <= 0) {
      setGoldPrice(null);
      return;
    }
    setGoldLoading(true);
    try {
      const res = await api.get(`/gold/calculate/${year}/${month}/${grams}`);
      setGoldPrice(res.data);
      if (res.data.value > 0) {
        setFormData(prev => ({ ...prev, current_value: res.data.value.toString() }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGoldLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const isDebt = isDebtCategory(formData.category);
      const payload = {
        family_member_id: parseInt(selectedMember),
        month,
        year,
        category: formData.category,
        description: formData.description || formData.category,
        invested_amount: isDebt ? 0 : (parseFloat(formData.invested_amount) || 0),
        current_value: isDebt ? 0 : (parseFloat(formData.current_value) || 0),
        debt_amount: isDebt ? (parseFloat(formData.debt_amount) || 0) : 0,
      };

      if (editingEntry) {
        await api.put(`/entries/${editingEntry.id}`, payload);
        showMsg('Entry updated successfully!');
      } else {
        await api.post('/entries', payload);
        showMsg('Entry added successfully!');
      }

      setShowModal(false);
      setEditingEntry(null);
      resetForm();
      fetchEntries();
    } catch (err) {
      showMsg(err.response?.data?.error || 'Error saving entry', true);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this entry?')) return;
    try {
      await api.delete(`/entries/${id}`);
      showMsg('Entry deleted successfully!');
      fetchEntries();
    } catch (err) {
      showMsg('Error deleting entry', true);
    }
  };

  const handleEdit = (entry) => {
    setEditingEntry(entry);
    const isDebt = isDebtCategory(entry.category);
    setFormData({
      category: entry.category,
      description: entry.description,
      invested_amount: isDebt ? '' : entry.invested_amount.toString(),
      current_value: isDebt ? '' : entry.current_value.toString(),
      debt_amount: isDebt ? Math.abs(entry.current_value).toString() : '',
    });
    setShowModal(true);
  };

  const handleCopyMonth = async () => {
    try {
      await api.post('/entries/copy-month', {
        fromMonth: copyData.fromMonth,
        fromYear: copyData.fromYear,
        toMonth: month,
        toYear: year,
      });
      showMsg('Entries copied successfully! Update the current values.');
      setShowCopyModal(false);
      fetchEntries();
    } catch (err) {
      showMsg(err.response?.data?.error || 'Error copying entries', true);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await api.get(`/excel/template/${selectedMember}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const currentMember = members.find(m => m.id === parseInt(selectedMember));
      link.setAttribute('download', `${currentMember?.name || 'Member'}_Template.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showMsg('Error downloading template', true);
    }
  };

  const handleDownloadAllTemplate = async () => {
    try {
      const response = await api.get('/excel/template-all', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Family_NetWorth_Template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showMsg('Error downloading template', true);
    }
  };

  const handleExport = async () => {
    try {
      const response = await api.get(`/excel/export/${selectedMember}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const currentMember = members.find(m => m.id === parseInt(selectedMember));
      link.setAttribute('download', `${currentMember?.name || 'Member'}_NetWorth_Export.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showMsg('Error exporting data', true);
    }
  };

  const handleExportAll = async () => {
    try {
      const response = await api.get('/excel/export/all', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Family_NetWorth_Export.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showMsg('Error exporting data', true);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      showMsg('Please select a file', true);
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('replace', replaceData.toString());

      const res = await api.post('/excel/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      let msg = res.data.message;
      if (res.data.details && res.data.details.length > 0) {
        msg += '\n' + res.data.details.join('\n');
      }
      if (res.data.errors && res.data.errors.length > 0) {
        msg += '\nWarnings: ' + res.data.errors.join('; ');
      }
      showMsg(msg);
      setShowUploadModal(false);
      setUploadFile(null);
      setReplaceData(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchEntries();
    } catch (err) {
      showMsg(err.response?.data?.error || 'Error uploading file', true);
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setFormData({ category: '', description: '', invested_amount: '', current_value: '', debt_amount: '' });
  };

  const showMsg = (msg, isError = false) => {
    setMessage({ text: msg, isError });
    setTimeout(() => setMessage(''), 6000);
  };

  // Separate assets and debts
  const assetEntries = entries.filter(e => !isDebtCategory(e.category));
  const debtEntries = entries.filter(e => isDebtCategory(e.category));

  const totalInvested = assetEntries.reduce((sum, e) => sum + e.invested_amount, 0);
  const totalCurrentValue = assetEntries.reduce((sum, e) => sum + e.current_value, 0);
  const totalDebt = debtEntries.reduce((sum, e) => sum + Math.abs(e.current_value), 0);
  const netWorth = totalCurrentValue - totalDebt;

  if (loading) return <div className="empty-state"><p>Loading...</p></div>;

  const currentMember = members.find(m => m.id === parseInt(selectedMember));
  const isDebtSelected = isDebtCategory(formData.category);
  const isGoldSelected = formData.category === 'Gold';

  return (
    <div>
      <div className="page-header">
        <h1>Monthly Entry</h1>
        <p>Add or update investment entries for each family member</p>
      </div>

      {message && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          marginBottom: '1rem',
          background: message.isError ? '#FEF2F2' : '#D1FAE5',
          color: message.isError ? '#991B1B' : '#065F46',
          border: `1px solid ${message.isError ? '#FECACA' : '#A7F3D0'}`,
          fontSize: '0.9rem',
          whiteSpace: 'pre-line'
        }}>
          {message.text}
        </div>
      )}

      {/* Excel Import/Export Section */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <h3>Excel Import / Export</h3>
        </div>
        <div className="card-body">
          <p style={{ color: 'var(--gray-600)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Upload your data from Excel or download templates/reports. Format: 
            <strong> Month | Category - Invested | Category - Interest | ...</strong>
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
              Upload Excel
            </button>
            <button className="btn btn-secondary" onClick={handleDownloadTemplate}>
              Download Template ({currentMember?.name})
            </button>
            <button className="btn btn-secondary" onClick={handleDownloadAllTemplate}>
              Download Template (All Members)
            </button>
            <button className="btn btn-secondary" onClick={handleExport}>
              Export Data ({currentMember?.name})
            </button>
            <button className="btn btn-secondary" onClick={handleExportAll}>
              Export All Data
            </button>
          </div>
        </div>
      </div>

      <div className="month-selector">
        <label>Member:</label>
        <select value={selectedMember} onChange={(e) => setSelectedMember(e.target.value)}>
          {members.map(m => (
            <option key={m.id} value={m.id}>{m.name} ({m.label})</option>
          ))}
        </select>
        <label>Month:</label>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>
        <label>Year:</label>
        <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} min="2020" max="2050" />
        <button className="btn btn-primary" onClick={() => { resetForm(); setEditingEntry(null); setShowModal(true); }}>
          + Add Entry
        </button>
        <button className="btn btn-secondary" onClick={() => setShowCopyModal(true)}>
          Copy Previous Month
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Invested ({currentMember?.name})</div>
          <div className="stat-value">{formatCurrency(totalInvested)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Current Value (Assets)</div>
          <div className="stat-value">{formatCurrency(totalCurrentValue)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Interest/Gains</div>
          <div className="stat-value" style={{ color: (totalCurrentValue - totalInvested) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {formatCurrency(totalCurrentValue - totalInvested)}
          </div>
        </div>
        {totalDebt > 0 && (
          <div className="stat-card" style={{ borderLeft: '4px solid var(--danger)' }}>
            <div className="stat-label">Total Debt</div>
            <div className="stat-value" style={{ color: 'var(--danger)' }}>-{formatCurrency(totalDebt)}</div>
          </div>
        )}
        <div className="stat-card" style={{ borderLeft: '4px solid var(--primary)' }}>
          <div className="stat-label">Net Worth</div>
          <div className="stat-value" style={{ color: netWorth >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {formatCurrency(netWorth)}
          </div>
        </div>
      </div>

      {/* Assets Table */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <h3>Assets - {currentMember?.name} - {MONTHS[month - 1]} {year}</h3>
          <span className="badge badge-success">{assetEntries.length} entries</span>
        </div>
        <div className="card-body">
          {assetEntries.length === 0 ? (
            <div className="empty-state">
              <h3>No asset entries yet</h3>
              <p>Click "Add Entry" or upload an Excel file.</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>Invested</th>
                    <th style={{ textAlign: 'right' }}>Current Value</th>
                    <th style={{ textAlign: 'right' }}>Gain/Loss</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assetEntries.map(entry => (
                    <tr key={entry.id}>
                      <td><span className="badge badge-success">{entry.category}</span></td>
                      <td>{entry.description !== entry.category ? entry.description : ''}</td>
                      <td style={{ textAlign: 'right' }} className="amount">{formatCurrency(entry.invested_amount)}</td>
                      <td style={{ textAlign: 'right' }} className="amount">{formatCurrency(entry.current_value)}</td>
                      <td style={{ textAlign: 'right' }} className={`amount ${(entry.current_value - entry.invested_amount) >= 0 ? 'positive' : 'negative'}`}>
                        {formatCurrency(entry.current_value - entry.invested_amount)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(entry)} style={{ marginRight: '0.5rem' }}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(entry.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: '700', background: 'var(--gray-50)' }}>
                    <td colSpan="2">Total Assets</td>
                    <td style={{ textAlign: 'right' }} className="amount">{formatCurrency(totalInvested)}</td>
                    <td style={{ textAlign: 'right' }} className="amount">{formatCurrency(totalCurrentValue)}</td>
                    <td style={{ textAlign: 'right' }} className={`amount ${(totalCurrentValue - totalInvested) >= 0 ? 'positive' : 'negative'}`}>
                      {formatCurrency(totalCurrentValue - totalInvested)}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Debts Table */}
      {debtEntries.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid var(--danger)' }}>
          <div className="card-header">
            <h3 style={{ color: 'var(--danger)' }}>Liabilities (Loans/Debt)</h3>
            <span className="badge badge-danger">{debtEntries.length} entries</span>
          </div>
          <div className="card-body">
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>Amount to Pay</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {debtEntries.map(entry => (
                    <tr key={entry.id}>
                      <td><span className="badge badge-danger">{entry.category}</span></td>
                      <td>{entry.description !== entry.category ? entry.description : ''}</td>
                      <td style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: '600' }}>
                        -{formatCurrency(Math.abs(entry.current_value))}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(entry)} style={{ marginRight: '0.5rem' }}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(entry.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: '700', background: '#FEF2F2' }}>
                    <td colSpan="2">Total Debt</td>
                    <td style={{ textAlign: 'right', color: 'var(--danger)' }}>-{formatCurrency(totalDebt)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Entry Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingEntry ? 'Edit Entry' : 'Add New Entry'}</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select
                    className="form-control"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    required
                  >
                    <option value="">Select category</option>
                    <optgroup label="Investments">
                      {CATEGORIES.filter(c => !isDebtCategory(c)).map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Loans / Debt (reduces net worth)">
                      {DEBT_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Description (optional)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={isDebtSelected ? "e.g., SBI Personal Loan" : "e.g., Axis Bluechip Fund, TCS Stock"}
                  />
                </div>

                {isDebtSelected ? (
                  <div className="form-group">
                    <label className="form-label">Amount Yet to Pay (₹)</label>
                    <input
                      type="number"
                      className="form-control"
                      value={formData.debt_amount}
                      onChange={(e) => setFormData({ ...formData, debt_amount: e.target.value })}
                      placeholder="Enter outstanding loan amount"
                      step="0.01"
                      style={{ borderColor: 'var(--danger)' }}
                    />
                    <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: '0.25rem' }}>
                      This amount will be subtracted from net worth.
                    </p>
                  </div>
                ) : isGoldSelected ? (
                  <div>
                    <div className="form-group">
                      <label className="form-label">Gold Quantity (grams)</label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                          type="number"
                          className="form-control"
                          value={goldGrams}
                          onChange={(e) => { setGoldGrams(e.target.value); }}
                          placeholder="Enter grams (e.g., 50)"
                          step="0.01"
                          style={{ flex: 1 }}
                        />
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => calculateGoldValue(goldGrams)} disabled={goldLoading}>
                          {goldLoading ? '...' : 'Calculate'}
                        </button>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: '0.25rem' }}>
                        Value calculated based on Chennai gold rate (20th of previous month)
                      </p>
                    </div>
                    {goldPrice && goldPrice.value > 0 && (
                      <div style={{ padding: '0.75rem', background: '#FFFBEB', borderRadius: '8px', border: '1px solid #FDE68A', marginBottom: '1rem', fontSize: '0.85rem' }}>
                        <strong>Gold Rate:</strong> ₹{goldPrice.price_per_gram.toLocaleString('en-IN')}/gram
                        <br/><strong>Total Value:</strong> ₹{goldPrice.value.toLocaleString('en-IN')} ({goldGrams}g × ₹{goldPrice.price_per_gram.toLocaleString('en-IN')})
                        <br/><span style={{ color: 'var(--gray-500)' }}>{goldPrice.message}</span>
                      </div>
                    )}
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Invested Amount (₹)</label>
                        <input
                          type="number"
                          className="form-control"
                          value={formData.invested_amount}
                          onChange={(e) => setFormData({ ...formData, invested_amount: e.target.value })}
                          placeholder="Purchase cost"
                          step="0.01"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Current Value (₹)</label>
                        <input
                          type="number"
                          className="form-control"
                          value={formData.current_value}
                          onChange={(e) => setFormData({ ...formData, current_value: e.target.value })}
                          placeholder="Auto-calculated from grams"
                          step="0.01"
                          style={{ borderColor: goldPrice ? '#F59E0B' : '' }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Invested Amount (₹)</label>
                      <input
                        type="number"
                        className="form-control"
                        value={formData.invested_amount}
                        onChange={(e) => setFormData({ ...formData, invested_amount: e.target.value })}
                        placeholder="0"
                        step="0.01"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Current Value (₹)</label>
                      <input
                        type="number"
                        className="form-control"
                        value={formData.current_value}
                        onChange={(e) => setFormData({ ...formData, current_value: e.target.value })}
                        placeholder="0"
                        step="0.01"
                      />
                    </div>
                  </div>
                )}

                {!isDebtSelected && formData.invested_amount && formData.current_value && (
                  <div style={{ padding: '0.75rem', background: 'var(--gray-50)', borderRadius: '8px', fontSize: '0.85rem' }}>
                    <strong>Interest/Gain:</strong>{' '}
                    <span style={{ color: (parseFloat(formData.current_value) - parseFloat(formData.invested_amount)) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {formatCurrency(parseFloat(formData.current_value) - parseFloat(formData.invested_amount))}
                    </span>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingEntry ? 'Update' : 'Add Entry'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Copy Month Modal */}
      {showCopyModal && (
        <div className="modal-overlay" onClick={() => setShowCopyModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Copy from Previous Month</h2>
              <button className="close-btn" onClick={() => setShowCopyModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem', color: 'var(--gray-600)', fontSize: '0.9rem' }}>
                Copy all entries from the selected month to <strong>{MONTHS[month - 1]} {year}</strong>.
              </p>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">From Month</label>
                  <select
                    className="form-control"
                    value={copyData.fromMonth}
                    onChange={(e) => setCopyData({ ...copyData, fromMonth: Number(e.target.value) })}
                  >
                    {MONTHS.map((m, i) => (
                      <option key={i} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">From Year</label>
                  <input
                    type="number"
                    className="form-control"
                    value={copyData.fromYear}
                    onChange={(e) => setCopyData({ ...copyData, fromYear: Number(e.target.value) })}
                    min="2020"
                    max="2050"
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCopyModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCopyMonth}>Copy Entries</button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Excel Modal */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Upload Excel File</h2>
              <button className="close-btn" onClick={() => setShowUploadModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--primary-light)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                <strong>Excel Format:</strong>
                <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem' }}>
                  <li>Each sheet named after a family member (Saravana, Iswarya, Sarvesh, Ishana, HUF)</li>
                  <li>Columns: <code>Month | PF - Invested | PF - Interest | ...</code></li>
                  <li>Month format: <code>Feb - 2021</code>, <code>May - 2026</code></li>
                  <li>Debt columns: <code>PL(Debt)</code> or <code>Personal Loan - Yet to pay</code> (single amount column)</li>
                </ul>
              </div>

              <div className="form-group">
                <label className="form-label">Select Excel File (.xlsx, .xls)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="form-control"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => setUploadFile(e.target.files[0])}
                  style={{ padding: '0.5rem' }}
                />
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={replaceData}
                    onChange={(e) => setReplaceData(e.target.checked)}
                  />
                  <span className="form-label" style={{ margin: 0 }}>Replace existing data (deletes all entries for matched members)</span>
                </label>
              </div>

              {uploadFile && (
                <div style={{ padding: '0.75rem', background: 'var(--gray-50)', borderRadius: '8px', fontSize: '0.85rem' }}>
                  Selected: <strong>{uploadFile.name}</strong> ({(uploadFile.size / 1024).toFixed(1)} KB)
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowUploadModal(false); setUploadFile(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUpload} disabled={!uploadFile || uploading}>
                {uploading ? 'Uploading...' : 'Upload & Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EntryPage;
