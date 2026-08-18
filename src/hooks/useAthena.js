import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const TRANSCRIPT_LIMIT_KEY = 'athena_transcript_limit';
const MODEL_KEY = 'athena_model';
const SUPPORTED_MODELS = ['gpt-5.4-mini', 'gpt-5.4'];
const DEFAULT_MODEL = 'gpt-5.4-mini';

export function useAthena() {
  const { user } = useAuth();
  const [athenaState, setAthenaState] = useState('closed');
  const [athenaSessions, setAthenaSessions] = useState([]);
  const [athenaActiveSessionId, setAthenaActiveSessionId] = useState(null);
  const [athenaInput, setAthenaInput] = useState('');
  const [athenaThinking, setAthenaThinking] = useState(false);
  const [transcriptLimit, setTranscriptLimitState] = useState(() => {
    const saved = localStorage.getItem(TRANSCRIPT_LIMIT_KEY);
    const n = saved ? parseInt(saved, 10) : 50;
    return isNaN(n) ? 50 : Math.min(Math.max(n, 10), 1500);
  });
  const [athenaModel, setAthenaModelState] = useState(() => {
    const saved = localStorage.getItem(MODEL_KEY);
    return SUPPORTED_MODELS.includes(saved) ? saved : DEFAULT_MODEL;
  });

  const setTranscriptLimit = (val) => {
    const n = Math.min(Math.max(parseInt(val, 10) || 50, 10), 500);
    setTranscriptLimitState(n);
    localStorage.setItem(TRANSCRIPT_LIMIT_KEY, String(n));
  };

  const setAthenaModel = (val) => {
    const m = SUPPORTED_MODELS.includes(val) ? val : DEFAULT_MODEL;
    setAthenaModelState(m);
    localStorage.setItem(MODEL_KEY, m);
  };
  const athenaScrollRef = useRef(null);
  // AbortController for the in-flight Athena fetch. Stop button aborts; retry
  // creates a fresh controller. Kept in a ref so closing/reopening the panel
  // doesn't lose the handle while a request is mid-flight.
  const athenaAbortRef = useRef(null);

  const athenaActiveSession = athenaSessions.find(s => s.id === athenaActiveSessionId) || null;

  const openAthenaForContext = (contextLabel, contextType, contextValue, contextColor, itemCount, items = []) => {
    const existing = athenaSessions.find(s => s.contextType === contextType && s.contextValue === contextValue);
    if (existing) {
      // refresh items in case the underlying data changed since last open
      setAthenaSessions(prev => prev.map(s => s.id === existing.id ? { ...s, items, itemCount } : s));
      setAthenaActiveSessionId(existing.id);
      setAthenaState('open');
      return;
    }
    const newSession = {
      id: `athena-${Date.now()}`,
      contextLabel,
      contextType,
      contextValue,
      contextColor,
      itemCount,
      items,
      messages: [],
      createdAt: Date.now(),
    };
    setAthenaSessions(prev => [newSession, ...prev]);
    setAthenaActiveSessionId(newSession.id);
    setAthenaInput('');
    setAthenaState('open');
  };

  const closeAthenaSession = (sessionId) => {
    setAthenaSessions(prev => {
      const remaining = prev.filter(s => s.id !== sessionId);
      if (athenaActiveSessionId === sessionId) {
        setAthenaActiveSessionId(remaining.length > 0 ? remaining[0].id : null);
      }
      return remaining;
    });
  };

  // Internal worker shared by sendAthenaMessage and retryAthenaMessage.
  // `priorMessages` already includes the new user turn we want to respond to.
  const runAthenaRequest = async (sessionId, contextSession, priorMessages) => {
    const controller = new AbortController();
    athenaAbortRef.current = controller;
    setAthenaThinking(true);

    try {
      // Strip heavy fields (transcript, full message bodies) before sending so
      // big drill-ins don't exceed Vercel's 4.5 MB payload limit. The server's
      // athena-chat handler only needs `conversation_id` + light metadata;
      // full transcripts for the RAG path are loaded server-side from SPO.
      const slimItems = (contextSession.items || []).map(it => {
        if (!it || typeof it !== 'object') return it;
        // Feedback items use `chatId` for the Intercom conversation id.
        // "MANUAL" is a sentinel for hand-entered feedback — treat as no id.
        const rawChat = it.chatId && it.chatId !== 'MANUAL' ? it.chatId : null;
        return {
          conversation_id: it.conversation_id ?? it['Conversation ID'] ?? rawChat,
          created_date_bd: it.created_date_bd,
          Date: it.Date ?? it.date,
          country: it.country ?? it.Country,
          product: it.product ?? it['Product Type'] ?? it.Product,
          main_topic: it.main_topic ?? it['Main-Topics'] ?? it['Main Category'],
          topic: it.topic ?? it['Sub-Topics'] ?? it['Sub category'],
          sentiment: it.sentiment ?? it['Sentiment End'] ?? it['Sentiment Start'],
          'Conversation rating': it['Conversation rating'],
          cx_score_rating: it.cx_score_rating,
          category: it.category ?? it['Concern regarding product (Catagory)'],
          'Concern regarding product (Sub-catagory)': it['Concern regarding product (Sub-catagory)'],
          headline: it.headline,
          priority: it.priority,
          type: it.type,
          feedback_type: it.feedback_type,
          feedbackSentiment: it.feedbackSentiment,
        };
      });

      const resp = await fetch('/api/analyze-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          action: 'athena-chat',
          contextLabel: contextSession.contextLabel,
          contextType: contextSession.contextType,
          items: slimItems,
          // Build OpenAI-shape messages. User turns with image attachments become
          // multimodal content arrays (text + image_url parts); plain turns stay
          // as strings. Assistant turns are always strings.
          messages: priorMessages.map(m => {
            const role = m.role === 'athena' ? 'assistant' : m.role;
            const atts = role === 'user' && Array.isArray(m.attachments) ? m.attachments : [];
            if (atts.length === 0) return { role, content: m.content };
            const parts = [];
            if (m.content && String(m.content).trim()) parts.push({ type: 'text', text: m.content });
            for (const a of atts) {
              if (a && typeof a.dataUrl === 'string' && a.dataUrl.startsWith('data:image/')) {
                parts.push({ type: 'image_url', image_url: { url: a.dataUrl } });
              }
            }
            return { role, content: parts };
          }),
          userEmail: user?.email || null,
          transcriptLimit,
          model: athenaModel,
        }),
      });
      // Gracefully handle non-JSON responses (e.g. Vercel 413 HTML page).
      const contentType = resp.headers.get('content-type') || '';
      let result;
      if (contentType.includes('application/json')) {
        result = await resp.json();
      } else {
        const text = await resp.text();
        result = { success: false, error: `HTTP ${resp.status} — ${text.slice(0, 160)}` };
      }
      const content = result?.success && result?.reply
        ? result.reply
        : `Sorry — I couldn't reach my analysis engine just now (${result?.error || resp.status}). Try again in a moment.`;
      setAthenaSessions(prev => prev.map(s =>
        s.id === sessionId
          ? { ...s, messages: [...priorMessages, { role: 'athena', content, time: Date.now() }] }
          : s
      ));
    } catch (e) {
      // User-initiated abort via the Stop button — keep the user turn but
      // don't write any assistant reply. The Retry button can re-issue later.
      if (e?.name === 'AbortError') return;
      setAthenaSessions(prev => prev.map(s =>
        s.id === sessionId
          ? { ...s, messages: [...priorMessages, { role: 'athena', content: `Network hiccup: ${e.message || e}. Try again.`, time: Date.now() }] }
          : s
      ));
    } finally {
      if (athenaAbortRef.current === controller) athenaAbortRef.current = null;
      setAthenaThinking(false);
    }
  };

  // sendAthenaMessage(text?, attachments?)
  // attachments: optional array of { id, dataUrl, name, mime, size }.
  // Either text OR attachments must be present — sending only images is allowed.
  const sendAthenaMessage = async (text, attachments) => {
    if (!athenaActiveSession) return;
    const msg = (text ?? athenaInput).trim();
    const atts = Array.isArray(attachments) ? attachments.filter(a => a && a.dataUrl) : [];
    if (!msg && atts.length === 0) return;
    const sessionId = athenaActiveSession.id;
    const userTurn = { role: 'user', content: msg, time: Date.now() };
    if (atts.length > 0) userTurn.attachments = atts;
    const priorMessages = [...athenaActiveSession.messages, userTurn];
    setAthenaSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, messages: priorMessages } : s
    ));
    setAthenaInput('');
    await runAthenaRequest(sessionId, athenaActiveSession, priorMessages);
  };

  // Cancel the in-flight Athena request, if any. The user turn that triggered
  // the request stays in the transcript; only the pending reply is dropped.
  const stopAthenaMessage = () => {
    if (athenaAbortRef.current) {
      athenaAbortRef.current.abort();
      athenaAbortRef.current = null;
    }
    setAthenaThinking(false);
  };

  // Re-issue the last user turn. Pops any trailing assistant reply so the new
  // answer replaces the old one rather than chaining a second response.
  const retryAthenaMessage = async () => {
    if (!athenaActiveSession || athenaThinking) return;
    const msgs = athenaActiveSession.messages || [];
    if (msgs.length === 0) return;
    // Trim trailing assistant message(s) so we re-send the last user turn.
    let end = msgs.length;
    while (end > 0 && msgs[end - 1].role === 'athena') end--;
    if (end === 0) return;
    const lastUser = msgs[end - 1];
    if (lastUser.role !== 'user') return;
    const sessionId = athenaActiveSession.id;
    const priorMessages = msgs.slice(0, end);
    setAthenaSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, messages: priorMessages } : s
    ));
    await runAthenaRequest(sessionId, athenaActiveSession, priorMessages);
  };

  useEffect(() => {
    if (athenaState === 'open' && athenaScrollRef.current) {
      athenaScrollRef.current.scrollTop = athenaScrollRef.current.scrollHeight;
    }
  }, [athenaActiveSession?.messages, athenaThinking, athenaState]);

  return {
    athenaState, setAthenaState,
    athenaSessions,
    athenaActiveSession,
    athenaActiveSessionId, setAthenaActiveSessionId,
    athenaInput, setAthenaInput,
    athenaThinking,
    athenaScrollRef,
    openAthenaForContext,
    closeAthenaSession,
    sendAthenaMessage,
    stopAthenaMessage,
    retryAthenaMessage,
    transcriptLimit, setTranscriptLimit,
    athenaModel, setAthenaModel,
  };
}
