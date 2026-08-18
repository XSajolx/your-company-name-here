import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Get current Date object adjusted to GMT+6 (Dhaka) */
function getDhakaNow() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 6 * 3600000);
}

/** YYYY-MM-DD string in Dhaka timezone */
function getTodayString() {
  const d = getDhakaNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sameDay(a, b) {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function inRange(day, from, to) {
  if (!from || !to) return false;
  const t = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const fT = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const tT = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return t >= fT && t <= tT;
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfWeek(year, month) {
  return new Date(year, month, 1).getDay();
}

function formatDisplay(d) {
  if (!d) return '';
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatForInput(d) {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ─── Theme tokens ────────────────────────────────────────────────────────────
const T = {
  dropdownBg: '#1C2128',
  border: '#30363D',
  activePresetBg: 'rgba(99, 102, 241, 0.15)',
  activePresetColor: '#A5B4FC',
  dayHover: '#21262D',
  selectedRange: 'rgba(99, 102, 241, 0.15)',
  selectedDay: '#8B5CF6',
  todayRing: '#8B5CF6',
  triggerBg: '#21262D',
  triggerActive: '#8B5CF6',
  text: '#C9D1D9',
  muted: '#8B949E',
  apply: '#8B5CF6',
  surface: '#0D1117',
};

// ─── Presets ─────────────────────────────────────────────────────────────────
function getPresets(mode) {
  const common = [
    { id: 'today',       label: 'Today',        value: 'today' },
    { id: 'yesterday',   label: 'Yesterday',    value: 'yesterday' },
    { id: 'this_week',   label: 'This Week',    value: 'this_week' },
    { id: 'this_month',  label: 'This Month',   value: 'this_month' },
    { id: 'last_month',  label: 'Last Month',   value: 'last_month' },
    { id: 'last_7_days', label: 'Last 7 Days',  value: 'last_7_days' },
    { id: 'last_30_days',label: 'Last 30 Days', value: 'last_30_days' },
    { id: 'last_90_days',label: 'Last 90 Days', value: 'last_90_days' },
    { id: 'custom',      label: 'Custom',       value: 'custom' },
  ];
  return common;
}

/** Resolve a preset value to a {from, to} Date pair */
function resolvePresetRange(presetValue) {
  const now = getDhakaNow();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (presetValue) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: y, to: y };
    }
    case 'this_week': {
      const dow = today.getDay();
      const s = new Date(today);
      s.setDate(s.getDate() - dow);
      return { from: s, to: today };
    }
    case 'this_month': {
      const s = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: s, to: today };
    }
    case 'last_month': {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: s, to: e };
    }
    case 'last_7_days': {
      const s = new Date(today);
      s.setDate(s.getDate() - 6);
      return { from: s, to: today };
    }
    case 'last_30_days': {
      const s = new Date(today);
      s.setDate(s.getDate() - 29);
      return { from: s, to: today };
    }
    case 'last_90_days': {
      const s = new Date(today);
      s.setDate(s.getDate() - 89);
      return { from: s, to: today };
    }
    default:
      return null;
  }
}

