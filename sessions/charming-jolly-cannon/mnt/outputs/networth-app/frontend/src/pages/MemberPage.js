import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';
import api from '../utils/api';
import { formatCurrency, MONTHS, CATEGORIES, getCurrentMonth, getCurrentYear } from '../utils/helpers';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

function MemberPage() {
  const { id } = useParams();
  const [member, setMember] = useState(null);
  const [entries, setEntries] = useState([]);
  const [trend, setTrend] = useState([]);
  const [month, setMonth] = useState(getCurrentMonth());
  const [year, setYear] = useState(getCurrentYear());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMember();
    fetchTrend();
  }, [id]);

  useEffect(() => {
    fetchEntries();
  }, [id, month, year]);

  const fetchMember = async () => {
    try {
      const res = await api.get('/entries/members');
      const m = res.data.find(m => m.id === parseInt(id));
      setMember(m);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/entries/${id}/${year}/${month}`);
      setEntries(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrend = async () => {
    try {
      const res = await api.get(`/reports/trend/${id}`);
      setTrend(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  if (!member) return <div className="empty-state"><p>Loading...</p></div>;

  const totalInvested = entries.reduce((sum, e) => sum + e.invested_amount, 0);
  const totalCurrentValue = entries.reduce((sum, e) => sum + e.current_value, 0);
  const totalInterest = totalCurrentValue - totalInvested;
  const interestPercentage = totalInvested > 0 ? ((totalInterest / totalInvested) * 100).toFixed(2) : 0;

  const categoryMap = {};
  entries.forEach(entry => {
    if (!categoryMap[entry.category]) {
      categoryMap[entry.category] = { invested: 0, currentValue: 0, entries: [] };
    }
    categoryMap[entry.category].invested += entry.invested_amount;
    categoryMap[entry.category].currentValue += entry.current_value;
    categoryMap[entry.category].entries.push(entry);
  });

  const trendChartData = {
    labels: trend.map(t => t.label),
    datasets: [
      {
        label: 'Invested Amount',
        data: trend.map(t => t.invested),
        borderColor: 'rgba(79, 70, 229, 1)',
        backgroundColor: 'rgba(79, 70, 229, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Current Value',
        data: trend.map(t => t.currentValue),
        borderColor: 'rgba(16, 185, 129, 1)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4,
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value) => '₹' + (value / 100000).toFixed(1) + 'L'
        }
      }
    }
  };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link to="/" className="btn btn-secondary btn-sm">&larr; Back</Link>
          <div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="member-dot" style={{ backgroundColor: member.color, width: '16px', height: '16px' }}></span>
              {member.name}
            </h1>
            <p>{member.label}</p>
          </div>
        </div>
      </div>

      <div className="month-selector">
        <label>Month:</label>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>
        <label>Year:</label>
        <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} min="2020" max="2050" />
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Invested</div>
          <div className="stat-value">{formatCurrency(totalInvested)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Current Value</div>
          <div className="stat-value">{formatCurrency(totalCurrentValue)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Interest/Gains</div>
          <div className="stat-value" style={{ color: totalInterest >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {formatCurrency(totalInterest)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Returns %</div>
          <div className="stat-value" style={{ color: interestPercentage >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {interestPercentage >= 0 ? '+' : ''}{interestPercentage}%
          </div>
        </div>
      </div>

      {trend.length > 1 && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div className="card-header"><h3>Growth Trend</h3></div>
          <div className="card-body">
            <div className="chart-container">
              <Line data={trendChartData} options={chartOptions} />
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3>Investments for {MONTHS[month - 1]} {year}</h3>
          <span className="badge badge-success">{entries.length} entries</span>
        </div>
        <div className="card-body">
          {entries.length === 0 ? (
            <div className="empty-state">
              <h3>No entries for this month</h3>
              <p>Add entries via the Monthly Entry page.</p>
              <Link to="/entry" className="btn btn-primary" style={{ marginTop: '1rem' }}>Add Entry</Link>
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
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(categoryMap).map(([category, data]) => (
                    <React.Fragment key={category}>
                      {data.entries.map(entry => (
                        <tr key={entry.id}>
                          <td><span className="badge badge-success">{entry.category}</span></td>
                          <td>{entry.description}</td>
                          <td style={{ textAlign: 'right' }} className="amount">{formatCurrency(entry.invested_amount)}</td>
                          <td style={{ textAlign: 'right' }} className="amount">{formatCurrency(entry.current_value)}</td>
                          <td style={{ textAlign: 'right' }} className={`amount ${entry.current_value - entry.invested_amount >= 0 ? 'positive' : 'negative'}`}>
                            {formatCurrency(entry.current_value - entry.invested_amount)}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                  <tr style={{ fontWeight: '700', background: 'var(--gray-50)' }}>
                    <td colSpan="2">Total</td>
                    <td style={{ textAlign: 'right' }} className="amount">{formatCurrency(totalInvested)}</td>
                    <td style={{ textAlign: 'right' }} className="amount">{formatCurrency(totalCurrentValue)}</td>
                    <td style={{ textAlign: 'right' }} className={`amount ${totalInterest >= 0 ? 'positive' : 'negative'}`}>
                      {formatCurrency(totalInterest)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MemberPage;
