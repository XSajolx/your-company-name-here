// Container-scoped version of backend/trustpilot/public/app.js for React embedding.
// Exports initTpMain(container, token) → cleanup function.

export function initTpMain(container, token) {
  const apiFetch = (url, opts = {}) => fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) }
  });

  const $ = (s) => container.querySelector(s);

  const iso = (d) => d.toISOString().slice(0, 10);
  const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

  let bounds = { min: null, max: null };
  let bu = localStorage.getItem("tp-bu") || "fundednext.com";
  const buQ = () => `bu=${encodeURIComponent(bu)}`;
  let dateSel = { kind: "all" };
  let tpMeta = { trustScore: null, total: null };
  let reqId = 0;
  let reviewsReq = 0;
  let removedReq = 0;
  let recheckWired = false;
  let buSwitchWired = false;
  let starFilter = new Set([1, 2, 3, 4, 5]);
  let themeFilter = new Set();
  const PAGE_SIZE = 10;
  const REMOVED_PAGE_SIZE = 10;

  const fromEl = $("#from");
  const toEl = $("#to");
  const tip = $("#tip");

  function dateQuery() {
    if (dateSel.kind === "preset") return `from=${iso(daysAgo(dateSel.days - 1))}&to=${iso(new Date())}`;
    if (dateSel.kind === "custom") return `from=${dateSel.from}&to=${dateSel.to}`;
    return `from=&to=`;
  }

  function applyDateUi() {
    container.querySelectorAll("#presets button").forEach((x) => x.classList.remove("active"));
    if (dateSel.kind === "preset") {
      $("#presets [data-days='" + dateSel.days + "']")?.classList.add("active");
      setRange(daysAgo(dateSel.days - 1), new Date());
    } else if (dateSel.kind === "custom") {
      setRange(new Date(dateSel.from), new Date(dateSel.to));
    } else {
      $("#presets [data-all]")?.classList.add("active");
      setRange(new Date(bounds.min), new Date(bounds.max));
    }
  }

  async function bootstrap() {
    showSkeleton();
    const mineS = ++reqId;
    const mineR = ++reviewsReq;
    const range = `${dateQuery()}&${buQ()}`;
    const metaP = apiFetch(`/tp/api/meta?${buQ()}`).then((r) => r.json());
    const summaryP = apiFetch(`/tp/api/summary?${range}`).then((r) => r.json());
    const reviewsP = apiFetch(`/tp/api/reviews?${range}&page=1&pageSize=${PAGE_SIZE}`).then((r) => r.json());

    const m = await metaP;
    if (!m || !m.businessUnit) {
      $("#kpis").innerHTML = `<p class="loading">Couldn't load data. Please try again.</p>`;
      return;
    }
    bu = m.businessUnit.id;
    bounds = m.bounds;
    tpMeta = { trustScore: m.businessUnit.trustScore ?? null, total: m.businessUnit.total ?? null };
    setHeader(m);
    renderBuSwitch(m.units);
    fromEl.min = toEl.min = bounds.min;
    fromEl.max = toEl.max = bounds.max;
    applyDateUi();

    const s = await summaryP;
    if (mineS === reqId) renderSummary(s);
    const rv = await reviewsP;
    if (mineR === reviewsReq) renderReviewsData(rv);
  }

  function showSkeleton() {
    $("#kpis").innerHTML = Array.from({ length: 5 }, () =>
      `<div class="kpi skel"><div class="sk-line sk-sm"></div><div class="sk-line sk-lg"></div><div class="sk-line sk-sm"></div></div>`
    ).join("");
    $("#kpis").style.opacity = "1";
    $("#trendChart").innerHTML = `<div class="sk-block"></div>`;
  }

  function setHeader(m) {
    const own = m.businessUnit.own;
    $("#buName").textContent = m.businessUnit.name + (own ? " · Trustpilot Insights" : " · Trustpilot Insights (competitor)");
    const ts = m.businessUnit.trustScore;
    const el = $("#tpScore");
    if (el) el.innerHTML = ts != null
      ? `<span class="star">★</span> ${ts.toFixed(1)} <span class="lbl">Trustpilot score</span>`
      : "";
  }

  function renderBuSwitch(units) {
    const box = $("#buSwitch");
    if (!box || !units || units.length < 2) { if (box) box.hidden = true; return; }
    box.innerHTML = units.map((u) =>
      `<button type="button" class="bu-btn${u.domain === bu ? " active" : ""}" data-bu="${u.domain}" title="${u.own ? "Our account" : "Competitor"}">${u.label}</button>`
    ).join("");
    if (!buSwitchWired) {
      box.addEventListener("click", (e) => {
        const b = e.target.closest(".bu-btn");
        if (b && b.dataset.bu !== bu) switchBu(b.dataset.bu);
      });
      buSwitchWired = true;
    }
  }

  async function switchBu(next) {
    bu = next;
    localStorage.setItem("tp-bu", bu);
    starFilter = new Set([1, 2, 3, 4, 5]);
    themeFilter.clear();
    await bootstrap();
  }

  async function refreshMeta() {
    const m = await (await apiFetch(`/tp/api/meta?${buQ()}`)).json();
    bounds = m.bounds;
    fromEl.max = toEl.max = bounds.max;
    setHeader(m);
  }

  function setRange(from, to) {
    const lo = bounds.min && iso(from) < bounds.min ? bounds.min : iso(from);
    const hi = bounds.max && iso(to) > bounds.max ? bounds.max : iso(to);
    fromEl.value = lo;
    toEl.value = hi;
  }

  function wire() {
    $("#presets").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      container.querySelectorAll("#presets button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      if (b.hasAttribute("data-all")) { dateSel = { kind: "all" }; setRange(new Date(bounds.min), new Date(bounds.max)); }
      else { dateSel = { kind: "preset", days: +b.dataset.days }; setRange(daysAgo(+b.dataset.days - 1), new Date()); }
      load();
    });
    [fromEl, toEl].forEach((el) => el.addEventListener("change", () => {
      container.querySelectorAll("#presets button").forEach((x) => x.classList.remove("active"));
      dateSel = { kind: "custom", from: fromEl.value, to: toEl.value };
      load();
    }));
    $("#syncBtn").addEventListener("click", runSync);
    $("#removedModal").addEventListener("click", (e) => { if (e.target.hasAttribute("data-close")) closeRemovedModal(); });
  }

  async function runSync() {
    const b = $("#syncBtn");
    if (b.disabled) return;
    b.disabled = true;
    const orig = b.textContent;
    b.textContent = "Syncing…";
    try {
      const r = await (await apiFetch(`/tp/api/sync?${buQ()}`, { method: "POST" })).json();
      await refreshMeta();
      await load();
      b.textContent = r.throttled ? "Just synced" : r.added > 0 ? `+${r.added} new` : "Up to date";
    } catch (e) {
      b.textContent = "Sync failed";
    }
    setTimeout(() => { b.textContent = orig; b.disabled = false; }, 2600);
  }

  let starFilter2 = starFilter; // reference alias to allow re-assignment
  function filterQuery() {
    const sel = [...starFilter].sort();
    const starsQ = sel.length >= 1 && sel.length < 5 ? `&stars=${sel.join(",")}` : "";
    const range = dateSel.kind === "all" ? "from=&to=" : `from=${fromEl.value}&to=${toEl.value}`;
    return `${range}&${buQ()}${starsQ}`;
  }
  function themeQuery() {
    if (!themeFilter.size) return "";
    return `&themes=${[...themeFilter].map(encodeURIComponent).join(",")}&sentiment=negative`;
  }

  async function load() {
    const mine = ++reqId;
    setLoading();
    const data = await (await apiFetch(`/tp/api/summary?${filterQuery()}`)).json();
    if (mine !== reqId) return;
    renderSummary(data);
    loadReviews(1);
  }

  function renderSummary(data) {
    renderKpis(data.summary, data.previous, data.removed);
    renderTrend(data.trend);
    renderDist(data.dist);
    renderNegThemes(data.negativeThemes);
    renderThemes("#posThemes", data.positiveThemes, "var(--s5)");
  }

  async function loadReviews(page) {
    const mine = ++reviewsReq;
    $("#recent").innerHTML = `<p class="loading">Loading reviews…</p>`;
    $("#pager").innerHTML = "";
    const data = await (await apiFetch(`/tp/api/reviews?${filterQuery()}${themeQuery()}&page=${page}&pageSize=${PAGE_SIZE}`)).json();
    if (mine !== reviewsReq) return;
    renderReviewsData(data);
  }
  function renderReviewsData(data) {
    const themeNote = themeFilter.size ? ` · ${[...themeFilter].join(", ")}` : "";
    $("#reviewsCount").textContent = `${data.total.toLocaleString()} reviews${themeNote}`;
    renderRecent(data.rows);
    renderPager(data.page, data.pages);
  }

  function renderPager(page, pages) {
    const box = $("#pager");
    if (pages <= 1) { box.innerHTML = ""; return; }
    const btn = (label, target, opts = {}) =>
      `<button class="pg${opts.active ? " active" : ""}" ${opts.disabled ? "disabled" : ""} data-page="${target}">${label}</button>`;
    const win = [];
    const push = (n) => { if (n >= 1 && n <= pages && !win.includes(n)) win.push(n); };
    push(1); push(2);
    for (let n = page - 1; n <= page + 1; n++) push(n);
    push(pages - 1); push(pages);
    win.sort((a, b) => a - b);
    let html = btn("‹ Prev", page - 1, { disabled: page <= 1 });
    let prev = 0;
    for (const n of win) {
      if (n - prev > 1) html += `<span class="pg-gap">…</span>`;
      html += btn(String(n), n, { active: n === page });
      prev = n;
    }
    html += btn("Next ›", page + 1, { disabled: page >= pages });
    box.innerHTML = html;
    box.querySelectorAll(".pg").forEach((b) => {
      if (!b.disabled) b.addEventListener("click", () => { loadReviews(+b.dataset.page); scrollToReviews(); });
    });
  }
  function scrollToReviews() {
    $("#recent").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function openRemovedModal() {
    const m = $("#removedModal");
    m.hidden = false;
    document.body.style.overflow = "hidden";
    if (!recheckWired) {
      m.querySelectorAll(".recheck-btn").forEach((b) => b.addEventListener("click", () => recheck(+b.dataset.months, b)));
      recheckWired = true;
    }
    loadRemoved(1);
  }

  async function recheck(months, btn) {
    const status = $("#recheckStatus");
    const btns = container.querySelectorAll(".recheck-btn");
    btns.forEach((b) => (b.disabled = true));
    status.textContent = `Checking last ${months}m… (this can take a minute)`;
    try {
      const r = await (await apiFetch(`/tp/api/reconcile?months=${months}&${buQ()}`, { method: "POST" })).json();
      if (!r.ok) throw new Error(r.error || "failed");
      status.textContent = r.newlyRemoved || r.reappeared
        ? `Done: +${r.newlyRemoved} newly removed, ${r.reappeared} restored.`
        : "Done: no changes.";
      await refreshMeta();
      await load();
      await loadRemoved(1);
    } catch (e) {
      status.textContent = `Failed: ${e.message}`;
    } finally {
      btns.forEach((b) => (b.disabled = false));
    }
  }

  function closeRemovedModal() {
    $("#removedModal").hidden = true;
    document.body.style.overflow = "";
  }

  async function loadRemoved(page) {
    const mine = ++removedReq;
    $("#removedList").innerHTML = `<p class="loading">Loading…</p>`;
    $("#removedPager").innerHTML = "";
    const data = await (await apiFetch(`/tp/api/removed?${filterQuery()}&page=${page}&pageSize=${REMOVED_PAGE_SIZE}`)).json();
    if (mine !== removedReq) return;
    $("#removedHint").textContent = `${data.total.toLocaleString()} removed in this range`;
    renderRemovedStars(data.summary.byStar);
    renderRemovedList(data.rows);
    renderRemovedPager(data.page, data.pages);
  }

  function renderRemovedStars(byStar) {
    const box = $("#removedStars");
    let chips = "";
    for (let star = 5; star >= 1; star--) {
      const c = byStar[star] || 0;
      if (!c) continue;
      chips += `<span class="removed-chip" style="border-color:${starColor(star)}">${star}★ · ${c.toLocaleString()}</span>`;
    }
    box.innerHTML = chips;
  }

  function renderRemovedList(list) {
    const box = $("#removedList");
    if (!list.length) { box.innerHTML = `<p class="loading">None on this page.</p>`; return; }
    box.innerHTML = list.map((r) => `
      <div class="review removed">
        <div class="stars" style="color:${starColor(r.stars)}">${"★".repeat(r.stars)}${"☆".repeat(5 - r.stars)}</div>
        <div class="txt">${esc(r.text)}</div>
        <div class="when">posted ${r.createdAt.slice(0, 10)}${r.removedAt ? ` · removed by ${r.removedAt.slice(0, 10)}` : ""}</div>
        <div class="meta">${esc(r.reviewer)}${r.country ? " · " + r.country : ""}${r.replied ? " · replied" : ""}</div>
      </div>`).join("");
  }

  function renderRemovedPager(page, pages) {
    const box = $("#removedPager");
    if (pages <= 1) { box.innerHTML = ""; return; }
    const btn = (label, target, opts = {}) =>
      `<button class="pg${opts.active ? " active" : ""}" ${opts.disabled ? "disabled" : ""} data-page="${target}">${label}</button>`;
    const win = [];
    const push = (n) => { if (n >= 1 && n <= pages && !win.includes(n)) win.push(n); };
    push(1); push(2);
    for (let n = page - 1; n <= page + 1; n++) push(n);
    push(pages - 1); push(pages);
    win.sort((a, b) => a - b);
    let html = btn("‹ Prev", page - 1, { disabled: page <= 1 });
    let prev = 0;
    for (const n of win) {
      if (n - prev > 1) html += `<span class="pg-gap">…</span>`;
      html += btn(String(n), n, { active: n === page });
      prev = n;
    }
    html += btn("Next ›", page + 1, { disabled: page >= pages });
    box.innerHTML = html;
    box.querySelectorAll(".pg").forEach((b) => {
      if (!b.disabled) b.addEventListener("click", () => { loadRemoved(+b.dataset.page); $("#removedList").scrollIntoView({ behavior: "smooth", block: "nearest" }); });
    });
  }

  function setLoading() {
    $("#trendChart").innerHTML = `<p class="loading">Loading…</p>`;
    $("#kpis").style.opacity = "0.5";
  }

  function renderKpis(s, prev, removed) {
    const delta = (cur, was, decimals = 0) => {
      if (!prev || was == null || was === 0) return `<div class="delta flat">no prior period</div>`;
      const d = cur - was;
      const cls = d > 0 ? "up" : d < 0 ? "down" : "flat";
      const arrow = d > 0 ? "▲" : d < 0 ? "▼" : "▬";
      const sign = d > 0 ? "+" : "";
      return `<div class="delta ${cls}">${arrow} ${sign}${d.toFixed(decimals)} vs prev</div>`;
    };
    $("#kpis").className = "kpis";
    const rem = removed?.count || 0;
    const remFrom = removed?.trackingFrom
      ? new Date(removed.trackingFrom + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : "9 Jul 2026";
    const remAvailable = removed?.available === true;
    const remLabel = `<div class="label">Removed by TP <span class="info" id="removedInfo" tabindex="0" aria-label="How removed-review tracking works">ⓘ</span></div>`;
    const removedCard = remAvailable
      ? `<div class="kpi kpi-removed${rem ? " clickable" : ""}" ${rem ? 'id="removedCard" title="View the removed reviews"' : ""}>
        ${remLabel}
        <div class="value">${rem.toLocaleString()}</div>
        <div class="delta flat">${rem ? "click to view" : "none in range"}</div></div>`
      : `<div class="kpi kpi-removed" title="Set the start date to ${remFrom} or a later date to see removed reviews.">
        ${remLabel}
        <div class="value na">—</div>
        <div class="delta flat">Set start date to ${remFrom} or later to see data</div></div>`;
    const live = s.live != null ? s.live : s.count;
    const isAllTime = dateSel.kind === "all";
    const tpScore = tpMeta.trustScore != null ? tpMeta.trustScore.toFixed(1) : s.average.toFixed(2);
    const reviewsVal = isAllTime && tpMeta.total != null ? tpMeta.total : live;
    const reviewsSub = isAllTime && tpMeta.total != null
      ? `<div class="delta flat">from Trustpilot</div>`
      : delta(live, prev?.count, 0);
    $("#kpis").innerHTML = `
      <div class="kpi"><div class="label">TrustScore</div>
        <div class="value">${tpScore} <small>/ 5</small></div>
        <div class="delta flat">official Trustpilot score</div></div>
      <div class="kpi"><div class="label">Reviews</div>
        <div class="value">${reviewsVal.toLocaleString()}</div>
        ${reviewsSub}</div>
      ${removedCard}
      <div class="kpi"><div class="label">5-star share</div>
        <div class="value">${pct(s.distribution[4], s.count)}<small>%</small></div>
        <div class="delta flat">${s.distribution[4].toLocaleString()} reviews</div></div>
      <div class="kpi"><div class="label">Company reply rate</div>
        <div class="value">${s.respondedPct}<small>%</small></div>
        <div class="delta flat">of reviews in range</div></div>`;
    $("#kpis").style.opacity = "1";
    const card = $("#removedCard");
    if (card) card.addEventListener("click", openRemovedModal);
    const rInfo = $("#removedInfo");
    if (rInfo) {
      const t = `<b>Removed by Trustpilot</b><br>`
        + `Of the reviews <b>posted in the selected period</b>, this is how many Trustpilot has since removed.<br><br>`
        + `We began tracking removals around <b>${remFrom}</b>. Set start date to ${remFrom} or later to see data.`;
      const show = (e) => showTip(e, t);
      rInfo.addEventListener("mousemove", show);
      rInfo.addEventListener("mouseenter", show);
      rInfo.addEventListener("mouseleave", hideTip);
      rInfo.addEventListener("click", (e) => { e.stopPropagation(); show(e); });
    }
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  function renderTrend(t) {
    $("#trendHint").textContent = t.points.length
      ? `${{ day: 'daily', week: 'weekly', month: 'monthly' }[t.granularity] ?? `${t.granularity}ly`} · ${t.points.length} points`
      : "no data";
    const box = $("#trendChart");
    const pts = t.points;
    if (!pts.length) { box.innerHTML = `<p class="loading">No reviews in range.</p>`; return; }

    const W = 720, H = 240, pad = { l: 34, r: 14, t: 14, b: 26 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const yMin = 1, yMax = 5;
    const x = (i) => pad.l + (pts.length === 1 ? iw / 2 : (i / (pts.length - 1)) * iw);
    const y = (v) => pad.t + ih - ((v - yMin) / (yMax - yMin)) * ih;

    let grid = "";
    for (let v = 1; v <= 5; v++) {
      grid += `<line x1="${pad.l}" y1="${y(v)}" x2="${W - pad.r}" y2="${y(v)}" stroke="var(--border)" stroke-width="1"/>`;
      grid += `<text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v}</text>`;
    }
    const line = pts.map((p, i) => `${x(i)},${y(p.average)}`).join(" ");
    const area = `${pad.l},${y(yMin)} ${line} ${x(pts.length - 1)},${y(yMin)}`;
    const step = Math.ceil(pts.length / 6);
    let xlabels = "";
    pts.forEach((p, i) => {
      if (i % step === 0 || i === pts.length - 1)
        xlabels += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--muted)">${p.label}</text>`;
    });
    const dots = pts.map((p, i) =>
      `<circle cx="${x(i)}" cy="${y(p.average)}" r="3.5" fill="var(--surface)" stroke="var(--accent)" stroke-width="2"
         data-i="${i}" class="pt"/>`).join("");

    box.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Average rating over time">
        <defs><linearGradient id="tp-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="var(--accent)" stop-opacity="0.18"/>
          <stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
        ${grid}
        <polygon points="${area}" fill="url(#tp-fill)"/>
        <polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
        ${dots}${xlabels}
      </svg>`;

    box.querySelectorAll(".pt").forEach((el) => {
      el.addEventListener("mousemove", (e) => {
        const p = pts[+el.dataset.i];
        showTip(e, `<b>${p.label}</b><br>Avg ${p.average.toFixed(2)}★ · ${p.count} reviews`);
      });
      el.addEventListener("mouseleave", hideTip);
    });
  }

  function renderDist(s) {
    const box = $("#distChart");
    const colors = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"];
    const max = Math.max(1, ...s.distribution);
    let rows = "";
    for (let star = 5; star >= 1; star--) {
      const c = s.distribution[star - 1];
      const w = Math.round((c / max) * 100);
      const on = starFilter.has(star);
      rows += `
        <div class="theme-row dist-row${on ? "" : " off"}" data-star="${star}" data-count="${c}">
          <div class="name"><label><input type="checkbox" class="star-cb" data-star="${star}" ${on ? "checked" : ""}> ${"★".repeat(star)}</label></div>
          <div class="cnt">${c.toLocaleString()} · ${pct(c, s.count)}%</div>
          <div class="bar"><span style="width:${w}%;background:${colors[star - 1]}"></span></div>
        </div>`;
    }
    const all = starFilter.size >= 5 || starFilter.size === 0;
    const note = all
      ? "Showing all ratings. Untick to filter the dashboard."
      : `Filtering dashboard to ${[...starFilter].sort((a, b) => b - a).map((n) => n + "★").join(", ")}`;
    box.innerHTML = `<div class="themes">${rows}</div><div class="dist-note">${note}</div>`;

    box.querySelectorAll(".star-cb").forEach((cb) => {
      cb.addEventListener("change", () => {
        const star = +cb.dataset.star;
        if (cb.checked) starFilter.add(star); else starFilter.delete(star);
        if (starFilter.size === 0) starFilter = new Set([1, 2, 3, 4, 5]);
        load();
      });
    });
    box.querySelectorAll(".dist-row").forEach((el) => {
      el.addEventListener("mousemove", (e) =>
        showTip(e, `<b>${el.dataset.star}★</b><br>${(+el.dataset.count).toLocaleString()} reviews`));
      el.addEventListener("mouseleave", hideTip);
    });
  }

  function renderThemes(sel, list, color) {
    const box = $(sel);
    if (!list.length) { box.innerHTML = `<p class="loading">No reviews in range.</p>`; return; }
    const max = Math.max(...list.map((t) => t.count));
    box.innerHTML = list.slice(0, 6).map((t) => `
      <div class="theme-row">
        <div class="name">${esc(t.theme)}</div>
        <div class="cnt">${t.count.toLocaleString()}</div>
        <div class="bar"><span style="width:${Math.round((t.count / max) * 100)}%;background:${color}"></span></div>
      </div>`).join("");
  }

  function renderNegThemes(list) {
    const box = $("#negThemes");
    if (!list.length) { box.innerHTML = `<p class="loading">No reviews in range.</p>`; themeFilter.clear(); return; }
    const max = Math.max(...list.map((t) => t.count));
    const visible = new Set(list.map((t) => t.theme));
    for (const t of [...themeFilter]) if (!visible.has(t)) themeFilter.delete(t);
    box.innerHTML = list.slice(0, 6).map((t) => {
      const on = themeFilter.has(t.theme);
      const d = t.deltaPct;
      const trend = d == null ? `<span class="tdelta flat">new</span>`
        : d > 0 ? `<span class="tdelta up">▲ ${d}%</span>`
        : d < 0 ? `<span class="tdelta down">▼ ${Math.abs(d)}%</span>`
        : `<span class="tdelta flat">0%</span>`;
      return `
        <div class="theme-row neg-row" data-theme="${esc(t.theme)}">
          <div class="name"><label><input type="checkbox" class="theme-cb" data-theme="${esc(t.theme)}" ${on ? "checked" : ""}> ${esc(t.theme)}</label></div>
          <div class="cnt">${t.count.toLocaleString()} ${trend}</div>
          <div class="bar"><span style="width:${Math.round((t.count / max) * 100)}%;background:var(--s1)"></span></div>
        </div>`;
    }).join("");
    box.querySelectorAll(".theme-cb").forEach((cb) => {
      cb.addEventListener("change", () => {
        const th = cb.dataset.theme;
        if (cb.checked) themeFilter.add(th); else themeFilter.delete(th);
        loadReviews(1);
        scrollToReviews();
      });
    });
  }

  function renderRecent(list) {
    const box = $("#recent");
    if (!list.length) { box.innerHTML = `<p class="loading">No reviews in range.</p>`; return; }
    box.innerHTML = list.map((r) => `
      <div class="review">
        <div class="stars" style="color:${starColor(r.stars)}">${"★".repeat(r.stars)}${"☆".repeat(5 - r.stars)}</div>
        <div class="txt">${esc(r.text)}</div>
        <div class="when">${r.createdAt.slice(0, 10)}</div>
        <div class="meta">${esc(r.reviewer)}${r.country ? " · " + r.country : ""}${r.replied ? " · replied" : ""}</div>
      </div>`).join("");
  }

  const starColor = (s) => ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"][s - 1];

  function esc(s) {
    return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  function showTip(e, html) {
    tip.innerHTML = html;
    tip.hidden = false;
    const pad = 14;
    let tx = e.clientX + pad, ty = e.clientY + pad;
    const r = tip.getBoundingClientRect();
    if (tx + r.width > innerWidth) tx = e.clientX - r.width - pad;
    if (ty + r.height > innerHeight) ty = e.clientY - r.height - pad;
    tip.style.left = tx + "px";
    tip.style.top = ty + "px";
  }
  function hideTip() { tip.hidden = true; }

  // kick off
  wire();
  bootstrap();

  // cleanup: remove keydown listener added for Escape-to-close-modal
  const escHandler = (e) => {
    if (e.key === "Escape" && !$("#removedModal")?.hidden) closeRemovedModal();
  };
  document.addEventListener("keydown", escHandler);

  return () => {
    document.removeEventListener("keydown", escHandler);
    if (tip) tip.hidden = true;
    document.body.style.overflow = "";
  };
}
