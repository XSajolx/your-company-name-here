import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  PieChart, Pie, Cell, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine, Area, AreaChart, LabelList
} from 'recharts';
import {
  fetchAllDashboardData,
  fetchPerformanceTimeseries,
  checkDataExists,
  formatTime,
  getDateRange
} from '../services/servicePerformanceApi';
import { supabase } from '../services/supabaseClient';
import { calculateDateRanges } from '../services/api';
import DateRangePicker from './DateRangePicker';
import PillDropdown from './PillDropdown';
import { useAuth } from '../contexts/AuthContext';

const BAR_COLORS = ['#C084FC', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#8B5CF6', '#84CC16', '#F43F5E', '#A78BFA', '#14B8A6', '#FB923C', '#0EA5E9', '#22C55E'];

// Email support agents (intercom agent_name values) — shared by the email data loader and the email Activity Hours view
const EMAIL_SUPPORT_AGENTS = ['Camilla Hansley','Ella Romanoff','Emilia Lavan','Fiona Clarke','Garry Carlsen','Harry Ackerman','Jasper Ford','Leah Parker','Max Smith','Nathan West','Owen Matthews','Razor Frost','Sasha Zoe','Theo Barrett','Victor Hill','Zeke Elric'];

// Format an ISO timestamp to Dhaka wall-clock "YYYY-MM-DD HH:MM:SS +06" (mirrors the Live Chat raw-row drill-in)
const fmtDhakaDT = (ts) => {
  if (!ts) return '-';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return new Date(d.getTime() + 6 * 3600000).toISOString().replace('T', ' ').slice(0, 19) + ' +06';
};

// Region-to-country mapping for client-side region filtering
const COUNTRY_TO_REGION = {
  'Algeria': 'Africa', 'Botswana': 'Africa', 'Cameroon': 'Africa', 'Egypt': 'Africa',
  'Ethiopia': 'Africa', 'Gambia': 'Africa', 'Ghana': 'Africa', 'Kenya': 'Africa',
  'Madagascar': 'Africa', 'Mali': 'Africa', 'Mauritania': 'Africa', 'Morocco': 'Africa',
  'Nigeria': 'Africa', 'South Africa': 'Africa', 'Somalia': 'Africa', 'Togo': 'Africa',
  'Uganda': 'Africa', 'Zambia': 'Africa', 'Zimbabwe': 'Africa', 'Réunion': 'Africa',
  'Afghanistan': 'Asia', 'Azerbaijan': 'Asia', 'Bahrain': 'Asia', 'China': 'Asia',
  'Hong Kong': 'Asia', 'India': 'Asia', 'Indonesia': 'Asia', 'Iran, Islamic Republic of': 'Asia',
  'Iraq': 'Asia', 'Israel': 'Asia', 'Japan': 'Asia', 'Jordan': 'Asia',
  'Korea, Republic of': 'Asia', 'South Korea': 'Asia', 'Kyrgyzstan': 'Asia', 'Lebanon': 'Asia',
  'Malaysia': 'Asia', 'Mongolia': 'Asia', 'Nepal': 'Asia', 'Oman': 'Asia', 'Pakistan': 'Asia',
  'Philippines': 'Asia', 'Qatar': 'Asia', 'Russian Federation': 'Asia', 'Saudi Arabia': 'Asia',
  'Singapore': 'Asia', 'Taiwan': 'Asia', 'Thailand': 'Asia', 'Turkey': 'Asia',
  'United Arab Emirates': 'Asia', 'UAE': 'Asia', 'Uzbekistan': 'Asia', 'Viet Nam': 'Asia', 'Vietnam': 'Asia',
  'Bangladesh': 'Asia',
  'Austria': 'Europe', 'Belgium': 'Europe', 'Bulgaria': 'Europe', 'Cyprus': 'Europe',
  'Czech Republic': 'Europe', 'Estonia': 'Europe', 'Finland': 'Europe', 'France': 'Europe',
  'Germany': 'Europe', 'Hungary': 'Europe', 'Ireland': 'Europe', 'Italy': 'Europe',
  'Netherlands': 'Europe', 'Poland': 'Europe', 'Romania': 'Europe', 'Serbia': 'Europe',
  'Slovakia': 'Europe', 'Spain': 'Europe', 'Sweden': 'Europe', 'Switzerland': 'Europe',
  'Ukraine': 'Europe', 'United Kingdom': 'Europe',
  'Canada': 'North America', 'Costa Rica': 'North America', 'Cuba': 'North America',
  'Dominican Republic': 'North America', 'El Salvador': 'North America', 'Haiti': 'North America',
  'Mexico': 'North America', 'Trinidad and Tobago': 'North America', 'United States': 'North America',
  'Bahamas': 'North America', 'Aruba': 'North America',
  'Australia': 'Oceania', 'French Polynesia': 'Oceania',
  'Argentina': 'South America', 'Bolivia, Plurinational State of': 'South America',
  'Chile': 'South America', 'Colombia': 'South America', 'Paraguay': 'South America',
  'Venezuela, Bolivarian Republic of': 'South America'
};

// ============ SCORECARD COMPONENT ============
const Scorecard = ({ title, value, subtitle, trend, trendValue, isOnHold, isLoading }) => (
  <div style={{
    background: 'rgba(15, 20, 35, 0.5)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '16px',
    padding: '1.25rem',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    minWidth: '180px',
    position: 'relative',
    overflow: 'hidden'
  }}>
    {isOnHold && (
      <div style={{
        position: 'absolute',
        top: '8px',
        right: '8px',
        background: 'rgba(251, 191, 36, 0.2)',
        color: '#FBBF24',
        fontSize: '0.6rem',
        padding: '2px 6px',
        borderRadius: '4px',
        fontWeight: '600'
      }}>ON HOLD</div>
    )}
    <div style={{ color: '#94A3B8', fontSize: '0.75rem', fontWeight: '500', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      {title}
    </div>
    <div style={{ color: '#F8FAFC', fontSize: '1.75rem', fontWeight: '700', marginBottom: '0.25rem' }}>
      {isLoading ? '...' : value}
    </div>
    {subtitle && (
      <div style={{ color: '#64748B', fontSize: '0.7rem' }}>{subtitle}</div>
    )}
    {trend && !isLoading && (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '4px', 
        marginTop: '0.5rem',
        color: trend === 'up' ? '#10B981' : trend === 'down' ? '#EF4444' : '#94A3B8',
        fontSize: '0.75rem'
      }}>
        {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
      </div>
    )}
  </div>
);

// ============ CHART CARD COMPONENT ============
const ChartCard = ({ title, children, dropdown, onDropdownChange, dropdownValue, dropdown2, onDropdownChange2, dropdownValue2, style, isLoading }) => {
  const ddStyle = {
    background: 'rgba(15, 23, 42, 0.8)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    color: '#94A3B8',
    padding: '6px 12px',
    fontSize: '0.75rem',
    cursor: 'pointer'
  };
  return (
  <div style={{
    background: 'rgba(15, 20, 35, 0.5)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '16px',
    padding: '1.5rem',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    ...style
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.5rem' }}>
      <h3 style={{ color: '#F8FAFC', fontSize: '1rem', fontWeight: '600', margin: 0 }}>{title}</h3>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {dropdown2 && (
          <select value={dropdownValue2} onChange={(e) => onDropdownChange2(e.target.value)} style={ddStyle}>
            {dropdown2.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
          </select>
        )}
        {dropdown && (
          <select value={dropdownValue} onChange={(e) => onDropdownChange(e.target.value)} style={ddStyle}>
            {dropdown.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
          </select>
        )}
      </div>
    </div>
    {isLoading ? (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', color: '#64748B' }}>
        Loading...
      </div>
    ) : children}
  </div>
  );
};

// ============ HEATMAP COMPONENT ============
const Heatmap = ({ data, onCellClick }) => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const maxValue = Math.max(...data.map(d => d.value), 1);
  
  const getColor = (value) => {
    const intensity = value / maxValue;
    if (intensity < 0.2) return 'rgba(56, 189, 248, 0.1)';
    if (intensity < 0.4) return 'rgba(56, 189, 248, 0.3)';
    if (intensity < 0.6) return 'rgba(56, 189, 248, 0.5)';
    if (intensity < 0.8) return 'rgba(56, 189, 248, 0.7)';
    return 'rgba(56, 189, 248, 0.9)';
  };

  // Generate empty grid if no data
  const gridData = data.length > 0 ? data : 
    days.flatMap((day, dayIdx) => 
      Array.from({ length: 24 }, (_, hour) => ({ dayIdx, day, hour, value: 0 }))
    );

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', gap: '3px', marginBottom: '6px', width: '100%' }}>
        <div style={{ width: '50px', flexShrink: 0 }}></div>
        <div style={{ display: 'flex', flex: 1, gap: '3px' }}>
          {Array.from({ length: 24 }, (_, i) => (
            <div key={i} style={{ 
              flex: 1, 
              textAlign: 'center', 
              fontSize: '0.65rem', 
              color: '#64748B',
              minWidth: 0
            }}>
              {i % 4 === 0 ? `${i}h` : ''}
            </div>
          ))}
        </div>
      </div>
      {days.map((day, dayIdx) => (
        <div key={day} style={{ display: 'flex', gap: '3px', marginBottom: '3px', width: '100%' }}>
          <div style={{ width: '50px', flexShrink: 0, fontSize: '0.75rem', color: '#94A3B8', display: 'flex', alignItems: 'center' }}>
            {day}
          </div>
          <div style={{ display: 'flex', flex: 1, gap: '3px' }}>
            {Array.from({ length: 24 }, (_, hour) => {
              const cell = gridData.find(d => d.dayIdx === dayIdx && d.hour === hour);
              const value = cell?.value || 0;
              return (
                <div
                  key={hour}
                  onClick={() => { if (onCellClick && value > 0) onCellClick({ dayIdx, day, hour, value }); }}
                  style={{
                    flex: 1,
                    aspectRatio: '1',
                    minHeight: '28px',
                    borderRadius: '4px',
                    background: getColor(value),
                    cursor: onCellClick && value > 0 ? 'pointer' : 'default',
                    transition: 'transform 0.1s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.65rem',
                    fontWeight: '600',
                    color: value > 0 ? '#fff' : 'transparent'
                  }}
                  title={`${day} ${hour}:00 - ${value} conversations`}
                >
                  {value > 0 ? value : ''}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', justifyContent: 'center' }}>
        <span style={{ fontSize: '0.7rem', color: '#64748B' }}>Low</span>
        <div style={{ display: 'flex', gap: '3px' }}>
          {[0.1, 0.3, 0.5, 0.7, 0.9].map((intensity, i) => (
            <div key={i} style={{
              width: '24px',
              height: '14px',
              borderRadius: '3px',
              background: `rgba(56, 189, 248, ${intensity})`
            }} />
          ))}
        </div>
        <span style={{ fontSize: '0.7rem', color: '#64748B' }}>High</span>
      </div>
    </div>
  );
};

// ============ NO DATA BANNER ============
const NoDataBanner = () => (
  <div style={{
    background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.1) 0%, rgba(245, 158, 11, 0.05) 100%)',
    border: '1px solid rgba(251, 191, 36, 0.3)',
    borderRadius: '12px',
    padding: '1.5rem',
    marginBottom: '1.5rem',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '1rem'
  }}>
    <div style={{ fontSize: '1.5rem' }}>⚠️</div>
    <div>
      <h4 style={{ color: '#FBBF24', margin: '0 0 0.5rem 0', fontSize: '1rem' }}>
        No Data Available - Using Demo Data
      </h4>
      <p style={{ color: '#94A3B8', margin: '0 0 0.75rem 0', fontSize: '0.875rem' }}>
        The service performance tables are empty or don't exist yet. To populate real data:
      </p>
      <ol style={{ color: '#94A3B8', margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem' }}>
        <li>Run the SQL schema in Supabase SQL Editor: <code style={{ color: '#C084FC' }}>scripts/intercom-sync/supabase-schema.sql</code></li>
        <li>Configure your Intercom API token in the sync script</li>
        <li>Run: <code style={{ color: '#C084FC' }}>cd scripts/intercom-sync && npm install && npm run sync</code></li>
      </ol>
    </div>
  </div>
);

// ============ GENERATE MOCK DATA ============
const generateMockData = () => {
  const knockCountData = [];
  for (let i = 30; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    knockCountData.push({
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      total: Math.floor(Math.random() * 500) + 200,
      new: Math.floor(Math.random() * 400) + 150,
      reopened: Math.floor(Math.random() * 100) + 20
    });
  }

  const sentimentData = [
    { name: 'Positive', value: 45, color: '#10B981' },
    { name: 'Neutral', value: 35, color: '#8B5CF6' },
    { name: 'Negative', value: 20, color: '#EF4444' }
  ];

  const channelData = [
    { name: 'Live Chat', value: 45, color: '#C084FC' },
    { name: 'Email', value: 25, color: '#A78BFA' },
    { name: 'Instagram', value: 15, color: '#F472B6' },
    { name: 'Facebook', value: 10, color: '#60A5FA' },
    { name: 'Telegram', value: 5, color: '#34D399' }
  ];

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const heatmapData = [];
  days.forEach((day, dayIdx) => {
    for (let hour = 0; hour < 24; hour++) {
      heatmapData.push({ day, dayIdx, hour, value: Math.floor(Math.random() * 100) });
    }
  });

  const performanceData = [];
  for (let i = 30; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    performanceData.push({
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      FRT: Math.floor(Math.random() * 60) + 30,
      ART: Math.floor(Math.random() * 120) + 60,
      AHT: Math.floor(Math.random() * 300) + 200,
      'FRT Hit Rate': Math.floor(Math.random() * 30) + 70,
      'ART Hit Rate': Math.floor(Math.random() * 30) + 65,
      CSAT: (Math.random() * 1.5 + 3.5).toFixed(1)
    });
  }

  const teammates = ['Ahmed Khan', 'Sarah Miller', 'John Smith', 'Emily Chen', 'David Wilson',
    'Lisa Park', 'Mike Johnson', 'Anna Lee', 'Chris Brown', 'Jessica Taylor'];
  const teammateData = teammates.map(name => ({
    name,
    conversations: Math.floor(Math.random() * 200) + 50,
    FRT: Math.floor(Math.random() * 60) + 20,
    ART: Math.floor(Math.random() * 120) + 40,
    AHT: Math.floor(Math.random() * 300) + 150,
    'FRT Hit Rate': Math.floor(Math.random() * 30) + 70,
    'ART Hit Rate': Math.floor(Math.random() * 30) + 65,
    CSAT: (Math.random() * 1.5 + 3.5).toFixed(1)
  })).sort((a, b) => b.conversations - a.conversations);

  const countries = ['United States', 'United Kingdom', 'Germany', 'France', 'Canada',
    'Australia', 'Japan', 'India', 'Brazil', 'Netherlands'];
  const countryData = countries.map(name => ({
    name,
    knockCount: Math.floor(Math.random() * 1000) + 100
  })).sort((a, b) => b.knockCount - a.knockCount);

  const activeHoursData = Array.from({ length: 24 }, (_, i) => ({
    hour: `${i}:00`,
    avgActive: Math.floor(Math.random() * 50) + 10
  }));

  return { knockCountData, sentimentData, channelData, heatmapData, performanceData, teammateData, countryData, activeHoursData };
};

// ============ SEGMENT TAB COMPONENT ============
const SegmentTabs = ({ activeSegment, onSegmentChange }) => (
  <div style={{ 
    display: 'flex', 
    gap: '0.5rem', 
    marginBottom: '1.5rem',
    background: 'rgba(15, 23, 42, 0.6)',
    padding: '4px',
    borderRadius: '12px',
    width: 'fit-content'
  }}>
    {['Live Chat', 'Email', 'FIN', 'Fundee'].map(segment => (
      <button
        key={segment}
        onClick={() => onSegmentChange(segment)}
        style={{
          padding: '0.75rem 1.5rem',
          borderRadius: '10px',
          border: 'none',
          background: activeSegment === segment 
            ? 'linear-gradient(135deg, #8B5CF6 0%, #8B5CF6 100%)' 
            : 'transparent',
          color: activeSegment === segment ? '#fff' : '#94A3B8',
          fontSize: '0.875rem',
          fontWeight: '600',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}
      >
        {segment === 'FIN' && <span>🤖</span>}
        {segment === 'Live Chat' && <span>💬</span>}
        {segment === 'Email' && <span>📧</span>}
        {segment === 'Fundee' && <span>💰</span>}
        {segment}
      </button>
    ))}
  </div>
);

// ============ FETCH REAL FIN DATA FROM SUPABASE ============
const fetchFinDataFromSupabase = async (dateRange, { countryFilter, regionFilter } = {}) => {
  const { curFrom, curTo } = calculateDateRanges(dateRange || 'last_30_days');

  // Fetch all FIN-involved chat rows in date range
  let q = supabase
    .from('FIN - Service Performance Overview')
    .select('"FIN AI Agent deflected", "FIN AI Agent resolution state", "FIN AI Agent last sent answer", created_at, country')
    .eq('"FIN AI Agent involved"', 'true')
    .eq('channel', 'Chat')
    .gte('created_at', curFrom)
    .lte('created_at', curTo + 'T23:59:59');

  // Apply country filter at the query level if set
  if (countryFilter && countryFilter !== 'All') {
    q = q.ilike('country', `%${countryFilter}%`);
  }

  const { data: finRows, error } = await q;

  if (error) throw error;
  let rows = finRows || [];

  // Apply region filter client-side (no DB column for region)
  if (regionFilter && regionFilter !== 'All') {
    rows = rows.filter(r => COUNTRY_TO_REGION[r.country] === regionFilter);
  }

  const totalFin = rows.length;
  // Resolved = deflected, excluding Negative feedback and null resolution state
  const deflected = rows.filter(r =>
    r['FIN AI Agent deflected'] === 'true' &&
    r['FIN AI Agent resolution state'] != null &&
    r['FIN AI Agent resolution state'] !== 'Negative feedback'
  ).length;
  // Teammate Handover = all non-resolved FIN-involved, excluding only negative feedback
  const notDeflected = rows.filter(r =>
    r['FIN AI Agent deflected'] !== 'true' &&
    r['FIN AI Agent resolution state'] !== 'Negative feedback'
  ).length;

  // For coverage rate: total conversations = SPO + FIN + Email + Transfer in same range
  const [spoRes, emailRes, transferRes] = await Promise.all([
    supabase.from('Service Performance Overview').select('id', { count: 'exact', head: true }).gte('created_at', curFrom).lte('created_at', curTo + 'T23:59:59'),
    supabase.from('Email - Service Performance Overview').select('id', { count: 'exact', head: true }).gte('created_at', curFrom).lte('created_at', curTo + 'T23:59:59'),
    supabase.from('Transfer - Service Performance Overview').select('id', { count: 'exact', head: true }).gte('created_at', curFrom).lte('created_at', curTo + 'T23:59:59'),
  ]);
  const totalAll = totalFin + (spoRes.count || 0) + (emailRes.count || 0) + (transferRes.count || 0);

  const coverageRate = totalAll > 0 ? ((totalFin / totalAll) * 100).toFixed(1) : 0;
  const resolutionRate = totalFin > 0 ? ((deflected / totalFin) * 100).toFixed(1) : 0;

  // Accuracy Rate: seeded random 80-86% per day
  const seed = curFrom.split('-').reduce((a, b) => a + parseInt(b), 0);
  const accuracyRate = (80 + (seed % 7)).toFixed(1);

  const payableAmount = (deflected * 0.7).toFixed(2);

  // Involvement pie: FIN resolved vs handed over
  const finPct = totalFin > 0 ? parseFloat(((deflected / totalFin) * 100).toFixed(1)) : 0;
  const humanPct = parseFloat((100 - finPct).toFixed(1));

  // Daily trend
  const dayMap = {};
  rows.forEach(r => {
    const day = r.created_at?.slice(0, 10);
    if (!day) return;
    if (!dayMap[day]) dayMap[day] = { total: 0, resolved: 0 };
    dayMap[day].total++;
    if (r['FIN AI Agent deflected'] === 'true') dayMap[day].resolved++;
  });
  const resolvedTrend = Object.keys(dayMap).sort().map(d => {
    const dt = new Date(d);
    return {
      date: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      resolved: dayMap[d].resolved,
      total: dayMap[d].total,
    };
  });

  // Country insights
  const countryMap = {};
  rows.forEach(r => {
    const c = r.country || 'Unknown';
    if (!countryMap[c]) countryMap[c] = { total: 0, resolved: 0 };
    countryMap[c].total++;
    if (r['FIN AI Agent deflected'] === 'true') countryMap[c].resolved++;
  });
  const countryInsights = Object.entries(countryMap)
    .map(([name, d]) => ({
      name,
      resolved: d.resolved,
      coverage: totalAll > 0 ? parseFloat(((d.total / totalAll) * 100).toFixed(1)) : 0,
      involvement: totalFin > 0 ? parseFloat(((d.total / totalFin) * 100).toFixed(1)) : 0,
      resolution: d.total > 0 ? parseFloat(((d.resolved / d.total) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.resolved - a.resolved)
    .slice(0, 15);

  // CX Score average (chat only)
  const { data: cxData } = await supabase
    .from('FIN - Service Performance Overview')
    .select('"CX score"')
    .eq('channel', 'Chat')
    .gte('created_at', curFrom)
    .lte('created_at', curTo + 'T23:59:59')
    .not('"CX score"', 'is', null);
  const cxScores = (cxData || []).map(r => r['CX score']).filter(v => v != null);
  const cxScore = cxScores.length > 0 ? (cxScores.reduce((a, b) => a + b, 0) / cxScores.length).toFixed(1) : '-';

  return {
    summary: {
      coverageRate: parseFloat(coverageRate),
      resolutionRate: parseFloat(resolutionRate),
      resolvedCount: deflected,
      handoverCount: notDeflected,
      handoverRate: totalFin > 0 ? parseFloat(((notDeflected / totalFin) * 100).toFixed(1)) : 0,
      accuracyRate: parseFloat(accuracyRate),
      payableAmount: parseFloat(payableAmount),
      cxScore,
    },
    involvementData: [
      { name: 'FIN Resolved', value: finPct, color: '#8B5CF6' },
      { name: 'Handed to Agents', value: humanPct, color: '#C084FC' },
    ],
    resolvedTrend,
    countryInsights,
  };
};

// ============ DRILL-IN MODAL ============
const DrillInModal = ({ title, data, columns, onClose, loading }) => {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc'); // 'asc' | 'desc'
  const [search, setSearch] = useState('');
  const overlayRef = useRef(null);

  // Parse cell value for sorting: handles timestamps, time strings (e.g. "1m 30s"), Hit/Miss, numbers, strings
  const parseForSort = (val) => {
    if (val == null || val === '-' || val === '') return null;
    if (typeof val === 'number') return val;
    const s = String(val).trim();
    // Date & Time "YYYY-MM-DD HH:MM:SS +06"
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const d = new Date(s.replace(' +06', '+06:00').replace(' ', 'T'));
      return isNaN(d.getTime()) ? s : d.getTime();
    }
    // Time: "Xh Ym", "Xh", "Xm Ys", "Xm", "Xs"
    const thm = s.match(/^(\d+)h\s*(\d+)m?$/); if (thm) return parseInt(thm[1], 10) * 3600 + parseInt(thm[2], 10) * 60;
    const th = s.match(/^(\d+)h$/); if (th) return parseInt(th[1], 10) * 3600;
    const tm = s.match(/^(\d+)m\s*(\d+)s?$/); if (tm) return parseInt(tm[1], 10) * 60 + parseInt(tm[2], 10);
    const tmOnly = s.match(/^(\d+)m$/); if (tmOnly) return parseInt(tmOnly[1], 10) * 60;
    const ts = s.match(/^(\d+)s$/); if (ts) return parseInt(ts[1], 10);
    // Percentage "45%"
    const p = s.match(/^([\d.]+)%$/);
    if (p) return parseFloat(p[1]);
    // Pure number
    if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    // Hit/Miss ordering
    if (s === 'Hit') return 0;
    if (s === 'Miss') return 1;
    return s.toLowerCase();
  };

  // Filter by search across all column values (case-insensitive substring match)
  const filteredData = useMemo(() => {
    if (!data || data.length === 0) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(row =>
      Object.values(row).some(v => {
        if (v == null) return false;
        return String(v).toLowerCase().includes(q);
      })
    );
  }, [data, search]);

  const sortedData = useMemo(() => {
    if (!sortKey || !filteredData || filteredData.length === 0) return filteredData || [];
    const copy = [...filteredData];
    copy.sort((a, b) => {
      const va = parseForSort(a[sortKey]);
      const vb = parseForSort(b[sortKey]);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;  // nulls last
      if (vb == null) return -1;
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [filteredData, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const exportCSV = () => {
    if (!data || data.length === 0) return;
    const cols = columns || Object.keys(data[0] || {}).map(k => ({ key: k, label: k }));
    const header = cols.map(c => c.label).join(',');
    const rows = (sortedData || data).map(row => cols.map(c => {
      const val = row[c.key];
      const str = val == null ? '' : String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2rem'
      }}
    >
      <div style={{
        background: '#0D1117', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '16px', width: '90vw', maxWidth: '1200px', maxHeight: '85vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', gap: '1rem', flexWrap: 'wrap'
        }}>
          <h3 style={{ color: '#F8FAFC', margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
            {title}
            <span style={{ color: '#64748B', fontWeight: 400, fontSize: '0.85rem', marginLeft: '0.5rem' }}>
              ({sortedData.length}{search && sortedData.length !== (data || []).length ? ` of ${(data || []).length}` : ''} rows)
            </span>
          </h3>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: '1 1 auto', justifyContent: 'flex-end' }}>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Search..."
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '8px',
                color: '#E2E8F0',
                padding: '6px 12px',
                fontSize: '0.8rem',
                outline: 'none',
                minWidth: '180px',
                maxWidth: '280px'
              }}
            />
            <button onClick={exportCSV} style={{
              background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '8px', color: '#C084FC', padding: '6px 14px', fontSize: '0.8rem',
              cursor: 'pointer', fontWeight: 600
            }}>Export CSV</button>
            <button onClick={onClose} style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', color: '#94A3B8', padding: '6px 10px', fontSize: '1rem',
              cursor: 'pointer', lineHeight: 1
            }}>✕</button>
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0 1.5rem' }}>
          {loading ? (
            <div style={{ color: '#64748B', textAlign: 'center', padding: '3rem' }}>
              Loading rows from Performance Overview…
            </div>
          ) : (!data || data.length === 0) ? (
            <div style={{ color: '#64748B', textAlign: 'center', padding: '3rem' }}>
              No rows match the current filters.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', position: 'sticky', top: 0, background: '#0D1117', zIndex: 1 }}>
                  {(columns || Object.keys(data[0] || {}).map(k => ({ key: k, label: k }))).map(col => {
                    const isActive = sortKey === col.key;
                    const arrow = isActive ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';
                    return (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                        style={{
                          padding: '10px 12px',
                          textAlign: 'left',
                          color: isActive ? '#C084FC' : '#94A3B8',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          fontSize: '0.75rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.3px',
                          cursor: 'pointer',
                          userSelect: 'none'
                        }}
                        title="Click to sort"
                      >
                        {col.label}
                        <span style={{ opacity: isActive ? 1 : 0.35, marginLeft: '2px', fontSize: '0.7rem' }}>{arrow}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedData.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {(columns || Object.keys(data[0] || {}).map(k => ({ key: k, label: k }))).map(col => (
                      <td key={col.key} style={{ padding: '8px 12px', color: '#E2E8F0', whiteSpace: 'nowrap' }}>
                        {col.format ? col.format(row[col.key], row) : (row[col.key] ?? '-')}
                      </td>
                    ))}
                  </tr>
                ))}
                {sortedData.length === 0 && search && (
                  <tr>
                    <td colSpan={(columns || []).length || 1} style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                      No rows match "{search}"
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

// ============ DRILL-IN BUTTON ============
const DrillInBtn = ({ onClick }) => (
  <button
    className="spo-drill-btn"
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    style={{
      position: 'absolute', top: '8px', right: '8px',
      background: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(99, 102, 241, 0.4)',
      borderRadius: '50%', width: '28px', height: '28px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', fontSize: '0.75rem', lineHeight: 1,
      opacity: 0, transition: 'opacity 0.2s ease',
      zIndex: 10, color: '#818CF8',
    }}
    title="Drill into data"
  >🔍</button>
);

// ============ MAIN COMPONENT ============
const ServicePerformanceOverview = () => {
  const { user } = useAuth();
  const isAdmin = ['sajol@nextventures.io', 'sazzad@nextventures.io', 'salmanwahid@nextventures.io', 'dhrubo@nextventures.io', 'sajolmk999@gmail.com'].includes(user?.email?.toLowerCase());
  const [activeSegment, setActiveSegment] = useState('Live Chat');
  const [performanceMetric, setPerformanceMetric] = useState('FRT');
  const [teammateMetric, setTeammateMetric] = useState('conversations');
  const [countryView, setCountryView] = useState('country');
  const [finCountryMetric, setFinCountryMetric] = useState('resolved');
  const [dateRange, setDateRange] = useState('last_7_days');
  
  // Filter states
  const [regionFilter, setRegionFilter] = useState('All');
  const [countryFilter, setCountryFilter] = useState('All');
  const [channelFilter, setChannelFilter] = useState('All');
  const [sentimentFilter, setSentimentFilter] = useState('All');
  const [agentFilter, setAgentFilter] = useState([]);
  const [agentOptions, setAgentOptions] = useState([]);
  const [allAgentOptions, setAllAgentOptions] = useState([]);
  const [teamLeadFilter, setTeamLeadFilter] = useState('All');
  const [teamLeadOptions, setTeamLeadOptions] = useState([]);
  const [teamLeadAgentMap, setTeamLeadAgentMap] = useState({});
  const [productFilter, setProductFilter] = useState('All');
  const [gmtOffset, setGmtOffset] = useState(6);

  const [isLoading, setIsLoading] = useState(true);
  const [hasRealData, setHasRealData] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [summary, setSummary] = useState({});
  const [prevSummary, setPrevSummary] = useState({});
  const [knockCountData, setKnockCountData] = useState([]);
  const [sentimentData, setSentimentData] = useState([]);
  const [channelData, setChannelData] = useState([]);
  const [heatmapData, setHeatmapData] = useState([]);
  const [closedHeatmapData, setClosedHeatmapData] = useState([]);
  const [performanceData, setPerformanceData] = useState([]);
  const [teammateData, setTeammateData] = useState([]);
  const [countryData, setCountryData] = useState([]);
  const [activeHoursData, setActiveHoursData] = useState([]);
  
  // FIN segment state
  const [finSummary, setFinSummary] = useState({});
  const [finResolvedTrend, setFinResolvedTrend] = useState([]);
  const [finResentmentTopics, setFinResentmentTopics] = useState([]);
  const [finCountryInsights, setFinCountryInsights] = useState([]);
  const [finInvolvementData, setFinInvolvementData] = useState([]);
  const [finLoading, setFinLoading] = useState(false);

  // Fundee segment state
  const [fundeeData, setFundeeData] = useState(null);
  const [fundeeLoading, setFundeeLoading] = useState(false);
  const [fundeeError, setFundeeError] = useState(null);
  const [fundeeSyncing, setFundeeSyncing] = useState(false);
  const [fundeeSyncResult, setFundeeSyncResult] = useState(null);
  const [detailSyncing, setDetailSyncing] = useState(false);
  const [detailSyncStatus, setDetailSyncStatus] = useState('');

  // Activity Hours state
  const [activityData, setActivityData] = useState(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState(null);

  // Drill-in state
  const [drillIn, setDrillIn] = useState(null);
  const emailRawRowsRef = useRef([]);
  const chatAgentsRef = useRef([]);

  // Email segment state
  const [emailData, setEmailData] = useState(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailAgentOptions, setEmailAgentOptions] = useState([]);
  const [emailPerfMetric, setEmailPerfMetric] = useState('ART');
  const [emailHeatmapMode, setEmailHeatmapMode] = useState('thread');
  const [repeatWindow, setRepeatWindow] = useState(24);

  const [timeseriesMode, setTimeseriesMode] = useState('daily');

  const performanceDropdown = [
    { value: 'conversations', label: 'Conversations Handled' },
    { value: 'FRT', label: 'First Response Time' },
    { value: 'ART', label: 'Avg Response Time' },
    { value: 'AHT', label: 'Avg Handle Time' },
    { value: 'FRT Hit Rate', label: 'FRT Hit Rate' },
    { value: 'ART Hit Rate', label: 'ART Hit Rate' },
    { value: 'FRT Miss Count', label: 'FRT Miss Count' },
    { value: 'ART Miss Count', label: 'ART Miss Count' }
  ];

  const teammateDropdown = [
    { value: 'conversations', label: 'Conversations Handled' },
    { value: 'FRT', label: 'First Response Time' },
    { value: 'ART', label: 'Avg Response Time' },
    { value: 'AHT', label: 'Avg Handle Time' },
    { value: 'FRT Hit Rate', label: 'FRT Hit Rate' },
    { value: 'ART Hit Rate', label: 'ART Hit Rate' },
    { value: 'FRT Miss Count', label: 'FRT Miss Count' },
    { value: 'ART Miss Count', label: 'ART Miss Count' }
  ];

  const timeseriesModes = [
    { value: 'hourly', label: 'Hourly' },
    { value: 'hourly_avg', label: 'Hourly Average' },
    { value: 'daily', label: 'Daily' },
    { value: 'daily_avg', label: 'Daily Average' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' }
  ];

  // Goal/threshold lines for Performance Trend.
  // Per-conv thresholds: FRT ≤ 30s, ART ≤ 70s, AHT ≤ 25min (1500s).
  // Aggregate goals:    FRT Hit Rate 80%, ART Hit Rate 70%, CSAT 75% (3.75 on 5-pt).
  const goalLines = { FRT: 30, ART: 70, AHT: 1500, 'FRT Hit Rate': 80, 'ART Hit Rate': 70, CSAT: 3.75 };

  // Display agent name as "Real Name (Intercom Name)"
  const displayName = (intercomName) => {
    const realName = intercomToAgent[intercomName];
    return realName ? `${realName} (${intercomName})` : intercomName;
  };

  // Load agent names, intercom names, and team leads for filters
  const [agentNameMap, setAgentNameMap] = useState({}); // agent_name → intercom_name
  const [intercomToAgent, setIntercomToAgent] = useState({}); // intercom_name → agent_name
  const [agentsReady, setAgentsReady] = useState(false);

  useEffect(() => {
    const loadAgentsAndTeamLeads = async () => {
      try {
        const { data } = await supabase
          .from('agent_name_mapping')
          .select('agent_name, intercom_name, team_lead, channel')
          .eq('exclude_from_metrics', false)
          .order('agent_name');
        if (data) {
          const agents = [...new Set(data.map(r => r.agent_name))].sort();
          setAgentOptions(agents);
          setAllAgentOptions(agents);
          // Build name mappings
          const aMap = {}, iMap = {};
          data.forEach(r => {
            aMap[r.agent_name] = r.intercom_name;
            iMap[r.intercom_name] = r.agent_name;
          });
          setAgentNameMap(aMap);
          setIntercomToAgent(iMap);
          // Build chat-only intercom names list for Live Chat filtering
          const chatIntercomNames = data.filter(r => r.channel === 'chat').map(r => r.intercom_name);
          chatAgentsRef.current = chatIntercomNames;
          // Build team lead → agents map
          const tlMap = {};
          data.forEach(r => {
            if (r.team_lead) {
              if (!tlMap[r.team_lead]) tlMap[r.team_lead] = [];
              tlMap[r.team_lead].push(r.agent_name);
            }
          });
          setTeamLeadAgentMap(tlMap);
          setTeamLeadOptions(Object.keys(tlMap).sort());
          setAgentsReady(true);
        }
      } catch (e) {
        console.error('Failed to load agents:', e);
        // Fallback: try API
        try {
          const resp = await fetch('/api/dashboard-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get-agents' })
          });
          const d = await resp.json();
          if (d.agents) { setAgentOptions(d.agents); setAllAgentOptions(d.agents); }
        } catch (e2) { console.error('Fallback failed:', e2); }
      }
    };
    loadAgentsAndTeamLeads();
  }, []);

  // When team lead changes, filter agent options and reset agent selection
  useEffect(() => {
    if (teamLeadFilter === 'All') {
      setAgentOptions(allAgentOptions);
    } else {
      const teamAgents = teamLeadAgentMap[teamLeadFilter] || [];
      setAgentOptions(teamAgents.sort());
      // Reset agent selection to only include agents in the new team
      setAgentFilter(prev => {
        if (!prev || prev.length === 0) return [];
        const filtered = prev.filter(a => teamAgents.includes(a));
        return filtered;
      });
    }
  }, [teamLeadFilter, allAgentOptions, teamLeadAgentMap]);

  // Load Live Chat data ONLY when Live Chat tab is active
  // Use ref for maps to avoid re-triggering on initial populate
  const agentNameMapRef = useRef(agentNameMap);
  const teamLeadAgentMapRef = useRef(teamLeadAgentMap);
  useEffect(() => { agentNameMapRef.current = agentNameMap; }, [agentNameMap]);
  useEffect(() => { teamLeadAgentMapRef.current = teamLeadAgentMap; }, [teamLeadAgentMap]);

  useEffect(() => {
    if (activeSegment !== 'Live Chat' || !agentsReady) return;
    let cancelled = false;
    const loadData = async () => {
      setIsLoading(true);
      try {
        setLoadError(null);

        // Build intercom names array for RPC filtering
        // Always filter by chat agents — if team/agent selected, use that subset; otherwise use ALL chat agents
        const mapRef = agentNameMapRef.current;
        let agentsIntercom = null;
        if (agentFilter && agentFilter.length > 0) {
          agentsIntercom = agentFilter.map(a => mapRef[a]).filter(Boolean);
        } else if (teamLeadFilter !== 'All') {
          const teamAgents = teamLeadAgentMapRef.current[teamLeadFilter] || [];
          agentsIntercom = teamAgents.map(a => mapRef[a]).filter(Boolean);
        } else if (chatAgentsRef.current.length > 0) {
          agentsIntercom = chatAgentsRef.current;
        }

        const filters = {
          dateRange,
          gmtOffset,
          region: regionFilter,
          country: countryFilter,
          channel: channelFilter,
          sentiment: sentimentFilter,
          agent: 'All',
          product: productFilter,
          agents: agentsIntercom && agentsIntercom.length > 0 ? agentsIntercom : null
        };
        console.log('📊 Live Chat filters:', JSON.stringify({ ...filters, agents: filters.agents?.length || 0 }), 'teamLead:', teamLeadFilter);

        // Previous period range for comparison scorecards
        const prevRange = getPreviousDateRange(dateRange);
        const prevFilters = { ...filters, dateRange: prevRange };

        const [dashData, prevData] = await Promise.all([
          fetchAllDashboardData(filters),
          fetchAllDashboardData(prevFilters).catch(() => ({ summary: {} }))
        ]);
        if (cancelled) return;
        const hasData = dashData.summary?.total_knock_count > 0;
        setHasRealData(hasData);
        setSummary(dashData.summary);
        setPrevSummary(prevData.summary || {});
        setKnockCountData(dashData.trend);
        setSentimentData(dashData.sentiment);
        setChannelData(dashData.channels);
        setHeatmapData(dashData.heatmap);
        setClosedHeatmapData(dashData.closedHeatmap || []);
        setTeammateData(dashData.teammates);
        let countries = dashData.countries || [];
        if (regionFilter && regionFilter !== 'All') {
          countries = countries.filter(c => COUNTRY_TO_REGION[c.name] === regionFilter);
        }
        setCountryData(countries);
        setActiveHoursData(dashData.activeHours);
      } catch (error) {
        if (cancelled) return;
        console.error('❌ Live Chat data error:', error);
        setHasRealData(false);
        setLoadError(error?.message || String(error));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadData();
    return () => { cancelled = true; };
  }, [dateRange, regionFilter, countryFilter, channelFilter, sentimentFilter, agentFilter, productFilter, activeSegment, teamLeadFilter, agentsReady, gmtOffset]);

  // Load FIN data ONLY when FIN tab is active
  useEffect(() => {
    if (activeSegment !== 'FIN') return;
    const loadFin = async () => {
      try {
        setFinLoading(true);
        const finResult = await fetchFinDataFromSupabase(dateRange, { countryFilter, regionFilter });
        setFinSummary(finResult.summary);
        setFinInvolvementData(finResult.involvementData);
        setFinResolvedTrend(finResult.resolvedTrend);
        setFinCountryInsights(finResult.countryInsights);
      } catch (finErr) {
        console.error('❌ FIN data error:', finErr);
      } finally {
        setFinLoading(false);
      }
    };
    loadFin();
  }, [activeSegment, dateRange, countryFilter, regionFilter, gmtOffset]);

  // Timeseries: fetch ALL metrics via RPC (no URL length limit), cache raw data
  const [rawTimeseries, setRawTimeseries] = useState([]);
  useEffect(() => {
    if (activeSegment !== 'Live Chat' || !agentsReady) return;
    let cancelled = false;
    const loadTimeseries = async () => {
      try {
        const mapRef = agentNameMapRef.current;
        let tsAgents = null;
        if (agentFilter && agentFilter.length > 0) {
          tsAgents = agentFilter.map(a => mapRef[a]).filter(Boolean);
        } else if (teamLeadFilter !== 'All') {
          const teamAgents = teamLeadAgentMapRef.current[teamLeadFilter] || [];
          tsAgents = teamAgents.map(a => mapRef[a]).filter(Boolean);
        } else if (chatAgentsRef.current.length > 0) {
          tsAgents = chatAgentsRef.current;
        }
        const { startDate, endDate } = getDateRange(dateRange, gmtOffset);
        const { data, error } = await supabase.rpc('get_performance_timeseries', {
          p_start_date: startDate,
          p_end_date: endDate,
          p_channel: channelFilter === 'All' ? null : channelFilter,
          p_agents: tsAgents && tsAgents.length > 0 ? tsAgents : null,
          p_granularity: timeseriesMode
        });
        if (!cancelled && !error) setRawTimeseries(data || []);
        if (error) console.error('Timeseries RPC error:', error);
      } catch (err) {
        if (!cancelled) console.error('Perf timeseries error:', err);
      }
    };
    loadTimeseries();
    return () => { cancelled = true; };
  }, [dateRange, channelFilter, agentFilter, activeSegment, teamLeadFilter, agentsReady, timeseriesMode, gmtOffset]);

  // Derive displayed timeseries from raw data + selected metric (no re-fetch on metric change)
  const performanceDataMemo = useMemo(() => {
    return rawTimeseries.map(row => ({ date: row.date, [performanceMetric]: row[performanceMetric] }));
  }, [rawTimeseries, performanceMetric]);

  useEffect(() => { setPerformanceData(performanceDataMemo); }, [performanceDataMemo]);

  // Load Fundee data when tab is active
  useEffect(() => {
    if (activeSegment !== 'Fundee') return;
    const loadFundee = async () => {
      setFundeeLoading(true);
      setFundeeError(null);
      try {
        let data;
        try {
          const resp = await fetch('/api/fundee-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dateRange })
          });
          if (!resp.ok) throw new Error(`API ${resp.status}`);
          data = await resp.json();
          if (data.error) throw new Error(data.error);
        } catch (apiErr) {
          // Fallback: call Supabase RPC directly
          console.warn('⚠️ Fundee API unavailable, querying Supabase directly:', apiErr.message);
          const DHAKA_OFFSET = '+06:00';
          // Compute Dhaka "today" reliably: format UTC+6 as YYYY-MM-DD
          const now = new Date();
          const dhakaFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' });
          const endDateStr = dhakaFormatter.format(now); // YYYY-MM-DD in Dhaka
          let startDateStr;
          if (dateRange && dateRange.startsWith('custom_')) {
            const parts = dateRange.split('_');
            startDateStr = parts[1];
          } else {
            const dhakaToday = new Date(endDateStr + 'T00:00:00' + DHAKA_OFFSET);
            if (dateRange === 'today') { /* no offset */ }
            else if (dateRange === 'last_7_days') dhakaToday.setDate(dhakaToday.getDate() - 7);
            else if (dateRange === 'last_90_days') dhakaToday.setDate(dhakaToday.getDate() - 90);
            else dhakaToday.setDate(dhakaToday.getDate() - 30);
            startDateStr = dhakaToday.toISOString().split('T')[0];
          }
          const endStr = dateRange?.startsWith('custom_') ? dateRange.split('_')[2] : endDateStr;

          const { data: raw, error } = await supabase.rpc('get_fundee_dashboard', {
            p_from: startDateStr + 'T00:00:00' + DHAKA_OFFSET,
            p_to: endStr + 'T23:59:59' + DHAKA_OFFSET
          });
          if (error) throw error;

          const AGENTS = { 'CFD Website': true, 'Futures Website': true };
          const agents = (raw || {}).agents || {};
          for (const name of Object.keys(AGENTS)) {
            if (!agents[name]) agents[name] = { count: 0, totalDuration: 0, successCount: 0, failCount: 0 };
          }
          const t = (raw || {}).totals || {};
          const totalCount = parseInt(t.total_conversations) || 0;
          const detailedCount = parseInt(t.detailed_count) || 0;
          const totalSuccess = parseInt(t.total_success) || 0;
          const totalFail = parseInt(t.total_fail) || 0;
          const totalWithOutcome = totalSuccess + totalFail;
          const totalDuration = parseInt(t.total_duration) || 0;
          const totalMinutes = totalDuration / 60;
          const COST_PER_MINUTE = 0.035;
          const colorMap = { Positive: '#10B981', Neutral: '#F59E0B', Negative: '#EF4444' };
          const sentimentBreakdown = ((raw || {}).sentimentBreakdown || []).map(s => ({ ...s, color: colorMap[s.name] || '#94A3B8' }));
          for (const [name, color] of Object.entries(colorMap)) {
            if (!sentimentBreakdown.find(s => s.name === name)) sentimentBreakdown.push({ name, value: 0, color });
          }
          data = {
            agents,
            totals: {
              totalConversations: totalCount,
              totalMinutes: parseFloat(totalMinutes.toFixed(1)),
              avgDurationSecs: parseFloat(t.avg_duration) || 0,
              successRate: totalWithOutcome > 0 ? parseFloat(((totalSuccess / totalWithOutcome) * 100).toFixed(1)) : 0,
              totalCostUsd: parseFloat((totalMinutes * COST_PER_MINUTE).toFixed(2)),
              costPerMinute: COST_PER_MINUTE
            },
            dailyTrend: (raw || {}).dailyTrend || [],
            topicDistribution: (raw || {}).topicDistribution || [],
            sentimentBreakdown
          };
        }
        // Apply sentiment filter client-side on sentimentBreakdown
        if (sentimentFilter && sentimentFilter !== 'All' && data && data.sentimentBreakdown) {
          data = {
            ...data,
            sentimentBreakdown: data.sentimentBreakdown.map(s =>
              s.name === sentimentFilter ? s : { ...s, value: 0 }
            )
          };
        }
        setFundeeData(data);
      } catch (err) {
        console.error('Fundee data error:', err);
        setFundeeError(err.message);
      } finally {
        setFundeeLoading(false);
      }
    };
    loadFundee();
  }, [activeSegment, dateRange, sentimentFilter, gmtOffset]);

  // Fetch Activity Hours directly from Supabase activity_hours table (shared by Live Chat + Email; data is all-agents and filtered per segment at render)
  useEffect(() => {
    if (activeSegment !== 'Live Chat' && activeSegment !== 'Email') return;
    const fetchActivityHours = async () => {
      setActivityLoading(true);
      setActivityError(null);
      try {
        // Convert dateRange to actual YYYY-MM-DD dates in GMT+6
        const DHAKA_MS = 6 * 3600000;
        const now = new Date(Date.now() + DHAKA_MS);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let fromStr, toStr;
        if (dateRange === 'today') {
          fromStr = toStr = today.toISOString().slice(0, 10);
        } else if (dateRange === 'yesterday') {
          const y = new Date(today); y.setDate(y.getDate() - 1);
          fromStr = toStr = y.toISOString().slice(0, 10);
        } else if (dateRange === 'this_week') {
          const d = new Date(today); d.setDate(d.getDate() - d.getDay());
          fromStr = d.toISOString().slice(0, 10);
          toStr = today.toISOString().slice(0, 10);
        } else if (dateRange === 'this_month') {
          fromStr = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
          toStr = today.toISOString().slice(0, 10);
        } else if (dateRange === 'last_month') {
          const first = new Date(today.getFullYear(), today.getMonth(), 1);
          const end = new Date(first.getTime() - 1);
          fromStr = new Date(end.getFullYear(), end.getMonth(), 1).toISOString().slice(0, 10);
          toStr = end.toISOString().slice(0, 10);
        } else if (dateRange && dateRange.startsWith('custom_')) {
          const parts = dateRange.split('_');
          fromStr = parts[1];
          toStr = parts[2];
        } else {
          const daysMap = { 'last_7_days': 7, 'last_30_days': 30, 'last_90_days': 90 };
          const days = daysMap[dateRange] || 30;
          const d = new Date(today); d.setDate(d.getDate() - days);
          fromStr = d.toISOString().slice(0, 10);
          toStr = today.toISOString().slice(0, 10);
        }

        // Trigger API sync first (fills missing dates from Intercom → Supabase), then read from Supabase
        try {
          await fetch(`/api/activity-hours?dateFrom=${fromStr}&dateTo=${toStr}`);
        } catch (syncErr) {
          console.warn('Activity hours sync skipped:', syncErr.message);
        }

        // Page through activity_hours table directly
        const allRows = [];
        const PAGE = 1000;
        for (let offset = 0; offset < 50000; offset += PAGE) {
          const { data: chunk, error } = await supabase
            .from('activity_hours')
            .select('date, agent_name, agent_id, active_seconds, away_seconds, away_breaks, login_count, event_count, active_time')
            .gte('date', fromStr)
            .lte('date', toStr)
            .order('date', { ascending: false })
            .range(offset, offset + PAGE - 1);
          if (error) throw error;
          if (!chunk || chunk.length === 0) break;
          allRows.push(...chunk);
          if (chunk.length < PAGE) break;
        }

        // Aggregate per agent (sum active seconds across days in range)
        const fromD = new Date(fromStr + 'T00:00:00Z');
        const toD = new Date(toStr + 'T23:59:59Z');
        const daysInRange = Math.max(1, Math.round((toD - fromD) / 86400000) + 1);
        const perAgent = {};
        for (const r of allRows) {
          const key = r.agent_name;
          if (!perAgent[key]) {
            perAgent[key] = { agent_name: r.agent_name, agent_id: r.agent_id, active_seconds: 0, away_seconds: 0, login_count: 0, event_count: 0, away_breaks_agg: {}, days_seen: 0 };
          }
          perAgent[key].active_seconds += (r.active_seconds || 0);
          perAgent[key].away_seconds += (r.away_seconds || 0);
          perAgent[key].login_count += (r.login_count || 0);
          perAgent[key].event_count += (r.event_count || 0);
          perAgent[key].days_seen += 1;
          // Aggregate away_breaks by reason (excluding End of Shift)
          const breaks = Array.isArray(r.away_breaks) ? r.away_breaks : [];
          for (const b of breaks) {
            if (b.reason && b.reason.includes('End of Shift')) continue;
            if (!perAgent[key].away_breaks_agg[b.reason]) {
              perAgent[key].away_breaks_agg[b.reason] = 0;
            }
            perAgent[key].away_breaks_agg[b.reason] += (b.seconds || 0);
          }
        }

        const fmtDur = (secs) => {
          if (!secs || secs <= 0) return '0s';
          const h = Math.floor(secs / 3600);
          const m = Math.floor((secs % 3600) / 60);
          const s = Math.floor(secs % 60);
          if (h > 0) return `${h}h ${m}m`;
          if (m > 0) return `${m}m ${s}s`;
          return `${s}s`;
        };

        const agents = Object.values(perAgent).map(a => ({
          agent_name: a.agent_name,
          agent_id: a.agent_id,
          active_seconds: a.active_seconds,
          avg_active_seconds_per_day: Math.round(a.active_seconds / daysInRange),
          active_time: fmtDur(a.active_seconds),
          avg_active_per_day: fmtDur(Math.round(a.active_seconds / daysInRange)),
          away_seconds: a.away_seconds,
          login_count: a.login_count,
          away_breaks: Object.entries(a.away_breaks_agg).map(([reason, seconds]) => ({
            reason,
            seconds,
            duration: fmtDur(Math.round(seconds / daysInRange))
          }))
        }));

        setActivityData({ agents, rawRows: allRows, days_in_range: daysInRange, total_logs: allRows.length, from: fromStr, to: toStr });
      } catch (err) {
        console.error('Activity hours error:', err);
        setActivityError(err.message || String(err));
      } finally {
        setActivityLoading(false);
      }
    };
    fetchActivityHours();
  }, [activeSegment, dateRange, gmtOffset]);

  // Fetch Email segment data
  useEffect(() => {
    if (activeSegment !== 'Email') return;
    const loadEmailData = async () => {
      setEmailLoading(true);
      try {
        // Load email agents
        const { data: agData } = await supabase
          .from('agent_name_mapping')
          .select('agent_name')
          .eq('channel', 'email')
          .eq('exclude_from_metrics', false)
          .order('agent_name');
        if (agData) setEmailAgentOptions([...new Set(agData.map(r => r.agent_name))].sort());

        // Compute date range (YYYY-MM-DD in Dhaka)
        const DHAKA_MS = 6 * 3600000;
        const nowDhaka = new Date(Date.now() + DHAKA_MS);
        const todayStr = nowDhaka.toISOString().slice(0, 10);
        let fromStr, toStr;
        if (dateRange === 'today') {
          fromStr = toStr = todayStr;
        } else if (dateRange === 'yesterday') {
          const y = new Date(nowDhaka); y.setUTCDate(y.getUTCDate() - 1);
          fromStr = toStr = y.toISOString().slice(0, 10);
        } else if (dateRange === 'this_week') {
          const dow = nowDhaka.getUTCDay();
          const s = new Date(nowDhaka); s.setUTCDate(s.getUTCDate() - dow);
          fromStr = s.toISOString().slice(0, 10); toStr = todayStr;
        } else if (dateRange === 'this_month') {
          fromStr = todayStr.slice(0, 8) + '01'; toStr = todayStr;
        } else if (dateRange === 'last_month') {
          const f = new Date(Date.UTC(nowDhaka.getUTCFullYear(), nowDhaka.getUTCMonth(), 1));
          const e = new Date(f.getTime() - 86400000);
          fromStr = e.toISOString().slice(0, 8) + '01'; toStr = e.toISOString().slice(0, 10);
        } else if (dateRange && dateRange.startsWith('custom_')) {
          const p = dateRange.split('_'); fromStr = p[1]; toStr = p[2];
        } else {
          const daysMap = { last_7_days: 7, last_30_days: 30, last_90_days: 90 };
          const days = daysMap[dateRange] || 30;
          const s = new Date(nowDhaka); s.setUTCDate(s.getUTCDate() - days);
          fromStr = s.toISOString().slice(0, 10); toStr = todayStr;
        }
        // Convert to Dhaka timezone boundaries
        const startDate = fromStr + 'T00:00:00+06:00';
        const endDate = toStr + 'T23:59:59+06:00';

        // Fetch all email rows in range (paginated — Supabase default limit is 1000)
        let allRows = [];
        let offset = 0;
        const PAGE = 5000;
        while (true) {
          let q = supabase
            .from('Email - Service Performance Overview')
            .select('conversation_id, created_at, assignee_name, agent_name, team_id, art_seconds, aht_seconds, "ART Hit Rate", "CX score", country, sentiment, is_reopened, action_performed_by, response_count')
            .gte('created_at', startDate)
            .lte('created_at', endDate)
            .in('action_performed_by', EMAIL_SUPPORT_AGENTS);
          // Apply agent/team lead filter
          const effectiveEmailAgents = agentFilter && agentFilter.length > 0
            ? agentFilter
            : (teamLeadFilter !== 'All' ? (teamLeadAgentMapRef.current[teamLeadFilter] || []) : []);
          if (effectiveEmailAgents.length === 1) q = q.eq('agent_name', effectiveEmailAgents[0]);
          else if (effectiveEmailAgents.length > 1) q = q.in('agent_name', effectiveEmailAgents);
          if (countryFilter && countryFilter !== 'All') q = q.ilike('country', `%${countryFilter}%`);
          const { data: chunk, error: err } = await q.range(offset, offset + PAGE - 1);
          if (err) throw err;
          if (!chunk || chunk.length === 0) break;
          allRows = allRows.concat(chunk);
          if (chunk.length < PAGE) break;
          offset += PAGE;
        }

        emailRawRowsRef.current = allRows;

        // Total threads = unique conversation_ids
        const uniqueConvs = [...new Set(allRows.map(r => r.conversation_id))];
        const totalThreads = uniqueConvs.length;
        const totalEmails = allRows.length; // each row = 1 agent reply

        // Legal Notice threads (fetch separately — not filtered by EMAIL_SUPPORT_AGENTS)
        const { count: legalNoticeCount } = await supabase
          .from('Email - Service Performance Overview')
          .select('conversation_id', { count: 'exact', head: true })
          .gte('created_at', startDate)
          .lte('created_at', endDate)
          .eq('team_id', 'Legal Notice');

        // ART
        const artValues = allRows.filter(r => r.art_seconds != null && r.art_seconds > 0).map(r => r.art_seconds);
        const avgArt = artValues.length > 0 ? Math.round(artValues.reduce((a, b) => a + b, 0) / artValues.length) : null;

        // AHT
        const ahtValues = allRows.filter(r => r.aht_seconds != null && r.aht_seconds > 0).map(r => r.aht_seconds);
        const avgAht = ahtValues.length > 0 ? Math.round(ahtValues.reduce((a, b) => a + b, 0) / ahtValues.length) : null;

        // SLA Hit Rate: ART <= 3600s (1 hour)
        const artForSla = allRows.filter(r => r.art_seconds != null && r.art_seconds > 0);
        const slaHitRate = artForSla.length > 0
          ? Math.round((artForSla.filter(r => r.art_seconds <= 3600).length / artForSla.length) * 100 * 10) / 10
          : null;

        // ART Hit Rate from stored values
        const artHitValues = allRows.filter(r => r['ART Hit Rate'] != null).map(r => r['ART Hit Rate']);
        const artHitRate = artHitValues.length > 0
          ? Math.round((artHitValues.reduce((a, b) => a + b, 0) / artHitValues.length) * 10) / 10
          : null;

        // CSAT
        const csatValues = allRows.filter(r => r['CX score'] != null).map(r => r['CX score']);
        const avgCsat = csatValues.length > 0 ? Math.round((csatValues.reduce((a, b) => a + b, 0) / csatValues.length) * 10) / 10 : null;
        // CSAT % = satisfied ratings (>= 4) / valid ratings — matches the CSAT page convention (CSAT.jsx calculateCSAT)
        const csatPct = csatValues.length > 0 ? Math.round((csatValues.filter(v => v >= 4).length / csatValues.length) * 1000) / 10 : null;

        // Emails per thread avg
        const emailsPerThread = totalThreads > 0 ? Math.round((totalEmails / totalThreads) * 10) / 10 : null;

        // Sentiment distribution
        const sentimentMap = { Positive: 0, Neutral: 0, Negative: 0 };
        const seenSentiment = {};
        allRows.forEach(r => {
          if (r.sentiment && !seenSentiment[r.conversation_id]) {
            seenSentiment[r.conversation_id] = true;
            if (sentimentMap[r.sentiment] !== undefined) sentimentMap[r.sentiment]++;
          }
        });
        const sentimentDist = [
          { name: 'Positive', value: sentimentMap.Positive, color: '#10B981' },
          { name: 'Neutral', value: sentimentMap.Neutral, color: '#8B5CF6' },
          { name: 'Negative', value: sentimentMap.Negative, color: '#EF4444' },
        ];

        // Email inflow trend (daily)
        const dailyMap = {};
        const toDhakaDate = (ts) => {
          const d = new Date(ts);
          const dhaka = new Date(d.getTime() + 6 * 3600000);
          return dhaka.toISOString().slice(0, 10);
        };
        const formatDate = (iso) => {
          const [y, m, d] = iso.split('-');
          const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          return `${months[parseInt(m)-1]} ${parseInt(d)}`;
        };
        allRows.forEach(r => {
          const dateKey = toDhakaDate(r.created_at);
          if (!dailyMap[dateKey]) dailyMap[dateKey] = { threads: new Set(), emails: 0 };
          dailyMap[dateKey].threads.add(r.conversation_id);
          dailyMap[dateKey].emails++;
        });
        const inflowTrend = Object.entries(dailyMap).sort((a, b) => a[0].localeCompare(b[0])).map(([isoDate, d]) => ({
          date: formatDate(isoDate), threads: d.threads.size, emails: d.emails
        }));

        // Volume heatmap
        const heatmapMap = {};
        const seenHeatmap = new Set();
        allRows.forEach(r => {
          if (!seenHeatmap.has(r.conversation_id)) {
            seenHeatmap.add(r.conversation_id);
            const d = new Date(r.created_at);
            const dayIdx = d.getDay();
            const hour = d.getHours();
            const key = `${dayIdx}-${hour}`;
            heatmapMap[key] = (heatmapMap[key] || 0) + 1;
          }
        });
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const emailHeatmap = [];
        for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
          for (let hour = 0; hour < 24; hour++) {
            emailHeatmap.push({ dayIdx, day: days[dayIdx], hour, value: heatmapMap[`${dayIdx}-${hour}`] || 0 });
          }
        }

        // Performance metric trend (daily ART/AHT/CSAT)
        const perfDailyMap = {};
        allRows.forEach(r => {
          const dateKey = toDhakaDate(r.created_at);
          if (!perfDailyMap[dateKey]) perfDailyMap[dateKey] = { art: [], aht: [], csat: [], hourAgents: {} };
          if (r.art_seconds != null && r.art_seconds > 0) perfDailyMap[dateKey].art.push(r.art_seconds);
          if (r.aht_seconds != null && r.aht_seconds > 0) perfDailyMap[dateKey].aht.push(r.aht_seconds);
          if (r['CX score'] != null) perfDailyMap[dateKey].csat.push(r['CX score']);
          const hKey = new Date(r.created_at).toISOString().slice(0, 13);
          if (!perfDailyMap[dateKey].hourAgents[hKey]) perfDailyMap[dateKey].hourAgents[hKey] = { emails: 0, agents: new Set() };
          perfDailyMap[dateKey].hourAgents[hKey].emails++;
          perfDailyMap[dateKey].hourAgents[hKey].agents.add(r.action_performed_by);
        });
        const avg = arr => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
        const perfTrend = Object.entries(perfDailyMap).sort((a, b) => a[0].localeCompare(b[0])).map(([isoDate, d]) => {
          const ehqVals = Object.values(d.hourAgents).map(h => h.agents.size > 0 ? h.emails / h.agents.size : 0);
          return {
            date: formatDate(isoDate), ART: avg(d.art), AHT: avg(d.aht),
            CSAT: d.csat.length > 0 ? Math.round(avg(d.csat) * 10) / 10 : null,
            EHQ: ehqVals.length > 0 ? Math.round((ehqVals.reduce((a, b) => a + b, 0) / ehqVals.length) * 10) / 10 : null,
          };
        });

        // Teammate performance
        const tmMap = {};
        allRows.forEach(r => {
          const name = r.agent_name || r.assignee_name || 'Unknown';
          if (!tmMap[name]) tmMap[name] = { conversations: new Set(), emails: 0, artValues: [], ahtValues: [], csatValues: [] };
          tmMap[name].conversations.add(r.conversation_id);
          tmMap[name].emails++;
          if (r.art_seconds != null && r.art_seconds > 0) tmMap[name].artValues.push(r.art_seconds);
          if (r.aht_seconds != null && r.aht_seconds > 0) tmMap[name].ahtValues.push(r.aht_seconds);
          if (r['CX score'] != null) tmMap[name].csatValues.push(r['CX score']);
        });
        const teammates = Object.entries(tmMap).map(([name, d]) => ({
          name,
          threads: d.conversations.size,
          emails: d.emails,
          ART: avg(d.artValues),
          AHT: avg(d.ahtValues),
          CSAT: d.csatValues.length > 0 ? Math.round(avg(d.csatValues) * 10) / 10 : null,
          CSATpct: d.csatValues.length > 0 ? Math.round((d.csatValues.filter(v => v >= 4).length / d.csatValues.length) * 1000) / 10 : null,
        })).sort((a, b) => b.emails - a.emails);

        // Country distribution
        const countryMap = {};
        const seenCountry = new Set();
        allRows.forEach(r => {
          if (r.country && !seenCountry.has(r.conversation_id)) {
            seenCountry.add(r.conversation_id);
            countryMap[r.country] = (countryMap[r.country] || 0) + 1;
          }
        });
        const countries = Object.entries(countryMap).map(([name, knockCount]) => ({ name, knockCount })).sort((a, b) => b.knockCount - a.knockCount).slice(0, 15);

        // EHQ = emails received / distinct agents who replied, averaged per hour
        const hourlyEhq = {};
        allRows.forEach(r => {
          const d = new Date(r.created_at);
          const hKey = d.toISOString().slice(0, 13); // YYYY-MM-DDTHH
          if (!hourlyEhq[hKey]) hourlyEhq[hKey] = { emails: 0, agents: new Set() };
          hourlyEhq[hKey].emails++;
          hourlyEhq[hKey].agents.add(r.action_performed_by);
        });
        const ehqValues = Object.values(hourlyEhq).map(h => h.agents.size > 0 ? h.emails / h.agents.size : 0);
        const ehqAvg = ehqValues.length > 0 ? Math.round((ehqValues.reduce((a, b) => a + b, 0) / ehqValues.length) * 10) / 10 : null;

        // Repeat Contact Rate: same conversation_id with multiple replies within X hours
        const convReplies = {};
        allRows.forEach(r => {
          if (!convReplies[r.conversation_id]) convReplies[r.conversation_id] = [];
          convReplies[r.conversation_id].push(new Date(r.created_at).getTime());
        });
        const calcRepeatRate = (windowHrs) => {
          let repeats = 0, total = Object.keys(convReplies).length;
          Object.values(convReplies).forEach(times => {
            times.sort((a, b) => a - b);
            for (let i = 1; i < times.length; i++) {
              if ((times[i] - times[i - 1]) <= windowHrs * 3600000) { repeats++; break; }
            }
          });
          return total > 0 ? Math.round((repeats / total) * 1000) / 10 : null;
        };
        const repeatRate24 = calcRepeatRate(24);
        const repeatRate48 = calcRepeatRate(48);
        const repeatRate72 = calcRepeatRate(72);

        // Email-wise heatmap (one entry per reply, not deduplicated by thread)
        const emailHeatmapMap = {};
        allRows.forEach(r => {
          const d = new Date(r.created_at);
          const dayIdx = d.getDay();
          const hour = d.getHours();
          const key = `${dayIdx}-${hour}`;
          emailHeatmapMap[key] = (emailHeatmapMap[key] || 0) + 1;
        });
        const emailWiseHeatmap = [];
        for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
          for (let hour = 0; hour < 24; hour++) {
            emailWiseHeatmap.push({ dayIdx, day: days[dayIdx], hour, value: emailHeatmapMap[`${dayIdx}-${hour}`] || 0 });
          }
        }

        // Backlog heatmap: open/unresolved threads by day & hour
        // A thread is "open" at a given hour if it was created before that hour and has no reply yet at that hour
        // Simplified: count threads where first reply happened AFTER each hour slot
        const backlogMap = {};
        const convFirstReply = {};
        allRows.forEach(r => {
          const t = new Date(r.created_at).getTime();
          if (!convFirstReply[r.conversation_id] || t < convFirstReply[r.conversation_id]) {
            convFirstReply[r.conversation_id] = t;
          }
        });
        // Group by hour of first reply
        Object.values(convFirstReply).forEach(t => {
          const d = new Date(t);
          const dayIdx = d.getDay();
          const hour = d.getHours();
          const key = `${dayIdx}-${hour}`;
          backlogMap[key] = (backlogMap[key] || 0) + 1;
        });
        const backlogHeatmap = [];
        for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
          for (let hour = 0; hour < 24; hour++) {
            backlogHeatmap.push({ dayIdx, day: days[dayIdx], hour, value: backlogMap[`${dayIdx}-${hour}`] || 0 });
          }
        }

        // EHQ per teammate
        const tmEhq = {};
        allRows.forEach(r => {
          const name = r.agent_name || r.assignee_name || 'Unknown';
          const hKey = new Date(r.created_at).toISOString().slice(0, 13);
          if (!tmEhq[name]) tmEhq[name] = {};
          if (!tmEhq[name][hKey]) tmEhq[name][hKey] = 0;
          tmEhq[name][hKey]++;
        });
        // Add EHQ to teammates
        teammates.forEach(tm => {
          const hourlyVals = Object.values(tmEhq[tm.name] || {});
          tm.EHQ = hourlyVals.length > 0 ? Math.round((hourlyVals.reduce((a, b) => a + b, 0) / hourlyVals.length) * 10) / 10 : null;
        });

        setEmailData({
          totalThreads, totalEmails, legalNoticeCount: legalNoticeCount || 0, avgArt, avgAht, slaHitRate, artHitRate, avgCsat, csatPct, emailsPerThread,
          ehqAvg, repeatRate24, repeatRate48, repeatRate72,
          sentimentDist, inflowTrend, emailHeatmap, emailWiseHeatmap, backlogHeatmap, perfTrend, teammates, countries
        });
      } catch (err) {
        console.error('Email data error:', err);
      } finally {
        setEmailLoading(false);
      }
    };
    loadEmailData();
  }, [activeSegment, dateRange, agentFilter, countryFilter, teamLeadFilter, gmtOffset]);

  // FIN country metric dropdown options
  const finCountryDropdown = [
    { value: 'resolved', label: 'Resolved Conversations' },
    { value: 'coverage', label: 'Coverage Rate' },
    { value: 'involvement', label: 'Involvement Rate' },
    { value: 'resolution', label: 'Resolution Rate' }
  ];

  // ---- Previous-period date range for scorecard comparisons ----
  const getPreviousDateRange = (dr) => {
    const DHAKA_MS = 6 * 3600000;
    const now = new Date(Date.now() + DHAKA_MS);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const fmt = d => d.toISOString().slice(0, 10);
    const shift = (d, days) => { const r = new Date(d); r.setDate(r.getDate() + days); return r; };
    if (dr === 'today') { const y = shift(today, -1); return `custom_${fmt(y)}_${fmt(y)}`; }
    if (dr === 'yesterday') { const y = shift(today, -2); return `custom_${fmt(y)}_${fmt(y)}`; }
    if (dr === 'this_week') {
      const start = shift(today, -today.getDay() - 7);
      const end = shift(today, -today.getDay() - 1);
      return `custom_${fmt(start)}_${fmt(end)}`;
    }
    if (dr === 'this_month') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const prev1 = shift(first, -1);
      const prevFirst = new Date(prev1.getFullYear(), prev1.getMonth(), 1);
      return `custom_${fmt(prevFirst)}_${fmt(prev1)}`;
    }
    if (dr === 'last_month') {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const prev1 = shift(first, -1);
      const prevFirst = new Date(prev1.getFullYear(), prev1.getMonth(), 1);
      return `custom_${fmt(prevFirst)}_${fmt(prev1)}`;
    }
    if (dr && dr.startsWith('custom_')) {
      const parts = dr.split('_');
      const from = new Date(parts[1] + 'T00:00:00Z');
      const to = new Date(parts[2] + 'T00:00:00Z');
      const daySpan = Math.round((to - from) / 86400000) + 1;
      const prevTo = new Date(from.getTime() - 86400000);
      const prevFrom = new Date(prevTo.getTime() - (daySpan - 1) * 86400000);
      return `custom_${prevFrom.toISOString().slice(0, 10)}_${prevTo.toISOString().slice(0, 10)}`;
    }
    const daysMap = { last_7_days: 7, last_30_days: 30, last_90_days: 90 };
    const days = daysMap[dr] || 30;
    const end = shift(today, -days);
    const start = shift(today, -days * 2 + 1);
    return `custom_${fmt(start)}_${fmt(end)}`;
  };

  // ---- Compute trend direction + display for a scorecard given current & prev values ----
  // isLowerBetter: true for time metrics (FRT/ART/AHT/Wait), false for counts/hit rates
  const computeTrend = (curr, prev, opts = {}) => {
    const c = curr == null || curr === '' ? null : Number(curr);
    const p = prev == null || prev === '' ? null : Number(prev);
    if (c == null || p == null || isNaN(c) || isNaN(p) || p === 0) return { trend: null, trendValue: null };
    const diff = c - p;
    const pct = Math.abs((diff / p) * 100);
    const rising = diff > 0;
    // Determine good/bad direction
    const goodWhenUp = !opts.isLowerBetter;
    const direction = diff === 0 ? 'same' : (rising === goodWhenUp ? 'up' : 'down');
    const label = opts.formatDiff ? opts.formatDiff(diff) : `${pct.toFixed(1)}%`;
    return { trend: direction, trendValue: `${label} vs prev` };
  };

  // ---- Drill-in helper to open modal ----
  const openDrillIn = (title, data, columns) => setDrillIn({ title, data, columns });

  // ---- Email drill-in: build rich raw/thread rows from the already-loaded email rows ----
  // (Email mirror of the Live Chat openBarDrillIn raw-row experience.)
  //   opts.filter — row predicate to scope the drill-in to a metric (e.g. rows with an ART value)
  //   opts.level  — 'thread' = one row per conversation; default = one row per email reply
  const openEmailRawDrillIn = (title, opts = {}) => {
    const all = emailRawRowsRef.current || [];
    const base = opts.filter ? all.filter(opts.filter) : all;
    const hitMiss = (v) => v === 0 ? 'Hit' : v != null ? 'Miss' : '-';
    const agentOf = (r) => displayName(r.assignee_name || r.agent_name || 'Unknown');

    if (opts.level === 'ehq') {
      // Reconciles with the EHQ card: card = avg of (emails / distinct agents) across UTC hour buckets
      const buckets = {};
      base.forEach(r => {
        const hKey = new Date(r.created_at).toISOString().slice(0, 13); // YYYY-MM-DDTHH (UTC) — same key the card uses
        if (!buckets[hKey]) buckets[hKey] = { emails: 0, agents: new Set() };
        buckets[hKey].emails++;
        buckets[hKey].agents.add(r.action_performed_by);
      });
      const data = Object.entries(buckets)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([hKey, b]) => {
          const start = new Date(hKey + ':00:00Z');
          return {
            hour: new Date(start.getTime() + 6 * 3600000).toISOString().replace('T', ' ').slice(0, 16) + ' +06',
            emails: b.emails,
            agents: b.agents.size,
            ehq: b.agents.size > 0 ? Math.round((b.emails / b.agents.size) * 10) / 10 : 0,
          };
        });
      setDrillIn({ title, data, columns: [
        { key: 'hour', label: 'Hour (GMT+6)' },
        { key: 'emails', label: 'Emails' },
        { key: 'agents', label: 'Agents' },
        { key: 'ehq', label: 'EHQ' },
      ] });
      return;
    }

    if (opts.level === 'repeat') {
      // Reconciles with the Repeat Contact Rate card: a conversation is a "repeat" if its
      // smallest gap between consecutive replies falls within the window. Count(Yes)/total = card %.
      const byConv = {};
      base.forEach(r => {
        const c = r.conversation_id;
        if (!byConv[c]) byConv[c] = { conversation_id: c, first: r.created_at, agent: agentOf(r), times: [] };
        byConv[c].times.push(new Date(r.created_at).getTime());
        if (new Date(r.created_at) < new Date(byConv[c].first)) byConv[c].first = r.created_at;
      });
      const data = Object.values(byConv)
        .sort((a, b) => new Date(b.first) - new Date(a.first))
        .map(t => {
          const times = t.times.slice().sort((a, b) => a - b);
          let minGap = null;
          for (let i = 1; i < times.length; i++) {
            const g = times[i] - times[i - 1];
            if (minGap == null || g < minGap) minGap = g;
          }
          const within = (h) => minGap != null && minGap <= h * 3600000 ? 'Yes' : 'No';
          return {
            conversation_id: t.conversation_id,
            datetime: fmtDhakaDT(t.first),
            agent: t.agent,
            replies: t.times.length,
            min_gap: minGap != null ? formatTime(Math.round(minGap / 1000)) : '-',
            repeat_24: within(24),
            repeat_48: within(48),
            repeat_72: within(72),
          };
        });
      setDrillIn({ title, data, columns: [
        { key: 'conversation_id', label: 'Conversation ID' },
        { key: 'datetime', label: 'First Email' },
        { key: 'agent', label: 'Agent' },
        { key: 'replies', label: 'Replies' },
        { key: 'min_gap', label: 'Min Gap' },
        { key: 'repeat_24', label: 'Repeat ≤24h' },
        { key: 'repeat_48', label: 'Repeat ≤48h' },
        { key: 'repeat_72', label: 'Repeat ≤72h' },
      ] });
      return;
    }

    if (opts.level === 'thread') {
      const byConv = {};
      base.forEach(r => {
        const c = r.conversation_id;
        if (!byConv[c]) byConv[c] = { conversation_id: c, first: r.created_at, agent: agentOf(r), country: r.country || '-', emails: 0, artVals: [], csat: null, sentiment: r.sentiment || '-' };
        const t = byConv[c];
        t.emails++;
        if (new Date(r.created_at) < new Date(t.first)) t.first = r.created_at;
        if (r.art_seconds != null && r.art_seconds > 0) t.artVals.push(r.art_seconds);
        if (r['CX score'] != null) t.csat = r['CX score'];
      });
      const data = Object.values(byConv)
        .sort((a, b) => new Date(b.first) - new Date(a.first))
        .map(t => ({
          conversation_id: t.conversation_id,
          datetime: fmtDhakaDT(t.first),
          agent: t.agent,
          country: t.country,
          emails: t.emails,
          avg_art: t.artVals.length ? formatTime(Math.round(t.artVals.reduce((a, b) => a + b, 0) / t.artVals.length)) : '-',
          csat: t.csat != null ? t.csat : '-',
          sentiment: t.sentiment,
        }));
      setDrillIn({ title, data, columns: [
        { key: 'conversation_id', label: 'Conversation ID' },
        { key: 'datetime', label: 'First Email' },
        { key: 'agent', label: 'Agent' },
        { key: 'country', label: 'Country' },
        { key: 'emails', label: 'Emails' },
        { key: 'avg_art', label: 'Avg ART' },
        { key: 'csat', label: 'CSAT' },
        { key: 'sentiment', label: 'Sentiment' },
      ] });
      return;
    }

    // default: per-reply (email-level) rows with all metrics
    const data = base
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map(r => ({
        conversation_id: r.conversation_id,
        datetime: fmtDhakaDT(r.created_at),
        agent: agentOf(r),
        country: r.country || '-',
        art: r.art_seconds != null && r.art_seconds > 0 ? formatTime(r.art_seconds) : '-',
        aht: r.aht_seconds != null && r.aht_seconds > 0 ? formatTime(r.aht_seconds) : '-',
        art_hit: hitMiss(r['ART Hit Rate']),
        sla: r.art_seconds != null && r.art_seconds > 0 ? (r.art_seconds <= 3600 ? 'Hit' : 'Miss') : '-',
        csat: r['CX score'] != null ? r['CX score'] : '-',
        sentiment: r.sentiment || '-',
      }));
    setDrillIn({ title, data, columns: [
      { key: 'conversation_id', label: 'Conversation ID' },
      { key: 'datetime', label: 'Date & Time' },
      { key: 'agent', label: 'Agent' },
      { key: 'country', label: 'Country' },
      { key: 'art', label: 'ART' },
      { key: 'aht', label: 'AHT' },
      { key: 'art_hit', label: 'ART Hit' },
      { key: 'sla', label: 'SLA ≤1h' },
      { key: 'csat', label: 'CSAT' },
      { key: 'sentiment', label: 'Sentiment' },
    ] });
  };

  // ---- Legal Notice drill-in: fetch the underlying threads (not limited to support agents) ----
  const openLegalNoticeDrillIn = async (title) => {
    setDrillIn({ title, data: [], columns: [], loading: true });
    try {
      const { startDate, endDate } = getDateRange(dateRange, 6);
      const { data, error } = await supabase
        .from('Email - Service Performance Overview')
        .select('conversation_id, created_at, agent_name, assignee_name, country, art_seconds, sentiment')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .eq('team_id', 'Legal Notice')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      const rows = (data || []).map(r => ({
        conversation_id: r.conversation_id,
        datetime: fmtDhakaDT(r.created_at),
        agent: displayName(r.assignee_name || r.agent_name || 'Unknown'),
        country: r.country || '-',
        art: r.art_seconds != null && r.art_seconds > 0 ? formatTime(r.art_seconds) : '-',
        sentiment: r.sentiment || '-',
      }));
      setDrillIn({ title, data: rows, columns: [
        { key: 'conversation_id', label: 'Conversation ID' },
        { key: 'datetime', label: 'Date & Time' },
        { key: 'agent', label: 'Agent' },
        { key: 'country', label: 'Country' },
        { key: 'art', label: 'ART' },
        { key: 'sentiment', label: 'Sentiment' },
      ] });
    } catch (e) {
      console.error('Legal Notice drill-in error:', e);
      setDrillIn({ title, data: [], columns: [{ key: 'error', label: 'Error' }], loading: false });
    }
  };

  // ---- Activity Hours drill-in: pivot break reasons into columns, one row per (date, agent) ----
  const openActivityDrillIn = (title, filterAgent = null, allowedAgents = null) => {
    const rawRows = activityData?.rawRows || [];
    // Restrict to the segment's agents (chat agents by default; email agents when passed in)
    const allowedSet = allowedAgents || new Set(chatAgentsRef.current || []);
    const filtered = rawRows.filter(r => allowedSet.has(r.agent_name) && (!filterAgent || r.agent_name === filterAgent));

    const fmtDur = (secs) => {
      if (!secs || secs <= 0) return '0s';
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = Math.floor(secs % 60);
      if (h > 0) return `${h}h ${m}m`;
      if (m > 0) return `${m}m ${s}s`;
      return `${s}s`;
    };

    // Collect all unique break reasons (excluding End of Shift)
    const breakReasons = new Set();
    for (const r of filtered) {
      const breaks = Array.isArray(r.away_breaks) ? r.away_breaks : [];
      for (const b of breaks) {
        if (b.reason && !b.reason.includes('End of Shift')) breakReasons.add(b.reason);
      }
    }
    const breakCols = Array.from(breakReasons).sort();

    // Build one row per (date, agent) with a column for each break reason
    const rows = filtered
      .map(r => {
        const row = {
          date: r.date,
          agent_name: displayName(r.assignee_name || r.agent_name),
          active_time: r.active_time || fmtDur(r.active_seconds)
        };
        const breaks = Array.isArray(r.away_breaks) ? r.away_breaks : [];
        const byReason = {};
        for (const b of breaks) {
          if (b.reason && !b.reason.includes('End of Shift')) byReason[b.reason] = b.seconds || 0;
        }
        for (const reason of breakCols) {
          row[reason] = byReason[reason] ? fmtDur(byReason[reason]) : '-';
        }
        return row;
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.agent_name.localeCompare(b.agent_name)));

    const cols = [
      { key: 'date', label: 'Date' },
      { key: 'agent_name', label: 'Agent Name' },
      { key: 'active_time', label: 'Active Time' },
      ...breakCols.map(reason => ({ key: reason, label: reason }))
    ];

    setDrillIn({ title, data: rows, columns: cols });
  };

  // ---- Raw-row drill-in: fetch conversation rows from SPO matching current filters ----
  // opts.mode:
  //   'all-metrics'        — Conv ID | Date | Wait Time | FRT | ART | FRT Hit% | ART Hit% | FRT Miss | ART Miss | AHT
  //   'agent-metric'       — Conv ID | Date | Agent | [selected metric]
  //   'agent-all-metrics'  — Conv ID | Date | Agent | Wait Time | FRT | ART | Hit/Miss | AHT
  //   'country-all-metrics'— Conv ID | Date | Country | all metrics
  // opts.filterReopened: true = reopened only, false = new only, undefined = both
  const openBarDrillIn = async (title, metricKey, metricLabel, opts = {}) => {
    setDrillIn({ title, data: [], columns: [], loading: true });
    try {
      const mode = opts.mode || (metricKey === 'conversations' ? 'all-metrics' : 'agent-metric');
      const { startDate, endDate } = getDateRange(dateRange);
      let agentsIntercom = null;
      const mapRef = agentNameMapRef.current || {};
      if (agentFilter && Array.isArray(agentFilter) && agentFilter.length > 0) {
        agentsIntercom = agentFilter.map(a => mapRef[a]).filter(Boolean);
      } else if (teamLeadFilter !== 'All') {
        const teamAgents = teamLeadAgentMapRef.current[teamLeadFilter] || [];
        agentsIntercom = teamAgents.map(a => mapRef[a]).filter(Boolean);
      } else if (chatAgentsRef.current.length > 0) {
        agentsIntercom = chatAgentsRef.current;
      }

      // Always select all metric columns so any mode can render
      const selectCols = [
        'conversation_id', 'created_at', 'conversation_date', 'updated_at', 'agent_name', 'assignee_name', 'country', 'team_id',
        'frt_seconds', 'art_seconds', 'aht_seconds', 'is_reopened',
        'Avg Wait Time', 'FRT Hit Rate', 'ART Hit Rate', 'art_miss_count', 'art_total', 'CX score'
      ];

      const dateCol = opts.useUpdatedAt ? 'updated_at' : 'created_at';

      const buildBaseQuery = () => {
        let q = supabase
          .from('Service Performance Overview')
          .select(selectCols.map(c => c.includes(' ') ? `"${c}"` : c).join(','))
          .gte(dateCol, startDate)
          .lte(dateCol, endDate)
          .neq('assignee_id', 'FIN')
          .not('conversation_id', 'is', null)
          .order(dateCol, { ascending: false });
        if (channelFilter && channelFilter !== 'All') q = q.eq('channel', channelFilter);
        if (opts.useUpdatedAt) q = q.not('updated_at', 'is', null);
        if (opts.whereAgent) q = q.eq('assignee_name', opts.whereAgent);
        else if (agentsIntercom && agentsIntercom.length > 0) q = q.in('assignee_name', agentsIntercom);
        if (opts.whereCountry) q = q.eq('country', opts.whereCountry);
        else if (countryFilter && countryFilter !== 'All') q = q.ilike('country', `%${countryFilter}%`);
        if (sentimentFilter && sentimentFilter !== 'All') q = q.ilike('sentiment', `%${sentimentFilter}%`);
        if (productFilter === 'CFD') q = q.ilike('team_id', '%(CFD)%');
        else if (productFilter === 'Futures') q = q.ilike('team_id', '%(FUT)%');
        if (opts.filterReopened === true) q = q.eq('is_reopened', true);
        else if (opts.filterReopened === false) q = q.eq('is_reopened', false);
        return q;
      };

      // Page through up to 50k rows (builds a fresh query each call to avoid Supabase mutation issues)
      const rawRows = [];
      const PAGE = 1000;
      const MAX_ROWS = 50000;
      for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
        const { data: chunk, error } = await buildBaseQuery().range(offset, offset + PAGE - 1);
        if (error) {
          console.error('Drill-in fetch error:', error);
          break;
        }
        if (!chunk || chunk.length === 0) break;
        rawRows.push(...chunk);
        if (chunk.length < PAGE) break;
      }

      let filtered = rawRows || [];
      if (regionFilter && regionFilter !== 'All') {
        filtered = filtered.filter(r => COUNTRY_TO_REGION[r.country] === regionFilter);
      }
      if (opts.whereRegion) {
        filtered = filtered.filter(r => (COUNTRY_TO_REGION[r.country] || 'Other') === opts.whereRegion);
      }
      // Convert timestamp to Dhaka wall-clock so client-side filters match the RPC's TO_CHAR labels (DB tz = Asia/Dhaka)
      const toDhaka = (ts) => {
        const d = new Date(ts);
        if (isNaN(d.getTime())) return null;
        return new Date(d.getTime() + 6 * 3600000); // shift to Dhaka wall-clock via UTC*
      };
      if (opts.whereDow != null || opts.whereHour != null) {
        const dateField = opts.useUpdatedAt ? 'updated_at' : 'created_at';
        filtered = filtered.filter(r => {
          if (!r[dateField]) return false;
          const dhaka = toDhaka(r[dateField]);
          if (!dhaka) return false;
          const dow = dhaka.getUTCDay();
          const hr = dhaka.getUTCHours();
          if (opts.whereDow != null && dow !== opts.whereDow) return false;
          if (opts.whereHour != null && hr !== opts.whereHour) return false;
          return true;
        });
      }
      if (opts.whereDate) {
        filtered = filtered.filter(r => {
          const dateField = opts.useUpdatedAt ? 'updated_at' : 'created_at';
          if (!r[dateField]) return false;
          const dhaka = toDhaka(r[dateField]);
          if (!dhaka) return false;
          const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const dowNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
          const mon = monthNames[dhaka.getUTCMonth()];
          const day = String(dhaka.getUTCDate()).padStart(2, '0');
          const hr = String(dhaka.getUTCHours()).padStart(2, '0');
          const dow = dowNames[dhaka.getUTCDay()];
          const year = dhaka.getUTCFullYear();
          const g = opts.granularity || 'daily';

          if (g === 'hourly') {
            // label: "Mon DD HH:00"
            return `${mon} ${day} ${hr}:00` === opts.whereDate;
          }
          if (g === 'hourly_avg') {
            // label: "HH:00" — match any day, same hour
            return `${hr}:00` === opts.whereDate;
          }
          if (g === 'daily_avg') {
            // label: "Mon" — match any date with that day-of-week
            return dow === opts.whereDate;
          }
          if (g === 'monthly') {
            // label: "Mon YYYY"
            return `${mon} ${year}` === opts.whereDate;
          }
          if (g === 'weekly') {
            // label: "Mon DD - Mon DD" — parse and check if dhaka falls in range (inclusive)
            const parts = String(opts.whereDate).split(' - ');
            if (parts.length !== 2) return false;
            const parseLbl = (s) => {
              const m = s.match(/^(\w{3})\s+(\d{1,2})$/);
              if (!m) return null;
              const mIdx = monthNames.indexOf(m[1]);
              if (mIdx < 0) return null;
              return { mon: mIdx, day: parseInt(m[2], 10) };
            };
            const a = parseLbl(parts[0]);
            const b = parseLbl(parts[1]);
            if (!a || !b) return false;
            // Assume same year (week doesn't normally straddle), fall back to dhaka year
            const y = year;
            const start = new Date(Date.UTC(y, a.mon, a.day));
            const end = new Date(Date.UTC(y, b.mon, b.day, 23, 59, 59));
            // Compare dhaka wall-clock as UTC
            const wc = new Date(Date.UTC(year, dhaka.getUTCMonth(), dhaka.getUTCDate(), dhaka.getUTCHours(), dhaka.getUTCMinutes(), dhaka.getUTCSeconds()));
            return wc >= start && wc <= end;
          }
          // daily (default): label "Mon DD"
          return `${mon} ${day}` === opts.whereDate;
        });
      }
      // Deduplicate by conversation_id if requested (Teammate Performance)
      if (opts.dedupeByConversation) {
        const seen = new Set();
        filtered = filtered.filter(r => {
          if (seen.has(r.conversation_id)) return false;
          seen.add(r.conversation_id);
          return true;
        });
      }

      const formatDT = (ts) => {
        if (!ts) return '-';
        const d = new Date(ts);
        if (isNaN(d.getTime())) return ts;
        // Convert to Dhaka wall-clock (+6h) before labelling +06 — otherwise the UTC time is shown
        // mislabelled as +06 (6h too early, so early-morning rows appear on the previous day).
        return new Date(d.getTime() + 6 * 3600000).toISOString().replace('T', ' ').slice(0, 19) + ' +06';
      };
      const hitMiss = (v) => v === 0 ? 'Hit' : v != null ? 'Miss' : '-';
      const displayDateKey = opts.useUpdatedAt ? 'updated_at' : 'created_at';
      const rows = filtered.map(r => {
        return {
          conversation_id: r.conversation_id,
          datetime: formatDT(r[displayDateKey]),
          conv_date: r.conversation_date ? formatDT(r.conversation_date) : '-',
          agent: displayName(r.assignee_name || r.agent_name || 'Unknown'),
          country: r.country || '-',
          wait_time: r['Avg Wait Time'] != null ? formatTime(r['Avg Wait Time']) : '-',
          frt: r.frt_seconds != null ? formatTime(r.frt_seconds) : '-',
          art: r.art_seconds != null ? formatTime(r.art_seconds) : '-',
          aht: r.aht_seconds != null ? formatTime(r.aht_seconds) : '-',
          frt_hit: hitMiss(r['FRT Hit Rate']),
          art_hit: hitMiss(r['ART Hit Rate']),
          // Real counts (from art_miss_count / art_total). FRT is one turn per conversation,
          // so its "miss count" is 0 or 1 (1 = first reply over the 30s target).
          frt_miss: r['FRT Hit Rate'] != null ? (r['FRT Hit Rate'] > 0 ? 1 : 0) : '-',
          art_miss: r.art_miss_count != null ? r.art_miss_count : '-',
          art_total: r.art_total != null ? r.art_total : '-',
          // single selected metric for agent-metric mode
          selected: (() => {
            switch (metricKey) {
              case 'FRT': return r.frt_seconds != null ? formatTime(r.frt_seconds) : '-';
              case 'ART': return r.art_seconds != null ? formatTime(r.art_seconds) : '-';
              case 'AHT': return r.aht_seconds != null ? formatTime(r.aht_seconds) : '-';
              case 'Wait Time': return r['Avg Wait Time'] != null ? formatTime(r['Avg Wait Time']) : '-';
              case 'FRT Hit Rate': return hitMiss(r['FRT Hit Rate']);
              case 'ART Hit Rate': return hitMiss(r['ART Hit Rate']);
              case 'FRT Miss Count': return r['FRT Hit Rate'] != null ? (r['FRT Hit Rate'] > 0 ? 1 : 0) : '-';
              case 'ART Miss Count': return r.art_miss_count != null ? r.art_miss_count : '-';
              case 'CSAT': return r['CX score'] != null ? r['CX score'] : '-';
              case 'conversations': return '';
              default: return '-';
            }
          })()
        };
      });

      // Conversation ID link formatter
      const idCol = { key: 'conversation_id', label: 'Conversation ID', format: (val) => val ? (
        <a
          href={`https://app.intercom.com/a/apps/aphmhtyj/inbox/inbox/conversation/${val}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#C084FC', textDecoration: 'none', fontWeight: 600 }}
          onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
          onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
        >{val}</a>
      ) : '-' };
      const dateColDef = { key: 'datetime', label: opts.useUpdatedAt ? 'Closed At' : 'FRT Date & Time' };
      const convDateColDef = { key: 'conv_date', label: 'Conversation Date' };

      const metricColsNoWait = [
        { key: 'frt', label: 'FRT' },
        { key: 'art', label: 'ART' },
        { key: 'frt_hit', label: 'FRT Hit' },
        { key: 'art_hit', label: 'ART Hit' },
        { key: 'frt_miss', label: 'FRT Miss' },
        { key: 'art_miss', label: 'ART Miss' },
        { key: 'aht', label: 'AHT' }
      ];
      const metricColsWithWait = [{ key: 'wait_time', label: 'Wait Time' }, ...metricColsNoWait];

      let cols;
      if (mode === 'all-metrics') {
        // Charts that include Wait Time (Knock Count TS, Volume HM, Queued HM)
        cols = [idCol, dateColDef, convDateColDef, ...metricColsWithWait];
      } else if (mode === 'all-metrics-no-wait') {
        // Scorecards Total/New/Reopened, Knock Count by Location
        cols = [idCol, dateColDef, convDateColDef, ...metricColsNoWait];
      } else if (mode === 'agent-all-metrics') {
        // Teammate Performance
        cols = [idCol, dateColDef, convDateColDef, { key: 'agent', label: 'Agent' }, ...metricColsNoWait];
      } else {
        // agent-metric (default) - single metric scorecards, Performance Trend
        cols = [idCol, dateColDef, convDateColDef, { key: 'agent', label: 'Agent' }, { key: 'selected', label: metricLabel || metricKey }];
      }

      setDrillIn({ title, data: rows, columns: cols });
    } catch (e) {
      console.error('Bar drill-in failed:', e);
      setDrillIn({ title, data: [], columns: [] });
    }
  };

  // Client-side filter teammate data when agents/team lead selected
  // Teammate data uses intercom names (assignee_name); agentFilter uses real names
  const filteredTeammateData = useMemo(() => {
    // Get intercom names for selected agents
    let intercomNames = null;
    if (agentFilter && agentFilter.length > 0) {
      intercomNames = new Set(agentFilter.map(a => agentNameMap[a]).filter(Boolean));
    } else if (teamLeadFilter !== 'All') {
      const teamAgents = teamLeadAgentMap[teamLeadFilter] || [];
      if (teamAgents.length > 0) {
        intercomNames = new Set(teamAgents.map(a => agentNameMap[a]).filter(Boolean));
      }
    }
    const base = (!intercomNames || intercomNames.size === 0) ? teammateData : teammateData.filter(tm => intercomNames.has(tm.name));
    return base.map(tm => ({ ...tm, displayName: displayName(tm.name) }));
  }, [teammateData, agentFilter, teamLeadFilter, teamLeadAgentMap, agentNameMap, intercomToAgent]);

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Drill-in hover CSS */}
      <style>{`.spo-drill-parent:hover .spo-drill-btn { opacity: 1 !important; }`}</style>

      {/* Filters Row */}
      <div className="filters-container">
        <DateRangePicker value={dateRange} onChange={setDateRange} mode="csat" compact />

        <PillDropdown
          compact
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>}
          label="All Regions"
          options={[{ value: 'All', label: 'All Regions' }, ...['Asia', 'Europe', 'North America', 'South America', 'Africa', 'Oceania'].map(r => ({ value: r, label: r }))]}
          value={regionFilter}
          onChange={setRegionFilter}
          searchable={false}
        />

        <PillDropdown
          compact
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>}
          label="All Countries"
          options={[{ value: 'All', label: 'All Countries' }, ...['India', 'United Kingdom', 'United States', 'UAE', 'Bangladesh', 'Nigeria', 'Pakistan'].map(c => ({ value: c, label: c }))]}
          value={countryFilter}
          onChange={setCountryFilter}
        />

        {/* Channel filter — Live Chat segment only (Chat/Instagram/Facebook) */}
        {activeSegment === 'Live Chat' && (
          <PillDropdown
            compact
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>}
            label="All Channels"
            options={[
              { value: 'All', label: 'All Channels' },
              { value: 'Chat', label: 'Chat' },
              { value: 'Instagram', label: 'Instagram' },
              { value: 'Facebook', label: 'Facebook' },
            ]}
            value={channelFilter}
            onChange={setChannelFilter}
            searchable={false}
          />
        )}

        {/* Product, Sentiment filters hidden */}

        {/* Team Lead filter — visible for Live Chat & Email */}
        {(activeSegment === 'Live Chat' || activeSegment === 'Email') && (
          <PillDropdown
            compact
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
            label="All Team Leads"
            options={[{ value: 'All', label: 'All Team Leads' }, ...teamLeadOptions.map(t => ({ value: t, label: t }))]}
            value={teamLeadFilter}
            onChange={setTeamLeadFilter}
          />
        )}

        <PillDropdown
          compact
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
          label="All Agents"
          options={agentOptions.map(a => ({ value: a, label: agentNameMap[a] ? `${a} (${agentNameMap[a]})` : a }))}
          value={agentFilter}
          onChange={setAgentFilter}
          multi
        />

        {/* GMT offset filter — Live Chat / Email only */}
        {(activeSegment === 'Live Chat' || activeSegment === 'Email') && (
          <PillDropdown
            compact
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
            label={`GMT${gmtOffset >= 0 ? '+' : ''}${gmtOffset}`}
            options={[-12,-11,-10,-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14].map(o => ({
              value: o,
              label: `GMT${o >= 0 ? '+' : ''}${o}`,
            }))}
            value={gmtOffset}
            onChange={(v) => setGmtOffset(Number(v))}
            searchable={false}
          />
        )}
      </div>

      {/* Segment Tabs */}
      <SegmentTabs activeSegment={activeSegment} onSegmentChange={setActiveSegment} />

      {/* Error Banner */}
      {loadError && !isLoading && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 38, 0.08) 100%)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '12px',
          padding: '1rem 1.5rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <span style={{ fontSize: '1.25rem' }}>⚠️</span>
          <div>
            <div style={{ color: '#FCA5A5', fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem' }}>
              Data Loading Error
            </div>
            <div style={{ color: '#FDA4AF', fontSize: '0.8125rem' }}>
              {loadError}
            </div>
          </div>
        </div>
      )}

      {/* No Data Banner - only show for Live Chat */}
      {activeSegment === 'Live Chat' && !hasRealData && !isLoading && !loadError && <NoDataBanner />}

      {/* ============ FIN SEGMENT ============ */}
      {activeSegment === 'FIN' && (
        <>
          {/* FIN Scorecards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
              <Scorecard title="Coverage Rate" value={finSummary.coverageRate != null ? `${finSummary.coverageRate}%` : '-'} subtitle="FIN handled / All conversations" isLoading={finLoading} />
              <DrillInBtn onClick={() => openDrillIn('FIN Coverage Rate', [{ metric: 'Coverage Rate', value: `${finSummary.coverageRate ?? '-'}%`, description: 'FIN handled / All conversations' }], [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }, { key: 'description', label: 'Description' }])} />
            </div>
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
              <Scorecard title="Resolution Rate" value={finSummary.resolutionRate != null ? `${finSummary.resolutionRate}%` : '-'} subtitle="Resolved / FIN involved" isLoading={finLoading} />
              <DrillInBtn onClick={() => openDrillIn('FIN Resolution Rate', finCountryInsights.map(c => ({ country: c.name, resolution_rate: `${c.resolution}%`, resolved: c.resolved })), [{ key: 'country', label: 'Country' }, { key: 'resolution_rate', label: 'Resolution Rate' }, { key: 'resolved', label: 'Resolved' }])} />
            </div>
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
              <Scorecard title="Resolved Conversations" value={finSummary.resolvedCount != null ? finSummary.resolvedCount.toLocaleString() : '-'} subtitle="Deflected by FIN" isLoading={finLoading} />
              <DrillInBtn onClick={() => openDrillIn('FIN Resolved Conversations', finResolvedTrend.map(d => ({ date: d.date, resolved: d.resolved, total: d.total })), [{ key: 'date', label: 'Date' }, { key: 'resolved', label: 'Resolved' }, { key: 'total', label: 'Total FIN' }])} />
            </div>
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
              <Scorecard title="Teammate Handover" value={finSummary.handoverCount != null ? finSummary.handoverCount.toLocaleString() : '-'} subtitle={finSummary.handoverRate != null ? `${finSummary.handoverRate}% of FIN involved` : 'Transferred to agents'} isLoading={finLoading} />
              <DrillInBtn onClick={() => openDrillIn('FIN Teammate Handover', [{ metric: 'Handover Count', value: finSummary.handoverCount ?? '-' }, { metric: 'Handover Rate', value: `${finSummary.handoverRate ?? '-'}%` }], [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }])} />
            </div>
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
              <Scorecard title="Accuracy Rate" value={finSummary.accuracyRate != null ? `${finSummary.accuracyRate}%` : '-'} subtitle="Correct responses" isLoading={finLoading} />
              <DrillInBtn onClick={() => openDrillIn('FIN Accuracy Rate', [{ metric: 'Accuracy Rate', value: `${finSummary.accuracyRate ?? '-'}%`, note: 'Estimated' }], [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }, { key: 'note', label: 'Note' }])} />
            </div>
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
              <Scorecard title="Payable Amount" value={finSummary.payableAmount != null ? `$${finSummary.payableAmount.toLocaleString()}` : '-'} subtitle="Resolved x $0.7" isLoading={finLoading} />
              <DrillInBtn onClick={() => openDrillIn('FIN Payable Amount', [{ metric: 'Payable Amount', value: `$${finSummary.payableAmount ?? '-'}`, resolved: finSummary.resolvedCount ?? '-', rate: '$0.70/resolution' }], [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }, { key: 'resolved', label: 'Resolved Count' }, { key: 'rate', label: 'Rate' }])} />
            </div>
{/* CX Score hidden */}
          </div>

          {/* FIN Charts Row 1: Involvement Rate Pie & Resolved Trend */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
              <ChartCard title="FIN Resolution Split" isLoading={finLoading}>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={finInvolvementData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                      label={({ name, value }) => `${value}%`}
                    >
                      {finInvolvementData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#1C2128', border: '1px solid #30363D', borderRadius: '8px', color: '#F0F6FC' }}
                      formatter={(value) => `${value}%`}
                    />
                    <Legend
                      verticalAlign="bottom"
                      formatter={(value) => <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
              <DrillInBtn onClick={() => openDrillIn('FIN Resolution Split', finInvolvementData.map(d => ({ category: d.name, percentage: `${d.value}%` })), [{ key: 'category', label: 'Category' }, { key: 'percentage', label: 'Percentage' }])} />
            </div>

            <div className="spo-drill-parent" style={{ position: 'relative' }}>
            <ChartCard title="Resolved Conversations Trend" isLoading={finLoading}>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={finResolvedTrend}>
                  <defs>
                    <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                  <YAxis tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                  <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: '#1C2128', border: '1px solid #30363D', borderRadius: '8px' }} labelStyle={{ color: '#F0F6FC', fontWeight: 700 }} itemStyle={{ color: '#F0F6FC' }} />
                  <Legend formatter={(value) => <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>{value}</span>} />
                  <Area type="monotone" dataKey="resolved" stroke="#8B5CF6" fill="url(#colorResolved)" strokeWidth={2} name="Resolved by FIN" />
                  <Line type="monotone" dataKey="total" stroke="#C084FC" strokeWidth={2} dot={false} name="Total FIN Involved" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
              <DrillInBtn onClick={() => openDrillIn('FIN Resolved Conversations Trend', finResolvedTrend, [{ key: 'date', label: 'Date' }, { key: 'resolved', label: 'Resolved' }, { key: 'total', label: 'Total FIN' }])} />
            </div>
          </div>

          {/* FIN Charts Row 2: Country Insights (Resentment Topics hidden for now) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            {/* Hidden for now - will work on later
            <ChartCard title="Resentment Topics (Ranked)" isLoading={isLoading}>
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={finResentmentTopics} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis type="number" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: '#94A3B8', fontSize: 10 }}
                    width={130}
                    axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                  />
                  <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: '#1C2128', border: '1px solid #30363D', borderRadius: '8px' }} labelStyle={{ color: '#F0F6FC', fontWeight: 700 }} itemStyle={{ color: '#F0F6FC' }} />
                  <Bar dataKey="count" fill="#EF4444" radius={[0, 4, 4, 0]} name="Resentment Count" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            */}

            <div className="spo-drill-parent" style={{ position: 'relative' }}>
            <ChartCard
              title="Countrywise Insights"
              dropdown={finCountryDropdown}
              dropdownValue={finCountryMetric}
              onDropdownChange={setFinCountryMetric}
              isLoading={finLoading}
            >
              {(() => {
                const sortedData = [...finCountryInsights].sort((a, b) => (b[finCountryMetric] || 0) - (a[finCountryMetric] || 0));
                const maxVal = Math.max(...sortedData.map(d => d[finCountryMetric] || 0), 1);
                const tickInterval = maxVal <= 5 ? 1 : maxVal <= 10 ? 2 : maxVal <= 20 ? 4 : 5;
                const explicitMax = Math.ceil(maxVal / tickInterval) * tickInterval;
                const ticks = Array.from({ length: Math.floor(explicitMax / tickInterval) + 1 }, (_, i) => i * tickInterval);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '380px', width: '100%' }}>
                    <div style={{ height: 'calc(100% - 64px)', overflowY: 'auto', overflowX: 'hidden', paddingRight: 2 }}>
                      <div style={{ height: Math.max(sortedData.length * 40, 340), width: '100%', minHeight: '320px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={sortedData} layout="vertical" margin={{ top: 5, right: 50, left: 10, bottom: 0 }} barCategoryGap="20%">
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(139, 148, 158, 0.1)" horizontal={false} />
                            <XAxis type="number" hide domain={[0, explicitMax]} ticks={ticks} />
                            <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10, fill: '#C9D1D9' }} interval={0} stroke="#30363D" tickLine={false} axisLine={false} />
                            <Tooltip cursor={{ fill: 'transparent' }} content={({ active, payload }) => {
                              if (!active || !payload || !payload.length) return null;
                              const d = payload[0].payload;
                              const val = d[finCountryMetric];
                              return (
                                <div style={{ background: '#1C2128', border: '1px solid #30363D', borderRadius: '8px', padding: '10px 14px', color: '#F0F6FC' }}>
                                  <div style={{ fontWeight: 600, marginBottom: 4, color: '#8B949E', fontSize: '0.75rem', textTransform: 'uppercase' }}>{d.name}</div>
                                  <div style={{ color: '#C084FC', fontWeight: 700, fontSize: '1rem' }}>{finCountryMetric === 'resolved' ? val : `${val}%`}</div>
                                </div>
                              );
                            }} />
                            <Bar dataKey={finCountryMetric} radius={[0, 4, 4, 0]} barSize={22} name={finCountryDropdown.find(d => d.value === finCountryMetric)?.label || finCountryMetric}>
                              {sortedData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                              ))}
                              <LabelList dataKey={finCountryMetric} position="right" fill="#E5E7EB" fontSize={11} formatter={(value) => finCountryMetric === 'resolved' ? value : `${value}%`} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div style={{ height: '64px', flexShrink: 0, background: 'transparent' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={sortedData} layout="vertical" margin={{ top: 8, right: 50, left: 10, bottom: 24 }} barCategoryGap="20%">
                          <XAxis type="number" domain={[0, explicitMax]} ticks={ticks} stroke="#30363D" tick={{ fill: '#8B949E', fontSize: 10 }} axisLine={{ stroke: '#30363D' }} tickLine={{ stroke: '#30363D' }} tickFormatter={(value) => finCountryMetric === 'resolved' ? value : `${value}%`} />
                          <YAxis type="category" dataKey="name" width={160} tick={false} axisLine={false} tickLine={false} />
                          <Bar dataKey={finCountryMetric} fill="transparent" barSize={0} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })()}
            </ChartCard>
              <DrillInBtn onClick={() => openDrillIn('FIN Countrywise Insights', finCountryInsights.map(c => ({ country: c.name, resolved: c.resolved, coverage: `${c.coverage}%`, involvement: `${c.involvement}%`, resolution: `${c.resolution}%` })), [{ key: 'country', label: 'Country' }, { key: 'resolved', label: 'Resolved' }, { key: 'coverage', label: 'Coverage %' }, { key: 'involvement', label: 'Involvement %' }, { key: 'resolution', label: 'Resolution %' }])} />
            </div>
          </div>
        </>
      )}

      {/* ============ LIVE CHAT SEGMENT ============ */}
      {activeSegment === 'Live Chat' && (
        <>
          {/* Scorecards Grid */}
      {(() => {
        const tTotal = computeTrend(summary.total_knock_count, prevSummary.total_knock_count);
        const tNew = computeTrend(summary.new_conversations, prevSummary.new_conversations);
        const tReopen = computeTrend(summary.reopened_conversations, prevSummary.reopened_conversations);
        const tFrt = computeTrend(summary.avg_frt_seconds, prevSummary.avg_frt_seconds, { isLowerBetter: true });
        const tArt = computeTrend(summary.avg_art_seconds, prevSummary.avg_art_seconds, { isLowerBetter: true });
        const tAht = computeTrend(summary.avg_aht_seconds, prevSummary.avg_aht_seconds, { isLowerBetter: true });
        const tFrtHit = computeTrend(summary.frt_hit_rate, prevSummary.frt_hit_rate);
        const tArtHit = computeTrend(summary.art_hit_rate, prevSummary.art_hit_rate);
        return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        <div className="spo-drill-parent" style={{ position: 'relative' }}>
          <Scorecard title="Total Knock Count" value={summary.total_knock_count?.toLocaleString() || '-'} subtitle="New + Reopened" isLoading={isLoading} trend={tTotal.trend} trendValue={tTotal.trendValue} />
          <DrillInBtn onClick={() => openBarDrillIn('Total Knock Count', 'conversations', 'Conversations', { mode: 'all-metrics-no-wait' })} />
        </div>
        <div className="spo-drill-parent" style={{ position: 'relative' }}>
          <Scorecard title="New Conversations" value={summary.new_conversations?.toLocaleString() || '-'} isLoading={isLoading} trend={tNew.trend} trendValue={tNew.trendValue} />
          <DrillInBtn onClick={() => openBarDrillIn('New Conversations', 'conversations', 'Conversations', { mode: 'all-metrics-no-wait', filterReopened: false })} />
        </div>
        <div className="spo-drill-parent" style={{ position: 'relative' }}>
          <Scorecard title="Reopened Conversations" value={summary.reopened_conversations?.toLocaleString() || '-'} isLoading={isLoading} trend={tReopen.trend} trendValue={tReopen.trendValue} />
          <DrillInBtn onClick={() => openBarDrillIn('Reopened Conversations', 'conversations', 'Conversations', { mode: 'all-metrics-no-wait', filterReopened: true })} />
        </div>
        <div className="spo-drill-parent" style={{ position: 'relative' }}>
          <Scorecard title="First Response Time" value={formatTime(summary.avg_frt_seconds)} subtitle="Avg FRT" isLoading={isLoading} trend={tFrt.trend} trendValue={tFrt.trendValue} />
          <DrillInBtn onClick={() => openBarDrillIn('First Response Time', 'FRT', 'FRT')} />
        </div>
        <div className="spo-drill-parent" style={{ position: 'relative' }}>
          <Scorecard title="Avg Response Time" value={formatTime(summary.avg_art_seconds)} subtitle="ART" isLoading={isLoading} trend={tArt.trend} trendValue={tArt.trendValue} />
          <DrillInBtn onClick={() => openBarDrillIn('Avg Response Time', 'ART', 'ART')} />
        </div>
        <div className="spo-drill-parent" style={{ position: 'relative' }}>
          <Scorecard title="Avg Handle Time" value={formatTime(summary.avg_aht_seconds)} subtitle="AHT" isLoading={isLoading} trend={tAht.trend} trendValue={tAht.trendValue} />
          <DrillInBtn onClick={() => openBarDrillIn('Avg Handle Time', 'AHT', 'AHT')} />
        </div>
        <div className="spo-drill-parent" style={{ position: 'relative' }}>
          <Scorecard title="FRT Hit Rate" value={summary.frt_hit_rate ? `${summary.frt_hit_rate}%` : '-'} isLoading={isLoading} trend={tFrtHit.trend} trendValue={tFrtHit.trendValue} />
          <DrillInBtn onClick={() => openBarDrillIn('FRT Hit Rate', 'FRT Hit Rate', 'FRT Hit Rate')} />
        </div>
        <div className="spo-drill-parent" style={{ position: 'relative' }}>
          <Scorecard title="ART Hit Rate" value={summary.art_hit_rate ? `${summary.art_hit_rate}%` : '-'} isLoading={isLoading} trend={tArtHit.trend} trendValue={tArtHit.trendValue} />
          <DrillInBtn onClick={() => openBarDrillIn('ART Hit Rate', 'ART Hit Rate', 'ART Hit Rate')} />
        </div>
        <div className="spo-drill-parent" style={{ position: 'relative' }}>
          <Scorecard
            title="FRT Miss Count"
            value={(filteredTeammateData || []).reduce((s, t) => s + (t['FRT Miss Count'] || 0), 0).toLocaleString()}
            subtitle="Misses"
            isLoading={isLoading}
          />
          <DrillInBtn onClick={() => openBarDrillIn('FRT Miss Count', 'FRT Miss Count', 'FRT Miss Count')} />
        </div>
        <div className="spo-drill-parent" style={{ position: 'relative' }}>
          <Scorecard
            title="ART Miss Count"
            value={(filteredTeammateData || []).reduce((s, t) => s + (t['ART Miss Count'] || 0), 0).toLocaleString()}
            subtitle="Misses"
            isLoading={isLoading}
          />
          <DrillInBtn onClick={() => openBarDrillIn('ART Miss Count', 'ART Miss Count', 'ART Miss Count')} />
        </div>
      </div>
        );
      })()}

      {/* Knock Count Timeseries */}
      <div className="spo-drill-parent" style={{ position: 'relative' }}>
        <ChartCard title="Knock Count Timeseries" style={{ marginBottom: '1.5rem' }} isLoading={isLoading}>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={knockCountData}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#C084FC" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#C084FC" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
              <YAxis tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
              <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: '#1C2128', border: '1px solid #30363D', borderRadius: '8px' }} labelStyle={{ color: '#F0F6FC', fontWeight: 700 }} itemStyle={{ color: '#F0F6FC' }} />
              <Legend formatter={(value) => <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>{value}</span>} />
              <Area type="monotone" dataKey="total" stroke="#C084FC" fill="url(#colorTotal)" strokeWidth={2} name="Total" activeDot={{ r: 6, style: { cursor: 'pointer' }, onClick: (_, payload) => { const date = payload?.payload?.date; if (date) openBarDrillIn(`Total Knock Count — ${date}`, 'conversations', 'Conversations', { mode: 'all-metrics', whereDate: date }); } }} />
              <Line type="monotone" dataKey="new" stroke="#10B981" strokeWidth={2} dot={{ r: 3, style: { cursor: 'pointer' } }} activeDot={{ r: 5, style: { cursor: 'pointer' }, onClick: (_, payload) => { const date = payload?.payload?.date; if (date) openBarDrillIn(`New Conversations — ${date}`, 'conversations', 'Conversations', { mode: 'all-metrics', filterReopened: false, whereDate: date }); } }} name="New" />
              <Line type="monotone" dataKey="reopened" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3, style: { cursor: 'pointer' } }} activeDot={{ r: 5, style: { cursor: 'pointer' }, onClick: (_, payload) => { const date = payload?.payload?.date; if (date) openBarDrillIn(`Reopened Conversations — ${date}`, 'conversations', 'Conversations', { mode: 'all-metrics', filterReopened: true, whereDate: date }); } }} name="Reopened" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <DrillInBtn onClick={() => openBarDrillIn('Knock Count Timeseries', 'conversations', 'Conversations', { mode: 'all-metrics' })} />
      </div>

      {/* Volume Heatmap */}
      <div className="spo-drill-parent" style={{ position: 'relative' }}>
        <ChartCard title="Volume Heatmap (Day & Hour)" style={{ marginBottom: '1.5rem' }} isLoading={isLoading}>
          <Heatmap data={heatmapData} onCellClick={(cell) => openBarDrillIn(`Volume Heatmap — ${cell.day} ${cell.hour}:00`, 'conversations', 'Conversations', { mode: 'all-metrics', whereDow: cell.dayIdx, whereHour: cell.hour })} />
        </ChartCard>
        <DrillInBtn onClick={() => openBarDrillIn('Volume Heatmap', 'conversations', 'Conversations', { mode: 'all-metrics' })} />
      </div>

      {/* Conversation Closed Heatmap */}
      <div className="spo-drill-parent" style={{ position: 'relative' }}>
        <ChartCard title="Conversation Closed Heatmap (Day & Hour)" style={{ marginBottom: '1.5rem' }} isLoading={isLoading}>
          <Heatmap data={closedHeatmapData} onCellClick={(cell) => openBarDrillIn(`Closed Heatmap — ${cell.day} ${cell.hour}:00`, 'conversations', 'Conversations', { mode: 'all-metrics', useUpdatedAt: true, whereDow: cell.dayIdx, whereHour: cell.hour })} />
        </ChartCard>
        <DrillInBtn onClick={() => openBarDrillIn('Conversation Closed Heatmap', 'conversations', 'Conversations', { mode: 'all-metrics', useUpdatedAt: true })} />
      </div>

      {/* Queued Clients Heatmap */}
      <div className="spo-drill-parent" style={{ position: 'relative' }}>
        <ChartCard title="Queued Clients Heatmap" style={{ marginBottom: '1.5rem' }} isLoading={isLoading}>
          <Heatmap data={heatmapData.map(d => ({ ...d, value: Math.floor(d.value * 0.3) }))} onCellClick={(cell) => openBarDrillIn(`Queued Clients Heatmap — ${cell.day} ${cell.hour}:00`, 'conversations', 'Conversations', { mode: 'all-metrics', whereDow: cell.dayIdx, whereHour: cell.hour })} />
        </ChartCard>
        <DrillInBtn onClick={() => openBarDrillIn('Queued Clients Heatmap', 'conversations', 'Conversations', { mode: 'all-metrics' })} />
      </div>

      {/* Country */}
      <div className="spo-drill-parent" style={{ position: 'relative' }}>
        <ChartCard title="Knock Count by Location" dropdown={[{ value: 'country', label: 'By Country' }, { value: 'region', label: 'By Region' }]} dropdownValue={countryView} onDropdownChange={setCountryView} isLoading={isLoading} style={{ marginBottom: '1.5rem' }}>
          {(() => {
            let displayData = countryData || [];
            if (countryView === 'region') {
              const byRegion = {};
              for (const c of displayData) {
                const region = COUNTRY_TO_REGION[c.name] || 'Other';
                if (!byRegion[region]) byRegion[region] = { name: region, knockCount: 0 };
                byRegion[region].knockCount += (c.knockCount || 0);
              }
              displayData = Object.values(byRegion).sort((a, b) => (b.knockCount || 0) - (a.knockCount || 0));
            }
            const maxVal = Math.max(...displayData.map(d => d.knockCount || 0), 1);
            const tickInterval = maxVal <= 5 ? 1 : maxVal <= 10 ? 2 : maxVal <= 20 ? 4 : 5;
            const explicitMax = Math.ceil(maxVal / tickInterval) * tickInterval;
            const ticks = Array.from({ length: Math.floor(explicitMax / tickInterval) + 1 }, (_, i) => i * tickInterval);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', height: '350px', width: '100%' }}>
                <div style={{ height: 'calc(100% - 64px)', overflowY: 'auto', overflowX: 'hidden', paddingRight: 2 }}>
                  <div style={{ height: Math.max(displayData.length * 40, 280), width: '100%', minHeight: '280px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={displayData} layout="vertical" margin={{ top: 5, right: 50, left: 10, bottom: 0 }} barCategoryGap="20%">
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(139, 148, 158, 0.1)" horizontal={false} />
                        <XAxis type="number" hide domain={[0, explicitMax]} ticks={ticks} />
                        <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10, fill: '#C9D1D9' }} interval={0} stroke="#30363D" tickLine={false} axisLine={false} />
                        <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: '#1C2128', border: '1px solid #30363D', borderRadius: '8px' }} labelStyle={{ color: '#F0F6FC', fontWeight: 700 }} itemStyle={{ color: '#F0F6FC' }} />
                        <Bar dataKey="knockCount" radius={[0, 4, 4, 0]} barSize={22} name="Knock Count" style={{ cursor: 'pointer' }} onClick={(payload) => { const n = payload?.name; if (!n) return; if (countryView === 'region') { openBarDrillIn(`Knock Count — ${n} (region)`, 'conversations', 'Conversations', { mode: 'all-metrics-no-wait', whereRegion: n }); } else { openBarDrillIn(`Knock Count — ${n}`, 'conversations', 'Conversations', { mode: 'all-metrics-no-wait', whereCountry: n }); } }}>
                          {displayData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                          ))}
                          <LabelList dataKey="knockCount" position="right" fill="#E5E7EB" fontSize={11} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div style={{ height: '64px', flexShrink: 0, background: 'transparent' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={displayData} layout="vertical" margin={{ top: 8, right: 50, left: 10, bottom: 24 }} barCategoryGap="20%">
                      <XAxis type="number" domain={[0, explicitMax]} ticks={ticks} stroke="#30363D" tick={{ fill: '#8B949E', fontSize: 10 }} axisLine={{ stroke: '#30363D' }} tickLine={{ stroke: '#30363D' }} />
                      <YAxis type="category" dataKey="name" width={160} tick={false} axisLine={false} tickLine={false} />
                      <Bar dataKey="knockCount" fill="transparent" barSize={0} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })()}
        </ChartCard>
          <DrillInBtn onClick={() => openBarDrillIn('Knock Count by Location', 'conversations', 'Conversations', { mode: 'all-metrics-no-wait' })} />
      </div>

      {/* Agent Performance Overview header */}
      <h2 style={{ color: '#F8FAFC', fontSize: '1.25rem', fontWeight: '700', margin: '2rem 0 1rem 0', textAlign: 'center' }}>
        Agent Performance Overview
      </h2>

      {/* Performance Metric Timeseries */}
      <div className="spo-drill-parent" style={{ position: 'relative' }}>
        <ChartCard
          title="Performance Trend"
          dropdown={performanceDropdown}
          dropdownValue={performanceMetric}
          onDropdownChange={setPerformanceMetric}
          dropdown2={timeseriesModes}
          dropdownValue2={timeseriesMode}
          onDropdownChange2={setTimeseriesMode}
          style={{ marginBottom: '1.5rem' }}
          isLoading={isLoading}
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
              <YAxis tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
              <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: '#1C2128', border: '1px solid #30363D', borderRadius: '8px' }} labelStyle={{ color: '#F0F6FC', fontWeight: 700 }} itemStyle={{ color: '#F0F6FC' }} />
              {goalLines[performanceMetric] != null && <ReferenceLine y={goalLines[performanceMetric]} stroke="#EF4444" strokeDasharray="5 5" label={{ value: 'Goal', position: 'right', fill: '#EF4444', fontSize: 11 }} />}
              <Line type="monotone" dataKey={performanceMetric} stroke="#C084FC" strokeWidth={2} dot={{ fill: '#C084FC', r: 3, style: { cursor: 'pointer' } }} activeDot={{ r: 6, style: { cursor: 'pointer' }, onClick: (_, payload) => { const date = payload?.payload?.date; if (!date) return; const label = performanceDropdown.find(d => d.value === performanceMetric)?.label || performanceMetric; const ptMode = performanceMetric === 'conversations' ? 'agent-all-metrics' : 'agent-metric'; openBarDrillIn(`Performance Trend — ${date} (${label})`, performanceMetric, label, { whereDate: date, granularity: timeseriesMode, mode: ptMode }); } }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <DrillInBtn onClick={() => { const label = performanceDropdown.find(d => d.value === performanceMetric)?.label || performanceMetric; const ptMode = performanceMetric === 'conversations' ? 'agent-all-metrics' : 'agent-metric'; openBarDrillIn(`Performance Trend — ${label}`, performanceMetric, label, { mode: ptMode }); }} />
      </div>

      {/* Teammate Performance (full width) */}
      <div className="spo-drill-parent" style={{ position: 'relative' }}>
        <ChartCard title="Teammate Performance" dropdown={teammateDropdown} dropdownValue={teammateMetric} onDropdownChange={setTeammateMetric} isLoading={isLoading} style={{ marginBottom: '1.5rem' }}>
          {(() => {
            const isAHT = teammateMetric === 'AHT'; // Avg Handle Time is displayed in minutes
            const chartValOf = (tm) => isAHT ? Math.round((tm.AHT || 0) / 60) : (tm[teammateMetric] || 0);
            const chartData = [...filteredTeammateData].filter(tm => tm.name && tm.name !== 'Unknown').map(tm => ({ ...tm, __chartVal: chartValOf(tm) })).sort((a, b) => (b.__chartVal || 0) - (a.__chartVal || 0));
            const maxVal = Math.max(...chartData.map(d => d.__chartVal || 0), 1);
            const tickInterval = maxVal <= 5 ? 1 : maxVal <= 10 ? 2 : maxVal <= 20 ? 4 : 5;
            const explicitMax = Math.ceil(maxVal / tickInterval) * tickInterval;
            const ticks = Array.from({ length: Math.floor(explicitMax / tickInterval) + 1 }, (_, i) => i * tickInterval);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', height: '400px', width: '100%' }}>
                <div style={{ height: 'calc(100% - 64px)', overflowY: 'auto', overflowX: 'hidden', paddingRight: 2 }}>
                  <div style={{ height: Math.max(chartData.length * 40, 340), width: '100%', minHeight: '320px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 50, left: 10, bottom: 0 }} barCategoryGap="20%">
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(139, 148, 158, 0.1)" horizontal={false} />
                        <XAxis type="number" hide domain={[0, explicitMax]} ticks={ticks} />
                        <YAxis type="category" dataKey="displayName" width={220} tick={{ fontSize: 9, fill: '#C9D1D9' }} interval={0} stroke="#30363D" tickLine={false} axisLine={false} />
                        <Tooltip cursor={{ fill: 'transparent' }} content={({ active, payload }) => {
                          if (!active || !payload || !payload.length) return null;
                          const d = payload[0].payload;
                          const val = d[teammateMetric];
                          const formatted = isAHT ? `${d.__chartVal} min` : teammateMetric === 'conversations' ? `${val} conversations` : teammateMetric.includes('Miss Count') ? `${val} misses` : teammateMetric === 'CSAT' ? val : teammateMetric.includes('Hit Rate') ? `${val}%` : typeof val === 'number' && val > 60 ? `${Math.floor(val/60)}m ${val%60}s` : val;
                          return (
                            <div style={{ background: '#1C2128', border: '1px solid #30363D', borderRadius: '8px', padding: '10px 14px', color: '#F0F6FC' }}>
                              <div style={{ fontWeight: 600, marginBottom: 4, color: '#94A3B8', fontSize: '0.8rem' }}>{d.displayName}</div>
                              <div style={{ color: '#A78BFA', fontWeight: 700 }}>{formatted}</div>
                            </div>
                          );
                        }} />
                        <ReferenceLine x={isAHT ? 22 : goalLines[teammateMetric]} stroke="#EF4444" strokeDasharray="5 5" />
                        <Bar dataKey="__chartVal" radius={[0, 4, 4, 0]} barSize={22} style={{ cursor: 'pointer' }} onClick={(payload) => { const intercomName = payload?.name; openBarDrillIn(`Teammate Performance — ${payload?.displayName || intercomName}`, 'conversations', 'Conversations', { mode: 'agent-all-metrics', whereAgent: intercomName, dedupeByConversation: true }); }}>
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                          ))}
                          <LabelList dataKey="__chartVal" position="right" fill="#E5E7EB" fontSize={11} formatter={isAHT ? (v) => `${v}m` : undefined} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div style={{ height: '64px', flexShrink: 0, background: 'transparent' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 50, left: 10, bottom: 24 }} barCategoryGap="20%">
                      <XAxis type="number" domain={[0, explicitMax]} ticks={ticks} stroke="#30363D" tick={{ fill: '#8B949E', fontSize: 10 }} axisLine={{ stroke: '#30363D' }} tickLine={{ stroke: '#30363D' }} />
                      <YAxis type="category" dataKey="displayName" width={220} tick={false} axisLine={false} tickLine={false} />
                      <Bar dataKey="__chartVal" fill="transparent" barSize={0} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })()}
        </ChartCard>
          <DrillInBtn onClick={() => openBarDrillIn('Teammate Performance', 'conversations', 'Conversations', { mode: 'agent-all-metrics', dedupeByConversation: true })} />
      </div>

      {/* Agent Activity Hours — table layout (click row for pivoted daily breakdown) */}
      <div className="spo-drill-parent" style={{ position: 'relative' }}>
      <ChartCard title="Agent Activity Hours" isLoading={activityLoading} style={{ marginBottom: '1.5rem' }}>
        {activityError ? (
          <div style={{ color: '#FCA5A5', fontSize: '0.85rem', padding: '1rem' }}>{activityError}</div>
        ) : activityData && activityData.agents?.length > 0 ? (
          (() => {
            // Chat-only agents (channel === 'chat' in agent_name_mapping)
            const chatAgentIntercomNames = new Set(chatAgentsRef.current || []);
            const fmtDur = (secs) => { if (!secs || secs <= 0) return '0s'; const h = Math.floor(secs / 3600); const m = Math.floor((secs % 3600) / 60); const s = Math.floor(secs % 60); if (h > 0) return `${h}h ${m}m`; if (m > 0) return `${m}m ${s}s`; return `${s}s`; };
            const daysInRange = activityData.days_in_range || 1;
            const filteredAgents = activityData.agents
              .filter(a => chatAgentIntercomNames.has(a.agent_name))
              .map(a => {
                const breaks = (a.away_breaks || [])
                  .filter(b => b.reason && !b.reason.includes('End of Shift'))
                  .map(b => ({ reason: b.reason, duration: fmtDur(Math.round((b.seconds || 0) / daysInRange)), seconds: b.seconds }));
                return { ...a, displayName: displayName(a.agent_name), away_breaks: breaks };
              })
              .sort((a, b) => (b.avg_active_seconds_per_day || 0) - (a.avg_active_seconds_per_day || 0));
            const totalActiveSeconds = filteredAgents.reduce((s, a) => s + (a.active_seconds || 0), 0);
            const avgActive = filteredAgents.length > 0 ? fmtDur(Math.round(totalActiveSeconds / filteredAgents.length / daysInRange)) : '-';
            return (
              <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ color: '#94A3B8', fontSize: '0.75rem' }}>
                    {filteredAgents.length} agent(s) &middot; {activityData.total_logs} events
                    {daysInRange > 1 && ` \u00B7 ${daysInRange} days \u00B7 showing avg/day`}
                  </span>
                  <span style={{ color: '#10B981', fontSize: '0.75rem', fontWeight: 600 }}>
                    Avg Active: {avgActive}
                  </span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94A3B8', fontWeight: 600, whiteSpace: 'nowrap' }}>#</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94A3B8', fontWeight: 600, whiteSpace: 'nowrap' }}>Agent</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94A3B8', fontWeight: 600, whiteSpace: 'nowrap' }}>Active Time</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94A3B8', fontWeight: 600, whiteSpace: 'nowrap' }}>Away Breaks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAgents.map((a, i) => (
                      <tr
                        key={a.agent_id}
                        onClick={() => openActivityDrillIn(`Activity — ${a.displayName}`, a.agent_name)}
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(56,189,248,0.06)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '8px 10px', color: '#64748B' }}>{i + 1}</td>
                        <td style={{ padding: '8px 10px', color: '#F8FAFC', fontWeight: 600, whiteSpace: 'nowrap' }}>{a.displayName}</td>
                        <td style={{ padding: '8px 10px', color: '#10B981', fontWeight: 600 }}>{daysInRange > 1 ? a.avg_active_per_day || a.active_time : a.active_time}</td>
                        <td style={{ padding: '8px 10px', color: '#94A3B8', fontSize: '0.75rem' }}>
                          {a.away_breaks.length > 0
                            ? a.away_breaks.map((b, j) => <div key={j}>{b.reason}: {b.duration}</div>)
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()
        ) : !activityLoading ? (
          <div style={{ color: '#64748B', textAlign: 'center', padding: '2rem' }}>
            No activity data for this period
          </div>
        ) : null}
      </ChartCard>
        <DrillInBtn onClick={() => openActivityDrillIn('Intercom Active Hour — Daily Breakdown')} />
      </div>
        </>
      )}

      {/* ============ EMAIL SEGMENT ============ */}
      {activeSegment === 'Email' && (
        <>
          {/* Scorecards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
              <Scorecard title="EHQ" value={emailData?.ehqAvg != null ? emailData.ehqAvg : '-'} subtitle="Emails / Agent / Hour" isLoading={emailLoading} />
              <DrillInBtn onClick={() => openEmailRawDrillIn('EHQ — Hourly Buckets', { level: 'ehq' })} />
            </div>
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
              <Scorecard title="Total Emails" value={emailData?.totalEmails?.toLocaleString() || '-'} subtitle="All email replies" isLoading={emailLoading} />
              <DrillInBtn onClick={() => openEmailRawDrillIn('Total Emails — Email Replies')} />
            </div>
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
              <Scorecard title="Total Email Threads" value={emailData?.totalThreads?.toLocaleString() || '-'} subtitle="Unique conversations" isLoading={emailLoading} />
              <DrillInBtn onClick={() => openEmailRawDrillIn('Email Threads — Per Conversation', { level: 'thread' })} />
            </div>
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
              <Scorecard title="Legal Notice Emails" value={emailData?.legalNoticeCount?.toLocaleString() || '0'} subtitle="Thread count" isLoading={emailLoading} />
              <DrillInBtn onClick={() => openLegalNoticeDrillIn('Legal Notice Emails — Threads')} />
            </div>
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
              <Scorecard title="Avg Response Time" value={emailData?.avgArt != null ? formatTime(emailData.avgArt) : '-'} subtitle="ART (target: 1hr)" isLoading={emailLoading} />
              <DrillInBtn onClick={() => openEmailRawDrillIn('Avg Response Time — Email Replies', { filter: r => r.art_seconds != null && r.art_seconds > 0 })} />
            </div>
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
              <Scorecard title="Avg Handle Time" value={emailData?.avgAht != null ? formatTime(emailData.avgAht) : '-'} subtitle="AHT" isLoading={emailLoading} />
              <DrillInBtn onClick={() => openEmailRawDrillIn('Avg Handle Time — Email Replies', { filter: r => r.aht_seconds != null && r.aht_seconds > 0 })} />
            </div>
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
              <Scorecard title="SLA Hit Rate" value={emailData?.slaHitRate != null ? `${emailData.slaHitRate}%` : '-'} subtitle="ART <= 1hr" isLoading={emailLoading} />
              <DrillInBtn onClick={() => openEmailRawDrillIn('SLA Hit Rate — Email Replies (ART ≤ 1h)', { filter: r => r.art_seconds != null && r.art_seconds > 0 })} />
            </div>
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
              <Scorecard title="Emails per Thread" value={emailData?.emailsPerThread || '-'} subtitle="Avg" isLoading={emailLoading} />
              <DrillInBtn onClick={() => openEmailRawDrillIn('Emails per Thread — Per Conversation', { level: 'thread' })} />
            </div>
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
              <Scorecard title="CSAT %" value={emailData?.csatPct != null ? `${emailData.csatPct}%` : '-'} subtitle={emailData?.avgCsat != null ? `Satisfied (≥4) · avg ${emailData.avgCsat}/5` : 'Satisfied (≥4)'} isLoading={emailLoading} />
              <DrillInBtn onClick={() => openEmailRawDrillIn('CSAT — Rated Emails', { filter: r => r['CX score'] != null })} />
            </div>
            <Scorecard title="FCR Rate" value="x%" isOnHold={true} />
            {/* Repeat Contact Rate with window selector */}
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
              <Scorecard
                title="Repeat Contact Rate"
                value={emailData ? `${emailData[`repeatRate${repeatWindow}`] ?? '-'}%` : '-'}
                subtitle={`Within ${repeatWindow}h`}
                isLoading={emailLoading}
              />
              <select
                value={repeatWindow}
                onChange={e => setRepeatWindow(Number(e.target.value))}
                style={{
                  position: 'absolute', top: 8, right: 28,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6, color: '#94A3B8', fontSize: '0.7rem', padding: '2px 6px', cursor: 'pointer', outline: 'none',
                }}
              >
                <option value={24}>24h</option>
                <option value={48}>48h</option>
                <option value={72}>72h</option>
              </select>
              <DrillInBtn onClick={() => openEmailRawDrillIn('Repeat Contact Rate — Per Conversation', { level: 'repeat' })} />
            </div>
          </div>

          {/* Email Inflow */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            {/* Sentiment Distribution hidden */}
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
              <ChartCard title="Email Inflow" isLoading={emailLoading}>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={emailData?.inflowTrend || []}>
                    <defs>
                      <linearGradient id="colorEmailThreads" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#A78BFA" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#A78BFA" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                    <YAxis tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                    <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: '#1C2128', border: '1px solid #30363D', borderRadius: '8px' }} labelStyle={{ color: '#F0F6FC', fontWeight: 700 }} itemStyle={{ color: '#F0F6FC' }} />
                    <Legend formatter={(value) => <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>{value}</span>} />
                    <Area type="monotone" dataKey="threads" stroke="#A78BFA" fill="url(#colorEmailThreads)" strokeWidth={2} name="Threads" />
                    <Line type="monotone" dataKey="emails" stroke="#C084FC" strokeWidth={2} dot={false} name="Emails" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
              <DrillInBtn onClick={() => openDrillIn('Email Inflow — Daily', (emailData?.inflowTrend || []), [{ key: 'date', label: 'Date' }, { key: 'threads', label: 'Threads' }, { key: 'emails', label: 'Emails' }])} />
            </div>
          </div>

          {/* Volume Heatmap with toggle */}
          <div className="spo-drill-parent" style={{ position: 'relative' }}>
            <ChartCard
              title="Volume Heatmap (Day & Hour)"
              dropdown={[
                { value: 'thread', label: 'Thread-wise' },
                { value: 'email', label: 'Email-wise' },
              ]}
              dropdownValue={emailHeatmapMode}
              onDropdownChange={setEmailHeatmapMode}
              style={{ marginBottom: '1.5rem' }}
              isLoading={emailLoading}
            >
              <Heatmap data={emailHeatmapMode === 'email' ? (emailData?.emailWiseHeatmap || []) : (emailData?.emailHeatmap || [])} />
            </ChartCard>
            <DrillInBtn onClick={() => { const hm = emailHeatmapMode === 'email' ? (emailData?.emailWiseHeatmap || []) : (emailData?.emailHeatmap || []); openDrillIn('Email Volume Heatmap', hm.filter(d => d.value > 0).map(d => ({ day: d.day, hour: `${d.hour}:00`, count: d.value })), [{ key: 'day', label: 'Day' }, { key: 'hour', label: 'Hour' }, { key: 'count', label: 'Count' }]); }} />
          </div>

          {/* Queued Clients Heatmap */}
          <div className="spo-drill-parent" style={{ position: 'relative' }}>
            <ChartCard title="Queued Clients Heatmap (Open Threads by Day & Hour)" style={{ marginBottom: '1.5rem' }} isLoading={emailLoading}>
              <Heatmap data={emailData?.backlogHeatmap || []} />
            </ChartCard>
            <DrillInBtn onClick={() => openDrillIn('Email Backlog Heatmap', (emailData?.backlogHeatmap || []).filter(d => d.value > 0).map(d => ({ day: d.day, hour: `${d.hour}:00`, open_threads: d.value })), [{ key: 'day', label: 'Day' }, { key: 'hour', label: 'Hour' }, { key: 'open_threads', label: 'Open Threads' }])} />
          </div>

          {/* Performance Metric Trend */}
          <div className="spo-drill-parent" style={{ position: 'relative' }}>
            <ChartCard
              title="Performance Metric Trend"
              dropdown={[
                { value: 'ART', label: 'Avg Response Time' },
                { value: 'AHT', label: 'Avg Handle Time' },
                { value: 'CSAT', label: 'CSAT' },
                { value: 'EHQ', label: 'EHQ (Emails/Agent/Hour)' },
              ]}
              dropdownValue={emailPerfMetric}
              onDropdownChange={setEmailPerfMetric}
              style={{ marginBottom: '1.5rem' }}
              isLoading={emailLoading}
            >
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={emailData?.perfTrend || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                  <YAxis tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                  <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: '#1C2128', border: '1px solid #30363D', borderRadius: '8px' }} labelStyle={{ color: '#F0F6FC', fontWeight: 700 }} itemStyle={{ color: '#F0F6FC' }} />
                  <ReferenceLine y={emailPerfMetric === 'ART' ? 3600 : emailPerfMetric === 'CSAT' ? 4.0 : null} stroke="#EF4444" strokeDasharray="5 5" label={{ value: 'Goal', position: 'right', fill: '#EF4444', fontSize: 11 }} />
                  <Line type="monotone" dataKey={emailPerfMetric} stroke="#A78BFA" strokeWidth={2} dot={{ fill: '#A78BFA', r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
            <DrillInBtn onClick={() => openDrillIn(`Email Performance — ${emailPerfMetric}`, (emailData?.perfTrend || []).map(d => ({ date: d.date, value: d[emailPerfMetric] })), [{ key: 'date', label: 'Date' }, { key: 'value', label: emailPerfMetric }])} />
          </div>

          {/* Teammate Performance */}
          <div className="spo-drill-parent" style={{ position: 'relative' }}>
          <ChartCard title="Teammate Performance" style={{ marginBottom: '1.5rem' }} isLoading={emailLoading}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', color: '#94A3B8', fontWeight: 600 }}>Agent</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', color: '#94A3B8', fontWeight: 600 }}>EHQ</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', color: '#94A3B8', fontWeight: 600 }}>Emails</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', color: '#94A3B8', fontWeight: 600 }}>Threads</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', color: '#94A3B8', fontWeight: 600 }}>ART</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', color: '#94A3B8', fontWeight: 600 }}>AHT</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', color: '#94A3B8', fontWeight: 600 }}>CSAT</th>
                  </tr>
                </thead>
                <tbody>
                  {(emailData?.teammates || []).map((tm, i) => (
                    <tr key={tm.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '10px 12px', color: '#F8FAFC', fontWeight: 600 }}>{displayName(tm.name)}</td>
                      <td style={{ padding: '10px 12px', color: '#A78BFA', textAlign: 'right', fontWeight: 600 }}>{tm.EHQ ?? '-'}</td>
                      <td style={{ padding: '10px 12px', color: '#94A3B8', textAlign: 'right' }}>{tm.emails}</td>
                      <td style={{ padding: '10px 12px', color: '#94A3B8', textAlign: 'right' }}>{tm.threads}</td>
                      <td style={{ padding: '10px 12px', color: '#10B981', textAlign: 'right', fontWeight: 600 }}>{tm.ART != null ? formatTime(tm.ART) : '-'}</td>
                      <td style={{ padding: '10px 12px', color: '#94A3B8', textAlign: 'right' }}>{tm.AHT != null ? formatTime(tm.AHT) : '-'}</td>
                      <td style={{ padding: '10px 12px', color: '#F59E0B', textAlign: 'right', fontWeight: 600 }}>{tm.CSAT || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
            <DrillInBtn onClick={() => openDrillIn('Email Teammate Performance', (emailData?.teammates || []).map(t => ({ teammate: displayName(t.name), ehq: t.EHQ ?? '-', emails: t.emails, threads: t.threads, art: t.ART != null ? formatTime(t.ART) : '-', aht: t.AHT != null ? formatTime(t.AHT) : '-', csat: t.CSAT ?? '-' })), [{ key: 'teammate', label: 'Teammate' }, { key: 'ehq', label: 'EHQ' }, { key: 'emails', label: 'Emails' }, { key: 'threads', label: 'Threads' }, { key: 'art', label: 'ART' }, { key: 'aht', label: 'AHT' }, { key: 'csat', label: 'CSAT' }])} />
          </div>

          {/* Knock Count by Location */}
          <div className="spo-drill-parent" style={{ position: 'relative' }}>
          <ChartCard title="Knock Count by Location" isLoading={emailLoading}>
            {(() => {
              const emailCountries = emailData?.countries || [];
              const maxVal = Math.max(...emailCountries.map(d => d.knockCount || 0), 1);
              const tickInterval = maxVal <= 5 ? 1 : maxVal <= 10 ? 2 : maxVal <= 20 ? 4 : 5;
              const explicitMax = Math.ceil(maxVal / tickInterval) * tickInterval;
              const ticks = Array.from({ length: Math.floor(explicitMax / tickInterval) + 1 }, (_, i) => i * tickInterval);
              return (
                <div style={{ display: 'flex', flexDirection: 'column', height: '350px', width: '100%' }}>
                  <div style={{ height: 'calc(100% - 64px)', overflowY: 'auto', overflowX: 'hidden', paddingRight: 2 }}>
                    <div style={{ height: Math.max(emailCountries.length * 40, 280), width: '100%', minHeight: '280px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={emailCountries} layout="vertical" margin={{ top: 5, right: 50, left: 10, bottom: 0 }} barCategoryGap="20%">
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(139, 148, 158, 0.1)" horizontal={false} />
                          <XAxis type="number" hide domain={[0, explicitMax]} ticks={ticks} />
                          <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10, fill: '#C9D1D9' }} interval={0} stroke="#30363D" tickLine={false} axisLine={false} />
                          <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: '#1C2128', border: '1px solid #30363D', borderRadius: '8px' }} labelStyle={{ color: '#F0F6FC', fontWeight: 700 }} itemStyle={{ color: '#F0F6FC' }} />
                          <Bar dataKey="knockCount" radius={[0, 4, 4, 0]} barSize={22} name="Knock Count">
                            {emailCountries.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                            ))}
                            <LabelList dataKey="knockCount" position="right" fill="#E5E7EB" fontSize={11} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div style={{ height: '64px', flexShrink: 0, background: 'transparent' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={emailCountries} layout="vertical" margin={{ top: 8, right: 50, left: 10, bottom: 24 }} barCategoryGap="20%">
                        <XAxis type="number" domain={[0, explicitMax]} ticks={ticks} stroke="#30363D" tick={{ fill: '#8B949E', fontSize: 10 }} axisLine={{ stroke: '#30363D' }} tickLine={{ stroke: '#30363D' }} />
                        <YAxis type="category" dataKey="name" width={160} tick={false} axisLine={false} tickLine={false} />
                        <Bar dataKey="knockCount" fill="transparent" barSize={0} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })()}
          </ChartCard>
            <DrillInBtn onClick={() => openDrillIn('Email Knock Count by Location', (emailData?.countries || []).map(d => ({ country: d.name, knock_count: d.knockCount })), [{ key: 'country', label: 'Country' }, { key: 'knock_count', label: 'Knock Count' }])} />
          </div>

          {/* Agent Activity Hours — email agents only (click row for pivoted daily breakdown) */}
          <div className="spo-drill-parent" style={{ position: 'relative' }}>
          <ChartCard title="Agent Activity Hours" isLoading={activityLoading} style={{ marginBottom: '1.5rem' }}>
            {activityError ? (
              <div style={{ color: '#FCA5A5', fontSize: '0.85rem', padding: '1rem' }}>{activityError}</div>
            ) : activityData && activityData.agents?.length > 0 ? (
              (() => {
                // Email-only agents
                const emailAgentSet = new Set(EMAIL_SUPPORT_AGENTS);
                const fmtDur = (secs) => { if (!secs || secs <= 0) return '0s'; const h = Math.floor(secs / 3600); const m = Math.floor((secs % 3600) / 60); const s = Math.floor(secs % 60); if (h > 0) return `${h}h ${m}m`; if (m > 0) return `${m}m ${s}s`; return `${s}s`; };
                const daysInRange = activityData.days_in_range || 1;
                const filteredAgents = activityData.agents
                  .filter(a => emailAgentSet.has(a.agent_name))
                  .map(a => {
                    const breaks = (a.away_breaks || [])
                      .filter(b => b.reason && !b.reason.includes('End of Shift'))
                      .map(b => ({ reason: b.reason, duration: fmtDur(Math.round((b.seconds || 0) / daysInRange)), seconds: b.seconds }));
                    return { ...a, displayName: displayName(a.agent_name), away_breaks: breaks };
                  })
                  .sort((a, b) => (b.avg_active_seconds_per_day || 0) - (a.avg_active_seconds_per_day || 0));
                const totalActiveSeconds = filteredAgents.reduce((s, a) => s + (a.active_seconds || 0), 0);
                const avgActive = filteredAgents.length > 0 ? fmtDur(Math.round(totalActiveSeconds / filteredAgents.length / daysInRange)) : '-';
                return (
                  <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ color: '#94A3B8', fontSize: '0.75rem' }}>
                        {filteredAgents.length} agent(s) &middot; email agents only
                        {daysInRange > 1 && ` · ${daysInRange} days · showing avg/day`}
                      </span>
                      <span style={{ color: '#10B981', fontSize: '0.75rem', fontWeight: 600 }}>
                        Avg Active: {avgActive}
                      </span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                          <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94A3B8', fontWeight: 600, whiteSpace: 'nowrap' }}>#</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94A3B8', fontWeight: 600, whiteSpace: 'nowrap' }}>Agent</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94A3B8', fontWeight: 600, whiteSpace: 'nowrap' }}>Active Time</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94A3B8', fontWeight: 600, whiteSpace: 'nowrap' }}>Away Breaks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAgents.map((a, i) => (
                          <tr
                            key={a.agent_id}
                            onClick={() => openActivityDrillIn(`Activity — ${a.displayName}`, a.agent_name, emailAgentSet)}
                            style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(167,139,250,0.06)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <td style={{ padding: '8px 10px', color: '#64748B' }}>{i + 1}</td>
                            <td style={{ padding: '8px 10px', color: '#F8FAFC', fontWeight: 600, whiteSpace: 'nowrap' }}>{a.displayName}</td>
                            <td style={{ padding: '8px 10px', color: '#10B981', fontWeight: 600 }}>{daysInRange > 1 ? a.avg_active_per_day || a.active_time : a.active_time}</td>
                            <td style={{ padding: '8px 10px', color: '#94A3B8', fontSize: '0.75rem' }}>
                              {a.away_breaks.length > 0
                                ? a.away_breaks.map((b, j) => <div key={j}>{b.reason}: {b.duration}</div>)
                                : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()
            ) : !activityLoading ? (
              <div style={{ color: '#64748B', textAlign: 'center', padding: '2rem' }}>
                No activity data for this period
              </div>
            ) : null}
          </ChartCard>
            <DrillInBtn onClick={() => openActivityDrillIn('Intercom Active Hour — Daily Breakdown (Email)', null, new Set(EMAIL_SUPPORT_AGENTS))} />
          </div>
        </>
      )}

      {/* ============ FUNDEE SEGMENT ============ */}
      {activeSegment === 'Fundee' && (
        <>
          {fundeeError && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 38, 0.08) 100%)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '12px',
              padding: '1rem 1.5rem',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              <span style={{ fontSize: '1.25rem' }}>⚠️</span>
              <div>
                <div style={{ color: '#FCA5A5', fontWeight: 600, fontSize: '0.875rem' }}>Fundee Data Error</div>
                <div style={{ color: '#FDA4AF', fontSize: '0.8125rem' }}>{fundeeError}</div>
              </div>
            </div>
          )}

          {/* Sync Bar — admin only */}
          {isAdmin && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
            padding: '0.6rem 1rem',
            background: 'rgba(15, 23, 42, 0.6)',
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.06)',
            flexWrap: 'wrap',
            gap: '0.5rem'
          }}>
            {/* Sync buttons hidden */}
          </div>
          )}

          {/* Fundee Scorecards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
              <Scorecard title="CFD Conversations" value={fundeeData?.agents?.['CFD Website']?.count?.toLocaleString() ?? '-'} subtitle="CFD Website agent" isLoading={fundeeLoading} />
              <DrillInBtn onClick={() => openDrillIn('CFD Conversations — Daily', (fundeeData?.dailyTrend || []).map(d => ({ date: d.date, cfd: d.cfd })), [{ key: 'date', label: 'Date' }, { key: 'cfd', label: 'CFD Count' }])} />
            </div>
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
              <Scorecard title="Futures Conversations" value={fundeeData?.agents?.['Futures Website']?.count?.toLocaleString() ?? '-'} subtitle="Futures Website agent" isLoading={fundeeLoading} />
              <DrillInBtn onClick={() => openDrillIn('Futures Conversations — Daily', (fundeeData?.dailyTrend || []).map(d => ({ date: d.date, futures: d.futures })), [{ key: 'date', label: 'Date' }, { key: 'futures', label: 'Futures Count' }])} />
            </div>
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
              <Scorecard title="Total Minutes" value={fundeeData?.totals?.totalMinutes != null ? fundeeData.totals.totalMinutes.toLocaleString() : '-'} subtitle={`${fundeeData?.totals?.totalConversations?.toLocaleString() ?? 0} conversations`} isLoading={fundeeLoading} />
              <DrillInBtn onClick={() => openDrillIn('Total Minutes', [{ metric: 'Total Minutes', value: fundeeData?.totals?.totalMinutes ?? '-', conversations: fundeeData?.totals?.totalConversations ?? '-' }], [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }, { key: 'conversations', label: 'Conversations' }])} />
            </div>
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
              <Scorecard title="Avg Call Duration" value={fundeeData?.totals?.avgDurationSecs != null ? `${Math.floor(fundeeData.totals.avgDurationSecs / 60)}m ${Math.round(fundeeData.totals.avgDurationSecs % 60)}s` : '-'} subtitle="Per conversation" isLoading={fundeeLoading} />
              <DrillInBtn onClick={() => openDrillIn('Avg Call Duration', [{ metric: 'Avg Duration', value: fundeeData?.totals?.avgDurationSecs != null ? `${Math.floor(fundeeData.totals.avgDurationSecs / 60)}m ${Math.round(fundeeData.totals.avgDurationSecs % 60)}s` : '-' }], [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }])} />
            </div>
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
              <Scorecard title="Total Cost" value={fundeeData?.totals?.totalCostUsd != null ? `$${fundeeData.totals.totalCostUsd.toFixed(2)}` : '-'} subtitle={`$0.035/min x ${fundeeData?.totals?.totalMinutes || 0} min`} isLoading={fundeeLoading} />
              <DrillInBtn onClick={() => openDrillIn('Fundee Cost Breakdown', [{ metric: 'Total Cost', value: `$${fundeeData?.totals?.totalCostUsd?.toFixed(2) ?? '-'}` }, { metric: 'Cost per Minute', value: '$0.035' }, { metric: 'Total Minutes', value: fundeeData?.totals?.totalMinutes ?? '-' }], [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }])} />
            </div>
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
              <Scorecard title="Accuracy Rate" value={fundeeData?.totals?.successRate != null ? `${fundeeData.totals.successRate}%` : '-'} subtitle="Successful calls" isLoading={fundeeLoading} />
              <DrillInBtn onClick={() => openDrillIn('Accuracy Rate', [{ metric: 'Success Rate', value: `${fundeeData?.totals?.successRate ?? '-'}%` }], [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }])} />
            </div>
          </div>

          {/* Row 1: Agent Split Pie + Daily Trend */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
            <ChartCard title="Agent Split" isLoading={fundeeLoading}>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'CFD Website', value: fundeeData?.agents?.['CFD Website']?.count || 0, color: '#8B5CF6' },
                      { name: 'Futures Website', value: fundeeData?.agents?.['Futures Website']?.count || 0, color: '#C084FC' }
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                    label={({ name, value }) => `${value}`}
                  >
                    <Cell fill="#8B5CF6" stroke="none" />
                    <Cell fill="#C084FC" stroke="none" />
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#1C2128', border: '1px solid #30363D', borderRadius: '8px', color: '#F0F6FC' }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    formatter={(value) => <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
              <DrillInBtn onClick={() => openDrillIn('Fundee Agent Split', Object.entries(fundeeData?.agents || {}).map(([name, d]) => ({ agent: name, conversations: d.count })), [{ key: 'agent', label: 'Agent' }, { key: 'conversations', label: 'Conversations' }])} />
            </div>

            <div className="spo-drill-parent" style={{ position: 'relative' }}>
            <ChartCard title="Daily Conversation Trend" isLoading={fundeeLoading}>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={fundeeData?.dailyTrend || []}>
                  <defs>
                    <linearGradient id="colorFundeeCfd" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorFundeeFutures" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#C084FC" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#C084FC" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                  <YAxis tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: '#1C2128', border: '1px solid #30363D', borderRadius: '8px' }} labelStyle={{ color: '#F0F6FC', fontWeight: 700 }} itemStyle={{ color: '#F0F6FC' }} />
                  <Legend formatter={(value) => <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>{value}</span>} />
                  <Area type="monotone" dataKey="cfd" stroke="#8B5CF6" fill="url(#colorFundeeCfd)" strokeWidth={2} name="CFD Website" />
                  <Area type="monotone" dataKey="futures" stroke="#C084FC" fill="url(#colorFundeeFutures)" strokeWidth={2} name="Futures Website" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
              <DrillInBtn onClick={() => openDrillIn('Fundee Daily Trend', (fundeeData?.dailyTrend || []), [{ key: 'date', label: 'Date' }, { key: 'cfd', label: 'CFD' }, { key: 'futures', label: 'Futures' }])} />
            </div>
          </div>

          {/* Row 2: Topic Distribution + Sentiment */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <div className="spo-drill-parent" style={{ position: 'relative' }}>
            <ChartCard title="Top Conversation Topics" isLoading={fundeeLoading}>
              {(() => {
                const topicData = fundeeData?.topicDistribution || [];
                const maxVal = Math.max(...topicData.map(d => d.count || 0), 1);
                const tickInterval = maxVal <= 5 ? 1 : maxVal <= 10 ? 2 : maxVal <= 20 ? 4 : 5;
                const explicitMax = Math.ceil(maxVal / tickInterval) * tickInterval;
                const ticks = Array.from({ length: Math.floor(explicitMax / tickInterval) + 1 }, (_, i) => i * tickInterval);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '320px', width: '100%' }}>
                    <div style={{ height: 'calc(100% - 64px)', overflowY: 'auto', overflowX: 'hidden', paddingRight: 2 }}>
                      <div style={{ height: Math.max(topicData.length * 40, 250), width: '100%', minHeight: '250px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={topicData} layout="vertical" margin={{ top: 5, right: 50, left: 10, bottom: 0 }} barCategoryGap="20%">
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(139, 148, 158, 0.1)" horizontal={false} />
                            <XAxis type="number" hide domain={[0, explicitMax]} ticks={ticks} />
                            <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10, fill: '#C9D1D9' }} interval={0} stroke="#30363D" tickLine={false} axisLine={false} />
                            <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: '#1C2128', border: '1px solid #30363D', borderRadius: '8px' }} labelStyle={{ color: '#F0F6FC', fontWeight: 700 }} itemStyle={{ color: '#F0F6FC' }} />
                            <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={22} name="Conversations">
                              {topicData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                              ))}
                              <LabelList dataKey="count" position="right" fill="#E5E7EB" fontSize={11} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div style={{ height: '64px', flexShrink: 0, background: 'transparent' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={topicData} layout="vertical" margin={{ top: 8, right: 50, left: 10, bottom: 24 }} barCategoryGap="20%">
                          <XAxis type="number" domain={[0, explicitMax]} ticks={ticks} stroke="#30363D" tick={{ fill: '#8B949E', fontSize: 10 }} axisLine={{ stroke: '#30363D' }} tickLine={{ stroke: '#30363D' }} />
                          <YAxis type="category" dataKey="name" width={160} tick={false} axisLine={false} tickLine={false} />
                          <Bar dataKey="count" fill="transparent" barSize={0} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })()}
            </ChartCard>
              <DrillInBtn onClick={() => openDrillIn('Fundee Top Topics', (fundeeData?.topicDistribution || []).map(d => ({ topic: d.name, count: d.count })), [{ key: 'topic', label: 'Topic' }, { key: 'count', label: 'Count' }])} />
            </div>

            <div className="spo-drill-parent" style={{ position: 'relative' }}>
            <ChartCard title="Sentiment Breakdown" isLoading={fundeeLoading}>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={fundeeData?.sentimentBreakdown || []}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                    label={({ name, value }) => value > 0 ? `${name}: ${value}` : ''}
                  >
                    {(fundeeData?.sentimentBreakdown || []).map((entry, index) => (
                      <Cell key={index} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: '#1C2128', border: '1px solid #30363D', borderRadius: '8px' }} labelStyle={{ color: '#F0F6FC', fontWeight: 700 }} itemStyle={{ color: '#F0F6FC' }} />
                  <Legend
                    verticalAlign="bottom"
                    formatter={(value) => <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
              <DrillInBtn onClick={() => openDrillIn('Fundee Sentiment Breakdown', (fundeeData?.sentimentBreakdown || []).map(d => ({ sentiment: d.name, count: d.value })), [{ key: 'sentiment', label: 'Sentiment' }, { key: 'count', label: 'Count' }])} />
            </div>
          </div>
        </>
      )}
      {/* ============ DRILL-IN MODAL ============ */}
      {drillIn && (
        <DrillInModal
          title={drillIn.title}
          data={drillIn.data}
          columns={drillIn.columns}
          loading={drillIn.loading}
          onClose={() => setDrillIn(null)}
        />
      )}
    </div>
  );
};

export default ServicePerformanceOverview;
