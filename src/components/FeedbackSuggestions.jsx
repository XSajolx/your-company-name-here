import React, { useState, useMemo, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import DateRangePicker from "./DateRangePicker";
import TranscriptIntelligence from "./TranscriptIntelligence";
import AthenaIcon from "./AthenaIcon";
import AthenaPanel, { AthenaTriggerBtn } from "./AthenaPanel";
import { useAthena } from "../hooks/useAthena";
import PillDropdown from "./PillDropdown";
import ConversationViewer from "./ConversationViewer";

// ─── Supabase Client ─────────────────────────────────────────────
// Demo build: createClient is aliased to a local mock — no URL/key needed.
const supabase = createClient();

// ─── Helpers: parse Supabase rows into component format ──────────
function safeParseJSON(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val !== 'string') return [];
  try {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed)) return parsed;
    // Handle double-encoded JSON
    if (typeof parsed === 'string') {
      const inner = JSON.parse(parsed);
      if (Array.isArray(inner)) return inner;
    }
    return [];
  } catch {
    // Try splitting by newline as fallback
    return val.split('\n').filter(s => s.trim());
  }
}

function mapSentiment(raw) {
  if (!raw) return "Neutral";
  const s = raw.trim();
  if (s === "Very Positive") return "Positive";
  if (s === "Very Negative") return "Negative";
  if (["Positive", "Negative", "Neutral"].includes(s)) return s;
  return "Neutral";
}

function derivePriority(rawSentiment) {
  if (!rawSentiment) return "Medium";
  const s = rawSentiment.trim();
  if (s === "Negative" || s === "Very Negative") return "High";
  if (s === "Neutral") return "Medium";
  if (s === "Positive" || s === "Very Positive") return "Low";
  return "Medium";
}

function mapRow(row, index) {
  const mainTopics = safeParseJSON(row["Main-Topics"]);
  const subTopics = safeParseJSON(row["Sub-Topics"]);

  const summary = row["feedback_summary"] || "";
  const quotes = row["client_quotes"] && row["client_quotes"] !== "NOT_FOUND" ? row["client_quotes"] : "";

  // No source-string truncation: the modal lets headlines wrap to multiple
  // lines, and the CSV's "Headline" column carries the full sentence. If you
  // need a hard width cap, do it via CSS `line-clamp` on the rendered cell,
  // not by chopping the data here — chopping leaks "..." into the CSV.
  const headline = summary || quotes || "No feedback text";
  const fullText = quotes || summary || "No feedback text";

  const rawType = row["feedback_type"] || "feedback";
  const type = rawType === "suggestion" ? "suggestion" : "feedback";

  const rawPriority = row["feedback_priority"];
  const priority = ["High", "Medium", "Low"].includes(rawPriority) ? rawPriority : "Medium";

  // Normalize feedback_sentiment from the LLM output (e.g. "Positive" / "positive").
  const rawFbSent = row["feedback_sentiment"];
  const feedbackSentiment = rawFbSent
    ? (/^pos/i.test(rawFbSent) ? "Positive" : /^neg/i.test(rawFbSent) ? "Negative" : "Neutral")
    : null;

  return {
    id: "FB-" + index,
    chatId: row["Conversation ID"] != null ? String(row["Conversation ID"]) : "MANUAL",
    date: row["created_date_bd"] || "",
    headline,
    fullText,
    // Category comes straight from the Intercom topic classification (Main-Topics
    // tagged by analyze-topics). No custom rules or hardcoded taxonomy.
    category: mainTopics.length > 0 ? String(mainTopics[0]) : "Uncategorized",
    sentiment: mapSentiment(row["Sentiment End"]),
    feedbackSentiment,
    priority,
    status: "New",
    type,
    product: row["Product"] || null,
    common_topic: subTopics.length > 0 ? String(subTopics[0]) : null,
    feedback_confidence: row["feedback_confidence"] ?? null,
    feedback_reason: row["feedback_reason"] || null,
  };
}

// No hardcoded categories — every category (Main-Topic) is resolved dynamically
// via getCategoryMeta, which assigns a stable color/icon from DYNAMIC_COLORS.
const CATEGORIES_META_BASE = {
  "Uncategorized": { color: "#64748b", icon: "📋" },
};

// Dynamic color palette for categories not in the base set
const DYNAMIC_COLORS = [
  { color: "#f97316", icon: "📌" },
  { color: "#8B5CF6", icon: "📎" },
  { color: "#ec4899", icon: "📝" },
  { color: "#14b8a6", icon: "📊" },
  { color: "#8b5cf6", icon: "📋" },
  { color: "#f43f5e", icon: "📍" },
  { color: "#84cc16", icon: "📂" },
  { color: "#d946ef", icon: "📁" },
  { color: "#0ea5e9", icon: "📇" },
  { color: "#fbbf24", icon: "📄" },
];
const _dynamicCategoryCache = {};
let _dynamicColorIdx = 0;

function getCategoryMeta(category) {
  if (CATEGORIES_META_BASE[category]) return CATEGORIES_META_BASE[category];
  if (_dynamicCategoryCache[category]) return _dynamicCategoryCache[category];
  const meta = DYNAMIC_COLORS[_dynamicColorIdx % DYNAMIC_COLORS.length];
  _dynamicCategoryCache[category] = meta;
  _dynamicColorIdx++;
  return meta;
}

// CATEGORIES_META as a Proxy so existing code like CATEGORIES_META[key] still works
const CATEGORIES_META = new Proxy(CATEGORIES_META_BASE, {
  get(target, prop) {
    if (typeof prop === "symbol") return target[prop];
    return getCategoryMeta(prop);
  },
  has(target, prop) {
    return true; // all categories are "known"
  },
  ownKeys(target) {
    return [...Object.keys(target), ...Object.keys(_dynamicCategoryCache)];
  },
  getOwnPropertyDescriptor(target, prop) {
    return { configurable: true, enumerable: true, value: getCategoryMeta(prop) };
  },
});

const PRIORITY_COLORS = {
  "High": { bg: "rgba(255,46,151,0.15)", text: "#FF2E97", dot: "#FF2E97" },
  "Medium": { bg: "rgba(168,85,247,0.15)", text: "#D946EF", dot: "#D946EF" },
  "Low": { bg: "rgba(0,240,255,0.15)", text: "#00F0FF", dot: "#00F0FF" },
};

// ─── Styles ──────────────────────────────────────────────────────
const styles = {
  page: {
    minHeight: "100vh",
    background: "#0b0f14",
    color: "#e2e8f0",
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    padding: 0,
    margin: 0,
  },
  header: {
    background: "linear-gradient(135deg, rgba(15, 20, 35, 0.8) 0%, rgba(30, 41, 59, 0.6) 50%, rgba(15, 20, 35, 0.8) 100%)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    borderRadius: 16,
    padding: "1.25rem 2rem",
    marginBottom: "1.5rem",
    border: "1px solid rgba(255,255,255,0.06)",
    borderLeft: "3px solid #8B5CF6",
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  headerIcon: {
    fontSize: 20,
    color: "#8B5CF6",
  },
  headerTitle: {
    fontSize: "1.25rem",
    fontWeight: 700,
    letterSpacing: "-0.01em",
    background: "linear-gradient(135deg, #F8FAFC 0%, #94A3B8 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  },
  content: {
    padding: "24px 28px",
    maxWidth: 1440,
    margin: "0 auto",
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: "#f1f5f9",
    margin: 0,
  },
  pageSubtitle: {
    fontSize: 14,
    color: "#64748b",
    margin: "4px 0 0",
    fontWeight: 400,
  },
  filterBar: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 24,
    alignItems: "center",
  },
  metricsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
    marginBottom: 24,
  },
  card: {
    background: "linear-gradient(145deg, rgba(17,24,39,0.9), rgba(15,20,30,0.95))",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 14,
    overflow: "hidden",
  },
  cardHeader: {
    padding: "18px 22px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "#e2e8f0",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  cardTitleIcon: {
    fontSize: 16,
    opacity: 0.6,
  },
  table: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
  },
  th: {
    textAlign: "left",
    padding: "10px 16px",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: "#475569",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "12px 16px",
    fontSize: 13,
    color: "#cbd5e1",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
    verticalAlign: "middle",
  },
  trHover: {
    cursor: "pointer",
    transition: "background 0.15s",
  },
  badge: (bg, text) => ({
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    background: bg,
    color: text,
    whiteSpace: "nowrap",
  }),
  chatLink: {
    color: "#C084FC",
    textDecoration: "none",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: 12,
    cursor: "pointer",
    transition: "color 0.15s",
  },
  headline: {
    color: "#e2e8f0",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1.4,
    transition: "color 0.15s",
  },
  modal: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.7)",
    backdropFilter: "blur(4px)",
  },
  modalContent: {
    position: "relative",
    background: "#111827",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: "28px 32px",
    maxWidth: 600,
    width: "90%",
    maxHeight: "80vh",
    overflow: "auto",
    zIndex: 1,
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    background: "rgba(255,255,255,0.06)",
    border: "none",
    color: "#94a3b8",
    width: 32,
    height: 32,
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  rankBar: (pct, color) => ({
    height: 8,
    borderRadius: 4,
    background: `linear-gradient(90deg, ${color}, ${color}88)`,
    width: `${pct}%`,
    transition: "width 0.5s ease",
  }),
  input: {
    width: "100%",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    color: "#e2e8f0",
    padding: "10px 14px",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.2s",
  },
  emptyState: {
    textAlign: "center",
    padding: "48px 24px",
    color: "#475569",
    fontSize: 14,
  },
  pagination: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderTop: "1px solid rgba(255,255,255,0.04)",
  },
  pageBtn: (active) => ({
    background: active ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)",
    border: active ? "1px solid rgba(99,102,241,0.4)" : "1px solid rgba(255,255,255,0.06)",
    color: active ? "#818cf8" : "#64748b",
    borderRadius: 6,
    padding: "5px 12px",
    fontSize: 12,
    cursor: "pointer",
    fontWeight: 500,
  }),
  dotPulse: (color) => ({
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: color,
    display: "inline-block",
    marginRight: 6,
  }),
};

