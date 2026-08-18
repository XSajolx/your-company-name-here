import React, { useEffect, useState } from 'react';

// Shared chat-transcript viewer used by every drill-in that exposes a Conversation ID.
// Loads from /api/analyze-topics?action=fetch-single — same path the CSAT page uses,
// which returns StructuredTranscript (preferred JSON) or Transcript (plaintext fallback).
//
// Props:
//   conversationId  — Intercom conversation id (string or number). null/undefined = hidden.
//   onClose         — invoked on backdrop click, ✕ button, or Escape.
//   intercomAppId   — optional; defaults to FundedNext's "aphmhtyj" for the "Open in Intercom" link.
const DEFAULT_INTERCOM_APP = 'aphmhtyj';

const parseStructured = (raw) => {
    if (!raw) return null;
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return null;
    return arr.map(m => ({
        role: m.role === 'USER' ? 'customer' : 'agent',
        text: m.body || '',
        author: m.author || (m.role === 'USER' ? 'Customer' : 'Agent'),
        time: m.time,
    }));
};

// Older Intercom Topic rows store plaintext "USER: ...\nAGENT: ..." instead of structured JSON.
// Anything not recognized as a USER/AGENT prefix gets appended to the previous bubble (or
// starts a customer bubble) so multi-line client messages stay together.
const parsePlaintext = (transcript) => {
    if (!transcript) return [];
    const messages = [];
    String(transcript).split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        if (/^(user|customer|client|contact)\s*:/i.test(trimmed)) {
            messages.push({ role: 'customer', text: trimmed.replace(/^(user|customer|client|contact)\s*:\s*/i, ''), author: 'Customer' });
        } else if (/^(agent|admin|teammate|bot|operator)\s*:/i.test(trimmed)) {
            messages.push({ role: 'agent', text: trimmed.replace(/^(agent|admin|teammate|bot|operator)\s*:\s*/i, ''), author: 'Agent' });
        } else if (messages.length > 0) {
            messages[messages.length - 1].text += '\n' + trimmed;
        } else {
            messages.push({ role: 'customer', text: trimmed, author: 'Customer' });
        }
    });
    return messages;
};

export default function ConversationViewer({ conversationId, onClose, intercomAppId = DEFAULT_INTERCOM_APP }) {
    const [loading, setLoading] = useState(false);
    const [messages, setMessages] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!conversationId) return;
        let cancelled = false;
        setLoading(true);
        setMessages(null);
        setError(null);
        (async () => {
            try {
                const resp = await fetch('/api/analyze-topics', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'fetch-single', conversationId: String(conversationId) }),
                });
                const result = await resp.json();
                if (!resp.ok || result.success === false) {
                    throw new Error(result.error || `Failed to load (${resp.status})`);
                }
                let next = parseStructured(result.data?.StructuredTranscript);
                if (!next) next = parsePlaintext(result.data?.Transcript);
                if (!cancelled) setMessages(next || []);
            } catch (e) {
                if (!cancelled) setError(e.message || String(e));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [conversationId]);

    // Escape key closes the overlay so users don't have to reach for the mouse.
    useEffect(() => {
        if (!conversationId) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [conversationId, onClose]);

    if (!conversationId) return null;

    return (
        <div
            onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
            style={{
                position: 'fixed', inset: 0, zIndex: 10000,
                background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
            }}
        >
            <div style={{
                background: '#161B22', border: '1px solid #30363D', borderRadius: 12,
                width: '100%', maxWidth: 640, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 24px 64px rgba(0,0,0,0.6)', overflow: 'hidden',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #30363D' }}>
                    <div>
                        <h4 style={{ margin: 0, color: '#F0F6FC', fontSize: '0.9rem' }}>Conversation</h4>
                        <span style={{ color: '#C084FC', fontFamily: 'monospace', fontSize: '0.75rem' }}>{conversationId}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => window.open(`https://app.intercom.com/a/apps/${intercomAppId}/inbox/inbox/conversation/${conversationId}`, '_blank')}
                            style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.2)', color: '#C084FC', borderRadius: 6, padding: '4px 10px', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 500 }}>
                            Open in Intercom ↗
                        </button>
                        <button onClick={() => onClose?.()}
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid #30363D', color: '#8B949E', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            ✕
                        </button>
                    </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', color: '#8B949E', padding: '2rem' }}>Loading conversation...</div>
                    ) : error ? (
                        <div style={{ textAlign: 'center', color: '#EF4444', padding: '2rem' }}>{error}</div>
                    ) : messages && messages.length > 0 ? (
                        messages.map((msg, i) => (
                            <div key={i} style={{
                                display: 'flex', flexDirection: 'column',
                                alignItems: msg.role === 'agent' ? 'flex-end' : 'flex-start',
                                marginBottom: 12,
                            }}>
                                <div style={{
                                    background: msg.role === 'agent' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
                                    border: `1px solid ${msg.role === 'agent' ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)'}`,
                                    borderRadius: 10, padding: '8px 12px', maxWidth: '80%',
                                }}>
                                    {msg.author && <div style={{ fontSize: '0.65rem', color: '#818CF8', fontWeight: 600, marginBottom: 2 }}>{msg.author}</div>}
                                    <div style={{ fontSize: '0.8rem', color: '#C9D1D9', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                                </div>
                                {msg.time && (
                                    <span style={{ fontSize: '0.6rem', color: '#6B7280', marginTop: 2 }}>
                                        {new Date(msg.time * 1000).toLocaleString('en-US', { timeZone: 'Asia/Dhaka', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                )}
                            </div>
                        ))
                    ) : (
                        <div style={{ textAlign: 'center', color: '#8B949E', padding: '2rem' }}>No messages found</div>
                    )}
                </div>
            </div>
        </div>
    );
}
