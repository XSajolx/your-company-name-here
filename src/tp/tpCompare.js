// Container-scoped version of backend/trustpilot/public/compare.js for React embedding.
// Exports initTpCompare(container, token) → cleanup function.

export function initTpCompare(container, token) {
  const apiFetch = (url, opts = {}) => fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) }
  });

  const $ = (s) => container.querySelector(s);
  const iso = (d) => d.toISOString().slice(0, 10);
  const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

  const CMP_COLORS = ["#2f6df6", "#00b67a", "#f5a623", "#e0457b", "#8b5cf6", "#14b8c4"];
  let allUnits = [];
  let sel = new Set();
  let scoreByDomain = {};
  const unitInfo = (d) => allUnits.find((u) => u.domain === d);
  const labelFor = (d) => unitInfo(d)?.label || d;
  const colorFor = (d) => {
    const i = allUnits.findIndex((u) => u.domain === d);
    return CMP_COLORS[(i < 0 ? 0 : i) % CMP_COLORS.length];
  };
  const rangeQuery = () => {
    const from = $("#from")?.value || "";
    const to = $("#to")?.value || "";
    return `from=${from}&to=${to}`;
  };

  let reqId = 0;

  function wirePresets() {
    $("#presets").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      container.querySelectorAll("#presets button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      const fromEl = $("#from"), toEl = $("#to");
      if (b.hasAttribute("data-all")) { fromEl.value = ""; toEl.value = ""; }
      else { fromEl.value = iso(daysAgo(+b.dataset.days - 1)); toEl.value = iso(new Date()); }
      load();
    });
    [$("#from"), $("#to")].forEach((el) => el && el.addEventListener("change", () => {
      container.querySelectorAll("#presets button").forEach((x) => x.classList.remove("active"));
      load();
    }));
  }

  function renderChecks() {
    const box = $("#compareChecks");
    box.innerHTML = allUnits.map((u) => {
      const on = sel.has(u.domain);
      return `<label class="cp-check${on ? " on" : ""}">
        <input type="checkbox" data-bu="${u.domain}" ${on ? "checked" : ""}>
        <span class="sw" style="background:${colorFor(u.domain)}"></span>${esc(u.label)}</label>`;
    }).join("");
    box.querySelectorAll("input").forEach((cb) => cb.addEventListener("change", () => {
      const d = cb.dataset.bu;
      if (cb.checked) sel.add(d); else sel.delete(d);
      renderChecks();
      load();
    }));
  }

  async function load() {
    const units = allUnits.map((u) => u.domain).filter((d) => sel.has(d));
    $("#hint").textContent = units.length < 2 ? "Select at least 2 units to compare." : `Comparing ${units.length} units`;
    if (units.length < 2) {
      $("#kpis").innerHTML = `<p class="loading">Pick at least two units above to compare.</p>`;
      $("#trendChart").innerHTML = $("#distChart").innerHTML = "";
      $("#negThemes").innerHTML = $("#posThemes").innerHTML = "";
      return;
    }
    const mine = ++reqId;
    showSkeleton();
    const rq = rangeQuery();
    const results = await Promise.all(units.map((d) =>
      apiFetch(`/tp/api/summary?${rq}&bu=${encodeURIComponent(d)}`).then((r) => r.json())
        .then((data) => ({ domain: d, label: labelFor(d), color: colorFor(d), data }))
    ));
    if (mine !== reqId) return;
    renderKpis(results);
    renderTrend(results);
    renderDist(results);
    renderThemes(results);
  }

  function showSkeleton() {
    $("#kpis").innerHTML = `<p class="loading">Loading comparison…</p>`;
    $("#trendChart").innerHTML = `<div class="sk-block"></div>`;
    $("#distChart").innerHTML = `<p class="loading">Loading…</p>`;
    $("#negThemes").innerHTML = $("#posThemes").innerHTML = `<p class="loading">Loading…</p>`;
  }

  const legendHtml = (series) =>
    `<div class="cmp-legend">${series.map((s) => `<span><span class="sw" style="background:${s.color}"></span>${esc(s.label)}</span>`).join("")}</div>`;

  function renderKpis(results) {
    const p = (a, b) => (b ? Math.round((a / b) * 100) : 0);
    const metrics = [
      { name: "Trustpilot score", val: (r) => scoreByDomain[r.domain], fmt: (v) => v == null ? "—" : v.toFixed(1), best: "max", sub: "official, recency-weighted" },
      { name: "Average rating (mean)", val: (r) => r.data.summary.average, fmt: (v) => v.toFixed(2), best: "max" },
      { name: "Reviews", val: (r) => r.data.summary.count, fmt: (v) => v.toLocaleString(), best: "max" },
      { name: "5★ share", val: (r) => p(r.data.summary.distribution[4], r.data.summary.count), fmt: (v) => v + "%", best: "max" },
      { name: "1★ share", val: (r) => p(r.data.summary.distribution[0], r.data.summary.count), fmt: (v) => v + "%", best: "min" },
      { name: "Company reply rate", val: (r) => r.data.summary.respondedPct, fmt: (v) => v + "%", best: "max" },
    ];
    const head = `<tr><th></th>${results.map((r) => `<th><span class="sw" style="background:${r.color}"></span>${esc(r.label)}</th>`).join("")}</tr>`;
    const body = metrics.map((m) => {
      const vals = results.map(m.val);
      const nums = vals.filter((v) => typeof v === "number" && !isNaN(v));
      const target = nums.length ? (m.best === "max" ? Math.max(...nums) : Math.min(...nums)) : null;
      const cells = results.map((r, i) =>
        `<td class="${target != null && vals[i] === target && nums.length > 1 ? "cmp-best" : ""}"><b>${m.fmt(vals[i])}</b></td>`).join("");
      const label = m.sub ? `${m.name}<span class="cmp-sub">${m.sub}</span>` : m.name;
      return `<tr><td>${label}</td>${cells}</tr>`;
    }).join("");
    $("#kpis").innerHTML = `<table class="cmp-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
  }

  function renderTrend(results) {
    const box = $("#trendChart");
    const series = results.map((r) => ({ label: r.label, color: r.color, points: r.data.trend.points || [] }));
    const gran = results[0]?.data.trend.granularity || "month";
    const labelSet = new Set();
    series.forEach((s) => s.points.forEach((pt) => labelSet.add(pt.label)));
    const labels = [...labelSet].sort();
    $("#trendHint").textContent = labels.length ? `${gran}ly · ${series.length} units` : "no data";
    if (!labels.length) { box.innerHTML = `<p class="loading">No reviews in range.</p>`; return; }
    const idx = new Map(labels.map((l, i) => [l, i]));
    const W = 720, H = 240, pad = { l: 34, r: 14, t: 14, b: 26 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const x = (i) => pad.l + (labels.length === 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
    const y = (v) => pad.t + ih - ((v - 1) / 4) * ih;
    let grid = "";
    for (let v = 1; v <= 5; v++) {
      grid += `<line x1="${pad.l}" y1="${y(v)}" x2="${W - pad.r}" y2="${y(v)}" stroke="var(--border)" stroke-width="1"/>`;
      grid += `<text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v}</text>`;
    }
    let lines = "", dots = "";
    series.forEach((s) => {
      const pts = s.points.filter((pt) => idx.has(pt.label)).sort((a, b) => idx.get(a.label) - idx.get(b.label));
      if (!pts.length) return;
      lines += `<polyline points="${pts.map((pt) => `${x(idx.get(pt.label))},${y(pt.average)}`).join(" ")}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`;
      dots += pts.map((pt) =>
        `<circle cx="${x(idx.get(pt.label))}" cy="${y(pt.average)}" r="2.6" fill="${s.color}"><title>${esc(s.label)} · ${pt.label} · ${pt.average.toFixed(2)}★ · ${pt.count} reviews</title></circle>`).join("");
    });
    const step = Math.ceil(labels.length / 6);
    let xlabels = "";
    labels.forEach((l, i) => {
      if (i % step === 0 || i === labels.length - 1)
        xlabels += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--muted)">${l}</text>`;
    });
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Average rating over time by unit">${grid}${lines}${dots}${xlabels}</svg>${legendHtml(series)}`;
  }

  function renderDist(results) {
    let html = `<div class="cmp-dist">`;
    for (let star = 5; star >= 1; star--) {
      html += `<div class="grp"><div class="grp-h" style="color:${starColor(star)}">${"★".repeat(star)}</div>`;
      results.forEach((r) => {
        const c = r.data.summary.distribution[star - 1], tot = r.data.summary.count;
        const pv = tot ? (c / tot) * 100 : 0;
        html += `<div class="gbar"><span class="glabel">${esc(r.label)}</span>
          <div class="track"><span style="width:${pv.toFixed(1)}%;background:${r.color}"></span></div>
          <span class="gval">${pv.toFixed(1)}%</span></div>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
    $("#distChart").innerHTML = html;
  }

  function renderThemes(results) {
    const build = (key) => `<div class="cmp-themes">${results.map((r) => {
      const list = (r.data[key] || []).slice(0, 5);
      const rows = list.length
        ? list.map((t) => `<div class="trow"><span class="tn">${esc(t.theme)}</span><span class="tc">${t.count.toLocaleString()}</span></div>`).join("")
        : `<div class="trow"><span class="tn">—</span></div>`;
      return `<div class="col"><h4><span class="sw" style="background:${r.color}"></span>${esc(r.label)}</h4>${rows}</div>`;
    }).join("")}</div>`;
    $("#negThemes").innerHTML = build("negativeThemes");
    $("#posThemes").innerHTML = build("positiveThemes");
  }

  const starColor = (s) => ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"][s - 1];
  function esc(s) {
    return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // init
  async function init() {
    wirePresets();
    const m = await (await apiFetch("/tp/api/meta")).json();
    allUnits = m.units || [];
    scoreByDomain = Object.fromEntries(allUnits.map((u) => [u.domain, u.trustScore]));
    sel = new Set(allUnits.map((u) => u.domain));
    const fromEl = $("#from"), toEl = $("#to");
    if (fromEl) fromEl.max = iso(new Date());
    if (toEl) toEl.max = iso(new Date());
    renderChecks();
    load();
  }

  init();

  return () => {};
}