// ─── MonthGrid sub-component ─────────────────────────────────────────────────
const MonthGrid = React.memo(({ year, month, pendingFrom, pendingTo, hoverDate, activeTab, onDayClick, onDayHover }) => {
  const todayDate = useMemo(() => getDhakaNow(), []);
  const totalDays = daysInMonth(year, month);
  const startDay = firstDayOfWeek(year, month);

  // Previous month filler days
  const prevMonthDays = daysInMonth(year, month - 1 < 0 ? 11 : month - 1);
  const fillerBefore = [];
  for (let i = startDay - 1; i >= 0; i--) {
    fillerBefore.push(prevMonthDays - i);
  }

  // Next month filler days
  const cellsUsed = startDay + totalDays;
  const remaining = (Math.ceil(cellsUsed / 7) * 7) - cellsUsed;
  const fillerAfter = [];
  for (let i = 1; i <= remaining; i++) {
    fillerAfter.push(i);
  }

  // Compute hover range
  let hoverFrom = null;
  let hoverTo = null;
  if (hoverDate && pendingFrom && !pendingTo) {
    if (pendingFrom.getTime() < hoverDate.getTime()) {
      hoverFrom = pendingFrom;
      hoverTo = hoverDate;
    } else {
      hoverFrom = hoverDate;
      hoverTo = pendingFrom;
    }
  }

  const dayStyle = (isOutside, isToday, isSelected, isInRange, isRangeStart, isRangeEnd) => {
    const base = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '1.875rem',
      height: '1.875rem',
      fontSize: '0.75rem',
      cursor: isOutside ? 'default' : 'pointer',
      border: 'none',
      background: 'none',
      fontFamily: 'inherit',
      position: 'relative',
      borderRadius: 0,
      transition: 'all 0.1s',
      color: isOutside ? '#484F58' : T.text,
      padding: 0,
    };

    if (isSelected) {
      base.background = T.selectedDay;
      base.color = '#fff';
      base.fontWeight = 600;
      base.zIndex = 1;
      base.borderRadius = '50%';
    } else if (isInRange) {
      base.background = T.selectedRange;
    }

    if (isToday && !isSelected) {
      base.boxShadow = `inset 0 0 0 1.5px ${T.todayRing}`;
      base.borderRadius = '50%';
      base.fontWeight = 700;
      base.color = T.activePresetColor;
    }

    return base;
  };

  return (
    <div style={{ minWidth: 0 }}>
      {/* Month title */}
      <div style={{
        textAlign: 'center',
        fontSize: '0.75rem',
        fontWeight: 600,
        color: T.text,
        marginBottom: '0.25rem',
      }}>
        {MONTH_NAMES[month]} {year}
      </div>

      {/* Weekday headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 0,
        marginBottom: '0.125rem',
      }}>
        {WEEKDAYS.map(wd => (
          <div key={wd} style={{
            textAlign: 'center',
            fontSize: '0.625rem',
            fontWeight: 600,
            color: T.muted,
            padding: '0.125rem 0',
            textTransform: 'uppercase',
          }}>
            {wd}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 0,
      }}>
        {/* Previous month filler */}
        {fillerBefore.map((d, i) => (
          <button key={`prev-${i}`} type="button" style={dayStyle(true)} disabled>
            {d}
          </button>
        ))}

        {/* Current month */}
        {Array.from({ length: totalDays }, (_, i) => {
          const d = i + 1;
          const date = new Date(year, month, d);
          const isToday = sameDay(date, todayDate);
          const isSelectedFrom = sameDay(date, pendingFrom);
          const isSelectedTo = sameDay(date, pendingTo);
          const isSelected = isSelectedFrom || isSelectedTo;

          let isInRange = false;
          if (pendingFrom && pendingTo) {
            isInRange = inRange(date, pendingFrom, pendingTo) && !isSelectedFrom && !isSelectedTo;
          } else if (hoverFrom && hoverTo) {
            isInRange = inRange(date, hoverFrom, hoverTo) && !sameDay(date, pendingFrom);
          }

          const isRangeStart = isSelectedFrom && pendingTo && !sameDay(pendingFrom, pendingTo);
          const isRangeEnd = isSelectedTo && pendingFrom && !sameDay(pendingFrom, pendingTo);

          return (
            <button
              key={d}
              type="button"
              style={dayStyle(false, isToday, isSelected, isInRange, isRangeStart, isRangeEnd)}
              onClick={(e) => { e.stopPropagation(); onDayClick(date); }}
              onMouseEnter={() => onDayHover(date)}
              onMouseLeave={() => {}}
            >
              {d}
            </button>
          );
        })}

        {/* Next month filler */}
        {fillerAfter.map((d, i) => (
          <button key={`next-${i}`} type="button" style={dayStyle(true)} disabled>
            {d}
          </button>
        ))}
      </div>
    </div>
  );
});

MonthGrid.displayName = 'MonthGrid';

