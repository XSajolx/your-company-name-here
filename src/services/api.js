import { supabase } from './supabaseClient';
import { getPresetRange, formatDateForInput } from '../utils/dhakaDate.js';

// Regions and country mappings for Conversation Topics
const COUNTRY_TO_REGION = {
    // Africa
    'Algeria': 'Africa', 'Botswana': 'Africa', 'Cameroon': 'Africa', 'Egypt': 'Africa',
    'Ethiopia': 'Africa', 'Gambia': 'Africa', 'Ghana': 'Africa', 'Kenya': 'Africa',
    'Madagascar': 'Africa', 'Mali': 'Africa', 'Mauritania': 'Africa', 'Morocco': 'Africa',
    'Nigeria': 'Africa', 'South Africa': 'Africa', 'Somalia': 'Africa', 'Togo': 'Africa',
    'Uganda': 'Africa', 'Zambia': 'Africa', 'Zimbabwe': 'Africa', 'Réunion': 'Africa',

    // Asia
    'Afghanistan': 'Asia', 'Azerbaijan': 'Asia', 'Bahrain': 'Asia', 'China': 'Asia',
    'Hong Kong': 'Asia', 'India': 'Asia', 'Indonesia': 'Asia', 'Iran, Islamic Republic of': 'Asia',
    'Iraq': 'Asia', 'Israel': 'Asia', 'Japan': 'Asia', 'Jordan': 'Asia',
    'Korea, Republic of': 'Asia', 'South Korea': 'Asia', 'Kyrgyzstan': 'Asia', 'Lebanon': 'Asia', 'Malaysia': 'Asia',
    'Mongolia': 'Asia', 'Nepal': 'Asia', 'Oman': 'Asia', 'Pakistan': 'Asia',
    'Philippines': 'Asia', 'Qatar': 'Asia', 'Russian Federation': 'Asia', 'Saudi Arabia': 'Asia',
    'Singapore': 'Asia', 'Taiwan': 'Asia', 'Thailand': 'Asia', 'Turkey': 'Asia',
    'United Arab Emirates': 'Asia', 'Uzbekistan': 'Asia', 'Viet Nam': 'Asia', 'Vietnam': 'Asia',

    // Europe
    'Austria': 'Europe', 'Belgium': 'Europe', 'Bulgaria': 'Europe', 'Cyprus': 'Europe',
    'Czech Republic': 'Europe', 'Estonia': 'Europe', 'Finland': 'Europe', 'France': 'Europe',
    'Germany': 'Europe', 'Hungary': 'Europe', 'Ireland': 'Europe', 'Italy': 'Europe',
    'Netherlands': 'Europe', 'Poland': 'Europe', 'Romania': 'Europe', 'Serbia': 'Europe',
    'Slovakia': 'Europe', 'Spain': 'Europe', 'Sweden': 'Europe', 'Switzerland': 'Europe',
    'Ukraine': 'Europe', 'United Kingdom': 'Europe',

    // North America
    'Canada': 'North America', 'Costa Rica': 'North America', 'Cuba': 'North America',
    'Dominican Republic': 'North America', 'El Salvador': 'North America', 'Haiti': 'North America',
    'Mexico': 'North America', 'Trinidad and Tobago': 'North America', 'United States': 'North America',
    'Bahamas': 'North America', 'Aruba': 'North America',

    // Oceania
    'Australia': 'Oceania', 'French Polynesia': 'Oceania',

    // South America
    'Argentina': 'South America', 'Bolivia, Plurinational State of': 'South America',
    'Chile': 'South America', 'Colombia': 'South America', 'Paraguay': 'South America',
    'Venezuela, Bolivarian Republic of': 'South America'
};

const REGIONS = ['Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America'];
// Helper to get date filter for DB query (created_date_bd = Bangladesh date YYYY-MM-DD).
// All presets resolve in Dhaka (GMT+6) so today/yesterday don't slip when the
// browser's local TZ disagrees with the Dhaka civil day.
const getDbDateFilter = (dateRange) => {
    if (!dateRange) return { start: null, end: null };

    if (dateRange.startsWith('custom_')) {
        const parts = dateRange.split('_');
        if (parts.length === 3) {
            return { start: parts[1], end: parts[2] };
        }
        return { start: null, end: null };
    }

    const { from, to } = getPresetRange(dateRange);
    return { start: formatDateForInput(from), end: formatDateForInput(to) };
};

// Fetch pre-aggregated topic distribution using server-side RPC (fast!)
export const fetchTopicDistribution = async () => {
    try {
        console.log('Fetching topic distribution via RPC...');
        const { data, error } = await supabase.rpc('get_topic_distribution', { p_limit: 50 });

        if (error) {
            console.error('Error fetching topic distribution:', error);
            return [];
        }

        console.log(`Got ${data?.length || 0} topic distribution entries`);
        return data || [];
    } catch (err) {
        console.error('Exception in topic distribution:', err);
        return [];
    }
};

// Cache for topic mapping
let topicMappingCache = null;

const fetchTopicMappingInternal = async () => {
    if (topicMappingCache) return topicMappingCache;
    try {
        console.log('Fetching topic mapping...');
        const { data, error } = await supabase
            .from('all_topics_with_main')
            .select('topic, main_topic')
            .limit(10000); // Increased limit to ensure all topics are mapped

        if (error) {
            console.error('Error fetching topic mapping:', error);
            // Return empty object on error so app doesn't crash
            return {};
        }

        topicMappingCache = {};
        data?.forEach(row => {
            if (row.topic && row.main_topic) {
                topicMappingCache[row.topic.trim()] = row.main_topic.trim();
            }
        });
        console.log(`Loaded ${Object.keys(topicMappingCache).length} topic mappings`);
        return topicMappingCache;
    } catch (err) {
        console.error('Exception in topic mapping:', err);
        return {};
    }
};

