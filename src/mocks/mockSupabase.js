/**
 * Mock Supabase client for the Business Analytics demo build.
 *
 * This module is aliased in place of `@supabase/supabase-js` (see vite.config.js),
 * so EVERY `createClient(...)` call in the app — the shared client and any inline
 * ones — receives this mock instead. No network, no env vars, no real backend.
 *
 * It implements:
 *   - a fake authenticated admin session (so the login gate is bypassed and every
 *     role-gated tab unlocks),
 *   - a chainable query-builder that HONORS filter predicates (.eq/.in/.gte/.not/…)
 *     against generated mock rows, so the app's own client-side aggregations produce
 *     sensible, self-consistent numbers, and
 *   - a `.rpc()` shim for the handful of RPCs the app calls.
 *
 * Mock data is deterministic (seeded PRNG) so charts look the same on every reload.
 */

// ─── Deterministic PRNG ──────────────────────────────────────────────────────
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ─── Reference data ──────────────────────────────────────────────────────────
const COUNTRIES = [
  ['India', 'Asia'], ['Pakistan', 'Asia'], ['United Arab Emirates', 'Asia'],
  ['Saudi Arabia', 'Asia'], ['Vietnam', 'Asia'], ['Turkey', 'Asia'],
  ['United States', 'North America'], ['Canada', 'North America'],
  ['United Kingdom', 'Europe'], ['Germany', 'Europe'], ['France', 'Europe'],
  ['Spain', 'Europe'], ['Nigeria', 'Africa'], ['Egypt', 'Africa'],
  ['South Africa', 'Africa'], ['Kenya', 'Africa'], ['Australia', 'Oceania'],
  ['Argentina', 'South America'], ['Colombia', 'South America'],
];
const PRODUCTS = ['CFD', 'Futures'];
const CHAT_CHANNELS = ['Chat', 'Instagram', 'Facebook'];
const SENTIMENTS = ['Positive', 'Neutral', 'Negative'];
const TEAMS = [
  'Business Operations', 'Case Resolution', 'Platform Operations',
  'Pro Solutions Task Force', 'Tech Team', 'Payments and Treasury',
];
const MAIN_TOPICS = [
  'KYC_Issue', 'Account Related Issue', 'Dashboard Related Issue', 'Breach Issue',
  'Login_Issue', 'Password issue', 'Platform Issue', 'Trade Issue', 'Slippage',
  'SWAP', 'Commission', 'Payout related issue', 'Certificate Issue',
  'Competition Issue', 'Restriction Related Issue', 'Tech Issue',
  'Other Payment Issues', 'Crypto Payment Isssue', 'Card Payment issue',
  'Refund Related Issue', 'Coupon Code related issue', 'Offer Related Query',
  'Random Issues',
];
const SUB_TOPICS = [
  'Verification delay', 'Document rejected', 'Cannot log in', 'OTP not received',
  'Chart not loading', 'Order stuck', 'High spread', 'Withdrawal pending',
  'KYC re-submission', 'Balance mismatch', 'Platform frozen', 'Slippage on entry',
  'Commission query', 'Certificate not issued', 'Coupon invalid', 'Refund delay',
];
const CSAT_CATEGORIES = [
  'Platform Issue', 'Payout related issue', 'KYC_Issue', 'Trade Issue',
  'Login_Issue', 'Slippage', 'Certificate Issue', 'Restriction Related Issue',
];
const CSAT_SUBCATS = [
  'Slow response', 'Not resolved', 'Wrong information', 'Long wait time',
  'Repeated follow-up', 'Technical glitch', 'Policy dissatisfaction',
];
const AGENTS = [
  ['Arif Hossain', 'arif', 'Case Resolution', 'lead'],
  ['Nadia Rahman', 'nadia', 'Case Resolution', 'agent'],
  ['Tanvir Ahmed', 'tanvir', 'Platform Operations', 'agent'],
  ['Sadia Islam', 'sadia', 'Platform Operations', 'lead'],
  ['Rakib Chowdhury', 'rakib', 'Business Operations', 'agent'],
  ['Mitu Akter', 'mitu', 'Business Operations', 'agent'],
  ['Farhan Kabir', 'farhan', 'Pro Solutions Task Force', 'lead'],
  ['Sabbir Alam', 'sabbir', 'Pro Solutions Task Force', 'agent'],
  ['Nusrat Jahan', 'nusrat', 'Payments and Treasury', 'agent'],
  ['Imran Sheikh', 'imran', 'Payments and Treasury', 'lead'],
  ['Rima Das', 'rima', 'Tech Team', 'agent'],
  ['Shuvo Barua', 'shuvo', 'Tech Team', 'agent'],
  ['Ayesha Siddiqua', 'ayesha', 'Case Resolution', 'agent'],
  ['Zahid Hasan', 'zahid', 'Platform Operations', 'agent'],
];

