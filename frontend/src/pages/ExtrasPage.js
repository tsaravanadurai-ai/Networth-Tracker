import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { formatCurrency, MONTHS } from '../utils/helpers';

function ExtrasPage() {
  const [activeTab, setActiveTab] = useState('gold');
  const [members, setMembers] = useState([]);
  const [goldData, setGoldData] = useState(null);
  const [bankData, setBankData] = useState(null);
  const [debtData, setDebtData] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [message, setMessage] = useState('');
  const [formData, setFormData] = useState({});
  const [goldFile, setGoldFile] = useState(null);
  const [goldUploading, setGoldUploading] = useState(false);
  const [goldMemberFilter, setGoldMemberFilter] = useState('all');

  useEffect(() => { fetchMembers(); }, []);
  useEffect(() => {
    if (activeTab === 'gold') fetchGold();
    if (activeTab === 'bank') fetchBank();
    if (activeTab === 'debt') fetchDebt();
  }, [activeTab]);

  const fetchMembers = async () => {
    const res = await api.get('/entries/members');
    setMembers(res.data);
  };

  const fetchGold = async () => {
    const res = await api.get('/extras/gold-savings');
    setGoldData(res.data);
  };

  const fetchBank = async () => {
    const res = await api.get('/extras/bank-reserves');
    setBankData(res.data);
  };

  const fetchDebt = async () => {
    const res = await api.get('/extras/debt-given');
    setDebtData(res.data);
  };

  const showMsg = (text, isError = false) => {
    setMessage({ text, isError });
    setTimeout(() => setMessage(''), 4000);
  };

  const openModal = (type, item = null) => {
    setModalType(type);
    setEditingItem(item);
    if (type === 'gold') {
      setFormData(item ? { ...item } : { family_member_id: members[0]?.id || '', description: '', grams: '', purchase_month: new Date().getMonth() + 1, purchase_year: new Date().getFullYear(), notes: '' });
    } else if (type === 'bank') {
      setFormData(item ? { ...item } : { family_member_id: members[0]?.id || '', bank_name: '', account_type: 'Savings', amount: '', notes: '' });
    } else if (type === 'debt') {
      setFormData(item ? { ...item } : { family_member_id: members[0]?.id || '', person_name: '', amount: '', given_date: new Date().toISOString().split('T')[0], expected_return_date: '', purpose: '', notes: '' });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (modalType === 'gold') {
        if (editingItem) {
          const res = await api.put(`/extras/gold-savings/${editingItem.id}`, formData);
          showMsg(res.data.message);
        } else {
          const res = await api.post('/extras/gold-savings', formData);
          showMsg(res.data.message);
        }
        fetchGold();
      } else if (modalType === 'bank') {
        if (editingItem) {
          await api.put(`/extras/bank-reserves/${editingItem.id}`, formData);
          showMsg('Bank reserve updated');
        } else {
          await api.post('/extras/bank-reserves', formData);
          showMsg('Bank reserve added');
        }
        fetchBank();
      } else if (modalType === 'debt') {
        if (editingItem) {
          await api.put(`/extras/debt-given/${editingItem.id}`, formData);
          showMsg('Debt entry updated');
        } else {
          await api.post('/extras/debt-given', formData);
          showMsg('Debt entry added');
        }
        fetchDebt();
      }
      setShowModal(false);
    } catch (err) {
      showMsg(err.response?.data?.error || 'Error saving', true);
    }
  };

  const handleDelete = async (type, id) => {
    if (!window.confirm('Are you sure?')) return;
    try {
      await api.delete(`/extras/${type}/${id}`);
      showMsg('Deleted successfully');
      if (type === 'gold-savings') fetchGold();
      if (type === 'bank-reserves') fetchBank();
      if (type === 'debt-given') fetchDebt();
    } catch (err) { showMsg('Error deleting', true); }
  };

  const handleDebtStatus = async (id, status) => {
    await api.put(`/extras/debt-given/${id}/status`, { status });
    fetchDebt();
    showMsg(`Marked as ${status}`);
  };

  const exportGold = async () => {
    try {
      const response = await api.get('/extras/gold-savings-export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Gold_Savings_Report.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) { showMsg('Error exporting', true); }
  };

  const importGold = async () => {
    if (!goldFile) return;
    setGoldUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', goldFile);
      const res = await api.post('/extras/gold-savings-import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      let msg = res.data.message;
      if (res.data.errors?.length) msg += '\nWarnings: ' + res.data.errors.join('; ');
      showMsg(msg);
      setGoldFile(null);
      fetchGold();
    } catch (err) { showMsg(err.response?.data?.error || 'Error importing', true); }
    finally { setGoldUploading(false); }
  };

  const downloadGoldTemplate = async () => {
    try {
      const response = await api.get('/extras/gold-savings-template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Gold_Savings_Template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) { showMsg('Error downloading', true); }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Gold, Bank & Debt Tracker</h1>
        <p>Track gold savings, bank reserves, and money lent to others</p>
      </div>

      {message && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', background: message.isError ? '#FEF2F2' : '#D1FAE5', color: message.isError ? '#991B1B' : '#065F46', border: `1px solid ${message.isError ? '#FECACA' : '#A7F3D0'}`, fontSize: '0.9rem' }}>
          {message.text}
        </div>
      )}

      <div className="tabs">
        <button className={`tab ${activeTab === 'gold' ? 'active' : ''}`} onClick={() => setActiveTab('gold')}>Gold Savings</button>
        <button className={`tab ${activeTab === 'bank' ? 'active' : ''}`} onClick={() => setActiveTab('bank')}>Bank Reserve</button>
        <button className={`tab ${activeTab === 'debt' ? 'active' : ''}`} onClick={() => setActiveTab('debt')}>Debt Given</button>
      </div>

      {/* GOLD SAVINGS TAB */}
      {activeTab === 'gold' && (
        <div>
          {goldData?.summary && (
            <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
              <div className="stat-card" style={{ borderLeft: '4px solid #F59E0B' }}>
                <div className="stat-label">Total Gold</div>
                <div className="stat-value">{goldData.summary.totalGrams.toFixed(2)}g</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Purchase Amount</div>
                <div className="stat-value">{formatCurrency(goldData.summary.totalPurchaseAmount)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Current Value</div>
                <div className="stat-value">{formatCurrency(goldData.summary.totalCurrentValue)}</div>
                <div className="stat-change" style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>at ₹{goldData.summary.currentPricePerGram}/g</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Gain/Loss</div>
                <div className="stat-value" style={{ color: goldData.summary.totalGain >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {formatCurrency(goldData.summary.totalGain)}
                </div>
              </div>
            </div>
          )}

          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-body">
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn btn-primary" onClick={() => openModal('gold')}>+ Add Gold Purchase</button>
                <button className="btn btn-secondary" onClick={exportGold}>Export to Excel</button>
                <button className="btn btn-secondary" onClick={downloadGoldTemplate}>Download Template</button>
                <span style={{ color: 'var(--gray-400)' }}>|</span>
                <input type="file" accept=".xlsx,.xls" onChange={e => setGoldFile(e.target.files[0])} style={{ fontSize: '0.85rem' }} />
                <button className="btn btn-primary btn-sm" onClick={importGold} disabled={!goldFile || goldUploading}>
                  {goldUploading ? 'Importing...' : 'Import Excel'}
                </button>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: '0.5rem' }}>
                Excel format: Each sheet = member name. Columns: Description | Grams | Purchase Month | Notes
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3>Gold Savings</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--gray-500)' }}>Filter:</label>
                <select value={goldMemberFilter} onChange={e => setGoldMemberFilter(e.target.value)} className="form-control" style={{ width: 'auto', minWidth: '150px', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}>
                  <option value="all">All Members</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            </div>
            <div className="card-body">
              {!goldData?.entries?.length ? (
                <div className="empty-state"><h3>No gold entries yet</h3></div>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>Description</th>
                        <th style={{ textAlign: 'right' }}>Grams</th>
                        <th>Purchase Month</th>
                        <th style={{ textAlign: 'right' }}>Purchase Rate</th>
                        <th style={{ textAlign: 'right' }}>Purchase Amt</th>
                        <th style={{ textAlign: 'right' }}>Current Value</th>
                        <th style={{ textAlign: 'right' }}>Gain</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {goldData.entries.filter(e => goldMemberFilter === 'all' || e.family_member_id === Number(goldMemberFilter)).map(e => (
                        <tr key={e.id}>
                          <td><span className="member-dot" style={{ backgroundColor: e.member_color }}></span>{e.member_name}</td>
                          <td>{e.description}</td>
                          <td style={{ textAlign: 'right', fontWeight: '600' }}>{e.grams}g</td>
                          <td>{MONTHS[e.purchase_month - 1]} {e.purchase_year}</td>
                          <td style={{ textAlign: 'right' }}>₹{e.purchase_price_per_gram.toLocaleString('en-IN')}/g</td>
                          <td style={{ textAlign: 'right' }} className="amount">{formatCurrency(e.purchase_amount)}</td>
                          <td style={{ textAlign: 'right' }} className="amount">{formatCurrency(e.current_value)}</td>
                          <td style={{ textAlign: 'right' }} className={`amount ${e.gain >= 0 ? 'positive' : 'negative'}`}>{formatCurrency(e.gain)}</td>
                          <td>
                            <button className="btn btn-secondary btn-sm" onClick={() => openModal('gold', e)} style={{ marginRight: '0.5rem' }}>Edit</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete('gold-savings', e.id)}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* BANK RESERVE TAB */}
      {activeTab === 'bank' && (
        <div>
          {bankData && (
            <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
              <div className="stat-card" style={{ borderLeft: '4px solid var(--primary)' }}>
                <div className="stat-label">Total Bank Reserve</div>
                <div className="stat-value">{formatCurrency(bankData.total)}</div>
              </div>
            </div>
          )}

          <button className="btn btn-primary" onClick={() => openModal('bank')} style={{ marginBottom: '1.5rem' }}>+ Add Bank Reserve</button>

          <div className="card">
            <div className="card-header"><h3>Bank Reserves</h3></div>
            <div className="card-body">
              {!bankData?.entries?.length ? (
                <div className="empty-state"><h3>No bank reserves added yet</h3><p>Add your savings/FD/reserve money here.</p></div>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>Bank Name</th>
                        <th>Account Type</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                        <th>Notes</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bankData.entries.map(e => (
                        <tr key={e.id}>
                          <td><span className="member-dot" style={{ backgroundColor: e.member_color }}></span>{e.member_name}</td>
                          <td><strong>{e.bank_name}</strong></td>
                          <td>{e.account_type}</td>
                          <td style={{ textAlign: 'right', fontWeight: '600' }}>{formatCurrency(e.amount)}</td>
                          <td style={{ color: 'var(--gray-500)', fontSize: '0.85rem' }}>{e.notes}</td>
                          <td>
                            <button className="btn btn-secondary btn-sm" onClick={() => openModal('bank', e)} style={{ marginRight: '0.5rem' }}>Edit</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete('bank-reserves', e.id)}>Delete</button>
                          </td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: '700', background: 'var(--gray-50)' }}>
                        <td colSpan="3">Total</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(bankData.total)}</td>
                        <td colSpan="2"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DEBT GIVEN TAB */}
      {activeTab === 'debt' && (
        <div>
          {debtData && (
            <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
              <div className="stat-card" style={{ borderLeft: '4px solid #F59E0B' }}>
                <div className="stat-label">Total Pending</div>
                <div className="stat-value">{formatCurrency(debtData.totalPending)}</div>
              </div>
              <div className="stat-card" style={{ borderLeft: '4px solid var(--success)' }}>
                <div className="stat-label">Total Returned</div>
                <div className="stat-value">{formatCurrency(debtData.totalReturned)}</div>
              </div>
            </div>
          )}

          <button className="btn btn-primary" onClick={() => openModal('debt')} style={{ marginBottom: '1.5rem' }}>+ Add Debt Given</button>

          <div className="card">
            <div className="card-header"><h3>Money Lent to Others (No Interest)</h3></div>
            <div className="card-body">
              {!debtData?.entries?.length ? (
                <div className="empty-state"><h3>No debt entries</h3><p>Track money you've lent to people here.</p></div>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>From</th>
                        <th>Given To</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                        <th>Date Given</th>
                        <th>Expected Return</th>
                        <th>Purpose</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {debtData.entries.map(e => (
                        <tr key={e.id} style={{ opacity: e.status === 'returned' ? 0.6 : 1 }}>
                          <td><span className="member-dot" style={{ backgroundColor: e.member_color }}></span>{e.member_name}</td>
                          <td><strong>{e.person_name}</strong></td>
                          <td style={{ textAlign: 'right', fontWeight: '600' }}>{formatCurrency(e.amount)}</td>
                          <td>{e.given_date}</td>
                          <td>{e.expected_return_date || '-'}</td>
                          <td style={{ fontSize: '0.85rem' }}>{e.purpose || '-'}</td>
                          <td>
                            {e.status === 'pending' ? (
                              <span className="badge badge-danger" style={{ cursor: 'pointer' }} onClick={() => handleDebtStatus(e.id, 'returned')}>Pending</span>
                            ) : (
                              <span className="badge badge-success" style={{ cursor: 'pointer' }} onClick={() => handleDebtStatus(e.id, 'pending')}>Returned</span>
                            )}
                          </td>
                          <td>
                            <button className="btn btn-secondary btn-sm" onClick={() => openModal('debt', e)} style={{ marginRight: '0.5rem' }}>Edit</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete('debt-given', e.id)}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingItem ? 'Edit' : 'Add'} {modalType === 'gold' ? 'Gold Purchase' : modalType === 'bank' ? 'Bank Reserve' : 'Debt Given'}</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Family Member</label>
                  <select className="form-control" value={formData.family_member_id} onChange={e => setFormData({ ...formData, family_member_id: Number(e.target.value) })} required>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name} ({m.label})</option>)}
                  </select>
                </div>

                {modalType === 'gold' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Description</label>
                      <input type="text" className="form-control" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="e.g., Gold Chain, Gold Coin, Sovereign" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Gold Quantity (grams) *</label>
                      <input type="number" className="form-control" value={formData.grams} onChange={e => setFormData({ ...formData, grams: e.target.value })} placeholder="e.g., 8, 20, 50" step="0.01" required />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Purchase Month</label>
                        <select className="form-control" value={formData.purchase_month} onChange={e => setFormData({ ...formData, purchase_month: Number(e.target.value) })}>
                          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Purchase Year</label>
                        <input type="number" className="form-control" value={formData.purchase_year} onChange={e => setFormData({ ...formData, purchase_year: Number(e.target.value) })} min="2000" max="2050" />
                      </div>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginBottom: '1rem' }}>
                      Purchase amount will be auto-calculated from gold price of that month.
                    </p>
                    <div className="form-group">
                      <label className="form-label">Notes</label>
                      <input type="text" className="form-control" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Optional notes" />
                    </div>
                  </>
                )}

                {modalType === 'bank' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Bank Name *</label>
                      <input type="text" className="form-control" value={formData.bank_name} onChange={e => setFormData({ ...formData, bank_name: e.target.value })} placeholder="e.g., SBI, HDFC, ICICI" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Account Type</label>
                      <select className="form-control" value={formData.account_type} onChange={e => setFormData({ ...formData, account_type: e.target.value })}>
                        <option value="Savings">Savings Account</option>
                        <option value="Current">Current Account</option>
                        <option value="FD">Fixed Deposit</option>
                        <option value="RD">Recurring Deposit</option>
                        <option value="Cash">Cash at Home</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Amount (₹) *</label>
                      <input type="number" className="form-control" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} placeholder="Reserve amount" step="0.01" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Notes</label>
                      <input type="text" className="form-control" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Optional notes" />
                    </div>
                  </>
                )}

                {modalType === 'debt' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Given To (Person Name) *</label>
                      <input type="text" className="form-control" value={formData.person_name} onChange={e => setFormData({ ...formData, person_name: e.target.value })} placeholder="Name of person" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Amount (₹) *</label>
                      <input type="number" className="form-control" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} placeholder="Amount lent" step="0.01" required />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Date Given *</label>
                        <input type="date" className="form-control" value={formData.given_date} onChange={e => setFormData({ ...formData, given_date: e.target.value })} required />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Expected Return Date</label>
                        <input type="date" className="form-control" value={formData.expected_return_date} onChange={e => setFormData({ ...formData, expected_return_date: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Purpose</label>
                      <input type="text" className="form-control" value={formData.purpose} onChange={e => setFormData({ ...formData, purpose: e.target.value })} placeholder="e.g., Medical emergency, House repair" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Notes</label>
                      <input type="text" className="form-control" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Optional notes" />
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingItem ? 'Update' : 'Add'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExtrasPage;