// Start: Optimized Supabase Data Fetching
async function getSupabaseData(filters = {}) {
    try {
        console.log('Fetching Supabase data with filters:', filters);

        // 1. Build Query for Conversations
        // Updated to fetch Main-Topics, Sub-Topics, Sentiment Start/End, and Client Favor
        let query = supabase
            .from('Intercom Topic')
            .select('created_date_bd,"Conversation ID","Country","Region","Product",assigned_channel_name,"CX Score Rating","Main-Topics","Sub-Topics","Sentiment Start","Sentiment End","Was it in client\'s favor?","Transcript"');

        // Server-side date filter: created_date_bd = Bangladesh date (YYYY-MM-DD)
        if (filters.dateRangeStart) {
            query = query.gte('created_date_bd', filters.dateRangeStart);
        }
        if (filters.dateRangeEnd) {
            query = query.lte('created_date_bd', filters.dateRangeEnd);
        }

        // OPTIMIZATION: Filter out rows without date; restrict to CFD/Futures only
        query = query
            .not('created_date_bd', 'is', null)
            .in('Product', ['CFD', 'Futures'])
            .order('created_date_bd', { ascending: false })
            .limit(100000);

        const { data: conversations, error: conversationsError } = await query;
        if (conversationsError) throw conversationsError;

        console.log(`Fetched ${conversations?.length || 0} conversations`);

        if (!conversations || conversations.length === 0) {
            return [];
        }

        // 6. Transform Data
        const transformedData = [];

        conversations.forEach(row => {
            const convId = row['Conversation ID'] ? String(row['Conversation ID']).trim() : '';
            const mappedRegion = COUNTRY_TO_REGION[row.Country] || 'Unknown';

            // Get arrays from JSONB columns
            // Handle cases where it might be null
            let mainTopics = row['Main-Topics'] || [];
            let subTopics = row['Sub-Topics'] || [];

            // Ensure they are arrays (if string/null came back)
            if (typeof mainTopics === 'string') {
                try { mainTopics = JSON.parse(mainTopics); } catch (e) { mainTopics = [mainTopics]; }
            }
            if (!Array.isArray(mainTopics)) mainTopics = [];

            if (typeof subTopics === 'string') {
                try { subTopics = JSON.parse(subTopics); } catch (e) { subTopics = [subTopics]; }
            }
            if (!Array.isArray(subTopics)) subTopics = [];

            // Filter out nulls/empty strings
            mainTopics = mainTopics.filter(t => t && t.trim());
            subTopics = subTopics.filter(t => t && t.trim());

            // DON'T skip rows without topics - include them so total count is accurate
            // Topics can be empty arrays, but conversation should still be counted

            transformedData.push({
                created_date_bd: row.created_date_bd || '',
                conversation_id: convId,
                country: row.Country || 'Unknown',
                region: mappedRegion,
                product: row.Product || 'Unknown',
                channel: row.assigned_channel_name || 'Unknown',
                cx_score_rating: row['CX Score Rating'] ? parseInt(row['CX Score Rating']) : 0,
                topic: subTopics,      // Now an array
                main_topic: mainTopics, // Now an array
                sentimentStart: row['Sentiment Start'] || null, // Sentiment at start
                sentiment: row['Sentiment End'] || null,  // Sentiment End column
                clientFavor: row["Was it in client's favor?"] || null, // Client favor outcome
                transcript: row['Transcript'] || null // For word cloud
            });
        });

        // Don't merge - return all rows as-is (including duplicates)
        // This shows the actual row count from the database

        if (transformedData.length > 0) {
            console.log('API Transformed Data [0]:', JSON.stringify(transformedData[0]));
            console.log(`Total rows returned: ${transformedData.length}`);
        }

        return transformedData;

    } catch (error) {
        console.error('Error fetching Supabase data:', error);
        return [];
    }
}


// Apply filters to the data (Client-side Refinement)
function applyFilters(data, filters) {
    let filteredData = [...data];

    // Apply date filter: use date part (YYYY-MM-DD) of created_date_bd to avoid timezone issues
    const getItemDateStr = (item) => {
        const v = item.created_date_bd;
        if (!v) return '';
        return typeof v === 'string' ? v.slice(0, 10) : (v.toISOString ? v.toISOString().slice(0, 10) : '');
    };
    if (filters.dateRange) {
        const range = getDbDateFilter(filters.dateRange);
        if (range.start) {
            filteredData = filteredData.filter(item => {
                const d = getItemDateStr(item);
                if (!d) return false;
                if (range.end) return d >= range.start && d <= range.end;
                return d >= range.start;
            });
        }
    }

    // Accept either a string ("All" or a value) or an array for each filter
    const asList = v => {
        if (Array.isArray(v)) return v;
        if (v == null || v === 'All' || v === 'all') return [];
        return [v];
    };

    // Apply country filter
    const countries = asList(filters.country);
    if (countries.length > 0) {
        filteredData = filteredData.filter(item => countries.includes(item.country));
    }

    // Apply region filter
    const regions = asList(filters.region);
    if (regions.length > 0) {
        filteredData = filteredData.filter(item => regions.includes(item.region));
    }

    // Apply product filter
    const products = asList(filters.product);
    if (products.length > 0) {
        filteredData = filteredData.filter(item => products.includes(item.product));
    }

    // Apply sentiment filter (case-insensitive substring match, any-of)
    const sentiments = asList(filters.sentiment).map(s => String(s).toLowerCase());
    if (sentiments.length > 0) {
        filteredData = filteredData.filter(item => {
            if (!item.sentiment) return false;
            const itemS = item.sentiment.toLowerCase();
            return sentiments.some(f => itemS === f || itemS.includes(f));
        });
    }

    return filteredData;
}

