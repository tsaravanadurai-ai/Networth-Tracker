import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { MONTHS } from '../utils/helpers';

function GoldPricePage() {
  const [prices, setPrices] = useState([]);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [pricePerGram, setPricePerGram] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchPrices();
  }, []);

  const fetchPrices = async () => {
    try {
      const res = await api.get('/gold/prices');
      setPrices(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      const res = await api.post('/gold/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMessage({ text: res.data.message + (res.data.errors?.length ? '\nWarnings: ' + res.data.errors.join('; ') : ''), isError: false });
      setUploadFile(null);
      fetchPrices();
    } catch (err) {
      setMessage({ text: err.response?.data?.error || 'Error uploading', isError: true });
    } finally {
      setUploading(false);
    }
    setTimeout(() => setMessage(''), 5000);
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await api.get('/gold/template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Gold_Prices_Template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setMessage({ text: 'Error downloading template', isError: true });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pricePerGram) {
      setMessage({ text: 'Please enter the gold price', isError: true });
      return;
    }

    try {
      await api.post('/gold/price', {
        month,
        year,
        price_per_gram: parseFloat(pricePerGram)
      });
      setMessage({ text: `Gold price updated for ${MONTHS[month - 1]} ${year}`, isError: false });
      setPricePerGram('');
      fetchPrices();
    } catch (err) {
      setMessage({ text: err.response?.data?.error || 'Error updating price', isError: true });
    }
    setTimeout(() => setMessage(''), 3000);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Gold Price Management</h1>
        <p>Set gold prices (Chennai rate, 22K, per gram on 20th of each month)</p>
      </div>

      {message && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem',
          background: message.isError ? '#FEF2F2' : '#D1FAE5',
          color: message.isError ? '#991B1B' : '#065F46',
          border: `1px solid ${message.isError ? '#FECACA' : '#A7F3D0'}`,
          fontSize: '0.9rem'
        }}>
          {message.text}
        </div>
      )}

      <div className="card" style={{ marginBottom: '2rem' }}>
        <div className="card-header"><h3>Add / Update Gold Price</h3></div>
        <div className="card-body">
          <form onSubmit={handleSubmit} style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Month</label>
              <select className="form-control" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Year</label>
              <input type="number" className="form-control" value={year} onChange={(e) => setYear(Number(e.target.value))} min="2020" max="2050" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Price per gram (₹) - 22K Chennai</label>
              <input
                type="number"
                className="form-control"
                value={pricePerGram}
                onChange={(e) => setPricePerGram(e.target.value)}
                placeholder="e.g., 5500"
                step="1"
                style={{ width: '180px' }}
              />
            </div>
            <button type="submit" className="btn btn-primary">Save Price</button>
          </form>
          <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--gray-500)' }}>
            Enter the gold rate as on 20th of each month (Chennai, 22 Karat, per gram). 
            This rate will be used to calculate gold value when you enter grams in the Monthly Entry form.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <div className="card-header"><h3>Import Gold Prices from Excel</h3></div>
        <div className="card-body">
          <p style={{ color: 'var(--gray-600)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Upload an Excel file with columns: <strong>Month</strong> and <strong>Price per Gram</strong>.
            Month format: "Feb - 2021", "May - 2026", etc.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setUploadFile(e.target.files[0])} style={{ fontSize: '0.9rem' }} />
            <button className="btn btn-primary" onClick={handleUpload} disabled={!uploadFile || uploading}>
              {uploading ? 'Uploading...' : 'Upload Prices'}
            </button>
            <button className="btn btn-secondary" onClick={handleDownloadTemplate}>
              Download Template
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Gold Price History</h3></div>
        <div className="card-body">
          {loading ? (
            <p>Loading...</p>
          ) : prices.length === 0 ? (
            <div className="empty-state">
              <h3>No gold prices set yet</h3>
              <p>Add gold prices above to enable automatic gold value calculation.</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th style={{ textAlign: 'right' }}>Price per Gram (₹)</th>
                    <th style={{ textAlign: 'right' }}>Price per 8 Grams (₹)</th>
                    <th>Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {prices.map(p => (
                    <tr key={`${p.year}-${p.month}`}>
                      <td>{MONTHS[p.month - 1]} {p.year}</td>
                      <td style={{ textAlign: 'right', fontWeight: '600' }}>₹{p.price_per_gram.toLocaleString('en-IN')}</td>
                      <td style={{ textAlign: 'right' }}>₹{(p.price_per_gram * 8).toLocaleString('en-IN')}</td>
                      <td style={{ color: 'var(--gray-500)', fontSize: '0.85rem' }}>{new Date(p.updated_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GoldPricePage;
