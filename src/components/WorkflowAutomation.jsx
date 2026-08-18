import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

/* ------------------------------------------------------------------ */
/*  Constants & helpers                                                */
/* ------------------------------------------------------------------ */
const API_URL = '/api/analyze-topics';
const DHAKA_MS = 6 * 3600000;
const LS_KEY_POSITIONS = 'wf-node-positions';
const LS_KEY_EDGES = 'wf-edges';
const LS_KEY_SCHEDULE = 'wf-schedule-time';

const getYesterdayDhaka = () => {
  const nowDhaka = new Date(Date.now() + DHAKA_MS);
  const yesterday = new Date(nowDhaka);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().slice(0, 10);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const parseJson = async (response) => {
  const text = await response.text();
  if (!text || !text.trim()) throw new Error('API returned no data.');
  try { return JSON.parse(text); }
  catch { throw new Error('API returned invalid JSON.'); }
};

const STATUS = { idle: 'idle', running: 'running', success: 'success', error: 'error', pending: 'pending' };

/* ------------------------------------------------------------------ */
/*  Node definitions                                                   */
/* ------------------------------------------------------------------ */
const NODE_DEFS = [
  { id: 'schedule',     title: 'Schedule Trigger',          color: '#A78BFA', icon: 'clock' },
  { id: 'csat-sync',    title: 'Sync CSAT Ratings',         color: '#10B981', icon: 'star' },
  { id: 'fin-sync',     title: 'Sync FIN Data',             color: '#F59E0B', icon: 'fin' },
  { id: 'conv-sync',    title: 'Sync Conversations (SPO)',  color: '#3B82F6', icon: 'chat' },
  { id: 'spo-enrich',   title: 'Enrich SPO (FRT/ART/AHT)', color: '#8B5CF6', icon: 'enrich' },
  { id: 'email-sync',   title: 'Sync Email Replies',        color: '#EC4899', icon: 'email' },
  { id: 'tickets-sync', title: 'Sync Tickets Dataset',      color: '#8B5CF6', icon: 'ticket' },
  { id: 'ticket-enrich',title: 'Enrich Tickets',            color: '#14B8A6', icon: 'wrench' },
  { id: 'csat-classify', title: 'CSAT Classification',      color: '#F59E0B', icon: 'brain' },
];

const defaultPositions = () => {
  const cols = 3, gapX = 310, gapY = 140, startX = 50, startY = 40;
  const pos = {};
  NODE_DEFS.forEach((n, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    pos[n.id] = { x: startX + col * gapX, y: startY + row * gapY };
  });
  return pos;
};

const defaultEdges = () => NODE_DEFS.slice(0, -1).map((n, i) => ({ from: n.id, to: NODE_DEFS[i + 1].id }));

const loadJSON = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback(); } catch { return fallback(); } };