export const fetchConversations = async (filters) => {
    // Optimization: Apply server-side filters if possible
    const range = getDbDateFilter(filters.dateRange);
    const dbFilters = {
        ...filters,
        dateRangeStart: range.start,
        dateRangeEnd: range.end
    };

    // Fetch with push-down predicates
    const data = await getSupabaseData(dbFilters);

    return applyFilters(data, filters);
};

export const fetchTopics = async () => {
    try {
        const { data: topics, error } = await supabase
            .from('all_topics')
            .select('topic')
            .limit(10000); // Increased limit

        if (error) throw error;

        const uniqueTopics = [...new Set(
            topics
                ?.map(row => row.topic)
                .filter(topic => topic && topic.trim())
        )];

        uniqueTopics.sort();
        return uniqueTopics;
    } catch (error) {
        console.error('Error fetching topics:', error);
        return [];
    }
};

// Fetch known main topics
export const fetchMainTopics = async () => {
    // Return hardcoded list since mapping table is missing and user wants to rely on triggered column
    return [
        'KYC_Issue', 'Account Related Issue', 'Dashboard Related Issue', 'Breach Issue',
        'Login_Issue', 'Password issue', 'Next Phase Button Missing', 'Platform Issue',
        'Trade Issue', 'Slippage', 'SWAP', 'Commission', 'Payout related issue',
        'Certificate Issue', 'Competition Issue', 'Restriction Related Issue',
        'Verdict from different team', 'Tech Issue', 'Other Payment Issues',
        'Crypto Payment Isssue', 'Card Payment issue', 'Refund Related Issue',
        'Coupon Code related issue', 'Discount related issue', 'Offer Related Query',
        'Random Issues'
    ];
};


export const fetchFilters = async () => {
    try {
        console.log('Fetching filter options from Intercom Topic...');

        // Get countries from Intercom Topic using RPC
        const { data: countryData, error: countryError } = await supabase
            .rpc('get_intercom_countries');

        if (countryError) {
            console.error('Error fetching countries (RPC):', countryError);
        }

        // Get products from Intercom Topic using RPC
        const { data: productData, error: productError } = await supabase
            .rpc('get_intercom_products');

        if (productError) {
            console.error('Error fetching products (RPC):', productError);
        }

        let countries = (countryData || []).filter(c => c && c.trim()).sort();
        const products = (productData || []).filter(p => p && p.trim()).sort();

        // Fallback for Countries if empty
        if (countries.length === 0) {
            console.log('Using static country list fallback');
            countries = Object.keys(COUNTRY_TO_REGION).sort();
        }

        // Fallback for Products if empty (e.g. RPC not created yet)
        if (products.length === 0) {
            products.push('CFD', 'Futures');
        }

        console.log(`Got ${REGIONS.length} regions, ${countries.length} countries, ${products.length} products`);

        return {
            regions: REGIONS,
            countries,
            products,
            countryToRegion: COUNTRY_TO_REGION
        };
    } catch (error) {
        console.error('Error fetching filters:', error);
        return {
            regions: REGIONS,
            countries: [],
            products: ['CFD', 'Futures'],
            countryToRegion: COUNTRY_TO_REGION
        };
    }
};


// =====================================================
// CSAT Dashboard API Functions
// =====================================================

// Helper to calculate date ranges
export const calculateDateRanges = (dateRange) => {
    // Use Dhaka (GMT+6) timezone for all date calculations
    const DHAKA_MS = 6 * 3600000;
    const now = new Date(Date.now() + DHAKA_MS);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let curFrom, curTo, prevFrom, prevTo;

    if (dateRange && dateRange.startsWith('custom_')) {
        const parts = dateRange.split('_');
        if (parts.length === 3) {
            const [fy, fm, fd] = parts[1].split('-').map(Number);
            const [ty, tm, td] = parts[2].split('-').map(Number);
            curFrom = new Date(fy, fm - 1, fd);
            curTo = new Date(ty, tm - 1, td);
            const durationMs = curTo.getTime() - curFrom.getTime();
            prevTo = new Date(curFrom.getTime() - 86400000); // day before
            prevFrom = new Date(prevTo.getTime() - durationMs);
        }
    }

    if (!curFrom) {
        const daysMap = { 'today': 0, 'yesterday': 1, 'last_7_days': 7, 'last_30_days': 30, 'last_90_days': 90, 'last_3_months': 90 };
        const days = daysMap[dateRange] ?? 90;

        if (dateRange === 'today') {
            curFrom = new Date(today);
            curTo = new Date(today);
            prevFrom = new Date(today.getTime() - 86400000);
            prevTo = new Date(today.getTime() - 86400000);
        } else if (dateRange === 'yesterday') {
            curFrom = new Date(today.getTime() - 86400000);
            curTo = new Date(today.getTime() - 86400000);
            prevFrom = new Date(today.getTime() - 2 * 86400000);
            prevTo = new Date(today.getTime() - 2 * 86400000);
        } else if (dateRange === 'this_week') {
            const dow = today.getDay();
            curFrom = new Date(today);
            curFrom.setDate(curFrom.getDate() - dow);
            curTo = new Date(today);
            prevTo = new Date(curFrom.getTime() - 86400000);
            prevFrom = new Date(prevTo);
            prevFrom.setDate(prevFrom.getDate() - 6);
        } else if (dateRange === 'this_month') {
            curFrom = new Date(today.getFullYear(), today.getMonth(), 1);
            curTo = new Date(today);
            const prevMonthEnd = new Date(curFrom.getTime() - 86400000);
            prevFrom = new Date(prevMonthEnd.getFullYear(), prevMonthEnd.getMonth(), 1);
            prevTo = prevMonthEnd;
        } else if (dateRange === 'last_month') {
            const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            curTo = new Date(firstOfThisMonth.getTime() - 86400000);
            curFrom = new Date(curTo.getFullYear(), curTo.getMonth(), 1);
            const durationMs = curTo.getTime() - curFrom.getTime();
            prevTo = new Date(curFrom.getTime() - 86400000);
            prevFrom = new Date(prevTo.getTime() - durationMs);
        } else {
            curTo = new Date(today);
            curFrom = new Date(today);
            curFrom.setDate(curFrom.getDate() - days);
            prevTo = new Date(curFrom.getTime() - 86400000);
            prevFrom = new Date(prevTo);
            prevFrom.setDate(prevFrom.getDate() - days);
        }
    }

    const fmt = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
    };

    return { curFrom: fmt(curFrom), curTo: fmt(curTo), prevFrom: fmt(prevFrom), prevTo: fmt(prevTo) };
};

