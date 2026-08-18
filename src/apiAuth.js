// Mock /api router for the Business Analytics demo build.
//
// The original file attached a Supabase token to every same-origin /api/* request.
// This build has no backend, so instead we intercept /api/* fetches and answer them
// with mock responses. Endpoints whose richest data path is a client-side Supabase
// aggregation deliberately return a non-OK status so the app falls back to querying
// the mock Supabase client (which yields fully consistent numbers).
//
// Everything that is NOT /api/* passes straight through to the real fetch.

import { buildDashboardData, mockAgentsPayload } from './mocks/mockSupabase.js';

const origFetch = window.fetch.bind(window);

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function pathOf(url) {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return typeof url === 'string' ? url.split('?')[0] : '';
  }
}

function mockTranscript(id) {
  return (
    `Customer: Hi, I have a question about my account ${id}.\n` +
    `Agent: Hello! I'd be happy to help. Could you share a few more details?\n` +
    `Customer: Sure — my withdrawal seems to be delayed.\n` +
    `Agent: Thanks. I've checked and it is now processing on our end.\n` +
    `Customer: Great, thank you so much!\n` +
    `Agent: You're welcome. Is there anything else I can help with?`
  );
}

function route(path, body) {
  if (path === '/api/dashboard-data') {
    // 'get-agents' is a small side-action; the main call returns aggregated data.
    if (body && body.action === 'get-agents') return jsonResponse(mockAgentsPayload());
    return jsonResponse(buildDashboardData(body || {}));
  }

  // Fundee/activity aggregation — no mock aggregator; let the app fall back to its
  // (empty) Supabase paths so those secondary sub-views render an empty state.
  if (path === '/api/fundee-data' || path === '/api/activity-hours') {
    return jsonResponse({ success: false, error: 'mock-backend: no data' }, 503);
  }

  if (path === '/api/analyze-topics') {
    const action = body && body.action;
    if (action === 'fetch-single') {
      return jsonResponse({ success: true, data: { Transcript: mockTranscript(body.conversationId) } });
    }
    return jsonResponse({ success: true, data: [], results: [], remaining: 0, processed: 0, message: 'mock' });
  }

  if (path === '/api/classify') {
    return jsonResponse({ success: true, results: [], data: [] });
  }

  if (path === '/api/rag') {
    return jsonResponse({ success: true, data: [], insights: null, transcript: null, results: [] });
  }

  // Trustpilot + misc endpoints — benign empty payloads so those tabs render.
  return jsonResponse({ success: true, data: [], reviews: [], items: [], summary: {} });
}

window.fetch = async function (input, init = {}) {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  const path = pathOf(url);
  if (!path.startsWith('/api/')) return origFetch(input, init);

  let body = {};
  try {
    const raw = init && init.body;
    if (raw && typeof raw === 'string') body = JSON.parse(raw);
  } catch {
    /* non-JSON body — ignore */
  }

  // Small async tick so callers that show a loading state behave naturally.
  await Promise.resolve();
  return route(path, body);
};
