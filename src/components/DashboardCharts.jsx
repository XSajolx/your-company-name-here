import React, { useMemo, useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    AreaChart, Area, Legend, PieChart, Pie, Cell, LabelList
} from 'recharts';
import { format, parseISO, differenceInDays, addDays } from 'date-fns';
import PillDropdown from './PillDropdown';
import CustomLegend from './CustomLegend';
import ConversationList from './ConversationList';
import AthenaPanel from './AthenaPanel';
import { useAthena } from '../hooks/useAthena';
import { TOPIC_MAPPING, QUERY_TOPIC_MAPPING, QUERY_MAIN_TOPICS, normalizeApostrophe } from '../utils/topicMapping';

// Shared color maps so every chart (Main Topic Distribution, Country-wise stacks, drill-ins)
// renders the same topic with the same color.
const ISSUE_COLOR_MAP = {
    'Login_Issue': '#C084FC',
    'Payout related issue': '#3FB950',
    'Next Phase Button Missing': '#F0883E',
    'KYC_Issue': '#A371F7',
    'KYC & Verification': '#A371F7',
    'Discount related issue': '#D2A8FF',
    'Platform Issue': '#DB61A2',
    'Platform & Trading Performance': '#DB61A2',
    'Account Related Issue': '#79C0FF',
    'Account Access': '#79C0FF',
    'Restriction Related Issue': '#F778BA',
    'Delay in Receiving Customer Support': '#56D4DD',
    'Support & Response': '#56D4DD',
    'Dashboard Related Issue': '#FFD700',
    'Website & Dashboard': '#FFD700',
    'Trade Issue': '#00CED1',
    'Payment, Purchase & Refunds': '#F43F5E',
    'Payout & Profit-Share': '#3FB950',
    'Rules & Scaling': '#0D9488',
    'Rules & Scaling (Inquiry)': '#0D9488',
    'Offers, Coupons & Giveaway': '#EAB308',
    'Certificates & Competition': '#7C3AED',
    'Technical / Country / Compliance / Verdict': '#EF4444',
    'Other': '#FF7B72',
};
const QUERY_COLOR_MAP = {
    'OFFER RELATED QUERY': '#FF6B9D',
    'CHALLENGE SELECTION QUERY': '#C084FC',
    'PRICING & PAYMENT QUERY': '#3FB950',
    'ACCOUNT SETUP QUERY': '#F0883E',
    'CHALLENGE RULES QUERY': '#A371F7',
    'WITHDRAWAL & PAYOUT QUERY': '#FFD700',
    'PERFORMANCE REWARD QUERY': '#00CED1',
    'PAYOUT CYCLE QUERY': '#DB61A2',
    'SCALE-UP PLAN QUERY': '#79C0FF',
    'STELLAR INSTANT SCALE-UP QUERY': '#F778BA',
    'KYC & VERIFICATION QUERY': '#D2A8FF',
    'ACCOUNT RESET QUERY': '#56D4DD',
    'Challenge Rules Query': '#A371F7',
    'Offer Related Query': '#FF6B9D',
    'Withdrawal & Payout Query': '#FFD700',
    'Account Setup Query': '#F0883E',
    'KYC & Verification Query': '#D2A8FF',
};
const FALLBACK_COLORS = [
    '#C084FC', '#F778BA', '#3FB950', '#F0883E', '#A371F7',
    '#FF7B72', '#56D4DD', '#FFD700', '#DB61A2', '#79C0FF',
    '#D2A8FF', '#00CED1', '#EAB308', '#7C3AED', '#EF4444',
];
// Stable colour lookup that falls back to a hash-indexed palette entry so the same
// topic name always paints the same colour across renders.
function getTopicColor(name, subTab = 'issue') {
    if (!name) return '#6B7280';
    const map = subTab === 'query' ? { ...QUERY_COLOR_MAP, ...ISSUE_COLOR_MAP } : { ...ISSUE_COLOR_MAP, ...QUERY_COLOR_MAP };
    if (map[name]) return map[name];
    if (name === 'Other topics' || /^other$/i.test(name)) return '#6B7280';
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}
function getCountryColor(name) {
    if (!name) return '#6B7280';
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

// Main topics that should ONLY appear in Query Analysis, not Issue Analysis
const QUERY_ONLY_MAIN_TOPICS = new Set([
    "OFFER RELATED QUERY",
    "CHALLENGE SELECTION QUERY",
    "PRICING & PAYMENT QUERY",
    "ACCOUNT SETUP QUERY",
    "CHALLENGE RULES QUERY",
    "WITHDRAWAL & PAYOUT QUERY",
    "PERFORMANCE REWARD QUERY",
    "PAYOUT CYCLE QUERY",
    "SCALE-UP PLAN QUERY",
    "STELLAR INSTANT SCALE-UP QUERY",
    "STELLAR INSTANT SCALE-UP PLAN QUERY",
    "KYC & VERIFICATION QUERY",
    "ACCOUNT RESET QUERY",
    "REFUND RELATED QUERY",
    "COUPON & DISCOUNT QUERY",
    "GENERAL QUERIES",
    "QUERY",
    "QUERY CATEGORIES",
    "COPY TRADING QUERY",
    "PROHIBITED STRATEGIES QUERY",
    "EA & ROBOT QUERY",
    "NEWS TRADING QUERY",
    "VPN & IP ADDRESS QUERY",
    "FUNDED ACCOUNT QUERY",
    "GENERAL / OTHER QUERY",
    "GENERAL QUERY"
]);

// Helper to find mapping with normalized apostrophe
const findMapping = (topic, mapping) => {
    if (!topic) return null;
    // Try direct match first
    if (mapping[topic]) return mapping[topic];
    // Try normalized match
    const normalized = normalizeApostrophe(topic);
    if (mapping[normalized]) return mapping[normalized];
    // Try finding a key that matches when normalized
    for (const key of Object.keys(mapping)) {
        if (normalizeApostrophe(key) === normalized) {
            return mapping[key];
        }
    }
    return null;
};

// True if the row has at least one sub-topic that is a legit issue sub-topic
// (i.e., appears in TOPIC_MAPPING; or is missing/empty so we don't over-filter).
// A row whose sub-topics are ALL query-only (in QUERY_TOPIC_MAPPING but not TOPIC_MAPPING)
// should not be counted on the Issue side.
// Sub-topics we want hidden from the Conversation Topics page (charts, dropdowns, donuts, drill-ins).
// Compared case-insensitively and tolerant of trailing punctuation so small spelling
// variants ("Delay in Receiving Customer Support" vs "Delay in Receiving Customer Support.") are
// covered by the same entry.
const HIDDEN_SUB_TOPICS = new Set([
    'delay in receiving customer support',
]);
const isHiddenSubTopic = (t) => {
    if (!t) return false;
    const k = String(t).toLowerCase().replace(/[.!?\s]+$/g, '').trim();
    return HIDDEN_SUB_TOPICS.has(k);
};

const hasAnyIssueSubTopic = (rawTopics) => {
    const topics = Array.isArray(rawTopics) ? rawTopics : [rawTopics];
    const nonEmpty = topics.filter(Boolean);
    if (nonEmpty.length === 0) return true;
    return nonEmpty.some(t => !(findMapping(t, QUERY_TOPIC_MAPPING) && !findMapping(t, TOPIC_MAPPING)));
};

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div style={{
                backgroundColor: '#1C2128',
                padding: '12px 16px',
                border: '1px solid #30363D',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                color: '#F0F6FC'
            }}>
                <p style={{ margin: 0, fontWeight: '600', color: '#8B949E', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</p>
                <p style={{ margin: '6px 0 0 0', color: '#C084FC', fontWeight: '700', fontSize: '1rem' }}>
                    {payload[0].value} Conversations
                </p>
            </div>
        );
    }
    return null;
};

const TrendTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div style={{
                backgroundColor: '#1C2128',
                padding: '12px 16px',
                border: '1px solid #30363D',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                color: '#F0F6FC'
            }}>
                <p style={{ margin: '0 0 8px 0', fontWeight: '600', fontSize: '0.75rem', color: '#8B949E', textTransform: 'uppercase' }}>{label}</p>
                {payload.map((entry, index) => (
                    <div key={index} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '4px'
                    }}>
                        <div style={{
                            width: '10px',
                            height: '10px',
                            backgroundColor: entry.color,
                            borderRadius: '3px'
                        }} />
                        <span style={{ fontSize: '0.8125rem', color: '#C9D1D9' }}>
                            {entry.name}: <strong style={{ color: '#F0F6FC' }}>{entry.value}</strong>
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

const DashboardCharts = ({ data, previousData, availableTopics, availableMainTopics = [], topicDistribution = [], filters, subTab = 'issue' }) => {
    const [selectedTopic, setSelectedTopic] = useState('__ALL__');
    const [selectedMainTopic, setSelectedMainTopic] = useState('All');
    const [selectedQueryMainTopic, setSelectedQueryMainTopic] = useState('All');
    const [showDrillIn, setShowDrillIn] = useState(false);
    const [drillInData, setDrillInData] = useState({ conversations: [], title: '', filterMainTopic: null, filterSubTopic: null });
    const [activeTopicTab, setActiveTopicTab] = useState('distribution');
    // 'main' = main topics per country; 'sub' = sub-topics per country
    const [countryTopicTab, setCountryTopicTab] = useState('main');
    const [selectedCountry, setSelectedCountry] = useState(null);
    const athena = useAthena();

    // Export a set of conversations to CSV, downloaded as `<title>.csv`.
    const exportConversationsCSV = (conversations, title) => {
        if (!conversations || conversations.length === 0) return;
        const columns = [
            { key: 'conversation_id', label: 'Conversation ID' },
            { key: 'created_date_bd', label: 'Date' },
            { key: 'country', label: 'Country' },
            { key: 'product', label: 'Product' },
            { key: 'main_topic', label: 'Main-Topics' },
            { key: 'topic', label: 'Sub-Topics' },
            { key: 'sentiment_start', label: 'Sentiment Start' },
            { key: 'sentiment_end', label: 'Sentiment End' },
        ];
        const escape = (v) => {
            if (v == null) return '';
            const s = Array.isArray(v) ? v.join(' | ') : String(v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const header = columns.map(c => c.label).join(',');
        const rows = conversations.map(c => columns.map(col => escape(c[col.key])).join(','));
        const csv = [header, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${String(title).replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '')}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Filter logic mirrors handleMainTopicDrillIn / handleSubTopicDrillIn so the export
    // set matches exactly what the drill-in modal would show.
    const filterForMainTopic = (mainTopic) => (data || []).filter(conv => {
        const mainTopics = Array.isArray(conv.main_topic) ? conv.main_topic : [conv.main_topic];
        if (subTab === 'query') {
            if (mainTopics.includes(mainTopic)) return true;
            const topics = Array.isArray(conv.topic) ? conv.topic : [conv.topic];
            return topics.some(t => findMapping(t, QUERY_TOPIC_MAPPING) === mainTopic);
        }
        if (!mainTopics.includes(mainTopic)) return false;
        return hasAnyIssueSubTopic(conv.topic);
    });
    const filterForSubTopic = (subTopic) => (data || []).filter(conv => {
        const topics = Array.isArray(conv.topic) ? conv.topic : [conv.topic];
        return topics.includes(subTopic);
    });

    // Handle drill-in for Main Topic
    const handleMainTopicDrillIn = (mainTopic) => {
        const filtered = (data || []).filter(conv => {
            const mainTopics = Array.isArray(conv.main_topic) ? conv.main_topic : [conv.main_topic];
            if (subTab === 'query') {
                // Query drill-in: include rows tagged with this query main_topic,
                // OR rows whose sub-topics map to this query main (handles LLM mis-tagging
                // where main_topic is an Issue label but sub-topic is query-only).
                if (mainTopics.includes(mainTopic)) return true;
                const topics = Array.isArray(conv.topic) ? conv.topic : [conv.topic];
                return topics.some(t => findMapping(t, QUERY_TOPIC_MAPPING) === mainTopic);
            }
            // Issue drill-in: require main_topic match AND at least one issue sub-topic.
            if (!mainTopics.includes(mainTopic)) return false;
            return hasAnyIssueSubTopic(conv.topic);
        });
        setDrillInData({ 
            conversations: filtered, 
            title: `${mainTopic} (${filtered.length} conversations)`,
            filterMainTopic: mainTopic,
            filterSubTopic: null
        });
        setShowDrillIn(true);
    };

    // Handle drill-in for Sub-Topic
    const handleSubTopicDrillIn = (subTopic) => {
        const filtered = (data || []).filter(conv => {
            const topics = Array.isArray(conv.topic) ? conv.topic : [conv.topic];
            return topics.includes(subTopic);
        });
        setDrillInData({
            conversations: filtered,
            title: `${subTopic} (${filtered.length} conversations)`,
            filterMainTopic: null,
            filterSubTopic: subTopic
        });
        setShowDrillIn(true);
    };

    // Handle drill-in for a specific date + topic (trend chart click)
    const handleDateTopicDrillIn = (date, subTopic) => {
        const isAll = subTopic === '__ALL__';
        const filtered = (data || []).filter(conv => {
            const convDate = (conv.created_date_bd || '').split('T')[0];
            if (convDate !== date) return false;
            if (isAll) {
                // Match the Total Issues / Total Queries KPI definition so the
                // drill-in row set aligns with the number on the trend dot.
                const topics = Array.isArray(conv.topic) ? conv.topic : [conv.topic];
                if (subTab === 'query') {
                    return topics.some(t => t && t !== 'Challenge Rule Clarification' && findMapping(t, QUERY_TOPIC_MAPPING));
                }
                return topics.some(t => t && !t.toLowerCase().includes('other') && !findMapping(t, QUERY_TOPIC_MAPPING));
            }
            if (subTopic) {
                const topics = Array.isArray(conv.topic) ? conv.topic : [conv.topic];
                return topics.includes(subTopic);
            }
            return true;
        });
        const label = isAll ? (subTab === 'query' ? 'All Queries' : 'All Issues') : (subTopic || 'All Topics');
        setDrillInData({
            conversations: filtered,
            title: `${label} — ${date} (${filtered.length} conversations)`,
            filterMainTopic: null,
            filterSubTopic: isAll ? null : (subTopic || null),
        });
        setShowDrillIn(true);
    };

    // Get the active topic mapping based on the current subTab
    const activeTopicMapping = subTab === 'query' ? QUERY_TOPIC_MAPPING : TOPIC_MAPPING;
    const activeMainTopics = subTab === 'query' ? QUERY_MAIN_TOPICS : availableMainTopics;
    const activeSelectedMainTopic = subTab === 'query' ? selectedQueryMainTopic : selectedMainTopic;
    const setActiveSelectedMainTopic = subTab === 'query' ? setSelectedQueryMainTopic : setSelectedMainTopic;

    // Note: availableMainTopics is now passed as a prop from App.jsx

    // Compute filtered topics based on selected main topic (for Chart 2 and Dropdown)
    // For Query Analysis: only show query sub-topics
    // For Issue Analysis: only show actual sub-topics (not main topics)
    const filteredTopics = useMemo(() => {
        if (!data) return [];

        let candidates = new Set();

        // 1. Gather all unique sub-topics from the data first (to filter against available data)
        data.forEach(item => {
            const subTopics = Array.isArray(item.topic) ? item.topic : [item.topic];
            subTopics.forEach(t => {
                // Exclude "Challenge Rule Clarification" and any globally-hidden sub-topic.
                if (t && t !== 'Challenge Rule Clarification' && !isHiddenSubTopic(t)) {
                    if (subTab === 'query') {
                        // For Query Analysis: only include query sub-topics
                        if (findMapping(t, QUERY_TOPIC_MAPPING)) {
                            candidates.add(t);
                        }
                    } else {
                        // For Issue Analysis: include all sub-topics that are in TOPIC_MAPPING
                        if (findMapping(t, TOPIC_MAPPING)) {
                            candidates.add(t);
                        }
                    }
                }
            });
        });

        const allAvailableSubTopics = [...candidates];

        if (activeSelectedMainTopic === 'All') {
            // When showing "All", exclude query-only sub-topics from issue analysis
            if (subTab !== 'query') {
                return allAvailableSubTopics.filter(t => !findMapping(t, QUERY_TOPIC_MAPPING)).sort();
            }
            return allAvailableSubTopics.sort();
        }

        // 2. Strict Filtering using the active topic mapping (TOPIC_MAPPING or QUERY_TOPIC_MAPPING)
        // Only include sub-topics that officially map to the selected Main Topic
        const strictSubTopics = allAvailableSubTopics.filter(sub => {
            const mappedMain = findMapping(sub, activeTopicMapping);
            // Match strict mapping
            if (mappedMain) {
                return mappedMain === activeSelectedMainTopic;
            }
            // Fallback disabled to enforce strictness per user request
            return false;
        });

        // 3. Fallback: If strict list empty, check data associations (legacy behavior)
        if (strictSubTopics.length === 0) {
            const associatedSubs = new Set();
            data.forEach(item => {
                const mainTopics = Array.isArray(item.main_topic) ? item.main_topic : [item.main_topic];
                if (mainTopics.includes(activeSelectedMainTopic)) {
                    const subTopics = Array.isArray(item.topic) ? item.topic : [item.topic];
                    subTopics.forEach(t => {
                        if (subTab === 'query') {
                            if (findMapping(t, QUERY_TOPIC_MAPPING)) associatedSubs.add(t);
                        } else {
                            // Include all sub-topics that belong to this main topic
                            if (findMapping(t, TOPIC_MAPPING)) associatedSubs.add(t);
                        }
                    });
                }
            });
            return [...associatedSubs].filter(Boolean).sort();
        }

        return strictSubTopics.sort();
    }, [data, activeSelectedMainTopic, activeTopicMapping, subTab]);

    // Reset selectedTopic when main topic changes and current topic is not in filtered list.
    // "__ALL__" (All Issues / All Queries) is always valid, so leave it alone.
    useEffect(() => {
        if (selectedTopic === '__ALL__') return;
        if (filteredTopics.length > 0 && !filteredTopics.includes(selectedTopic)) {
            setSelectedTopic('__ALL__');
        }
    }, [activeSelectedMainTopic, filteredTopics]);

    useEffect(() => {
        if (!selectedTopic) {
            setSelectedTopic('__ALL__');
        }
    }, [filteredTopics, selectedTopic]);

    // Calculate date range for display
    const getDateRangeText = () => {
        if (!filters || !filters.dateRange) {
            return '';
        }

        if (filters.dateRange.startsWith('custom_')) {
            const [, start, end] = filters.dateRange.split('_');
            return `${start} to ${end}`;
        }

        const today = new Date();
        let startDate;

        switch (filters.dateRange) {
            case 'today':
                return `Today - ${format(today, 'MMM d, yyyy')}`;
            case 'yesterday':
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                return `Yesterday - ${format(yesterday, 'MMM d, yyyy')}`;
            case 'last_week':
                startDate = new Date(today);
                startDate.setDate(startDate.getDate() - 7);
                return `${format(startDate, 'MMM d')} - ${format(today, 'MMM d, yyyy')}`;
            case 'last_month':
                startDate = new Date(today);
                startDate.setMonth(startDate.getMonth() - 1);
                return `${format(startDate, 'MMM d')} - ${format(today, 'MMM d, yyyy')}`;
            case 'last_3_months':
            default:
                startDate = new Date(today);
                startDate.setMonth(startDate.getMonth() - 3);
                return `${format(startDate, 'MMM d')} - ${format(today, 'MMM d, yyyy')}`;
        }
    };

    // Aggregate data for Bar Chart (Total conversations per topic)
    const barData = useMemo(() => {
        const counts = {};
        const filteredData = data || [];

        if (subTab === 'query') {
            console.log('Calculating barData for Query Analysis');
            filteredData.forEach(item => {
                const subTopics = Array.isArray(item.topic) ? item.topic : [item.topic];
                subTopics.forEach(subTopic => {
                    if (subTopic === 'Challenge Rule Clarification') return;
                    const mainTopic = findMapping(subTopic, QUERY_TOPIC_MAPPING);
                    if (mainTopic) {
                        counts[mainTopic] = (counts[mainTopic] || 0) + 1;
                    }
                });
            });
        } else {
            console.log('Calculating barData for Issue Analysis');
            filteredData.forEach(item => {
                if (!hasAnyIssueSubTopic(item.topic)) return;
                const topics = Array.isArray(item.main_topic) ? item.main_topic : [item.main_topic];
                if (topics.length === 0) return;
                topics.forEach(topic => {
                    const t = topic || 'Other';
                    if (QUERY_ONLY_MAIN_TOPICS.has(t.toUpperCase())) return;
                    counts[t] = (counts[t] || 0) + 1;
                });
            });
        }

        return Object.keys(counts)
            .map(topic => ({ name: topic, value: counts[topic] }))
            .filter(item => item.name !== 'Other')
            .sort((a, b) => b.value - a.value)
            .map(item => ({ ...item, color: getTopicColor(item.name, subTab) }));
    }, [data, filters, subTab]);

    // Derived available topics for the dropdown - MUST match what is shown in the charts
    const chartTopics = useMemo(() => {
        if (subTab === 'query') {
            // For query analysis, show main topics that have data
            const topicsWithData = barData.map(d => d.name);
            return ['All Main Topics', ...topicsWithData];
        }
        return ['All Main Topics', ...barData.map(d => d.name)];
    }, [barData, subTab]);

    // Aggregate data for Trend Chart (Comparison)
    // For Query Analysis: only count if the topic is a query sub-topic
    const trendData = useMemo(() => {
        if (!selectedTopic || !data) return [];

        const isAll = selectedTopic === '__ALL__';

        // For Query Analysis: verify the selected topic is a query sub-topic
        if (!isAll && subTab === 'query' && !findMapping(selectedTopic, QUERY_TOPIC_MAPPING)) {
            return [];
        }

        // For a specific sub-topic: count conversations that contain it.
        // For __ALL__: match the Total Issues / Total Queries scorecards so
        // sum(daily counts) == the KPI value.
        //   Total Issues  (KPIStats): exclude topics containing "other" and
        //                             any topic in QUERY_TOPIC_MAPPING.
        //   Total Queries (KPIStats): include topics in QUERY_TOPIC_MAPPING,
        //                             excluding "Challenge Rule Clarification".
        const countFor = (item) => {
            const subTopics = Array.isArray(item.topic) ? item.topic : [item.topic];
            if (isAll) {
                if (subTab === 'query') {
                    return subTopics.filter(t => t && t !== 'Challenge Rule Clarification' && findMapping(t, QUERY_TOPIC_MAPPING)).length;
                }
                return subTopics.filter(t => {
                    if (!t || t.toLowerCase().includes('other')) return false;
                    if (findMapping(t, QUERY_TOPIC_MAPPING)) return false;
                    return true;
                }).length;
            }
            return subTopics.includes(selectedTopic) ? 1 : 0;
        };

        const processData = (dataset) => {
            const dailyCounts = {};
            if (!dataset) return dailyCounts;
            dataset.forEach(item => {
                const n = countFor(item);
                if (n > 0) {
                    const date = item.created_date_bd;
                    dailyCounts[date] = (dailyCounts[date] || 0) + n;
                }
            });
            return dailyCounts;
        };

        const currentCounts = processData(data);
        const previousCounts = processData(previousData || []);

        const getSortedDates = (counts) => Object.keys(counts).sort();
        const currentDates = getSortedDates(currentCounts);
        const previousDates = getSortedDates(previousCounts);

        const maxDays = Math.max(currentDates.length, previousDates.length);
        const chartData = [];

        if (maxDays === 0) return [];

        for (let i = 0; i < maxDays; i++) {
            let label = `${i + 1}`;
            const iso = currentDates[i] || null;
            if (currentDates[i]) {
                try {
                    label = format(parseISO(currentDates[i]), 'MMM d');
                } catch (e) {
                    label = currentDates[i];
                }
            }

            chartData.push({
                day: label,
                isoDate: iso,
                Current: currentDates[i] ? currentCounts[currentDates[i]] : 0,
                Previous: previousDates[i] ? previousCounts[previousDates[i]] : 0,
            });
        }

        return chartData;
    }, [data, previousData, selectedTopic, subTab]);


    // Top-10 + "Others" normalization for the donut chart.
    // Keeps the real count on `count`, overrides `value` so the top 10 slices
    // share 90% of the pie and "Others" is fixed at 10%. Tooltips/legend
    // should read `count` (real number) and `percentage` (share of real total).
    const top10WithOthers = (rows) => {
        if (!rows || rows.length === 0) return rows || [];
        const sorted = [...rows].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
        if (sorted.length <= 10) {
            return sorted.map(r => ({ ...r, count: r.value }));
        }
        const top = sorted.slice(0, 10);
        const rest = sorted.slice(10);
        const topSum = top.reduce((s, r) => s + (r.value ?? 0), 0);
        const restSum = rest.reduce((s, r) => s + (r.value ?? 0), 0);
        const totalReal = topSum + restSum;
        if (topSum === 0) return top.map(r => ({ ...r, count: r.value }));
        const topScaled = top.map(r => ({
            ...r,
            count: r.value,
            value: (r.value / topSum) * 90, // top 10 share 90% of the slice area
            percentage: totalReal > 0 ? Math.round((r.value / totalReal) * 100) : 0,
        }));
        const othersSlice = {
            name: 'Others',
            fullName: `Others (${rest.length})`,
            count: restSum,
            value: 10, // fixed 10% of the pie
            percentage: totalReal > 0 ? Math.round((restSum / totalReal) * 100) : 0,
            color: '#4B5563',
            _others: rest,
        };
        return [...topScaled, othersSlice];
    };

    // Aggregate data for Main Topic Donut Chart
    const mainTopicData = useMemo(() => {
        const safeData = data || [];

        // If All Main Topics, use the exact data/colors from the bar chart
        if (activeSelectedMainTopic === 'All' || activeSelectedMainTopic === 'All Main Topics') {
            const total = barData.reduce((sum, item) => sum + item.value, 0);
            const annotated = barData.map(item => ({
                ...item,
                fullName: item.name,
                percentage: total > 0 ? Math.round((item.value / total) * 100) : 0,
            }));
            return top10WithOthers(annotated);
        }

        // If a specific topic is selected, sort and show subtopics
        const counts = {};
        let total = 0;

        if (subTab === 'query') {
            // For Query Analysis: Find subtopics that map to the selected query main topic
            // Exclude "Challenge Rule Clarification" to be consistent
        safeData.forEach(item => {
                const subTopics = Array.isArray(item.topic) ? item.topic : [item.topic];

                subTopics.forEach(sub => {
                    if (sub === 'Challenge Rule Clarification') return;
                    if (isHiddenSubTopic(sub)) return;
                    const mappedMain = findMapping(sub, QUERY_TOPIC_MAPPING);
                    if (mappedMain === activeSelectedMainTopic) {
                        const topic = sub || 'Unknown';
                        counts[topic] = (counts[topic] || 0) + 1;
                        total++;
                    }
                });
            });
        } else {
            // For Issue Analysis: count sub-topics of conversations whose main_topic matches
            // the selected one. TOPIC_MAPPING is a legacy taxonomy (values like "Trade Issue")
            // and doesn't match the current main topics emitted by the LLM (e.g. "Rules & Scaling"),
            // so we rely on main_topic membership instead. Skip query-only sub-topics to keep
            // the view aligned with the Issue side of the dashboard.
            safeData.forEach(item => {
                const mainTopics = Array.isArray(item.main_topic) ? item.main_topic : [item.main_topic];
                if (!mainTopics.includes(activeSelectedMainTopic)) return;

                const subTopics = Array.isArray(item.topic) ? item.topic : [item.topic];
                subTopics.forEach(sub => {
                    if (!sub) return;
                    if (isHiddenSubTopic(sub)) return;
                    if (findMapping(sub, QUERY_TOPIC_MAPPING) && !findMapping(sub, TOPIC_MAPPING)) return;
                    counts[sub] = (counts[sub] || 0) + 1;
                    total++;
                });
            });
        }

        // Filter out very low frequency items (noise)
        const NOISE_THRESHOLD = 1; // Explicitly set to 1 to show all valid mapped items

        const subtopicData = Object.keys(counts)
            .filter(topic => counts[topic] >= NOISE_THRESHOLD && topic !== 'Other' && topic !== 'Unknown')
            .map(topic => ({
                name: topic,
                value: counts[topic],
                fullName: topic,
                percentage: total > 0 ? Math.round((counts[topic] / total) * 100) : 0
            }))
            .sort((a, b) => b.value - a.value);

        const defaultColors = ['#C084FC', '#A371F7', '#3FB950', '#F0E050', '#FF7B72', '#DB61A2', '#D2A8FF', '#79C0FF', '#F778BA', '#56D4DD'];

        return top10WithOthers(subtopicData.map((item, index) => ({
            ...item,
            color: defaultColors[index % defaultColors.length]
        })));

    }, [barData, data, activeSelectedMainTopic, subTab]);

    // Legend data: same set that feeds the donut, but the "Others" slice is
    // expanded back into its individual main-topics/sub-topics so the list is
    // a full breakdown instead of a single collapsed row.
    const mainTopicLegendData = useMemo(() => {
        const expanded = [];
        for (const item of mainTopicData) {
            if (item._others && Array.isArray(item._others)) {
                for (const r of item._others) {
                    expanded.push({
                        ...r,
                        count: r.value,
                        color: r.color || '#6B7280',
                    });
                }
            } else {
                expanded.push(item);
            }
        }
        return expanded;
    }, [mainTopicData]);

    // Country × topic aggregation for the Country-wise Queries & Issues chart.
    // Produces a stacked-bar dataset: rows are countries, columns are the top 8 topics
    // across the whole view (plus a rolled-up "Other" segment per country).
    const countryTopicData = useMemo(() => {
        const safe = data || [];
        const COUNTRY_LIMIT = 15;
        const TOP_TOPICS = 8;

        const buildForLevel = (level) => {
            // level: 'main' | 'sub'
            // Count (country, topic) pairs — dedupe per conversation so we don't double-count.
            const pairCounts = new Map(); // key: `${country}||${topic}`
            const countryTotals = new Map(); // country -> total conversations
            const topicTotals = new Map(); // topic -> total across countries

            for (const conv of safe) {
                const country = conv.country || 'Unknown';
                const topicsRaw = level === 'main'
                    ? (Array.isArray(conv.main_topic) ? conv.main_topic : [conv.main_topic])
                    : (Array.isArray(conv.topic) ? conv.topic : [conv.topic]);
                const topics = [...new Set(topicsRaw.filter(t => t && String(t).trim()))];
                if (topics.length === 0) continue;

                countryTotals.set(country, (countryTotals.get(country) || 0) + 1);
                for (const t of topics) {
                    const k = `${country}||${t}`;
                    pairCounts.set(k, (pairCounts.get(k) || 0) + 1);
                    topicTotals.set(t, (topicTotals.get(t) || 0) + 1);
                }
            }

            const topCountries = [...countryTotals.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, COUNTRY_LIMIT)
                .map(([c]) => c);
            const topTopics = [...topicTotals.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, TOP_TOPICS)
                .map(([t]) => t);
            const topTopicSet = new Set(topTopics);

            // Build one row per country; include one numeric field per top topic + 'Other topics'
            // (the rolled-up tail — named separately to avoid colliding with the legit 'Other'
            // main-topic category). Also collect the FULL per-country topic list for the table.
            const TAIL_KEY = 'Other topics';
            const rows = [];
            const fullByCountry = {}; // country -> [{ topic, count }, ...] sorted desc
            for (const country of topCountries) {
                const row = { country, total: countryTotals.get(country) || 0 };
                const perTopic = [];
                let other = 0;
                for (const [key, n] of pairCounts) {
                    if (!key.startsWith(country + '||')) continue;
                    const topic = key.slice(country.length + 2);
                    perTopic.push({ topic, count: n });
                    if (topTopicSet.has(topic)) {
                        row[topic] = (row[topic] || 0) + n;
                    } else {
                        other += n;
                    }
                }
                if (other > 0) row[TAIL_KEY] = other;
                rows.push(row);
                fullByCountry[country] = perTopic.sort((a, b) => b.count - a.count);
            }

            return {
                rows,
                topics: [...topTopics, ...(rows.some(r => r[TAIL_KEY]) ? [TAIL_KEY] : [])],
                fullByCountry,
            };
        };

        return {
            main: buildForLevel('main'),
            sub: buildForLevel('sub'),
        };
    }, [data]);

    // Topic colors come from the shared getTopicColor() so the country-wise stacks
    // match the Main Topic Distribution / Overall Breakdown charts.

    // Drill-in when clicking a stack segment: filter by country + topic.
    const handleCountryTopicDrillIn = (country, topic) => {
        const isMain = countryTopicTab === 'main';
        const isOther = topic === 'Other topics';
        const topTopicSet = new Set(countryTopicData[countryTopicTab].topics.filter(t => t !== 'Other topics'));

        const filtered = (data || []).filter(conv => {
            if ((conv.country || 'Unknown') !== country) return false;
            const topicsRaw = isMain
                ? (Array.isArray(conv.main_topic) ? conv.main_topic : [conv.main_topic])
                : (Array.isArray(conv.topic) ? conv.topic : [conv.topic]);
            const topics = topicsRaw.filter(t => t && String(t).trim());
            if (topics.length === 0) return false;
            if (isOther) {
                // Conversation has at least one topic outside the top-N set.
                return topics.some(t => !topTopicSet.has(t));
            }
            return topics.includes(topic);
        });
        setDrillInData({
            conversations: filtered,
            title: `${country} · ${topic} (${filtered.length} conversations)`,
            filterMainTopic: isMain && !isOther ? topic : null,
            filterSubTopic: !isMain && !isOther ? topic : null,
        });
        setShowDrillIn(true);
    };

    // Drill-in when clicking a country bar: show all conversations for that country.
    const handleCountryDrillIn = (country) => {
        const filtered = (data || []).filter(conv => (conv.country || 'Unknown') === country);
        setDrillInData({
            conversations: filtered,
            title: `${country} · All Topics (${filtered.length} conversations)`,
            filterMainTopic: null,
            filterSubTopic: null,
        });
        setShowDrillIn(true);
    };

    const exportCountryTopicCSV = () => {
        const { rows, fullByCountry } = countryTopicData[countryTopicTab];
        if (!rows || rows.length === 0) return;
        // Long-format CSV: one row per (country, topic) pair — matches the expandable table below the chart.
        const escape = (v) => {
            if (v == null) return '';
            const s = String(v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const header = ['Country', 'Country Total', countryTopicTab === 'main' ? 'Main Topic' : 'Sub-Topic', 'Count', '% of Country'];
        const lines = [header.join(',')];
        for (const r of rows) {
            const full = fullByCountry[r.country] || [];
            for (const it of full) {
                const pct = r.total > 0 ? ((it.count / r.total) * 100).toFixed(1) : '0.0';
                lines.push([r.country, r.total, it.topic, it.count, pct].map(escape).join(','));
            }
        }
        const csv = lines.join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `country_${countryTopicTab === 'main' ? 'main_topics' : 'sub_topics'}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Aggregate ALL sub-topics data for the standalone scrollable bar chart
    // For Query Analysis: only show sub-topics that map to query main topics
    // For Issue Analysis: only show sub-topics that map to issue main topics (exclude main topics themselves)
    const allSubTopicsData = useMemo(() => {
        const safeData = data || [];
        const counts = {};
        let total = 0;

        // Color palette for sub-topics (matching main topic distribution style)
        const subTopicColors = [
            '#C084FC', '#3FB950', '#A371F7', '#F0883E', '#FF6B9D',
            '#DB61A2', '#79C0FF', '#56D4DD', '#FFD700', '#00CED1',
            '#D2A8FF', '#F778BA', '#FF7B72', '#9370DB', '#20B2AA',
            '#4169E1', '#32CD32', '#FF4500', '#DA70D6', '#00FA9A'
        ];

        safeData.forEach(item => {
            const subTopics = Array.isArray(item.topic) ? item.topic : [item.topic];

            subTopics.forEach(sub => {
                // Exclude "Other", "Unknown", "Challenge Rule Clarification", and any globally-hidden sub-topic.
                if (sub && !sub.toLowerCase().includes('other') && sub !== 'Unknown' && sub !== 'Challenge Rule Clarification' && !isHiddenSubTopic(sub)) {
                    if (subTab === 'query') {
                        // For Query Analysis: only count sub-topics that are in QUERY_TOPIC_MAPPING
                        if (findMapping(sub, QUERY_TOPIC_MAPPING)) {
                            counts[sub] = (counts[sub] || 0) + 1;
                            total++;
                        }
                    } else {
                        // For Issue Analysis: only count sub-topics that are in TOPIC_MAPPING
                        // BUT exclude any sub-topics that are also in QUERY_TOPIC_MAPPING
                        if (findMapping(sub, TOPIC_MAPPING) && !findMapping(sub, QUERY_TOPIC_MAPPING)) {
                            counts[sub] = (counts[sub] || 0) + 1;
                            total++;
                        }
                    }
                }
            });
        });

        const subtopicData = Object.keys(counts)
            .map(topic => ({
                name: topic,
                value: counts[topic],
                fullName: topic,
                percentage: total > 0 ? Math.round((counts[topic] / total) * 100) : 0
            }))
            .sort((a, b) => b.value - a.value)
            .map((item, index) => ({
                ...item,
                color: subTopicColors[index % subTopicColors.length]
            }));

        return subtopicData;
    }, [data, subTab]);

    // DEBUG: Trace before render
    console.log('DashboardCharts: Ready to render', {
        barDataLen: barData ? barData.length : 'null',
        trendDataLen: trendData ? trendData.length : 'null',
        mainTopicDataLen: mainTopicData ? mainTopicData.length : 'null'
    });

    // Aggregated constants/labels for cleaner code
    const labels = useMemo(() => {
        if (subTab === 'query') {
            return {
                areaTitle: 'Query Area',
                distributionTitle: 'Query Distribution',
                topTitle: 'Top Queries',
                trendTitle: 'Query Trends Over Time'
            };
        }
        return {
            areaTitle: 'Main Topic Distribution',
            distributionTitle: 'Overall Breakdown',
            topTitle: 'Top Issues',
            trendTitle: 'Issue Trends Over Time'
        };
    }, [subTab]);

    return (
        <div className="charts-grid">
            {/* Chart 1: Main Topic Distribution + Sub-Topics (Tabbed) */}
            <div className="card">
                <div className="card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <h3 className="card-title">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="card-title-icon">
                                <line x1="18" y1="20" x2="18" y2="10"></line>
                                <line x1="12" y1="20" x2="12" y2="4"></line>
                                <line x1="6" y1="20" x2="6" y2="14"></line>
                            </svg>
                            {activeTopicTab === 'distribution' ? labels.areaTitle : (subTab === 'query' ? 'All Query Sub-Topics' : 'All Issue Sub-Topics')}
                        </h3>
                        <span style={{ fontSize: '0.6875rem', color: '#6E7681', fontStyle: 'italic' }}>
                            Click bar to drill-in
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid #30363D' }}>
                            <button
                                onClick={() => setActiveTopicTab('distribution')}
                                style={{
                                    padding: '4px 12px',
                                    fontSize: '0.75rem',
                                    background: activeTopicTab === 'distribution' ? '#388BFD' : 'transparent',
                                    color: activeTopicTab === 'distribution' ? '#fff' : '#8B949E',
                                    border: 'none',
                                    borderRight: '1px solid #30363D',
                                    cursor: 'pointer',
                                }}
                            >
                                {labels.areaTitle}
                            </button>
                            <button
                                onClick={() => setActiveTopicTab('subtopics')}
                                style={{
                                    padding: '4px 12px',
                                    fontSize: '0.75rem',
                                    background: activeTopicTab === 'subtopics' ? '#388BFD' : 'transparent',
                                    color: activeTopicTab === 'subtopics' ? '#fff' : '#8B949E',
                                    border: 'none',
                                    cursor: 'pointer',
                                }}
                            >
                                {subTab === 'query' ? 'All Query Sub-Topics' : 'All Issue Sub-Topics'}
                            </button>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#8B949E' }}>
                            {activeTopicTab === 'subtopics'
                                ? `${allSubTopicsData.length} sub-topics`
                                : `${barData.length} main ${subTab === 'query' ? 'queries' : 'topics'}`}
                        </span>
                    </div>
                </div>

                {activeTopicTab === 'distribution' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '380px', width: '100%' }}>
                        {barData.length > 0 ? (
                            (() => {
                                const maxVal = Math.max(...barData.map(d => d.value));
                                const tickInterval = maxVal <= 5 ? 1 : maxVal <= 10 ? 2 : maxVal <= 20 ? 4 : 5;
                                const explicitMax = Math.ceil(maxVal / tickInterval) * tickInterval;
                                const ticks = Array.from({ length: Math.floor(explicitMax / tickInterval) + 1 }, (_, i) => i * tickInterval);
                                return (
                                    <>
                                        <div style={{ height: 'calc(100% - 64px)', overflowY: 'auto', overflowX: 'hidden', paddingRight: 2 }}>
                                            <div style={{ height: Math.max(barData.length * 40, 340), width: '100%', minHeight: '320px' }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 50, left: 10, bottom: 0 }} barCategoryGap="20%">
                                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(139, 148, 158, 0.1)" horizontal={false} />
                                                        <XAxis type="number" hide domain={[0, explicitMax]} ticks={ticks} />
                                                        <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10, fill: '#C9D1D9' }} interval={0} stroke="#30363D" tickLine={false} axisLine={false} />
                                                        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={22} onClick={(data) => handleMainTopicDrillIn(data.name)} style={{ cursor: 'pointer' }}>
                                                            {barData.map((entry, index) => (
                                                                <Cell key={`cell-${index}`} fill={subTab === 'issue' ? entry.color : '#7C3AED'} style={{ cursor: 'pointer' }} />
                                                            ))}
                                                            <LabelList dataKey="value" position="right" fill="#E5E7EB" fontSize={11} />
                                                        </Bar>
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                        <div style={{ height: '64px', flexShrink: 0, background: 'transparent' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={barData} layout="vertical" margin={{ top: 8, right: 50, left: 10, bottom: 24 }} barCategoryGap="20%">
                                                    <XAxis type="number" domain={[0, explicitMax]} ticks={ticks} stroke="#30363D" tick={{ fill: '#8B949E', fontSize: 10 }} axisLine={{ stroke: '#30363D' }} tickLine={{ stroke: '#30363D' }} />
                                                    <YAxis type="category" dataKey="name" width={160} tick={false} axisLine={false} tickLine={false} />
                                                    <Bar dataKey="value" fill="transparent" barSize={0} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </>
                                );
                            })()
                        ) : (
                            <div style={{ height: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B949E' }}>
                                No data available
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '430px', width: '100%' }}>
                        {allSubTopicsData.length > 0 ? (
                            (() => {
                                const maxVal = Math.max(...allSubTopicsData.map(d => d.value));
                                const tickInterval = maxVal <= 5 ? 1 : maxVal <= 10 ? 2 : maxVal <= 20 ? 4 : 5;
                                const explicitMax = Math.ceil(maxVal / tickInterval) * tickInterval;
                                const ticks = Array.from({ length: Math.floor(explicitMax / tickInterval) + 1 }, (_, i) => i * tickInterval);
                                return (
                                    <>
                                        <div style={{ height: 'calc(100% - 64px)', overflowY: 'auto', overflowX: 'hidden', paddingRight: 2 }}>
                                            <div style={{ height: Math.max(allSubTopicsData.length * 36, 380), width: '100%', minHeight: '360px' }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={allSubTopicsData} layout="vertical" margin={{ top: 5, right: 40, left: 10, bottom: 0 }} barCategoryGap="20%">
                                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(139, 148, 158, 0.1)" horizontal={false} />
                                                        <XAxis type="number" hide domain={[0, explicitMax]} ticks={ticks} />
                                                        <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10, fill: '#C9D1D9' }} interval={0} stroke="#30363D" tickLine={false} axisLine={false} />
                                                        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={22} onClick={(data) => handleSubTopicDrillIn(data.name)} style={{ cursor: 'pointer' }}>
                                                            {allSubTopicsData.map((entry, index) => (
                                                                <Cell key={`cell-${index}`} fill={entry.color} style={{ cursor: 'pointer' }} />
                                                            ))}
                                                            <LabelList dataKey="value" position="right" fill="#E5E7EB" fontSize={10} />
                                                        </Bar>
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                        <div style={{ height: '64px', flexShrink: 0, background: 'transparent' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={allSubTopicsData} layout="vertical" margin={{ top: 8, right: 40, left: 10, bottom: 24 }} barCategoryGap="20%">
                                                    <XAxis type="number" domain={[0, explicitMax]} ticks={ticks} stroke="#30363D" tick={{ fill: '#8B949E', fontSize: 10 }} axisLine={{ stroke: '#30363D' }} tickLine={{ stroke: '#30363D' }} />
                                                    <YAxis type="category" dataKey="name" width={160} tick={false} axisLine={false} tickLine={false} />
                                                    <Bar dataKey="value" fill="transparent" barSize={0} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </>
                                );
                            })()
                        ) : (
                            <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B949E' }}>
                                No sub-topic data available
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Chart 2: Overall Breakdown (Donut) */}
            <div className="card">
                <div className="card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h3 className="card-title">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="card-title-icon">
                            <path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path>
                            <path d="M22 12A10 10 0 0 0 12 2v10z"></path>
                        </svg>
                        {labels.distributionTitle}
                    </h3>
                        <span style={{ fontSize: '0.6875rem', color: '#6E7681', fontStyle: 'italic' }}>
                            Click slice to drill-in
                        </span>
                    </div>
                    <div className="topic-selector">
                        <PillDropdown
                            compact
                            label={subTab === 'query' ? 'Query Category' : 'Main Topic'}
                            options={chartTopics.map(t => ({ value: t === 'All Main Topics' ? 'All' : t, label: t }))}
                            value={activeSelectedMainTopic}
                            onChange={setActiveSelectedMainTopic}
                            searchable={chartTopics.length > 6}
                        />
                    </div>
                </div>
                <div className="chart-container" style={{ display: 'flex', flexDirection: 'column', height: '360px', padding: '16px' }}>
                    <div style={{ flex: '1', minHeight: '200px', display: 'flex', justifyContent: 'center' }}>
                        <div style={{ width: '100%', maxWidth: '300px', height: '100%' }}>
                            {mainTopicData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={mainTopicData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={2}
                                            dataKey="value"
                                            onClick={(data) => {
                                                if (activeSelectedMainTopic === 'All') {
                                                    handleMainTopicDrillIn(data.name);
                                                } else {
                                                    handleSubTopicDrillIn(data.name);
                                                }
                                            }}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            {mainTopicData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} stroke="#1C2128" strokeWidth={2} style={{ cursor: 'pointer' }} />
                                            ))}
                                        </Pie>
                                        <Tooltip cursor={{ fill: 'transparent' }}
                                            contentStyle={{ backgroundColor: '#1C2128', borderColor: '#30363D', borderRadius: '8px', color: '#F0F6FC' }}
                                            itemStyle={{ color: '#F0F6FC' }}
                                            formatter={(value, name, props) => {
                                                const real = props.payload.count ?? value;
                                                const pct = props.payload.percentage;
                                                return [`${real}${pct != null ? ` (${pct}%)` : ''}`, props.payload.fullName || props.payload.name];
                                            }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B949E' }}>
                                    No topic data
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ flex: '1', minHeight: '0', overflow: 'hidden', marginTop: '16px' }}>
                        <CustomLegend
                            data={mainTopicLegendData}
                            colors={mainTopicLegendData.map(d => d.color)}
                            maxHeight={150}
                            onDrillIn={(item) => {
                                if (activeSelectedMainTopic === 'All' || activeSelectedMainTopic === 'All Main Topics') {
                                    handleMainTopicDrillIn(item.name);
                                } else {
                                    handleSubTopicDrillIn(item.name);
                                }
                            }}
                            onExport={(item) => {
                                const isMainLevel = activeSelectedMainTopic === 'All' || activeSelectedMainTopic === 'All Main Topics';
                                const rows = isMainLevel ? filterForMainTopic(item.name) : filterForSubTopic(item.name);
                                exportConversationsCSV(rows, item.name);
                            }}
                        />
                    </div>
                </div>
                <style>{`
                    @media (min-width: 768px) {
                        .chart-container {
                            flex-direction: row !important;
                        }
                        .chart-container > div:first-child {
                            flex: 0 0 45% !important;
                            margin-right: 16px;
                        }
                        .chart-container > div:last-child {
                            flex: 1 !important;
                            margin-top: 0 !important;
                            height: 100%;
                        }
                        .legend-list {
                            max-height: 280px !important;
                        }
                    }
                `}</style>
            </div>

            {/* Chart 4: Trend Chart */}
                <style>{`
                    .trend-card-wrap:hover .trend-drill-icon { opacity: 1 !important; }
                    .trend-drill-icon:hover { background: rgba(99,102,241,0.35) !important; }
                `}</style>
                <div className="card trend-card-wrap" style={{ position: 'relative', gridColumn: '1 / -1' }}>
                <button
                    className="trend-drill-icon"
                    title="View underlying data for selected topic"
                    onClick={() => selectedTopic && handleSubTopicDrillIn(selectedTopic)}
                    style={{
                        position: 'absolute', top: '8px', right: '8px',
                        width: '26px', height: '26px', borderRadius: '50%',
                        background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.35)',
                        color: '#818CF8', cursor: 'pointer', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        opacity: 0, transition: 'opacity 0.2s ease, background 0.2s ease', padding: 0, zIndex: 2
                    }}
                >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        <line x1="11" y1="8" x2="11" y2="14" />
                        <line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                </button>
                <div className="card-header">
                    <div>
                        <h3 className="card-title">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="card-title-icon">
                                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                                <polyline points="17 6 23 6 23 12"></polyline>
                            </svg>
                            {labels.trendTitle}
                        </h3>
                        <p style={{ fontSize: '0.75rem', color: '#8B949E', margin: '4px 0 0 0' }}>
                            {getDateRangeText()}
                        </p>
                    </div>
                    <div className="topic-selector">
                        <PillDropdown
                            compact
                            label="Topic"
                            options={[
                                { value: '__ALL__', label: subTab === 'query' ? 'All Queries' : 'All Issues' },
                                ...filteredTopics.map(t => ({ value: t, label: t })),
                            ]}
                            value={selectedTopic}
                            onChange={setSelectedTopic}
                            searchable={filteredTopics.length > 6}
                        />
                    </div>
                </div>
                <div style={{ height: '360px', padding: '16px 0' }}>
                    {trendData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trendData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }} style={{ cursor: 'pointer' }}
                                onClick={(chartData) => {
                                    const point = chartData?.activePayload?.[0]?.payload;
                                    const iso = point?.isoDate;
                                    if (iso) handleDateTopicDrillIn(iso, selectedTopic);
                                }}
                            >
                                <defs>
                                    <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#C084FC" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#C084FC" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="day" stroke="#30363D" tick={{ fill: '#8B949E', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#30363D' }} />
                                <YAxis stroke="#30363D" tick={{ fill: '#8B949E', fontSize: 10 }} tickLine={false} axisLine={false} />
                                <Tooltip cursor={{ fill: 'transparent' }} content={<TrendTooltip />} />
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(139, 148, 158, 0.1)" vertical={false} />
                                <Area
                                    type="monotone"
                                    dataKey="Current"
                                    stroke="#C084FC"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorCurrent)"
                                    dot={{ r: 4, fill: '#C084FC', stroke: '#0D1117', strokeWidth: 2, cursor: 'pointer' }}
                                    activeDot={{
                                        r: 7,
                                        fill: '#C084FC',
                                        stroke: '#0D1117',
                                        strokeWidth: 2,
                                        cursor: 'pointer',
                                        onClick: (_e, payload) => {
                                            const iso = payload?.payload?.isoDate;
                                            if (iso) handleDateTopicDrillIn(iso, selectedTopic);
                                        },
                                    }}
                                >
                                    <LabelList dataKey="Current" position="top" fill="#C084FC" fontSize={11} fontWeight={600} offset={8} />
                                </Area>
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B949E' }}>
                            No trend data available
                        </div>
                    )}
                </div>
            </div>

            {/* Chart 5: Country-wise Queries & Issues (stacked bars, tab-switched between Main / Sub topics) */}
            <div className="card" style={{ gridColumn: '1 / -1' }}>
                <div className="card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <h3 className="card-title">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="card-title-icon">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="2" y1="12" x2="22" y2="12"></line>
                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z"></path>
                            </svg>
                            Country-wise Queries &amp; Issues
                        </h3>
                        <span style={{ fontSize: '0.6875rem', color: '#6E7681', fontStyle: 'italic' }}>
                            Click a segment to drill-in
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid #30363D' }}>
                            <button
                                onClick={() => setCountryTopicTab('main')}
                                style={{
                                    padding: '4px 12px', fontSize: '0.75rem',
                                    background: countryTopicTab === 'main' ? '#388BFD' : 'transparent',
                                    color: countryTopicTab === 'main' ? '#fff' : '#8B949E',
                                    border: 'none', borderRight: '1px solid #30363D', cursor: 'pointer',
                                }}
                            >Main Topics</button>
                            <button
                                onClick={() => setCountryTopicTab('sub')}
                                style={{
                                    padding: '4px 12px', fontSize: '0.75rem',
                                    background: countryTopicTab === 'sub' ? '#388BFD' : 'transparent',
                                    color: countryTopicTab === 'sub' ? '#fff' : '#8B949E',
                                    border: 'none', cursor: 'pointer',
                                }}
                            >Sub-Topics</button>
                        </div>
                        <button
                            onClick={exportCountryTopicCSV}
                            title="Export CSV"
                            style={{
                                background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)',
                                color: '#818cf8', borderRadius: '6px', padding: '4px 10px', fontSize: '0.7rem',
                                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px',
                            }}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            Export
                        </button>
                    </div>
                </div>
                <div className="ctwt-split" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, padding: '8px 16px 16px' }}>
                    <style>{`
                        @media (max-width: 1100px) { .ctwt-split { grid-template-columns: 1fr !important; } }
                        .ctwt-row { transition: background 0.15s; cursor: pointer; }
                        .ctwt-row:hover { background: rgba(255,255,255,0.03); }
                        .ctwt-sub-row td { background: rgba(99,102,241,0.04); border-top: 1px solid #21262D; }
                        .ctwt-sub-row td:first-child { padding-left: 48px; }
                    `}</style>

                    {/* Left: single-color bars per country (total count), matching Main Topic Distribution style */}
                    <div style={{ display: 'flex', flexDirection: 'column', height: 380 }}>
                        {(() => {
                            const { rows } = countryTopicData[countryTopicTab];
                            if (!rows || rows.length === 0) {
                                return (
                                    <div style={{ height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B949E' }}>
                                        No country data available
                                    </div>
                                );
                            }
                            const maxTotal = Math.max(...rows.map(r => r.total), 1);
                            const tickInterval = maxTotal <= 20 ? 5 : maxTotal <= 50 ? 10 : maxTotal <= 200 ? 50 : maxTotal <= 1000 ? 200 : 500;
                            const explicitMax = Math.ceil(maxTotal / tickInterval) * tickInterval;
                            const ticks = Array.from({ length: Math.floor(explicitMax / tickInterval) + 1 }, (_, i) => i * tickInterval);
                            const barHeight = Math.max(rows.length * 44, 160);

                            return (
                                <>
                                    {/* Scrollable bars (XAxis hidden — sticky axis lives below) */}
                                    <div style={{ height: 'calc(100% - 64px)', overflowY: 'auto', overflowX: 'hidden', paddingRight: 2 }}>
                                        <ResponsiveContainer width="100%" height={barHeight}>
                                            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 55, left: 20, bottom: 0 }} barCategoryGap="20%">
                                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,148,158,0.12)" horizontal={false} />
                                                <XAxis type="number" domain={[0, explicitMax]} ticks={ticks} hide />
                                                <YAxis type="category" dataKey="country" width={130} tick={{ fill: '#C9D1D9', fontSize: 11 }} interval={0} stroke="#30363D" tickLine={false} axisLine={false} />
                                                <Tooltip
                                                    cursor={{ fill: 'rgba(99,102,241,0.08)' }}
                                                    contentStyle={{ backgroundColor: '#1C2128', border: '1px solid #30363D', borderRadius: '8px' }}
                                                    labelStyle={{ color: '#F0F6FC', fontWeight: 700, marginBottom: 4 }}
                                                    itemStyle={{ color: '#C9D1D9' }}
                                                    formatter={(value) => [value, 'Conversations']}
                                                />
                                                <Bar dataKey="total" radius={[0, 4, 4, 0]} barSize={22} style={{ cursor: 'pointer' }}
                                                    onClick={(d) => { if (d && d.country) handleCountryDrillIn(d.country); }}>
                                                    {rows.map((row) => (
                                                        <Cell key={row.country} fill={getCountryColor(row.country)} />
                                                    ))}
                                                    <LabelList dataKey="total" position="right" fill="#E5E7EB" fontSize={11} fontWeight={600} />
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                    {/* Sticky bottom XAxis */}
                                    <div style={{ height: 64, flexShrink: 0, background: 'transparent' }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 55, left: 20, bottom: 24 }} barCategoryGap="20%">
                                                <XAxis type="number" domain={[0, explicitMax]} ticks={ticks} stroke="#30363D" tick={{ fill: '#8B949E', fontSize: 11 }} axisLine={{ stroke: '#30363D' }} tickLine={{ stroke: '#30363D' }} />
                                                <YAxis type="category" dataKey="country" width={130} tick={false} axisLine={false} tickLine={false} />
                                                <Bar dataKey="total" fill="transparent" barSize={0} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </>
                            );
                        })()}
                    </div>

                    {/* Right: country pill dropdown + legend-style topic list for the chosen country */}
                    {(() => {
                        const { rows, fullByCountry } = countryTopicData[countryTopicTab];
                        if (!rows || rows.length === 0) return <div />;
                        const countries = rows.map(r => r.country);
                        const activeCountry = (selectedCountry && countries.includes(selectedCountry))
                            ? selectedCountry
                            : countries[0];
                        const activeRow = rows.find(r => r.country === activeCountry);
                        const topics = fullByCountry[activeCountry] || [];
                        const total = activeRow?.total || 0;
                        const legendData = topics.map((it) => ({
                            name: it.topic,
                            value: it.count,
                            count: it.count,
                            percentage: total > 0 ? Math.round((it.count / total) * 100) : 0,
                            color: getTopicColor(it.topic, countryTopicTab),
                        }));

                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', height: 380 }}>
                                {/* Header: country pill dropdown + totals */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
                                    <PillDropdown
                                        compact
                                        label="Country"
                                        options={countries.map(c => ({ value: c, label: c }))}
                                        value={activeCountry}
                                        onChange={setSelectedCountry}
                                        searchable={countries.length > 6}
                                    />
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.7rem', color: '#8B949E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {countryTopicTab === 'main' ? 'Main Topics' : 'Sub-Topics'}
                                        </div>
                                        <div style={{ fontSize: '1.1rem', color: '#F0F6FC', fontWeight: 700 }}>
                                            {total.toLocaleString()} <span style={{ fontSize: '0.75rem', color: '#8B949E', fontWeight: 400 }}>· {topics.length} topics</span>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                                    <CustomLegend
                                        data={legendData}
                                        colors={legendData.map(d => d.color)}
                                        maxHeight={510}
                                        onDrillIn={(item) => handleCountryTopicDrillIn(activeCountry, item.name)}
                                    />
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* Conversation List Modal - Opens when clicking on chart elements */}
            {showDrillIn && (
                <ConversationList
                    conversations={drillInData.conversations}
                    title={drillInData.title}
                    onClose={() => setShowDrillIn(false)}
                    filterMainTopic={drillInData.filterMainTopic}
                    filterSubTopic={drillInData.filterSubTopic}
                    subTab={subTab}
                    onAskAthena={(label, count, items) => athena.openAthenaForContext(
                        label,
                        subTab === 'query' ? 'query-drill' : 'issue-drill',
                        label,
                        subTab === 'query' ? '#A371F7' : '#8B5CF6',
                        count,
                        items
                    )}
                />
            )}
            <AthenaPanel {...athena} pageLabel={subTab === 'query' ? 'queries' : 'issues'} />
        </div>
    );
};

export default DashboardCharts;