// Fetch CSAT metrics (Overall, CEx, Product)
export const fetchCSATMetrics = async (filters) => {
    try {
        const { curFrom, curTo, prevFrom, prevTo } = calculateDateRanges(filters.dateRange || 'last_90_days');

        // Fetch all rated rows from CSAT New
        const { data, error } = await supabase
            .from('CSAT New')
            .select('Date, "Conversation rating", Country, "Product Type", "Concern regarding product (Catagory)"')
            .in('Product Type', ['CFD', 'Futures'])
            .range(0, 49999)
            .not('Conversation rating', 'is', null)
            .gte('Conversation rating', 1)
            .lte('Conversation rating', 5);

        if (error) throw error;

        // Date parser for M/D/YYYY or YYYY-MM-DD format
        const parseDate = (dateStr) => {
            if (!dateStr) return null;
            if (dateStr.includes('/')) {
                const parts = dateStr.split('/');
                if (parts.length === 3) return new Date(parts[2], parts[0] - 1, parts[1]);
            }
            if (dateStr.includes('-')) {
                const parts = dateStr.split('-');
                if (parts.length === 3) return new Date(parts[0], parts[1] - 1, parts[2]);
            }
            return null;
        };

        const formatToMMDDYYYY = (dateStr) => {
            const [year, month, day] = dateStr.split('-');
            return `${parseInt(month)}/${parseInt(day)}/${year}`;
        };

        const curFromDate = parseDate(formatToMMDDYYYY(curFrom));
        const curToDate = parseDate(formatToMMDDYYYY(curTo));
        const prevFromDate = parseDate(formatToMMDDYYYY(prevFrom));
        const prevToDate = parseDate(formatToMMDDYYYY(prevTo));

        const filterRow = (row, fromDate, toDate) => {
            const rowDate = parseDate(row.Date);
            if (!rowDate || rowDate < fromDate || rowDate > toDate) return false;
            if (filters.countries?.length > 0 && !filters.countries.includes(row.Country)) return false;
            if (filters.products?.length > 0 && !filters.products.includes(row['Product Type'])) return false;
            return true;
        };

        const calcPeriod = (rows) => {
            const validCSAT = rows.length;
            const highCSAT = rows.filter(r => r['Conversation rating'] >= 4).length;
            const lowRows = rows.filter(r => r['Conversation rating'] <= 3);
            const lowOrg = lowRows.length;
            // lowProd = low rating WITH a product concern category, lowCEx = low rating WITHOUT
            const lowProd = lowRows.filter(r => r['Concern regarding product (Catagory)'] && r['Concern regarding product (Catagory)'].trim()).length;
            const lowCEx = lowOrg - lowProd;
            return { validCSAT, highCSAT, lowOrg, lowCEx, lowProd, invalid: 0 };
        };

        const curRows = (data || []).filter(r => filterRow(r, curFromDate, curToDate));
        const prevRows = (data || []).filter(r => filterRow(r, prevFromDate, prevToDate));

        return {
            current: calcPeriod(curRows),
            previous: calcPeriod(prevRows)
        };
    } catch (error) {
        console.error('Error fetching CSAT metrics:', error);
        throw error;
    }
};

// Fetch raw CSAT rows for drill-in feature
export const fetchCSATRawRows = async (filters) => {
    try {
        const { curFrom, curTo } = calculateDateRanges(filters.dateRange || 'last_90_days');

        const formatToMMDDYYYY = (dateStr) => {
            const [year, month, day] = dateStr.split('-');
            return `${parseInt(month)}/${parseInt(day)}/${year}`;
        };

        const { data, error } = await supabase
            .from('CSAT New')
            .select('"Conversation ID", Date, "Created at", "Conversation rating", "Conversation rating remark", "Agent Name", "Agent Intercom Name", "Agent Fault", "Notes", Country, "Product Type", "Concern regarding product (Catagory)", "Concern regarding product (Sub-catagory)"')
            .in('Product Type', ['CFD', 'Futures'])
            .range(0, 49999)
            .not('Conversation rating', 'is', null)
            .gte('Conversation rating', 1)
            .lte('Conversation rating', 5);

        if (error) throw error;

        const parseDate = (dateStr) => {
            if (!dateStr) return null;
            if (dateStr.includes('/')) { const p = dateStr.split('/'); if (p.length === 3) return new Date(p[2], p[0] - 1, p[1]); }
            if (dateStr.includes('-')) { const p = dateStr.split('-'); if (p.length === 3) return new Date(p[0], p[1] - 1, p[2]); }
            return null;
        };

        const fromDate = parseDate(formatToMMDDYYYY(curFrom));
        const toDate = parseDate(formatToMMDDYYYY(curTo));

        return (data || []).filter(row => {
            const rowDate = parseDate(row.Date);
            if (!rowDate || rowDate < fromDate || rowDate > toDate) return false;
            if (filters.countries?.length > 0 && !filters.countries.includes(row.Country)) return false;
            if (filters.products?.length > 0 && !filters.products.includes(row['Product Type'])) return false;
            return true;
        });
    } catch (error) {
        console.error('Error fetching CSAT raw rows:', error);
        return [];
    }
};