// ─── Date helpers ────────────────────────────────────────────────────────────
const DAY = 86400000;
function dateNDaysAgo(n) {
  return new Date(Date.now() - n * DAY);
}
function ymd(d) {
  return d.toISOString().slice(0, 10);
}
function isoDhaka(d) {
  // "YYYY-MM-DDTHH:mm:ss+06:00" — lexically comparable with the app's range bounds
  const base = new Date(d.getTime());
  const s = base.toISOString().slice(0, 19);
  return `${s}+06:00`;
}

// ─── Row generators (memoized so pagination + counts stay stable) ────────────
const _cache = {};
function memo(key, fn) {
  if (!_cache[key]) _cache[key] = fn();
  return _cache[key];
}

function genIntercom() {
  return memo('intercom', () => {
    const rng = makeRng(1001);
    const rows = [];
    const N = 1600;
    for (let i = 0; i < N; i++) {
      const [country, region] = COUNTRIES[Math.floor(rng() * COUNTRIES.length)];
      const daysAgo = Math.floor(rng() * 120);
      const sEnd = SENTIMENTS[Math.floor(rng() * SENTIMENTS.length)];
      const mains = [MAIN_TOPICS[Math.floor(rng() * MAIN_TOPICS.length)]];
      if (rng() > 0.7) mains.push(MAIN_TOPICS[Math.floor(rng() * MAIN_TOPICS.length)]);
      const subs = [SUB_TOPICS[Math.floor(rng() * SUB_TOPICS.length)]];
      if (rng() > 0.6) subs.push(SUB_TOPICS[Math.floor(rng() * SUB_TOPICS.length)]);
      rows.push({
        created_date_bd: ymd(dateNDaysAgo(daysAgo)),
        'Conversation ID': 100000 + i,
        Country: country,
        Region: region,
        Product: PRODUCTS[Math.floor(rng() * PRODUCTS.length)],
        assigned_channel_name: CHAT_CHANNELS[Math.floor(rng() * CHAT_CHANNELS.length)],
        'CX Score Rating': 1 + Math.floor(rng() * 5),
        'Main-Topics': mains,
        'Sub-Topics': subs,
        'Sentiment Start': SENTIMENTS[Math.floor(rng() * SENTIMENTS.length)],
        'Sentiment End': sEnd,
        "Was it in client's favor?": rng() > 0.5 ? 'Yes' : 'No',
        Transcript:
          `Customer: I need help with my ${mains[0].replace(/_/g, ' ').toLowerCase()}.\n` +
          `Agent: Sure, I can help you with that. Let me check your account.\n` +
          `Customer: Thank you.\n` +
          `Agent: This has been resolved for you now.`,
      });
    }
    return rows;
  });
}

