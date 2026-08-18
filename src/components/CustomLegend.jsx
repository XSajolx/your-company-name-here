import React, { useState } from 'react';
import './CustomLegend.css';

const CustomLegend = ({
    data = [],
    colors = [],
    onHover = () => { },
    onClick = () => { },
    onDrillIn = null,     // optional: (item, index) => void — renders a drill-in icon per row on hover
    onExport = null,      // optional: (item, index) => void — renders an export CSV icon per row on hover
    maxHeight = 300
}) => {
    const [selectedItems, setSelectedItems] = useState(new Set());

    const handleItemClick = (item, index) => {
        const newSelected = new Set(selectedItems);
        if (newSelected.has(item.name)) {
            newSelected.delete(item.name);
        } else {
            newSelected.add(item.name);
        }
        setSelectedItems(newSelected);
        onClick(item, index);
    };

    const handleItemHover = (item, index, isEntering) => {
        onHover(item, index, isEntering);
    };

    const handleKeyDown = (e, item, index) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleItemClick(item, index);
        }
    };

    return (
        <div className="custom-legend">
            {/* Scrollable Legend List */}
            <div
                className="legend-list"
                style={{ maxHeight: `${maxHeight}px` }}
            >
                {data.length === 0 ? (
                    <div className="legend-empty">No topics found</div>
                ) : (
                    data.map((item, index) => {
                        // Use the color passed in the item or fallback to the colors array
                        const color = item.color || colors[index % colors.length] || '#C084FC';
                        const isSelected = selectedItems.has(item.name);

                        return (
                            <div
                                key={item.name}
                                className={`legend-item ${isSelected ? 'selected' : ''}`}
                                onClick={() => handleItemClick(item, index)}
                                onMouseEnter={() => handleItemHover(item, index, true)}
                                onMouseLeave={() => handleItemHover(item, index, false)}
                                onKeyDown={(e) => handleKeyDown(e, item, index)}
                                role="button"
                                tabIndex={0}
                                aria-pressed={isSelected}
                                title={item.name}
                            >
                                {/* Color Dot */}
                                <span
                                    className="legend-dot"
                                    style={{ backgroundColor: color }}
                                ></span>

                                {/* Label */}
                                <span className="legend-label">
                                    {item.name}
                                </span>

                                {/* Mini Bar */}
                                <div className="legend-bar-container">
                                    <div
                                        className="legend-bar"
                                        style={{
                                            width: `${item.percentage}%`,
                                            backgroundColor: color
                                        }}
                                    ></div>
                                </div>

                                {/* Value (prefer real count if provided — used by donuts that normalize `value` for sizing) */}
                                <span className="legend-percentage">
                                    {item.count ?? item.value}
                                </span>

                                {/* Row actions — visible on hover when handlers are provided */}
                                {(onDrillIn || onExport) && (
                                    <span className="legend-actions">
                                        {onDrillIn && (
                                            <button
                                                type="button"
                                                className="legend-action-btn"
                                                title="Drill in"
                                                onClick={(e) => { e.stopPropagation(); onDrillIn(item, index); }}
                                            >
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <circle cx="11" cy="11" r="7" />
                                                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                                </svg>
                                            </button>
                                        )}
                                        {onExport && (
                                            <button
                                                type="button"
                                                className="legend-action-btn"
                                                title="Export CSV"
                                                onClick={(e) => { e.stopPropagation(); onExport(item, index); }}
                                            >
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                    <polyline points="7 10 12 15 17 10" />
                                                    <line x1="12" y1="15" x2="12" y2="3" />
                                                </svg>
                                            </button>
                                        )}
                                    </span>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default CustomLegend;