// Persist the manual "Agent Fault" (Yes/No) judgment on a CSAT row.
// Mirrors the CSAT Analysis sheet's agent-fault dropdown. Pass null to clear.
export const updateCsatAgentFault = async (conversationId, value) => {
    try {
        const { error } = await supabase
            .from('CSAT New')
            .update({ 'Agent Fault': value })
            .eq('Conversation ID', conversationId);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error updating Agent Fault:', error);
        return false;
    }
};

// Manually set/override the rated agent on a CSAT row (real name + Intercom alias).
// Pass null/null to clear. Used by the editable Agent column in CSAT Records.
export const updateCsatAgent = async (conversationId, agentName, agentIntercomName) => {
    try {
        const { error } = await supabase
            .from('CSAT New')
            .update({ 'Agent Name': agentName || null, 'Agent Intercom Name': agentIntercomName || null })
            .eq('Conversation ID', conversationId);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error updating agent:', error);
        return false;
    }
};

// Persist a manual internal "Notes" entry on a CSAT row. Pass '' / null to clear.
export const updateCsatNotes = async (conversationId, value) => {
    try {
        const { error } = await supabase
            .from('CSAT New')
            .update({ 'Notes': value || null })
            .eq('Conversation ID', conversationId);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error updating Notes:', error);
        return false;
    }
};

// Fetch product dissatisfaction reasons (calculated on frontend)
// Split the product-concern distribution into main-category and sub-category counts,
// both scoped to low-rated CSAT rows and the caller's filters. Used by the tabbed
// ProductConcernsChart so each tab shows its own distribution.
export const fetchCSATProductCategoryBreakdown = async (filters) => {
    try {
        const { curFrom, curTo } = calculateDateRanges(filters.dateRange || 'last_90_days');

        const formatToMMDDYYYY = (dateStr) => {
            const [year, month, day] = dateStr.split('-');
            return `${parseInt(month)}/${parseInt(day)}/${year}`;
        };
        const fromDate = formatToMMDDYYYY(curFrom);
        const toDate = formatToMMDDYYYY(curTo);

        const { data, error } = await supabase
            .from('CSAT New')
            .select('Date, "Conversation rating", "Concern regarding product (Catagory)", "Concern regarding product (Sub-catagory)", Country, "Product Type"')
            .in('Product Type', ['CFD', 'Futures'])
            .range(0, 49999)
            .not('Conversation rating', 'is', null)
            .in('Conversation rating', [1, 2]);
        if (error) throw error;

        const parseDate = (d) => {
            if (!d) return null;
            if (d.includes('-')) { const p = d.split('-'); if (p.length === 3) return new Date(p[0], p[1] - 1, p[2]); }
            if (d.includes('/')) { const p = d.split('/'); if (p.length === 3) return new Date(p[2], p[0] - 1, p[1]); }
            return null;
        };
        const fromDateObj = parseDate(fromDate);
        const toDateObj = parseDate(toDate);

        const filtered = (data || []).filter(row => {
            const rowDate = parseDate(row.Date);
            if (!rowDate || rowDate < fromDateObj || rowDate > toDateObj) return false;
            if (filters.countries?.length > 0 && !filters.countries.includes(row.Country)) return false;
            if (filters.products?.length > 0 && !filters.products.includes(row['Product Type'])) return false;
            return true;
        });

        const catCounts = {};
        const subCounts = {};
        filtered.forEach(row => {
            const cat = row['Concern regarding product (Catagory)'];
            const sub = row['Concern regarding product (Sub-catagory)'];
            if (cat && cat.trim()) catCounts[cat.trim()] = (catCounts[cat.trim()] || 0) + 1;
            if (sub && sub.trim()) subCounts[sub.trim()] = (subCounts[sub.trim()] || 0) + 1;
        });

        const toSortedArr = (counts) => Object.entries(counts)
            .map(([reason, count]) => ({ reason, current_count: count }))
            .sort((a, b) => b.current_count - a.current_count);

        return { categories: toSortedArr(catCounts), subCategories: toSortedArr(subCounts) };
    } catch (error) {
        console.error('Error fetching CSAT product category breakdown:', error);
        return { categories: [], subCategories: [] };
    }
};

