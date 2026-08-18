// TrustpilotReply.jsx
// Ports /backend/trustpilot/public/reply.js as a native React component.
// Pure static data — no API calls, no auth required.
import React, { useMemo } from 'react';

// ---------------------------------------------------------------- constants
const STARS = [5, 4, 3, 2, 1];

const FIRMS_RAW = [
  { name: 'FundedNext', fn: true, totalReviews: 72742, rating: 4.5, totalReplies: 4710, l6mRepliesReported: 2,
    stars: { 5: [15440, 0], 4: [1438, 0], 3: [308, 0], 2: [191, 0], 1: [1602, 2] } },
  { name: 'FundingPips', totalReviews: 61624, rating: 4.5, totalReplies: 7369, l6mRepliesReported: 4154,
    stars: { 5: [18490, 1749], 4: [1629, 159], 3: [315, 314], 2: [182, 182], 1: [1780, 1750] } },
  { name: 'FTMO', totalReviews: 45063, rating: 4.8, totalReplies: 0, l6mRepliesReported: 0,
    stars: { 5: [9474, 0], 4: [463, 0], 3: [78, 0], 2: [38, 0], 1: [340, 0] } },
  { name: 'The 5%ers', totalReviews: 31794, rating: 4.7, totalReplies: 30093, l6mRepliesReported: 121706,
    stars: { 5: [10647, 10645], 4: [855, 855], 3: [120, 113], 2: [49, 43], 1: [507, 490] } },
  { name: 'Alpha Capital Group', totalReviews: 20719, rating: 4.7, totalReplies: 1593, l6mRepliesReported: 162,
    stars: { 5: [4693, 5], 4: [322, 0], 3: [57, 0], 2: [34, 0], 1: [176, 157] } },
  { name: 'Apex Trader Funding', totalReviews: 20078, rating: 4.3, totalReplies: 17277, l6mRepliesReported: 2583,
    stars: { 5: [2583, 2358], 4: [305, 252], 3: [145, 2], 2: [123, 0], 1: [566, 50] } },
  { name: 'My Funded Futures', totalReviews: 19871, rating: 4.9, totalReplies: 32, l6mRepliesReported: 0,
    stars: { 5: [5564, 0], 4: [164, 0], 3: [16, 0], 2: [10, 0], 1: [162, 0] } },
  { name: 'Topstep', totalReviews: 14366, rating: 3.5, totalReplies: 252, l6mRepliesReported: 37,
    stars: { 5: [791, 1], 4: [47, 3], 3: [25, 1], 2: [53, 3], 1: [612, 29] } },
];

// ---------------------------------------------------------------- computation
function prepFirms() {
  return FIRMS_RAW.map(f => {
    const out = { ...f, rate: {} };
    let tR = 0, tP = 0;
    STARS.forEach(s => {
      const [rv, rp] = out.stars[s];
      out.rate[s] = rv > 0 ? rp / rv : null;
      tR += rv; tP += rp;
    });
    out.l6mReviews = tR;
    out.l6mReplies = tP;
    out.overallRate = tR > 0 ? Math.min(tP / tR, 1) : null;
    return out;
  });
}

function computeBenchmark(firms) {
  const comp = firms.filter(f => !f.fn);
  const b = {};
  STARS.forEach(s => {
    const vals = comp.map(f => f.rate[s]).filter(v => v !== null);
    b[s] = {
      avg: vals.length ? vals.reduce((a, c) => a + c, 0) / vals.length : 0,
      max: vals.length ? Math.max(...vals) : 0,
    };
  });
  return b;
}

