import React, { useState, useRef, useEffect } from "react";

export default function PillDropdown({
  icon, label, value, options, onChange, searchable = true, multi = false, compact = false,
  // pinnedValues: array of `value` strings that should appear at the TOP of the
  // dropdown (above all other options) and be quick-selectable via a single
  // button labeled `pinnedLabel`. Multi-mode only.
  pinnedValues = null,
  pinnedLabel = 'Select pinned',
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open && searchable && searchInputRef.current) searchInputRef.current.focus();
    if (!open) setSearch("");
  }, [open, searchable]);

  const displayText = multi
    ? ((!value || value.length === 0 || value.length === options.length) ? label : `${value.length} selected`)
    : (options.find(o => o.value === value)?.label || label);

  // Detect when a non-default value is selected so we can show a clear-X.
  // Multi default = empty array (or all selected, which we treat as "no filter").
  // Single default = value equal to the first option (typically 'All') or missing.
  const isDefault = multi
    ? (!value || value.length === 0 || value.length === options.length)
    : (!value || value === 'All' || value === options[0]?.value);

  const handleClear = (e) => {
    e.stopPropagation();
    onChange(multi ? [] : (options[0]?.value ?? 'All'));
    setOpen(false);
  };

  const filtered = searchable
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  // When pinnedValues is provided + multi mode, surface those options at the
  // top of the list (in the order they were given) so the user can find them
  // without scrolling. Everything else follows in its original order.
  const pinnedSet = (multi && Array.isArray(pinnedValues) && pinnedValues.length)
    ? new Set(pinnedValues)
    : null;
  const orderedFiltered = pinnedSet
    ? [
        ...pinnedValues
          .map(v => filtered.find(o => o.value === v))
          .filter(Boolean),
        ...filtered.filter(o => !pinnedSet.has(o.value)),
      ]
    : filtered;

  // "Select main N" quick action: ticks (or unticks) every pinned value at
  // once. If they're already all selected, the same click clears them so the
  // button doubles as a toggle.
  const allPinnedSelected = pinnedSet
    && Array.isArray(value)
    && pinnedValues.every(v => value.includes(v));
  const togglePinned = () => {
    if (!pinnedSet) return;
    const current = Array.isArray(value) ? value : [];
    if (allPinnedSelected) {
      // Remove all pinned, keep anything else the user had selected.
      onChange(current.filter(v => !pinnedSet.has(v)));
    } else {
      // Union: keep existing non-pinned + add all pinned.
      const next = current.filter(v => !pinnedSet.has(v)).concat(pinnedValues);
      onChange(next);
    }
  };

  const handleMultiToggle = (val) => {
    const current = Array.isArray(value) ? value : [];
    const isSelected = current.includes(val);
    const next = isSelected ? current.filter(v => v !== val) : [...current, val];
    onChange(next);
  };

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: compact ? 6 : 10,
          background: "rgba(10,15,25,0.85)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: compact ? 18 : 30,
          height: compact ? 30 : 44,
          padding: compact ? "2px 4px 2px 10px" : "4px 6px 4px 16px",
          minWidth: compact ? 110 : 170,
          boxShadow: compact ? "0 1px 3px rgba(0,0,0,0.2)" : "0 2px 8px rgba(0,0,0,0.25)",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        {icon && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: compact ? 12 : 15, flexShrink: 0 }}>
            {icon}
          </div>
        )}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flex: 1,
          height: "100%",
          background: "rgba(30,41,59,0.75)",
          border: "1px solid rgba(255,255,255,0.05)",
          borderRadius: compact ? 14 : 24,
          padding: compact ? "0 10px" : "0 14px",
          gap: compact ? 6 : 10,
        }}>
          <span style={{ fontSize: compact ? 11 : 13, fontWeight: 500, color: "#cbd5e1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {displayText}
          </span>
          {!isDefault && (
            <button
              type="button"
              onClick={handleClear}
              title="Clear filter"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: compact ? 14 : 18, height: compact ? 14 : 18, padding: 0,
                background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%",
                cursor: "pointer", color: "#cbd5e1", flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.35)"; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#cbd5e1"; }}
            >
              <svg width={compact ? 8 : 10} height={compact ? 8 : 10} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M2 2L8 8 M8 2L2 8" />
              </svg>
            </button>
          )}
          <svg width={compact ? 7 : 8} height={compact ? 7 : 8} viewBox="0 0 10 10" style={{ transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>
            <path fill="#94a3b8" d="M1 3.5l4 4 4-4z" />
          </svg>
        </div>
      </div>

      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          left: 0,
          minWidth: "100%",
          maxWidth: 320,
          background: "rgba(15,20,32,0.98)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
          zIndex: 100,
          overflow: "hidden",
          padding: 6,
        }}>
          {pinnedSet && (
            <button
              type="button"
              onClick={togglePinned}
              style={{
                width: "100%",
                background: allPinnedSelected ? "rgba(56,189,248,0.18)" : "rgba(56,189,248,0.08)",
                border: "1px solid rgba(56,189,248,0.32)",
                borderRadius: 8,
                color: "#C084FC",
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                marginBottom: 6,
                textAlign: "center",
                boxSizing: "border-box",
              }}
            >
              {allPinnedSelected ? `Clear ${pinnedLabel.toLowerCase()}` : pinnedLabel}
            </button>
          )}
          {searchable && (
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: "100%",
                background: "rgba(30,41,59,0.6)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 8,
                color: "#cbd5e1",
                padding: "8px 12px",
                fontSize: 12,
                outline: "none",
                marginBottom: 6,
                boxSizing: "border-box",
              }}
            />
          )}
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {orderedFiltered.length === 0 ? (
              <div style={{ padding: "10px 12px", fontSize: 12, color: "#475569", textAlign: "center" }}>No matches</div>
            ) : multi ? orderedFiltered.map((o) => {
              const current = Array.isArray(value) ? value : [];
              const isChecked = current.includes(o.value);
              return (
                <div
                  key={o.value}
                  onClick={() => handleMultiToggle(o.value)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 500,
                    color: isChecked ? "#e2e8f0" : "#cbd5e1",
                    background: isChecked ? "rgba(56,189,248,0.06)" : "transparent",
                    transition: "background 0.12s",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                  onMouseOver={e => e.currentTarget.style.background = isChecked ? "rgba(56,189,248,0.1)" : "rgba(255,255,255,0.04)"}
                  onMouseOut={e => e.currentTarget.style.background = isChecked ? "rgba(56,189,248,0.06)" : "transparent"}
                >
                  <div style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                    border: isChecked ? "1.5px solid #C084FC" : "1.5px solid rgba(255,255,255,0.15)",
                    background: isChecked ? "rgba(56,189,248,0.15)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.15s",
                  }}>
                    {isChecked && (
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#C084FC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  {o.label}
                </div>
              );
            }).flatMap((node, i) => {
              // Visual separator below the last pinned item so the divide is obvious.
              if (i + 1 < orderedFiltered.length && pinnedSet && pinnedSet.has(orderedFiltered[i].value) && !pinnedSet.has(orderedFiltered[i + 1].value)) {
                return [
                  node,
                  <div key={`sep-${i}`} style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '4px 6px' }} />,
                ];
              }
              return [node];
            }) : filtered.map(o => {
              const isSelected = o.value === value;
              return (
                <div
                  key={o.value}
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: isSelected ? 600 : 500,
                    color: isSelected ? "#C084FC" : "#cbd5e1",
                    background: isSelected ? "rgba(56,189,248,0.08)" : "transparent",
                    transition: "background 0.12s",
                  }}
                  onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                  onMouseOut={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                >
                  {o.label}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
