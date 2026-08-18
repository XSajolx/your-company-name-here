import React, { useState, useRef, useEffect } from 'react';

const SearchableSelect = ({ options, value, onChange, label, disabled = false, showAllOption = true, multi = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = options.filter(option =>
        option.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Multi-select helpers
    const isAll = multi ? (!value || value.length === 0) : value === 'All';
    const selected = multi ? new Set(value || []) : null;

    const handleSelect = (option, e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        if (!multi) {
            onChange(option);
            setIsOpen(false);
            setSearchTerm('');
        } else {
            const next = new Set(selected);
            if (next.has(option)) next.delete(option); else next.add(option);
            onChange(next.size === 0 ? [] : [...next]);
        }
    };

    const handleAll = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        if (!multi) {
            onChange('All');
        } else {
            onChange([]);
        }
        setIsOpen(false);
        setSearchTerm('');
    };

    const getDisplayText = () => {
        if (isAll) {
            if (label === 'Country') return 'All Countries';
            if (label === 'Sentiment') return 'Sentiments';
            if (label === 'Team Lead') return 'All Teams';
            return `All ${label}s`;
        }
        if (multi) return `${value.length} selected`;
        return value;
    };

    const Checkbox = ({ checked }) => (
        <span style={{
            width: 14, height: 14,
            border: `1.5px solid ${checked ? '#C084FC' : '#6E7681'}`,
            borderRadius: 3,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, color: '#C084FC', flexShrink: 0,
            background: checked ? 'rgba(88, 166, 255, 0.15)' : 'transparent'
        }}>{checked ? '✓' : ''}</span>
    );

    return (
        <div ref={dropdownRef} style={{ position: 'relative', minWidth: '130px' }}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                style={{
                    width: '100%',
                    padding: '0.5rem 0.875rem',
                    border: '1px solid #30363D',
                    borderRadius: '8px',
                    backgroundColor: disabled ? '#21262D' : '#21262D',
                    color: disabled ? '#6E7681' : (isAll ? '#C9D1D9' : '#F8FAFC'),
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.8125rem',
                    fontWeight: '500',
                    outline: 'none',
                    transition: 'all 0.15s ease'
                }}
            >
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {getDisplayText()}
                </span>
                <span style={{
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                    marginLeft: '0.5rem',
                    fontSize: '0.625rem',
                    color: '#8B949E'
                }}>▼</span>
            </button>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: '0.25rem',
                    backgroundColor: '#1C2128',
                    border: '1px solid #30363D',
                    borderRadius: '8px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    zIndex: 1000,
                    maxHeight: '300px',
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: '180px'
                }}>
                    <div style={{ padding: '0.5rem', borderBottom: '1px solid #30363D' }}>
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                }
                            }}
                            style={{
                                width: '100%',
                                padding: '0.5rem',
                                border: '1px solid #30363D',
                                borderRadius: '6px',
                                fontSize: '0.8125rem',
                                outline: 'none',
                                backgroundColor: '#0D1117',
                                color: '#C9D1D9',
                                boxSizing: 'border-box'
                            }}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                        />
                    </div>

                    <div style={{
                        overflowY: 'auto',
                        maxHeight: '240px',
                        padding: '0.25rem'
                    }}>
                        {showAllOption && (
                            <div
                                onClick={(e) => handleAll(e)}
                                style={{
                                    padding: '0.5rem 0.75rem',
                                    cursor: 'pointer',
                                    borderRadius: '6px',
                                    backgroundColor: isAll ? 'rgba(88, 166, 255, 0.15)' : 'transparent',
                                    color: isAll ? '#C084FC' : '#C9D1D9',
                                    fontSize: '0.8125rem',
                                    marginBottom: '0.125rem',
                                    transition: 'all 0.1s ease',
                                    display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                                onMouseEnter={(e) => {
                                    if (!isAll) e.currentTarget.style.backgroundColor = '#21262D';
                                }}
                                onMouseLeave={(e) => {
                                    if (!isAll) e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                            >
                                {multi && <Checkbox checked={isAll} />}
                                {label === 'Country' ? 'All Countries' : label === 'Sentiment' ? 'Sentiments' : label === 'Team Lead' ? 'All Teams' : `All ${label}s`}
                            </div>
                        )}
                        {filteredOptions.map(option => {
                            const isSelected = multi ? selected.has(option) : value === option;
                            return (
                            <div
                                key={option}
                                onClick={(e) => handleSelect(option, e)}
                                style={{
                                    padding: '0.5rem 0.75rem',
                                    cursor: 'pointer',
                                    borderRadius: '6px',
                                    backgroundColor: isSelected ? 'rgba(88, 166, 255, 0.15)' : 'transparent',
                                    color: isSelected ? '#C084FC' : '#C9D1D9',
                                    fontSize: '0.8125rem',
                                    marginBottom: '0.125rem',
                                    transition: 'all 0.1s ease',
                                    display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                                onMouseEnter={(e) => {
                                    if (!isSelected) e.currentTarget.style.backgroundColor = '#21262D';
                                }}
                                onMouseLeave={(e) => {
                                    if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                            >
                                {multi && <Checkbox checked={isSelected} />}
                                {option}
                            </div>
                            );
                        })}
                        {filteredOptions.length === 0 && (
                            <div style={{ padding: '1rem', textAlign: 'center', color: '#6E7681', fontSize: '0.8125rem' }}>
                                No results found
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SearchableSelect;
