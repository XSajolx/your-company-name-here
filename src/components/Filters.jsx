import PillDropdown from './PillDropdown';
import DateRangePicker from './DateRangePicker';

const Filters = ({ filters, onFilterChange, options, dateRangeMode }) => {
    const regionIcon = (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
            <line x1="8" y1="2" x2="8" y2="18"></line>
            <line x1="16" y1="6" x2="16" y2="22"></line>
        </svg>
    );
    const countryIcon = (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
    );
    const productIcon = (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>
    );
    const sentimentIcon = (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
            <line x1="9" y1="9" x2="9.01" y2="9"></line>
            <line x1="15" y1="9" x2="15.01" y2="9"></line>
        </svg>
    );

    const toArray = v => (Array.isArray(v) ? v : []);
    const stripAll = opts => (opts || []).filter(o => o !== 'All' && o !== 'all');

    const regionOpts    = stripAll(options.regions);
    const countryOpts   = stripAll(options.countries);
    const productOpts   = stripAll(options.products);
    const showSentiment = options.showSentiment !== false;

    return (
        <div className="filters-container">
            <DateRangePicker
                value={filters.dateRange}
                onChange={(value) => onFilterChange('dateRange', value)}
                mode={dateRangeMode}
                compact
            />

            {regionOpts.length > 0 && (
                <PillDropdown
                    compact
                    icon={regionIcon}
                    label="All Regions"
                    value={toArray(filters.region)}
                    onChange={(v) => onFilterChange('region', v)}
                    multi
                    options={regionOpts.map(r => ({ value: r, label: r }))}
                />
            )}

            {countryOpts.length > 0 && (
                <PillDropdown
                    compact
                    icon={countryIcon}
                    label="All Countries"
                    value={toArray(filters.country)}
                    onChange={(v) => onFilterChange('country', v)}
                    multi
                    options={countryOpts.map(c => ({ value: c, label: c }))}
                />
            )}

            {productOpts.length > 0 && (
                <PillDropdown
                    compact
                    icon={productIcon}
                    label="All Products"
                    value={toArray(filters.product)}
                    onChange={(v) => onFilterChange('product', v)}
                    multi
                    options={productOpts.map(p => ({ value: p, label: p }))}
                />
            )}

            {showSentiment && (
                <PillDropdown
                    compact
                    icon={sentimentIcon}
                    label="All Sentiments"
                    value={toArray(filters.sentiment)}
                    onChange={(v) => onFilterChange('sentiment', v)}
                    searchable={false}
                    multi
                    options={[
                        { value: 'Positive', label: 'Positive' },
                        { value: 'Neutral', label: 'Neutral' },
                        { value: 'Negative', label: 'Negative' },
                    ]}
                />
            )}
        </div>
    );
};

export default Filters;
