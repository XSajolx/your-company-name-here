import React, { useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import '../tp/tpEmbed.css';

const TEMPLATE = `
<header class="topbar">
  <div class="brand">
    <div class="logo" aria-label="Trustpilot">
      <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
        <polygon fill="#00b67a" points="12,0.5 14.8,8.1 22.9,8.5 16.6,13.5 18.8,21.3 12,16.8 5.2,21.3 7.4,13.5 1.1,8.5 9.2,8.1"/>
      </svg>
    </div>
    <div>
      <h1>Compare · Trustpilot Insights</h1>
    </div>
  </div>
  <div class="range">
    <div class="presets" id="presets">
      <button data-days="7">7d</button>
      <button data-days="30">30d</button>
      <button data-days="90">90d</button>
      <button data-days="180">180d</button>
      <button data-days="365">1y</button>
      <button data-all class="active">All</button>
    </div>
    <div class="dates">
      <label>From <input type="date" id="from" /></label>
      <label>To <input type="date" id="to" /></label>
    </div>
  </div>
</header>

<div class="compare-panel">
  <span class="cp-label">Compare:</span>
  <div id="compareChecks" class="cp-checks"></div>
  <span class="cp-hint" id="hint"></span>
</div>

<main>
  <section class="kpis cmp" id="kpis"></section>

  <section class="grid">
    <div class="card wide">
      <div class="card-head">
        <h2>Rating over time</h2>
        <span class="hint" id="trendHint"></span>
      </div>
      <div id="trendChart" class="chart"></div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Star distribution</h2></div>
      <div id="distChart" class="chart"></div>
    </div>
  </section>

  <section class="card">
    <div class="card-head"><h2>Top complaint themes</h2></div>
    <div id="negThemes" class="themes"></div>
  </section>

  <section class="card">
    <div class="card-head"><h2>What customers love</h2></div>
    <div id="posThemes" class="themes"></div>
  </section>
</main>

<div id="tip" class="tip" hidden></div>
`;

export default function TrustpilotCompare() {
  const containerRef = useRef(null);
  const { session } = useAuth();
  const cleanupRef = useRef(null);

  useEffect(() => {
    const token = session?.access_token;
    if (!containerRef.current || !token) return;

    const container = containerRef.current;
    container.innerHTML = TEMPLATE;

    let cancelled = false;
    import('../tp/tpCompare.js').then(({ initTpCompare }) => {
      if (cancelled) return;
      cleanupRef.current = initTpCompare(container, token);
    });

    return () => {
      cancelled = true;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      container.innerHTML = '';
    };
  }, [session?.access_token]);

  return (
    <div
      ref={containerRef}
      className="tp-embed"
      style={{ minHeight: '100vh', background: 'var(--tp-bg, #0f131a)' }}
    />
  );
}