function parseFeedbackDateRange(dateRange) {
  if (!dateRange) return { fromStr: '', toStr: '' };
  if (dateRange.startsWith('custom_')) {
    const parts = dateRange.split('_');
    if (parts.length === 3) return { fromStr: parts[1], toStr: parts[2] };
  }
  const now = new Date();
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sub = n => { const d = new Date(today); d.setDate(today.getDate() - n); return d; };
  const map = { today: [sub(0), sub(0)], yesterday: [sub(1), sub(1)], last_7_days: [sub(6), sub(0)], last_30_days: [sub(29), sub(0)], last_90_days: [sub(89), sub(0)] };
  if (map[dateRange]) return { fromStr: fmt(map[dateRange][0]), toStr: fmt(map[dateRange][1]) };
  if (dateRange === 'this_week') { const s = new Date(today); s.setDate(today.getDate() - today.getDay()); return { fromStr: fmt(s), toStr: fmt(today) }; }
  if (dateRange === 'this_month') return { fromStr: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), toStr: fmt(today) };
  if (dateRange === 'last_month') { const s = new Date(today.getFullYear(), today.getMonth()-1, 1); const e = new Date(today.getFullYear(), today.getMonth(), 0); return { fromStr: fmt(s), toStr: fmt(e) }; }
  return { fromStr: '', toStr: '' };
}