function genCSAT() {
  return memo('csat', () => {
    const rng = makeRng(2002);
    const rows = [];
    const N = 1300;
    for (let i = 0; i < N; i++) {
      const [country] = COUNTRIES[Math.floor(rng() * COUNTRIES.length)];
      const daysAgo = Math.floor(rng() * 120);
      // Weight toward high ratings (realistic CSAT skew)
      const r = rng();
      const rating = r < 0.62 ? 5 : r < 0.78 ? 4 : r < 0.88 ? 3 : r < 0.95 ? 2 : 1;
      const isLow = rating <= 3;
      const hasProdConcern = isLow && rng() > 0.45;
      const agent = AGENTS[Math.floor(rng() * AGENTS.length)];
      rows.push({
        'Conversation ID': 200000 + i,
        Date: ymd(dateNDaysAgo(daysAgo)),
        'Created at': isoDhaka(dateNDaysAgo(daysAgo)),
        'Conversation rating': rating,
        'Conversation rating remark': isLow ? 'Issue was not fully resolved.' : 'Great support!',
        'Agent Name': agent[0],
        'Agent Intercom Name': agent[1],
        'Agent Fault': isLow ? (rng() > 0.5 ? 'Yes' : 'No') : null,
        Notes: null,
        Country: country,
        'Product Type': PRODUCTS[Math.floor(rng() * PRODUCTS.length)],
        'Concern regarding product (Catagory)': hasProdConcern
          ? CSAT_CATEGORIES[Math.floor(rng() * CSAT_CATEGORIES.length)]
          : null,
        'Concern regarding product (Sub-catagory)': hasProdConcern
          ? CSAT_SUBCATS[Math.floor(rng() * CSAT_SUBCATS.length)]
          : null,
      });
    }
    return rows;
  });
}

function makeSpoRows(key, seed, count, channels, opts = {}) {
  return memo(key, () => {
    const rng = makeRng(seed);
    const rows = [];
    for (let i = 0; i < count; i++) {
      const [country, region] = COUNTRIES[Math.floor(rng() * COUNTRIES.length)];
      const daysAgo = Math.floor(rng() * 90);
      const agent = AGENTS[Math.floor(rng() * AGENTS.length)];
      const isFin = opts.fin === true;
      const frt = 5 + Math.floor(rng() * 90);
      const art = 20 + Math.floor(rng() * 180);
      const aht = 120 + Math.floor(rng() * 900);
      rows.push({
        conversation_id: `${opts.prefix || 'C'}${300000 + i}`,
        created_at: isoDhaka(dateNDaysAgo(daysAgo)),
        channel: channels[Math.floor(rng() * channels.length)],
        country,
        region,
        assignee_id: isFin ? 'FIN' : `A${(i % AGENTS.length) + 1}`,
        assignee_name: isFin ? 'FIN Bot' : agent[1],
        frt_seconds: isFin ? null : frt,
        art_seconds: isFin ? null : art,
        aht_seconds: isFin ? null : aht,
        'Avg Wait Time': 5 + Math.floor(rng() * 40),
        'FRT Hit Rate': rng() < 0.7 ? 0 : 1, // 0 == hit target (per app logic)
        'ART Hit Rate': Math.floor(rng() * 40), // app does 100 - avg
        'CX score': 1 + Math.floor(rng() * 5),
        is_reopened: rng() < 0.15,
        sentiment: SENTIMENTS[Math.floor(rng() * SENTIMENTS.length)],
      });
    }
    return rows;
  });
}
const genMainSpo = () => makeSpoRows('spo_main', 3003, 2000, CHAT_CHANNELS, { prefix: 'C' });
const genEmailSpo = () => makeSpoRows('spo_email', 4004, 550, ['Email'], { prefix: 'E' });
const genFinSpo = () => makeSpoRows('spo_fin', 5005, 300, CHAT_CHANNELS, { prefix: 'F', fin: true });
const genTransferSpo = () => makeSpoRows('spo_transfer', 6006, 150, ['Chat'], { prefix: 'T' });

