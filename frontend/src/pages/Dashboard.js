import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import api from '../utils/api';
import { formatCurrency, MONTHS, getCurrentMonth, getCurrentYear } from '../utils/helpers';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [month, setMonth] = useState(getCurrentMonth());
  const [year, setYear] = useState(getCurrentYear());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSummary();
  }, [month, year]);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/reports/summary/${year}/${month}`);
      setSummary(res.data);
    } catch (err) {
      console.error('Error fetching summary:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="empty-state"><p>Loading dashboard...</p></div>;
  if (!summary) return <div className="empty-state"><h3>No data available</h3><p>Start by adding monthly entries.</p></div>;

  const { consolidated } = summary;
  const membersWithData = summary.summary.filter(s => s.entryCount > 0 || (s.goldGrams && s.goldGrams > 0));

  const getGoldValue = (s) => s.goldGrams > 0 && consolidated.goldPricePerGram ? s.goldGrams * consolidated.goldPricePerGram : 0;
  const getGoldPurchase = (s) => s.goldPurchaseValue || 0;

  const doughnutData = {
    labels: membersWithData.map(s => s.member.name),
    datasets: [{
      data: membersWithData.map(s => s.totalCurrentValue + getGoldValue(s)),
      backgroundColor: membersWithData.map(s => s.member.color),
      borderWidth: 2,
      borderColor: '#fff',
    }]
  };

  const barData = {
    labels: membersWithData.map(s => s.member.name),
    datasets: [
      {
        label: 'Invested',
        data: membersWithData.map(s => s.totalInvested + getGoldPurchase(s)),
        backgroundColor: 'rgba(79, 70, 229, 0.7)',
      },
      {
        label: 'Current Value',
        data: membersWithData.map(s => s.totalCurrentValue + getGoldValue(s)),
        backgroundColor: 'rgba(16, 185, 129, 0.7)',
      }
    ]
  };

  const barOptions = {
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
        <h1>Family Net Worth Dashboard</h1>
        <p>Consolidated view of your family's investments</p>
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
          <div className="stat-value">{formatCurrency(consolidated.totalInvested)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Current Value (Assets)</div>
          <div className="stat-value">{formatCurrency(consolidated.totalCurrentValue)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Interest/Gains</div>
          <div className="stat-value" style={{ color: consolidated.totalInterest >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {formatCurrency(consolidated.totalInterest)}
          </div>
          <div className={`stat-change ${consolidated.totalInterest >= 0 ? 'positive' : 'negative'}`}>
            {consolidated.interestPercentage >= 0 ? '+' : ''}{consolidated.interestPercentage}% returns
          </div>
        </div>
        {consolidated.totalDebt > 0 && (
          <div className="stat-card" style={{ borderLeft: '4px solid var(--danger)' }}>
            <div className="stat-label">Total Debt</div>
            <div className="stat-value" style={{ color: 'var(--danger)' }}>-{formatCurrency(consolidated.totalDebt)}</div>
          </div>
        )}
        {consolidated.bankReserve > 0 && (
          <div className="stat-card">
            <div className="stat-label">Bank Reserve</div>
            <div className="stat-value">{formatCurrency(consolidated.bankReserve)}</div>
          </div>
        )}
        {consolidated.debtGiven > 0 && (
          <div className="stat-card">
            <div className="stat-label">Debt Given (Receivable)</div>
            <div className="stat-value">{formatCurrency(consolidated.debtGiven)}</div>
          </div>
        )}
        {consolidated.goldGrams > 0 && (
          <div className="stat-card" style={{ borderLeft: '4px solid #F59E0B' }}>
            <div className="stat-label">Gold</div>
            <div className="stat-value" style={{ color: '#F59E0B' }}>{formatCurrency(consolidated.goldCurrentValue || 0)}</div>
            <div className="stat-change" style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
              {consolidated.goldGrams?.toFixed(1)}g @ ₹{consolidated.goldPricePerGram?.toLocaleString('en-IN')}/g (22K Chennai)
            </div>
          </div>
        )}
        <div className="stat-card" style={{ borderLeft: '4px solid var(--primary)' }}>
          <div className="stat-label">Total Net Worth</div>
          <div className="stat-value" style={{ color: (consolidated.totalNetWorth || consolidated.netWorth) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {formatCurrency(consolidated.totalNetWorth || consolidated.netWorth)}
          </div>
          <div className="stat-change" style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
            Investments + Bank + Receivables + Gold - Debt
          </div>
        </div>
      </div>

      {membersWithData.length > 0 && (
        <div className="grid-2" style={{ marginBottom: '2rem' }}>
          <div className="card">
            <div className="card-header"><h3>Net Worth Distribution</h3></div>
            <div className="card-body">
              <div className="chart-container">
                <Doughnut data={doughnutData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }} />
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><h3>Invested vs Current Value</h3></div>
            <div className="card-body">
              <div className="chart-container">
                <Bar data={barData} options={barOptions} />
              </div>
            </div>
          </div>
        </div>
      )}

      <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem', fontWeight: '600' }}>Individual Net Worth</h2>
      <div className="stats-grid">
        {summary.summary.map(({ member, totalInvested, totalCurrentValue, totalInterest, interestPercentage, entryCount, goldGrams, goldPurchaseValue }) => {
          const goldValue = goldGrams > 0 && consolidated.goldPricePerGram ? goldGrams * consolidated.goldPricePerGram : 0;
          const memberNetWorth = totalCurrentValue - 0 + goldValue;
          return (
          <Link to={`/member/${member.id}`} key={member.id} className="member-summary-card">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem' }}>
              <span className="member-dot" style={{ backgroundColor: member.color }}></span>
              <span className="member-name">{member.name}</span>
            </div>
            <div className="member-label">{member.label}</div>
            {entryCount > 0 || goldGrams > 0 ? (
              <div className="member-stats">
                <div className="member-stat-item">
                  <div className="label">Invested</div>
                  <div className="value">{formatCurrency(totalInvested)}</div>
                </div>
                <div className="member-stat-item">
                  <div className="label">Current</div>
                  <div className="value">{formatCurrency(totalCurrentValue)}</div>
                </div>
                <div className="member-stat-item">
                  <div className="label">Gain/Loss</div>
                  <div className="value" style={{ color: totalInterest >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {formatCurrency(totalInterest)}
                  </div>
                </div>
                <div className="member-stat-item">
                  <div className="label">Returns</div>
                  <div className="value" style={{ color: interestPercentage >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {interestPercentage >= 0 ? '+' : ''}{interestPercentage}%
                  </div>
                </div>
                {goldGrams > 0 && (
                  <div className="member-stat-item">
                    <div className="label">Gold</div>
                    <div className="value" style={{ color: '#F59E0B' }}>
                      {goldGrams.toFixed(1)}g
                    </div>
                  </div>
                )}
                {goldValue > 0 && (
                  <div className="member-stat-item">
                    <div className="label">Gold Value</div>
                    <div className="value" style={{ color: '#F59E0B' }}>
                      {formatCurrency(goldValue)}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: 'var(--gray-400)', fontSize: '0.85rem' }}>No entries yet</p>
            )}
          </Link>
          );
        })}
      </div>
    </div>
  );
}

export default Dashboard;