// ─── Component ───────────────────────────────────────────────────
export default function FeedbackSuggestions() {
  // Page-level tab (Feedback | Transcript Intelligence)
  const [pageTab, setPageTab] = useState("feedback");

  // Data + loading
  const [feedbackData, setFeedbackData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals + row interactions
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [viewingChat, setViewingChat] = useState(null);
  const [hoveredRow, setHoveredRow] = useState(null);

  // Filters (category is multi-select array now; others remain string)
  const [filterCategory, setFilterCategory] = useState([]);
  const [filterPriority, setFilterPriority] = useState("All");
  const [filterProduct, setFilterProduct] = useState("All");
  const [filterFbSentiment, setFilterFbSentiment] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState("last_7_days");
  const [categorySearch, setCategorySearch] = useState("");

  // Table state
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const ITEMS_PER_PAGE = 8;

  // Inner feedback/suggestion tab
  const [activeTab, setActiveTab] = useState("feedback");

  // Common themes expanded row
  const [expandedTheme, setExpandedTheme] = useState(null);

  // Drill-down modal (chart segments, categories)
  const [drillDown, setDrillDown] = useState(null);
  const [drillPage, setDrillPage] = useState(1);
  const DRILL_PER_PAGE = 15;

  // Add-feedback modal (stub — writes to local state only)
  const [showAddModal, setShowAddModal] = useState(false);
  const [newText, setNewText] = useState("");
  const [newProduct, setNewProduct] = useState("CFD");
  const [newPriority, setNewPriority] = useState("Medium");
  const [toast, setToast] = useState(null);

  // Athena — shared hook handles state, backend calls, rendering, transcripts.
  const athena = useAthena();
  const openAthenaForContext = athena.openAthenaForContext;

  // ─── Fetch data from Supabase on mount ──────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function fetchFeedback() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("Intercom Topic")
          .select('"Conversation ID", "Main-Topics", "Sub-Topics", "Sentiment End", created_date_bd, "Country", "Product", is_feedback, feedback_type, feedback_priority, feedback_confidence, feedback_reason, feedback_summary, feedback_sentiment, client_quotes')
          .eq("is_feedback", true)
          .order("created_date_bd", { ascending: false })
          .range(0, 4999);

        if (cancelled) return;
        if (error) {
          console.error("Supabase fetch error:", error);
          setLoading(false);
          return;
        }
        console.log('Feedback raw rows:', data?.length, data?.slice(0, 2));
        const mapped = (data || []).map((row, i) => {
          try { return mapRow(row, i); } catch (e) { console.error('mapRow error:', i, e, row); return null; }
        }).filter(Boolean);
        console.log('Feedback mapped:', mapped.length, mapped.slice(0, 2));
        setFeedbackData(mapped);
      } catch (err) {
        console.error("Feedback fetch failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchFeedback();
    return () => { cancelled = true; };
  }, []);

  // ─── Aggregations ─────────────────────────────────────────────────
  const allData = useMemo(() => [...feedbackData], [feedbackData]);

  const filtered = useMemo(() => {
    let d = allData.filter(f => f.type === activeTab);
    if (filterCategory.length > 0) d = d.filter(f => filterCategory.includes(f.category));
    if (filterPriority !== "All") d = d.filter(f => f.priority === filterPriority);
    if (filterProduct !== "All") d = d.filter(f => f.product === filterProduct);
    if (filterFbSentiment !== "All") d = d.filter(f => f.feedbackSentiment === filterFbSentiment);
    if (searchQuery.trim()) d = d.filter(f => f.headline.toLowerCase().includes(searchQuery.toLowerCase()));
    const { fromStr, toStr } = parseFeedbackDateRange(dateRange);
    if (fromStr) d = d.filter(f => f.date >= fromStr);
    if (toStr) d = d.filter(f => f.date <= toStr);
    d.sort((a, b) => {
      if (sortBy === "date") return sortDir === "desc" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
      if (sortBy === "priority") {
        const order = { High: 3, Medium: 2, Low: 1 };
        return sortDir === "desc" ? (order[b.priority] - order[a.priority]) : (order[a.priority] - order[b.priority]);
      }
      return 0;
    });
    return d;
  }, [allData, activeTab, filterCategory, filterPriority, filterProduct, filterFbSentiment, searchQuery, dateRange, sortBy, sortDir]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // All top-bar filters apply page-wide — every section derived from tabData
  // (category ranking, priority/product donuts, common themes, drill-in modal,
  // tab badges) honors them. Only sort stays table-local.
  const tabData = useMemo(() => {
    let d = allData.filter(f => f.type === activeTab);
    if (filterCategory.length > 0) d = d.filter(f => filterCategory.includes(f.category));
    if (filterPriority !== 'All') d = d.filter(f => f.priority === filterPriority);
    if (filterProduct !== 'All') d = d.filter(f => f.product === filterProduct);
    if (filterFbSentiment !== 'All') d = d.filter(f => f.feedbackSentiment === filterFbSentiment);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      d = d.filter(f => (f.headline || '').toLowerCase().includes(q));
    }
    const { fromStr, toStr } = parseFeedbackDateRange(dateRange);
    if (fromStr) d = d.filter(f => f.date >= fromStr);
    if (toStr) d = d.filter(f => f.date <= toStr);
    return d;
  }, [allData, activeTab, filterCategory, filterPriority, filterProduct, filterFbSentiment, searchQuery, dateRange]);

  const categoryRanking = useMemo(() => {
    const counts = {};
    tabData.forEach(f => { counts[f.category] = (counts[f.category] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([cat, count]) => ({
      category: cat,
      count,
      meta: CATEGORIES_META[cat] || { color: "#64748b", icon: "📋" },
    }));
  }, [tabData]);

  const maxCatCount = categoryRanking[0]?.count || 1;

  const drillDownData = useMemo(() => {
    if (!drillDown) return [];
    if (drillDown.type === "priority") return tabData.filter(f => f.priority === drillDown.value);
    if (drillDown.type === "product") return tabData.filter(f => f.product === drillDown.value);
    if (drillDown.type === "category") return tabData.filter(f => f.category === drillDown.value);
    // "theme" comes with items attached on the drillDown object itself (from the Feedback Area table).
    if (drillDown.type === "theme") return Array.isArray(drillDown.items) ? drillDown.items : [];
    return [];
  }, [drillDown, tabData]);

  const metrics = useMemo(() => {
    const total = tabData.length;
    const highPriority = tabData.filter(f => f.priority === "High").length;
    return { total, highPriority };
  }, [tabData]);

  const allCategories = useMemo(() => {
    const cats = new Set();
    feedbackData.forEach(f => { if (f.category) cats.add(f.category); });
    return [...cats].sort();
  }, [feedbackData]);

  const allProducts = useMemo(() => {
    const prods = new Set();
    feedbackData.forEach(f => { if (f.product) prods.add(f.product); });
    return [...prods].sort();
  }, [feedbackData]);

  const sixMonthCutoff = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().slice(0, 10);
  }, []);

  const commonThemes = useMemo(() => {
    // Include every item in tabData so the sum of theme counts equals the
    // "Total Feedback/Suggestion" tab count. Items without a common_topic
    // fall under "Uncategorized", and singletons are kept.
    const groups = {};
    tabData.forEach(item => {
      const topic = item.common_topic || 'Uncategorized';
      if (!groups[topic]) groups[topic] = { theme: topic, count: 0, items: [], latestDate: item.date };
      groups[topic].count++;
      groups[topic].items.push(item);
      if (item.date && item.date > (groups[topic].latestDate || '')) groups[topic].latestDate = item.date;
    });
    return Object.values(groups).sort((a, b) => b.count - a.count);
  }, [tabData]);

  // ─── Handlers ─────────────────────────────────────────────────────
  const handleSort = (field) => {
    if (sortBy === field) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(field); setSortDir("desc"); }
  };

  const SortArrow = ({ field }) => (
    <span style={{ marginLeft: 4, opacity: sortBy === field ? 1 : 0.3, fontSize: 10 }}>
      {sortBy === field && sortDir === "asc" ? "▲" : "▼"}
    </span>
  );

  const openDrillDown = (data) => {
    setDrillDown(data);
    setDrillPage(1);
  };
  const closeDrillDown = () => setDrillDown(null);

  // Download a set of feedback rows as CSV.
  const exportFeedbackCSV = (rows, title) => {
    if (!rows || rows.length === 0) return;
    const columns = [
      { key: "chatId", label: "Conversation ID" },
      { key: "date", label: "Date" },
      { key: "category", label: "Category" },
      { key: "product", label: "Product" },
      { key: "type", label: "Type" },
      { key: "priority", label: "Priority" },
      { key: "sentiment", label: "Sentiment" },
      { key: "feedbackSentiment", label: "Feedback Sentiment" },
      { key: "headline", label: "Headline" },
      { key: "fullText", label: "Full Text" },
    ];
    const escape = (v) => {
      if (v == null) return "";
      const s = Array.isArray(v) ? v.join(" | ") : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = columns.map(c => c.label).join(",");
    const csvRows = rows.map(r => columns.map(c => escape(r[c.key])).join(","));
    const csv = [header, ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${String(title).replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "")}_${activeTab}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Convenience wrappers kept for the earlier Top Feedback Category row actions.
  const exportCategoryCSV = (categoryName) => {
    exportFeedbackCSV(tabData.filter(f => f.category === categoryName), categoryName);
  };

  // Manual entry (stub — local state only; no Supabase insert wired).
  // Categories now come from the Intercom topic classification for real rows;
  // manual entries default to "Uncategorized" until they're analyzed.
  const classifyCategory = () => "Uncategorized";
  const generateHeadline = (text) => {
    const trimmed = text.trim();
    const firstSentence = trimmed.split(/[.!?]/)[0].trim();
    if (firstSentence.length > 0 && firstSentence.length <= 100) return firstSentence;
    if (trimmed.length <= 80) return trimmed;
    return trimmed.slice(0, 80).trim() + "...";
  };
  const submitManualEntry = () => {
    const text = newText.trim();
    if (text.length < 10) {
      setToast({ type: "error", message: "Please enter at least 10 characters" });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    const headline = generateHeadline(text);
    const category = classifyCategory(text);
    const prefix = activeTab === "feedback" ? "FB" : "SG";
    const nextNum = String(feedbackData.length + 1).padStart(3, "0");
    const today = new Date().toISOString().slice(0, 10);
    const entry = {
      id: `${prefix}-${nextNum}`,
      chatId: "MANUAL",
      date: today,
      headline,
      fullText: text,
      category,
      sentiment: "Neutral",
      priority: newPriority,
      status: "New",
      type: activeTab,
      product: newProduct,
      common_topic: null,
      manualPriority: true,
    };
    // TODO: Persist to Supabase. For now, local-state-only until insert schema is finalized.
    setFeedbackData(prev => [entry, ...prev]);
    setShowAddModal(false);
    setNewText("");
    setNewProduct("CFD");
    setNewPriority("Medium");
    setCurrentPage(1);
    setToast({ type: "success", message: `${activeTab === "feedback" ? "Feedback" : "Suggestion"} added (local only) — AI categorized as "${category}"` });
    setTimeout(() => setToast(null), 4000);
  };

  return (
    <div style={styles.page}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes athenaFlameGlow { 0%,100% { box-shadow: 0 0 8px rgba(0,180,255,0.3), 0 0 16px rgba(0,180,255,0.15); } 50% { box-shadow: 0 0 14px rgba(0,210,255,0.55), 0 0 28px rgba(0,180,255,0.3); } }
        @keyframes athenaIconGlow { 0%,100% { filter: drop-shadow(0 0 5px rgba(0,210,255,0.5)) drop-shadow(0 0 10px rgba(140,80,255,0.35)); } 50% { filter: drop-shadow(0 0 9px rgba(0,210,255,0.85)) drop-shadow(0 0 18px rgba(140,80,255,0.55)); } }
        @keyframes athenaBackdropIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes athenaOpen { from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
        @keyframes athenaFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes athenaPulse { 0%,80%,100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }
        @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>

      <div style={styles.content}>
        {/* Page Heading */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            position: "relative",
            background: "linear-gradient(90deg, rgba(30,27,75,0.6) 0%, rgba(15,20,32,0.7) 40%, rgba(10,15,25,0.6) 100%)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 14,
            padding: "18px 24px 18px 34px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            overflow: "hidden",
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          }}>
            <div style={{
              position: "absolute",
              top: 10,
              bottom: 10,
              left: 14,
              width: 3,
              borderRadius: 2,
              background: "linear-gradient(180deg, #8b5cf6, #8B5CF6)",
              boxShadow: "0 0 12px rgba(139,92,246,0.6)",
            }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#FF2E97", flexShrink: 0, filter: "drop-shadow(0 0 8px rgba(255,46,151,0.4))" }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h1 style={{ ...styles.pageTitle, fontSize: 20 }}>Feedback and Suggestions</h1>
          </div>
          <p style={{ ...styles.pageSubtitle, marginTop: 10, paddingLeft: 4 }}>AI-identified customer insights and manually submitted feedback for product improvement.</p>
        </div>

        {/* Page-Level Tab Switcher (preserved from existing) */}
        <div style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: 24,
          background: "rgba(15, 23, 42, 0.6)",
          padding: 4,
          borderRadius: 12,
          width: "fit-content",
        }}>
          {[
            { key: "feedback", label: "Feedback", icon: "💡" },
            { key: "transcript", label: "Transcript Intelligence", icon: "🧠" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setPageTab(tab.key)}
              style={{
                padding: "0.75rem 1.5rem",
                borderRadius: 10,
                border: "none",
                background: pageTab === tab.key
                  ? "linear-gradient(135deg, #8B5CF6 0%, #8B5CF6 100%)"
                  : "transparent",
                color: pageTab === tab.key ? "#fff" : "#94A3B8",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s ease",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Transcript Intelligence */}
        {pageTab === "transcript" && <TranscriptIntelligence />}

        {/* Feedback Tab */}
        {pageTab === "feedback" && (<>

        {/* Inner Tab Switcher + Add Button */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
          <div style={{
            display: "inline-flex",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 10,
            padding: 3,
            border: "1px solid rgba(255,255,255,0.06)",
          }}>
            {[
              { key: "feedback", label: "Painpoints" },
              { key: "suggestion", label: "Feedback & Suggestion" },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setCurrentPage(1); setFilterCategory([]); setFilterProduct("All"); setExpandedTheme(null); }}
                style={{
                  padding: "8px 24px",
                  fontSize: 13,
                  fontWeight: 600,
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  background: activeTab === tab.key ? "rgba(99,102,241,0.2)" : "transparent",
                  color: activeTab === tab.key ? "#818cf8" : "#64748b",
                  boxShadow: activeTab === tab.key ? "0 0 12px rgba(99,102,241,0.1)" : "none",
                }}
              >
                {tab.label}
                <span style={{
                  marginLeft: 8,
                  fontSize: 11,
                  padding: "2px 7px",
                  borderRadius: 6,
                  background: activeTab === tab.key ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.06)",
                  color: activeTab === tab.key ? "#a5b4fc" : "#475569",
                }}>
                  {loading ? "..." : (() => {
                    const { fromStr, toStr } = parseFeedbackDateRange(dateRange);
                    const q = searchQuery.trim().toLowerCase();
                    return allData.filter(f =>
                      f.type === tab.key
                      && (filterCategory.length === 0 || filterCategory.includes(f.category))
                      && (filterPriority === 'All' || f.priority === filterPriority)
                      && (filterProduct === 'All' || f.product === filterProduct)
                      && (filterFbSentiment === 'All' || f.feedbackSentiment === filterFbSentiment)
                      && (!q || (f.headline || '').toLowerCase().includes(q))
                      && (!fromStr || f.date >= fromStr)
                      && (!toStr || f.date <= toStr)
                    ).length;
                  })()}
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "linear-gradient(135deg, #8B5CF6, #8b5cf6)",
              border: "none",
              color: "#fff",
              padding: "10px 20px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(99,102,241,0.3)",
              transition: "transform 0.1s, box-shadow 0.15s",
            }}
            onMouseOver={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 18px rgba(99,102,241,0.45)"; }}
            onMouseOut={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(99,102,241,0.3)"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New {activeTab === "feedback" ? "Feedback" : "Suggestion"}
          </button>
        </div>

        {/* Sticky Filter Bar */}
        <div style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 24,
          padding: "12px 0",
          background: "rgba(11,15,20,0.85)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          marginLeft: -28,
          marginRight: -28,
          paddingLeft: 28,
          paddingRight: 28,
        }}>
          <DateRangePicker
            value={dateRange}
            onChange={v => { setDateRange(v); setCurrentPage(1); }}
            compact
          />

          <PillDropdown
            compact
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
              </svg>
            }
            label="All Categories"
            value={filterCategory}
            onChange={v => { setFilterCategory(v); setCurrentPage(1); }}
            multi
            options={allCategories.map(c => ({ value: c, label: c }))}
          />
          <PillDropdown
            compact
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 21V4" />
                <path d="M5 4h11l-2 4 2 4H5" />
              </svg>
            }
            label="All Priorities"
            value={filterPriority}
            onChange={v => { setFilterPriority(v); setCurrentPage(1); }}
            searchable={false}
            options={[
              { value: "All", label: "All Priorities" },
              { value: "High", label: "High" },
              { value: "Medium", label: "Medium" },
              { value: "Low", label: "Low" },
            ]}
          />
          <PillDropdown
            compact
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            }
            label="All Products"
            value={filterProduct}
            onChange={v => { setFilterProduct(v); setCurrentPage(1); }}
            searchable={false}
            options={[
              { value: "All", label: "All Products" },
              ...allProducts.map(p => ({ value: p, label: p })),
            ]}
          />
          <PillDropdown
            compact
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            }
            label="All Feedback Types"
            value={filterFbSentiment}
            onChange={v => { setFilterFbSentiment(v); setCurrentPage(1); }}
            searchable={false}
            options={[
              { value: "All", label: "All Feedback Types" },
              { value: "Positive", label: "Positive" },
              { value: "Neutral", label: "Neutral" },
              { value: "Negative", label: "Negative" },
            ]}
          />

          <div style={{ flex: "1 1 0", minWidth: 0 }} />

          <div style={{ position: "relative", flex: "0 1 280px", maxWidth: 280 }}>
            <input
              type="text"
              placeholder="🔍  Search feedback..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              style={{ ...styles.input, paddingLeft: 14, height: 38 }}
            />
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div style={{
            textAlign: "center",
            padding: "48px 24px",
            color: "#64748b",
            fontSize: 14,
          }}>
            <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.5 }}>⏳</div>
            <div style={{ fontWeight: 500, color: "#94a3b8" }}>Loading feedback data from Supabase...</div>
          </div>
        )}

        {!loading && (<>
          {/* Top Feedback Areas (left) + Total Feedback charts (right) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 480px", gap: 20, marginBottom: 24, alignItems: "stretch" }}>
            {/* Right column — two donut cards */}
            <div style={{ order: 2, display: "flex", flexDirection: "column", gap: 20 }}>
              {(() => {
                const toRad = (deg) => (deg * Math.PI) / 180;
                const size = 130;
                const cx = size / 2;
                const cy = size / 2;
                const outerR = 56;
                const innerR = 36;

                const arcPath = (startAngle, angle) => {
                  if (angle >= 359.99) {
                    return `M ${cx} ${cy - outerR} A ${outerR} ${outerR} 0 1 1 ${cx - 0.001} ${cy - outerR} L ${cx - 0.001} ${cy - innerR} A ${innerR} ${innerR} 0 1 0 ${cx} ${cy - innerR} Z`;
                  }
                  const end = startAngle + angle;
                  const large = angle > 180 ? 1 : 0;
                  const x1 = cx + outerR * Math.cos(toRad(startAngle));
                  const y1 = cy + outerR * Math.sin(toRad(startAngle));
                  const x2 = cx + outerR * Math.cos(toRad(end));
                  const y2 = cy + outerR * Math.sin(toRad(end));
                  const ix1 = cx + innerR * Math.cos(toRad(end));
                  const iy1 = cy + innerR * Math.sin(toRad(end));
                  const ix2 = cx + innerR * Math.cos(toRad(startAngle));
                  const iy2 = cy + innerR * Math.sin(toRad(startAngle));
                  return `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${large} 0 ${ix2} ${iy2} Z`;
                };

                const buildSlices = (segments) => {
                  const total = segments.reduce((s, p) => s + p.count, 0) || 1;
                  let cumAngle = -90;
                  const slices = segments.map(s => {
                    const angle = (s.count / total) * 360;
                    const start = cumAngle;
                    cumAngle += angle;
                    return { ...s, startAngle: start, angle };
                  });
                  return { slices, total };
                };

                const renderDonut = (slices, total, gradPrefix, centerLabel, drillType) => (
                  <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
                    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ filter: "drop-shadow(0 0 12px rgba(0,0,0,0.4))" }}>
                      <defs>
                        {slices.map((s, i) => (
                          <linearGradient key={i} id={`${gradPrefix}-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor={s.color} stopOpacity="1" />
                            <stop offset="100%" stopColor={s.colorEnd || s.color} stopOpacity="0.9" />
                          </linearGradient>
                        ))}
                      </defs>
                      <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={outerR - innerR} />
                      {slices.map((s, i) => s.count > 0 && (
                        <path
                          key={i}
                          d={arcPath(s.startAngle, s.angle)}
                          fill={`url(#${gradPrefix}-${i})`}
                          stroke="#0b0f14"
                          strokeWidth={2}
                          style={{ filter: `drop-shadow(0 0 10px ${s.glow})`, cursor: "pointer", transition: "opacity 0.15s" }}
                          onClick={() => openDrillDown({ type: drillType, value: s.label, label: s.label, color: s.color })}
                          onMouseOver={e => e.currentTarget.style.opacity = "0.8"}
                          onMouseOut={e => e.currentTarget.style.opacity = "1"}
                        />
                      ))}
                      <circle cx={cx} cy={cy} r={innerR - 4} fill="#0b0f14" />
                      <circle cx={cx} cy={cy} r={innerR - 4} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
                      <text x={cx} y={cy - 5} textAnchor="middle" fill="#f1f5f9" fontSize={20} fontWeight={700} fontFamily="'DM Sans', sans-serif">{total}</text>
                      <text x={cx} y={cy + 10} textAnchor="middle" fill="#64748b" fontSize={9} fontWeight={500} fontFamily="'DM Sans', sans-serif">{centerLabel}</text>
                    </svg>
                  </div>
                );

                const renderLegend = (slices, total, suffix, drillType) => (
                  <div style={{ display: "flex", flexDirection: "row", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
                    {slices.map((s, i) => {
                      const pct = ((s.count / total) * 100).toFixed(0);
                      return (
                        <div key={i}
                          style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "4px 8px", borderRadius: 8, transition: "background 0.15s" }}
                          onClick={() => openDrillDown({ type: drillType, value: s.label, label: s.label, color: s.color })}
                          onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                          onMouseOut={e => e.currentTarget.style.background = "transparent"}
                        >
                          <div style={{
                            width: 10, height: 10, borderRadius: "50%",
                            background: `linear-gradient(135deg, ${s.color}, ${s.colorEnd || s.color})`,
                            boxShadow: `0 0 10px ${s.glow}`,
                            flexShrink: 0,
                          }} />
                          <span style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{s.count}</span>
                          <span style={{ fontSize: 11, color: "#64748b" }}>{pct}%</span>
                          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>{s.label}{suffix ? ` ${suffix}` : ""}</span>
                        </div>
                      );
                    })}
                  </div>
                );

                const prioritySegments = [
                  { label: "High", count: tabData.filter(f => f.priority === "High").length, color: "#FF2E97", colorEnd: "#FF69B4", glow: "rgba(255,46,151,0.5)" },
                  { label: "Medium", count: tabData.filter(f => f.priority === "Medium").length, color: "#D946EF", colorEnd: "#C084FC", glow: "rgba(168,85,247,0.5)" },
                  { label: "Low", count: tabData.filter(f => f.priority === "Low").length, color: "#00F0FF", colorEnd: "#67E8F9", glow: "rgba(0,240,255,0.5)" },
                ];
                const priority = buildSlices(prioritySegments);

                const productSegments = allProducts.length > 0
                  ? allProducts.map((p, i) => {
                      const palette = [
                        { color: "#00B4FF", colorEnd: "#0066FF", glow: "rgba(0,180,255,0.5)" },
                        { color: "#BF00FF", colorEnd: "#7C4DFF", glow: "rgba(191,0,255,0.5)" },
                        { color: "#FF7A00", colorEnd: "#FFB347", glow: "rgba(255,122,0,0.5)" },
                        { color: "#00E5A0", colorEnd: "#14B8A6", glow: "rgba(0,229,160,0.5)" },
                      ];
                      const paint = palette[i % palette.length];
                      return { label: p, count: tabData.filter(f => f.product === p).length, ...paint };
                    })
                  : [{ label: "Unknown", count: 0, color: "#64748b", colorEnd: "#475569", glow: "rgba(100,116,139,0.3)" }];
                const product = buildSlices(productSegments);

                const titleStyle = {
                  padding: "14px 18px 0",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#94a3b8",
                  letterSpacing: 0.5,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                };

                const chartRowStyle = {
                  flex: 1,
                  padding: "12px 18px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 16,
                };

                return (
                  <>
                    <div style={{ ...styles.card, display: "flex", flexDirection: "column" }}>
                      <div style={titleStyle}>
                        <span>📋</span> Total {activeTab === "feedback" ? "Feedback" : "Suggestions"}
                      </div>
                      <div style={chartRowStyle}>
                        {renderDonut(priority.slices, priority.total, "pri", "Total", "priority")}
                        {renderLegend(priority.slices, priority.total, "Priority", "priority")}
                      </div>
                    </div>

                    <div style={{ ...styles.card, display: "flex", flexDirection: "column" }}>
                      <div style={titleStyle}>
                        <span>📦</span> Product Type
                      </div>
                      <div style={chartRowStyle}>
                        {renderDonut(product.slices, product.total, "prod", "Total", "product")}
                        {renderLegend(product.slices, product.total, "", "product")}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Top Feedback Areas — left column */}
            <div style={{ ...styles.card, display: "flex", flexDirection: "column", maxHeight: 600, order: 1 }}>
              <div style={styles.cardHeader}>
                <div style={styles.cardTitle}>
                  <span style={styles.cardTitleIcon}>🏆</span>
                  Top {activeTab === "feedback" ? "Feedback" : "Suggestion"} Category
                  <span style={{ fontSize: 11, color: "#475569", fontWeight: 400, marginLeft: 4 }}>{categoryRanking.length}</span>
                </div>
              </div>
              <div style={{ padding: "10px 16px 6px" }}>
                <input
                  type="text"
                  placeholder="Search categories..."
                  value={categorySearch}
                  onChange={e => setCategorySearch(e.target.value)}
                  style={{
                    width: "100%",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 8,
                    color: "#cbd5e1",
                    padding: "7px 12px",
                    fontSize: 12,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                  onFocus={e => e.target.style.borderColor = "rgba(99,102,241,0.4)"}
                  onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.06)"}
                />
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
                <style>{`
                  .fb-cat-row .fb-cat-actions { opacity: 0; transition: opacity 0.15s ease; }
                  .fb-cat-row:hover .fb-cat-actions { opacity: 1; }
                  .fb-cat-action-btn { background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.35); color: #818cf8; border-radius: 4px; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; transition: background 0.15s, border-color 0.15s; }
                  .fb-cat-action-btn:hover { background: rgba(99,102,241,0.35); border-color: rgba(99,102,241,0.6); color: #a5b4fc; }
                `}</style>
                {categoryRanking
                  .filter(item => item.category.toLowerCase().includes(categorySearch.toLowerCase()))
                  .map((item, i) => {
                    const originalIndex = categoryRanking.indexOf(item);
                    return (
                      <div
                        key={item.category}
                        className="fb-cat-row"
                        style={{
                          padding: "10px 18px",
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          borderBottom: "1px solid rgba(255,255,255,0.03)",
                          cursor: "pointer",
                          transition: "background 0.15s",
                        }}
                        onClick={() => openDrillDown({ type: "category", value: item.category, label: item.category, color: item.meta.color })}
                        onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                        onMouseOut={e => e.currentTarget.style.background = "transparent"}
                      >
                        <div style={{
                          width: 26, height: 26, borderRadius: 7,
                          background: originalIndex === 0 ? "rgba(234,179,8,0.15)" : originalIndex === 1 ? "rgba(148,163,184,0.12)" : originalIndex === 2 ? "rgba(180,120,60,0.12)" : "rgba(255,255,255,0.03)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, fontWeight: 700,
                          color: originalIndex === 0 ? "#eab308" : originalIndex === 1 ? "#94a3b8" : originalIndex === 2 ? "#b4783c" : "#475569",
                          flexShrink: 0,
                        }}>
                          {originalIndex + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "#cbd5e1", marginBottom: 5, display: "flex", alignItems: "center", gap: 6 }}>
                            <span>{item.meta.icon}</span>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.category}</span>
                          </div>
                          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                            <div style={styles.rankBar((item.count / maxCatCount) * 100, item.meta.color)} />
                          </div>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: item.meta.color, minWidth: 32, textAlign: "right" }}>
                          {item.count}
                        </div>
                        <span className="fb-cat-actions" style={{ display: "inline-flex", gap: 4, marginLeft: 8, flexShrink: 0 }}>
                          <button
                            type="button"
                            className="fb-cat-action-btn"
                            title="Drill in"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDrillDown({ type: "category", value: item.category, label: item.category, color: item.meta.color });
                            }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="11" cy="11" r="7" />
                              <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="fb-cat-action-btn"
                            title="Export CSV"
                            onClick={(e) => {
                              e.stopPropagation();
                              exportCategoryCSV(item.category);
                            }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                          </button>
                        </span>
                      </div>
                    );
                  })}
                {categoryRanking.filter(item => item.category.toLowerCase().includes(categorySearch.toLowerCase())).length === 0 && (
                  <div style={{ padding: "20px", textAlign: "center", fontSize: 12, color: "#475569" }}>No categories found</div>
                )}
              </div>
              <div style={{ padding: "10px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: "#475569", textAlign: "center" }}>Click a category to view its feedbacks</div>
              </div>
            </div>
          </div>
          {/* Common Feedback / Suggestion Areas */}
          {commonThemes.length > 0 && (
            <div style={{ ...styles.card, marginBottom: 24 }}>
              <div style={styles.cardHeader}>
                <div style={styles.cardTitle}>
                  <span style={styles.cardTitleIcon}>🔁</span>
                  {activeTab === "feedback" ? "Feedback Area" : "Suggestion Area"}
                  <span style={{ fontSize: 12, color: "#475569", fontWeight: 400, marginLeft: 8 }}>
                    {commonThemes.length} recurring {commonThemes.length === 1 ? "pattern" : "patterns"} detected
                  </span>
                </div>
              </div>
              <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 520 }}>
                <style>{`
                  .fb-theme-row .fb-theme-actions { opacity: 0; transition: opacity 0.15s ease; }
                  .fb-theme-row:hover .fb-theme-actions { opacity: 1; }
                `}</style>
                <table style={styles.table}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                    <tr>
                      <th style={{ ...styles.th, width: 40, background: "#0b0f14" }}>#</th>
                      <th style={{ ...styles.th, background: "#0b0f14" }}>{activeTab === "feedback" ? "Feedback Area" : "Suggestion Area"}</th>
                      <th style={{ ...styles.th, width: 90, textAlign: "center", background: "#0b0f14" }}>Count</th>
                      <th style={{ ...styles.th, background: "#0b0f14" }}>Category</th>
                      <th style={{ ...styles.th, width: 110, background: "#0b0f14" }}>Product</th>
                      <th style={{ ...styles.th, width: 110, background: "#0b0f14" }}>Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commonThemes.map((t, i) => {
                      const barColor = i === 0 ? "#FF2E97" : i === 1 ? "#D946EF" : i === 2 ? "#00F0FF" : "#8B5CF6";
                      const isExpanded = expandedTheme === t.theme;
                      const uniqueCategories = [...new Set(t.items.map(it => it.category))];
                      const themeCategory = uniqueCategories.length === 1 ? uniqueCategories[0] : "Mixed";
                      const uniqueProducts = [...new Set(t.items.map(it => it.product))];
                      const themeProduct = uniqueProducts.length === 1 ? uniqueProducts[0] : "Mixed";
                      const uniquePriorities = [...new Set(t.items.map(it => it.priority))];
                      const themePriority = uniquePriorities.length === 1 ? uniquePriorities[0] : "Mixed";

                      const productStyle = themeProduct === "CFD"
                        ? { bg: "rgba(56,189,248,0.15)", color: "#C084FC" }
                        : themeProduct === "Futures"
                        ? { bg: "rgba(168,85,247,0.15)", color: "#D946EF" }
                        : { bg: "rgba(148,163,184,0.12)", color: "#94a3b8" };

                      return (
                        <React.Fragment key={t.theme}>
                          <tr
                            className="fb-theme-row"
                            style={{ transition: "background 0.15s", cursor: "pointer", background: isExpanded ? "rgba(99,102,241,0.06)" : "transparent" }}
                            onClick={() => setExpandedTheme(isExpanded ? null : t.theme)}
                            onMouseOver={e => { if (!isExpanded) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                            onMouseOut={e => { if (!isExpanded) e.currentTarget.style.background = "transparent"; }}
                          >
                            <td style={{ ...styles.td, textAlign: "center", fontWeight: 700, fontSize: 14, color: "#94a3b8" }}>{i + 1}</td>
                            <td style={{ ...styles.td, fontWeight: 500, color: "#e2e8f0" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 10, color: "#64748b", transition: "transform 0.2s", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                                <span style={{ flex: 1 }}>{t.theme}</span>
                                <span className="fb-theme-actions" style={{ display: "inline-flex", gap: 4, flexShrink: 0 }}>
                                  <button
                                    type="button"
                                    className="fb-cat-action-btn"
                                    title="Drill in"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openDrillDown({ type: "theme", value: t.theme, label: t.theme, color: barColor, items: t.items });
                                    }}
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <circle cx="11" cy="11" r="7" />
                                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    className="fb-cat-action-btn"
                                    title="Export CSV"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      exportFeedbackCSV(t.items, t.theme);
                                    }}
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                      <polyline points="7 10 12 15 17 10" />
                                      <line x1="12" y1="15" x2="12" y2="3" />
                                    </svg>
                                  </button>
                                </span>
                                {isExpanded && (
                                  <AthenaTriggerBtn
                                    size={32}
                                    style={{ marginLeft: 6 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openAthenaForContext(t.theme, "feedbackArea", t.theme, barColor, t.items.length, t.items);
                                    }}
                                  />
                                )}
                              </div>
                            </td>
                            <td style={{ ...styles.td, textAlign: "center" }}>
                              <span style={{
                                display: "inline-block",
                                background: "rgba(226,232,240,0.08)",
                                color: "#e2e8f0",
                                fontWeight: 700,
                                fontSize: 14,
                                padding: "4px 14px",
                                borderRadius: 20,
                                minWidth: 32,
                              }}>
                                {t.count}
                              </span>
                            </td>
                            <td style={styles.td}>
                              {themeCategory === "Mixed" ? (
                                <span style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>Mixed</span>
                              ) : (
                                <span style={{ fontSize: 12, color: CATEGORIES_META[themeCategory]?.color || "#64748b" }}>
                                  {CATEGORIES_META[themeCategory]?.icon} {themeCategory}
                                </span>
                              )}
                            </td>
                            <td style={styles.td}>
                              <span style={{
                                display: "inline-block",
                                padding: "3px 10px",
                                borderRadius: 20,
                                fontSize: 11,
                                fontWeight: 600,
                                background: productStyle.bg,
                                color: productStyle.color,
                                whiteSpace: "nowrap",
                              }}>{themeProduct}</span>
                            </td>
                            <td style={styles.td}>
                              {themePriority === "Mixed" ? (
                                <span style={{
                                  display: "inline-block",
                                  padding: "3px 10px",
                                  borderRadius: 20,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  background: "rgba(148,163,184,0.12)",
                                  color: "#94a3b8",
                                }}>Mixed</span>
                              ) : (
                                <span style={styles.badge(PRIORITY_COLORS[themePriority].bg, PRIORITY_COLORS[themePriority].text)}>
                                  <span style={styles.dotPulse(PRIORITY_COLORS[themePriority].dot)}></span>
                                  {themePriority}
                                </span>
                              )}
                            </td>
                          </tr>
                          {isExpanded && t.items.map((item) => {
                            const childTdBase = {
                              padding: "10px 16px",
                              fontSize: 12,
                              color: "#94a3b8",
                              background: "rgba(0,0,0,0.2)",
                              verticalAlign: "middle",
                            };
                            const itemProdStyle = item.product === "CFD"
                              ? { bg: "rgba(56,189,248,0.15)", color: "#C084FC" }
                              : item.product === "Futures"
                              ? { bg: "rgba(168,85,247,0.15)", color: "#D946EF" }
                              : { bg: "rgba(148,163,184,0.12)", color: "#94a3b8" };
                            return (
                              <tr
                                key={item.id}
                                onClick={e => e.stopPropagation()}
                                onMouseOver={e => Array.from(e.currentTarget.children).forEach(td => td.style.background = "rgba(255,255,255,0.02)")}
                                onMouseOut={e => Array.from(e.currentTarget.children).forEach(td => td.style.background = "rgba(0,0,0,0.2)")}
                              >
                                <td style={{ ...childTdBase, padding: 0, position: "relative" }}>
                                  <div style={{ position: "absolute", left: 20, top: 0, bottom: 0, width: 2, background: barColor }} />
                                  <span style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace", whiteSpace: "nowrap", paddingLeft: 32 }}>
                                    {item.date}
                                  </span>
                                </td>
                                <td style={{ ...childTdBase, color: "#e2e8f0" }}>
                                  <span
                                    style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 500, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", minWidth: 0 }}
                                    onClick={() => setSelectedFeedback(item)}
                                    onMouseOver={e => e.target.style.color = "#22c55e"}
                                    onMouseOut={e => e.target.style.color = "#e2e8f0"}
                                  >
                                    {item.headline}
                                  </span>
                                </td>
                                <td style={{ ...childTdBase, textAlign: "center" }}>
                                  <span
                                    style={{ fontSize: 11, color: "#C084FC", fontWeight: 600, fontFamily: "monospace", cursor: "pointer", whiteSpace: "nowrap" }}
                                    onClick={() => setViewingChat(item)}
                                  >
                                    {item.chatId}
                                  </span>
                                </td>
                                <td style={childTdBase}></td>
                                <td style={childTdBase}>
                                  <span style={{
                                    display: "inline-block",
                                    padding: "3px 10px",
                                    borderRadius: 20,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: itemProdStyle.bg,
                                    color: itemProdStyle.color,
                                    whiteSpace: "nowrap",
                                  }}>{item.product || "—"}</span>
                                </td>
                                <td style={childTdBase}>
                                  <select
                                    value={item.priority}
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => {
                                      const newPriority = e.target.value;
                                      setFeedbackData(prev => prev.map(fb =>
                                        fb.id === item.id ? { ...fb, priority: newPriority, manualPriority: true } : fb
                                      ));
                                    }}
                                    style={{
                                      background: PRIORITY_COLORS[item.priority].bg,
                                      color: PRIORITY_COLORS[item.priority].text,
                                      border: `1px solid ${PRIORITY_COLORS[item.priority].text}33`,
                                      borderRadius: 20,
                                      padding: "3px 10px",
                                      fontSize: 11,
                                      fontWeight: 600,
                                      cursor: "pointer",
                                      outline: "none",
                                      appearance: "none",
                                      WebkitAppearance: "none",
                                      MozAppearance: "none",
                                      paddingRight: 20,
                                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2364748b' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
                                      backgroundRepeat: "no-repeat",
                                      backgroundPosition: "right 6px center",
                                    }}
                                  >
                                    <option value="High">High</option>
                                    <option value="Medium">Medium</option>
                                    <option value="Low">Low</option>
                                  </select>
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}


          {/* Manually Added Feedback Table */}
          <div style={{ ...styles.card, marginBottom: 24 }}>
            <div style={styles.cardHeader}>
              <div style={styles.cardTitle}>
                <span style={styles.cardTitleIcon}>✏️</span>
                {activeTab === "feedback" ? "Manually Added Feedback" : "Manually Added Suggestions"}
                <span style={{ fontSize: 12, color: "#475569", fontWeight: 400, marginLeft: 8 }}>
                  {feedbackData.filter(fb => fb.chatId === "MANUAL" && fb.type === activeTab).length} entries
                </span>
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                  background: "linear-gradient(135deg, #8B5CF6, #8b5cf6)",
                  color: "#fff", fontSize: 12, fontWeight: 600,
                }}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
                {activeTab === "feedback" ? "New Feedback" : "New Suggestion"}
              </button>
            </div>
            {(() => {
              const manualEntries = feedbackData.filter(fb => fb.chatId === "MANUAL" && fb.type === activeTab);
              if (manualEntries.length === 0) {
                return (
                  <div style={{ padding: "32px 22px", textAlign: "center", color: "#475569", fontSize: 13 }}>
                    No manually added {activeTab === "feedback" ? "feedback" : "suggestions"} yet. Click "+ New {activeTab === "feedback" ? "Feedback" : "Suggestion"}" to add one.
                  </div>
                );
              }
              return (
                <div style={{ overflowX: "auto" }}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={{ ...styles.th, width: 40, background: "#0b0f14" }}>#</th>
                        <th style={{ ...styles.th, background: "#0b0f14" }}>Headline</th>
                        <th style={{ ...styles.th, background: "#0b0f14" }}>Full Text</th>
                        <th style={{ ...styles.th, width: 120, background: "#0b0f14" }}>Category</th>
                        <th style={{ ...styles.th, width: 100, background: "#0b0f14" }}>Product</th>
                        <th style={{ ...styles.th, width: 100, background: "#0b0f14" }}>Priority</th>
                        <th style={{ ...styles.th, width: 100, background: "#0b0f14" }}>Date</th>
                        <th style={{ ...styles.th, width: 56, background: "#0b0f14" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {manualEntries.map((fb, i) => {
                        const pc = PRIORITY_COLORS[fb.priority] || PRIORITY_COLORS["Medium"];
                        return (
                          <tr key={fb.id}
                            style={{ background: "transparent" }}
                            onMouseOver={e => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                            onMouseOut={e => { e.currentTarget.style.background = "transparent"; }}
                          >
                            <td style={{ ...styles.td, textAlign: "center", color: "#475569", fontWeight: 600 }}>{i + 1}</td>
                            <td style={{ ...styles.td, fontWeight: 500, color: "#e2e8f0", maxWidth: 200 }}>{fb.headline}</td>
                            <td style={{ ...styles.td, color: "#94a3b8", maxWidth: 300, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{fb.fullText}</td>
                            <td style={styles.td}><span style={{ fontSize: 11, color: "#94a3b8" }}>{fb.category}</span></td>
                            <td style={styles.td}>
                              <span style={{
                                fontSize: 11, fontWeight: 600, borderRadius: 6, padding: "3px 8px",
                                background: fb.product === "CFD" ? "rgba(56,189,248,0.15)" : fb.product === "Futures" ? "rgba(168,85,247,0.15)" : "rgba(148,163,184,0.12)",
                                color: fb.product === "CFD" ? "#C084FC" : fb.product === "Futures" ? "#D946EF" : "#94a3b8",
                              }}>{fb.product}</span>
                            </td>
                            <td style={styles.td}>
                              <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 6, padding: "3px 8px", background: pc.bg, color: pc.text }}>{fb.priority}</span>
                            </td>
                            <td style={{ ...styles.td, color: "#475569", fontSize: 11 }}>{fb.date}</td>
                            <td style={styles.td}>
                              <button
                                title="Delete"
                                onClick={() => setFeedbackData(prev => prev.filter(x => x.id !== fb.id))}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", padding: 4, borderRadius: 4 }}
                                onMouseOver={e => { e.currentTarget.style.color = "#FF2E97"; }}
                                onMouseOut={e => { e.currentTarget.style.color = "#475569"; }}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>

          {/* Feedback / Suggestions Table (ungrouped) */}
          <div style={{ marginBottom: 24 }}>
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardTitle}>
                  <span style={styles.cardTitleIcon}>📋</span>
                  {activeTab === "feedback" ? "Ungrouped Feedback" : "Ungrouped Suggestions"}
                  <span style={{ fontSize: 12, color: "#475569", fontWeight: 400, marginLeft: 8 }}>{filtered.length} results</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <AthenaTriggerBtn
                    onClick={() => openAthenaForContext(
                      `All ${activeTab === "feedback" ? "Feedback" : "Suggestions"}`,
                      "allUngrouped",
                      activeTab,
                      "#00B4FF",
                      filtered.length,
                      filtered
                    )}
                  />
                  <button
                    onClick={() => {
                      const headers = ["ID", "Date", "Chat ID", "Headline", "Full Text", "Category", "Product", "Sentiment", "Feedback Sentiment", "Priority", "Status", "Type", "Common Topic"];
                      const escapeCSV = (val) => {
                        const s = String(val ?? "");
                        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
                      };
                      const rows = filtered.map(fb => [fb.id, fb.date, fb.chatId, fb.headline, fb.fullText, fb.category, fb.product, fb.sentiment, fb.feedbackSentiment || "", fb.priority, fb.status, fb.type, fb.common_topic || ""].map(escapeCSV).join(","));
                      const csv = [headers.join(","), ...rows].join("\n");
                      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${activeTab}-data.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 8,
                      color: "#94a3b8",
                      padding: "6px 14px",
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      transition: "background 0.15s, color 0.15s",
                    }}
                    onMouseOver={e => { e.currentTarget.style.background = "rgba(34,197,94,0.15)"; e.currentTarget.style.color = "#22c55e"; }}
                    onMouseOut={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "#94a3b8"; }}
                  >
                    <span style={{ fontSize: 14 }}>⬇</span> Download CSV
                  </button>
                </div>
              </div>
              <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
                <table style={{ ...styles.table }}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                    <tr>
                      <th style={{ ...styles.th, cursor: "pointer", background: "#0b0f14" }} onClick={() => handleSort("date")}>Date <SortArrow field="date" /></th>
                      <th style={{ ...styles.th, background: "#0b0f14" }}>Feedback Headline</th>
                      <th style={{ ...styles.th, background: "#0b0f14" }}>Chat ID</th>
                      <th style={{ ...styles.th, background: "#0b0f14" }}>Category</th>
                      <th style={{ ...styles.th, background: "#0b0f14" }}>Sentiment</th>
                      <th style={{ ...styles.th, background: "#0b0f14" }}>Product</th>
                      <th style={{ ...styles.th, cursor: "pointer", background: "#0b0f14" }} onClick={() => handleSort("priority")}>Priority <SortArrow field="priority" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.length === 0 ? (
                      <tr><td colSpan={7} style={styles.emptyState}>No feedback found matching your filters.</td></tr>
                    ) : paginated.map((fb, i) => (
                      <tr
                        key={fb.id}
                        style={{ ...styles.trHover, background: hoveredRow === i ? "rgba(255,255,255,0.02)" : "transparent" }}
                        onMouseEnter={() => setHoveredRow(i)}
                        onMouseLeave={() => setHoveredRow(null)}
                      >
                        <td style={{ ...styles.td, whiteSpace: "nowrap", fontSize: 12, color: "#64748b" }}>{fb.date}</td>
                        <td style={styles.td}>
                          <span style={styles.headline} onClick={() => setSelectedFeedback(fb)} onMouseOver={e => e.target.style.color = "#22c55e"} onMouseOut={e => e.target.style.color = "#e2e8f0"}>
                            {fb.headline}
                          </span>
                        </td>
                        <td style={styles.td}>
                          {fb.chatId === "MANUAL" ? (
                            <span style={styles.badge("rgba(148,163,184,0.12)", "#64748b")}>Manual</span>
                          ) : (
                            <span style={styles.chatLink} onClick={() => setViewingChat(fb)} onMouseOver={e => e.target.style.color = "#7dd3fc"} onMouseOut={e => e.target.style.color = "#C084FC"}>
                              {fb.chatId}
                            </span>
                          )}
                        </td>
                        <td style={styles.td}>
                          <span style={{ fontSize: 12, color: CATEGORIES_META[fb.category]?.color || "#64748b" }}>
                            {CATEGORIES_META[fb.category]?.icon} {fb.category}
                          </span>
                        </td>
                        <td style={styles.td}>
                          {(() => {
                            const s = fb.feedbackSentiment;
                            if (!s) return <span style={{ color: "#475569", fontSize: 11 }}>—</span>;
                            const palette = s === "Positive" ? { bg: "rgba(34,197,94,0.15)", fg: "#22c55e" }
                                          : s === "Negative" ? { bg: "rgba(239,68,68,0.15)", fg: "#ef4444" }
                                          : { bg: "rgba(148,163,184,0.12)", fg: "#94a3b8" };
                            return <span style={styles.badge(palette.bg, palette.fg)}>{s}</span>;
                          })()}
                        </td>
                        <td style={styles.td}>
                          {fb.product ? (
                            <span style={{
                              display: "inline-block",
                              padding: "3px 10px",
                              borderRadius: 20,
                              fontSize: 11,
                              fontWeight: 600,
                              background: fb.product === "CFD" ? "rgba(56,189,248,0.15)" : "rgba(168,85,247,0.15)",
                              color: fb.product === "CFD" ? "#C084FC" : "#D946EF",
                              whiteSpace: "nowrap",
                            }}>
                              {fb.product}
                            </span>
                          ) : (
                            <span style={{ color: "#334155" }}>—</span>
                          )}
                        </td>
                        <td style={styles.td}>
                          <select
                            value={fb.priority}
                            onClick={e => e.stopPropagation()}
                            onChange={e => {
                              const newPriority = e.target.value;
                              setFeedbackData(prev => prev.map(item =>
                                item.id === fb.id ? { ...item, priority: newPriority, manualPriority: true } : item
                              ));
                            }}
                            style={{
                              background: PRIORITY_COLORS[fb.priority].bg,
                              color: PRIORITY_COLORS[fb.priority].text,
                              border: `1px solid ${PRIORITY_COLORS[fb.priority].text}33`,
                              borderRadius: 20,
                              padding: "3px 10px",
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: "pointer",
                              outline: "none",
                              appearance: "none",
                              WebkitAppearance: "none",
                              MozAppearance: "none",
                              paddingRight: 20,
                              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2364748b' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
                              backgroundRepeat: "no-repeat",
                              backgroundPosition: "right 6px center",
                            }}
                          >
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div style={styles.pagination}>
                  <span style={{ fontSize: 12, color: "#475569" }}>
                    Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length}
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={styles.pageBtn(false)} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>← Prev</button>
                    {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => (
                      <button key={i} style={styles.pageBtn(currentPage === i + 1)} onClick={() => setCurrentPage(i + 1)}>{i + 1}</button>
                    ))}
                    <button style={styles.pageBtn(false)} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next →</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>)}

        </>)}
      </div>

      {/* ═══ Modal: Feedback Detail ════════════════════════════════════ */}
      {selectedFeedback && (
        <div style={{ ...styles.modal, zIndex: 1100 }}>
          <div style={styles.modalOverlay} onClick={() => setSelectedFeedback(null)} />
          <div style={styles.modalContent}>
            <button style={styles.closeBtn} onClick={() => setSelectedFeedback(null)}>✕</button>
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
                <select
                  value={selectedFeedback.priority}
                  onChange={e => {
                    const newPriority = e.target.value;
                    setFeedbackData(prev => prev.map(item =>
                      item.id === selectedFeedback.id ? { ...item, priority: newPriority, manualPriority: true } : item
                    ));
                    setSelectedFeedback(prev => ({ ...prev, priority: newPriority, manualPriority: true }));
                  }}
                  style={{
                    background: PRIORITY_COLORS[selectedFeedback.priority].bg,
                    color: PRIORITY_COLORS[selectedFeedback.priority].text,
                    border: `1px solid ${PRIORITY_COLORS[selectedFeedback.priority].text}33`,
                    borderRadius: 20,
                    padding: "3px 10px",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  <option value="High">High Priority</option>
                  <option value="Medium">Medium Priority</option>
                  <option value="Low">Low Priority</option>
                </select>
                {selectedFeedback.manualPriority && (
                  <span style={{ fontSize: 10, color: "#64748b", fontStyle: "italic" }}>✋ Manually set</span>
                )}
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: "#f1f5f9", margin: "0 0 6px", lineHeight: 1.4 }}>{selectedFeedback.headline}</h2>
              <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#64748b", flexWrap: "wrap" }}>
                <span>📅 {selectedFeedback.date}</span>
                <span style={{ color: CATEGORIES_META[selectedFeedback.category]?.color }}>
                  {CATEGORIES_META[selectedFeedback.category]?.icon} {selectedFeedback.category}
                </span>
                {selectedFeedback.chatId !== "MANUAL" && (
                  <span style={{ ...styles.chatLink }} onClick={() => { setSelectedFeedback(null); setViewingChat(selectedFeedback); }}>
                    🔗 {selectedFeedback.chatId}
                  </span>
                )}
              </div>
            </div>
            <div style={{
              background: "rgba(255,255,255,0.03)",
              borderRadius: 10,
              padding: "16px 18px",
              fontSize: 14,
              lineHeight: 1.7,
              color: "#cbd5e1",
            }}>
              {selectedFeedback.fullText}
            </div>
          </div>
        </div>
      )}

      {/* Shared chat-bubble viewer (same as CSAT page) */}
      <ConversationViewer
        conversationId={viewingChat?.chatId}
        onClose={() => setViewingChat(null)}
      />

      {/* ═══ Drill-Down Modal ═══════════════════════════════════════ */}
      {drillDown && (() => {
        // Pagination removed — render the full drill-down list inside the scroll container.
        const drillPaginated = drillDownData;
        const isCategory = drillDown.type === "category";
        const headers = isCategory
          ? ["Chat ID", "Date", "Headline", "Priority", "Product", "Status"]
          : ["Chat ID", "Date", "Headline", "Category", drillDown.type === "priority" ? "Product" : "Priority", "Status"];
        // Export carries the full untruncated content as a "Detailed Content"
        // column appended after Headline — UI keeps the truncated version.
        const exportHeaders = isCategory
          ? ["Chat ID", "Date", "Headline", "Detailed Content", "Priority", "Product", "Status"]
          : ["Chat ID", "Date", "Headline", "Detailed Content", "Category", drillDown.type === "priority" ? "Product" : "Priority", "Status"];

        const exportDrillCSV = () => {
          const escapeCSV = (val) => { const s = String(val ?? ""); return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s; };
          const rows = drillDownData.map(fb => (isCategory
            ? [fb.chatId, fb.date, fb.headline, fb.fullText, fb.priority, fb.product, fb.status]
            : [fb.chatId, fb.date, fb.headline, fb.fullText, fb.category, drillDown.type === "priority" ? fb.product : fb.priority, fb.status]
          ).map(escapeCSV).join(","));
          const csv = [exportHeaders.join(","), ...rows].join("\n");
          const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a"); a.href = url;
          a.download = `${drillDown.label}-${drillDown.type}-drilldown.csv`;
          a.click(); URL.revokeObjectURL(url);
        };

        const pgBtnStyle = (active) => ({
          background: active ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)",
          border: active ? "1px solid rgba(99,102,241,0.4)" : "1px solid rgba(255,255,255,0.08)",
          color: active ? "#818cf8" : "#64748b",
          borderRadius: 6, width: 32, height: 32, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 600,
        });

        return (
          <div style={styles.modal}>
            <div style={styles.modalOverlay} onClick={closeDrillDown} />
            <div style={{
              position: "relative", background: "#111827",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16,
              maxWidth: 1100, width: "94%", maxHeight: "88vh",
              display: "flex", flexDirection: "column", zIndex: 1,
            }}>
              <div style={{ padding: "24px 28px 18px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: drillDown.color, boxShadow: `0 0 10px ${drillDown.color}66` }} />
                    {drillDown.label}{drillDown.type === "priority" ? " Priority" : ""} — {activeTab === "feedback" ? "Feedbacks" : "Suggestions"}
                  </div>
                  <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{drillDownData.length} records</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <AthenaTriggerBtn
                    onClick={() => openAthenaForContext(drillDown.label, drillDown.type, drillDown.value, drillDown.color, drillDownData.length, drillDownData)}
                  />
                  <button
                    onClick={exportDrillCSV}
                    style={{
                      background: "transparent", border: "1px solid rgba(52,211,153,0.4)",
                      borderRadius: 8, color: "#34d399", padding: "7px 16px",
                      fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}
                  >Export CSV</button>
                  <button
                    onClick={closeDrillDown}
                    style={{
                      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
                      color: "#94a3b8", width: 34, height: 34, borderRadius: 8,
                      cursor: "pointer", fontSize: 16,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >✕</button>
                </div>
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: "0 28px", minHeight: 0 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, background: "#111827", zIndex: 1 }}>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      {headers.map(h => (
                        <th key={h} style={{
                          padding: "12px 14px", textAlign: "left", color: "#64748b",
                          fontWeight: 700, fontSize: 11, textTransform: "uppercase",
                          letterSpacing: 0.8, whiteSpace: "nowrap", background: "#111827",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {drillPaginated.map(fb => (
                      <tr key={fb.id}
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "background 0.15s" }}
                        onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                        onMouseOut={e => e.currentTarget.style.background = "transparent"}
                      >
                        <td style={{ padding: "14px 14px", fontSize: 13, whiteSpace: "nowrap" }}>
                          <span
                            style={{ color: "#C084FC", fontWeight: 600, fontFamily: "monospace", cursor: "pointer" }}
                            onClick={() => setViewingChat(fb)}
                          >{fb.chatId}</span>
                        </td>
                        <td style={{ padding: "14px 14px", color: "#94a3b8", fontSize: 13, whiteSpace: "nowrap" }}>{fb.date}</td>
                        <td style={{ padding: "14px 14px", fontSize: 13, maxWidth: 420 }}>
                          <span
                            style={{
                              color: "#cbd5e1",
                              cursor: "pointer",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                              whiteSpace: "normal",
                              lineHeight: 1.45,
                            }}
                            onClick={() => setSelectedFeedback(fb)}
                          >{fb.headline}</span>
                        </td>
                        {isCategory ? (
                          <>
                            <td style={{ padding: "14px 14px", fontSize: 13 }}>
                              <span style={{ color: PRIORITY_COLORS[fb.priority]?.text || "#94a3b8" }}>{fb.priority}</span>
                            </td>
                            <td style={{ padding: "14px 14px", color: "#94a3b8", fontSize: 13 }}>{fb.product}</td>
                          </>
                        ) : (
                          <>
                            <td style={{ padding: "14px 14px", color: "#94a3b8", fontSize: 13, whiteSpace: "nowrap" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                <span>{CATEGORIES_META[fb.category]?.icon || "📋"}</span>
                                {fb.category}
                              </span>
                            </td>
                            <td style={{ padding: "14px 14px", fontSize: 13 }}>
                              {drillDown.type === "priority" ? (
                                <span style={{ color: "#94a3b8" }}>{fb.product}</span>
                              ) : (
                                <span style={{ color: PRIORITY_COLORS[fb.priority]?.text || "#94a3b8" }}>{fb.priority}</span>
                              )}
                            </td>
                          </>
                        )}
                        <td style={{ padding: "14px 14px", color: "#94a3b8", fontSize: 13 }}>{fb.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          </div>
        );
      })()}

      {/* ═══ Add Manual Feedback Modal (stub) ═══════════════════════════ */}
      {showAddModal && (
        <div style={{ ...styles.modal, zIndex: 1100 }}>
          <div style={styles.modalOverlay} onClick={() => setShowAddModal(false)} />
          <div style={{
            position: "relative", background: "#111827",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16,
            maxWidth: 540, width: "92%", padding: "28px 30px",
            zIndex: 1,
          }}>
            <button style={styles.closeBtn} onClick={() => setShowAddModal(false)}>✕</button>
            <div style={{ marginBottom: 22 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.25))",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#a5b4fc",
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
                <span style={{ fontSize: 17, fontWeight: 700, color: "#f1f5f9" }}>
                  New {activeTab === "feedback" ? "Feedback" : "Suggestion"}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginLeft: 42 }}>
                AI will auto-generate the headline and category from your text. Local-only until Supabase insert is wired.
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                {activeTab === "feedback" ? "Feedback" : "Suggestion"} <span style={{ color: "#f87171" }}>*</span>
              </label>
              <textarea
                value={newText}
                onChange={e => setNewText(e.target.value)}
                placeholder={`Describe the ${activeTab === "feedback" ? "feedback" : "suggestion"} in detail...`}
                rows={5}
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 10,
                  color: "#e2e8f0",
                  padding: "12px 14px",
                  fontSize: 13,
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
                  lineHeight: 1.5,
                  boxSizing: "border-box",
                }}
              />
              <div style={{ fontSize: 11, color: "#475569", marginTop: 6, textAlign: "right" }}>
                {newText.length} characters
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Product Type</label>
                <select
                  value={newProduct}
                  onChange={e => setNewProduct(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#111827",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 10,
                    color: "#e2e8f0",
                    padding: "10px 14px",
                    fontSize: 13,
                    outline: "none",
                    cursor: "pointer",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="CFD">CFD</option>
                  <option value="Futures">Futures</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Priority</label>
                <select
                  value={newPriority}
                  onChange={e => setNewPriority(e.target.value)}
                  style={{
                    width: "100%",
                    background: PRIORITY_COLORS[newPriority].bg,
                    border: `1px solid ${PRIORITY_COLORS[newPriority].text}33`,
                    borderRadius: 10,
                    color: PRIORITY_COLORS[newPriority].text,
                    padding: "10px 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    outline: "none",
                    cursor: "pointer",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={() => setShowAddModal(false)}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#94a3b8",
                  borderRadius: 8,
                  padding: "10px 22px",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >Cancel</button>
              <button
                onClick={submitManualEntry}
                disabled={newText.trim().length < 10}
                style={{
                  background: newText.trim().length < 10 ? "rgba(99,102,241,0.3)" : "linear-gradient(135deg, #8B5CF6, #8b5cf6)",
                  border: "none",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "10px 26px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: newText.trim().length < 10 ? "not-allowed" : "pointer",
                  boxShadow: newText.trim().length < 10 ? "none" : "0 4px 14px rgba(99,102,241,0.35)",
                  opacity: newText.trim().length < 10 ? 0.6 : 1,
                }}
              >Submit</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Athena Panel (shared) ════════════════════════════════ */}
      <AthenaPanel {...athena} pageLabel={activeTab === "feedback" ? "feedbacks" : "suggestions"} />
      {/* ═══ Toast ═════════════════════════════════════════════════ */}
      {toast && (
        <div style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 2000,
          background: toast.type === "error" ? "rgba(239,68,68,0.95)" : "rgba(30,41,59,0.98)",
          border: `1px solid ${toast.type === "error" ? "rgba(239,68,68,0.5)" : "rgba(34,197,94,0.3)"}`,
          borderLeft: `3px solid ${toast.type === "error" ? "#ef4444" : "#22c55e"}`,
          borderRadius: 10,
          padding: "12px 18px",
          color: "#f1f5f9",
          fontSize: 13,
          fontWeight: 500,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          maxWidth: 380,
          animation: "slideIn 0.25s ease-out",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 15 }}>{toast.type === "error" ? "⚠️" : "✓"}</span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