function teamLeadName(team) {
  const lead = AGENTS.find((a) => a[2] === team && a[3] === 'lead');
  return lead ? lead[0] : null;
}
function genAgents() {
  return memo('agents', () =>
    AGENTS.map((a, i) => ({
      id: i + 1,
      intercom_name: a[1],
      agent_intercom_name: a[1],
      real_name: a[0],
      agent_name: a[0],
      name: a[0],
      email: `${a[1]}@nextventures.io`,
      team: a[2],
      team_lead: teamLeadName(a[2]),
      channel: 'chat', // marks them as live-chat agents for the SPO filter
      role: a[3],
      lead: a[3] === 'lead',
      active: true,
    }))
  );
}

function genAllTopics() {
  return memo('all_topics', () =>
    [...SUB_TOPICS, ...MAIN_TOPICS].map((t) => ({ topic: t }))
  );
}
function genTopicMap() {
  return memo('topic_map', () => {
    const rng = makeRng(7007);
    return SUB_TOPICS.map((t) => ({
      topic: t,
      main_topic: MAIN_TOPICS[Math.floor(rng() * MAIN_TOPICS.length)],
    }));
  });
}

function genTickets() {
  return memo('tickets', () => {
    const rng = makeRng(8008);
    const rows = [];
    const statuses = ['Open', 'In Progress', 'Resolved', 'Closed'];
    const priorities = ['Low', 'Medium', 'High', 'Urgent'];
    for (let i = 0; i < 900; i++) {
      const [country] = COUNTRIES[Math.floor(rng() * COUNTRIES.length)];
      const daysAgo = Math.floor(rng() * 90);
      const created = dateNDaysAgo(daysAgo);
      const status = statuses[Math.floor(rng() * statuses.length)];
      const done = status === 'Resolved' || status === 'Closed';
      const agent = AGENTS[Math.floor(rng() * AGENTS.length)];
      rows.push({
        id: 400000 + i,
        ticket_id: `TKT-${400000 + i}`,
        created_at: isoDhaka(created),
        resolved_at: done ? isoDhaka(new Date(created.getTime() + (1 + rng() * 6) * DAY)) : null,
        status,
        state: status,
        priority: priorities[Math.floor(rng() * priorities.length)],
        team: TEAMS[Math.floor(rng() * TEAMS.length)],
        assignee: agent[0],
        assignee_name: agent[1],
        country,
        product: PRODUCTS[Math.floor(rng() * PRODUCTS.length)],
        subject: `${MAIN_TOPICS[Math.floor(rng() * MAIN_TOPICS.length)].replace(/_/g, ' ')} report`,
        category: MAIN_TOPICS[Math.floor(rng() * MAIN_TOPICS.length)],
      });
    }
    return rows;
  });
}

function genAthena() {
  return memo('athena', () => [
    { email: 'sajol@nextventures.io', added_by: 'system', added_at: isoDhaka(dateNDaysAgo(30)) },
  ]);
}

function tableRows(table) {
  const t = String(table || '');
  if (t.startsWith('Intercom Topic')) return genIntercom();
  if (t.startsWith('CSAT')) return genCSAT();
  if (t.includes('Service Performance Overview')) {
    if (t.startsWith('Email')) return genEmailSpo();
    if (t.startsWith('FIN')) return genFinSpo();
    if (t.startsWith('Transfer')) return genTransferSpo();
    return genMainSpo();
  }
  if (t === 'all_topics_with_main') return genTopicMap();
  if (t === 'all_topics') return genAllTopics();
  if (t === 'agent_name_mapping') return genAgents();
  if (t === 'ticket_logs') return genTickets();
  if (t === 'athena_permissions') return genAthena();
  return []; // activity_hours, daily_report, supervisor_evaluations, unknowns
}

