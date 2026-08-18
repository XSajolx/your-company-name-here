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
      <h1 id="buName">Trustpilot Insights</h1>
      <div id="tpScore" class="tp-score"></div>
    </div>
    <div class="bu-switch" id="buSwitch" role="group" aria-label="Business unit"></div>
  </div>
  <div class="range" id="rangeControls">
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
    <button id="syncBtn" class="sync-btn" title="Fetch new reviews from Trustpilot now">↻ Sync</button>
  </div>
</header>

<main>
  <section class="kpis" id="kpis"></section>

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

  <section class="grid">
    <div class="card">
      <div class="card-head"><h2>Top complaint themes</h2></div>
      <div id="negThemes" class="themes"></div>
    </div>
    <div class="card">
      <div class="card-head"><h2>What customers love</h2></div>
      <div id="posThemes" class="themes"></div>
    </div>
  </section>

  <section class="card" id="reviewsSection">
    <div class="card-head"><h2>See reviews</h2><span class="hint" id="reviewsCount"></span></div>
    <div id="recent" class="recent"></div>
    <div id="pager" class="pager"></div>
  </section>
</main>

<div id="removedModal" class="modal" hidden>
  <div class="modal-backdrop" data-close></div>
  <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="removedTitle">
    <div class="modal-head">
      <div>
        <h2 id="removedTitle">Removed by Trustpilot</h2>
        <span class="hint" id="removedHint"></span>
      </div>
      <button class="modal-close" data-close aria-label="Close">✕</button>
    </div>
    <p class="removed-intro">Reviews we captured that Trustpilot no longer lists (taken down or deleted by the reviewer), within the selected range.</p>
    <div class="recheck">
      <span class="recheck-label">Re-check Trustpilot now:</span>
      <button class="recheck-btn" data-months="1">Last 1m</button>
      <button class="recheck-btn" data-months="3">Last 3m</button>
      <button class="recheck-btn" data-months="6">Last 6m</button>
      <span class="recheck-status" id="recheckStatus"></span>
    </div>
    <div id="removedStars" class="removed-stars"></div>
    <div id="removedList" class="recent"></div>
    <div id="removedPager" class="pager"></div>
  </div>
</div>

<div id="tip" class="tip" hidden></div>
`;

export default function TrustpilotMain() {
  const containerRef = useRef(null);
  const { session } = useAuth();
  const cleanupRef = useRef(null);

  useEffect(() => {
    const token = session?.access_token;
    if (!containerRef.current || !token) return;

    const container = containerRef.current;
    container.innerHTML = TEMPLATE;

    let cancelled = false;
    import('../tp/tpMain.js').then(({ initTpMain }) => {
      if (cancelled) return;
      cleanupRef.current = initTpMain(container, token);
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