function computePriorityModel(firms, bench) {
  const fn = firms.find(f => f.fn);
  const rows = STARS.map(s => {
    const [rv, rp] = fn.stars[s];
    const fnRate = rv > 0 ? rp / rv : 0;
    const gap = Math.max(0, bench[s].avg - fnRate);
    const toMatch = Math.max(0, Math.round(rv * bench[s].avg) - rp);
    const score = Math.round(rv * bench[s].avg * gap);
    return { star: s, reviews: rv, replies: rp, fnRate, benchAvg: bench[s].avg, benchMax: bench[s].max, gap, toMatch, score };
  }).sort((a, b) => b.score - a.score);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

// ---------------------------------------------------------------- color utils
function lerp(a, b, t) {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}
function rateColor(t) {
  if (t === null || isNaN(t)) return '#22262e';
  t = Math.max(0, Math.min(1, t));
  const red = [244, 199, 195], amber = [255, 235, 178], green = [183, 225, 205];
  return t < 0.5 ? lerp(red, amber, t / 0.5) : lerp(amber, green, (t - 0.5) / 0.5);
}
function gapColor(gap) {
  return lerp([232, 245, 233], [244, 179, 171], Math.max(0, Math.min(1, gap / 0.5)));
}

// ---------------------------------------------------------------- formatting
const fmtN = n => Number(n).toLocaleString('en-US');
const pct = r => (r === null || isNaN(r) ? '—' : Math.round(r * 100) + '%');
const meanArr = arr => (arr.length ? arr.reduce((a, c) => a + c, 0) / arr.length : 0);

function pctRange(f, stars) {
  const vals = stars.map(s => f.rate[s]).filter(v => v !== null);
  if (!vals.length) return '—';
  const lo = Math.min(...vals), hi = Math.max(...vals);
  return pct(lo) === pct(hi) ? pct(lo) : `${pct(lo)}-${pct(hi)}`;
}

function topStar(f) {
  let best = null, bestRate = -1;
  STARS.forEach(s => { const r = f.rate[s]; if (r !== null && r > bestRate) { bestRate = r; best = s; } });
  return best;
}

function rangeLabel(list) {
  const groups = [];
  let start = list[0], prev = list[0];
  for (let i = 1; i <= list.length; i++) {
    if (list[i] === prev + 1) { prev = list[i]; continue; }
    groups.push(start === prev ? String(start) : `${start}-${prev}`);
    start = list[i]; prev = list[i];
  }
  return groups.join(', ') + '★';
}

function computeVerdict(f) {
  const FOCUS = 0.5;
  const peak = topStar(f);
  const peakRate = peak ? (f.rate[peak] || 0) : 0;

  if (peakRate < 0.005) {
    return f.l6mReplies
      ? [`Replies to almost none of its reviews (${fmtN(f.l6mReplies)} of ${fmtN(f.l6mReviews)} in the last 6 months).`,
         `Complaints and praise alike go largely unanswered, so public engagement is effectively absent.`]
      : [`Does not reply to any Trustpilot reviews in the last 6 months.`,
         `Every review, positive or negative, is left unanswered, so there is no public engagement at all.`];
  }

  const hi = STARS.filter(s => f.rate[s] !== null && f.rate[s] >= FOCUS).sort((a, b) => a - b);
  const lo = STARS.filter(s => hi.indexOf(s) === -1 && f.rate[s] !== null).sort((a, b) => a - b);

  if (hi.length === 5)
    return [`Replies to almost every review across all star ratings (${pctRange(f, hi)}).`,
            `Both praise and complaints get a public response, so engagement is treated as universal.`];

  if (hi.length === 0)
    return [`Replies to only a small share of reviews (peak ${pct(peakRate)} at ${peak}★).`,
            `Public engagement is minimal and not concentrated on any particular rating.`];

  const band = hi.every(s => s <= 3) ? 'negative' : hi.every(s => s >= 4) ? 'positive' : 'mixed';
  const hiStars = hi.length === 1 ? `${hi[0]}★` : rangeLabel(hi);
  const loStars = lo.length === 1 ? `${lo[0]}★` : rangeLabel(lo);
  const loReplies = lo.some(s => (f.rate[s] || 0) > 0);

  const l1 = `Replies to most ${hiStars} reviews (${pctRange(f, hi)}); ` +
    (band === 'negative' ? 'negative feedback is the clear focus.'
     : band === 'positive' ? 'positive feedback is the clear focus.'
     : 'these ratings are the focus.');
  const l2 = (loReplies ? 'Rarely responds to ' : 'Ignores ') + `${loStars} (${pctRange(f, lo)}), so ` +
    (band === 'negative' ? 'effort concentrates on damage control rather than praise.'
     : band === 'positive' ? 'complaints are left largely unanswered.'
     : 'the remaining reviews get little attention.');
  return [l1, l2];
}

// ---------------------------------------------------------------- style tokens
const C = {
  bg: '#0f1117',
  surface: '#1a1d23',
  surface2: '#22262e',
  border: '#2a2e38',
  accent: '#2f9e6f',
  bad: '#d1495b',
  amber: '#d9a13a',
  muted: '#8b92a0',
  text: '#e8eaf0',
  textDim: '#c4c9d4',
  fnRow: '#1a2820',
  fnBorder: '#2f9e6f',
};

// ---------------------------------------------------------------- sub-components

function HeatCell({ rate }) {
  const bg = rateColor(rate);
  const isNull = rate === null;
  return (
    <td style={{
      background: isNull ? C.surface2 : bg,
      color: isNull ? C.muted : '#1a1d23',
      textAlign: 'center',
      padding: '6px 10px',
      fontWeight: 500,
      fontSize: 13,
      whiteSpace: 'nowrap',
    }}>
      {isNull ? '–' : pct(rate)}
    </td>
  );
}

function BarCell({ rate }) {
  if (rate === null || isNaN(rate)) {
    return <td style={{ padding: '6px 10px', color: C.muted, textAlign: 'center' }}>–</td>;
  }
  const w = Math.round(Math.max(0, Math.min(1, rate)) * 100);
  const bg = rateColor(rate);
  return (
    <td style={{ padding: '6px 12px', minWidth: 140 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 8, background: C.surface2, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${w}%`, height: '100%', background: bg, borderRadius: 4, transition: 'width .3s' }} />
        </div>
        <span style={{ fontSize: 12, color: C.textDim, minWidth: 36, textAlign: 'right' }}>{pct(rate)}</span>
      </div>
    </td>
  );
}

function VerdictList({ f }) {
  const lines = computeVerdict(f);
  return (
    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: C.textDim, lineHeight: 1.5 }}>
      {lines.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
    </ul>
  );
}

function SectionWrapper({ n, title, subtitle, takeaway, children }) {
  return (
    <section style={{ marginBottom: 36, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      <div style={{ padding: '24px 28px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 8, background: C.accent,
          color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0,
        }}>{n}</span>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>{title}</h2>
          {subtitle && <p style={{ margin: '4px 0 0', fontSize: 13, color: C.muted }}>{subtitle}</p>}
        </div>
      </div>
      {takeaway && (
        <div style={{ padding: '12px 28px', background: '#1e2a24', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.accent, flexShrink: 0, marginTop: 5 }} />
          <p style={{ margin: 0, fontSize: 13, color: C.textDim }}>{takeaway}</p>
        </div>
      )}
      <div style={{ padding: '20px 28px' }}>{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------- Hero
function Hero({ fn, comp, model }) {
  const fnRate = fn.overallRate || 0;
  const compAvg = meanArr(comp.map(f => f.overallRate).filter(v => v != null));
  const best = comp.reduce((b, f) => ((f.overallRate || 0) > (b.overallRate || 0) ? f : b));
  const top = model[0];
  const gapPP = Math.round((compAvg - fnRate) * 100);

  const tiles = [
    { label: 'FundedNext reply rate', value: pct(fnRate), sub: `${gapPP} pts below competitor average`, tone: 'bad' },
    { label: 'Competitor average', value: pct(compAvg), sub: 'firms that reply at all', tone: null },
    { label: 'Best in class', value: pct(best.overallRate), sub: best.name, tone: 'good' },
    { label: 'Start replying here', value: `${top.star}★`, sub: `~${fmtN(top.toMatch)} replies to match peers`, tone: 'focus' },
  ];
  const toneColor = { bad: C.bad, good: C.accent, focus: C.amber, null: C.text };

  return (
    <section style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '28px 32px', marginBottom: 36 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
        ★ Trustpilot Reply-Rate Analysis · Competitor Benchmark
      </div>
      <h1 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 700, color: C.text, lineHeight: 1.4 }}>
        FundedNext replies to <strong>{pct(fnRate)}</strong> of its Trustpilot reviews, the lowest engagement among firms that reply. Competitors average <strong>{pct(compAvg)}</strong>.
      </h1>
      <p style={{ margin: '0 0 24px', fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
        Reply rate = company replies &divide; reviews received (last 6 months). This benchmark shows where FundedNext trails the field and where replying first moves the needle most.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 20 }}>
        {tiles.map(t => (
          <div key={t.label} style={{ background: C.surface2, borderRadius: 10, padding: '16px 18px', borderLeft: `3px solid ${toneColor[t.tone] || C.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{t.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: toneColor[t.tone] || C.text, marginBottom: 4 }}>{t.value}</div>
            <div style={{ fontSize: 12, color: C.muted }}>{t.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ background: '#1e2228', border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 16px', fontSize: 13, color: C.muted }}>
        <strong style={{ color: C.textDim }}>Note:</strong> Trustpilot does not offer a public API for competitor data, so these figures were collected by manual scraping. <strong style={{ color: C.textDim }}>Data last updated 8 July 2026.</strong> Competitor numbers may shift slightly over time.
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Overview table (Section 1)
function OverviewTable({ firms }) {
  const sorted = [...firms].sort((a, b) => b.totalReviews - a.totalReviews);
  const thStyle = { padding: '10px 12px', background: '#1e2228', color: C.muted, fontWeight: 600, fontSize: 12, textAlign: 'left', whiteSpace: 'nowrap', borderBottom: `1px solid ${C.border}` };
  const tdStyle = { padding: '10px 12px', fontSize: 13, color: C.textDim, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
        <thead>
          <tr>
            {['Prop Firm', 'All-Time Reviews', 'Rating', 'All-Time Replies', 'All-Time Reply Rate', 'L6M Reviews', 'L6M Replies'].map(h => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(f => {
            const atRate = f.totalReviews ? Math.min(f.totalReplies / f.totalReviews, 1) : null;
            const isFN = !!f.fn;
            const rowStyle = { background: isFN ? C.fnRow : 'transparent' };
            return (
              <tr key={f.name} style={rowStyle}>
                <td style={{ ...tdStyle, fontWeight: isFN ? 700 : 500, color: isFN ? C.accent : C.text }}>
                  {f.name}
                  {isFN && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: C.accent, border: `1px solid ${C.accent}`, borderRadius: 4, padding: '1px 5px' }}>FundedNext</span>}
                </td>
                <td style={tdStyle}>{fmtN(f.totalReviews)}</td>
                <td style={tdStyle}><span style={{ color: '#f5c518' }}>★</span> {f.rating.toFixed(1)}</td>
                <td style={tdStyle}>{fmtN(f.totalReplies)}</td>
                <BarCell rate={atRate} />
                <td style={tdStyle}>{fmtN(f.l6mReviews)}</td>
                <td style={tdStyle}>{fmtN(f.l6mRepliesReported)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- Heat table (Section 2)
function ReplyRateTable({ firms, bench }) {
  const sorted = [...firms].sort((a, b) => b.totalReviews - a.totalReviews);
  const thStyle = { padding: '10px 12px', background: '#1e2228', color: C.muted, fontWeight: 600, fontSize: 12, textAlign: 'center', whiteSpace: 'nowrap', borderBottom: `1px solid ${C.border}` };
  const tdBase = { padding: '10px 12px', fontSize: 13, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' };

  const benchAvgRow = STARS.map(s => bench[s].avg);
  const benchMaxRow = STARS.map(s => bench[s].max);
  const benchAvgOverall = meanArr(benchAvgRow);
  const benchMaxOverall = meanArr(benchMaxRow);

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr>
              {['Prop Firm', 'Rating', 'L6M Reviews', '5★', '4★', '3★', '2★', '1★', 'Overall', 'What it tells us'].map(h => (
                <th key={h} style={h === 'What it tells us' ? { ...thStyle, textAlign: 'left', minWidth: 220 } : thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(f => {
              const isFN = !!f.fn;
              return (
                <tr key={f.name} style={{ background: isFN ? C.fnRow : 'transparent' }}>
                  <td style={{ ...tdBase, fontWeight: isFN ? 700 : 500, color: isFN ? C.accent : C.text, textAlign: 'left' }}>
                    {f.name}
                    {isFN && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: C.accent, border: `1px solid ${C.accent}`, borderRadius: 4, padding: '1px 5px' }}>FN</span>}
                  </td>
                  <td style={{ ...tdBase, textAlign: 'center', color: C.textDim }}><span style={{ color: '#f5c518' }}>★</span> {f.rating.toFixed(1)}</td>
                  <td style={{ ...tdBase, textAlign: 'center', color: C.textDim }}>{fmtN(f.l6mReviews)}</td>
                  {STARS.map(s => <HeatCell key={s} rate={f.rate[s]} />)}
                  <HeatCell rate={f.overallRate} />
                  <td style={{ ...tdBase, textAlign: 'left', minWidth: 220 }}><VerdictList f={f} /></td>
                </tr>
              );
            })}
            {/* Benchmark rows */}
            {[
              { label: 'Competitor Average', vals: benchAvgRow, overall: benchAvgOverall },
              { label: 'Best-in-class', vals: benchMaxRow, overall: benchMaxOverall },
            ].map(brow => (
              <tr key={brow.label} style={{ background: '#1c2030' }}>
                <td colSpan={3} style={{ ...tdBase, fontStyle: 'italic', color: C.muted, fontWeight: 600, textAlign: 'left' }}>{brow.label}</td>
                {brow.vals.map((v, i) => <HeatCell key={i} rate={v} />)}
                <HeatCell rate={brow.overall} />
                <td style={{ ...tdBase, color: C.muted, fontSize: 12 }}></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Heat legend */}
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: C.muted }}>
        <span>Reply rate:</span>
        <div style={{ display: 'flex', gap: 3 }}>
          {[0, 0.25, 0.5, 0.75, 1].map(v => (
            <span key={v} style={{ width: 28, height: 14, display: 'inline-block', background: rateColor(v), borderRadius: 3 }} />
          ))}
        </div>
        <span style={{ display: 'flex', justifyContent: 'space-between', minWidth: 200 }}>
          <span>0% · ignored</span><span>answered · 100%</span>
        </span>
      </div>
      <Methodology />
    </>
  );
}

function Methodology() {
  const ex = FIRMS_RAW.find(f => f.name === 'FundingPips');
  const prepped = prepFirms().find(f => f.name === 'FundingPips');
  const [r1v, r1p] = ex.stars[1], [r3v, r3p] = ex.stars[3], [r5v, r5p] = ex.stars[5];
  const overall = Math.round(prepped.l6mReplies / prepped.l6mReviews * 100);
  const fiveShare = Math.round(r5v / prepped.l6mReviews * 100);
  const fiveRate = Math.round(r5p / r5v * 100);

  const boxStyle = { background: C.surface2, borderRadius: 8, padding: '16px 20px', marginTop: 20, fontSize: 13, color: C.textDim, lineHeight: 1.6 };
  return (
    <div style={boxStyle}>
      <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: C.text }}>How the numbers are calculated</h3>
      <p style={{ margin: '0 0 8px' }}><strong style={{ color: C.text }}>Star Reply %</strong> = replies to that star rating / reviews of that star rating (last 6 months). Higher means more of that rating was answered (green); lower means it was ignored (red).</p>
      <p style={{ margin: '0 0 8px' }}><strong style={{ color: C.text }}>Overall</strong> = total replies / total reviews across all five star ratings. It is volume-weighted, so the star ratings with the most reviews influence it the most.</p>
      <p style={{ margin: '0 0 4px', color: C.muted, fontStyle: 'italic' }}>Example: FundingPips (last 6 months)</p>
      <p style={{ margin: '0 0 4px', fontFamily: 'monospace', fontSize: 12 }}>Per star: 1★ {fmtN(r1p)} / {fmtN(r1v)} = {Math.round(r1p / r1v * 100)}%&nbsp;&nbsp; 3★ {fmtN(r3p)} / {fmtN(r3v)} = {Math.round(r3p / r3v * 100)}%&nbsp;&nbsp; 5★ {fmtN(r5p)} / {fmtN(r5v)} = {fiveRate}%</p>
      <p style={{ margin: '0 0 4px', fontFamily: 'monospace', fontSize: 12 }}>Overall: {fmtN(prepped.l6mReplies)} total replies / {fmtN(prepped.l6mReviews)} total reviews = {overall}%.</p>
      <p style={{ margin: 0 }}>Why Overall looks low: 5★ reviews are {fiveShare}% of all volume ({fmtN(r5v)} of {fmtN(prepped.l6mReviews)}) but get only a {fiveRate}% reply rate, which pulls the volume-weighted Overall down to {overall}%, even though FundingPips answers 98-100% of every 1-3★ review.</p>
    </div>
  );
}

// ---------------------------------------------------------------- Focus leaderboard (Section 3)
function FocusLeaderboard({ model }) {
  const maxRate = Math.max(...model.map(p => Math.max(p.fnRate, p.benchAvg)), 0.01);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
      {model.map(p => {
        const fnW = Math.round((p.fnRate / maxRate) * 100);
        const benchW = Math.round((p.benchAvg / maxRate) * 100);
        const isTop = p.rank === 1;
        return (
          <div key={p.star} style={{
            display: 'grid', gridTemplateColumns: '100px 1fr 120px', gap: 16, alignItems: 'center',
            background: isTop ? '#1e2a24' : C.surface2, borderRadius: 8, padding: '14px 18px',
            border: isTop ? `1px solid ${C.accent}` : `1px solid ${C.border}`,
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: isTop ? C.accent : C.muted, textTransform: 'uppercase', marginBottom: 4 }}>
                {isTop ? 'Start here' : `#${p.rank}`}
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.text }}>{p.star}★</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'FundedNext', w: fnW, color: C.accent },
                { label: 'Competitor avg', w: benchW, color: '#5b9cf5' },
              ].map(bar => (
                <div key={bar.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: C.muted, minWidth: 100 }}>{bar.label}</span>
                  <div style={{ flex: 1, height: 8, background: C.surface, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${bar.w}%`, height: '100%', background: bar.color, borderRadius: 4, transition: 'width .3s' }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{fmtN(p.toMatch)}</div>
              <div style={{ fontSize: 11, color: C.muted }}>replies to match</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PriorityTable({ model }) {
  const thStyle = { padding: '8px 10px', background: '#1e2228', color: C.muted, fontWeight: 600, fontSize: 12, textAlign: 'center', whiteSpace: 'nowrap', borderBottom: `1px solid ${C.border}` };
  const tdStyle = { padding: '8px 10px', fontSize: 13, color: C.textDim, textAlign: 'center', borderBottom: `1px solid ${C.border}` };
  return (
    <details style={{ marginTop: 8 }}>
      <summary style={{ cursor: 'pointer', fontSize: 13, color: C.muted, padding: '8px 0', userSelect: 'none' }}>Full scoring breakdown</summary>
      <div style={{ overflowX: 'auto', marginTop: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
          <thead>
            <tr>
              {['Star', 'FN Reviews', 'FN Replies Now', 'FN Reply %', 'Competitor Avg %', 'Best-in-class %', 'Gap (pp)', 'Replies to Match Avg', 'Priority Score', 'Rank'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.map(p => (
              <tr key={p.star} style={{ background: p.rank === 1 ? C.fnRow : 'transparent' }}>
                <td style={{ ...tdStyle, fontWeight: p.rank === 1 ? 700 : 400, color: p.rank === 1 ? C.accent : C.text }}>{p.star}★</td>
                <td style={tdStyle}>{fmtN(p.reviews)}</td>
                <td style={tdStyle}>{fmtN(p.replies)}</td>
                <HeatCell rate={p.fnRate} />
                <HeatCell rate={p.benchAvg} />
                <HeatCell rate={p.benchMax} />
                <td style={{ padding: '8px 10px', background: gapColor(p.gap), color: '#1a1d23', textAlign: 'center', fontWeight: 500, fontSize: 13, borderBottom: `1px solid ${C.border}` }}>{pct(p.gap)}</td>
                <td style={tdStyle}>{fmtN(p.toMatch)}</td>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtN(p.score)}</td>
                <td style={{ ...tdStyle, fontWeight: p.rank === 1 ? 700 : 400, color: p.rank === 1 ? C.accent : C.text }}>{p.rank}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------- Recommendation (Section 4)
function Recommendation({ firms, model }) {
  const fn = firms.find(f => f.fn);
  const top = model[0];
  const fnOverall = fn.overallRate != null ? Math.round(fn.overallRate * 100) : 0;
  const order = model.map(p => `${p.star}★`).join(' → ');
  const bullets = [
    `FundedNext currently replies to roughly <strong>${fnOverall}%</strong> of its Trustpilot reviews (last 6 months), the lowest engagement among firms that reply at all.`,
    `Top competitors (FundingPips, The 5%ers, Alpha Capital) reply to <strong>90-100%</strong> of their negative reviews. Unanswered complaints visibly drag public perception and rating.`,
    `Priority order by the model: <strong>${order}</strong>. Start with ${top.star}★: about ${Math.round(top.benchAvg * 100)}% competitor reply rate vs FN ${Math.round(top.fnRate * 100)}%, roughly ${fmtN(top.toMatch)} replies to match the benchmark.`,
  ];
  return (
    <div>
      <div style={{ background: '#1e2a24', border: `1px solid ${C.accent}`, borderRadius: 10, padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Recommended play</div>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.text, lineHeight: 1.5 }}>
          Reply to <strong>100% of 1-3★ reviews</strong> first (reputation defence), then scale into 4-5★ (advocacy) as capacity allows.
        </p>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {bullets.map((b, i) => (
          <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 14, color: C.textDim, lineHeight: 1.6 }}>
            <span style={{ width: 20, height: 20, borderRadius: '50%', background: C.surface2, color: C.accent, fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>{i + 1}</span>
            <span dangerouslySetInnerHTML={{ __html: b }} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- main component
export default function TrustpilotReply() {
  const { firms, bench, model } = useMemo(() => {
    const firms = prepFirms();
    const bench = computeBenchmark(firms);
    const model = computePriorityModel(firms, bench);
    return { firms, bench, model };
  }, []);

  const fn = firms.find(f => f.fn);
  const comp = firms.filter(f => !f.fn);

  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", background: C.bg, color: C.text, minHeight: '100vh', padding: '28px 32px 60px' }}>
      <Hero fn={fn} comp={comp} model={model} />

      <SectionWrapper
        n={1}
        title="Company Overview"
        subtitle="All-time standing and last-6-month reply activity across the competitive set."
      >
        <OverviewTable firms={firms} />
      </SectionWrapper>

      <SectionWrapper
        n={2}
        title="Reply Rate by Star Rating"
        subtitle="Who answers which reviews, over the last 6 months. Green = actively replying, red = ignoring."
      >
        <ReplyRateTable firms={firms} bench={bench} />
      </SectionWrapper>

      <SectionWrapper
        n={3}
        title="Where Should FundedNext Reply First?"
        subtitle="Ranked by opportunity: review volume x how much competitors engage x the gap FundedNext has to close."
        takeaway="The higher the rank, the more a reply moves public perception. Start at the top and work down."
      >
        <FocusLeaderboard model={model} />
        <PriorityTable model={model} />
      </SectionWrapper>

      <SectionWrapper n={4} title="Recommendation">
        <Recommendation firms={firms} model={model} />
      </SectionWrapper>
    </div>
  );
}