// ─── Query builder ───────────────────────────────────────────────────────────
function colKey(col) {
  // Callers sometimes pass column names wrapped in double quotes.
  return String(col).replace(/^"+|"+$/g, '');
}
function getVal(row, col) {
  return row[colKey(col)];
}
function ci(v) {
  return v == null ? '' : String(v).toLowerCase();
}
function likeToRegex(pattern) {
  const escaped = String(pattern)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

class QueryBuilder {
  constructor(table) {
    this._table = table;
    this._filters = [];
    this._op = 'select';
    this._payload = null;
    this._order = null;
    this._range = null;
    this._limit = null;
    this._single = false;
    this._count = null;
    this._head = false;
  }

  select(_cols, opts) {
    if (opts && opts.count) this._count = opts.count;
    if (opts && opts.head) this._head = true;
    return this;
  }
  insert(payload) { this._op = 'insert'; this._payload = payload; return this; }
  update(payload) { this._op = 'update'; this._payload = payload; return this; }
  upsert(payload) { this._op = 'upsert'; this._payload = payload; return this; }
  delete() { this._op = 'delete'; return this; }

  eq(c, v) { this._filters.push((r) => getVal(r, c) === v); return this; }
  neq(c, v) { this._filters.push((r) => getVal(r, c) !== v); return this; }
  gt(c, v) { this._filters.push((r) => getVal(r, c) != null && getVal(r, c) > v); return this; }
  gte(c, v) { this._filters.push((r) => getVal(r, c) != null && getVal(r, c) >= v); return this; }
  lt(c, v) { this._filters.push((r) => getVal(r, c) != null && getVal(r, c) < v); return this; }
  lte(c, v) { this._filters.push((r) => getVal(r, c) != null && getVal(r, c) <= v); return this; }
  in(c, arr) { const s = new Set(arr); this._filters.push((r) => s.has(getVal(r, c))); return this; }
  is(c, v) { if (v === null) this._filters.push((r) => getVal(r, c) == null); return this; }
  not(c, op, v) {
    if (op === 'is' && v === null) this._filters.push((r) => getVal(r, c) != null);
    else if (op === 'eq') this._filters.push((r) => getVal(r, c) !== v);
    else if (op === 'in') { const s = new Set(v); this._filters.push((r) => !s.has(getVal(r, c))); }
    return this;
  }
  ilike(c, pat) { const re = likeToRegex(pat); this._filters.push((r) => re.test(ci(getVal(r, c)))); return this; }
  like(c, pat) { const re = likeToRegex(pat); this._filters.push((r) => re.test(String(getVal(r, c) ?? ''))); return this; }
  contains() { return this; }
  or() { return this; } // OR predicates are ignored → superset (never crashes)
  order(c, opt) { this._order = { c, asc: opt ? opt.ascending !== false : true }; return this; }
  limit(n) { this._limit = n; return this; }
  range(a, b) { this._range = [a, b]; return this; }

  single() { this._single = 'strict'; return this._resolve(); }
  maybeSingle() { this._single = 'maybe'; return this._resolve(); }
  then(onFulfilled, onRejected) { return this._resolve().then(onFulfilled, onRejected); }
  catch(onRejected) { return this._resolve().catch(onRejected); }

  async _resolve() {
    // Mutations: pretend success.
    if (this._op !== 'select') {
      const data = this._op === 'insert'
        ? (Array.isArray(this._payload) ? this._payload : [this._payload])
        : null;
      return { data, error: null, count: null, status: 200, statusText: 'OK' };
    }

    let rows = tableRows(this._table).slice();
    for (const f of this._filters) rows = rows.filter(f);

    if (this._order) {
      const { c, asc } = this._order;
      rows.sort((a, b) => {
        const av = getVal(a, c), bv = getVal(b, c);
        if (av == null) return 1;
        if (bv == null) return -1;
        if (av < bv) return asc ? -1 : 1;
        if (av > bv) return asc ? 1 : -1;
        return 0;
      });
    }

    const count = rows.length;

    if (this._head) return { data: null, error: null, count };

    if (this._range) rows = rows.slice(this._range[0], this._range[1] + 1);
    if (this._limit != null) rows = rows.slice(0, this._limit);

    if (this._single) {
      return { data: rows[0] ?? null, error: null, count };
    }
    return { data: rows, error: null, count };
  }
}

// ─── Auth mock ───────────────────────────────────────────────────────────────
const MOCK_USER = {
  id: 'mock-user-0001',
  email: 'sajol@nextventures.io',
  role: 'authenticated',
  user_metadata: {
    full_name: 'Business Analytics Demo',
    name: 'Business Analytics Demo',
    avatar_url: null,
  },
  app_metadata: { provider: 'mock' },
};
const MOCK_SESSION = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: MOCK_USER,
};

