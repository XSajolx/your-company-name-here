import React, { useState, useEffect } from 'react';
import { getPresetRange, formatDateForInput, parseDateInput, getDhakaStartOfDay, getDhakaEndOfDay } from '../utils/dhakaDate';

/**
 * Reusable Dhaka (GMT+6) Date Range Picker
 *
 * Props:
 *  - presets: array of preset keys to show (default: common set)
 *  - defaultPreset: initial preset (default: 'last_30_days')
 *  - showCustom: show From/To inputs (default: true)
 *  - onChange: ({ from: Date, to: Date, preset: string }) => void
 *  - disabled: boolean
 */

const PRESET_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this_week', label: 'This Week' },
  { key: 'last_7_days', label: 'Last 7 Days' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'last_30_days', label: 'Last 30 Days' },
  { key: 'last_90_days', label: 'Last 90 Days' },
  { key: 'last_3_months', label: 'Last 3 Months' },
];

const DhakaDatePicker = ({
  presets = ['today', 'yesterday', 'last_7_days', 'last_30_days', 'last_90_days'],
  defaultPreset = 'last_30_days',
  showCustom = true,
  onChange,
  disabled = false,
}) => {
  const [activePreset, setActivePreset] = useState(defaultPreset);
  const initRange = getPresetRange(defaultPreset);
  const [dateFrom, setDateFrom] = useState(formatDateForInput(initRange.from));
  const [dateTo, setDateTo] = useState(formatDateForInput(initRange.to));

  // Fire onChange on mount
  useEffect(() => {
    if (onChange) {
      const range = getPresetRange(defaultPreset);
      onChange({ from: range.from, to: range.to, preset: defaultPreset });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePreset = (key) => {
    setActivePreset(key);
    const range = getPresetRange(key);
    setDateFrom(formatDateForInput(range.from));
    setDateTo(formatDateForInput(range.to));
    if (onChange) onChange({ from: range.from, to: range.to, preset: key });
  };

  const handleCustomChange = (from, to) => {
    setActivePreset('custom');
    const fromDate = getDhakaStartOfDay(parseDateInput(from));
    const toDate = getDhakaEndOfDay(parseDateInput(to));
    if (onChange) onChange({ from: fromDate, to: toDate, preset: 'custom' });
  };

  const visiblePresets = PRESET_OPTIONS.filter(p => presets.includes(p.key));

  return (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
      {/* Preset buttons */}
      {visiblePresets.map(p => (
        <button
          key={p.key}
          onClick={() => handlePreset(p.key)}
          disabled={disabled}
          style={{
            padding: '0.4rem 0.85rem',
            borderRadius: '6px',
            border: activePreset === p.key ? '1px solid rgba(99, 102, 241, 0.6)' : '1px solid rgba(255, 255, 255, 0.12)',
            background: activePreset === p.key ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.04)',
            color: activePreset === p.key ? '#A5B4FC' : '#94A3B8',
            fontSize: '0.78rem',
            fontWeight: activePreset === p.key ? '600' : '500',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
            whiteSpace: 'nowrap',
          }}
        >
          {p.label}
        </button>
      ))}

      {/* Custom date inputs */}
      {showCustom && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ color: '#64748B', fontSize: '0.75rem' }}>From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); handleCustomChange(e.target.value, dateTo); }}
              disabled={disabled}
              style={{
                padding: '0.4rem 0.6rem',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(15, 23, 42, 0.6)',
                color: '#E2E8F0',
                fontSize: '0.8rem',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ color: '#64748B', fontSize: '0.75rem' }}>To</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); handleCustomChange(dateFrom, e.target.value); }}
              disabled={disabled}
              style={{
                padding: '0.4rem 0.6rem',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(15, 23, 42, 0.6)',
                color: '#E2E8F0',
                fontSize: '0.8rem',
              }}
            />
          </div>
          <span style={{ color: '#475569', fontSize: '0.7rem' }}>GMT+6</span>
        </>
      )}
    </div>
  );
};

export default DhakaDatePicker;