export const fetchCSATProductReasons = async (filters) => {
    try {
        const { curFrom, curTo } = calculateDateRanges(filters.dateRange || 'last_90_days');

        console.log('fetchCSATProductReasons: Date ranges:', { curFrom, curTo });
        console.log('fetchCSATProductReasons: Filters:', filters);

        // Convert YYYY-MM-DD to MM/DD/YYYY for comparison
        const formatToMMDDYYYY = (dateStr) => {
            const [year, month, day] = dateStr.split('-');
            return `${parseInt(month)}/${parseInt(day)}/${year}`;
        };

        const fromDate = formatToMMDDYYYY(curFrom);
        const toDate = formatToMMDDYYYY(curTo);

        // Fetch data from CSAT New table
        let query = supabase
            .from('CSAT New')
            .select('Date, "Conversation rating", "Concern regarding product (Catagory)", "Concern regarding product (Sub-catagory)", Country, "Product Type"')
            .in('Product Type', ['CFD', 'Futures'])
            .range(0, 49999)
            .not('Conversation rating', 'is', null)
            .in('Conversation rating', [1, 2]); // Only low ratings

        const { data, error } = await query;

        if (error) throw error;

        // Filter and calculate on frontend
        const parseDate = (dateStr) => {
            if (!dateStr) return null;
            if (dateStr.includes('-')) { const p = dateStr.split('-'); if (p.length === 3) return new Date(p[0], p[1] - 1, p[2]); }
            if (dateStr.includes('/')) { const p = dateStr.split('/'); if (p.length === 3) return new Date(p[2], p[0] - 1, p[1]); }
            return null;
        };

        const fromDateObj = parseDate(fromDate);
        const toDateObj = parseDate(toDate);

        // Filter data by date and other filters
        const filteredData = (data || []).filter(row => {
            const rowDate = parseDate(row.Date);
            if (!rowDate || rowDate < fromDateObj || rowDate > toDateObj) return false;
            if (filters.countries?.length > 0 && !filters.countries.includes(row.Country)) return false;
            if (filters.products?.length > 0 && !filters.products.includes(row['Product Type'])) return false;
            return true;
        });

        console.log('fetchCSATProductReasons: Filtered data:', filteredData.length, 'records');

        // Count by reason (use Sub-category first, fall back to Category)
        const reasonCounts = {};
        filteredData.forEach(row => {
            const subCategory = row['Concern regarding product (Sub-catagory)'];
            const category = row['Concern regarding product (Catagory)'];

            // Use sub-category if available, otherwise use category
            const reason = (subCategory && subCategory.trim()) || (category && category.trim()) || null;

            if (reason) {
                reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
            }
        });

        // Convert to array and sort by count
        const result = Object.entries(reasonCounts).map(([reason, count]) => ({
            reason,
            current_count: count,
            previous_count: 0, // We're not calculating previous period for simplicity
            diff: count
        })).sort((a, b) => b.current_count - a.current_count);

        console.log('fetchCSATProductReasons: Calculated reasons:', result);

        return result;
    } catch (error) {
        console.error('Error fetching CSAT product reasons:', error);
        throw error;
    }
};

// Fetch support dissatisfaction reasons (low ratings without product concern = CEx/support issue)
export const fetchCSATSupportReasons = async (filters) => {
    try {
        const { curFrom, curTo } = calculateDateRanges(filters.dateRange || 'last_90_days');

        const formatToMMDDYYYY = (dateStr) => {
            const [year, month, day] = dateStr.split('-');
            return `${parseInt(month)}/${parseInt(day)}/${year}`;
        };

        const fromDate = formatToMMDDYYYY(curFrom);
        const toDate = formatToMMDDYYYY(curTo);

        // Fetch low-rated rows (1-2) that have NO product concern (= support/CEx issue)
        const { data, error } = await supabase
            .from('CSAT New')
            .select('Date, "Conversation rating", Country, "Concern regarding product (Catagory)", "Concern regarding product (Sub-catagory)"')
            .in('Product Type', ['CFD', 'Futures'])
            .range(0, 49999)
            .not('Conversation rating', 'is', null)
            .in('Conversation rating', [1, 2]);

        if (error) throw error;

        const parseDate = (dateStr) => {
            if (!dateStr) return null;
            if (dateStr.includes('-')) { const p = dateStr.split('-'); if (p.length === 3) return new Date(p[0], p[1] - 1, p[2]); }
            if (dateStr.includes('/')) { const p = dateStr.split('/'); if (p.length === 3) return new Date(p[2], p[0] - 1, p[1]); }
            return null;
        };

        const fromDateObj = parseDate(fromDate);
        const toDateObj = parseDate(toDate);

        const filteredData = (data || []).filter(row => {
            const rowDate = parseDate(row.Date);
            if (!rowDate || rowDate < fromDateObj || rowDate > toDateObj) return false;
            if (filters.countries?.length > 0 && !filters.countries.includes(row.Country)) return false;
            // Only rows WITHOUT product concern = support/CEx issue
            const hasProdConcern = row['Concern regarding product (Catagory)'] && row['Concern regarding product (Catagory)'].trim();
            return !hasProdConcern;
        });

        // For support reasons, we don't have a specific "reason" column, so return count
        return [{ reason: 'Support / Response Issue', current_count: filteredData.length, previous_count: 0, diff: filteredData.length }];
    } catch (error) {
        console.error('Error fetching CSAT support reasons:', error);
        throw error;
    }
};