/* ------------------------------------------------------------------ */
/*  SVG Icons (inline, no deps)                                        */
/* ------------------------------------------------------------------ */
const SvgIcon = ({ type, size = 18 }) => {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (type) {
    case 'clock': return <svg {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
    case 'star': return <svg {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
    case 'fin': return <svg {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
    case 'chat': return <svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
    case 'enrich': return <svg {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
    case 'email': return <svg {...p}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>;
    case 'ticket': return <svg {...p}><path d="M3 7v2a3 3 0 0 1 3 3 3 3 0 0 1-3 3v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1-3-3 3 3 0 0 1 3-3V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/></svg>;
    case 'wrench': return <svg {...p}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>;
    case 'brain': return <svg {...p}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
    case 'play': return <svg {...p}><polygon points="5 3 19 12 5 21 5 3"/></svg>;
    case 'stop': return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>;
    case 'zoomIn': return <svg {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>;
    case 'zoomOut': return <svg {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>;
    case 'maximize': return <svg {...p}><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>;
    case 'refresh': return <svg {...p}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>;
    case 'trash': return <svg {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
    case 'check': return <svg {...p}><polyline points="20 6 9 17 4 12"/></svg>;
    case 'x': return <svg {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
    case 'alert': return <svg {...p}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
    case 'loader': return <svg {...p} className="wf-spin"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>;
    default: return null;
  }
};

/* ------------------------------------------------------------------ */
/*  Bezier helpers                                                     */
/* ------------------------------------------------------------------ */
const NODE_W = 240, NODE_H = 80;
const connectorOut = (pos) => ({ x: pos.x + NODE_W, y: pos.y + NODE_H / 2 });
const connectorIn  = (pos) => ({ x: pos.x,          y: pos.y + NODE_H / 2 });

const bezierPath = (x1, y1, x2, y2) => {
  // If target is roughly to the right, simple horizontal bezier
  if (x2 > x1 + 20) {
    const dx = Math.abs(x2 - x1) * 0.4;
    return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
  }
  // If target is below or to the left (row transition), route down then across
  const midY = (y1 + y2) / 2;
  return `M${x1},${y1} C${x1 + 60},${y1} ${x1 + 60},${midY} ${(x1 + x2) / 2},${midY} S${x2 - 60},${y2} ${x2},${y2}`;
};

/* ------------------------------------------------------------------ */
/*  Execution logic for each node                                      */
/* ------------------------------------------------------------------ */
const postAPI = async (body) => {
  const resp = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return parseJson(resp);
};

const pollUntilDone = async (action, jobId, addLog, stopRef) => {
  const isDone = (s) => s === 'complete' || s === 'completed';
  let status = 'pending';
  while (!isDone(status) && status !== 'failed') {
    if (stopRef.current) throw new Error('Stopped by user');
    await sleep(5000);
    addLog(`  Polling ${action}... status: ${status}`);
    const r = await postAPI({ action, jobId });
    if (!r.success) throw new Error(r.error || `${action} failed`);
    status = r.status || 'unknown';
  }
  if (status === 'failed') throw new Error(`Job ${jobId} failed`);
  return status;
};

const buildExecutors = (dateFrom, dateTo, addLog, stopRef) => ({
  'schedule': async () => { addLog('Schedule trigger fired.'); },

  'csat-sync': async () => {
    addLog('Enqueuing CSAT export...');
    const enq = await postAPI({ action: 'csat-enqueue', dateFrom, dateTo });
    if (!enq.success) throw new Error(enq.error || 'csat-enqueue failed');
    const jobId = enq.jobId;
    addLog(`Job ${jobId} created. Polling...`);
    await pollUntilDone('csat-poll', jobId, addLog, stopRef);
    addLog('Downloading & importing CSAT data...');
    const dl = await postAPI({ action: 'csat-download-import', jobId });
    if (!dl.success) throw new Error(dl.error || 'csat-download-import failed');
    addLog(`CSAT sync done. Imported: ${dl.imported ?? 'N/A'}`);
  },

  'fin-sync': async () => {
    addLog('Enqueuing FIN (Intercom Topic) export...');
    const enq = await postAPI({ action: 'it-enqueue', dateFrom, dateTo });
    if (!enq.success) throw new Error(enq.error || 'it-enqueue failed');
    const jobId = enq.jobId;
    addLog(`Job ${jobId} created. Polling...`);
    await pollUntilDone('it-poll', jobId, addLog, stopRef);
    addLog('Downloading & importing FIN data...');
    const dl = await postAPI({ action: 'it-download-import', jobId });
    if (!dl.success) throw new Error(dl.error || 'it-download-import failed');
    addLog(`FIN sync done. Imported: ${dl.imported ?? 'N/A'}`);
  },

  'conv-sync': async () => {
    addLog('Enqueuing Conversation Dataset export...');
    const enq = await postAPI({ action: 'cd-enqueue', dateFrom, dateTo });
    if (!enq.success) throw new Error(enq.error || 'cd-enqueue failed');
    const jobId = enq.jobId;
    addLog(`Job ${jobId} created. Polling...`);
    await pollUntilDone('ca-poll', jobId, addLog, stopRef);
    addLog('Downloading & importing conversations...');
    const dl = await postAPI({ action: 'cd-download-import', jobId });
    if (!dl.success) throw new Error(dl.error || 'cd-download-import failed');
    addLog(`Conversations sync done. Imported: ${dl.imported ?? 'N/A'}, movedToSpo: ${dl.movedToSpo ?? 0}`);
  },

  'spo-enrich': async () => {
    let remaining = Infinity, iterations = 0, consecutiveErrors = 0;
    while (remaining > 0) {
      if (stopRef.current) throw new Error('Stopped by user');
      iterations++;
      addLog(`Batch ${iterations}: Processing up to 50 conversations (5 parallel)...`);
      const r = await postAPI({ action: 'spo-enrich', batchSize: 50 });
      if (!r.success) {
        consecutiveErrors++;
        addLog(`  ⚠️ Error: ${r.error || 'unknown'}`);
        if (consecutiveErrors >= 3) throw new Error('3 consecutive failures — stopping');
        await sleep(5000);
        continue;
      }
      consecutiveErrors = 0;
      remaining = r.remaining ?? 0;
      addLog(`  ✅ Enriched: ${r.enriched ?? 0}, errors: ${(r.errors || []).length}, remaining: ${remaining}`);
      if (remaining > 0) await sleep(3000);
    }
    addLog(`SPO enrich complete after ${iterations} batches.`);
  },

  'email-sync': async () => {
    addLog('Enqueuing Email Dataset export...');
    const enq = await postAPI({ action: 'email-dataset-enqueue', dateFrom, dateTo });
    if (!enq.success) throw new Error(enq.error || 'email-dataset-enqueue failed');
    const jobId = enq.jobId;
    addLog(`Job ${jobId} created. Polling...`);
    await pollUntilDone('email-dataset-poll', jobId, addLog, stopRef);
    addLog('Importing email data...');
    const dl = await postAPI({ action: 'email-dataset-import', jobId });
    if (!dl.success) throw new Error(dl.error || 'email-dataset-import failed');
    addLog(`Email sync done. Imported: ${dl.imported ?? 'N/A'}`);
  },

  'tickets-sync': async () => {
    addLog('Enqueuing Tickets Dataset export...');
    const enq = await postAPI({ action: 'tickets-dataset-enqueue', dateFrom, dateTo });
    if (!enq.success) throw new Error(enq.error || 'tickets-dataset-enqueue failed');
    const jobId = enq.jobId;
    addLog(`Job ${jobId} created. Polling...`);
    await pollUntilDone('tickets-dataset-poll', jobId, addLog, stopRef);
    addLog('Importing tickets data...');
    const dl = await postAPI({ action: 'tickets-dataset-import', jobId });
    if (!dl.success) throw new Error(dl.error || 'tickets-dataset-import failed');
    addLog(`Tickets sync done. Imported: ${dl.imported ?? 'N/A'}`);
  },

  'ticket-enrich': async () => {
    addLog('Enriching tickets (single batch call)...');
    const r = await postAPI({ action: 'ticket-sync', batchSize: 250 });
    if (!r.success) throw new Error(r.error || 'ticket-sync failed');
    addLog(`Ticket enrich done. Synced: ${r.synced ?? r.processed ?? 'N/A'}`);
  },

  'csat-classify': async () => {
    // Pass 1: GPT-5.4-mini (cheap)
    addLog('Pass 1: Submitting CSAT batch (GPT-5.4-mini)...');
    const sub1 = await postAPI({ action: 'csat-batch-submit', batchSize: 100, model: 'gpt-5.4-mini' });
    if (!sub1.success) throw new Error(sub1.error || 'csat-batch-submit failed');
    const batchId1 = sub1.batchId;
    addLog(`Batch ${batchId1} submitted (${sub1.submitted} items). Polling...`);
    let status1 = 'validating';
    while (status1 !== 'completed' && status1 !== 'failed' && status1 !== 'expired' && status1 !== 'cancelled') {
      if (stopRef.current) throw new Error('Stopped by user');
      await sleep(5000);
      const r = await postAPI({ action: 'csat-batch-poll', batchId: batchId1 });
      if (!r.success) throw new Error(r.error || 'poll failed');
      status1 = r.status || 'unknown';
      addLog(`  Pass 1 status: ${status1}`);
    }
    if (status1 !== 'completed') throw new Error(`Pass 1 ended: ${status1}`);
    const proc1 = await postAPI({ action: 'csat-batch-process', batchId: batchId1 });
    if (!proc1.success) throw new Error(proc1.error || 'process failed');
    addLog(`Pass 1 done: ${proc1.updated} classified, ${proc1.noneCount || 0} returned "None"`);

    // Pass 2: re-run "None" results through gpt-5.4-mini
    if (proc1.noneCount > 0) {
      addLog(`Pass 2: Escalating ${proc1.noneCount} "None" results to GPT-5.4-mini...`);
      const sub2 = await postAPI({ action: 'csat-batch-submit', batchSize: proc1.noneCount, model: 'gpt-5.4-mini' });
      if (!sub2.success || sub2.submitted === 0) {
        addLog('Pass 2: No items to escalate or submit failed.');
      } else {
        const batchId2 = sub2.batchId;
        addLog(`Batch ${batchId2} submitted (${sub2.submitted} items). Polling...`);
        let status2 = 'validating';
        while (status2 !== 'completed' && status2 !== 'failed' && status2 !== 'expired' && status2 !== 'cancelled') {
          if (stopRef.current) throw new Error('Stopped by user');
          await sleep(5000);
          const r = await postAPI({ action: 'csat-batch-poll', batchId: batchId2 });
          if (!r.success) throw new Error(r.error || 'poll failed');
          status2 = r.status || 'unknown';
          addLog(`  Pass 2 status: ${status2}`);
        }
        if (status2 === 'completed') {
          const proc2 = await postAPI({ action: 'csat-batch-process', batchId: batchId2 });
          addLog(`Pass 2 done: ${proc2.updated || 0} classified by GPT-5.4-mini`);
        }
      }
    }
    addLog('CSAT classification complete (two-pass).');
  },
});

/* ================================================================== */
/*  COMPONENT                                                          */
/* ================================================================== */
export default function WorkflowAutomation() {
  /* ----- state ----- */
  const [positions, setPositions] = useState(() => loadJSON(LS_KEY_POSITIONS, defaultPositions));
  const [edges, setEdges] = useState(() => loadJSON(LS_KEY_EDGES, defaultEdges));
  const [scheduleTime, setScheduleTime] = useState(() => localStorage.getItem(LS_KEY_SCHEDULE) || '03:00');
  const [nodeStatus, setNodeStatus] = useState(() => Object.fromEntries(NODE_DEFS.map((n) => [n.id, STATUS.idle])));
  const [selectedNode, setSelectedNode] = useState(null);
  const [logs, setLogs] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [dateFrom, setDateFrom] = useState(getYesterdayDhaka);
  const [dateTo, setDateTo] = useState(getYesterdayDhaka);

  /* canvas transform */
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  /* drag state (refs to avoid re-render during drag) */
  const draggingRef = useRef(null);       // { nodeId, offsetX, offsetY }
  const panningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panOriginRef = useRef({ x: 0, y: 0 });

  /* connection drawing */
  const [drawingEdge, setDrawingEdge] = useState(null); // { from, mx, my }

  const stopRef = useRef(false);
  const canvasRef = useRef(null);
  const logEndRef = useRef(null);

  /* persist */
  useEffect(() => { localStorage.setItem(LS_KEY_POSITIONS, JSON.stringify(positions)); }, [positions]);
  useEffect(() => { localStorage.setItem(LS_KEY_EDGES, JSON.stringify(edges)); }, [edges]);
  useEffect(() => { localStorage.setItem(LS_KEY_SCHEDULE, scheduleTime); }, [scheduleTime]);

  /* auto-scroll log */
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  /* ----- add log helper ----- */
  const addLog = useCallback((msg) => {
    const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
    setLogs((prev) => [...prev, `[${ts}] ${msg}`]);
  }, []);

  /* ----- execution order: only nodes reachable from Schedule Trigger via edges ----- */
  const getExecutionOrder = useCallback(() => {
    const adj = {};
    NODE_DEFS.forEach((n) => { adj[n.id] = []; });
    edges.forEach(({ from, to }) => { adj[from].push(to); });
    // BFS from Schedule Trigger (first node) — only reachable nodes run
    const visited = new Set();
    const queue = ['schedule'];
    visited.add('schedule');
    const order = ['schedule'];
    while (queue.length) {
      const cur = queue.shift();
      for (const next of (adj[cur] || [])) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
          order.push(next);
        }
      }
    }
    return order;
  }, [edges]);

  /* ----- Run All ----- */
  const runAll = useCallback(async () => {
    setIsRunning(true);
    stopRef.current = false;
    setLogs([]);
    const order = getExecutionOrder();
    const reachable = new Set(order);
    const status = {};
    NODE_DEFS.forEach((n) => { status[n.id] = reachable.has(n.id) ? STATUS.pending : STATUS.idle; });
    setNodeStatus({ ...status });

    const executors = buildExecutors(dateFrom, dateTo, addLog, stopRef);

    for (const nodeId of order) {
      if (stopRef.current) { addLog('--- Execution stopped by user ---'); break; }
      status[nodeId] = STATUS.running;
      setNodeStatus({ ...status });
      addLog(`--- Running: ${NODE_DEFS.find((n) => n.id === nodeId)?.title} ---`);
      try {
        await executors[nodeId]();
        status[nodeId] = STATUS.success;
      } catch (err) {
        status[nodeId] = STATUS.error;
        addLog(`ERROR: ${err.message}`);
        // Continue to next node even on error
      }
      setNodeStatus({ ...status });
    }
    addLog('=== Workflow finished ===');
    setIsRunning(false);
  }, [dateFrom, dateTo, addLog, getExecutionOrder]);

  const stopRun = useCallback(() => { stopRef.current = true; addLog('Stop requested...'); }, [addLog]);

  /* ----- Canvas mouse handlers ----- */
  const getCanvasPoint = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: (e.clientX - rect.left - pan.x) / zoom, y: (e.clientY - rect.top - pan.y) / zoom };
  }, [pan, zoom]);

  const onMouseDown = useCallback((e) => {
    // Only pan on primary button click on the canvas background
    if (e.button !== 0) return;
    if (e.target === canvasRef.current || e.target.tagName === 'svg' || e.target.classList?.contains('wf-canvas-bg')) {
      panningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY };
      panOriginRef.current = { ...pan };
      setSelectedNode(null);
    }
  }, [pan]);

  const onMouseMove = useCallback((e) => {
    if (panningRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPan({ x: panOriginRef.current.x + dx, y: panOriginRef.current.y + dy });
      return;
    }
    if (draggingRef.current) {
      const pt = getCanvasPoint(e);
      setPositions((prev) => ({
        ...prev,
        [draggingRef.current.nodeId]: { x: pt.x - draggingRef.current.offsetX, y: pt.y - draggingRef.current.offsetY },
      }));
      return;
    }
    if (drawingEdge) {
      const rect = canvasRef.current.getBoundingClientRect();
      setDrawingEdge((prev) => prev ? { ...prev, mx: (e.clientX - rect.left - pan.x) / zoom, my: (e.clientY - rect.top - pan.y) / zoom } : null);
    }
  }, [getCanvasPoint, drawingEdge, pan, zoom]);

  const onMouseUp = useCallback(() => {
    panningRef.current = false;
    draggingRef.current = null;
    if (drawingEdge) setDrawingEdge(null);
  }, [drawingEdge]);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setZoom((z) => Math.min(3, Math.max(0.2, z + delta)));
  }, []);

  /* ----- Node mouse handlers ----- */
  const onNodeMouseDown = useCallback((e, nodeId) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setSelectedNode(nodeId);
    const pt = getCanvasPoint(e);
    const pos = positions[nodeId];
    draggingRef.current = { nodeId, offsetX: pt.x - pos.x, offsetY: pt.y - pos.y };
  }, [getCanvasPoint, positions]);

  /* ----- Connector handlers ----- */
  const onOutputMouseDown = useCallback((e, nodeId) => {
    e.stopPropagation();
    const out = connectorOut(positions[nodeId]);
    setDrawingEdge({ from: nodeId, mx: out.x, my: out.y });
  }, [positions]);

  const onInputMouseUp = useCallback((e, nodeId) => {
    e.stopPropagation();
    if (drawingEdge && drawingEdge.from !== nodeId) {
      const exists = edges.some((ed) => ed.from === drawingEdge.from && ed.to === nodeId);
      if (!exists) {
        setEdges((prev) => [...prev, { from: drawingEdge.from, to: nodeId }]);
      }
    }
    setDrawingEdge(null);
  }, [drawingEdge, edges]);

  /* ----- Delete edge ----- */
  const deleteEdge = useCallback((idx) => {
    setEdges((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  /* ----- Zoom controls ----- */
  const zoomIn = () => setZoom((z) => Math.min(3, z + 0.15));
  const zoomOut = () => setZoom((z) => Math.max(0.2, z - 0.15));
  const fitToScreen = () => {
    const allPos = Object.values(positions);
    if (allPos.length === 0) { setZoom(1); setPan({ x: 0, y: 0 }); return; }
    const minX = Math.min(...allPos.map(p => p.x)) - 40;
    const minY = Math.min(...allPos.map(p => p.y)) - 40;
    const maxX = Math.max(...allPos.map(p => p.x)) + NODE_W + 40;
    const maxY = Math.max(...allPos.map(p => p.y)) + NODE_H + 40;
    const canvasEl = canvasRef.current;
    if (!canvasEl) { setZoom(1); setPan({ x: 0, y: 0 }); return; }
    const cw = canvasEl.clientWidth - 280; // subtract log panel
    const ch = canvasEl.clientHeight;
    const scaleX = cw / (maxX - minX);
    const scaleY = ch / (maxY - minY);
    const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY) * 0.9, 0.3), 1.5);
    setPan({ x: -minX * newZoom + 20, y: -minY * newZoom + 20 });
    setZoom(newZoom);
  };
  const resetLayout = () => { localStorage.removeItem('wf-node-positions'); localStorage.removeItem('wf-edges'); setPositions(defaultPositions()); setEdges(defaultEdges()); setZoom(1); setPan({ x: 0, y: 0 }); };

  /* ----- Status indicator mini component ----- */
  const StatusDot = ({ status }) => {
    const colors = { idle: '#4B5563', running: '#3B82F6', success: '#10B981', error: '#EF4444', pending: '#F59E0B' };
    const color = colors[status] || colors.idle;
    const isRunning = status === 'running';
    return (
      <div style={{ position: 'relative', width: 12, height: 12 }}>
        {isRunning && <div style={{ position: 'absolute', inset: -2, borderRadius: '50%', background: color, opacity: 0.3, animation: 'wf-pulse 1.5s ease-in-out infinite' }} />}
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: color }} />
      </div>
    );
  };

  const StatusIcon = ({ status, size = 14 }) => {
    if (status === 'success') return <span style={{ color: '#10B981' }}><SvgIcon type="check" size={size} /></span>;
    if (status === 'error') return <span style={{ color: '#EF4444' }}><SvgIcon type="x" size={size} /></span>;
    if (status === 'running') return <span style={{ color: '#3B82F6' }} className="wf-spin-container"><SvgIcon type="loader" size={size} /></span>;
    if (status === 'pending') return <span style={{ color: '#F59E0B' }}><SvgIcon type="clock" size={size} /></span>;
    return null;
  };

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', minHeight: '600px', background: '#0b0f14', color: '#E2E8F0', fontFamily: "'Inter', -apple-system, sans-serif", overflow: 'hidden' }}>
      {/* ---- inline keyframes ---- */}
      <style>{`
        @keyframes wf-pulse { 0%,100%{transform:scale(1);opacity:0.3} 50%{transform:scale(1.8);opacity:0} }
        .wf-spin-container svg { animation: wf-spin 1.2s linear infinite; }
        @keyframes wf-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .wf-btn { display:inline-flex; align-items:center; gap:6px; padding:6px 14px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.04); color:#E2E8F0; font-size:13px; cursor:pointer; transition:all .15s; white-space:nowrap; }
        .wf-btn:hover { background:rgba(255,255,255,0.08); border-color:rgba(255,255,255,0.18); }
        .wf-btn-primary { background:rgba(99,102,241,0.25); border-color:rgba(99,102,241,0.4); }
        .wf-btn-primary:hover { background:rgba(99,102,241,0.35); }
        .wf-btn-danger { background:rgba(239,68,68,0.2); border-color:rgba(239,68,68,0.4); }
        .wf-btn-danger:hover { background:rgba(239,68,68,0.3); }
        .wf-btn:disabled { opacity:0.4; cursor:not-allowed; }
        .wf-input { background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:6px; color:#E2E8F0; padding:4px 8px; font-size:13px; outline:none; }
        .wf-input:focus { border-color:rgba(99,102,241,0.5); }
        .wf-edge-line { cursor:pointer; transition:stroke .15s; }
        .wf-edge-line:hover { stroke:rgba(239,68,68,0.8) !important; stroke-width:3px !important; }
        .wf-connector { cursor:crosshair; transition:all .15s; }
        .wf-connector:hover { r:7; fill:rgba(99,102,241,0.9); }
        .wf-node { user-select:none; }
        .wf-canvas-bg { cursor:grab; }
        .wf-canvas-bg:active { cursor:grabbing; }
      `}</style>

      {/* ============================================================ */}
      {/*  TOP BAR                                                      */}
      {/* ============================================================ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(15,20,35,0.6)', flexShrink: 0, flexWrap: 'wrap' }}>
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
          <span style={{ color: '#8B5CF6', display: 'flex' }}><SvgIcon type="enrich" size={20} /></span>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Workflow Automation</span>
        </div>

        {/* Date inputs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <span style={{ color: '#94A3B8' }}>Date:</span>
          <input type="date" className="wf-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ width: 130 }} />
          <span style={{ color: '#64748B' }}>to</span>
          <input type="date" className="wf-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ width: 130 }} />
        </div>

        {/* Schedule time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <span style={{ color: '#94A3B8' }}>Schedule:</span>
          <input type="time" className="wf-input" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} style={{ width: 100 }} />
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Run / Stop */}
        {!isRunning ? (
          <button className="wf-btn wf-btn-primary" onClick={runAll}>
            <SvgIcon type="play" size={14} /> Run All
          </button>
        ) : (
          <button className="wf-btn wf-btn-danger" onClick={stopRun}>
            <SvgIcon type="stop" size={14} /> Stop
          </button>
        )}
      </div>

      {/* ============================================================ */}
      {/*  CANVAS + LOG split                                           */}
      {/* ============================================================ */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ---- Canvas ---- */}
        <div
          ref={canvasRef}
          className="wf-canvas-bg"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onWheel={onWheel}
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            backgroundPosition: `${pan.x % 24}px ${pan.y % 24}px`,
          }}
        >
          {/* Transformed layer */}
          <div style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', position: 'absolute', inset: 0 }}>
            {/* SVG for edges */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
              {edges.map((edge, idx) => {
                const fromPos = positions[edge.from];
                const toPos = positions[edge.to];
                if (!fromPos || !toPos) return null;
                const out = connectorOut(fromPos);
                const inp = connectorIn(toPos);
                return (
                  <g key={`edge-${idx}`}>
                    {/* Invisible thick line for easier clicking */}
                    <path
                      d={bezierPath(out.x, out.y, inp.x, inp.y)}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                      style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                      onClick={() => deleteEdge(idx)}
                    />
                    <path
                      d={bezierPath(out.x, out.y, inp.x, inp.y)}
                      fill="none"
                      stroke="rgba(99,102,241,0.4)"
                      strokeWidth={2}
                      className="wf-edge-line"
                      style={{ pointerEvents: 'stroke' }}
                      onClick={() => deleteEdge(idx)}
                    />
                    {/* Arrow tip */}
                    <circle cx={inp.x} cy={inp.y} r={3} fill="rgba(99,102,241,0.6)" style={{ pointerEvents: 'none' }} />
                  </g>
                );
              })}
              {/* Drawing edge */}
              {drawingEdge && positions[drawingEdge.from] && (
                <path
                  d={bezierPath(connectorOut(positions[drawingEdge.from]).x, connectorOut(positions[drawingEdge.from]).y, drawingEdge.mx, drawingEdge.my)}
                  fill="none"
                  stroke="rgba(99,102,241,0.6)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  style={{ pointerEvents: 'none' }}
                />
              )}
            </svg>

            {/* Nodes */}
            {NODE_DEFS.map((nodeDef) => {
              const pos = positions[nodeDef.id];
              if (!pos) return null;
              const isSelected = selectedNode === nodeDef.id;
              const st = nodeStatus[nodeDef.id];
              return (
                <div
                  key={nodeDef.id}
                  className="wf-node"
                  onMouseDown={(e) => onNodeMouseDown(e, nodeDef.id)}
                  style={{
                    position: 'absolute',
                    left: pos.x,
                    top: pos.y,
                    width: NODE_W,
                    height: NODE_H,
                    background: 'rgba(15,20,35,0.85)',
                    borderRadius: 12,
                    border: `1px solid ${isSelected ? nodeDef.color : 'rgba(255,255,255,0.08)'}`,
                    borderLeft: `4px solid ${nodeDef.color}`,
                    boxShadow: isSelected ? `0 0 16px ${nodeDef.color}44` : '0 2px 8px rgba(0,0,0,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 14px',
                    gap: 10,
                    cursor: 'grab',
                    transition: 'box-shadow .15s, border-color .15s',
                  }}
                >
                  {/* Input connector */}
                  {nodeDef.id !== 'schedule' && (
                    <svg
                      onMouseUp={(e) => onInputMouseUp(e, nodeDef.id)}
                      className="wf-connector"
                      style={{ position: 'absolute', left: -7, top: NODE_H / 2 - 7, width: 14, height: 14, overflow: 'visible', zIndex: 2 }}
                    >
                      <circle cx={7} cy={7} r={5} fill="rgba(30,36,55,1)" stroke="rgba(99,102,241,0.5)" strokeWidth={1.5} />
                    </svg>
                  )}

                  {/* Icon */}
                  <div style={{ color: nodeDef.color, flexShrink: 0, display: 'flex' }}>
                    <SvgIcon type={nodeDef.icon} size={20} />
                  </div>

                  {/* Title + status */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#E2E8F0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nodeDef.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                      <StatusDot status={st} />
                      <span style={{ fontSize: 11, color: '#94A3B8', textTransform: 'capitalize' }}>{st}</span>
                    </div>
                  </div>

                  {/* Status icon */}
                  <div style={{ flexShrink: 0, display: 'flex' }}>
                    <StatusIcon status={st} size={16} />
                  </div>

                  {/* Output connector */}
                  <svg
                    onMouseDown={(e) => onOutputMouseDown(e, nodeDef.id)}
                    className="wf-connector"
                    style={{ position: 'absolute', right: -7, top: NODE_H / 2 - 7, width: 14, height: 14, overflow: 'visible', zIndex: 2 }}
                  >
                    <circle cx={7} cy={7} r={5} fill="rgba(30,36,55,1)" stroke="rgba(99,102,241,0.5)" strokeWidth={1.5} />
                  </svg>
                </div>
              );
            })}
          </div>

          {/* ---- Canvas controls (bottom-right) ---- */}
          <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 10 }}>
            <button className="wf-btn" onClick={zoomIn} title="Zoom in" style={{ padding: '6px 8px' }}><SvgIcon type="zoomIn" size={16} /></button>
            <button className="wf-btn" onClick={zoomOut} title="Zoom out" style={{ padding: '6px 8px' }}><SvgIcon type="zoomOut" size={16} /></button>
            <button className="wf-btn" onClick={fitToScreen} title="Fit to screen" style={{ padding: '6px 8px' }}><SvgIcon type="maximize" size={16} /></button>
            <button className="wf-btn" onClick={resetLayout} title="Reset layout" style={{ padding: '6px 8px' }}><SvgIcon type="refresh" size={16} /></button>
          </div>

          {/* Zoom indicator */}
          <div style={{ position: 'absolute', bottom: 18, left: 16, fontSize: 11, color: '#64748B', zIndex: 10 }}>
            {Math.round(zoom * 100)}%
          </div>
        </div>

        {/* ============================================================ */}
        {/*  LOG PANEL (right)                                            */}
        {/* ============================================================ */}
        <div style={{ width: 340, borderLeft: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', background: 'rgba(8,11,18,0.7)', flexShrink: 0 }}>
          {/* Header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: '#94A3B8' }}>Execution Log</span>
            <button className="wf-btn" onClick={() => setLogs([])} style={{ padding: '3px 8px', fontSize: 11 }}>
              <SvgIcon type="trash" size={12} /> Clear
            </button>
          </div>

          {/* Node status summary */}
          <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {NODE_DEFS.map((n) => {
              const st = nodeStatus[n.id];
              const bg = { idle: 'rgba(75,85,99,0.15)', running: 'rgba(59,130,246,0.15)', success: 'rgba(16,185,129,0.15)', error: 'rgba(239,68,68,0.15)', pending: 'rgba(245,158,11,0.15)' }[st];
              const fg = { idle: '#6B7280', running: '#60A5FA', success: '#34D399', error: '#F87171', pending: '#FBBF24' }[st];
              return (
                <div
                  key={n.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: bg,
                    fontSize: 11,
                    color: fg,
                    border: `1px solid ${fg}22`,
                  }}
                  title={n.title}
                >
                  <StatusDot status={st} />
                  <span style={{ maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title.split(' ')[0]}</span>
                </div>
              );
            })}
          </div>

          {/* Log messages */}
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 14px', fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 11, lineHeight: 1.7 }}>
            {logs.length === 0 && <div style={{ color: '#4B5563', fontStyle: 'italic', marginTop: 8 }}>No log messages yet. Click "Run All" to start.</div>}
            {logs.map((msg, i) => {
              const isError = msg.includes('ERROR');
              const isComplete = msg.includes('done') || msg.includes('complete') || msg.includes('finished');
              const isHeader = msg.includes('---');
              return (
                <div key={i} style={{ color: isError ? '#F87171' : isComplete ? '#34D399' : isHeader ? '#818CF8' : '#94A3B8', wordBreak: 'break-word' }}>
                  {msg}
                </div>
              );
            })}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