const auth = {
  async getSession() { return { data: { session: MOCK_SESSION }, error: null }; },
  async getUser() { return { data: { user: MOCK_USER }, error: null }; },
  onAuthStateChange(cb) {
    setTimeout(() => cb('SIGNED_IN', MOCK_SESSION), 0);
    return { data: { subscription: { unsubscribe() {} } } };
  },
  async signInWithPassword() { return { data: { session: MOCK_SESSION, user: MOCK_USER }, error: null }; },
  async signUp() { return { data: { user: MOCK_USER, session: MOCK_SESSION }, error: null }; },
  async signInWithOAuth() { return { data: { provider: 'mock', url: null }, error: null }; },
  async signOut() { return { error: null }; },
  async resetPasswordForEmail() { return { data: {}, error: null }; },
  async refreshSession() { return { data: { session: MOCK_SESSION, user: MOCK_USER }, error: null }; },
};

// ─── RPC mock ────────────────────────────────────────────────────────────────
function rpc(name) {
  let data = [];
  switch (name) {
    case 'get_intercom_countries':
      data = COUNTRIES.map((c) => c[0]);
      break;
    case 'get_intercom_products':
      data = [...PRODUCTS];
      break;
    // Shapes not reverse-engineered → empty; callers fall back gracefully.
    case 'get_topic_distribution':
    case 'get_performance_timeseries':
    case 'get_fundee_dashboard':
    default:
      data = [];
  }
  return Promise.resolve({ data, error: null });
}

// ─── Server-side aggregation mock (drives /api/dashboard-data) ───────────────
// The app is built around a serverless endpoint that returns pre-aggregated data.
// We reproduce that contract here (with correct "All" handling), computing from the
// same generated Service Performance Overview rows.

function rangeFor(dateRange = 'last_30_days', gmtOffset = 6) {
  const offsetMs = Number(gmtOffset) * 3600000;
  const nowLocal = new Date(Date.now() + offsetMs);
  const todayStr = nowLocal.toISOString().slice(0, 10);
  let fromStr, toStr;
  if (dateRange === 'today') {
    fromStr = toStr = todayStr;
  } else if (dateRange === 'yesterday') {
    const y = new Date(nowLocal); y.setUTCDate(y.getUTCDate() - 1);
    fromStr = toStr = y.toISOString().slice(0, 10);
  } else if (dateRange === 'this_week') {
    const s = new Date(nowLocal); s.setUTCDate(s.getUTCDate() - nowLocal.getUTCDay());
    fromStr = s.toISOString().slice(0, 10); toStr = todayStr;
  } else if (dateRange === 'this_month') {
    fromStr = todayStr.slice(0, 8) + '01'; toStr = todayStr;
  } else if (dateRange === 'last_month') {
    const f = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), 1));
    const e = new Date(f.getTime() - DAY);
    fromStr = e.toISOString().slice(0, 8) + '01'; toStr = e.toISOString().slice(0, 10);
  } else if (dateRange && dateRange.startsWith('custom_')) {
    const p = dateRange.split('_'); fromStr = p[1]; toStr = p[2];
  } else {
    const days = { last_7_days: 7, last_30_days: 30, last_90_days: 90, last_3_months: 90 }[dateRange] || 30;
    const s = new Date(nowLocal); s.setUTCDate(s.getUTCDate() - days);
    fromStr = s.toISOString().slice(0, 10); toStr = todayStr;
  }
  return { startDate: `${fromStr}T00:00:00+06:00`, endDate: `${toStr}T23:59:59+06:00` };
}