// Fetch CSAT average rating trend (calculated on frontend)
export const fetchCSATTrend = async (filters) => {
    try {
        const { curFrom, curTo } = calculateDateRanges(filters.dateRange || 'last_90_days');

        console.log('fetchCSATTrend: Date ranges:', { curFrom, curTo });
        console.log('fetchCSATTrend: Filters:', filters);

        // Convert YYYY-MM-DD to MM/DD/YYYY for comparison
        const formatToMMDDYYYY = (dateStr) => {
            const [year, month, day] = dateStr.split('-');
            return `${parseInt(month)}/${parseInt(day)}/${year}`;
        };

        const fromDate = formatToMMDDYYYY(curFrom);
        const toDate = formatToMMDDYYYY(curTo);

        console.log('fetchCSATTrend: Formatted dates:', { fromDate, toDate });

        // Build query - fetch all data and filter on frontend since Date is text
        let query = supabase
            .from('CSAT New')
            .select('Date, "Conversation rating", Country, "Product Type"')
            .in('Product Type', ['CFD', 'Futures'])
            .range(0, 49999)
            .not('Conversation rating', 'is', null)
            .gte('Conversation rating', 1)
            .lte('Conversation rating', 5);

        const { data, error } = await query;

        if (error) throw error;

        // Filter and calculate on frontend
        const parseDate = (dateStr) => {
            if (!dateStr) return null;
            if (dateStr.includes('-')) { const p = dateStr.split('-'); if (p.length === 3) return new Date(p[0], p[1] - 1, p[2]); }
            if (dateStr.includes('/')) { const p = dateStr.split('/'); if (p.length === 3) return new Date(p[2], p[0] - 1, p[1]); }
            return null;
        };

        const fromDateObj = parseDate(fromDate);
        const toDateObj = parseDate(toDate);

        // Filter data
        const filteredData = (data || []).filter(row => {
            const rowDate = parseDate(row.Date);
            if (!rowDate || rowDate < fromDateObj || rowDate > toDateObj) return false;
            if (filters.countries?.length > 0 && !filters.countries.includes(row.Country)) return false;
            if (filters.products?.length > 0 && !filters.products.includes(row['Product Type'])) return false;
            return true;
        });

        console.log('fetchCSATTrend: Filtered data:', filteredData.length, 'records');

        // Calculate average rating per date
        const dateMap = {};
        filteredData.forEach(row => {
            const dateStr = row.Date;
            const rating = row['Conversation rating'];

            if (!dateMap[dateStr]) {
                dateMap[dateStr] = { sum: 0, count: 0 };
            }
            dateMap[dateStr].sum += rating;
            dateMap[dateStr].count += 1;
        });

        // Convert to array and calculate averages
        const result = Object.entries(dateMap).map(([dateStr, stats]) => {
            // Parse MM/DD/YYYY or YYYY-MM-DD to YYYY-MM-DD
            let formattedDate = dateStr;
            if (dateStr.includes('/')) {
                const parts = dateStr.split('/');
                if (parts.length === 3) formattedDate = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
            }

            return {
                date: formattedDate,
                avg_rating: Math.round((stats.sum / stats.count) * 100) / 100  // Round to 2 decimals
            };
        }).sort((a, b) => a.date.localeCompare(b.date));

        console.log('fetchCSATTrend: Calculated trend data:', result);

        return result;
    } catch (error) {
        console.error('Error fetching CSAT trend:', error);
        throw error;
    }
};

// Fetch low CSAT by country (calculated on frontend to avoid RPC limit)
export const fetchCSATCountryLow = async (filters) => {
    try {
        const { curFrom, curTo } = calculateDateRanges(filters.dateRange || 'last_90_days');

        const formatToMMDDYYYY = (dateStr) => {
            const [year, month, day] = dateStr.split('-');
            return `${parseInt(month)}/${parseInt(day)}/${year}`;
        };

        const fromDate = formatToMMDDYYYY(curFrom);
        const toDate = formatToMMDDYYYY(curTo);

        // Direct query
        let query = supabase
            .from('CSAT New')
            .select('Date, "Conversation rating", Country, "Product Type"')
            .in('Product Type', ['CFD', 'Futures'])
            .range(0, 49999)
            .not('Conversation rating', 'is', null)
            .in('Conversation rating', [1, 2]);

        const { data, error } = await query;
        if (error) throw error;

        const parseDate = (dateStr) => {
            if (!dateStr) return null;
            if (dateStr.includes('-')) { const p = dateStr.split('-'); if (p.length === 3) return new Date(p[0], p[1] - 1, p[2]); }
            if (dateStr.includes('/')) { const p = dateStr.split('/'); if (p.length === 3) return new Date(p[2], p[0] - 1, p[1]); }
            return null;
        };

        const fromDateObj = parseDate(fromDate);
        const toDateObj = parseDate(toDate);

        // Filter data
        const filteredData = (data || []).filter(row => {
            const rowDate = parseDate(row.Date);
            if (!rowDate || rowDate < fromDateObj || rowDate > toDateObj) return false;
            if (filters.countries?.length > 0 && !filters.countries.includes(row.Country)) return false;
            if (filters.products?.length > 0 && !filters.products.includes(row['Product Type'])) return false;
            return true;
        });

        // Group by Country
        const countryCounts = {};
        filteredData.forEach(row => {
            const country = row.Country || 'Unknown';
            countryCounts[country] = (countryCounts[country] || 0) + 1;
        });

        return Object.entries(countryCounts).map(([country, count]) => ({
            country,
            count
        })).sort((a, b) => b.count - a.count);

    } catch (error) {
        console.error('Error fetching CSAT country low:', error);
        throw error;
    }
};

// Channels in "Service Performance Overview" that count as knocks for this
// chart: live chat + socials (Instagram, Facebook). Emails are counted from
// the separate "Email - Service Performance Overview" table.
const KNOCK_CHANNELS = ['Chat', 'Instagram', 'Facebook'];

// Fetch knock counts by country. Combines chat/socials from
// "Service Performance Overview" with email knocks from
// "Email - Service Performance Overview", deduping conversation_id per country.
// Uses the same date range as fetchCSATCountryLow so the ratio is comparable.
export const fetchCSATCountryKnockCounts = async (filters) => {
    try {
        const { curFrom, curTo } = calculateDateRanges(filters.dateRange || 'last_90_days');
        const startDate = `${curFrom}T00:00:00+06:00`;
        const endDate = `${curTo}T23:59:59+06:00`;

        const seenByCountry = new Map(); // country -> Set of conversation_id

        const pageThrough = async (table, extraFilter) => {
            const PAGE = 5000;
            let offset = 0;
            while (true) {
                let query = supabase
                    .from(table)
                    .select('conversation_id, country')
                    .gte('created_at', startDate)
                    .lte('created_at', endDate)
                    .not('country', 'is', null);
                if (extraFilter) query = extraFilter(query);
                if (filters.countries?.length > 0) query = query.in('country', filters.countries);

                const { data, error } = await query.range(offset, offset + PAGE - 1);
                if (error) throw error;
                if (!data || data.length === 0) break;

                for (const row of data) {
                    if (!row.country || !row.conversation_id) continue;
                    let set = seenByCountry.get(row.country);
                    if (!set) { set = new Set(); seenByCountry.set(row.country, set); }
                    set.add(row.conversation_id);
                }

                if (data.length < PAGE) break;
                offset += PAGE;
            }
        };

        await Promise.all([
            pageThrough('Service Performance Overview', q => q.in('channel', KNOCK_CHANNELS)),
            pageThrough('Email - Service Performance Overview', null),
        ]);

        const out = {};
        for (const [country, set] of seenByCountry) out[country] = set.size;
        return out;
    } catch (error) {
        console.error('Error fetching CSAT country knock counts:', error);
        return {};
    }
};

