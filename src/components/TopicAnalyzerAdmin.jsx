import React, { useState, useRef, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import DateRangePicker from './DateRangePicker';

function parseDateRange(dateRange) {
  const DHAKA_MS = 6 * 3600000;
  const now = new Date(Date.now() + DHAKA_MS);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  if (dateRange?.startsWith('custom_')) { const p = dateRange.split('_'); return { from: p[1], to: p[2] }; }
  if (dateRange === 'today') { const d = fmt(today); return { from: d, to: d }; }
  if (dateRange === 'yesterday') { const y = new Date(today); y.setDate(y.getDate()-1); return { from: fmt(y), to: fmt(y) }; }
  if (dateRange === 'this_month') { return { from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), to: fmt(today) }; }
  if (dateRange === 'last_month') { const f = new Date(today.getFullYear(), today.getMonth(), 1); const e = new Date(f.getTime()-86400000); return { from: fmt(new Date(e.getFullYear(), e.getMonth(), 1)), to: fmt(e) }; }
  const days = { last_7_days: 7, last_30_days: 30, last_90_days: 90 }[dateRange] || 30;
  const s = new Date(today); s.setDate(s.getDate() - days);
  return { from: fmt(s), to: fmt(today) };
}

// Only these emails can access this component
const ALLOWED_EMAILS = ['sajol@nextventures.io', 'sazzad@nextventures.io', 'salmanwahid@nextventures.io', 'dhrubo@nextventures.io', 'sajolmk999@gmail.com', 'afsana@nextventures.io', 'sudipta@nextventures.io', 'walliullah@nextventures.io', 'fahim.sarower@nextventures.io', 'faisal.niyam@nextventures.io'];