const noFilter = (v) => v == null || v === '' || v === 'All' || v === 'all';
const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
const dayLabel = (iso) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function buildDashboardData(filters = {}) {
  const { startDate, endDate } = rangeFor(filters.dateRange, filters.gmtOffset ?? 6);
  let rows = genMainSpo().filter((r) => r.created_at >= startDate && r.created_at <= endDate);
  if (!noFilter(filters.country))
    rows = rows.filter((r) => ci(r.country).includes(ci(filters.country)));
  if (!noFilter(filters.channel)) rows = rows.filter((r) => r.channel === filters.channel);
  if (!noFilter(filters.sentiment))
    rows = rows.filter((r) => ci(r.sentiment).includes(ci(filters.sentiment)));
  if (!noFilter(filters.region)) rows = rows.filter((r) => r.region === filters.region);
  if (Array.isArray(filters.agents) && filters.agents.length) {
    const s = new Set(filters.agents);
    rows = rows.filter((r) => s.has(r.assignee_name));
  }

  const uniq = new Set(rows.map((r) => r.conversation_id));
  const reopened = rows.filter((r) => r.is_reopened).length;
  const total = uniq.size;
  const frtHit = rows.filter((r) => r['FRT Hit Rate'] != null);
  const artHit = rows.filter((r) => r['ART Hit Rate'] != null).map((r) => r['ART Hit Rate']);
  const summary = {
    total_knock_count: total,
    new_conversations: total - reopened,
    reopened_conversations: reopened,
    avg_frt_seconds: avg(rows.map((r) => r.frt_seconds).filter((v) => v != null)),
    avg_art_seconds: avg(rows.map((r) => r.art_seconds).filter((v) => v != null)),
    avg_aht_seconds: avg(rows.map((r) => r.aht_seconds).filter((v) => v != null)),
    avg_wait_time_seconds: avg(rows.map((r) => r['Avg Wait Time']).filter((v) => v != null)),
    frt_hit_rate: frtHit.length
      ? Math.round((frtHit.filter((r) => r['FRT Hit Rate'] === 0).length / frtHit.length) * 1000) / 10
      : null,
    art_hit_rate: artHit.length ? Math.round((100 - avg(artHit)) * 10) / 10 : null,
    avg_csat: avg(rows.map((r) => r['CX score']).filter((v) => v != null)),
  };

  // Trend by day
  const trendMap = {};
  rows.forEach((r) => {
    const d = dayLabel(r.created_at);
    if (!trendMap[d]) trendMap[d] = { total: new Set(), new: 0, reopened: 0 };
    trendMap[d].total.add(r.conversation_id);
    if (r.is_reopened) trendMap[d].reopened++; else trendMap[d].new++;
  });
  const trend = Object.entries(trendMap)
    .map(([date, c]) => ({ date, total: c.total.size, new: c.new, reopened: c.reopened }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // Sentiment (unique conversation)
  const seenS = {};
  rows.forEach((r) => { if (r.sentiment && !seenS[r.conversation_id]) seenS[r.conversation_id] = r.sentiment; });
  const sVals = Object.values(seenS);
  const sentiment = [
    { name: 'Positive', value: sVals.filter((s) => s === 'Positive').length, color: '#10B981' },
    { name: 'Neutral', value: sVals.filter((s) => s === 'Neutral').length, color: '#8B5CF6' },
    { name: 'Negative', value: sVals.filter((s) => s === 'Negative').length, color: '#EF4444' },
  ];

  // Channels
  const chColors = { Chat: '#C084FC', Instagram: '#F472B6', Facebook: '#60A5FA', Email: '#A78BFA' };
  const chCount = {}; const seenC = new Set();
  rows.forEach((r) => {
    if (seenC.has(r.conversation_id)) return;
    seenC.add(r.conversation_id);
    chCount[r.channel] = (chCount[r.channel] || 0) + 1;
  });
  const channels = Object.entries(chCount)
    .map(([name, value]) => ({ name, value, color: chColors[name] || '#94A3B8' }))
    .sort((a, b) => b.value - a.value);

  // Heatmap (day × hour, unique conversation)
  const hm = {}; const seenH = new Set();
  rows.forEach((r) => {
    if (seenH.has(r.conversation_id)) return;
    seenH.add(r.conversation_id);
    const d = new Date(r.created_at);
    hm[`${d.getDay()}-${d.getHours()}`] = (hm[`${d.getDay()}-${d.getHours()}`] || 0) + 1;
  });
  const heatmap = [];
  for (let di = 0; di < 7; di++)
    for (let h = 0; h < 24; h++)
      heatmap.push({ dayIdx: di, day: DAYS[di], hour: h, value: hm[`${di}-${h}`] || 0 });

  // Teammates
  const tm = {};
  rows.forEach((r) => {
    const id = r.assignee_name || 'Unknown';
    if (!tm[id]) tm[id] = { conv: new Set(), frt: [], art: [], aht: [], csat: [] };
    tm[id].conv.add(r.conversation_id);
    if (r.frt_seconds != null) tm[id].frt.push(r.frt_seconds);
    if (r.art_seconds != null) tm[id].art.push(r.art_seconds);
    if (r.aht_seconds != null) tm[id].aht.push(r.aht_seconds);
    if (r['CX score'] != null) tm[id].csat.push(r['CX score']);
  });
  const teammates = Object.entries(tm)
    .map(([name, d]) => ({
      name, conversations: d.conv.size, FRT: avg(d.frt), ART: avg(d.art), AHT: avg(d.aht),
      'FRT Hit Rate': 70, 'ART Hit Rate': 65, CSAT: avg(d.csat),
    }))
    .sort((a, b) => b.conversations - a.conversations)
    .slice(0, 20);

  // Countries
  const cc = {}; const seenCC = new Set();
  rows.forEach((r) => {
    if (!r.country || seenCC.has(r.conversation_id)) return;
    seenCC.add(r.conversation_id);
    cc[r.country] = (cc[r.country] || 0) + 1;
  });
  const countries = Object.entries(cc)
    .map(([name, knockCount]) => ({ name, knockCount }))
    .sort((a, b) => b.knockCount - a.knockCount)
    .slice(0, 15);

  // Active hours
  const hourCounts = Array(24).fill(0); const seenA = new Set();
  rows.forEach((r) => {
    if (seenA.has(r.conversation_id)) return;
    seenA.add(r.conversation_id);
    hourCounts[new Date(r.created_at).getHours()]++;
  });
  const spanDays = Math.max(1, Math.ceil((new Date(endDate) - new Date(startDate)) / DAY));
  const activeHours = hourCounts.map((count, hour) => ({ hour: `${hour}:00`, avgActive: Math.round(count / spanDays) }));

  return {
    success: true, rowCount: rows.length,
    summary, trend, sentiment, channels, heatmap, closedHeatmap: heatmap, teammates, countries, activeHours,
  };
}

export function mockAgentsPayload() {
  return { success: true, agents: genAgents().map((a) => a.agent_name) };
}

// ─── createClient (the aliased entry point) ─────────────────────────────────
export function createClient() {
  return {
    auth,
    from(table) { return new QueryBuilder(table); },
    rpc,
    channel() {
      return { on() { return this; }, subscribe() { return this; }, unsubscribe() {} };
    },
    removeChannel() {},
  };
}

export default { createClient };
