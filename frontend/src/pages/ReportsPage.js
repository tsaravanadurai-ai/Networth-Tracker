import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import api from '../utils/api';
import { formatCurrency, MONTHS, getCurrentMonth, getCurrentYear } from '../utils/helpers';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

const DEBT_CATEGORIES = ['Personal Loan (Debt)', 'Home Loan (Debt)', 'Car Loan (Debt)', 'Other Loan (Debt)'];

function isDebtCategory(cat) {
  return DEBT_CATEGORIES.includes(cat) || cat.toLowerCase().includes('loan') || cat.toLowerCase().includes('debt');
}

function ReportsPage() {
  const [trendData, setTrendData] = useState(null);
  const [month, setMonth] = useState(getCurrentMonth());
  const [year, setYear] = useState(getCurrentYear());
  const [summary, setSummary] = useState(null);
  const [activeTab, setActiveTab] = useState('consolidated');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllData();
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [month, year]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [trendRes] = await Promise.all([
        api.get('/reports/trend-all'),
      ]);
      setTrendData(trendRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const res = await api.get(`/reports/summary/${year}/${month}`);
      setSummary(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="empty-state"><p>Loading reports...</p></div>;

  const consolidatedChartData = trendData?.consolidated ? {
    labels: trendData.consolidated.map(t => t.label),
    datasets: [
      {
        label: 'Total Invested',
        data: trendData.consolidated.map(t => t.invested),
        borderColor: 'rgba(79, 70, 229, 1)',
        backgroundColor: 'rgba(79, 70, 229, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Net Worth',
        data: trendData.consolidated.map(t => t.netWorth || t.currentValue),
        borderColor: 'rgba(16, 185, 129, 1)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4,
      }
    ]
  } : null;

  const memberColors = {
    1: { border: '#4F46E5', bg: 'rgba(79, 70, 229, 0.1)' },
    2: { border: '#EC4899', bg: 'rgba(236, 72, 153, 0.1)' },
    3: { border: '#10B981', bg: 'rgba(16, 185, 129, 0.1)' },
    4: { border: '#F59E0B', bg: 'rgba(245, 158, 11, 0.1)' },
    5: { border: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.1)' },
  };

  // Build comparison chart with each member starting from their own first month
  const allLabels = trendData?.consolidated?.map(t => t.label) || [];
  const memberComparisonData = trendData?.members ? {
    labels: allLabels,
    datasets: trendData.members.map(member => {
      const memberTrend = trendData.trends[member.id] || [];
      if (memberTrend.length === 0) return null;

      // Map member data to the consolidated timeline, using null for months before they started
      const dataPoints = allLabels.map(label => {
        const entry = memberTrend.find(t => t.label === label);
        return entry ? (entry.netWorth || entry.currentValue) : null;
      });

      return {
        label: member.name,
        data: dataPoints,
        borderColor: memberColors[member.id]?.border || '#666',
        backgroundColor: memberColors[member.id]?.bg || 'rgba(0,0,0,0.1)',
        tension: 0.4,
        spanGaps: false,
      };
    }).filter(Boolean)
  } : null;

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

  // Asset class data for the split report
  const assetClassData = summary ? (() => {
    const classMap = {};
    summary.summary.forEach(({ member, categoryBreakdown }) => {
      Object.entries(categoryBreakdown).forEach(([cat, data]) => {
        if (!classMap[cat]) classMap[cat] = { invested: 0, currentValue: 0, isDebt: data.isDebt };
        if (data.isDebt) {
          classMap[cat].currentValue += data.currentValue;
        } else {
          classMap[cat].invested += data.invested;
          classMap[cat].currentValue += data.currentValue;
        }
      });
    });
    // Add Gold in Hand as an asset class
    if (summary.consolidated.goldGrams > 0) {
      classMap['Gold in Hand'] = {
        invested: summary.consolidated.goldPurchaseValue || 0,
        currentValue: summary.consolidated.goldCurrentValue || 0,
        isDebt: false
      };
    }
    return classMap;
  })() : null;

  const assetClassColors = [
    '#4F46E5', '#EC4899', '#10B981', '#F59E0B', '#8B5CF6',
    '#EF4444', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
    '#14B8A6', '#E11D48', '#7C3AED', '#0EA5E9'
  ];

  const assetClassChartData = assetClassData ? {
    labels: Object.entries(assetClassData).filter(([_, d]) => !d.isDebt && d.currentValue > 0).map(([cat]) => cat),
    datasets: [{
      data: Object.entries(assetClassData).filter(([_, d]) => !d.isDebt && d.currentValue > 0).map(([_, d]) => d.currentValue),
      backgroundColor: assetClassColors,
      borderWidth: 2,
      borderColor: '#fff',
    }]
  } : null;

  return (
    <div>
      <div className="page-header">
        <h1>Reports & Analytics</h1>
        <p>Comprehensive view of family net worth trends and breakdowns</p>
      </div>

      <div className="tabs">
        <button className={`tab ${activeTab === 'consolidated' ? 'active' : ''}`} onClick={() => setActiveTab('consolidated')}>
          Consolidated Trend
        </button>
        <button className={`tab ${activeTab === 'comparison' ? 'active' : ''}`} onClick={() => setActiveTab('comparison')}>
          Member Comparison
        </button>
        <button className={`tab ${activeTab === 'assetclass' ? 'active' : ''}`} onClick={() => setActiveTab('assetclass')}>
          Asset Class Split
        </button>
        <button className={`tab ${activeTab === 'monthly' ? 'active' : ''}`} onClick={() => setActiveTab('monthly')}>
          Monthly Report
        </button>
      </div>

      {activeTab === 'consolidated' && (
        <div>
          {consolidatedChartData && consolidatedChartData.labels.length > 0 ? (
            <div className="card" style={{ marginBottom: '2rem' }}>
              <div className="card-header"><h3>Family Net Worth Growth</h3></div>
              <div className="card-body">
                <div className="chart-container" style={{ height: '400px' }}>
                  <Line data={consolidatedChartData} options={chartOptions} />
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <h3>No trend data available</h3>
              <p>Add entries for multiple months to see growth trends.</p>
            </div>
          )}

          {trendData?.consolidated && trendData.consolidated.length > 0 && (
            <div className="card">
              <div className="card-header"><h3>Monthly Summary Table</h3></div>
              <div className="card-body">
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th style={{ textAlign: 'right' }}>Invested</th>
                        <th style={{ textAlign: 'right' }}>Current Value</th>
                        <th style={{ textAlign: 'right' }}>Interest</th>
                        <th style={{ textAlign: 'right' }}>Debt</th>
                        <th style={{ textAlign: 'right' }}>Net Worth</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...trendData.consolidated].reverse().map((row, i) => (
                        <tr key={i}>
                          <td>{row.label}</td>
                          <td style={{ textAlign: 'right' }} className="amount">{formatCurrency(row.invested)}</td>
                          <td style={{ textAlign: 'right' }} className="amount">{formatCurrency(row.currentValue)}</td>
                          <td style={{ textAlign: 'right' }} className={`amount ${row.interest >= 0 ? 'positive' : 'negative'}`}>
                            {formatCurrency(row.interest)}
                          </td>
                          <td style={{ textAlign: 'right', color: 'var(--danger)' }}>
                            {row.debt > 0 ? `-${formatCurrency(row.debt)}` : '-'}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: '600' }} className={`amount ${(row.netWorth || row.currentValue) >= 0 ? 'positive' : 'negative'}`}>
                            {formatCurrency(row.netWorth || row.currentValue)}
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

      {activeTab === 'comparison' && (
        <div>
          {memberComparisonData && memberComparisonData.labels.length > 0 ? (
            <div className="card">
              <div className="card-header"><h3>Member Net Worth Comparison</h3></div>
              <div className="card-body">
                <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: '1rem' }}>
                  Each member's chart starts from their first investment month.
                </p>
                <div className="chart-container" style={{ height: '400px' }}>
                  <Line data={memberComparisonData} options={{
                    ...chartOptions,
                    plugins: {
                      ...chartOptions.plugins,
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            if (ctx.raw === null) return null;
                            return `${ctx.dataset.label}: ₹${(ctx.raw / 100000).toFixed(2)}L`;
                          }
                        }
                      }
                    }
                  }} />
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <h3>No comparison data available</h3>
              <p>Add entries for multiple months and members to see comparisons.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'assetclass' && (
        <div>
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

          {assetClassData && Object.keys(assetClassData).length > 0 ? (
            <div>
              <div className="grid-2" style={{ marginBottom: '2rem' }}>
                <div className="card">
                  <div className="card-header"><h3>Asset Class Distribution</h3></div>
                  <div className="card-body">
                    <div className="chart-container" style={{ height: '350px' }}>
                      {assetClassChartData && <Doughnut data={assetClassChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }} />}
                    </div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-header"><h3>Asset Class - Invested vs Current</h3></div>
                  <div className="card-body">
                    <div className="chart-container" style={{ height: '350px' }}>
                      <Bar
                        data={{
                          labels: Object.entries(assetClassData).filter(([_, d]) => !d.isDebt).map(([cat]) => cat),
                          datasets: [
                            {
                              label: 'Invested',
                              data: Object.entries(assetClassData).filter(([_, d]) => !d.isDebt).map(([_, d]) => d.invested),
                              backgroundColor: 'rgba(79, 70, 229, 0.7)',
                            },
                            {
                              label: 'Current Value',
                              data: Object.entries(assetClassData).filter(([_, d]) => !d.isDebt).map(([_, d]) => d.currentValue),
                              backgroundColor: 'rgba(16, 185, 129, 0.7)',
                            }
                          ]
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          indexAxis: 'y',
                          plugins: { legend: { position: 'top' } },
                          scales: {
                            x: {
                              beginAtZero: true,
                              ticks: {
                                callback: (value) => '₹' + (value / 100000).toFixed(1) + 'L'
                              }
                            },
                            y: {
                              ticks: {
                                font: { size: 11 }
                              }
                            }
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header"><h3>Asset Class Breakdown - {MONTHS[month - 1]} {year}</h3></div>
                <div className="card-body">
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Asset Class</th>
                          <th style={{ textAlign: 'right' }}>Invested</th>
                          <th style={{ textAlign: 'right' }}>Current Value</th>
                          <th style={{ textAlign: 'right' }}>Gain/Loss</th>
                          <th style={{ textAlign: 'right' }}>Return %</th>
                          <th style={{ textAlign: 'right' }}>Allocation %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(assetClassData)
                          .filter(([_, d]) => !d.isDebt)
                          .sort((a, b) => b[1].currentValue - a[1].currentValue)
                          .map(([cat, data], i) => {
                            const gain = data.currentValue - data.invested;
                            const returnPct = data.invested > 0 ? ((gain / data.invested) * 100).toFixed(2) : 0;
                            const totalAssets = Object.entries(assetClassData).filter(([_, d]) => !d.isDebt).reduce((sum, [_, d]) => sum + d.currentValue, 0);
                            const allocation = totalAssets > 0 ? ((data.currentValue / totalAssets) * 100).toFixed(1) : 0;
                            return (
                              <tr key={cat}>
                                <td>
                                  <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: assetClassColors[i % assetClassColors.length], marginRight: '0.5rem' }}></span>
                                  {cat}
                                </td>
                                <td style={{ textAlign: 'right' }} className="amount">{formatCurrency(data.invested)}</td>
                                <td style={{ textAlign: 'right' }} className="amount">{formatCurrency(data.currentValue)}</td>
                                <td style={{ textAlign: 'right' }} className={`amount ${gain >= 0 ? 'positive' : 'negative'}`}>{formatCurrency(gain)}</td>
                                <td style={{ textAlign: 'right' }} className={`amount ${gain >= 0 ? 'positive' : 'negative'}`}>{returnPct}%</td>
                                <td style={{ textAlign: 'right' }}>{allocation}%</td>
                              </tr>
                            );
                          })}
                        {Object.entries(assetClassData)
                          .filter(([_, d]) => d.isDebt && d.currentValue > 0)
                          .map(([cat, data]) => (
                            <tr key={cat} style={{ background: '#FEF2F2' }}>
                              <td style={{ color: 'var(--danger)' }}>{cat}</td>
                              <td style={{ textAlign: 'right' }}>-</td>
                              <td style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: '600' }}>-{formatCurrency(data.currentValue)}</td>
                              <td style={{ textAlign: 'right' }}>-</td>
                              <td style={{ textAlign: 'right' }}>-</td>
                              <td style={{ textAlign: 'right' }}>-</td>
                            </tr>
                          ))}
                        {(() => {
                          const totalInvested = Object.entries(assetClassData).filter(([_, d]) => !d.isDebt).reduce((sum, [_, d]) => sum + d.invested, 0);
                          const totalCurrent = Object.entries(assetClassData).filter(([_, d]) => !d.isDebt).reduce((sum, [_, d]) => sum + d.currentValue, 0);
                          const totalDebt = Object.entries(assetClassData).filter(([_, d]) => d.isDebt).reduce((sum, [_, d]) => sum + d.currentValue, 0);
                          const totalGain = totalCurrent - totalInvested;
                          const netWorth = totalCurrent - totalDebt;
                          return (
                            <>
                              <tr style={{ fontWeight: '700', background: 'var(--gray-50)' }}>
                                <td>Total Assets</td>
                                <td style={{ textAlign: 'right' }} className="amount">{formatCurrency(totalInvested)}</td>
                                <td style={{ textAlign: 'right' }} className="amount">{formatCurrency(totalCurrent)}</td>
                                <td style={{ textAlign: 'right' }} className={`amount ${totalGain >= 0 ? 'positive' : 'negative'}`}>{formatCurrency(totalGain)}</td>
                                <td style={{ textAlign: 'right' }} className={`amount ${totalGain >= 0 ? 'positive' : 'negative'}`}>{totalInvested > 0 ? ((totalGain / totalInvested) * 100).toFixed(2) : 0}%</td>
                                <td style={{ textAlign: 'right' }}>100%</td>
                              </tr>
                              {totalDebt > 0 && (
                                <tr style={{ fontWeight: '700', background: '#FEF2F2' }}>
                                  <td style={{ color: 'var(--danger)' }}>Net Worth (Assets - Debt)</td>
                                  <td colSpan="2" style={{ textAlign: 'right', fontSize: '1.1rem', fontWeight: '700' }}>{formatCurrency(netWorth)}</td>
                                  <td colSpan="3"></td>
                                </tr>
                              )}
                            </>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', fontSize: '0.85rem', color: '#92400E' }}>
                <strong>Note:</strong> Real Estate allocation shows the property's current market value. To get the true equity in Real Estate, subtract the outstanding Home Loan (Debt) from the Real Estate current value. For example, if Real Estate value is ₹50L and Home Loan outstanding is ₹30L, your actual Real Estate equity is ₹20L.
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <h3>No data for this month</h3>
              <p>Select a month with entries to see asset class breakdown.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'monthly' && (
        <div>
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

          {summary && (
            <div>
              <div className="stats-grid" style={{ marginBottom: '2rem' }}>
                <div className="stat-card">
                  <div className="stat-label">Total Family Invested</div>
                  <div className="stat-value">{formatCurrency(summary.consolidated.totalInvested)}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Total Current Value</div>
                  <div className="stat-value">{formatCurrency(summary.consolidated.totalCurrentValue)}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Total Interest</div>
                  <div className="stat-value" style={{ color: summary.consolidated.totalInterest >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {formatCurrency(summary.consolidated.totalInterest)}
                  </div>
                </div>
                {summary.consolidated.totalDebt > 0 && (
                  <div className="stat-card" style={{ borderLeft: '4px solid var(--danger)' }}>
                    <div className="stat-label">Total Debt</div>
                    <div className="stat-value" style={{ color: 'var(--danger)' }}>-{formatCurrency(summary.consolidated.totalDebt)}</div>
                  </div>
                )}
                <div className="stat-card" style={{ borderLeft: '4px solid var(--primary)' }}>
                  <div className="stat-label">Family Net Worth</div>
                  <div className="stat-value">{formatCurrency(summary.consolidated.netWorth)}</div>
                </div>
              </div>

              <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-header"><h3>Individual Breakdown - {MONTHS[month - 1]} {year}</h3></div>
                <div className="card-body">
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Member</th>
                          <th style={{ textAlign: 'right' }}>Invested</th>
                          <th style={{ textAlign: 'right' }}>Current Value</th>
                          <th style={{ textAlign: 'right' }}>Interest</th>
                          <th style={{ textAlign: 'right' }}>Debt</th>
                          <th style={{ textAlign: 'right' }}>Net Worth</th>
                          <th style={{ textAlign: 'right' }}>Share %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.summary.map(({ member, totalInvested, totalCurrentValue, totalInterest, totalDebt, netWorth, interestPercentage }) => {
                          const totalNetWorth = summary.consolidated.netWorth;
                          const sharePercent = totalNetWorth > 0 ? ((netWorth / totalNetWorth) * 100).toFixed(1) : 0;
                          return (
                            <tr key={member.id}>
                              <td>
                                <span className="member-dot" style={{ backgroundColor: member.color }}></span>
                                <strong>{member.name}</strong>
                                <span style={{ color: 'var(--gray-400)', marginLeft: '0.5rem', fontSize: '0.8rem' }}>({member.label})</span>
                              </td>
                              <td style={{ textAlign: 'right' }} className="amount">{formatCurrency(totalInvested)}</td>
                              <td style={{ textAlign: 'right' }} className="amount">{formatCurrency(totalCurrentValue)}</td>
                              <td style={{ textAlign: 'right' }} className={`amount ${totalInterest >= 0 ? 'positive' : 'negative'}`}>
                                {formatCurrency(totalInterest)}
                              </td>
                              <td style={{ textAlign: 'right', color: totalDebt > 0 ? 'var(--danger)' : '' }}>
                                {totalDebt > 0 ? `-${formatCurrency(totalDebt)}` : '-'}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: '600' }}>{formatCurrency(netWorth)}</td>
                              <td style={{ textAlign: 'right' }}>{sharePercent}%</td>
                            </tr>
                          );
                        })}
                        <tr style={{ fontWeight: '700', background: 'var(--gray-50)' }}>
                          <td>Total Family</td>
                          <td style={{ textAlign: 'right' }} className="amount">{formatCurrency(summary.consolidated.totalInvested)}</td>
                          <td style={{ textAlign: 'right' }} className="amount">{formatCurrency(summary.consolidated.totalCurrentValue)}</td>
                          <td style={{ textAlign: 'right' }} className={`amount ${summary.consolidated.totalInterest >= 0 ? 'positive' : 'negative'}`}>
                            {formatCurrency(summary.consolidated.totalInterest)}
                          </td>
                          <td style={{ textAlign: 'right', color: 'var(--danger)' }}>
                            {summary.consolidated.totalDebt > 0 ? `-${formatCurrency(summary.consolidated.totalDebt)}` : '-'}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: '700' }}>{formatCurrency(summary.consolidated.netWorth)}</td>
                          <td style={{ textAlign: 'right' }}>100%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {summary.summary.map(({ member, categoryBreakdown, entryCount }) => {
                if (entryCount === 0) return null;
                return (
                  <div className="card" key={member.id} style={{ marginTop: '1.5rem' }}>
                    <div className="card-header">
                      <h3>
                        <span className="member-dot" style={{ backgroundColor: member.color }}></span>
                        {member.name} - Category Breakdown
                      </h3>
                    </div>
                    <div className="card-body">
                      <div className="table-container">
                        <table>
                          <thead>
                            <tr>
                              <th>Category</th>
                              <th style={{ textAlign: 'right' }}>Invested</th>
                              <th style={{ textAlign: 'right' }}>Current Value</th>
                              <th style={{ textAlign: 'right' }}>Gain/Loss</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(categoryBreakdown).map(([cat, data]) => {
                              if (data.isDebt) {
                                return (
                                  <tr key={cat} style={{ background: '#FEF2F2' }}>
                                    <td style={{ color: 'var(--danger)' }}>{cat}</td>
                                    <td style={{ textAlign: 'right' }}>-</td>
                                    <td style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: '600' }}>
                                      -{formatCurrency(data.currentValue)}
                                    </td>
                                    <td style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: '600' }}>
                                      -{formatCurrency(data.currentValue)}
                                    </td>
                                  </tr>
                                );
                              }
                              return (
                                <tr key={cat}>
                                  <td>{cat}</td>
                                  <td style={{ textAlign: 'right' }} className="amount">{formatCurrency(data.invested)}</td>
                                  <td style={{ textAlign: 'right' }} className="amount">{formatCurrency(data.currentValue)}</td>
                                  <td style={{ textAlign: 'right' }} className={`amount ${(data.currentValue - data.invested) >= 0 ? 'positive' : 'negative'}`}>
                                    {formatCurrency(data.currentValue - data.invested)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ReportsPage;
