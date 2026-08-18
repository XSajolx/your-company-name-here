import { useState, useRef, useEffect, useMemo } from "react";

const PRESETS = [
  { label: "All Time", getValue: () => ["", ""] },
  { label: "Today", getValue: () => { const t = fmt(new Date()); return [t, t]; } },
  { label: "Yesterday", getValue: () => { const d = new Date(); d.setDate(d.getDate() - 1); const t = fmt(d); return [t, t]; } },
  { label: "This Week", getValue: () => { const d = new Date(); const day = d.getDay(); const s = new Date(d); s.setDate(d.getDate() - day); return [fmt(s), fmt(d)]; } },
  { label: "This Month", getValue: () => { const d = new Date(); return [fmt(new Date(d.getFullYear(), d.getMonth(), 1)), fmt(d)]; } },
  { label: "Last Month", getValue: () => { const d = new Date(); const s = new Date(d.getFullYear(), d.getMonth() - 1, 1); const e = new Date(d.getFullYear(), d.getMonth(), 0); return [fmt(s), fmt(e)]; } },
  { label: "Last 7 Days", getValue: () => { const d = new Date(); const s = new Date(d); s.setDate(d.getDate() - 6); return [fmt(s), fmt(d)]; } },
  { label: "Last 30 Days", getValue: () => { const d = new Date(); const s = new Date(d); s.setDate(d.getDate() - 29); return [fmt(s), fmt(d)]; } },
  { label: "Last 90 Days", getValue: () => { const d = new Date(); const s = new Date(d); s.setDate(d.getDate() - 89); return [fmt(s), fmt(d)]; } },
  { label: "Custom", getValue: null },
];

function fmt(d) {
  return d.toISOString().slice(0, 10);
}

function fmtDisplay(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function getCalendarDays(year, month) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const rows = [];
  let week = new Array(startDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) { rows.push(week); week = []; }
  }
  if (week.length > 0) { while (week.length < 7) week.push(null); rows.push(week); }
  return rows;
}