const TopicAnalyzerAdmin = () => {
  const { user } = useAuth();
  const [mode, setMode] = useState('range'); // 'single' or 'range'
  const [conversationId, setConversationId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [timeFrom, setTimeFrom] = useState('00:00');
  const [timeTo, setTimeTo] = useState('23:59');
  const [timezoneOffset, setTimezoneOffset] = useState(0); // 0 = GMT+0 (UTC), 6 = GMT+6 (Bangladesh)

  // Progress states
  const [isFetching, setIsFetching] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [datasets, setDatasets] = useState(null); // For Reporting Data Export datasets
  const [showDatasets, setShowDatasets] = useState(false);

  // Conversation Actions automatic sync (API: export → download → filter → Supabase)
  const [conversationActionsUploading, setConversationActionsUploading] = useState(false);
  const [conversationActionsStatus, setConversationActionsStatus] = useState('');
  const [conversationActionsDateRange, setConversationActionsDateRange] = useState('custom_2026-02-01_2026-02-17');
  const { from: conversationActionsDateFrom, to: conversationActionsDateTo } = useMemo(() => parseDateRange(conversationActionsDateRange), [conversationActionsDateRange]);

  // Conversation Dataset sync (Service Performance Overview)
  const [convDatasetUploading, setConvDatasetUploading] = useState(false);
  const [convDatasetStatus, setConvDatasetStatus] = useState('');
  const [convDatasetDateRange, setConvDatasetDateRange] = useState('custom_2026-02-01_2026-02-17');
  const { from: convDatasetDateFrom, to: convDatasetDateTo } = useMemo(() => parseDateRange(convDatasetDateRange), [convDatasetDateRange]);

  // Tickets Dataset sync
  const [ticketsUploading, setTicketsUploading] = useState(false);
  const [ticketsStatus, setTicketsStatus] = useState('');
  const [ticketsDateRange, setTicketsDateRange] = useState('custom_2025-06-01_' + new Date().toISOString().split('T')[0]);
  const { from: ticketsDateFrom, to: ticketsDateTo } = useMemo(() => parseDateRange(ticketsDateRange), [ticketsDateRange]);

  // Intercom Topic Dataset sync
  const [itSyncing, setItSyncing] = useState(false);
  const [itStatus, setItStatus] = useState('');
  const [itDateRange, setItDateRange] = useState('custom_2026-01-01_' + new Date().toISOString().split('T')[0]);
  const { from: itDateFrom, to: itDateTo } = useMemo(() => parseDateRange(itDateRange), [itDateRange]);

  // FIN SPO sync
  const [finSyncing, setFinSyncing] = useState(false);
  const [finStatus, setFinStatus] = useState('');
  const [finDateRange, setFinDateRange] = useState('custom_2026-03-09_' + new Date().toISOString().split('T')[0]);
  const { from: finDateFrom, to: finDateTo } = useMemo(() => parseDateRange(finDateRange), [finDateRange]);

  // CSAT Rating sync
  const [csatSyncing, setCsatSyncing] = useState(false);
  const [csatSyncStatus, setCsatSyncStatus] = useState('');
  const [csatDateRange, setCsatDateRange] = useState('custom_2026-01-01_' + new Date().toISOString().split('T')[0]);
  const { from: csatDateFrom, to: csatDateTo } = useMemo(() => parseDateRange(csatDateRange), [csatDateRange]);

  // SPO Enrich (FRT/ART/AHT per agent)
  const [spoEnriching, setSpoEnriching] = useState(false);
  const [spoEnrichStatus, setSpoEnrichStatus] = useState('');
  const [spoEnrichRange, setSpoEnrichRange] = useState('');
  const [frtRecalcing, setFrtRecalcing] = useState(false);
  const [frtRecalcStatus, setFrtRecalcStatus] = useState('');

  // Email Sync Replies
  const [emailSyncing, setEmailSyncing] = useState(false);
  const [emailSyncStatus, setEmailSyncStatus] = useState('');
  const [emailSyncRange, setEmailSyncRange] = useState('custom_2026-03-01_' + new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 10));
  const { from: emailSyncFrom, to: emailSyncTo } = useMemo(() => parseDateRange(emailSyncRange), [emailSyncRange]);

  // Email SPO Enrich
  const [emailEnriching, setEmailEnriching] = useState(false);
  const [emailEnrichStatus, setEmailEnrichStatus] = useState('');

  // Tickets Dataset → ticket_logs (Reporting Data Export API)
  const [tdSyncing, setTdSyncing] = useState(false);
  const [tdStatus, setTdStatus] = useState('');
  const [tdDateRange, setTdDateRange] = useState('custom_2025-06-01_' + new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 10));
  const { from: tdDateFrom, to: tdDateTo } = useMemo(() => parseDateRange(tdDateRange), [tdDateRange]);

  // CSAT Automation
  const [csatRunning, setCsatRunning] = useState(false);
  const [csatStatus, setCsatStatus] = useState('');
  const [csatProgress, setCsatProgress] = useState({ total: 0, done: 0, errors: 0 });
  const [csatClassifyRange, setCsatClassifyRange] = useState('custom_2026-01-01_' + new Date().toISOString().split('T')[0]);
  const { from: csatClassifyFrom, to: csatClassifyTo } = useMemo(() => parseDateRange(csatClassifyRange), [csatClassifyRange]);
  const csatStopRef = useRef(false);
  
  // Progress tracking
  const [progress, setProgress] = useState({
    totalAvailable: 0,
    fetched: 0,
    saved: 0,
    currentPage: 0,
    analyzed: 0,
    toAnalyze: 0,
    status: '' // Current operation status
  });
  
  // Stop flag using ref (persists across renders without causing re-render)
  const stopRequestedRef = useRef(false);
  
  // API URL (relative; in dev Vite proxies /api to Vercel - see vite.config.js)
  const API_URL = '/api/analyze-topics';

  // Parse JSON or throw a clear error (e.g. when API is unreachable on localhost)
  const parseJson = async (response) => {
    const text = await response.text();
    if (!text || !text.trim()) {
      throw new Error(
        'API returned no data. From localhost: restart dev server so /api is proxied to Vercel (vite.config.js), or run "vercel dev".'
      );
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`API returned invalid JSON. From localhost, ensure the API proxy is set up or run "vercel dev".`);
    }
  };

  // Your date + time in selected timezone (offset hours) -> Unix seconds. Same logic as API.
  const getFilterRange = (from, to, fromTime = '00:00', toTime = '23:59', offsetHours = timezoneOffset) => {
    if (!from || !to) return null;
    const [fromY, fromM, fromD] = from.split('-').map(Number);
    const [toY, toM, toD] = to.split('-').map(Number);
    const parseT = (str, defH, defM) => {
      if (!str) return [defH, defM];
      const p = str.trim().split(':').map(Number);
      return [Number.isNaN(p[0]) ? defH : p[0], Number.isNaN(p[1]) ? defM : p[1]];
    };
    const [fh, fm] = parseT(fromTime, 0, 0);
    const [th, tm] = parseT(toTime, 23, 59);
    const fromTs = Math.floor(Date.UTC(fromY, fromM - 1, fromD, fh - offsetHours, fm, 0) / 1000);
    const toTs = Math.floor(Date.UTC(toY, toM - 1, toD, th - offsetHours, tm, 59) / 1000);
    return { fromTs, toTs };
  };

  const TIMEZONE_OPTIONS = [
    { value: 0, label: 'GMT+0 (UTC)' },
    { value: 6, label: 'GMT+6 (Bangladesh)' }
  ];

  // Quick date filters
  const setQuickRange = (preset) => {
    const now = new Date();
    const toDate = new Date(now);
    let fromDate = new Date(now);
    if (preset === 'yesterday') {
      fromDate.setDate(fromDate.getDate() - 1);
      toDate.setDate(toDate.getDate() - 1);
    } else if (preset === '7days') {
      fromDate.setDate(fromDate.getDate() - 6);
    }
    setDateFrom(fromDate.toISOString().slice(0, 10));
    setDateTo(toDate.toISOString().slice(0, 10));
    setTimeFrom('00:00');
    setTimeTo('23:59');
  };

  // Check access permission
  const userEmail = user?.email?.toLowerCase() || '';
  const hasAccess = ALLOWED_EMAILS.some(email => email.toLowerCase() === userEmail);

  // If no access, show access denied
  if (!hasAccess) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '12px',
          padding: '2rem',
          maxWidth: '400px',
          margin: '0 auto'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
          <h3 style={{ color: '#F87171', margin: '0 0 0.5rem 0' }}>Access Denied</h3>
          <p style={{ color: '#94A3B8', margin: 0, fontSize: '0.875rem' }}>
            This feature is restricted to authorized administrators only.
          </p>
        </div>
      </div>
    );
  }

  // Insert minimal record (Phase 1: Conversation ID + created_at only)
  // Uses upsert to handle duplicates - only updates if record exists
  const insertIdsBatch = async (records) => {
    if (!records || records.length === 0) return { inserted: 0, errors: 0, skipped: 0 };
    
    try {
      // Use upsert with onConflict to handle duplicates
      const { data, error } = await supabase
        .from('Intercom Topic')
        .upsert(records, { 
          onConflict: 'Conversation ID',
          ignoreDuplicates: true 
        })
        .select();
      
      if (error) {
        console.error('Supabase upsert error:', error);
        // Try regular insert as fallback (may fail on duplicates)
        const { data: insertData, error: insertError } = await supabase
          .from('Intercom Topic')
          .insert(records)
          .select();
        
        if (insertError) {
          // Check if it's a duplicate error - count how many actually got inserted
          console.error('Supabase insert fallback error:', insertError);
          return { inserted: 0, errors: records.length, skipped: 0 };
        }
        return { inserted: insertData?.length ?? 0, errors: 0, skipped: records.length - (insertData?.length ?? 0) };
      }
      
      return { inserted: data?.length ?? records.length, errors: 0, skipped: 0 };
    } catch (e) {
      console.error('insertIdsBatch exception:', e);
      return { inserted: 0, errors: records.length, skipped: 0 };
    }
  };

  // Update row by Conversation ID with full data (Phase 2)
  // Writes CX Score Rating, Assigned Channel ID, Email, Product, Transcript and other fields
  const updateRowInSupabase = async (convId, fullRecord) => {
    const rating = fullRecord['CX Score Rating'] ?? fullRecord['Conversation Rating'];
    const createdAtUnix = fullRecord['created_at'];
    const createdAtBD = fullRecord['created_at_bd']
      ?? (createdAtUnix != null ? new Date(Number(createdAtUnix) * 1000).toISOString() : null);

    const payload = {
      'Email': fullRecord['Email'] || null,
      'User ID': fullRecord['User ID'] || null,
      'Country': fullRecord['Country'] || null,
      'Region': fullRecord['Region'] || null,
      'Assigned Channel ID': fullRecord['Assigned Channel ID'] || null,
      'assigned_channel_name': fullRecord['assigned_channel_name'] || null,
      'Product': fullRecord['Product'] || null,
      'CX Score Rating': (rating != null && String(rating).trim() !== '') ? String(rating) : null,
      'Conversation Rating': (rating != null && String(rating).trim() !== '') ? String(rating) : null
    };

    // Set created_at_bd if available (timestamptz column)
    if (createdAtBD) {
      payload['created_at_bd'] = createdAtBD;
    }

    const { data, error } = await supabase
      .from('Intercom Topic')
      .update(payload)
      .eq('"Conversation ID"', convId)
      .select();
    
    if (error) {
      console.error('Supabase update error for', convId, ':', error.message);
      return false;
    }
    
    if (!data || data.length === 0) {
      console.error('No rows matched for Conversation ID:', convId);
      return false;
    }
    
    return true;
  };

  // Pull full data from Intercom for every Conversation ID already in Supabase (no date range needed)
  const handleEnrichFromSupabase = async () => {
    setIsFetching(true);
    setError('');
    stopRequestedRef.current = false;
    setProgress({ totalAvailable: 0, fetched: 0, saved: 0, currentPage: 0, analyzed: 0, toAnalyze: 0, status: '' });

    try {
      setProgress(prev => ({ ...prev, status: '📋 Loading Conversation IDs from Supabase...' }));

      const { data: rows, error: fetchErr } = await supabase
        .from('Intercom Topic')
        .select('"Conversation ID"');

      if (fetchErr) {
        setError(`Supabase error: ${fetchErr.message}`);
        return;
      }
      if (!rows || rows.length === 0) {
        setProgress(prev => ({ ...prev, status: '⚠️ No rows in Intercom Topic. Use Fetch & Save first.' }));
        return;
      }

      const total = rows.length;
      setProgress(prev => ({ ...prev, totalAvailable: total, status: `📥 Pulling data from Intercom for ${total} chat IDs...` }));

      let enriched = 0;
      let errorCount = 0;
      let lastError = '';
      const ENRICH_DELAY_MS = 400; // Delay between requests to avoid Intercom rate limiting (429)

      for (let i = 0; i < rows.length; i++) {
        if (stopRequestedRef.current) {
          setProgress(prev => ({ ...prev, status: `⏹️ Stopped. Enriched ${enriched} of ${total}.` }));
          break;
        }

        const convId = rows[i]['Conversation ID'] ?? rows[i]['"Conversation ID"'];
        setProgress(prev => ({
          ...prev,
          fetched: i + 1,
          saved: enriched,
          status: `📥 Pulling data for chat ID ${i + 1}/${total}: ${convId}...`
        }));

        try {
          const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'fetch-details', conversationId: convId })
          });
          if (!res.ok) {
            lastError = res.status === 429 ? 'Rate limited (429) – try again later or use slower pace' : `${res.status} ${res.statusText}`;
            errorCount++;
            if (res.status === 429) await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          const result = await parseJson(res);
          if (!result.success || !result.data) {
            lastError = result.error || 'Empty or invalid API response';
            errorCount++;
            continue;
          }
          const ok = await updateRowInSupabase(convId, result.data);
          if (ok) enriched++;
          else {
            lastError = 'Supabase update failed';
            errorCount++;
          }
        } catch (err) {
          lastError = err.message || String(err);
          console.error(`Enrich ${convId}:`, err);
          errorCount++;
        }

        if (i < rows.length - 1) await new Promise(r => setTimeout(r, ENRICH_DELAY_MS));
      }

      const finalStatus = errorCount > 0
        ? `✅ Done. Enriched ${enriched} of ${total}. Errors: ${errorCount}.${lastError ? ` Last error: ${lastError}` : ''}`
        : `✅ Done. Enriched all ${enriched} rows with data from Intercom.`;
      setProgress(prev => ({ ...prev, status: finalStatus, saved: enriched }));
    } catch (err) {
      console.error('Enrich error:', err);
      setError(err.message);
      setProgress(prev => ({ ...prev, status: `❌ ${err.message}` }));
    } finally {
      setIsFetching(false);
      stopRequestedRef.current = false;
    }
  };

  // Check for rows with missing data and populate from Intercom – PARALLEL processing (5 at a time)
  const handlePopulateMissingData = async () => {
    if (!itDateFrom || !itDateTo) {
      setError('Please select a date range before populating missing data.');
      return;
    }
    setIsFetching(true);
    setError('');
    stopRequestedRef.current = false;
    setProgress({ totalAvailable: 0, fetched: 0, saved: 0, currentPage: 0, analyzed: 0, toAnalyze: 0, status: '' });

    const CHUNK_SIZE = 30; // Conversations per serverless call
    const PARALLEL_CALLS = 2; // Serverless calls in parallel (= 60 convos at a time)
    const STEP = CHUNK_SIZE * PARALLEL_CALLS;
    const BASE_DELAY_MS = 200;
    let currentBackoff = BASE_DELAY_MS;
    const MAX_BACKOFF = 10000;

    try {
      // Only flag a row as "missing" when the Transcript is empty. Other
      // metadata (Product, Channel, Email, etc.) is populated in the same
      // server call when present, but the missing-check itself is transcript-only.
      const { data: allMissing, error: countErr } = await supabase
        .from('Intercom Topic')
        .select('"Conversation ID"')
        .gte('created_date_bd', itDateFrom)
        .lte('created_date_bd', itDateTo)
        .or('Transcript.is.null,Transcript.eq.');

      if (countErr) { setError(`Supabase error: ${countErr.message}`); return; }

      const total = allMissing?.length || 0;
      if (total === 0) { setProgress(prev => ({ ...prev, status: '✅ No rows with missing transcript.' })); return; }

      const startTime = Date.now();
      setProgress(prev => ({ ...prev, status: `🔍 Found ${total} rows missing transcript. Processing ${STEP} at a time (batch API)...`, totalAvailable: total }));

      let enriched = 0;
      let errorCount = 0;
      let lastError = '';
      let processed = 0;

      for (let i = 0; i < total && !stopRequestedRef.current; i += STEP) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = processed > 0 ? processed / elapsed : 0;
        const remaining = total - processed;
        const etaSeconds = rate > 0 ? Math.round(remaining / rate) : 0;
        const etaStr = etaSeconds > 60 ? `${Math.round(etaSeconds / 60)}m` : `${etaSeconds}s`;

        setProgress(prev => ({
          ...prev, fetched: processed,
          status: `📥 ${processed}/${total} enriched | ${rate.toFixed(1)}/sec | ETA: ${etaStr}`
        }));

        // Split into PARALLEL_CALLS chunks, each with CHUNK_SIZE IDs
        const chunks = [];
        for (let p = 0; p < PARALLEL_CALLS; p++) {
          const start = i + p * CHUNK_SIZE;
          const ids = allMissing.slice(start, start + CHUNK_SIZE).map(r => r['Conversation ID'] ?? r['"Conversation ID"']);
          if (ids.length > 0) chunks.push(ids);
        }

        // Fire all chunk requests in parallel
        const chunkResults = await Promise.all(chunks.map(async (ids) => {
          try {
            const res = await fetch(API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'fetch-details-batch', conversationIds: ids })
            });
            if (res.status === 429) return { rateLimited: true };
            if (!res.ok) return { error: `API ${res.status}` };
            const data = await parseJson(res);
            if (!data.success) return { error: data.error || 'API error' };
            return { results: data.results || [] };
          } catch (err) { return { error: err.message }; }
        }));

        // Check rate limiting
        if (chunkResults.some(c => c.rateLimited)) {
          currentBackoff = Math.min(currentBackoff * 2, MAX_BACKOFF);
          await new Promise(r => setTimeout(r, currentBackoff));
          i -= STEP;
          continue;
        }
        currentBackoff = BASE_DELAY_MS;

        // Flatten all results and update Supabase in parallel
        const allResults = chunkResults.flatMap(c => c.results || []);
        if (chunkResults.some(c => c.error)) {
          lastError = chunkResults.find(c => c.error)?.error;
          errorCount += chunkResults.filter(c => c.error).length;
        }

        const updatePromises = allResults.map(async (r) => {
          processed++;
          if (r.error) { lastError = r.error; errorCount++; return; }
          if (!r.data) { errorCount++; return; }
          const ok = await updateRowInSupabase(r.convId, r.data);
          if (ok) enriched++;
          else { lastError = 'Supabase update failed'; errorCount++; }
        });
        await Promise.all(updatePromises);

        setProgress(prev => ({ ...prev, saved: enriched, fetched: processed }));
        await new Promise(r => setTimeout(r, currentBackoff));
      }

      const finalStatus = stopRequestedRef.current
        ? `⏹️ Stopped. Populated ${enriched} of ${total} rows.`
        : errorCount > 0
          ? `✅ Done. Populated ${enriched}/${total}. Errors: ${errorCount}.${lastError ? ` Last: ${lastError}` : ''}`
          : `✅ Done. Populated all ${enriched} rows.`;
      setProgress(prev => ({ ...prev, status: finalStatus }));
    } catch (err) {
      console.error('Populate missing error:', err);
      setError(err.message);
      setProgress(prev => ({ ...prev, status: `❌ ${err.message}` }));
    } finally {
      setIsFetching(false);
      stopRequestedRef.current = false;
    }
  };

  // Clear all rows in Intercom Topic
  const handleClearTable = async () => {
    if (!window.confirm('Delete ALL data in Intercom Topic? This cannot be undone.')) return;
    setError('');
    setProgress(prev => ({ ...prev, status: '🗑️ Deleting all rows...' }));
    // Delete in chunks (Supabase may require a filter; delete rows where Conversation ID is not null = all rows)
    const { data: ids } = await supabase.from('Intercom Topic').select('"Conversation ID"');
    if (ids && ids.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize).map(r => r['Conversation ID'] ?? r['"Conversation ID"']);
        const { error } = await supabase.from('Intercom Topic').delete().in('"Conversation ID"', chunk);
        if (error) {
          setError(`Delete failed: ${error.message}`);
          return;
        }
      }
    }
    setProgress(prev => ({ ...prev, status: '✅ Intercom Topic cleared.' }));
  };

  // Reset all data EXCEPT Conversation ID and unique_id – keeps rows but clears their data
  const handleResetDataKeepIds = async () => {
    if (!window.confirm('Clear ALL data except Conversation ID and unique_id? This will set Transcript, Product, Email, Region, etc. to NULL so you can re-fetch.')) return;
    setError('');
    setIsFetching(true);
    setProgress(prev => ({ ...prev, status: '🔄 Resetting data (keeping Conversation IDs)...' }));

    try {
      // Get all conversation IDs
      const { data: rows, error: fetchErr } = await supabase
        .from('Intercom Topic')
        .select('"Conversation ID"');

      if (fetchErr) {
        setError(`Supabase error: ${fetchErr.message}`);
        return;
      }

      const total = rows?.length || 0;
      if (total === 0) {
        setProgress(prev => ({ ...prev, status: '✅ No rows to reset.' }));
        return;
      }

      // Update in batches: set all data columns to null
      const nullData = {
        'Email': null,
        'Transcript': null,
        'User ID': null,
        'Country': null,
        'Region': null,
        'Assigned Channel ID': null,
        'CX Score Rating': null,
        'Conversation Rating': null,
        'Product': null,
        'Main-Topics': null,
        'Sub-Topics': null,
        'Sentiment Start': null,
        'Sentiment End': null,
        'Feedbacks': null,
        "Was it in client's favor?": null
      };

      const chunkSize = 100;
      let processed = 0;
      for (let i = 0; i < total; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize).map(r => r['Conversation ID'] ?? r['"Conversation ID"']);
        const { error } = await supabase
          .from('Intercom Topic')
          .update(nullData)
          .in('"Conversation ID"', chunk);

        if (error) {
          setError(`Reset failed: ${error.message}`);
          return;
        }
        processed += chunk.length;
        setProgress(prev => ({ ...prev, status: `🔄 Reset ${processed}/${total} rows...` }));
      }

      setProgress(prev => ({ ...prev, status: `✅ Reset complete. ${total} rows cleared (Conversation IDs kept). Now run "Check & populate missing data" to re-fetch.` }));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsFetching(false);
    }
  };

  // Remove rows where Conversation started at is outside the selected date range (GMT+0)
  const handleRemoveOutsideDateRange = async () => {
    if (!dateFrom || !dateTo) {
      setError('Select From and To date first');
      return;
    }
    const range = getFilterRange(dateFrom, dateTo, timeFrom, timeTo);
    if (!range) return;
    const { fromTs, toTs } = range;
    const rangeLabel = timeFrom || timeTo ? `${dateFrom} ${timeFrom || '00:00'} – ${dateTo} ${timeTo || '23:59'}` : `${dateFrom} – ${dateTo}`;
    const tzLabel = TIMEZONE_OPTIONS.find(o => o.value === timezoneOffset)?.label || 'GMT+0';
    if (!window.confirm(`Remove conversations where "Conversation started at" is NOT between ${rangeLabel} (${tzLabel})? This will delete those rows from Supabase.`)) return;

    setIsFetching(true);
    setError('');
    setProgress(prev => ({ ...prev, status: '🔍 Loading rows to check...' }));

    try {
      const { data: rows, error: fetchErr } = await supabase
        .from('Intercom Topic')
        .select('"Conversation ID", created_at, created_at_bd');

      if (fetchErr) {
        setError(`Supabase error: ${fetchErr.message}`);
        return;
      }
      if (!rows?.length) {
        setProgress(prev => ({ ...prev, status: '✅ No rows to check.' }));
        return;
      }

      const toSeconds = (v) => {
        if (v == null) return null;
        const n = typeof v === 'string' ? parseInt(v, 10) : v;
        if (Number.isNaN(n)) return null;
        return n > 1e12 ? Math.floor(n / 1000) : n;
      };

      const outside = [];
      for (const r of rows) {
        const convId = r['Conversation ID'] ?? r['"Conversation ID"'];
        let ts = toSeconds(r.created_at);
        if (ts == null && r.created_at_bd) {
          const d = new Date(r.created_at_bd);
          if (!Number.isNaN(d.getTime())) ts = Math.floor(d.getTime() / 1000);
        }
        if (ts == null) continue;
        if (ts < fromTs || ts > toTs) outside.push(convId);
      }

      if (outside.length === 0) {
        setProgress(prev => ({ ...prev, status: `✅ All ${rows.length} rows are within ${dateFrom}–${dateTo} (Dhaka). Nothing removed.` }));
        return;
      }

      setProgress(prev => ({ ...prev, status: `🗑️ Removing ${outside.length} rows outside date range...` }));

      const chunkSize = 100;
      let removed = 0;
      for (let i = 0; i < outside.length; i += chunkSize) {
        const chunk = outside.slice(i, i + chunkSize);
        const { error } = await supabase
          .from('Intercom Topic')
          .delete()
          .in('"Conversation ID"', chunk);
        if (error) {
          setError(`Delete failed: ${error.message}`);
          return;
        }
        removed += chunk.length;
        setProgress(prev => ({ ...prev, status: `🗑️ Removed ${removed}/${outside.length}...` }));
      }

      setProgress(prev => ({ ...prev, status: `✅ Removed ${removed} conversations outside ${dateFrom}–${dateTo} (${TIMEZONE_OPTIONS.find(o => o.value === timezoneOffset)?.label || 'GMT+0'}).` }));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsFetching(false);
    }
  };

  // FAST: Extract ONLY Conversation IDs (no enrichment) - for bulk ID extraction
  const handleFetchIdsOnly = async () => {
    if (!dateFrom || !dateTo) {
      setError('Please select a date range');
      return;
    }

    setIsFetching(true);
    setError('');
    stopRequestedRef.current = false;
    setProgress({ totalAvailable: 0, fetched: 0, saved: 0, currentPage: 0, analyzed: 0, toAnalyze: 0, status: '' });

    const BASE_DELAY_MS = 200; // Fast but safe
    let currentBackoff = BASE_DELAY_MS;
    const MAX_BACKOFF = 5000;

    try {
      setProgress(prev => ({ ...prev, status: '🚀 Fast extraction: Fetching Conversation IDs only (150 per page)...' }));
      
      let startingAfter = null;
      let pageNum = 0;
      let totalIdsSaved = 0;
      let totalAvailable = 0;
      let allIds = []; // Collect all IDs first, then batch insert
      const startTime = Date.now();

      // PHASE 1: Fetch ALL IDs from Intercom (paginate through everything)
      while (!stopRequestedRef.current) {
        pageNum++;
        
        // Calculate stats
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = allIds.length > 0 ? allIds.length / elapsed : 0;
        
        setProgress(prev => ({ 
          ...prev, 
          currentPage: pageNum,
          fetched: allIds.length,
          status: `📥 Page ${pageNum} | Fetched: ${allIds.length} IDs | Rate: ${rate.toFixed(1)}/sec`
        }));

        let response;
        let retries = 0;
        const maxRetries = 3;

        while (retries < maxRetries) {
          try {
            response = await fetch(API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'fetch-ids',
                dateFrom,
                dateTo,
                timeFrom,
                timeTo,
                timezoneOffset,
                startingAfter
              })
            });

            if (response.status === 429) {
              // Rate limited - exponential backoff
              currentBackoff = Math.min(currentBackoff * 2, MAX_BACKOFF);
              console.log(`Rate limited on page ${pageNum}, backing off ${currentBackoff}ms`);
              await new Promise(r => setTimeout(r, currentBackoff));
              retries++;
              continue;
            }

            if (!response.ok) {
              const errData = await parseJson(response);
              console.error('API error:', response.status, errData);
              throw new Error(errData.error || errData.details?.message || `HTTP ${response.status}`);
            }

            // Success - reset backoff
            currentBackoff = BASE_DELAY_MS;
            break;
          } catch (e) {
            retries++;
            if (retries >= maxRetries) throw e;
            await new Promise(r => setTimeout(r, currentBackoff));
          }
        }

        const data = await parseJson(response);
        console.log(`Page ${pageNum} response:`, { 
          success: data.success, 
          recordCount: data.data?.length, 
          totalCount: data.totalCount,
          hasMore: data.hasMore,
          nextStartingAfter: data.nextStartingAfter ? 'yes' : 'no',
          debug: data.debug
        });
        
        // Show debug info on first page
        if (pageNum === 1 && data.debug) {
          console.log('Query date range:', data.debug.queryFromDate, 'to', data.debug.queryToDate);
        }
        
        if (!data.success) {
          throw new Error(data.error || 'API returned success: false');
        }
        
        totalAvailable = data.totalCount ?? totalAvailable;
        const pageRecords = data.data || [];
        
        if (pageRecords.length > 0) {
          allIds = allIds.concat(pageRecords);
        }
        setProgress(prev => ({ ...prev, totalAvailable, fetched: allIds.length }));

        if (!data.hasMore || !data.nextStartingAfter) {
          console.log(`No more pages after page ${pageNum} (hasMore: ${data.hasMore}, nextStartingAfter: ${data.nextStartingAfter})`);
          break;
        }
        startingAfter = data.nextStartingAfter;

        // Small delay between pages
        await new Promise(r => setTimeout(r, currentBackoff));
      }

      if (stopRequestedRef.current) {
        setProgress(prev => ({ ...prev, status: `⏹️ Stopped. Fetched ${allIds.length} IDs.` }));
        return;
      }

      // PHASE 2: Batch insert ALL IDs to Supabase (100 at a time)
      setProgress(prev => ({ ...prev, status: `💾 Saving ${allIds.length} IDs to Supabase...` }));
      
      const BATCH_SIZE = 100;
      for (let i = 0; i < allIds.length && !stopRequestedRef.current; i += BATCH_SIZE) {
        const batch = allIds.slice(i, i + BATCH_SIZE);
        const { inserted } = await insertIdsBatch(batch);
        totalIdsSaved += inserted;
        setProgress(prev => ({ 
          ...prev, 
          saved: totalIdsSaved,
          status: `💾 Saved ${totalIdsSaved}/${allIds.length} IDs to Supabase...`
        }));
      }

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      setProgress(prev => ({ 
        ...prev, 
        saved: totalIdsSaved,
        status: `✅ Complete! Fetched ${allIds.length} IDs, saved ${totalIdsSaved} to Supabase in ${totalTime}s`
      }));

    } catch (err) {
      console.error('Fast ID fetch error:', err);
      setError(err.message);
      setProgress(prev => ({ ...prev, status: `❌ ${err.message}` }));
    } finally {
      setIsFetching(false);
      stopRequestedRef.current = false;
    }
  };

  // Two-phase fetch (like n8n): Phase 1 = IDs only 150/page → save; Phase 2 = pull full data per Conversation ID → update
  const handleFetchAndSave = async () => {
    if (!dateFrom || !dateTo) {
      setError('Please select a date range');
      return;
    }

    setIsFetching(true);
    setError('');
    stopRequestedRef.current = false;
    setProgress({ totalAvailable: 0, fetched: 0, saved: 0, currentPage: 0, analyzed: 0, toAnalyze: 0, status: '' });

    try {
      // ---------- PHASE 1: Pull only Conversation ID (150 per page), save to Supabase ----------
      setProgress(prev => ({ ...prev, status: '📥 Phase 1: Fetching Conversation IDs (150 per page) and saving...' }));
      
      let startingAfter = null;
      let pageNum = 0;
      let totalIdsSaved = 0;
      let totalAvailable = 0;

      while (!stopRequestedRef.current) {
        pageNum++;
        setProgress(prev => ({ 
          ...prev, 
          currentPage: pageNum,
          status: `📥 Phase 1 – Page ${pageNum}: Fetching 150 Conversation IDs...`
        }));

        const response = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'fetch-ids',
            dateFrom,
            dateTo,
            timeFrom,
            timeTo,
            timezoneOffset,
            startingAfter
          })
        });

        if (!response.ok) {
          const errData = await parseJson(response);
          throw new Error(errData.error || 'Failed to fetch IDs');
        }

        const data = await parseJson(response);
        totalAvailable = data.totalCount ?? totalAvailable;
        const pageRecords = data.data || [];
        
        if (pageRecords.length > 0) {
          setProgress(prev => ({ 
            ...prev, 
            totalAvailable,
            fetched: totalIdsSaved + pageRecords.length,
            status: `💾 Phase 1 – Saving ${pageRecords.length} IDs to Supabase...`
          }));
          const { inserted } = await insertIdsBatch(pageRecords);
          totalIdsSaved += inserted;
          setProgress(prev => ({ ...prev, saved: totalIdsSaved }));
        }

        if (!data.hasMore || !data.nextStartingAfter) break;
        startingAfter = data.nextStartingAfter;
      }

      if (stopRequestedRef.current) {
        setProgress(prev => ({ ...prev, status: '⏹️ Stopped.' }));
        return;
      }

      setProgress(prev => ({ ...prev, status: `✅ Phase 1 done. ${totalIdsSaved} Conversation IDs saved. Starting Phase 2...` }));

      // ---------- PHASE 2: PARALLEL processing – fetch 5 at a time from Intercom ----------
      const BATCH_SIZE = 5;
      const BASE_DELAY_MS = 300;
      let currentBackoff = BASE_DELAY_MS;
      const MAX_BACKOFF = 10000;

      // Get all conversation IDs that need enrichment
      const { data: allRows, error: allRowsErr } = await supabase
        .from('Intercom Topic')
        .select('"Conversation ID"')
        .order('created_at', { ascending: true });

      if (allRowsErr) {
        setError(`Supabase read error: ${allRowsErr.message}`);
        return;
      }

      const totalRows = allRows?.length || 0;
      const startTime = Date.now();
      let enriched = 0;
      let errorCount = 0;
      let phase2LastError = '';
      let processed = 0;

      for (let i = 0; i < totalRows && !stopRequestedRef.current; i += BATCH_SIZE) {
        const batchIds = allRows.slice(i, i + BATCH_SIZE).map(r => r['Conversation ID'] ?? r['"Conversation ID"']);

        // Calculate ETA
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = processed > 0 ? processed / elapsed : 0;
        const remaining = totalRows - processed;
        const etaSeconds = rate > 0 ? Math.round(remaining / rate) : 0;
        const etaStr = etaSeconds > 60 ? `${Math.round(etaSeconds / 60)}m` : `${etaSeconds}s`;

        setProgress(prev => ({
          ...prev,
          saved: totalIdsSaved,
          status: `📥 Phase 2 – Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(totalRows / BATCH_SIZE)} | Enriched: ${enriched}/${totalRows} | ETA: ${etaStr}`
        }));

        // Fetch all conversations in this batch in parallel
        const batchPromises = batchIds.map(async (convId) => {
          try {
            const res = await fetch(API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'fetch-details', conversationId: convId })
            });

            if (res.status === 429) {
              return { convId, error: 'rate_limited', status: 429 };
            }
            if (!res.ok) {
              return { convId, error: `${res.status} ${res.statusText}`, status: res.status };
            }

            const result = await parseJson(res);
            if (!result.success || !result.data) {
              return { convId, error: result.error || 'Empty API response' };
            }

            return { convId, data: result.data };
          } catch (err) {
            return { convId, error: err.message || String(err) };
          }
        });

        const results = await Promise.all(batchPromises);

        // Check if any were rate limited
        const rateLimited = results.filter(r => r.status === 429);
        if (rateLimited.length > 0) {
          currentBackoff = Math.min(currentBackoff * 2, MAX_BACKOFF);
          console.log(`Rate limited, backing off ${currentBackoff}ms`);
          await new Promise(r => setTimeout(r, currentBackoff));
          i -= BATCH_SIZE; // Retry this batch
          continue;
        } else {
          currentBackoff = BASE_DELAY_MS;
        }

        // Process successful results
        for (const r of results) {
          processed++;
          if (r.error) {
            phase2LastError = r.error;
            errorCount++;
            continue;
          }

          const ok = await updateRowInSupabase(r.convId, r.data);
          if (ok) enriched++;
          else {
            phase2LastError = 'Supabase update failed';
            errorCount++;
          }
        }

        await new Promise(r => setTimeout(r, currentBackoff));
      }

      const finalStatus = errorCount > 0
        ? `✅ Done. Enriched ${enriched} rows. Errors: ${errorCount}.${phase2LastError ? ` Last error: ${phase2LastError}` : ''}`
        : `✅ Complete. All ${enriched} rows enriched with full data.`;
      setProgress(prev => ({ ...prev, status: finalStatus }));

    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message);
      setProgress(prev => ({ ...prev, status: `❌ ${err.message}` }));
    } finally {
      setIsFetching(false);
      stopRequestedRef.current = false;
    }
  };

  // Analyze unanalyzed conversations
  const handleAnalyzeUnanalyzed = async () => {
    if (!itDateFrom || !itDateTo) {
      setError('Please select a date range before analyzing.');
      return;
    }
    setIsAnalyzing(true);
    setError('');
    stopRequestedRef.current = false;

    // Client-side concurrency. Each classify-topic call is a separate request from THIS browser IP to
    // Vercel, so too many in flight trips Vercel's per-IP edge rate-limiting (requests get bounced ->
    // 0 analyzed). 8 stays under that limit. For bulk/backfill, prefer the server-side
    // `topic-analyze-batch` action (one request per batch, concurrency handled inside the function).
    const BATCH_SIZE = 8;

    try {
      const { data: unanalyzed, error: fetchError } = await supabase
        .from('Intercom Topic')
        .select('"Conversation ID"')
        .in('Product', ['CFD', 'Futures'])
        .gte('created_date_bd', itDateFrom)
        .lte('created_date_bd', itDateTo)
        .or('"Sub-Topics".is.null,"Sub-Topics".eq.[]')
        .not('Transcript', 'is', null)
        .neq('Transcript', '')
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;

      if (!unanalyzed || unanalyzed.length === 0) {
        setError('No unanalyzed conversations found');
        setIsAnalyzing(false);
        return;
      }

      const total = unanalyzed.length;
      let analyzed = 0;
      let errors = 0;
      const startTime = Date.now();
      setProgress(prev => ({ ...prev, toAnalyze: total, analyzed: 0 }));

      // Continuous worker pool: keep BATCH_SIZE calls in flight at all times. The instant one finishes,
      // the worker pulls the next conversation — so a single slow gpt-5.4-mini response no longer stalls
      // the other 24 (which is what capped throughput at ~1.2/sec with the old batch barrier).
      const classifyOne = async (record) => {
        const convId = record['Conversation ID'];
        try {
          const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'classify-topic', conversationId: convId })
          });
          if (!response.ok) return false;
          const result = await parseJson(response);
          if (result.quotaExceeded) { stopRequestedRef.current = true; setError('⛔ OpenAI quota exceeded — add credits at platform.openai.com/billing, then re-run.'); return false; }
          if (result.success && result.data) {
            // classify-topic already writes to Supabase server-side; this is a safety-net write
            await supabase
              .from('Intercom Topic')
              .update({
                'Main-Topics': result.data['Main-Topics'],
                'Sub-Topics': result.data['Sub-Topics'],
                'Sentiment Start': result.data['Sentiment Start'],
                'Sentiment End': result.data['Sentiment End'],
                'Feedbacks': result.data['Feedbacks'],
                'is_feedback': result.data['is_feedback'] ?? false,
                'feedback_type': result.data['feedback_type'] ?? 'none',
                'feedback_priority': result.data['feedback_priority'] ?? null,
                'feedback_confidence': result.data['feedback_confidence'] ?? null,
                'feedback_reason': result.data['feedback_reason'] ?? null,
                'feedback_summary': result.data['feedback_summary'] ?? null,
                'client_quotes': result.data['client_quotes'] ?? 'NOT_FOUND',
                "Was it in client's favor?": result.data["Was it in client's favor?"] ?? null
              })
              .eq('"Conversation ID"', convId);
            return true;
          }
          return false;
        } catch { return false; }
      };

      let nextIdx = 0;
      let lastUiUpdate = 0;
      const worker = async () => {
        while (!stopRequestedRef.current) {
          const myIdx = nextIdx++;
          if (myIdx >= total) break;
          const ok = await classifyOne(unanalyzed[myIdx]);
          if (ok) analyzed++; else errors++;
          const now = Date.now();
          if (now - lastUiUpdate > 500) {
            lastUiUpdate = now;
            const elapsed = (now - startTime) / 1000;
            const rate = analyzed > 0 ? analyzed / elapsed : 0;
            const eta = rate > 0 ? Math.round((total - analyzed) / rate) : 0;
            const etaStr = eta > 60 ? `${Math.round(eta / 60)}m` : `${eta}s`;
            setProgress(prev => ({
              ...prev, analyzed,
              status: `🤖 Analyzing ${analyzed}/${total} | ${rate.toFixed(1)}/sec | ETA: ${etaStr}`
            }));
          }
        }
      };
      await Promise.all(Array.from({ length: BATCH_SIZE }, () => worker()));
      setProgress(prev => ({ ...prev, analyzed }));

      const finalElapsed = Math.round((Date.now() - startTime) / 1000);
      setProgress(prev => ({
        ...prev, analyzed,
        status: stopRequestedRef.current
          ? `⏹️ Stopped. Analyzed ${analyzed}/${total}. Errors: ${errors}. Time: ${finalElapsed}s.`
          : `✅ Done! Analyzed ${analyzed}/${total}. Errors: ${errors}. Time: ${finalElapsed}s.`
      }));
    } catch (err) {
      console.error('Analyze error:', err);
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
      stopRequestedRef.current = false;
    }
  };

  // Handle single conversation
  const handleAnalyzeSingle = async () => {
    if (!conversationId) {
      setError('Please enter a conversation ID');
      return;
    }

    setIsFetching(true);
    setError('');

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'classify-topic',
          conversationId
        })
      });

      const data = await parseJson(response);
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch conversation');
      }

      if (data.success && data.data) {
        // Save to Supabase
        await saveBatchToSupabase([data.data]);
        setProgress(prev => ({ ...prev, saved: 1, fetched: 1 }));
      }
    } catch (err) {
      console.error('Single fetch error:', err);
      setError(err.message);
    } finally {
      setIsFetching(false);
    }
  };

  // Stop any running process
  const handleStop = () => {
    stopRequestedRef.current = true;
  };

  // Test Intercom connection
  const handleTestIntercom = async () => {
    setError('');
    setProgress(prev => ({ ...prev, status: '🔍 Testing Intercom connection...' }));
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test-intercom' })
      });
      const result = await parseJson(res);
      console.log('Test Intercom result:', result);
      if (result.success) {
        setProgress(prev => ({ ...prev, status: `✅ ${result.message} Total: ${result.totalCount}` }));
        if (result.sampleIds) {
          console.log('Sample conversations:', result.sampleIds);
        }
      } else {
        setError(result.error || 'Test failed');
        setProgress(prev => ({ ...prev, status: `❌ ${result.error}` }));
      }
    } catch (err) {
      setError(err.message);
      setProgress(prev => ({ ...prev, status: `❌ ${err.message}` }));
    }
  };

  // List available datasets from Intercom Reporting Data Export API
  const handleListDatasets = async () => {
    setError('');
    setDatasets(null);
    setShowDatasets(true);
    setProgress(prev => ({ ...prev, status: '🔍 Fetching available datasets from Intercom...' }));

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list-datasets' })
      });
      const result = await parseJson(res);
      if (!result.success) {
        setError(result.error || 'Failed to fetch datasets');
        setProgress(prev => ({ ...prev, status: `❌ ${result.error || 'Failed'}` }));
        return;
      }
      setDatasets(result.datasets);
      setProgress(prev => ({ ...prev, status: '✅ Datasets loaded. See below.' }));
    } catch (err) {
      setError(err.message);
      setProgress(prev => ({ ...prev, status: `❌ ${err.message}` }));
    }
  };

  // --- Conversation Actions: day-by-day sync for reliability ---
  const handleSyncConversationActions = async () => {
    setConversationActionsUploading(true);
    setError('');
    const startTime = Date.now();
    const elapsed = () => `${Math.round((Date.now() - startTime) / 1000)}s`;

    // Build list of individual days using pure string math (no timezone shift)
    const days = [];
    const [fy, fm, fd] = conversationActionsDateFrom.split('-').map(Number);
    const [ty, tm, td] = conversationActionsDateTo.split('-').map(Number);
    const toNum = ty * 10000 + tm * 100 + td;
    let cy = fy, cm = fm, cd = fd;
    while (cy * 10000 + cm * 100 + cd <= toNum) {
      days.push(`${cy}-${String(cm).padStart(2,'0')}-${String(cd).padStart(2,'0')}`);
      cd++;
      const daysInMonth = new Date(cy, cm, 0).getDate();
      if (cd > daysInMonth) { cd = 1; cm++; }
      if (cm > 12) { cm = 1; cy++; }
    }

    let totalImported = 0;
    let totalCsvRows = 0;
    let dayErrors = [];

    stopRequestedRef.current = false;
    try {
      for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
        if (stopRequestedRef.current) { setConversationActionsStatus(`⏹️ Stopped. Imported ${totalImported} rows.`); break; }
        const day = days[dayIdx];
        const dayLabel = `Day ${dayIdx + 1}/${days.length} (${day})`;

        try {
          // Step 1: Enqueue export for this single day
          setConversationActionsStatus(`${dayLabel}: Enqueuing export... (${elapsed()} elapsed)`);
          const enqRes = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'ca-enqueue', dateFrom: day, dateTo: day })
          });
          const enqResult = await parseJson(enqRes);
          if (!enqResult.success) {
            dayErrors.push(`${day}: enqueue failed – ${enqResult.error || 'unknown'}`);
            continue;
          }
          const jobId = enqResult.jobId;

          // Step 2: Poll until complete
          let status = enqResult.status || 'pending';
          const isDone = (s) => s === 'complete' || s === 'completed';
          while (!isDone(status) && status !== 'failed') {
            await new Promise(r => setTimeout(r, 5000));
            setConversationActionsStatus(`${dayLabel}: Waiting for Intercom... status: ${status} (${elapsed()} elapsed)`);
            const pollRes = await fetch(API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'ca-poll', jobId })
            });
            const pollResult = await parseJson(pollRes);
            if (!pollResult.success) {
              dayErrors.push(`${day}: poll failed – ${pollResult.error || 'unknown'}`);
              status = 'failed';
              break;
            }
            status = pollResult.status || 'unknown';
          }
          if (status === 'failed') continue;

          // Step 3: Download, filter, import
          setConversationActionsStatus(`${dayLabel}: Downloading & importing... (${elapsed()} elapsed) | Running total: ${totalImported} rows`);
          const dlRes = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'ca-download-import', jobId })
          });
          const dlResult = await parseJson(dlRes);
          if (!dlResult.success) {
            dayErrors.push(`${day}: import failed – ${dlResult.error || 'unknown'}`);
            continue;
          }

          totalImported += dlResult.imported ?? 0;
          totalCsvRows += dlResult.totalCsvRows ?? 0;
          setConversationActionsStatus(`${dayLabel}: Done — ${dlResult.imported ?? 0} rows | Running total: ${totalImported} (${elapsed()} elapsed)`);
        } catch (dayErr) {
          dayErrors.push(`${day}: ${dayErr?.message || String(dayErr)}`);
          setConversationActionsStatus(`${dayLabel}: Error, skipping... | Running total: ${totalImported} (${elapsed()} elapsed)`);
          continue;
        }
      }

      // Final summary
      const errorSummary = dayErrors.length > 0 ? ` | Errors on ${dayErrors.length} day(s): ${dayErrors.join('; ')}` : '';
      setConversationActionsStatus(
        `Done! Imported ${totalImported} agent rows across ${days.length} day(s) (filtered from ${totalCsvRows} total CSV rows). Time: ${elapsed()}.${errorSummary}`
      );
    } catch (err) {
      setConversationActionsStatus(`Imported ${totalImported} rows before error.`);
      setError(err?.message || String(err));
    } finally {
      setConversationActionsUploading(false);
    }
  };

  // --- Conversation Dataset: day-by-day sync for Service Performance Overview ---
  const handleSyncConversationDataset = async () => {
    setConvDatasetUploading(true);
    setError('');
    const startTime = Date.now();
    const elapsed = () => `${Math.round((Date.now() - startTime) / 1000)}s`;

    const days = [];
    const [fy, fm, fd] = convDatasetDateFrom.split('-').map(Number);
    const [ty, tm, td] = convDatasetDateTo.split('-').map(Number);
    const toNum = ty * 10000 + tm * 100 + td;
    let cy = fy, cm = fm, cd = fd;
    while (cy * 10000 + cm * 100 + cd <= toNum) {
      days.push(`${cy}-${String(cm).padStart(2,'0')}-${String(cd).padStart(2,'0')}`);
      cd++;
      const daysInMonth = new Date(cy, cm, 0).getDate();
      if (cd > daysInMonth) { cd = 1; cm++; }
      if (cm > 12) { cm = 1; cy++; }
    }

    let totalImported = 0;
    let totalCsvRows = 0;
    let totalMovedToSpo = 0;
    let totalMovedToEmail = 0;
    let dayErrors = [];
    let lastDiagInfo = '';
    let lastUnmappedHeaders = [];
    let lastCsvHeaders = [];

    stopRequestedRef.current = false;
    try {
      for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
        if (stopRequestedRef.current) { setConvDatasetStatus(`⏹️ Stopped. Imported ${totalImported} rows.`); break; }
        const day = days[dayIdx];
        const dayLabel = `Day ${dayIdx + 1}/${days.length} (${day})`;

        try {
          // Sync via the Intercom reporting-data EXPORT (Conversation Actions dataset).
          // One export job per day → server dedupes action rows to unique human-served
          // conversations (bot replies excluded) and seeds one stub each into Service
          // Performance Overview. The Enrich step (unchanged) fills FRT/ART/AHT per agent.
          // Far fewer round-trips than the old per-page REST enumeration.
          setConvDatasetStatus(`${dayLabel}: Enqueuing export... (${elapsed()} elapsed) | total ${totalImported}`);
          const enqRes = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'cd-enqueue', dateFrom: day, dateTo: day })
          });
          const enqResult = await parseJson(enqRes);
          if (!enqResult.success) { dayErrors.push(`${day}: enqueue failed – ${enqResult.error || 'unknown'}`); continue; }
          const jobId = enqResult.jobId;

          // Poll until the export job is ready (short requests keep the session token fresh).
          let status = enqResult.status || 'pending';
          const isDone = (s) => s === 'complete' || s === 'completed';
          while (!isDone(status) && status !== 'failed') {
            if (stopRequestedRef.current) break;
            await new Promise(r => setTimeout(r, 5000));
            setConvDatasetStatus(`${dayLabel}: Waiting for Intercom... status: ${status} (${elapsed()} elapsed) | total ${totalImported}`);
            const pollRes = await fetch(API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'ca-poll', jobId })
            });
            const pollResult = await parseJson(pollRes);
            if (!pollResult.success) { dayErrors.push(`${day}: poll failed – ${pollResult.error || 'unknown'}`); status = 'failed'; break; }
            status = pollResult.status || 'unknown';
          }
          if (status === 'failed' || stopRequestedRef.current) continue;

          // Download the CSV, dedupe to unique human-served conversations, seed stubs.
          setConvDatasetStatus(`${dayLabel}: Downloading & importing... (${elapsed()} elapsed) | total ${totalImported}`);
          const dlRes = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'cd-download-import', jobId })
          });
          const dlResult = await parseJson(dlRes);
          if (!dlResult.success) { dayErrors.push(`${day}: import failed – ${dlResult.error || 'unknown'}`); continue; }
          const daySeeded = dlResult.imported ?? dlResult.movedToSpo ?? 0;
          totalImported += daySeeded;
          totalCsvRows += dlResult.totalCsvRows ?? 0;
          totalMovedToSpo += daySeeded;
          const skipMsg = dlResult.skippedExisting ? `, skipped ${dlResult.skippedExisting} already-present` : '';
          setConvDatasetStatus(`${dayLabel}: Done — seeded ${daySeeded} conversations${skipMsg} (from ${dlResult.totalCsvRows ?? 0} CSV rows) | Running total: ${totalImported} (${elapsed()} elapsed)`);
        } catch (dayErr) {
          dayErrors.push(`${day}: ${dayErr?.message || String(dayErr)}`);
          setConvDatasetStatus(`${dayLabel}: Error, skipping... | Running total: ${totalImported} (${elapsed()} elapsed)`);
          continue;
        }
      }

      const errorSummary = dayErrors.length > 0 ? ` | Errors on ${dayErrors.length} day(s): ${dayErrors.join('; ')}` : '';
      const moveSummary = (totalMovedToSpo > 0 || totalMovedToEmail > 0) ? ` | Auto-moved: ${totalMovedToSpo} → SPO, ${totalMovedToEmail} → Email` : '';
      const stickyDiag = (totalImported === 0 && lastDiagInfo)
        ? lastDiagInfo + (lastCsvHeaders.length ? ` | CSV headers: [${lastCsvHeaders.join(', ')}]` : '')
        : '';
      setConvDatasetStatus(
        `Done! Imported ${totalImported} rows across ${days.length} day(s) (from ${totalCsvRows} total CSV rows). Time: ${elapsed()}.${moveSummary}${errorSummary}${stickyDiag}`
      );
    } catch (err) {
      setConvDatasetStatus(`Imported ${totalImported} rows before error.`);
      setError(err?.message || String(err));
    } finally {
      setConvDatasetUploading(false);
    }
  };

  // --- Tickets Dataset: day-by-day sync ---
  const handleSyncTicketsDataset = async () => {
    setTicketsUploading(true);
    setError('');
    const startTime = Date.now();
    const elapsed = () => `${Math.round((Date.now() - startTime) / 1000)}s`;

    const days = [];
    const [fy, fm, fd] = ticketsDateFrom.split('-').map(Number);
    const [ty, tm, td] = ticketsDateTo.split('-').map(Number);
    const toNum = ty * 10000 + tm * 100 + td;
    let cy = fy, cm = fm, cd2 = fd;
    while (cy * 10000 + cm * 100 + cd2 <= toNum) {
      days.push(`${cy}-${String(cm).padStart(2,'0')}-${String(cd2).padStart(2,'0')}`);
      cd2++;
      const daysInMonth = new Date(cy, cm, 0).getDate();
      if (cd2 > daysInMonth) { cd2 = 1; cm++; }
      if (cm > 12) { cm = 1; cy++; }
    }

    let totalImported = 0;
    let totalCsvRows = 0;
    let dayErrors = [];
    stopRequestedRef.current = false;

    try {
      for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
        if (stopRequestedRef.current) { setTicketsStatus(`⏹️ Stopped. Imported ${totalImported} rows.`); break; }
        const day = days[dayIdx];
        const dayLabel = `Day ${dayIdx + 1}/${days.length} (${day})`;
        const etaStr = dayIdx > 0
          ? (() => {
              const secsPerDay = (Date.now() - startTime) / 1000 / dayIdx;
              const etaSecs = Math.round(secsPerDay * (days.length - dayIdx));
              if (etaSecs < 60) return ` | ETA: ~${etaSecs}s`;
              if (etaSecs < 3600) return ` | ETA: ~${Math.floor(etaSecs / 60)}m ${etaSecs % 60}s`;
              return ` | ETA: ~${Math.floor(etaSecs / 3600)}h ${Math.floor((etaSecs % 3600) / 60)}m`;
            })()
          : '';

        try {
          setTicketsStatus(`${dayLabel}: Enqueuing export... (${elapsed()} elapsed${etaStr})`);
          const enqRes = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'tickets-enqueue', dateFrom: day, dateTo: day })
          });
          const enqResult = await parseJson(enqRes);
          if (!enqResult.success) {
            const errMsg = enqResult.error || 'unknown';
            dayErrors.push(`${day}: enqueue failed – ${errMsg}`);
            if (dayIdx === 0) {
              setTicketsStatus(`FAILED on first day (${day}): ${errMsg}`);
              return;
            }
            continue;
          }
          const jobId = enqResult.jobId;

          let status = enqResult.status || 'pending';
          const isDone = (s) => s === 'complete' || s === 'completed';
          while (!isDone(status) && status !== 'failed') {
            await new Promise(r => setTimeout(r, 5000));
            setTicketsStatus(`${dayLabel}: Waiting for Intercom... status: ${status} (${elapsed()} elapsed${etaStr})`);
            const pollRes = await fetch(API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'ca-poll', jobId })
            });
            const pollResult = await parseJson(pollRes);
            if (!pollResult.success) {
              dayErrors.push(`${day}: poll failed – ${pollResult.error || 'unknown'}`);
              status = 'failed';
              break;
            }
            status = pollResult.status || 'unknown';
          }
          if (status === 'failed') continue;

          setTicketsStatus(`${dayLabel}: Downloading & importing... (${elapsed()} elapsed${etaStr}) | Running total: ${totalImported} rows`);
          const dlRes = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'tickets-download-import', jobId })
          });
          const dlResult = await parseJson(dlRes);
          if (!dlResult.success) {
            const errMsg = dlResult.error || 'unknown';
            dayErrors.push(`${day}: import failed – ${errMsg}`);
            if (dayIdx === 0) {
              const skipped = dlResult.skippedColumns ? ` | Skipped columns: ${dlResult.skippedColumns.join(', ')}` : '';
              setTicketsStatus(`FAILED on first day import (${day}): ${errMsg}${skipped}`);
              return;
            }
            continue;
          }

          totalImported += dlResult.imported ?? 0;
          totalCsvRows += dlResult.totalCsvRows ?? 0;
          const mappedInfo = dlResult.skippedColumns?.length ? ` | Skipped cols: ${dlResult.skippedColumns.join(', ')}` : '';
          setTicketsStatus(`${dayLabel}: Done — ${dlResult.imported ?? 0} rows | Running total: ${totalImported} (${elapsed()} elapsed${etaStr})${mappedInfo}`);
        } catch (dayErr) {
          dayErrors.push(`${day}: ${dayErr?.message || String(dayErr)}`);
          setTicketsStatus(`${dayLabel}: Error, skipping... | Running total: ${totalImported} (${elapsed()} elapsed)`);
          continue;
        }
      }

      const errorSummary = dayErrors.length > 0 ? ` | Errors on ${dayErrors.length} day(s): ${dayErrors.slice(0, 5).join('; ')}${dayErrors.length > 5 ? '...' : ''}` : '';
      setTicketsStatus(
        `Done! Imported ${totalImported} rows across ${days.length} day(s) (from ${totalCsvRows} total CSV rows). Time: ${elapsed()}.${errorSummary}`
      );
    } catch (err) {
      setTicketsStatus(`Imported ${totalImported} rows before error.`);
      setError(err?.message || String(err));
    } finally {
      setTicketsUploading(false);
    }
  };

  // --- Sync Tickets Dataset → ticket_logs (Reporting Data Export API) ---
  const handleSyncTicketsDatasetToLogs = async () => {
    setTdSyncing(true);
    setError('');
    setTdStatus('');
    stopRequestedRef.current = false;
    const startTime = Date.now();
    const elapsed = () => `${Math.round((Date.now() - startTime) / 1000)}s`;

    const days = [];
    const [fy, fm, fd] = tdDateFrom.split('-').map(Number);
    const [ty, tm, td] = tdDateTo.split('-').map(Number);
    const toNum = ty * 10000 + tm * 100 + td;
    let cy = fy, cm = fm, cd2 = fd;
    while (cy * 10000 + cm * 100 + cd2 <= toNum) {
      days.push(`${cy}-${String(cm).padStart(2, '0')}-${String(cd2).padStart(2, '0')}`);
      cd2++;
      const daysInMonth = new Date(cy, cm, 0).getDate();
      if (cd2 > daysInMonth) { cd2 = 1; cm++; }
      if (cm > 12) { cm = 1; cy++; }
    }

    let totalImported = 0;
    let totalCsvRows = 0;
    let dayErrors = [];

    try {
      for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
        if (stopRequestedRef.current) { setTdStatus(`Stopped. Imported ${totalImported} rows.`); break; }
        const day = days[dayIdx];
        const dayLabel = `Day ${dayIdx + 1}/${days.length} (${day})`;
        const etaStr = dayIdx > 0
          ? (() => {
              const secsPerDay = (Date.now() - startTime) / 1000 / dayIdx;
              const etaSecs = Math.round(secsPerDay * (days.length - dayIdx));
              if (etaSecs < 60) return ` | ETA: ~${etaSecs}s`;
              if (etaSecs < 3600) return ` | ETA: ~${Math.floor(etaSecs / 60)}m ${etaSecs % 60}s`;
              return ` | ETA: ~${Math.floor(etaSecs / 3600)}h ${Math.floor((etaSecs % 3600) / 60)}m`;
            })()
          : '';

        try {
          // Single REST call per day (Tickets Search API — replaces the
          // enqueue→poll→import Reporting Data Export flow, which hangs).
          setTdStatus(`${dayLabel}: Syncing tickets... (${elapsed()} elapsed${etaStr}) | Running total: ${totalImported} rows`);
          const syncRes = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'tickets-rest-sync', dateFrom: day, dateTo: day })
          });
          const syncResult = await parseJson(syncRes);
          if (!syncResult.success) {
            const errMsg = syncResult.error || 'unknown';
            dayErrors.push(`${day}: ${errMsg}`);
            if (dayIdx === 0) { setTdStatus(`FAILED on first day (${day}): ${errMsg}`); return; }
            continue;
          }

          totalImported += syncResult.imported ?? 0;
          totalCsvRows += syncResult.totalCsvRows ?? 0;
          setTdStatus(`${dayLabel}: Done — ${syncResult.imported ?? 0} rows | Running total: ${totalImported} (${elapsed()} elapsed${etaStr})`);
        } catch (dayErr) {
          dayErrors.push(`${day}: ${dayErr?.message || String(dayErr)}`);
          setTdStatus(`${dayLabel}: Error, skipping... | Running total: ${totalImported} (${elapsed()} elapsed)`);
          continue;
        }
      }

      const errorSummary = dayErrors.length > 0 ? ` | Errors on ${dayErrors.length} day(s): ${dayErrors.slice(0, 5).join('; ')}${dayErrors.length > 5 ? '...' : ''}` : '';
      setTdStatus(
        `Done! Imported ${totalImported} rows across ${days.length} day(s) (from ${totalCsvRows} total CSV rows). Time: ${elapsed()}.${errorSummary}`
      );
    } catch (err) {
      setTdStatus(`Imported ${totalImported} rows before error.`);
      setError(err?.message || String(err));
    } finally {
      setTdSyncing(false);
      stopRequestedRef.current = false;
    }
  };

  // --- SPO Enrich: fetch FRT/ART/AHT per agent from Intercom ---
  // --- FIN SPO: day-by-day sync ---
  const handleSyncFIN = async () => {
    setFinSyncing(true);
    setError('');
    stopRequestedRef.current = false;
    const startTime = Date.now();
    const elapsed = () => `${Math.round((Date.now() - startTime) / 1000)}s`;
    const days = [];
    const [fy, fm, fd] = finDateFrom.split('-').map(Number);
    const [ty, tm, td] = finDateTo.split('-').map(Number);
    const toNum = ty*10000+tm*100+td;
    let cy=fy,cm=fm,cd=fd;
    while(cy*10000+cm*100+cd<=toNum){days.push(`${cy}-${String(cm).padStart(2,'0')}-${String(cd).padStart(2,'0')}`);cd++;const dim=new Date(cy,cm,0).getDate();if(cd>dim){cd=1;cm++}if(cm>12){cm=1;cy++}}
    let totalImported=0, totalCsvRows=0, dayErrors=[];
    try {
      for(let i=0;i<days.length;i++){
        if(stopRequestedRef.current){setFinStatus(`⏹️ Stopped. Imported ${totalImported} rows.`);break}
        const day=days[i];
        const label=`Day ${i+1}/${days.length} (${day})`;
        try{
          setFinStatus(`${label}: Enqueuing... (${elapsed()})`);
          const enq=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'fin-enqueue',dateFrom:day,dateTo:day})});
          const enqR=await parseJson(enq);
          if(!enqR.success){dayErrors.push(`${day}: enqueue – ${enqR.error}`);continue}
          const jobId=enqR.jobId;
          let status=enqR.status||'pending';
          while(status!=='complete'&&status!=='completed'&&status!=='failed'&&!stopRequestedRef.current){
            await new Promise(r=>setTimeout(r,5000));
            setFinStatus(`${label}: Waiting... ${status} (${elapsed()})`);
            const poll=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'fin-poll',jobId})});
            const pollR=await parseJson(poll);
            if(!pollR.success){dayErrors.push(`${day}: poll – ${pollR.error}`);status='failed';break}
            status=pollR.status||'unknown';
          }
          if(status==='failed')continue;
          setFinStatus(`${label}: Importing... (${elapsed()}) | Total: ${totalImported}`);
          const dl=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'fin-download-import',jobId})});
          const dlR=await parseJson(dl);
          if(!dlR.success){dayErrors.push(`${day}: import – ${dlR.error}`);continue}
          totalImported+=dlR.imported??0;
          totalCsvRows+=dlR.totalCsvRows??0;
          setFinStatus(`${label}: Done — ${dlR.imported??0} rows | Total: ${totalImported} (${elapsed()})`);
        }catch(e){dayErrors.push(`${day}: ${e?.message}`);continue}
      }
      const errSum=dayErrors.length>0?` | Errors: ${dayErrors.slice(0,3).join('; ')}${dayErrors.length>3?'...':''}`:'';
      setFinStatus(`Done! Imported ${totalImported} rows across ${days.length} day(s). Time: ${elapsed()}.${errSum}`);
    }catch(err){setFinStatus(`Error: ${err?.message}`);setError(err?.message||String(err))}
    finally{setFinSyncing(false);stopRequestedRef.current=false}
  };

  // --- CSAT: Populate Product Type from Intercom ---
  const [csatProductLoading, setCsatProductLoading] = useState(false);
  const [csatProductStatus, setCsatProductStatus] = useState('');

  const handleCsatPopulateProduct = async () => {
    setCsatProductLoading(true);
    setCsatProductStatus('');
    setError('');
    stopRequestedRef.current = false;
    const startTime = Date.now();
    const elapsed = () => Math.round((Date.now() - startTime) / 1000);

    try {
      if (!csatDateFrom || !csatDateTo) {
        setCsatProductStatus('❌ Pick a date range first.');
        setCsatProductLoading(false);
        return;
      }

      const days = [];
      const [fy, fm, fd] = csatDateFrom.split('-').map(Number);
      const [ty, tm, td] = csatDateTo.split('-').map(Number);
      const toNum = ty * 10000 + tm * 100 + td;
      let cy = fy, cm = fm, cd = fd;
      while (cy * 10000 + cm * 100 + cd <= toNum) {
        days.push(`${cy}-${String(cm).padStart(2,'0')}-${String(cd).padStart(2,'0')}`);
        cd++;
        const dim = new Date(cy, cm, 0).getDate();
        if (cd > dim) { cd = 1; cm++; }
        if (cm > 12) { cm = 1; cy++; }
      }

      let totalSeen = 0, totalFromTopic = 0, totalDerived = 0, totalSkipped = 0, totalErrors = 0;
      const dayFailures = [];

      for (let i = 0; i < days.length && !stopRequestedRef.current; i++) {
        const day = days[i];
        const dayLabel = `Day ${i + 1}/${days.length} (${day})`;
        setCsatProductStatus(`${dayLabel}: patching... | topic ${totalFromTopic}, derived ${totalDerived}, skipped ${totalSkipped}, errors ${totalErrors} | ${elapsed()}s`);

        try {
          const resp = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'csat-patch-product-type', dateFrom: day, dateTo: day })
          });
          const result = await parseJson(resp);
          if (!result.success) {
            dayFailures.push(`${day}: ${result.error || 'unknown'}`);
            continue;
          }
          totalSeen      += Number(result.total)     || 0;
          totalFromTopic += Number(result.fromTopic) || 0;
          totalDerived   += Number(result.derived)   || 0;
          totalSkipped   += Number(result.skipped)   || 0;
          totalErrors    += Number(result.errors)    || 0;
        } catch (e) {
          dayFailures.push(`${day}: ${e.message || String(e)}`);
        }
      }

      const filled = totalFromTopic + totalDerived;
      const failTail = dayFailures.length ? ` | ${dayFailures.length} day(s) failed` : '';
      setCsatProductStatus(stopRequestedRef.current
        ? `⏹️ Stopped. Filled ${filled}/${totalSeen} (topic ${totalFromTopic} + derived ${totalDerived}), skipped ${totalSkipped}, errors ${totalErrors}. Time: ${elapsed()}s.${failTail}`
        : `✅ Done. Filled ${filled}/${totalSeen} (topic ${totalFromTopic} + derived ${totalDerived}), skipped ${totalSkipped}, errors ${totalErrors}. Time: ${elapsed()}s.${failTail}`
      );
      if (dayFailures.length) console.warn('csat-patch-product-type day failures:', dayFailures);
    } catch (err) {
      setError(err.message);
      setCsatProductStatus(`❌ ${err.message}`);
    } finally {
      setCsatProductLoading(false);
      stopRequestedRef.current = false;
    }
  };

  // --- CSAT: day-by-day sync from Conversation Rating dataset ---
  const handleSyncCSAT = async () => {
    setCsatSyncing(true);
    setError('');
    stopRequestedRef.current = false;
    const startTime = Date.now();
    const elapsed = () => `${Math.round((Date.now() - startTime) / 1000)}s`;

    const days = [];
    const [fy, fm, fd] = csatDateFrom.split('-').map(Number);
    const [ty, tm, td] = csatDateTo.split('-').map(Number);
    const toNum = ty * 10000 + tm * 100 + td;
    let cy = fy, cm = fm, cd = fd;
    while (cy * 10000 + cm * 100 + cd <= toNum) {
      days.push(`${cy}-${String(cm).padStart(2,'0')}-${String(cd).padStart(2,'0')}`);
      cd++;
      const dim = new Date(cy, cm, 0).getDate();
      if (cd > dim) { cd = 1; cm++; }
      if (cm > 12) { cm = 1; cy++; }
    }

    // Rating sync via the REST conversations/search API (csat-sync-rest). The old
    // reporting-data export path (csat-enqueue/poll/download-import) broke ~2026-07-03
    // and returns almost no rows, so it is no longer used here. Each day also gets its
    // Product Type populated inline (csat-patch-product-type) so a single run fills the
    // data the dashboard actually filters on.
    let totalRated = 0;
    let totalUpserted = 0;
    let totalProductSeen = 0;
    let totalProductFilled = 0;
    let dayErrors = [];

    try {
      for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
        if (stopRequestedRef.current) { setCsatSyncStatus(`⏹️ Stopped. Synced ${totalUpserted} ratings.`); break; }
        const day = days[dayIdx];
        const dayLabel = `Day ${dayIdx + 1}/${days.length} (${day})`;

        try {
          // Step 1: sync ratings, cursor-chained until the day is fully scanned.
          // Intercom's /conversations/search is currently degraded to ~14s/page, so a
          // full day (~28 pages) takes several minutes. Keep maxPages small (5, ~70s per
          // call) so this status line advances between calls and the run visibly progresses
          // instead of appearing frozen on "rated 0" during one long multi-page call.
          let cursor = null, dayRated = 0, dayUpserted = 0, dayScanned = 0, safety = 0;
          do {
            if (stopRequestedRef.current) break;
            setCsatSyncStatus(`${dayLabel}: scanning conversations${cursor ? ' (cont.)' : ''}... ${totalRated + dayRated} rated / ${dayScanned} scanned (${elapsed()})`);
            const body = { action: 'csat-sync-rest', dateFrom: day, dateTo: day, maxPages: 5 };
            if (cursor) body.cursor = cursor;
            const res = await fetch(API_URL, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            });
            const r = await parseJson(res);
            if (!r.success) { dayErrors.push(`${day}: sync – ${r.error}`); cursor = null; break; }
            dayRated += r.rated ?? 0;
            dayUpserted += r.upserted ?? 0;
            dayScanned += r.scanned ?? 0;
            cursor = r.done ? null : (r.nextCursor || null);
            safety++;
          } while (cursor && safety < 20 && !stopRequestedRef.current);
          totalRated += dayRated;
          totalUpserted += dayUpserted;
          if (stopRequestedRef.current) { setCsatSyncStatus(`⏹️ Stopped. Synced ${totalUpserted} ratings.`); break; }

          // Step 2: populate Product Type for the same day (CFD / Futures) so the
          // dashboard's `Product Type IN ('CFD','Futures')` filter can see the rows.
          setCsatSyncStatus(`${dayLabel}: populating product... rated ${totalRated}, product ${totalProductFilled} (${elapsed()})`);
          const pRes = await fetch(API_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'csat-patch-product-type', dateFrom: day, dateTo: day })
          });
          const pr = await parseJson(pRes);
          if (!pr.success) {
            dayErrors.push(`${day}: product – ${pr.error}`);
          } else {
            totalProductSeen += Number(pr.total) || 0;
            totalProductFilled += (Number(pr.fromTopic) || 0) + (Number(pr.derived) || 0);
          }
          setCsatSyncStatus(`${dayLabel}: done — ${dayUpserted} ratings, product ${totalProductFilled}/${totalProductSeen} (${elapsed()})`);
        } catch (dayErr) {
          dayErrors.push(`${day}: ${dayErr?.message || String(dayErr)}`);
          continue;
        }
      }

      const errorSummary = dayErrors.length > 0 ? ` | Errors: ${dayErrors.slice(0, 3).join('; ')}${dayErrors.length > 3 ? '...' : ''}` : '';
      setCsatSyncStatus(`Done! Synced ${totalUpserted} ratings + filled product ${totalProductFilled}/${totalProductSeen} across ${days.length} day(s). Time: ${elapsed()}.${errorSummary}`);
    } catch (err) {
      setCsatSyncStatus(`Synced ${totalUpserted} ratings before error.`);
      setError(err?.message || String(err));
    } finally {
      setCsatSyncing(false);
      stopRequestedRef.current = false;
    }
  };

  // --- Intercom Topic: day-by-day sync from Conversations dataset ---
  const handleSyncIntercomTopic = async () => {
    setItSyncing(true);
    setError('');
    const startTime = Date.now();
    const elapsed = () => `${Math.round((Date.now() - startTime) / 1000)}s`;

    const days = [];
    const [fy, fm, fd] = itDateFrom.split('-').map(Number);
    const [ty, tm, td] = itDateTo.split('-').map(Number);
    const toNum = ty * 10000 + tm * 100 + td;
    let cy = fy, cm = fm, cd = fd;
    while (cy * 10000 + cm * 100 + cd <= toNum) {
      days.push(`${cy}-${String(cm).padStart(2,'0')}-${String(cd).padStart(2,'0')}`);
      cd++;
      const daysInMonth = new Date(cy, cm, 0).getDate();
      if (cd > daysInMonth) { cd = 1; cm++; }
      if (cm > 12) { cm = 1; cy++; }
    }

    let totalImported = 0;
    let totalCsvRows = 0;
    let dayErrors = [];

    try {
      for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
        if (stopRequestedRef.current) { setItStatus(`⏹️ Stopped. Imported ${totalImported} rows.`); break; }
        const day = days[dayIdx];
        const dayLabel = `Day ${dayIdx + 1}/${days.length} (${day})`;

        try {
          setItStatus(`${dayLabel}: Enqueuing export... (${elapsed()})`);
          const enqRes = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'it-enqueue', dateFrom: day, dateTo: day })
          });
          const enqResult = await parseJson(enqRes);
          if (!enqResult.success) { dayErrors.push(`${day}: enqueue – ${enqResult.error || 'unknown'}`); continue; }
          const jobId = enqResult.jobId;

          let status = enqResult.status || 'pending';
          const isDone = (s) => s === 'complete' || s === 'completed';
          while (!isDone(status) && status !== 'failed' && !stopRequestedRef.current) {
            await new Promise(r => setTimeout(r, 5000));
            setItStatus(`${dayLabel}: Waiting... status: ${status} (${elapsed()})`);
            const pollRes = await fetch(API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'it-poll', jobId })
            });
            const pollResult = await parseJson(pollRes);
            if (!pollResult.success) { dayErrors.push(`${day}: poll – ${pollResult.error || 'unknown'}`); status = 'failed'; break; }
            status = pollResult.status || 'unknown';
          }
          if (status === 'failed') continue;

          setItStatus(`${dayLabel}: Downloading & importing... (${elapsed()}) | Total: ${totalImported}`);
          const dlRes = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'it-download-import', jobId })
          });
          const dlResult = await parseJson(dlRes);
          if (!dlResult.success) { dayErrors.push(`${day}: import – ${dlResult.error || 'unknown'}`); continue; }

          totalImported += dlResult.imported ?? 0;
          totalCsvRows += dlResult.totalCsvRows ?? 0;
          const unmappedInfo = dlResult.unmappedHeaders?.length ? ` | Unmapped: [${dlResult.unmappedHeaders.join(', ')}]` : '';
          setItStatus(`${dayLabel}: Done — ${dlResult.imported ?? 0} rows | Total: ${totalImported} (${elapsed()})${unmappedInfo}`);
        } catch (dayErr) {
          dayErrors.push(`${day}: ${dayErr?.message || String(dayErr)}`);
          setItStatus(`${dayLabel}: Error, skipping... | Total: ${totalImported} (${elapsed()})`);
          continue;
        }
      }

      const errorSummary = dayErrors.length > 0 ? ` | Errors on ${dayErrors.length} day(s): ${dayErrors.slice(0, 3).join('; ')}${dayErrors.length > 3 ? '...' : ''}` : '';
      setItStatus(`Done! Imported ${totalImported} rows across ${days.length} day(s) (from ${totalCsvRows} CSV rows). Time: ${elapsed()}.${errorSummary}`);
    } catch (err) {
      setItStatus(`Imported ${totalImported} rows before error.`);
      setError(err?.message || String(err));
    } finally {
      setItSyncing(false);
      stopRequestedRef.current = false;
    }
  };

  const handleSpoEnrich = async (forceAll = false, transfersOnly = false) => {
    setSpoEnriching(true);
    setSpoEnrichStatus(transfersOnly ? 'Starting transfer chat re-enrichment...' : 'Starting enrichment...');
    setError('');
    const enrichRange = spoEnrichRange ? parseDateRange(spoEnrichRange) : null;
    const enrichDateFrom = enrichRange?.from || null;
    const enrichDateTo = enrichRange?.to || null;
    const startTime = Date.now();
    const elapsed = () => `${Math.round((Date.now() - startTime) / 1000)}s`;
    let totalEnriched = 0;
    let totalProcessed = 0;
    let allErrors = [];
    const MAX_CONSECUTIVE_FAILURES = 5;

    try {
      const parseJson = async (r) => {
        const text = await r.text();
        try { return JSON.parse(text); } catch { return { success: false, error: 'Invalid JSON: ' + text.substring(0, 200) }; }
      };

      let remaining = Infinity;
      let batch = 0;
      let consecutiveFailures = 0;

      while (remaining > 0) {
        batch++;
        const etaStr = totalProcessed > 0 && remaining < Infinity
          ? (() => {
              const secsPerConv = (Date.now() - startTime) / 1000 / totalProcessed;
              const etaSecs = Math.round(secsPerConv * remaining);
              if (etaSecs < 60) return `~${etaSecs}s`;
              if (etaSecs < 3600) return `~${Math.floor(etaSecs / 60)}m ${etaSecs % 60}s`;
              return `~${Math.floor(etaSecs / 3600)}h ${Math.floor((etaSecs % 3600) / 60)}m`;
            })()
          : '';
        setSpoEnrichStatus(`Batch ${batch}: Processing up to 100 conversations (10 parallel)... (${totalEnriched} enriched, ${elapsed()} elapsed${etaStr ? ` | ETA: ${etaStr}` : ''})`);

        let result;
        try {
          const resp = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'spo-enrich', batchSize: 100, force: forceAll, transfersOnly, dateFrom: enrichDateFrom, dateTo: enrichDateTo, syncedAtFrom: enrichDateFrom, syncedAtTo: enrichDateTo })
          });
          result = await parseJson(resp);
        } catch (fetchErr) {
          consecutiveFailures++;
          const errMsg = fetchErr?.message || String(fetchErr);
          allErrors.push(`Batch ${batch}: ${errMsg}`);
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            setSpoEnrichStatus(`Stopped after ${MAX_CONSECUTIVE_FAILURES} consecutive failures. Enriched ${totalEnriched} so far. Last error: ${errMsg}. Time: ${elapsed()}.`);
            break;
          }
          setSpoEnrichStatus(`Batch ${batch} failed (${errMsg}), retrying... (${totalEnriched} enriched, ${elapsed()} elapsed)`);
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }

        if (!result.success && result.enriched === undefined) {
          consecutiveFailures++;
          allErrors.push(`Batch ${batch}: ${result.error || 'unknown'}`);
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            setSpoEnrichStatus(`Stopped after ${MAX_CONSECUTIVE_FAILURES} consecutive API errors. Enriched ${totalEnriched} so far. Last error: ${result.error || 'unknown'}. Time: ${elapsed()}.`);
            break;
          }
          setSpoEnrichStatus(`Batch ${batch} error: ${result.error || 'unknown'}, retrying... (${totalEnriched} enriched, ${elapsed()} elapsed)`);
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }

        consecutiveFailures = 0;
        totalEnriched += result.enriched || 0;
        totalProcessed += result.processed || 0;
        remaining = (result.remaining !== null && result.remaining !== undefined && result.remaining >= 0) ? result.remaining : Infinity;

        if (result.errors && result.errors.length > 0) {
          allErrors = allErrors.concat(result.errors);
        }

        if (result.firstError) {
          allErrors.push(`DB: ${result.firstError}`);
          setSpoEnrichStatus(`Batch ${batch}: ERROR → ${result.firstError} | ${totalEnriched} enriched so far (${elapsed()}) — retrying...`);
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        if ((result.processed || 0) === 0 && remaining <= 0) {
          break;
        }

        const etaDone = totalProcessed > 0 && remaining > 0
          ? (() => {
              const secsPerConv = (Date.now() - startTime) / 1000 / totalProcessed;
              const etaSecs = Math.round(secsPerConv * remaining);
              if (etaSecs < 60) return `~${etaSecs}s`;
              if (etaSecs < 3600) return `~${Math.floor(etaSecs / 60)}m ${etaSecs % 60}s`;
              return `~${Math.floor(etaSecs / 3600)}h ${Math.floor((etaSecs % 3600) / 60)}m`;
            })()
          : '';
        setSpoEnrichStatus(`Batch ${batch} done: ${result.enriched}/${result.processed} enriched | Total: ${totalEnriched} | ${remaining} remaining | ${elapsed()} elapsed${etaDone ? ` | ETA: ${etaDone}` : ''}`);
      }

      const errSummary = allErrors.length > 0 ? ` | ${allErrors.length} error(s): ${allErrors.slice(0, 5).join('; ')}${allErrors.length > 5 ? '...' : ''}` : '';
      setSpoEnrichStatus(`Done! Enriched ${totalEnriched} conversations across ${batch} batch(es). ${remaining > 0 ? `${remaining} still remaining. ` : ''}Time: ${elapsed()}.${errSummary}`);
    } catch (err) {
      setSpoEnrichStatus(`Enriched ${totalEnriched} before error: ${err?.message || String(err)}. Click the button again to resume.`);
      setError(err?.message || String(err));
    } finally {
      setSpoEnriching(false);
    }
  };

  const handleEmailEnrich = async () => {
    setEmailEnriching(true);
    setEmailEnrichStatus('Starting email enrichment...');
    setError('');
    const startTime = Date.now();
    const elapsed = () => `${Math.round((Date.now() - startTime) / 1000)}s`;
    let totalEnriched = 0;
    let totalProcessed = 0;
    let allErrors = [];
    const MAX_CONSECUTIVE_FAILURES = 5;

    try {
      const parseJson = async (r) => {
        const text = await r.text();
        try { return JSON.parse(text); } catch { return { success: false, error: 'Invalid JSON: ' + text.substring(0, 200) }; }
      };

      let remaining = Infinity;
      let batch = 0;
      let consecutiveFailures = 0;

      while (remaining > 0 && !stopRequestedRef.current) {
        batch++;
        const etaStr = totalProcessed > 0 && remaining < Infinity
          ? (() => {
              const secsPerConv = (Date.now() - startTime) / 1000 / totalProcessed;
              const etaSecs = Math.round(secsPerConv * remaining);
              if (etaSecs < 60) return `~${etaSecs}s`;
              if (etaSecs < 3600) return `~${Math.floor(etaSecs / 60)}m ${etaSecs % 60}s`;
              return `~${Math.floor(etaSecs / 3600)}h ${Math.floor((etaSecs % 3600) / 60)}m`;
            })()
          : '';
        setEmailEnrichStatus(`Batch ${batch}: Processing up to 50 emails (5 parallel)... (${totalEnriched} enriched, ${elapsed()} elapsed${etaStr ? ` | ETA: ${etaStr}` : ''})`);

        let result;
        try {
          const resp = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'spo-enrich-email', batchSize: 50 })
          });
          result = await parseJson(resp);
        } catch (fetchErr) {
          consecutiveFailures++;
          const errMsg = fetchErr?.message || String(fetchErr);
          allErrors.push(`Batch ${batch}: ${errMsg}`);
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            setEmailEnrichStatus(`Stopped after ${MAX_CONSECUTIVE_FAILURES} consecutive failures. Enriched ${totalEnriched} so far. Last error: ${errMsg}. Time: ${elapsed()}.`);
            break;
          }
          setEmailEnrichStatus(`Batch ${batch} failed (${errMsg}), retrying... (${totalEnriched} enriched, ${elapsed()} elapsed)`);
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }

        if (!result.success && result.enriched === undefined) {
          consecutiveFailures++;
          allErrors.push(`Batch ${batch}: ${result.error || 'unknown'}`);
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            setEmailEnrichStatus(`Stopped after ${MAX_CONSECUTIVE_FAILURES} consecutive API errors. Enriched ${totalEnriched} so far. Last error: ${result.error || 'unknown'}. Time: ${elapsed()}.`);
            break;
          }
          setEmailEnrichStatus(`Batch ${batch} error: ${result.error || 'unknown'}, retrying... (${totalEnriched} enriched, ${elapsed()} elapsed)`);
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }

        consecutiveFailures = 0;
        totalEnriched += result.enriched || 0;
        totalProcessed += result.processed || 0;
        remaining = (result.remaining !== null && result.remaining !== undefined && result.remaining >= 0) ? result.remaining : Infinity;

        if (result.errors && result.errors.length > 0) {
          allErrors = allErrors.concat(result.errors);
        }

        if (result.firstError) {
          allErrors.push(`DB: ${result.firstError}`);
          setEmailEnrichStatus(`Batch ${batch}: ERROR → ${result.firstError} | ${totalEnriched} enriched so far (${elapsed()}) — retrying...`);
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        if ((result.processed || 0) === 0 && remaining <= 0) {
          break;
        }

        const etaDone = totalProcessed > 0 && remaining > 0
          ? (() => {
              const secsPerConv = (Date.now() - startTime) / 1000 / totalProcessed;
              const etaSecs = Math.round(secsPerConv * remaining);
              if (etaSecs < 60) return `~${etaSecs}s`;
              if (etaSecs < 3600) return `~${Math.floor(etaSecs / 60)}m ${etaSecs % 60}s`;
              return `~${Math.floor(etaSecs / 3600)}h ${Math.floor((etaSecs % 3600) / 60)}m`;
            })()
          : '';
        setEmailEnrichStatus(`Batch ${batch} done: ${result.enriched}/${result.processed} enriched | Total: ${totalEnriched} | ${remaining} remaining | ${elapsed()} elapsed${etaDone ? ` | ETA: ${etaDone}` : ''}`);
      }

      const errSummary = allErrors.length > 0 ? ` | ${allErrors.length} error(s): ${allErrors.slice(0, 5).join('; ')}${allErrors.length > 5 ? '...' : ''}` : '';
      setEmailEnrichStatus(`Done! Enriched ${totalEnriched} email conversations across ${batch} batch(es). ${remaining > 0 ? `${remaining} still remaining. ` : ''}Time: ${elapsed()}.${errSummary}`);
    } catch (err) {
      setEmailEnrichStatus(`Enriched ${totalEnriched} before error: ${err?.message || String(err)}. Click the button again to resume.`);
      setError(err?.message || String(err));
    } finally {
      setEmailEnriching(false);
      stopRequestedRef.current = false;
    }
  };

  const handleFrtRecalc = async () => {
    setFrtRecalcing(true);
    setFrtRecalcStatus('Starting FRT recalculation...');
    const startTime = Date.now();
    const elapsed = () => `${Math.round((Date.now() - startTime) / 1000)}s`;
    let totalUpdated = 0;
    let totalProcessed = 0;
    let batch = 0;
    let remaining = Infinity;

    try {
      while (remaining > 0) {
        batch++;
        const etaStr = totalProcessed > 0 && remaining < Infinity
          ? (() => {
              const s = Math.round(((Date.now() - startTime) / 1000 / totalProcessed) * remaining);
              return s < 60 ? `~${s}s` : s < 3600 ? `~${Math.floor(s / 60)}m ${s % 60}s` : `~${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
            })()
          : '';
        setFrtRecalcStatus(`Batch ${batch}: Recalculating FRT... (${totalUpdated} updated, ${elapsed()} elapsed${etaStr ? ` | ETA: ${etaStr}` : ''})`);

        let result;
        try {
          const resp = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'spo-recalc-frt', batchSize: 100 })
          });
          const text = await resp.text();
          try { result = JSON.parse(text); } catch { result = { success: false, error: 'Invalid JSON' }; }
        } catch (fetchErr) {
          setFrtRecalcStatus(`Batch ${batch} failed: ${fetchErr?.message}, retrying... (${totalUpdated} updated, ${elapsed()})`);
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }

        if (!result.success && result.updated === undefined) {
          setFrtRecalcStatus(`Batch ${batch} error: ${result.error}, retrying... (${totalUpdated} updated, ${elapsed()})`);
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }

        totalUpdated += result.updated || 0;
        totalProcessed += result.processed || 0;
        remaining = (result.remaining !== null && result.remaining !== undefined) ? result.remaining : Infinity;

        if ((result.processed || 0) === 0 && remaining <= 0) break;
      }
      setFrtRecalcStatus(`Done! Updated FRT for ${totalUpdated} rows across ${batch} batch(es). Time: ${elapsed()}.`);
    } catch (err) {
      setFrtRecalcStatus(`Error after ${totalUpdated} updates: ${err?.message || String(err)}`);
    } finally {
      setFrtRecalcing(false);
    }
  };

  const handleUpdateTimestamps = async () => {
    setFrtRecalcing(true);
    setFrtRecalcStatus('Updating conversation timestamps...');
    const startTime = Date.now();
    const elapsed = () => `${Math.round((Date.now() - startTime) / 1000)}s`;
    let totalUpdated = 0;
    let totalProcessed = 0;
    let batch = 0;
    let remaining = Infinity;

    try {
      while (remaining > 0) {
        batch++;
        const etaStr = totalProcessed > 0 && remaining < Infinity
          ? (() => {
              const s = Math.round(((Date.now() - startTime) / 1000 / totalProcessed) * remaining);
              return s < 60 ? `~${s}s` : s < 3600 ? `~${Math.floor(s / 60)}m ${s % 60}s` : `~${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
            })()
          : '';
        setFrtRecalcStatus(`Batch ${batch}: Updating timestamps... (${totalUpdated} updated, ${elapsed()} elapsed${etaStr ? ` | ETA: ${etaStr}` : ''})`);

        let result;
        try {
          const resp = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'spo-recalc-frt', batchSize: 30, updateTimeOnly: true })
          });
          const text = await resp.text();
          try { result = JSON.parse(text); } catch { result = { success: false, error: 'Invalid JSON' }; }
        } catch (fetchErr) {
          setFrtRecalcStatus(`Batch ${batch} failed: ${fetchErr?.message}, retrying... (${totalUpdated} updated, ${elapsed()})`);
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }

        if (!result.success && result.updated === undefined) {
          setFrtRecalcStatus(`Batch ${batch} error: ${result.error}, retrying... (${totalUpdated} updated, ${elapsed()})`);
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }

        totalUpdated += result.updated || 0;
        totalProcessed += result.processed || 0;
        remaining = (result.remaining !== null && result.remaining !== undefined) ? result.remaining : Infinity;

        if ((result.processed || 0) === 0 && remaining <= 0) break;
      }
      setFrtRecalcStatus(`Done! Updated timestamps for ${totalUpdated} rows across ${batch} batch(es). Time: ${elapsed()}.`);
    } catch (err) {
      setFrtRecalcStatus(`Error after ${totalUpdated} updates: ${err?.message || String(err)}`);
    } finally {
      setFrtRecalcing(false);
    }
  };

  const isProcessing = isFetching || isAnalyzing || csatProductLoading || csatSyncing || itSyncing;

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.6)',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        border: '1px solid rgba(255, 255, 255, 0.15)'
      }}>
        <h2 style={{ color: '#F8FAFC', margin: '0 0 1rem 0', fontSize: '1.25rem' }}>
          ⚙️ Topic Analyzer Admin
        </h2>
        <p style={{ color: '#94A3B8', margin: 0, fontSize: '0.875rem' }}>
          Fetch conversations from Intercom and save to Supabase. Analyze with AI separately.
        </p>
      </div>

      {/* Mode Selector */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '1.5rem'
      }}>
        {['single', 'range'].map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            disabled={isProcessing}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              background: mode === m ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255, 255, 255, 0.05)',
              color: mode === m ? '#C084FC' : '#94A3B8',
              fontSize: '0.875rem',
              fontWeight: '600',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: isProcessing ? 0.6 : 1
            }}
          >
            {m === 'single' ? '🎯 Single Conversation' : '📅 Date Range'}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.4)',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        border: '1px solid rgba(255, 255, 255, 0.05)'
      }}>
        {mode === 'single' ? (
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', color: '#94A3B8', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                Conversation ID
              </label>
              <input
                type="text"
                value={conversationId}
                onChange={(e) => setConversationId(e.target.value)}
                placeholder="e.g., 215471991646547"
                disabled={isProcessing}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(15, 23, 42, 0.6)',
                  color: '#F8FAFC',
                  fontSize: '0.875rem',
                  outline: 'none'
                }}
              />
            </div>
            <button
              onClick={handleAnalyzeSingle}
              disabled={isProcessing || !conversationId}
              style={{
                padding: '0.75rem 2rem',
                borderRadius: '8px',
                border: 'none',
                background: isProcessing ? 'rgba(139, 92, 246, 0.3)' : 'linear-gradient(135deg, #7C3AED, #7C3AED)',
                color: '#fff',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: isProcessing ? 'wait' : 'pointer'
              }}
            >
              {isFetching ? '⏳ Fetching...' : '🔍 Fetch & Save'}
            </button>
          </div>
        ) : null}
      </div>

      {/* Sync Intercom Topic Dataset */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.4)',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        border: '1px solid rgba(16, 185, 129, 0.2)'
      }}>
        <h3 style={{ color: '#E2E8F0', margin: '0 0 0.75rem 0', fontSize: '1rem' }}>
          💬 Sync Conversation Dataset → Intercom Topic
        </h3>
        <p style={{ color: '#94A3B8', fontSize: '0.8125rem', margin: '0 0 0.5rem 0' }} dangerouslySetInnerHTML={{ __html: 'Exports the Conversation dataset from Intercom for the selected date range. <strong>Step 1:</strong> Downloads conversation IDs, transcripts, and metadata. <strong>Step 2:</strong> Populates Email, Product, Region, and Transcript fields. Data goes into <code>Intercom Topic</code> table — the source for Conversation Topics and Sentiment Analysis pages. <strong>Re-run safe:</strong> Upserts on Conversation ID (updates existing, adds new). <strong>Model:</strong> GPT-5.4-mini for topic/sentiment classification.' }} />

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '1rem' }}>
          <DateRangePicker value={itDateRange} onChange={setItDateRange} mode="csat" />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <button onClick={handleSyncIntercomTopic} disabled={isProcessing}
            style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', background: isProcessing ? 'rgba(55, 65, 81, 0.8)' : 'linear-gradient(135deg, #10B981, #34D399)', color: '#fff', fontSize: '0.875rem', fontWeight: '600', cursor: isProcessing ? 'not-allowed' : 'pointer' }}>
            {itSyncing ? '⏳ Step 1: Syncing...' : '① Sync Dataset'}
          </button>
          <button onClick={handlePopulateMissingData} disabled={isProcessing} title="Fetch Transcript (and any missing Email / Product / Region) from Intercom for rows where Transcript is empty"
            style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', background: isProcessing ? 'rgba(55, 65, 81, 0.8)' : 'linear-gradient(135deg, #F59E0B, #FBBF24)', color: '#000', fontSize: '0.875rem', fontWeight: '600', cursor: isProcessing ? 'not-allowed' : 'pointer' }}>
            {isFetching ? '⏳ Step 2: Populating...' : '② Populate Missing'}
          </button>
          <button onClick={handleAnalyzeUnanalyzed} disabled={isProcessing} title="Run AI topic & sentiment analysis on CFD/Futures conversations with Transcript but empty Sub-Topics"
            style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', background: isProcessing ? 'rgba(55, 65, 81, 0.8)' : 'linear-gradient(135deg, #7C3AED, #8B5CF6)', color: '#fff', fontSize: '0.875rem', fontWeight: '600', cursor: isProcessing ? 'not-allowed' : 'pointer' }}>
            {isAnalyzing ? '⏳ Step 3: Analyzing...' : '③ Analyze Topics'}
          </button>
          {isProcessing && (
            <button onClick={handleStop} style={{ padding: '0.75rem 1.25rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #EF4444, #F87171)', color: '#fff', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer' }}>
              ⏹ Cancel
            </button>
          )}
        </div>

        {(itStatus || progress.status) && (
          <p style={{ color: '#94A3B8', fontSize: '0.8125rem', margin: '0.75rem 0 0 0' }}>
            {itStatus || progress.status}
          </p>
        )}
      </div>

      {/* Progress Display */}
      {(isFetching || isAnalyzing || progress.saved > 0 || progress.analyzed > 0 || progress.status) && (
        <div style={{
          background: 'rgba(30, 41, 59, 0.5)',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
          border: '1px solid rgba(255, 255, 255, 0.15)'
        }}>
          <h3 style={{ color: '#F8FAFC', margin: '0 0 1rem 0', fontSize: '1rem' }}>
            📊 Progress
          </h3>

          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            {(isFetching || progress.fetched > 0) && (
              <>
                <div>
                  <div style={{ color: '#64748B', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Intercom returned (raw)</div>
                  <div style={{ color: '#64748B', fontSize: '1.25rem', fontWeight: '600' }}>{progress.totalAvailable.toLocaleString()}</div>
                  <div style={{ color: '#64748B', fontSize: '0.65rem', marginTop: '0.125rem' }}>May include extra; we filter below</div>
                </div>
                <div>
                  <div style={{ color: '#64748B', fontSize: '0.75rem', marginBottom: '0.25rem' }}>In your date range ({TIMEZONE_OPTIONS.find(o => o.value === timezoneOffset)?.label || 'GMT+0'})</div>
                  <div style={{ color: '#A78BFA', fontSize: '1.5rem', fontWeight: '700' }}>{progress.fetched.toLocaleString()}</div>
                  <div style={{ color: '#64748B', fontSize: '0.65rem', marginTop: '0.125rem' }}>Conversation started at = matches export</div>
                </div>
                <div>
                  <div style={{ color: '#64748B', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Saved to Supabase</div>
                  <div style={{ color: '#22C55E', fontSize: '1.5rem', fontWeight: '700' }}>{progress.saved.toLocaleString()}</div>
                </div>
              </>
            )}
            {(isAnalyzing || progress.analyzed > 0) && (
              <>
                <div>
                  <div style={{ color: '#64748B', fontSize: '0.75rem', marginBottom: '0.25rem' }}>To Analyze</div>
                  <div style={{ color: '#C084FC', fontSize: '1.5rem', fontWeight: '700' }}>{progress.toAnalyze.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ color: '#64748B', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Analyzed</div>
                  <div style={{ color: '#22C55E', fontSize: '1.5rem', fontWeight: '700' }}>{progress.analyzed.toLocaleString()}</div>
                </div>
              </>
            )}
          </div>

          {(isFetching || isAnalyzing) && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  width: isFetching
                    ? (progress.totalAvailable > 0 ? `${Math.min(100, (progress.fetched / progress.totalAvailable) * 100)}%` : '0%')
                    : (progress.toAnalyze > 0 ? `${(progress.analyzed / progress.toAnalyze) * 100}%` : '0%'),
                  height: '100%', background: 'linear-gradient(135deg, #22C55E, #16A34A)', transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
          )}

          <div style={{ marginTop: '1rem', color: '#94A3B8', fontSize: '0.875rem' }}>
            {progress.status || (isAnalyzing ? `Analyzing conversation ${progress.analyzed} of ${progress.toAnalyze}...` : null)}
          </div>
        </div>
      )}

      {/* Sync CSAT Rating Dataset */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.4)',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        border: '1px solid rgba(251, 191, 36, 0.2)'
      }}>
        <h3 style={{ color: '#E2E8F0', margin: '0 0 0.75rem 0', fontSize: '1rem' }}>
          ⭐ Sync Conversation Rating → CSAT New
        </h3>
        <p style={{ color: '#94A3B8', fontSize: '0.8125rem', margin: '0 0 0.5rem 0' }} dangerouslySetInnerHTML={{ __html: 'Scans rated conversations via the Intercom REST API day-by-day (GMT+6) and imports them into <code>CSAT New</code>. <strong>① Sync Ratings</strong> now also populates <strong>Product Type</strong> (CFD / Futures) for each day inline — that is the column the dashboard filters on. Fills: Conversation ID, Date, Rating, Product Type. (Country is not available via REST.) <strong>Re-run safe:</strong> Upserts on Conversation ID; product patch only touches rows still missing it. <strong>② Populate Product</strong> re-runs just the product step for a range. <strong>Next step:</strong> Run CSAT Classification below to categorize low ratings.' }} />
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '1rem' }}>
          <DateRangePicker value={csatDateRange} onChange={setCsatDateRange} mode="csat" />
          <button onClick={handleSyncCSAT} disabled={isProcessing}
            style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', background: isProcessing ? 'rgba(55, 65, 81, 0.8)' : 'linear-gradient(135deg, #F59E0B, #FBBF24)', color: '#000', fontSize: '0.875rem', fontWeight: '600', cursor: isProcessing ? 'not-allowed' : 'pointer', alignSelf: 'flex-end' }}>
            {csatSyncing ? '⏳ Syncing ratings + product...' : '① Sync Ratings + Product'}
          </button>
          <button onClick={handleCsatPopulateProduct} disabled={isProcessing}
            style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', background: isProcessing ? 'rgba(55, 65, 81, 0.8)' : 'linear-gradient(135deg, #8B5CF6, #A78BFA)', color: '#fff', fontSize: '0.875rem', fontWeight: '600', cursor: isProcessing ? 'not-allowed' : 'pointer', alignSelf: 'flex-end' }}>
            {csatProductLoading ? '⏳ Step 2: Populating...' : '② Populate Product'}
          </button>
          {(csatSyncing || csatProductLoading) && (
            <button onClick={handleStop} style={{ padding: '0.75rem 1.25rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #EF4444, #F87171)', color: '#fff', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', alignSelf: 'flex-end' }}>
              ⏹ Cancel
            </button>
          )}
        </div>
        {(csatSyncStatus || csatProductStatus) && (
          <p style={{ color: '#94A3B8', fontSize: '0.8125rem', margin: '0.75rem 0 0 0' }}>{csatProductStatus || csatSyncStatus}</p>
        )}
      </div>

      {/* Sync FIN SPO */}
      <div style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
        <h3 style={{ color: '#E2E8F0', margin: '0 0 0.75rem 0', fontSize: '1rem' }}>
          🤖 Sync FIN Conversations → FIN SPO
        </h3>
        <p style={{ color: '#94A3B8', fontSize: '0.8125rem', margin: '0 0 0.5rem 0' }} dangerouslySetInnerHTML={{ __html: 'Exports Conversation dataset from Intercom (GMT+6) and imports FIN AI Agent conversations into <code>FIN - Service Performance Overview</code>. Tracks: FIN involvement, deflection status, resolution state, last sent answer. Filters to chat-only conversations. <strong>Re-run safe:</strong> Upserts on conversation_id + assignee_id. <strong>Data powers:</strong> FIN section in Performance Overview.' }} />
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '1rem' }}>
          <DateRangePicker value={finDateRange} onChange={setFinDateRange} mode="csat" />
          <button onClick={handleSyncFIN} disabled={isProcessing}
            style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', background: isProcessing ? 'rgba(55,65,81,0.8)' : 'linear-gradient(135deg, #0EA5E9, #C084FC)', color: '#fff', fontSize: '0.875rem', fontWeight: '600', cursor: isProcessing ? 'not-allowed' : 'pointer', alignSelf: 'flex-end' }}>
            {finSyncing ? '⏳ Syncing...' : '🤖 Sync FIN Data'}
          </button>
          {finSyncing && (
            <button onClick={handleStop} style={{ padding: '0.75rem 1.25rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #EF4444, #F87171)', color: '#fff', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', alignSelf: 'flex-end' }}>
              ⏹ Cancel
            </button>
          )}
        </div>
        {finStatus && <p style={{ color: '#94A3B8', fontSize: '0.8125rem', margin: '0.75rem 0 0 0' }}>{finStatus}</p>}
      </div>

      {/* Sync Conversation Dataset (Service Performance Overview) */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.4)',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        border: '1px solid rgba(255, 255, 255, 0.05)'
      }}>
        <h3 style={{ color: '#E2E8F0', margin: '0 0 0.75rem 0', fontSize: '1rem' }}>
          📊 Sync Conversation Dataset (Service Performance)
        </h3>
        <p style={{ color: '#94A3B8', fontSize: '0.8125rem', margin: '0 0 1rem 0' }} dangerouslySetInnerHTML={{ __html: 'Exports the Intercom <strong>Conversation Actions dataset</strong> for the selected window, dedupes the action rows to <strong>unique human-served Chat / Facebook / Instagram conversations</strong> (bot replies excluded), and seeds one stub each into <code>Service Performance Overview</code>. <strong>Re-run safe:</strong> Skips conversation IDs already enriched. <strong>Next step:</strong> Run Enrich SPO below — it computes FRT / ART / AHT per agent.' }} />
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '1rem' }}>
          <DateRangePicker value={convDatasetDateRange} onChange={setConvDatasetDateRange} mode="csat" />
          <button
            onClick={handleSyncConversationDataset}
            disabled={convDatasetUploading}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              background: convDatasetUploading
                ? 'rgba(55, 65, 81, 0.8)' : 'linear-gradient(135deg, #8B5CF6, #A78BFA)',
              color: '#fff',
              fontSize: '0.875rem',
              fontWeight: '600',
              cursor: convDatasetUploading ? 'not-allowed' : 'pointer',
              alignSelf: 'flex-end'
            }}
          >
            {convDatasetUploading ? '⏳ Syncing...' : '📊 Sync to Supabase'}
          </button>
          {convDatasetUploading && (
            <button onClick={handleStop} style={{ padding: '0.75rem 1.25rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #EF4444, #F87171)', color: '#fff', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', alignSelf: 'flex-end' }}>
              ⏹ Cancel
            </button>
          )}
        </div>
        {convDatasetStatus && (
          <p style={{ color: '#94A3B8', fontSize: '0.8125rem', margin: '0.75rem 0 0 0' }}>
            {convDatasetStatus}
          </p>
        )}
      </div>

      {/* Enrich Service Performance (FRT/ART/AHT per agent) */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.4)',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        border: '1px solid rgba(255, 255, 255, 0.06)'
      }}>
        <h3 style={{ color: '#E2E8F0', margin: '0 0 0.75rem 0', fontSize: '1rem' }}>
          ⚡ Enrich Service Performance (FRT / ART / AHT)
        </h3>
        <p style={{ color: '#94A3B8', fontSize: '0.8125rem', margin: '0 0 1rem 0' }} dangerouslySetInnerHTML={{ __html: 'Fetches full conversation details from Intercom API for rows in <code>Service Performance Overview</code> where FRT is NULL. Calculates per-agent: <strong>FRT, ART, AHT, Wait Time, FRT/ART Hit Rate, CX Score, Sentiment</strong>. Processes 100 conversations per batch with 10 parallel requests (with 429-retry/backoff). <strong>Re-run safe:</strong> Only processes un-enriched rows (frt_seconds IS NULL). <strong>Important:</strong> Only counts Live Chat agents from agent_name_mapping table.' }} />
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <DateRangePicker value={spoEnrichRange} onChange={setSpoEnrichRange} mode="csat" placeholder="Date range (optional)" />
          <button
            onClick={async () => {
              setSpoEnrichStatus('Checking...');
              try {
                const range = spoEnrichRange ? parseDateRange(spoEnrichRange) : null;
                const resp = await fetch(API_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'spo-enrich-count', dateFrom: range?.from || null, dateTo: range?.to || null })
                });
                const r = await resp.json();
                if (r.success) {
                  const estSecs = Math.round(r.pending_frt * 0.4);
                  const fmtTime = (s) => s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
                  const rangeLbl = range ? ` (${range.from}…${range.to})` : '';
                  setSpoEnrichStatus(`Total${rangeLbl}: ${r.total.toLocaleString()} rows | Enriched: ${r.enriched.toLocaleString()} | Pending FRT: ${r.pending_frt.toLocaleString()} (est. ${fmtTime(estSecs)}) | Pending Transcript: ${r.pending_transcript.toLocaleString()} | Pending Reopened: ${r.pending_reopened.toLocaleString()}`);
                } else {
                  setSpoEnrichStatus(`Error: ${r.error}`);
                }
              } catch (e) {
                setSpoEnrichStatus(`Error: ${e.message}`);
              }
            }}
            disabled={spoEnriching}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'linear-gradient(135deg, #0EA5E9, #0284C7)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.875rem'
            }}
          >
            📊 Check Remaining
          </button>
          <button
            onClick={() => handleSpoEnrich(false)}
            disabled={spoEnriching}
            style={{
              padding: '0.75rem 1.5rem',
              background: spoEnriching ? '#475569' : 'linear-gradient(135deg, #F59E0B, #D97706)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: spoEnriching ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              fontSize: '0.875rem'
            }}
          >
            {spoEnriching ? '⏳ Enriching...' : '⚡ Enrich New'}
          </button>
          {spoEnriching && (
            <button onClick={() => { stopRequestedRef.current = true; }} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #EF4444, #F87171)', color: '#fff', fontSize: '0.8125rem', fontWeight: '600', cursor: 'pointer' }}>
              ⏹ Cancel
            </button>
          )}
        </div>
        {spoEnrichStatus && (
          <p style={{ color: '#94A3B8', fontSize: '0.8125rem', margin: '0.75rem 0 0 0' }}>
            {spoEnrichStatus}
          </p>
        )}
      </div>

      {/* Sync Email Replies → Email SPO table */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.4)',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        border: '1px solid rgba(255, 255, 255, 0.06)'
      }}>
        <h3 style={{ color: '#E2E8F0', margin: '0 0 0.75rem 0', fontSize: '1rem' }}>
          📧 Sync Email Conversations → Email SPO
        </h3>
        <p style={{ color: '#94A3B8', fontSize: '0.8125rem', margin: '0 0 1rem 0' }} dangerouslySetInnerHTML={{ __html: 'Exports Conversation Actions dataset from Intercom, filters for Reply + Email channel, and inserts <strong>one row per agent reply</strong> into <code>Email - Service Performance Overview</code>. Only includes 15 Email Support team agents. <strong>Re-run safe:</strong> Checks existing conversation_id + created_at pairs — skips duplicates. <strong>Next step:</strong> Run Enrich Email below to calculate ART per reply.' }} />
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <DateRangePicker value={emailSyncRange} onChange={setEmailSyncRange} mode="csat" />
          <button
            onClick={async () => {
              setEmailSyncing(true);
              setEmailSyncStatus('Step 1: Enqueuing Conversation Actions export...');
              setError('');
              const startTime = Date.now();
              const elapsed = () => `${Math.round((Date.now() - startTime) / 1000)}s`;
              const parseJson = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return { success: false, error: 'Invalid JSON: ' + t.substring(0, 200) }; } };

              try {
                // Step 1: Enqueue dataset export
                const enqResp = await fetch(API_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'email-dataset-enqueue', dateFrom: emailSyncFrom, dateTo: emailSyncTo })
                });
                const enqResult = await parseJson(enqResp);
                if (!enqResult.success) {
                  setEmailSyncStatus(`Export failed: ${enqResult.error}. ${elapsed()}`);
                  return;
                }
                const jobId = enqResult.jobId;
                setEmailSyncStatus(`Step 1: Export queued (job: ${jobId}), polling... ${elapsed()}`);

                // Poll until complete
                let status = 'pending';
                while (status !== 'completed' && status !== 'complete' && status !== 'failed' && !stopRequestedRef.current) {
                  await new Promise(r => setTimeout(r, 3000));
                  const pollResp = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'email-dataset-poll', jobId })
                  });
                  const pollResult = await parseJson(pollResp);
                  status = pollResult.status || 'unknown';
                  setEmailSyncStatus(`Step 1: Export ${status}... ${elapsed()}`);
                }
                if (stopRequestedRef.current) { setEmailSyncStatus(`Cancelled. ${elapsed()}`); return; }
                if (status === 'failed') { setEmailSyncStatus(`Export failed. ${elapsed()}`); return; }

                // Step 2: Download CSV → filter Reply+Email → insert per-reply rows
                setEmailSyncStatus(`Step 2: Downloading & importing email replies... ${elapsed()}`);
                const dlResp = await fetch(API_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'email-dataset-import', jobId })
                });
                const dlResult = await parseJson(dlResp);
                if (!dlResult.success) { setEmailSyncStatus(`Import failed: ${dlResult.error}. ${elapsed()}`); return; }

                setEmailSyncStatus(`Done! ${dlResult.totalCSVRows} total CSV rows | ${dlResult.emailReplies} email replies | ${dlResult.inserted} rows inserted (${dlResult.uniqueConversations} conversations). Time: ${elapsed()}.`);
              } catch (err) {
                setEmailSyncStatus(`Error: ${err?.message || String(err)}. ${elapsed()}`);
                setError(err?.message || String(err));
              } finally {
                setEmailSyncing(false);
                stopRequestedRef.current = false;
              }
            }}
            disabled={emailSyncing}
            style={{
              padding: '0.75rem 1.5rem',
              background: emailSyncing ? '#475569' : 'linear-gradient(135deg, #10B981, #059669)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: emailSyncing ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              fontSize: '0.875rem'
            }}
          >
            {emailSyncing ? '⏳ Syncing...' : '📧 Sync Email Replies'}
          </button>
          {emailSyncing && (
            <button onClick={() => { stopRequestedRef.current = true; }} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #EF4444, #F87171)', color: '#fff', fontSize: '0.8125rem', fontWeight: '600', cursor: 'pointer' }}>
              ⏹ Cancel
            </button>
          )}
        </div>
        {emailSyncStatus && (
          <p style={{ color: '#94A3B8', fontSize: '0.8125rem', margin: '0.75rem 0 0 0' }}>
            {emailSyncStatus}
          </p>
        )}
      </div>

      {/* Enrich Email Service Performance (ART/AHT per agent) */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.4)',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        border: '1px solid rgba(255, 255, 255, 0.06)'
      }}>
        <h3 style={{ color: '#E2E8F0', margin: '0 0 0.75rem 0', fontSize: '1rem' }}>
          📧 Enrich Email Service Performance (ART / AHT)
        </h3>
        <p style={{ color: '#94A3B8', fontSize: '0.8125rem', margin: '0 0 1rem 0' }} dangerouslySetInnerHTML={{ __html: 'Fetches full conversation details from Intercom for email rows where ART is NULL. Calculates <strong>ART per reply, SLA Hit Rate (\u226430min), CX Score, Sentiment, Country</strong>. No FRT for email — every agent response is an ART measurement. Processes 50 conversations per batch. <strong>Re-run safe:</strong> Only processes un-enriched rows. <strong>Force mode:</strong> Re-enriches rows with NULL country to backfill location data.' }} />
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={async () => {
              setEmailEnrichStatus('Checking...');
              try {
                const resp = await fetch(API_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'spo-enrich-email-count' })
                });
                const r = await resp.json();
                if (r.success) {
                  const estSecs = Math.round(r.pending_art * 0.4);
                  const fmtTime = (s) => s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
                  setEmailEnrichStatus(`Total: ${r.total.toLocaleString()} rows | Enriched: ${r.enriched.toLocaleString()} | Pending ART: ${r.pending_art.toLocaleString()} (est. ${fmtTime(estSecs)}) | Pending Transcript: ${r.pending_transcript.toLocaleString()}`);
                } else {
                  setEmailEnrichStatus(`Error: ${r.error}`);
                }
              } catch (e) {
                setEmailEnrichStatus(`Error: ${e.message}`);
              }
            }}
            disabled={emailEnriching}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'linear-gradient(135deg, #0EA5E9, #0284C7)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.875rem'
            }}
          >
            📊 Check Remaining
          </button>
          <button
            onClick={handleEmailEnrich}
            disabled={emailEnriching}
            style={{
              padding: '0.75rem 1.5rem',
              background: emailEnriching ? '#475569' : 'linear-gradient(135deg, #A78BFA, #7C3AED)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: emailEnriching ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              fontSize: '0.875rem'
            }}
          >
            {emailEnriching ? '⏳ Enriching...' : '📧 Enrich Email'}
          </button>
          {emailEnriching && (
            <button onClick={() => { stopRequestedRef.current = true; }} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #EF4444, #F87171)', color: '#fff', fontSize: '0.8125rem', fontWeight: '600', cursor: 'pointer' }}>
              ⏹ Cancel
            </button>
          )}
        </div>
        {emailEnrichStatus && (
          <p style={{ color: '#94A3B8', fontSize: '0.8125rem', margin: '0.75rem 0 0 0' }}>
            {emailEnrichStatus}
          </p>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1.5rem',
          color: '#F87171'
        }}>
          ❌ {error}
        </div>
      )}

      {/* Sync Tickets Dataset → ticket_logs (Reporting Data Export) */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.4)',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        border: '1px solid rgba(245, 158, 11, 0.2)'
      }}>
        <h3 style={{ color: '#E2E8F0', margin: '0 0 0.75rem 0', fontSize: '1rem' }}>
          Sync Tickets Dataset → ticket_logs
        </h3>
        <p style={{ color: '#94A3B8', fontSize: '0.8125rem', margin: '0 0 1rem 0' }} dangerouslySetInnerHTML={{ __html: 'Exports Tickets dataset from Intercom Reporting Data Export API (GMT+6) and imports into <code>ticket_logs</code>. Maps: ticket_id, conversation_id, team, agent, category, SLA duration, country, status. Calculates SLA Met/Missed based on team-specific office hours and limits. <strong>Re-run safe:</strong> Upserts — updates existing tickets with latest data. <strong>Teams:</strong> CEx (1h), PT (12h), TT (8-20h), PO (3-18h), CR (3-17h), BO (12-24h).' }} />
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '1rem' }}>
          <DateRangePicker value={tdDateRange} onChange={setTdDateRange} mode="csat" />
          <button
            onClick={handleSyncTicketsDatasetToLogs}
            disabled={tdSyncing}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              background: tdSyncing
                ? 'rgba(55, 65, 81, 0.8)' : 'linear-gradient(135deg, #F59E0B, #D97706)',
              color: '#fff',
              fontSize: '0.875rem',
              fontWeight: '600',
              cursor: tdSyncing ? 'not-allowed' : 'pointer',
              alignSelf: 'flex-end'
            }}
          >
            {tdSyncing ? 'Syncing...' : 'Sync Tickets Dataset'}
          </button>
          {tdSyncing && (
            <button onClick={handleStop} style={{ padding: '0.75rem 1.25rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #EF4444, #F87171)', color: '#fff', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', alignSelf: 'flex-end' }}>
              Cancel
            </button>
          )}
        </div>
        {tdStatus && (
          <p style={{ color: '#94A3B8', fontSize: '0.8125rem', margin: '0.75rem 0 0 0' }}>
            {tdStatus}
          </p>
        )}
      </div>

      {/* CSAT Automation */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.4)',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        border: '1px solid rgba(255, 255, 255, 0.06)'
      }}>
        <h3 style={{ color: '#E2E8F0', margin: '0 0 0.75rem 0', fontSize: '1rem' }}>
          🎯 CSAT Sub-Category Classification
        </h3>
        <p style={{ color: '#94A3B8', fontSize: '0.8125rem', margin: '0 0 1rem 0' }} dangerouslySetInnerHTML={{ __html: 'Reads rows from <code>CSAT New</code> where rating \u2264 3 and Sub-category is empty. Fetches each conversation\u2019s transcript from Intercom, runs it through the CSAT classification prompt (GPT-5.4-mini), and writes the sub-category back. <strong>Re-run safe:</strong> Only classifies rows with NULL sub-category. <strong>Batch mode available:</strong> Use OpenAI Batch API for 50% cost savings on bulk classification. <strong>Cost:</strong> scales with GPT-5.4-mini mini-tier pricing (192KB prompt).' }} />
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <DateRangePicker value={csatClassifyRange} onChange={setCsatClassifyRange} mode="csat" />
          <button
            onClick={async () => {
              // Count pending
              setCsatStatus('Counting pending rows...');
              try {
                const { data, error } = await supabase
                  .from('CSAT New')
                  .select('"Conversation ID","Conversation rating","Concern regarding product (Catagory)","Concern regarding product (Sub-catagory)","Date"')
                  .lt('Conversation rating', 4)
                  .not('Conversation ID', 'is', null)
                  .gte('Date', csatClassifyFrom)
                  .lte('Date', csatClassifyTo)
                  .limit(50000);
                if (error) { setCsatStatus(`Error: ${error.message}`); return; }
                const pending = (data || []).filter(r =>
                  !r['Concern regarding product (Catagory)'] && !r['Concern regarding product (Sub-catagory)']
                );
                setCsatStatus(`${pending.length.toLocaleString()} rows pending classification (out of ${(data || []).length.toLocaleString()} with rating < 4) in ${csatClassifyFrom} to ${csatClassifyTo}`);
              } catch (e) {
                setCsatStatus(`Error: ${e.message}`);
              }
            }}
            disabled={csatRunning}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'linear-gradient(135deg, #0EA5E9, #0284C7)',
              color: '#fff', border: 'none', borderRadius: '8px',
              cursor: csatRunning ? 'not-allowed' : 'pointer',
              opacity: csatRunning ? 0.5 : 1, fontSize: '0.875rem', fontWeight: '600'
            }}
          >
            📊 Check Pending
          </button>
          <button
            onClick={async () => {
              if (csatRunning) return;
              setCsatRunning(true);
              csatStopRef.current = false;
              setCsatStatus('Fetching pending rows...');
              setCsatProgress({ total: 0, done: 0, errors: 0 });

              try {
                // Fetch rows: rating < 4, filtered by date range
                const { data: allRows, error } = await supabase
                  .from('CSAT New')
                  .select('"Conversation ID","Conversation rating","Concern regarding product (Catagory)","Concern regarding product (Sub-catagory)","Date"')
                  .lt('Conversation rating', 4)
                  .not('Conversation ID', 'is', null)
                  .gte('Date', csatClassifyFrom)
                  .lte('Date', csatClassifyTo)
                  .limit(50000);
                const rows = (allRows || []).filter(r =>
                  !r['Concern regarding product (Catagory)'] && !r['Concern regarding product (Sub-catagory)']
                );

                if (error) { setCsatStatus(`Error: ${error.message}`); setCsatRunning(false); return; }
                if (!rows || rows.length === 0) { setCsatStatus('No pending rows found.'); setCsatRunning(false); return; }

                const total = rows.length;
                setCsatProgress({ total, done: 0, errors: 0 });
                setCsatStatus(`Processing ${total.toLocaleString()} conversations...`);

                let done = 0, errors = 0;

                for (const row of rows) {
                  if (csatStopRef.current) { setCsatStatus(`Stopped. ${done} done, ${errors} errors.`); break; }

                  const convId = row['Conversation ID'];
                  try {
                    // Call API to classify
                    const resp = await fetch(API_URL, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'csat-classify', conversationId: String(convId) })
                    });
                    const result = await parseJson(resp);

                    if (result.quotaExceeded) {
                      csatStopRef.current = true;
                      setCsatStatus('⛔ OpenAI quota exceeded — add credits at platform.openai.com/billing, then re-run.');
                      break;
                    }

                    if (result.success && result.subCategory) {
                      // Write back to CSAT New — include main category derived
                      // server-side from the historical sub→main mapping.
                      const updatePayload = { 'Concern regarding product (Sub-catagory)': result.subCategory };
                      if (result.mainCategory) updatePayload['Concern regarding product (Catagory)'] = result.mainCategory;
                      const { error: updateError } = await supabase
                        .from('CSAT New')
                        .update(updatePayload)
                        .eq('Conversation ID', convId);

                      if (updateError) {
                        console.error(`Update error for ${convId}:`, updateError);
                        errors++;
                      } else {
                        done++;
                      }
                    } else {
                      // Mark as "None" so we don't re-process
                      await supabase
                        .from('CSAT New')
                        .update({ 'Concern regarding product (Sub-catagory)': 'None' })
                        .eq('Conversation ID', convId);
                      done++;
                    }
                  } catch (e) {
                    console.error(`Error processing ${convId}:`, e);
                    errors++;
                  }

                  setCsatProgress({ total, done: done + errors, errors });
                  if ((done + errors) % 5 === 0 || done + errors === total) {
                    setCsatStatus(`Processing... ${done + errors}/${total} (${errors} errors)`);
                  }

                  // Small delay to avoid rate limits
                  await new Promise(r => setTimeout(r, 500));
                }

                setCsatStatus(`Done! ${done} classified, ${errors} errors out of ${total}.`);
              } catch (e) {
                setCsatStatus(`Error: ${e.message}`);
              } finally {
                setCsatRunning(false);
              }
            }}
            disabled={csatRunning}
            style={{
              padding: '0.75rem 1.5rem',
              background: csatRunning ? '#475569' : 'linear-gradient(135deg, #F59E0B, #D97706)',
              color: '#fff', border: 'none', borderRadius: '8px',
              cursor: csatRunning ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem', fontWeight: '600'
            }}
          >
            {csatRunning ? '⏳ Classifying...' : '🚀 Run Classification'}
          </button>
          {csatRunning && (
            <button
              onClick={() => { csatStopRef.current = true; }}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'linear-gradient(135deg, #EF4444, #DC2626)',
                color: '#fff', border: 'none', borderRadius: '8px',
                cursor: 'pointer', fontSize: '0.875rem', fontWeight: '600'
              }}
            >
              ⏹ Stop
            </button>
          )}
        </div>
        {/* Progress */}
        {(csatProgress.total > 0) && (
          <div style={{ marginTop: '1rem' }}>
            <div style={{
              width: '100%', height: '8px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '4px', overflow: 'hidden'
            }}>
              <div style={{
                width: `${csatProgress.total > 0 ? (csatProgress.done / csatProgress.total * 100) : 0}%`,
                height: '100%',
                background: 'linear-gradient(135deg, #22C55E, #16A34A)',
                transition: 'width 0.3s ease'
              }} />
            </div>
            <div style={{ color: '#94A3B8', fontSize: '0.8125rem', marginTop: '0.5rem' }}>
              {csatProgress.done} / {csatProgress.total} ({csatProgress.errors} errors)
            </div>
          </div>
        )}
        {csatStatus && (
          <p style={{ color: '#94A3B8', fontSize: '0.8125rem', margin: '0.75rem 0 0 0' }}>
            {csatStatus}
          </p>
        )}
      </div>

      {/* Info box */}
      <div style={{
        marginTop: '1.5rem',
        padding: '1rem',
        background: 'rgba(139, 92, 246, 0.1)',
        border: '1px solid rgba(139, 92, 246, 0.2)',
        borderRadius: '8px'
      }}>
        <div style={{ color: '#C084FC', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
          ℹ️ How it works
        </div>
        <ul style={{ color: '#94A3B8', fontSize: '0.8rem', margin: 0, paddingLeft: '1.25rem' }}>
          <li><strong>Clear Intercom Topic:</strong> Deletes all existing rows (optional – do this first for a fresh run)</li>
          <li><strong>Reset Data (Keep IDs):</strong> Clears Transcript, Product, Email, Region, etc. but keeps Conversation IDs. Use this to re-fetch data with updated logic</li>
          <li><strong>Remove outside date:</strong> Deletes rows where &quot;Conversation started at&quot; is not within the selected From–To date (GMT+0). Use after a run to drop any conversations that slipped in</li>
          <li><strong>Fetch & Save:</strong> Uses the date/time range above. Phase 1 – pulls 150 Conversation IDs per page from Intercom and saves only ID + created_at. Phase 2 – for each row, pulls full data from Intercom and updates the row</li>
          <li><strong>Fast: IDs Only:</strong> Extracts ONLY Conversation IDs (no transcript/product). Fast bulk extraction with rate limit handling. Use "Check & populate" after to enrich.</li>
          <li><strong>Pull data by Chat ID from Supabase:</strong> No date range. Reads all Conversation IDs from Supabase and for each pulls full data from Intercom, then updates the row</li>
          <li><strong>Check & populate missing data:</strong> Finds rows where CX Score Rating, Assigned Channel ID, Email, Product or Transcript is empty, then fetches full data from Intercom for only those rows and updates them</li>
          <li><strong>Analyze Unanalyzed:</strong> Finds CFD/Futures rows with empty Sub-Topics (and a Transcript) and runs AI topic + sentiment analysis</li>
          <li><strong>List Export Datasets:</strong> Shows available datasets from Intercom Reporting Data Export API</li>
          <li><strong>Stop:</strong> Safely stops the current operation after the current item completes</li>
        </ul>
      </div>

      {/* Datasets Display */}
      {showDatasets && (
        <div style={{
          marginTop: '1.5rem',
          padding: '1rem',
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '8px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ color: '#10B981', margin: 0 }}>📊 Available Reporting Datasets</h3>
            <button
              onClick={() => setShowDatasets(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94A3B8',
                fontSize: '1.2rem',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          </div>
          
          {!datasets ? (
            <p style={{ color: '#94A3B8' }}>Loading...</p>
          ) : (
            <div style={{ maxHeight: '400px', overflow: 'auto' }}>
              <pre style={{
                background: 'rgba(0,0,0,0.3)',
                padding: '1rem',
                borderRadius: '6px',
                color: '#E2E8F0',
                fontSize: '0.75rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>
                {JSON.stringify(datasets, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TopicAnalyzerAdmin;
