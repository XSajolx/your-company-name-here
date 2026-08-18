import React, { useEffect, useRef, useState } from 'react';
import AthenaIcon from './AthenaIcon';
import TranscriptModal from './TranscriptModal';
import { useAthenaPermission } from '../contexts/AthenaPermissionContext';

// Lightweight markdown-ish renderer for Athena replies.
// Supports: blank-line paragraphs, `- ` / `* ` bullets, `1. ` ordered items,
// `## `/`### ` headings, **bold**, `` `code` ``, `[CONV:<id>]` pills, and plain newlines.
// This is NOT a general markdown parser — just enough to make LLM replies readable.
function renderAthenaText(text, onConvClick) {
  if (!text) return null;
  const lines = String(text).split(/\r?\n/);
  const blocks = [];
  let list = null; // { type: 'ul'|'ol', items: string[] }
  const flushList = () => { if (list) { blocks.push(list); list = null; } };

  const convPill = (id, key) => {
    const short = id.length > 8 ? `…${id.slice(-6)}` : id;
    return (
      <span
        key={key}
        role="button"
        tabIndex={0}
        title={`Open conversation ${id}`}
        onClick={(e) => { e.stopPropagation(); onConvClick && onConvClick(id); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onConvClick && onConvClick(id); } }}
        style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '1px 8px', margin: '0 2px',
          borderRadius: 999, fontSize: '0.78em', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          background: 'rgba(88,166,255,0.14)', color: '#7EB9FF',
          border: '1px solid rgba(88,166,255,0.28)', cursor: 'pointer', whiteSpace: 'nowrap',
          verticalAlign: 'baseline', lineHeight: 1.4,
        }}
      >
        {short}
      </span>
    );
  };

  const inline = (s) => {
    // bold **text**, `code`, and [CONV:<id>] or [CONV:id1, id2, ...] → split and wrap.
    const out = [];
    let rest = s;
    let idx = 0;
    // match grouped CONV citations too: [CONV:id1, id2]
    const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[CONV:([^\]]+)\]/g;
    let m;
    while ((m = re.exec(rest)) !== null) {
      if (m.index > 0) out.push(rest.slice(0, m.index));
      if (m[1] != null) {
        out.push(<strong key={`b${idx++}`} style={{ color: '#f1f5f9' }}>{m[1]}</strong>);
      } else if (m[2] != null) {
        out.push(<code key={`c${idx++}`} style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 4, fontSize: '0.9em' }}>{m[2]}</code>);
      } else if (m[3] != null) {
        const ids = m[3].split(/[,\s]+/).map(x => x.trim()).filter(Boolean);
        for (const id of ids) out.push(convPill(id, `k${idx++}`));
      }
      rest = rest.slice(m.index + m[0].length);
      re.lastIndex = 0;
    }
    if (rest) out.push(rest);
    return out;
  };

  // Detect markdown tables across multi-line block. Returns {header, rows} or null.
  const parseTable = (lines, startIdx) => {
    const first = lines[startIdx]?.trim();
    const second = lines[startIdx + 1]?.trim();
    if (!first || !first.startsWith('|') || !first.endsWith('|')) return null;
    if (!second || !/^\|[\s:|-]+\|$/.test(second)) return null;
    const cells = (ln) => ln.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const header = cells(first);
    const rows = [];
    let i = startIdx + 2;
    while (i < lines.length) {
      const l = lines[i].trim();
      if (!l.startsWith('|') || !l.endsWith('|')) break;
      rows.push(cells(l));
      i++;
    }
    return { header, rows, nextIdx: i };
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();
    if (!line.trim()) { flushList(); blocks.push({ type: 'sp' }); continue; }

    const table = parseTable(lines, i);
    if (table) {
      flushList();
      blocks.push({ type: 'table', header: table.header, rows: table.rows });
      i = table.nextIdx - 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const ordered = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (heading) {
      flushList();
      blocks.push({ type: 'h', level: heading[1].length, text: heading[2] });
    } else if (bullet) {
      if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] }; }
      list.items.push(bullet[1]);
    } else if (ordered) {
      if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] }; }
      list.items.push(ordered[2]);
    } else {
      flushList();
      blocks.push({ type: 'p', text: line });
    }
  }
  flushList();

  return blocks.map((b, i) => {
    if (b.type === 'sp') return <div key={i} style={{ height: 6 }} />;
    if (b.type === 'h') {
      const size = b.level === 1 ? 15 : b.level === 2 ? 14 : 13;
      return <div key={i} style={{ fontWeight: 700, fontSize: size, margin: '8px 0 2px', color: '#f1f5f9' }}>{inline(b.text)}</div>;
    }
    if (b.type === 'ul') {
      return (
        <ul key={i} style={{ margin: '4px 0 6px', paddingLeft: 18 }}>
          {b.items.map((it, j) => <li key={j} style={{ margin: '2px 0' }}>{inline(it)}</li>)}
        </ul>
      );
    }
    if (b.type === 'ol') {
      return (
        <ol key={i} style={{ margin: '4px 0 6px', paddingLeft: 20 }}>
          {b.items.map((it, j) => <li key={j} style={{ margin: '2px 0' }}>{inline(it)}</li>)}
        </ol>
      );
    }
    if (b.type === 'table') {
      return (
        <div key={i} style={{ margin: '8px 0', overflowX: 'auto', maxWidth: '100%' }}>
          <table style={{
            borderCollapse: 'collapse', width: '100%',
            fontSize: 12, color: '#e2e8f0',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6,
          }}>
            <thead>
              <tr style={{ background: 'rgba(191,95,255,0.08)' }}>
                {b.header.map((h, j) => (
                  <th key={j} style={{
                    padding: '8px 10px', textAlign: 'left',
                    fontWeight: 700, fontSize: 11, color: '#cbd5e1',
                    textTransform: 'uppercase', letterSpacing: '0.03em',
                    borderBottom: '1px solid rgba(255,255,255,0.12)',
                    whiteSpace: 'nowrap',
                  }}>{inline(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                  {r.map((cell, ci) => (
                    <td key={ci} style={{
                      padding: '8px 10px',
                      borderTop: '1px solid rgba(255,255,255,0.05)',
                      verticalAlign: 'top',
                    }}>{inline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return <div key={i} style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>{inline(b.text)}</div>;
  });
}

const KEYFRAMES = `
@keyframes athenaIconGlow {
  0%,100% { filter: drop-shadow(0 0 5px rgba(0,210,255,0.5)) drop-shadow(0 0 10px rgba(140,80,255,0.35)); }
  50% { filter: drop-shadow(0 0 9px rgba(0,210,255,0.85)) drop-shadow(0 0 18px rgba(140,80,255,0.55)); }
}
@keyframes athenaOpen {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
@keyframes athenaFloat {
  0%,100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
@keyframes athenaPulse {
  0%,80%,100% { transform: scale(0); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}
`;

function injectKeyframes() {
  const id = 'athena-panel-keyframes';
  if (!document.getElementById(id)) {
    const s = document.createElement('style');
    s.id = id;
    s.textContent = KEYFRAMES;
    document.head.appendChild(s);
  }
}

const GLOW_BTN = {
  background: 'none', border: 'none', outline: 'none',
  margin: 0, cursor: 'pointer',
  padding: '6px 8px',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
  overflow: 'visible',
  boxShadow: 'none', WebkitAppearance: 'none', appearance: 'none',
  filter: 'drop-shadow(0 0 6px rgba(0,210,255,0.6)) drop-shadow(0 0 12px rgba(140,80,255,0.4))',
  animation: 'athenaIconGlow 2.5s ease-in-out infinite',
  transition: 'transform 0.2s, filter 0.2s',
  lineHeight: 0,
};

export function AthenaTriggerBtn({ size = 56, onClick, style = {} }) {
  useEffect(injectKeyframes, []);
  const { canUseAthena, loading } = useAthenaPermission();
  const [denied, setDenied] = useState(false);
  const baseFilter = 'drop-shadow(0 0 6px rgba(0,210,255,0.6)) drop-shadow(0 0 12px rgba(140,80,255,0.4))';
  const hoverFilter = 'drop-shadow(0 0 10px rgba(0,210,255,0.9)) drop-shadow(0 0 20px rgba(140,80,255,0.6))';
  const handleClick = (e) => {
    if (loading) return;
    if (!canUseAthena) {
      e.preventDefault();
      e.stopPropagation();
      setDenied(true);
      return;
    }
    onClick?.(e);
  };
  return (
    <>
      <button
        onClick={handleClick}
        aria-label="Ask Athena"
        title={canUseAthena ? 'Ask Athena' : 'Athena access required'}
        style={{ ...GLOW_BTN, ...style }}
        onMouseOver={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.filter = hoverFilter; }}
        onMouseOut={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.filter = baseFilter; }}
      >
        <AthenaIcon size={size} />
      </button>
      {denied && <AthenaAccessDeniedModal onClose={() => setDenied(false)} />}
    </>
  );
}

function AthenaAccessDeniedModal({ onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        zIndex: 10050, backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'rgba(15,20,30,0.98)',
          border: '1px solid rgba(191,95,255,0.25)',
          borderRadius: 16,
          padding: '28px 32px',
          width: 'min(92vw, 440px)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(191,95,255,0.12)',
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <AthenaIcon size={56} />
        </div>
        <h3 style={{
          color: '#F0F6FC', margin: '0 0 8px', fontSize: '1.15rem', fontWeight: 700,
        }}>
          Athena access is restricted
        </h3>
        <p style={{ color: '#94A3B8', fontSize: '0.9rem', margin: '0 0 20px', lineHeight: 1.5 }}>
          Your account doesn't have permission to use Athena yet.<br />
          <strong style={{ color: '#BF5FFF' }}>Please contact CX R&D</strong> to request access.
        </p>
        <button
          onClick={onClose}
          style={{
            padding: '8px 22px',
            background: 'linear-gradient(135deg, rgba(0,210,255,0.2), rgba(191,95,255,0.2))',
            border: '1px solid rgba(191,95,255,0.4)',
            color: '#F0F6FC',
            borderRadius: 10,
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

export default function AthenaPanel({
  athenaState, setAthenaState,
  athenaSessions, athenaActiveSession,
  athenaActiveSessionId, setAthenaActiveSessionId,
  athenaInput, setAthenaInput,
  athenaThinking, athenaScrollRef,
  closeAthenaSession, sendAthenaMessage,
  stopAthenaMessage, retryAthenaMessage,
  transcriptLimit, setTranscriptLimit,
  athenaModel, setAthenaModel,
  pageLabel = 'records',
}) {
  useEffect(injectKeyframes, []);
  const { isAdmin, canUseAthena } = useAthenaPermission();
  const [viewingConvId, setViewingConvId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [limitDraft, setLimitDraft] = useState(String(transcriptLimit ?? 50));
  const [copiedKey, setCopiedKey] = useState(null);
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [attachError, setAttachError] = useState(null);
  const fileInputRef = useRef(null);

  // Resize the image client-side so big screenshots fit under Vercel's 4.5MB
  // request body cap (with base64 overhead an unresized 4K PNG can be ~6MB).
  // Returns a data URL — JPEG when the source is already JPEG, otherwise PNG-encoded
  // through the canvas (loses transparency but most screenshots don't need it).
  const ATTACH_MAX_PER_TURN = 4;
  const ATTACH_MAX_BYTES = 1_500_000; // approx, post-resize
  const IMG_MAX_DIMENSION = 1600;

  const fileToResizedDataUrl = (file) => new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      reject(new Error('Not an image'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Read failed'));
    reader.onload = () => {
      const original = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        const { naturalWidth: w, naturalHeight: h } = img;
        const longest = Math.max(w, h);
        // Only resize if oversized or original blob is heavy. Otherwise pass-through
        // (preserves PNG transparency and avoids JPEG artifacts on small images).
        if (longest <= IMG_MAX_DIMENSION && original.length < ATTACH_MAX_BYTES) {
          resolve({ dataUrl: original, width: w, height: h });
          return;
        }
        const scale = longest > IMG_MAX_DIMENSION ? IMG_MAX_DIMENSION / longest : 1;
        const tw = Math.round(w * scale);
        const th = Math.round(h * scale);
        const canvas = document.createElement('canvas');
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, tw, th);
        // JPEG q=0.85 for screenshots — small enough to fit, sharp enough for OCR.
        const out = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ dataUrl: out, width: tw, height: th });
      };
      img.onerror = () => reject(new Error('Decode failed'));
      img.src = original;
    };
    reader.readAsDataURL(file);
  });

  const addAttachments = async (files) => {
    setAttachError(null);
    const list = Array.from(files || []).filter(f => f && f.type && f.type.startsWith('image/'));
    if (list.length === 0) return;
    const remaining = Math.max(0, ATTACH_MAX_PER_TURN - pendingAttachments.length);
    if (remaining === 0) {
      setAttachError(`Max ${ATTACH_MAX_PER_TURN} images per message`);
      return;
    }
    const accepted = list.slice(0, remaining);
    if (list.length > remaining) {
      setAttachError(`Only the first ${remaining} image(s) were added (max ${ATTACH_MAX_PER_TURN})`);
    }
    const next = [];
    for (const f of accepted) {
      try {
        const { dataUrl, width, height } = await fileToResizedDataUrl(f);
        next.push({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          dataUrl,
          name: f.name || 'screenshot.png',
          mime: f.type,
          size: dataUrl.length,
          width,
          height,
        });
      } catch (e) {
        setAttachError(`Couldn't read ${f.name || 'image'}: ${e.message || e}`);
      }
    }
    if (next.length) setPendingAttachments(prev => [...prev, ...next]);
  };

  const removeAttachment = (id) => setPendingAttachments(prev => prev.filter(a => a.id !== id));

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imgFiles = [];
    for (const it of items) {
      if (it && it.kind === 'file' && it.type && it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) imgFiles.push(f);
      }
    }
    if (imgFiles.length > 0) {
      e.preventDefault();
      addAttachments(imgFiles);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length) addAttachments(files);
  };

  const submitMessage = () => {
    if (athenaThinking) return;
    if (!athenaInput.trim() && pendingAttachments.length === 0) return;
    sendAthenaMessage(undefined, pendingAttachments);
    setPendingAttachments([]);
    setAttachError(null);
  };

  const copyToClipboard = async (text, key) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(prev => (prev === key ? null : prev)), 1500);
    } catch (_) { /* clipboard denied — ignore */ }
  };

  // Export the active session as Markdown. Captures context label, item count,
  // and the full message thread, with [CONV:id] pills preserved as inline tokens.
  const exportActiveSession = () => {
    const s = athenaActiveSession;
    if (!s || !s.messages?.length) return;
    const header = [
      `# Athena chat — ${s.contextLabel || 'Session'}`,
      `Context: ${s.itemCount || 0} ${pageLabel}`,
      `Exported: ${new Date().toISOString()}`,
      '',
    ].join('\n');
    const body = s.messages.map(m => {
      const who = m.role === 'athena' ? 'Athena' : 'You';
      return `### ${who}\n\n${m.content || ''}`;
    }).join('\n\n');
    const md = header + body + '\n';
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const slug = String(s.contextLabel || 'athena').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
    a.download = `athena_${slug || 'session'}_${stamp}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (athenaState === 'closed') return null;

  if (athenaState === 'minimized') {
    return (
      <div
        onClick={() => setAthenaState('open')}
        style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 10002, cursor: 'pointer', ...GLOW_BTN }}
      >
        <AthenaIcon size={52} />
        {athenaSessions.length > 0 && (
          <div style={{
            position: 'absolute', top: -4, right: -4,
            width: 20, height: 20, borderRadius: '50%',
            background: '#BF5FFF', color: '#fff',
            fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #0b0f14',
          }}>{athenaSessions.length}</div>
        )}
      </div>
    );
  }

  return (
    <>
      <div onClick={() => setAthenaState('minimized')} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 10000, backdropFilter: 'blur(2px)',
      }} />
      <div
        onDragOver={(e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={(e) => { if (e.currentTarget.contains(e.relatedTarget)) return; setDragOver(false); }}
        onDrop={handleDrop}
        style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(94vw, 960px)', height: 'min(88vh, 720px)',
        background: 'rgba(11,15,20,0.98)',
        border: `1px solid ${dragOver ? 'rgba(191,95,255,0.55)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 16,
        boxShadow: dragOver ? '0 20px 60px rgba(0,0,0,0.6), 0 0 60px rgba(191,95,255,0.30)' : '0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(191,95,255,0.08)',
        zIndex: 10001, display: 'flex', overflow: 'hidden',
        animation: 'athenaOpen 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        {dragOver && (
          <div style={{
            position: 'absolute', inset: 12, zIndex: 10003, pointerEvents: 'none',
            border: '2px dashed rgba(191,95,255,0.6)', borderRadius: 12,
            background: 'rgba(11,15,20,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#BF5FFF', fontSize: 16, fontWeight: 700, letterSpacing: 0.4,
          }}>
            Drop images to attach
          </div>
        )}
        {/* Sidebar */}
        <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', background: 'rgba(8,12,18,0.6)' }}>
          <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
            <AthenaIcon size={28} />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>Athena</span>
            <span style={{ fontSize: 10, fontWeight: 700, background: 'linear-gradient(90deg, #00E5FF, #BF5FFF, #FF3CAC)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: 0.5 }}>AI</span>
            <div style={{ position: 'absolute', bottom: 0, left: 12, right: 12, height: 2, borderRadius: 1, background: 'linear-gradient(90deg, #00E5FF, #BF5FFF, #FF3CAC)', opacity: 0.4 }} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {athenaSessions.length === 0 ? (
              <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: 12, color: '#475569' }}>No active chats</div>
            ) : athenaSessions.map(s => (
              <div key={s.id} onClick={() => { setAthenaActiveSessionId(s.id); setAthenaInput(''); }}
                style={{
                  padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                  background: s.id === athenaActiveSessionId ? 'rgba(191,95,255,0.1)' : 'transparent',
                  border: s.id === athenaActiveSessionId ? '1px solid rgba(191,95,255,0.2)' : '1px solid transparent',
                  borderLeft: s.id === athenaActiveSessionId ? `3px solid ${s.contextColor || '#BF5FFF'}` : '3px solid transparent',
                  transition: 'all 0.15s', display: 'flex', alignItems: 'flex-start', gap: 8,
                }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 4, background: s.contextColor || '#BF5FFF', boxShadow: `0 0 8px ${s.contextColor || '#BF5FFF'}66` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.contextLabel}</div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{s.itemCount} {pageLabel} · {s.messages.length} msgs</div>
                </div>
                <button onClick={e => { e.stopPropagation(); closeAthenaSession(s.id); }}
                  style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>×</button>
              </div>
            ))}
          </div>

          {/* Settings footer — admin only */}
          {canUseAthena && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <button
                onClick={() => { setShowSettings(v => !v); setLimitDraft(String(transcriptLimit ?? 50)); }}
                style={{
                  width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', color: showSettings ? '#BF5FFF' : '#475569',
                  fontSize: 11, fontWeight: 600, transition: 'color 0.15s',
                }}
                onMouseOver={e => { e.currentTarget.style.color = '#BF5FFF'; }}
                onMouseOut={e => { if (!showSettings) e.currentTarget.style.color = '#475569'; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                Athena Settings
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ marginLeft: 'auto', transform: showSettings ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {showSettings && (() => {
                // Per-model pricing ($ per 1M tokens). Edit here to update.
                const MODELS = {
                  'gpt-5.4-mini': { label: 'GPT-5.4 mini', inRate: 0.25, outRate: 2.00 },
                  'gpt-5.4':      { label: 'GPT-5.4',      inRate: 1.25, outRate: 10.00 },
                };
                const TOKENS_PER_TRANSCRIPT = 625;   // 2,400 char body + ~100 char header
                const TOKENS_SYSTEM_PROMPT  = 400;
                const TOKENS_MAX_OUTPUT     = 4000;

                const activeModel = MODELS[athenaModel] ? athenaModel : 'gpt-5.4-mini';
                const m = MODELS[activeModel];
                const CPT   = (TOKENS_PER_TRANSCRIPT / 1_000_000) * m.inRate;
                const F_IN  = (TOKENS_SYSTEM_PROMPT  / 1_000_000) * m.inRate;
                const F_OUT = (TOKENS_MAX_OUTPUT     / 1_000_000) * m.outRate;
                const draftN = Math.min(Math.max(parseInt(limitDraft, 10) || 50, 10), 1500);
                const varCost   = draftN * CPT;
                const fixedCost = F_IN + F_OUT;
                const estTotal  = varCost + fixedCost;
                const fmt = (v) => {
                  if (v < 0.001) return `$${v.toFixed(6)}`;
                  if (v < 0.01)  return `$${v.toFixed(5)}`;
                  if (v < 0.10)  return `$${v.toFixed(4)}`;
                  return `$${v.toFixed(3)}`;
                };
                const costColor = estTotal < 0.05 ? '#3FB950' : estTotal < 0.15 ? '#F0883E' : '#FF2E97';
                return (
                  <div style={{ padding: '8px 14px 14px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    {/* Model picker */}
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      Model
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 12 }}>
                      {Object.entries(MODELS).map(([id, info]) => {
                        const active = activeModel === id;
                        return (
                          <button key={id}
                            onClick={() => setAthenaModel(id)}
                            title={`${info.label} · $${info.inRate.toFixed(2)}/1M in · $${info.outRate.toFixed(2)}/1M out`}
                            style={{
                              padding: '5px 7px', borderRadius: 6, cursor: 'pointer',
                              background: active ? 'linear-gradient(135deg, rgba(0,210,255,0.15), rgba(191,95,255,0.15))' : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${active ? 'rgba(191,95,255,0.4)' : 'rgba(255,255,255,0.07)'}`,
                              color: active ? '#BF5FFF' : '#94a3b8',
                              fontSize: 10, fontWeight: 600,
                              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
                            }}
                          >
                            <span>{info.label}</span>
                            <span style={{ fontSize: 8, color: active ? '#BF5FFF' : '#64748b', fontFamily: 'ui-monospace, monospace' }}>
                              ${info.inRate.toFixed(2)} / ${info.outRate.toFixed(2)} per 1M
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ fontSize: 10, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                      Conversations per message
                    </div>

                    {/* Cost card */}
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 7, padding: '8px 10px', marginBottom: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                        <span style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Est. cost / message</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: costColor, fontFamily: 'ui-monospace, monospace' }}>{fmt(estTotal)}</span>
                      </div>
                      {/* Breakdown rows */}
                      {[
                        { label: `${draftN} transcripts × $0.000250 (max)`, value: varCost, color: '#94a3b8' },
                        { label: 'System prompt (input)',               value: F_IN,   color: '#64748b' },
                        { label: 'Output reply (max 4k tokens)',        value: F_OUT,  color: '#64748b' },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 3 }}>
                          <span style={{ fontSize: 9, color }}>{label}</span>
                          <span style={{ fontSize: 9, fontFamily: 'ui-monospace, monospace', color }}>{fmt(value)}</span>
                        </div>
                      ))}
                      <div style={{ marginTop: 5, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 4, fontSize: 8, color: '#374151' }}>
                        {m.label} · ${m.inRate.toFixed(2)}/1M in · ${m.outRate.toFixed(2)}/1M out · max 2,400 chars/transcript · actual cost may be lower
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="number"
                        min={10} max={1500} step={10}
                        value={limitDraft}
                        onChange={e => setLimitDraft(e.target.value)}
                        style={{
                          flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(191,95,255,0.25)',
                          borderRadius: 6, padding: '5px 8px', color: '#e2e8f0', fontSize: 12,
                          outline: 'none', fontFamily: 'ui-monospace, monospace',
                        }}
                      />
                      <button
                        onClick={() => {
                          const n = Math.min(Math.max(parseInt(limitDraft, 10) || 50, 10), 1500);
                          setTranscriptLimit(n);
                          setLimitDraft(String(n));
                          setShowSettings(false);
                        }}
                        style={{
                          padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                          background: 'linear-gradient(135deg, rgba(0,210,255,0.2), rgba(191,95,255,0.2))',
                          color: '#BF5FFF', fontSize: 11, fontWeight: 600,
                          border: '1px solid rgba(191,95,255,0.3)',
                        }}
                      >Save</button>
                    </div>

                    {/* Preset buttons with cost labels */}
                    <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {[10, 50, 100, 200, 500, 750, 1000, 1500].map(v => {
                        const vTotal = v * CPT + fixedCost;
                        const active = parseInt(limitDraft) === v;
                        return (
                          <button key={v}
                            onClick={() => setLimitDraft(String(v))}
                            title={`${v} transcripts · ${fmt(vTotal)}/msg`}
                            style={{
                              display: 'flex', flexDirection: 'column', alignItems: 'center',
                              padding: '3px 7px', borderRadius: 5,
                              border: `1px solid ${active ? 'rgba(191,95,255,0.35)' : 'rgba(255,255,255,0.07)'}`,
                              background: active ? 'rgba(191,95,255,0.15)' : 'rgba(255,255,255,0.03)',
                              cursor: 'pointer', gap: 1,
                            }}
                          >
                            <span style={{ fontSize: 10, fontFamily: 'ui-monospace, monospace', color: active ? '#BF5FFF' : '#94a3b8', fontWeight: active ? 700 : 400 }}>{v}</span>
                            <span style={{ fontSize: 8, color: active ? '#BF5FFF' : '#475569', fontFamily: 'ui-monospace, monospace' }}>{fmt(vTotal)}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ marginTop: 8, fontSize: 10, color: '#475569' }}>
                      Active: <span style={{ color: '#BF5FFF', fontFamily: 'ui-monospace, monospace' }}>{transcriptLimit}</span>
                      <span style={{ margin: '0 5px', color: '#374151' }}>·</span>
                      <span style={{ color: '#64748b' }}>{fmt(transcriptLimit * CPT + fixedCost)}/msg</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Main area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              {athenaActiveSession ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: athenaActiveSession.contextColor, boxShadow: `0 0 8px ${athenaActiveSession.contextColor}66` }} />
                    {athenaActiveSession.contextLabel}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{athenaActiveSession.itemCount} {pageLabel}</div>
                </>
              ) : (
                <div style={{ fontSize: 14, fontWeight: 600, color: '#64748b' }}>Select a chat</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {athenaActiveSession && athenaActiveSession.messages?.length > 0 && (
                <button onClick={exportActiveSession} title="Export chat as Markdown"
                  style={{ background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.30)', borderRadius: 8, height: 32, padding: '0 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#4ADE80', fontSize: 12, fontWeight: 600 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Export
                </button>
              )}
              <button onClick={() => setAthenaState('minimized')} title="Minimize"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 16 }}>−</button>
              <button onClick={() => setAthenaState('closed')} title="Close"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 14 }}>✕</button>
            </div>
          </div>

          {athenaActiveSession ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div ref={athenaScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: 'radial-gradient(ellipse at 50% 30%, rgba(123,47,255,0.06) 0%, rgba(0,229,255,0.03) 40%, transparent 70%)' }}>
                {athenaActiveSession.messages.length === 0 && (
                  <div style={{ textAlign: 'center', paddingTop: 30 }}>
                    <div style={{ animation: 'athenaFloat 3s ease-in-out infinite', display: 'inline-block' }}>
                      <AthenaIcon size={80} />
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 700, marginTop: 16, background: 'linear-gradient(90deg, #00E5FF, #BF5FFF, #FF3CAC)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                      Hi, I'm Athena
                    </div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 8, lineHeight: 1.5 }}>
                      Deep-diving into <strong style={{ color: '#cbd5e1' }}>{athenaActiveSession.itemCount}</strong> {pageLabel} related to
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: athenaActiveSession.contextColor, boxShadow: `0 0 8px ${athenaActiveSession.contextColor}` }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: athenaActiveSession.contextColor }}>{athenaActiveSession.contextLabel}</span>
                    </div>
                    <div style={{ marginTop: 28, fontSize: 10, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>Try asking</div>
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                      {[
                        { icon: '🔍', q: 'What are the most common pain points here?' },
                        { icon: '📊', q: "What's the overall sentiment in this group?" },
                        { icon: '🎯', q: 'Which issues should we prioritize first?' },
                        { icon: '🔁', q: 'Are there recurring patterns in customer feedback?' },
                      ].map(({ icon, q }, i) => (
                        <div key={i} onClick={() => sendAthenaMessage(q)}
                          style={{ padding: '12px 18px', borderRadius: 12, fontSize: 13, color: '#94a3b8', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'all 0.2s', maxWidth: 420, width: '100%', display: 'flex', alignItems: 'center', gap: 12 }}
                          onMouseOver={e => { e.currentTarget.style.background = 'rgba(191,95,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(191,95,255,0.3)'; e.currentTarget.style.color = '#e2e8f0'; }}
                          onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#94a3b8'; }}>
                          <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
                          <span style={{ flex: 1, textAlign: 'left' }}>{q}</span>
                          <span style={{ color: '#BF5FFF', fontSize: 16 }}>→</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {athenaActiveSession.messages.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {athenaActiveSession.messages.map((m, i) => {
                      const isAthena = m.role === 'athena';
                      const msgKey = `${athenaActiveSession.id}:${i}`;
                      const copied = copiedKey === msgKey;
                      const isLastAthena = isAthena && i === athenaActiveSession.messages.length - 1;
                      return (
                        <div key={i} style={{ display: 'flex', gap: 10, justifyContent: isAthena ? 'flex-start' : 'flex-end' }}>
                          {isAthena && <div style={{ flexShrink: 0, marginTop: 2 }}><AthenaIcon size={28} /></div>}
                          <div style={{ maxWidth: isAthena ? '92%' : '75%', display: 'flex', flexDirection: 'column', alignItems: isAthena ? 'flex-start' : 'flex-end' }}>
                            <div style={{ padding: '10px 16px', borderRadius: 14, fontSize: 13, lineHeight: 1.6, color: '#e2e8f0', background: isAthena ? 'rgba(15,20,30,0.8)' : 'rgba(99,102,241,0.2)', border: isAthena ? '1px solid rgba(191,95,255,0.15)' : 'none', wordBreak: 'break-word' }}>
                              {!isAthena && Array.isArray(m.attachments) && m.attachments.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: m.content ? 8 : 0 }}>
                                  {m.attachments.map((a) => (
                                    <a key={a.id} href={a.dataUrl} target="_blank" rel="noreferrer"
                                      style={{ display: 'block', lineHeight: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)' }}>
                                      <img src={a.dataUrl} alt={a.name || 'attachment'}
                                        style={{ maxWidth: 220, maxHeight: 180, display: 'block', objectFit: 'cover' }} />
                                    </a>
                                  ))}
                                </div>
                              )}
                              {isAthena ? renderAthenaText(m.content, setViewingConvId) : (m.content ? <span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span> : null)}
                            </div>
                            {isAthena && m.content && (
                              <div style={{ marginTop: 4, display: 'inline-flex', gap: 6 }}>
                                <button
                                  onClick={() => copyToClipboard(m.content, msgKey)}
                                  title={copied ? 'Copied!' : 'Copy message'}
                                  style={{
                                    padding: '3px 8px', borderRadius: 6,
                                    background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${copied ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.07)'}`,
                                    color: copied ? '#4ADE80' : '#64748b',
                                    fontSize: 10, fontWeight: 600, cursor: 'pointer',
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    transition: 'color 0.15s, background-color 0.15s, border-color 0.15s',
                                  }}
                                  onMouseOver={e => { if (!copied) e.currentTarget.style.color = '#cbd5e1'; }}
                                  onMouseOut={e => { if (!copied) e.currentTarget.style.color = '#64748b'; }}
                                >
                                  {copied ? (
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                  ) : (
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                    </svg>
                                  )}
                                  {copied ? 'Copied' : 'Copy'}
                                </button>
                                {isLastAthena && retryAthenaMessage && !athenaThinking && (
                                  <button
                                    onClick={() => retryAthenaMessage()}
                                    title="Re-ask Athena — replaces this reply"
                                    style={{
                                      padding: '3px 8px', borderRadius: 6,
                                      background: 'rgba(255,255,255,0.03)',
                                      border: '1px solid rgba(255,255,255,0.07)',
                                      color: '#64748b',
                                      fontSize: 10, fontWeight: 600, cursor: 'pointer',
                                      display: 'inline-flex', alignItems: 'center', gap: 4,
                                      transition: 'color 0.15s, background-color 0.15s, border-color 0.15s',
                                    }}
                                    onMouseOver={e => { e.currentTarget.style.color = '#BF5FFF'; e.currentTarget.style.borderColor = 'rgba(191,95,255,0.35)'; }}
                                    onMouseOut={e => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; }}
                                  >
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="23 4 23 10 17 10"/>
                                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                                    </svg>
                                    Retry
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {athenaThinking && (
                      <div style={{ display: 'flex', gap: 10 }}>
                        <div style={{ flexShrink: 0, marginTop: 2 }}><AthenaIcon size={28} /></div>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '12px 16px', background: 'rgba(15,20,30,0.8)', border: '1px solid rgba(191,95,255,0.15)', borderRadius: 14 }}>
                          {[0, 1, 2].map(i => (
                            <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#BF5FFF', animation: `athenaPulse 1.4s ease-in-out ${i * 0.2}s infinite` }} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div style={{ padding: '12px 20px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                {pendingAttachments.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    {pendingAttachments.map((a) => (
                      <div key={a.id} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(191,95,255,0.3)' }}>
                        <img src={a.dataUrl} alt={a.name || 'attachment'}
                          style={{ width: 64, height: 64, objectFit: 'cover', display: 'block' }} />
                        <button onClick={() => removeAttachment(a.id)} title="Remove"
                          style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, padding: 0, borderRadius: '50%',
                            background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', fontSize: 11, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                {attachError && (
                  <div style={{ marginBottom: 8, fontSize: 11, color: '#FF6B6B' }}>{attachError}</div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" multiple
                  style={{ display: 'none' }}
                  onChange={(e) => { addAttachments(e.target.files); e.target.value = ''; }} />
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach image"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: '#94a3b8' }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                    </svg>
                  </button>
                  <input type="text" value={athenaInput} onChange={e => setAthenaInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !athenaThinking) submitMessage(); }}
                    onPaste={handlePaste}
                    placeholder="Ask Athena about this segment..."
                    style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 16px', color: '#e2e8f0', fontSize: 13, outline: 'none' }}
                  />
                  {athenaThinking && stopAthenaMessage ? (
                    <button onClick={() => stopAthenaMessage()} title="Stop generating"
                      style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)', border: 'none', borderRadius: 12, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="6" y="6" width="12" height="12" rx="2"/>
                      </svg>
                    </button>
                  ) : (
                    <button onClick={() => submitMessage()} disabled={(!athenaInput.trim() && pendingAttachments.length === 0) || athenaThinking}
                      style={{ background: ((!athenaInput.trim() && pendingAttachments.length === 0) || athenaThinking) ? 'rgba(255,255,255,0.04)' : 'linear-gradient(135deg, #7B2FFF, #BF5FFF)', border: 'none', borderRadius: 12, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: ((!athenaInput.trim() && pendingAttachments.length === 0) || athenaThinking) ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={((!athenaInput.trim() && pendingAttachments.length === 0) || athenaThinking) ? '#475569' : '#fff'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 10, textAlign: 'center', marginTop: 8, fontWeight: 600, letterSpacing: 0.5, background: 'linear-gradient(90deg, #00E5FF, #BF5FFF, #FF3CAC)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', opacity: 0.4 }}>
                  Powered by Athena AI
                </div>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
              <AthenaIcon size={60} />
              <div style={{ fontSize: 14, color: '#64748b' }}>Select a chat or start a new one</div>
            </div>
          )}
        </div>
      </div>
      <TranscriptModal
        isOpen={!!viewingConvId}
        onClose={() => setViewingConvId(null)}
        conversationId={viewingConvId}
      />
    </>
  );
}