export default function DateRangePicker({ dateFrom, dateTo, onApply }) {
  const [open, setOpen] = useState(false);
  const [activePreset, setActivePreset] = useState(!dateFrom && !dateTo ? "All Time" : "Custom");
  const [tempFrom, setTempFrom] = useState(dateFrom || "");
  const [tempTo, setTempTo] = useState(dateTo || "");
  const [selectingStart, setSelectingStart] = useState(true);
  const ref = useRef(null);

  // Calendar view months — show two months based on tempTo or current date
  const rightDate = tempTo ? new Date(tempTo + "T00:00:00") : new Date();
  const [viewYear, setViewYear] = useState(rightDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(rightDate.getMonth());

  const leftYear = viewMonth === 0 ? viewYear - 1 : viewYear;
  const leftMonth = viewMonth === 0 ? 11 : viewMonth - 1;

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Sync temp values when props change
  useEffect(() => {
    if (!open) {
      setTempFrom(dateFrom || "");
      setTempTo(dateTo || "");
    }
  }, [dateFrom, dateTo, open]);

  const handlePreset = (preset) => {
    setActivePreset(preset.label);
    if (preset.getValue) {
      const [f, t] = preset.getValue();
      setTempFrom(f);
      setTempTo(t);
      setSelectingStart(true);
      if (t) {
        const toDate = new Date(t + "T00:00:00");
        setViewYear(toDate.getFullYear());
        setViewMonth(toDate.getMonth());
      } else {
        const now = new Date();
        setViewYear(now.getFullYear());
        setViewMonth(now.getMonth());
      }
    } else {
      setSelectingStart(true);
    }
  };

  const handleDayClick = (year, month, day) => {
    if (!day) return;
    const clicked = fmt(new Date(year, month, day));
    setActivePreset("Custom");
    if (selectingStart) {
      setTempFrom(clicked);
      setTempTo(clicked);
      setSelectingStart(false);
    } else {
      if (clicked < tempFrom) {
        setTempFrom(clicked);
        setTempTo(tempFrom);
      } else {
        setTempTo(clicked);
      }
      setSelectingStart(true);
    }
  };

  const handleApply = () => {
    onApply(tempFrom, tempTo);
    setOpen(false);
  };

  const handleCancel = () => {
    setTempFrom(dateFrom || "");
    setTempTo(dateTo || "");
    setOpen(false);
  };

  const navigateMonth = (dir) => {
    let m = viewMonth + dir;
    let y = viewYear;
    if (m > 11) { m = 0; y++; }
    if (m < 0) { m = 11; y--; }
    setViewMonth(m);
    setViewYear(y);
  };

  // Determine button label
  const buttonLabel = useMemo(() => {
    if (!dateFrom && !dateTo) return "All Time";
    for (const p of PRESETS) {
      if (p.getValue) {
        const [f, t] = p.getValue();
        if (f === dateFrom && t === dateTo) return p.label;
      }
    }
    return "Custom";
  }, [dateFrom, dateTo]);

  const isInRange = (year, month, day) => {
    if (!day || !tempFrom || !tempTo) return false;
    const d = fmt(new Date(year, month, day));
    return d >= tempFrom && d <= tempTo;
  };

  const isStart = (year, month, day) => {
    if (!day || !tempFrom) return false;
    return fmt(new Date(year, month, day)) === tempFrom;
  };

  const isEnd = (year, month, day) => {
    if (!day || !tempTo) return false;
    return fmt(new Date(year, month, day)) === tempTo;
  };

  const isToday = (year, month, day) => {
    if (!day) return false;
    return fmt(new Date(year, month, day)) === fmt(new Date());
  };

  const renderCalendar = (year, month) => {
    const weeks = getCalendarDays(year, month);
    return (
      <div style={{ flex: 1 }}>
        <div style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: "#cbd5e1", marginBottom: 10 }}>
          {MONTHS[month]} {year}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0 }}>
          {DAYS.map(d => (
            <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: "#475569", padding: "4px 0", letterSpacing: "0.05em" }}>{d}</div>
          ))}
          {weeks.flat().map((day, i) => {
            const inRange = isInRange(year, month, day);
            const start = isStart(year, month, day);
            const end = isEnd(year, month, day);
            const today = isToday(year, month, day);
            return (
              <div
                key={i}
                onClick={() => handleDayClick(year, month, day)}
                style={{
                  textAlign: "center",
                  padding: "6px 0",
                  fontSize: 12,
                  color: day ? ((start || end) ? "#fff" : inRange ? "#c4b5fd" : "#94a3b8") : "transparent",
                  cursor: day ? "pointer" : "default",
                  background: (start || end) ? "#8B5CF6" : inRange ? "rgba(99,102,241,0.15)" : "transparent",
                  borderRadius: start && end ? 8 : start ? "8px 0 0 8px" : end ? "0 8px 8px 0" : 0,
                  fontWeight: (start || end || today) ? 700 : 400,
                  transition: "background 0.1s",
                  position: "relative",
                  lineHeight: "24px",
                  height: 24,
                }}
                onMouseOver={e => { if (day && !start && !end) e.currentTarget.style.background = "rgba(99,102,241,0.25)"; }}
                onMouseOut={e => { if (day && !start && !end) e.currentTarget.style.background = inRange ? "rgba(99,102,241,0.15)" : "transparent"; }}
              >
                {day || ""}
                {today && !start && !end && (
                  <div style={{ position: "absolute", bottom: 1, left: "50%", transform: "translateX(-50%)", width: 3, height: 3, borderRadius: "50%", background: "#8B5CF6" }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Trigger Button (pill style) */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          background: "rgba(10,15,25,0.85)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 30,
          height: 44,
          padding: "4px 6px 4px 16px",
          minWidth: 170,
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          cursor: "pointer",
          fontFamily: "inherit",
          outline: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 15, flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
        </div>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flex: 1,
          height: "100%",
          background: "rgba(30,41,59,0.75)",
          border: "1px solid rgba(255,255,255,0.05)",
          borderRadius: 24,
          padding: "0 14px",
          gap: 10,
        }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "#cbd5e1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {buttonLabel}
          </span>
          <svg width="8" height="8" viewBox="0 0 10 10" style={{ transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>
            <path fill="#94a3b8" d="M1 3.5l4 4 4-4z" />
          </svg>
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          zIndex: 999,
          background: "#111827",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          display: "flex",
          overflow: "hidden",
          minWidth: 620,
        }}>
          {/* Left: Presets */}
          <div style={{
            width: 140,
            borderRight: "1px solid rgba(255,255,255,0.06)",
            padding: "16px 0",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}>
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => handlePreset(p)}
                style={{
                  background: activePreset === p.label ? "rgba(99,102,241,0.1)" : "transparent",
                  border: "none",
                  color: activePreset === p.label ? "#818cf8" : "#94a3b8",
                  padding: "8px 18px",
                  fontSize: 13,
                  fontWeight: activePreset === p.label ? 600 : 400,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s",
                  borderLeft: activePreset === p.label ? "2px solid #8B5CF6" : "2px solid transparent",
                }}
                onMouseOver={e => { if (activePreset !== p.label) { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.color = "#cbd5e1"; } }}
                onMouseOut={e => { if (activePreset !== p.label) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94a3b8"; } }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Right: Calendar */}
          <div style={{ flex: 1, padding: "16px 20px" }}>
            {/* From / To display */}
            <div style={{ display: "flex", gap: 32, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#8B5CF6", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>From</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>{fmtDisplay(tempFrom)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>To</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#94a3b8" }}>{fmtDisplay(tempTo)}</div>
              </div>
            </div>

            {/* Month Navigation */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <button
                onClick={() => navigateMonth(-1)}
                style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 16, padding: "4px 8px", borderRadius: 6 }}
                onMouseOver={e => e.currentTarget.style.color = "#cbd5e1"}
                onMouseOut={e => e.currentTarget.style.color = "#64748b"}
              >‹</button>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>
                {MONTHS[leftMonth]} {leftYear} — {MONTHS[viewMonth]} {viewYear}
              </div>
              <button
                onClick={() => navigateMonth(1)}
                style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 16, padding: "4px 8px", borderRadius: 6 }}
                onMouseOver={e => e.currentTarget.style.color = "#cbd5e1"}
                onMouseOut={e => e.currentTarget.style.color = "#64748b"}
              >›</button>
            </div>

            {/* Dual Calendar */}
            <div style={{ display: "flex", gap: 24, marginBottom: 18 }}>
              {renderCalendar(leftYear, leftMonth)}
              {renderCalendar(viewYear, viewMonth)}
            </div>

            {/* Footer buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 14 }}>
              <button
                onClick={handleCancel}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#94a3b8",
                  borderRadius: 8,
                  padding: "8px 20px",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseOver={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; e.currentTarget.style.color = "#cbd5e1"; }}
                onMouseOut={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#94a3b8"; }}
              >Cancel</button>
              <button
                onClick={handleApply}
                style={{
                  background: "linear-gradient(135deg, #8B5CF6, #4f46e5)",
                  border: "none",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 24px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(99,102,241,0.3)",
                  transition: "opacity 0.15s",
                }}
                onMouseOver={e => e.currentTarget.style.opacity = "0.9"}
                onMouseOut={e => e.currentTarget.style.opacity = "1"}
              >Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