// Fetch CSAT filter options from CSAT New table
export const fetchCSATFilters = async () => {
    try {
        const { data, error } = await supabase
            .from('CSAT New')
            .select('Country, "Product Type"')
            .in('Product Type', ['CFD', 'Futures'])
            .range(0, 49999);

        if (error) throw error;

        const uniqueCountries = [...new Set(
            data?.map(row => row.Country).filter(c => c && c.trim())
        )].sort();

        const uniqueProducts = [...new Set(
            data?.map(row => row['Product Type']).filter(p => p && p.trim())
        )].sort();

        return {
            countries: uniqueCountries,
            products: uniqueProducts,
            channels: [],
            agents: []
        };
    } catch (error) {
        console.error('Error fetching CSAT filters:', error);
        throw error;
    }
};

// Fetch unique categories for the Drilled-in Report
export const fetchCSATCategories = async () => {
    try {
        // Page through the entire CSAT table — Supabase caps a single request
        // at 1000 rows by default, so the distinct-values list was truncated.
        const PAGE = 1000;
        const uniq = new Set();
        let from = 0;
        while (true) {
            const { data, error } = await supabase
                .from('CSAT New')
                .select('"Concern regarding product (Catagory)"')
                .in('Product Type', ['CFD', 'Futures'])
                .not('"Concern regarding product (Catagory)"', 'is', null)
                .range(from, from + PAGE - 1);
            if (error) throw error;
            if (!data || data.length === 0) break;
            for (const row of data) {
                const c = row['Concern regarding product (Catagory)'];
                if (c && c.trim() !== '' && c !== 'NULL') uniq.add(c);
            }
            if (data.length < PAGE) break;
            from += PAGE;
        }
        return [...uniq].sort();
    } catch (error) {
        console.error('Error fetching CSAT categories:', error);
        return [];
    }
};

// Fetch drill-down data (originally for KYC, now generic)
export const fetchCSATKYC = async (filters, category = 'KYC_Issue') => {
    try {
        const { curFrom, curTo } = calculateDateRanges(filters.dateRange || 'last_90_days');

        // Convert YYYY-MM-DD to MM/DD/YYYY
        const formatToMMDDYYYY = (dateStr) => {
            const [year, month, day] = dateStr.split('-');
            return `${parseInt(month)}/${parseInt(day)}/${year}`;
        };

        const fromDate = formatToMMDDYYYY(curFrom);
        const toDate = formatToMMDDYYYY(curTo);

        // Fetch data — page through so we aren't capped at 1000 rows,
        // and support "All" (no category filter).
        const PAGE = 1000;
        let data = [];
        let from = 0;
        while (true) {
            let query = supabase
                .from('CSAT New')
                .select('Date, "Concern regarding product (Catagory)", "Concern regarding product (Sub-catagory)", Country, "Product Type"')
                .in('Product Type', ['CFD', 'Futures'])
                .range(from, from + PAGE - 1);
            if (category && category !== 'All') {
                query = query.eq('"Concern regarding product (Catagory)"', category);
            } else {
                // When "All" is chosen, only include rows that actually have a category value.
                query = query.not('"Concern regarding product (Catagory)"', 'is', null);
            }
            const { data: batch, error } = await query;
            if (error) throw error;
            if (!batch || batch.length === 0) break;
            data = data.concat(batch);
            if (batch.length < PAGE) break;
            from += PAGE;
        }

        // Filter on frontend for dates
        const parseDate = (dateStr) => {
            if (!dateStr) return null;
            if (dateStr.includes('-')) { const p = dateStr.split('-'); if (p.length === 3) return new Date(p[0], p[1] - 1, p[2]); }
            if (dateStr.includes('/')) { const p = dateStr.split('/'); if (p.length === 3) return new Date(p[2], p[0] - 1, p[1]); }
            return null;
        };

        const fromDateObj = parseDate(fromDate);
        const toDateObj = parseDate(toDate);

        const filteredData = (data || []).filter(row => {
            const rowDate = parseDate(row.Date);
            if (!rowDate || rowDate < fromDateObj || rowDate > toDateObj) return false;
            if (filters.countries?.length > 0 && !filters.countries.includes(row.Country)) return false;
            if (filters.products?.length > 0 && !filters.products.includes(row['Product Type'])) return false;
            return true;
        });

        // Count by Sub-category
        const reasonCounts = {};
        filteredData.forEach(row => {
            const subCategory = row['Concern regarding product (Sub-catagory)'];
            if (subCategory && subCategory.trim() !== '' && subCategory !== 'NULL') {
                reasonCounts[subCategory] = (reasonCounts[subCategory] || 0) + 1;
            } else {
                reasonCounts['Other'] = (reasonCounts['Other'] || 0) + 1;
            }
        });

        // Convert to array
        const result = Object.entries(reasonCounts).map(([reason, count]) => ({
            reason,
            count
        })).sort((a, b) => b.count - a.count);

        return result;
    } catch (error) {
        console.error('Error fetching CSAT drill-down:', error);
        return [];
    }
};