// ─── Main DateRangePicker component ──────────────────────────────────────────
const DateRangePicker = ({ value, onChange, mode = 'intercom', compact = false, placeholder = 'Select date range' }) => {
  const rootRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);

  // Determine active selection from value prop
  const isCustomValue = value && value.startsWith('custom_');

  // Selected preset key (or 'custom')
  const [selectedPreset, setSelectedPreset] = useState(() => {
    if (isCustomValue) return 'custom';
    return value || 'last_30_days';
  });

  // Calendar view month/year — right calendar shows this, left shows previous
  const now = getDhakaNow();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  // Active tab: 'from' or 'to'
  const [activeTab, setActiveTab] = useState('from');

  // Pending from/to dates (Date objects) for custom selection
  const [pendingFrom, setPendingFrom] = useState(() => {
    if (isCustomValue) {
      const parts = value.split('_');
      return parts.length >= 2 ? parseDate(parts[1]) : null;
    }
    return null;
  });
  const [pendingTo, setPendingTo] = useState(() => {
    if (isCustomValue) {
      const parts = value.split('_');
      return parts.length >= 3 ? parseDate(parts[2]) : null;
    }
    return null;
  });

  // Hover date for range preview
  const [hoverDate, setHoverDate] = useState(null);

  // Hover state for preset items
  const [hoveredPreset, setHoveredPreset] = useState(null);

  // Hover state for trigger button
  const [triggerHovered, setTriggerHovered] = useState(false);

  const presets = useMemo(() => getPresets(mode), [mode]);

  // Sync when value prop changes externally
  useEffect(() => {
    if (value && value.startsWith('custom_')) {
      const parts = value.split('_');
      setSelectedPreset('custom');
      if (parts.length >= 2) setPendingFrom(parseDate(parts[1]));
      if (parts.length >= 3) setPendingTo(parseDate(parts[2]));
    } else if (value) {
      setSelectedPreset(value);
    }
  }, [value]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  // When opening, reset pending to match current value and set view month
  const handleOpen = useCallback(() => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    // Reset active tab
    setActiveTab('from');
    setHoverDate(null);

    // Set pending dates from current value
    if (value && value.startsWith('custom_')) {
      const parts = value.split('_');
      const from = parts.length >= 2 ? parseDate(parts[1]) : null;
      const to = parts.length >= 3 ? parseDate(parts[2]) : null;
      setPendingFrom(from);
      setPendingTo(to);
      setSelectedPreset('custom');
      if (to) {
        setViewYear(to.getFullYear());
        setViewMonth(to.getMonth());
      }
    } else {
      setSelectedPreset(value || 'last_30_days');
      // If not custom, resolve preset range for pending display
      const range = resolvePresetRange(value);
      if (range) {
        setPendingFrom(range.from);
        setPendingTo(range.to);
        if (range.to) {
          setViewYear(range.to.getFullYear());
          setViewMonth(range.to.getMonth());
        }
      }
    }

    setIsOpen(true);
  }, [isOpen, value]);

  // Preset click
  const handlePresetClick = useCallback((preset, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setSelectedPreset(preset.value);

    if (preset.value !== 'custom') {
      // Resolve and set pending for display
      const range = resolvePresetRange(preset.value);
      if (range) {
        setPendingFrom(range.from);
        setPendingTo(range.to);
      }
      // Auto-apply and close
      onChange(preset.value);
      setIsOpen(false);
    } else {
      // Show calendar, keep existing pending dates or initialize
      setActiveTab('from');
      setHoverDate(null);
      const n = getDhakaNow();
      setViewYear(n.getFullYear());
      setViewMonth(n.getMonth());
    }
  }, [onChange]);

  // Day click handler
  const handleDayClick = useCallback((date) => {
    if (activeTab === 'from') {
      setPendingFrom(date);
      // If to is before new from, clear it
      if (pendingTo && pendingTo.getTime() < date.getTime()) {
        setPendingTo(null);
      }
      setActiveTab('to');
      setSelectedPreset('custom');
      setHoverDate(null);
    } else {
      // 'to' tab
      if (pendingFrom && date.getTime() < pendingFrom.getTime()) {
        // Swap: clicked date becomes from, old from becomes to
        setPendingTo(pendingFrom);
        setPendingFrom(date);
      } else {
        setPendingTo(date);
      }
      setSelectedPreset('custom');
      setHoverDate(null);
    }
  }, [activeTab, pendingFrom, pendingTo]);

  // Day hover handler
  const handleDayHover = useCallback((date) => {
    if (pendingFrom && !pendingTo && activeTab === 'to') {
      setHoverDate(date);
    }
  }, [pendingFrom, pendingTo, activeTab]);

  // Apply custom range
  const handleApply = useCallback((e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (pendingFrom && pendingTo) {
      const fromStr = formatForInput(pendingFrom);
      const toStr = formatForInput(pendingTo);
      onChange(`custom_${fromStr}_${toStr}`);
      setIsOpen(false);
    }
  }, [pendingFrom, pendingTo, onChange]);

  // Cancel
  const handleCancel = useCallback((e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setIsOpen(false);
  }, []);

  // Navigation
  const prevMonth = useCallback((e) => {
    e.stopPropagation();
    setViewMonth(m => {
      if (m === 0) {
        setViewYear(y => y - 1);
        return 11;
      }
      return m - 1;
    });
  }, []);

  const nextMonth = useCallback((e) => {
    e.stopPropagation();
    setViewMonth(m => {
      if (m === 11) {
        setViewYear(y => y + 1);
        return 0;
      }
      return m + 1;
    });
  }, []);

  // Display text for trigger button
  const getDisplayText = () => {
    if (value && value.startsWith('custom_')) {
      const parts = value.split('_');
      if (parts.length >= 3) {
        const from = parseDate(parts[1]);
        const to = parseDate(parts[2]);
        return `${formatDisplay(from)} – ${formatDisplay(to)}`;
      }
    }
    const preset = presets.find(r => r.value === value);
    return preset ? preset.label : placeholder;
  };

  // Left calendar month
  let leftMonth = viewMonth - 1;
  let leftYear = viewYear;
  if (leftMonth < 0) {
    leftMonth = 11;
    leftYear--;
  }

  // Nav title
  const navTitle = `${MONTH_NAMES[leftMonth]} ${leftYear}  —  ${MONTH_NAMES[viewMonth]} ${viewYear}`;

  const showCalendar = selectedPreset === 'custom';

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block', fontFamily: 'inherit' }}>
      {/* ── Trigger Button (pill style) ── */}
      <button
        type="button"
        onClick={handleOpen}
        onMouseEnter={() => setTriggerHovered(true)}
        onMouseLeave={() => setTriggerHovered(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: compact ? 6 : 10,
          background: 'rgba(10,15,25,0.85)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: compact ? 18 : 30,
          height: compact ? 30 : 44,
          padding: compact ? '2px 4px 2px 10px' : '4px 6px 4px 16px',
          minWidth: compact ? 130 : 170,
          boxShadow: compact ? '0 1px 3px rgba(0,0,0,0.2)' : '0 2px 8px rgba(0,0,0,0.25)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'all 0.15s',
          whiteSpace: 'nowrap',
          outline: 'none',
        }}
      >
        {/* Calendar icon */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: compact ? 12 : 15, flexShrink: 0 }}>
          <svg width={compact ? 14 : 18} height={compact ? 14 : 18} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
        </div>
        {/* Inner pill */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flex: 1,
          height: '100%',
          background: 'rgba(30,41,59,0.75)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: compact ? 14 : 24,
          padding: compact ? '0 10px' : '0 14px',
          gap: compact ? 6 : 10,
        }}>
          <span style={{ fontSize: compact ? 11 : 13, fontWeight: 500, color: '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {getDisplayText()}
          </span>
          {value && (
            <span
              role="button"
              title="Clear date filter"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(''); setIsOpen(false); }}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: compact ? 14 : 18, height: compact ? 14 : 18,
                background: 'rgba(255,255,255,0.08)', borderRadius: '50%',
                cursor: 'pointer', color: '#cbd5e1', flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.35)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#cbd5e1'; }}
            >
              <svg width={compact ? 8 : 10} height={compact ? 8 : 10} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M2 2L8 8 M8 2L2 8" />
              </svg>
            </span>
          )}
          {/* Chevron */}
          <svg width={compact ? 7 : 8} height={compact ? 7 : 8} viewBox="0 0 10 10" style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}>
            <path fill="#94a3b8" d="M1 3.5l4 4 4-4z" />
          </svg>
        </div>
      </button>

      {/* ── Dropdown ── */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: '0.375rem',
          background: T.dropdownBg,
          border: `1px solid ${T.border}`,
          borderRadius: '0.5rem',
          boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
          zIndex: 1000,
          display: 'flex',
          overflow: 'hidden',
        }}>
          {/* ── Presets Section (left) ── */}
          <div style={{
            padding: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            minWidth: '8.5rem',
            borderRight: showCalendar ? `1px solid ${T.border}` : 'none',
          }}>
            {presets.map(preset => {
              const isActive = selectedPreset === preset.value;
              const isHovered = hoveredPreset === preset.value;
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={(e) => handlePresetClick(preset, e)}
                  onMouseEnter={() => setHoveredPreset(preset.value)}
                  onMouseLeave={() => setHoveredPreset(null)}
                  style={{
                    background: isActive ? T.activePresetBg : (isHovered && !isActive ? T.dayHover : 'none'),
                    border: 'none',
                    padding: '0.4rem 0.625rem',
                    textAlign: 'left',
                    fontSize: '0.8125rem',
                    fontFamily: 'inherit',
                    color: isActive ? T.activePresetColor : T.text,
                    cursor: 'pointer',
                    borderRadius: '0.25rem',
                    transition: 'all 0.1s',
                    whiteSpace: 'nowrap',
                    fontWeight: isActive ? 600 : 400,
                    marginBottom: '0.0625rem',
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* ── Calendar Section (right) — visible when Custom is selected ── */}
          {showCalendar && (
            <div style={{ padding: '0.75rem', minWidth: 0 }}>
              {/* ── From / To Tabs ── */}
              <div style={{
                display: 'flex',
                gap: '1.25rem',
                marginBottom: '0.5rem',
                borderBottom: `2px solid ${T.border}`,
              }}>
                {/* From tab */}
                <button
                  type="button"
                  onClick={() => setActiveTab('from')}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '0.25rem 0',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: activeTab === 'from' ? T.activePresetColor : T.muted,
                    borderBottom: `2px solid ${activeTab === 'from' ? T.selectedDay : 'transparent'}`,
                    marginBottom: '-2px',
                    transition: 'all 0.15s',
                  }}
                >
                  From
                  <span style={{
                    display: 'block',
                    fontSize: '0.6875rem',
                    fontWeight: 400,
                    color: activeTab === 'from' ? T.text : T.muted,
                    marginTop: '0.0625rem',
                  }}>
                    {pendingFrom ? formatDisplay(pendingFrom) : '\u00A0'}
                  </span>
                </button>

                {/* To tab */}
                <button
                  type="button"
                  onClick={() => setActiveTab('to')}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '0.25rem 0',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: activeTab === 'to' ? T.activePresetColor : T.muted,
                    borderBottom: `2px solid ${activeTab === 'to' ? T.selectedDay : 'transparent'}`,
                    marginBottom: '-2px',
                    transition: 'all 0.15s',
                  }}
                >
                  To
                  <span style={{
                    display: 'block',
                    fontSize: '0.6875rem',
                    fontWeight: 400,
                    color: activeTab === 'to' ? T.text : T.muted,
                    marginTop: '0.0625rem',
                  }}>
                    {pendingTo ? formatDisplay(pendingTo) : '\u00A0'}
                  </span>
                </button>
              </div>

              {/* ── Month Navigation ── */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.375rem',
              }}>
                <button
                  type="button"
                  onClick={prevMonth}
                  style={{
                    background: 'none',
                    border: `1px solid ${T.border}`,
                    borderRadius: '0.25rem',
                    width: '1.5rem',
                    height: '1.5rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: T.text,
                    transition: 'all 0.15s',
                  }}
                >
                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"/>
                  </svg>
                </button>

                <span style={{
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: T.text,
                }}>
                  {navTitle}
                </span>

                <button
                  type="button"
                  onClick={nextMonth}
                  style={{
                    background: 'none',
                    border: `1px solid ${T.border}`,
                    borderRadius: '0.25rem',
                    width: '1.5rem',
                    height: '1.5rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: T.text,
                    transition: 'all 0.15s',
                  }}
                >
                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/>
                  </svg>
                </button>
              </div>

              {/* ── Dual-Month Calendars ── */}
              <div style={{ display: 'flex', gap: '1rem' }}>
                <MonthGrid
                  year={leftYear}
                  month={leftMonth}
                  pendingFrom={pendingFrom}
                  pendingTo={pendingTo}
                  hoverDate={hoverDate}
                  activeTab={activeTab}
                  onDayClick={handleDayClick}
                  onDayHover={handleDayHover}
                />
                <MonthGrid
                  year={viewYear}
                  month={viewMonth}
                  pendingFrom={pendingFrom}
                  pendingTo={pendingTo}
                  hoverDate={hoverDate}
                  activeTab={activeTab}
                  onDayClick={handleDayClick}
                  onDayHover={handleDayHover}
                />
              </div>

              {/* ── Actions ── */}
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.5rem',
                marginTop: '0.5rem',
                paddingTop: '0.5rem',
                borderTop: `1px solid ${T.border}`,
              }}>
                <button
                  type="button"
                  onClick={handleCancel}
                  style={{
                    padding: '0.3rem 0.875rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.75rem',
                    fontFamily: 'inherit',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    background: T.dropdownBg,
                    color: T.text,
                    border: `1px solid ${T.border}`,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={!pendingFrom || !pendingTo}
                  style={{
                    padding: '0.3rem 0.875rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.75rem',
                    fontFamily: 'inherit',
                    fontWeight: 600,
                    cursor: pendingFrom && pendingTo ? 'pointer' : 'not-allowed',
                    transition: 'all 0.15s',
                    background: pendingFrom && pendingTo ? T.apply : '#30363D',
                    color: pendingFrom && pendingTo ? '#fff' : '#6E7681',
                    border: 'none',
                  }}
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DateRangePicker;
