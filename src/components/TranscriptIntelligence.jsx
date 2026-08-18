import { useState, useRef, useEffect, useCallback } from "react";
import { useAthenaPermission } from "../contexts/AthenaPermissionContext";
import AthenaIcon from "./AthenaIcon";

// ─── Markdown Renderer ───────────────────────────────────────────
function renderMarkdown(text) {
  if (!text) return "";
  let html = text;

  // Tables: detect markdown tables and convert
  html = html.replace(
    /(?:^|\n)(\|.+\|)\n(\|[\s:-]+\|)\n((?:\|.+\|\n?)+)/g,
    (_, header, separator, body) => {
      const headers = header.split("|").filter(c => c.trim()).map(c => `<th style="padding:6px 12px;text-align:left;border-bottom:1px solid rgba(255,255,255,0.15);font-size:12px;font-weight:600;color:#94a3b8;white-space:nowrap">${c.trim()}</th>`).join("");
      const rows = body.trim().split("\n").map(row => {
        const cells = row.split("|").filter(c => c.trim()).map(c => `<td style="padding:5px 12px;font-size:13px;color:#cbd5e1;border-bottom:1px solid rgba(255,255,255,0.04)">${c.trim()}</td>`).join("");
        return `<tr>${cells}</tr>`;
      }).join("");
      return `<div style="overflow-x:auto;margin:12px 0"><table style="width:100%;border-collapse:collapse;background:rgba(255,255,255,0.02);border-radius:8px;overflow:hidden"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }
  );

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:14px;font-weight:600;color:#e2e8f0;margin:16px 0 8px">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 style="font-size:16px;font-weight:700;color:#f1f5f9;margin:18px 0 10px">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 style="font-size:18px;font-weight:700;color:#f1f5f9;margin:20px 0 10px">$1</h1>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e2e8f0;font-weight:600">$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;font-size:12px;color:#a5b4fc;font-family:monospace">$1</code>');

  // Unordered lists
  html = html.replace(/^[\t ]*[-*] (.+)$/gm, '<li style="margin:3px 0;color:#cbd5e1;line-height:1.6">$1</li>');
  html = html.replace(/((?:<li[^>]*>.*<\/li>\s*)+)/g, '<ul style="margin:8px 0;padding-left:20px;list-style:disc">$1</ul>');

  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li style="margin:3px 0;color:#cbd5e1;line-height:1.6">$1</li>');

  // Conversation links [CONV:id]
  html = html.replace(
    /\[CONV:(\d+)\]/g,
    '<a class="conv-link" data-conv-id="$1" style="color:#C084FC;cursor:pointer;text-decoration:none;font-family:monospace;font-size:12px;background:rgba(56,189,248,0.08);padding:2px 6px;border-radius:4px;transition:all 0.15s">[CONV:$1]</a>'
  );

  // Line breaks
  html = html.replace(/\n/g, "<br/>");

  return html;
}

// ─── Simple Date Pickers ──────────────────────────────────────────
function SimpleDateInput({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 8,
          color: "#cbd5e1",
          padding: "6px 10px",
          fontSize: 12,
          outline: "none",
          cursor: "pointer",
          colorScheme: "dark",
        }}
      />
    </div>
  );
}

// ─── Suggestion Prompts ──────────────────────────────────────────
const SUGGESTIONS = [
  { icon: "📊", text: "What are the top 5 reasons customers contact support?" },
  { icon: "😡", text: "Show me conversations where customers were frustrated" },
  { icon: "💰", text: "What payout-related complaints came up recently?" },
  { icon: "⭐", text: "How is the overall customer sentiment trending?" },
  { icon: "🔍", text: "Find conversations about KYC verification issues" },
];

// ─── Access-denied screen (matches Athena trigger modal tone) ────
function TranscriptIntelligenceLocked() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "calc(100vh - 220px)",
      minHeight: 500,
      background: "rgba(15,23,42,0.4)",
      borderRadius: 16,
      border: "1px solid rgba(255,255,255,0.06)",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 20px",
      textAlign: "center",
    }}>
      <div style={{ marginBottom: 16 }}>
        <AthenaIcon size={72} />
      </div>
      <h2 style={{
        fontSize: 20, fontWeight: 700, color: "#F0F6FC",
        margin: "0 0 8px",
      }}>
        Transcript Intelligence is restricted
      </h2>
      <p style={{
        fontSize: 14, color: "#94A3B8", margin: 0, maxWidth: 440,
        lineHeight: 1.6,
      }}>
        This feature runs on Athena's RAG engine. Your account doesn't have access yet —{" "}
        <strong style={{ color: "#BF5FFF" }}>please contact CX R&D</strong> to request permission.
      </p>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────
export default function TranscriptIntelligence() {
  const { canUseAthena, loading: permLoading } = useAthenaPermission();
  if (permLoading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "calc(100vh - 220px)", minHeight: 500,
        background: "rgba(15,23,42,0.4)", borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.06)",
        color: "#64748b", fontSize: 13,
      }}>
        Checking access…
      </div>
    );
  }
  if (!canUseAthena) return <TranscriptIntelligenceLocked />;
  return <TranscriptIntelligenceInner />;
}

function TranscriptIntelligenceInner() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [stats, setStats] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [transcriptPopup, setTranscriptPopup] = useState(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const chatContainerRef = useRef(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  // Fetch stats on date change
  useEffect(() => {
    fetchStats();
  }, [dateStart, dateEnd]);

  const fetchStats = async () => {
    try {
      const params = new URLSearchParams();
      if (dateStart) params.set("dateStart", dateStart);
      if (dateEnd) params.set("dateEnd", dateEnd);
      const res = await fetch(`/api/rag?action=insights&${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Stats fetch error:", err);
    }
  };

  const handleSend = useCallback(async (messageText) => {
    const text = messageText || input.trim();
    if (!text || loading) return;

    const userMsg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      // Build date params with +06:00 offset
      const dStart = dateStart ? `${dateStart}T00:00:00+06:00` : undefined;
      const dEnd = dateEnd ? `${dateEnd}T23:59:59+06:00` : undefined;

      const res = await fetch("/api/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          dateStart: dStart,
          dateEnd: dEnd,
          history: newMessages.slice(-6),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Chat request failed");
      }

      const data = await res.json();
      setMessages([...newMessages, {
        role: "assistant",
        content: data.answer,
        sources: data.sources,
        stats: data.stats,
        dataSource: data.dataSource,
      }]);
    } catch (err) {
      setMessages([...newMessages, {
        role: "assistant",
        content: `Error: ${err.message}. Please try again.`,
        isError: true,
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, messages, dateStart, dateEnd, loading]);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/rag?action=embed", { method: "POST" });
      const data = await res.json();
      setSyncResult(data);
      // Refresh stats after sync
      fetchStats();
    } catch (err) {
      setSyncResult({ error: err.message });
    } finally {
      setSyncing(false);
    }
  };

  const openTranscript = async (convId) => {
    setTranscriptLoading(true);
    setTranscriptPopup({ id: convId, data: null });
    try {
      const res = await fetch(`/api/rag?action=transcript&id=${convId}`);
      if (!res.ok) throw new Error("Transcript not found");
      const data = await res.json();
      setTranscriptPopup({ id: convId, data });
    } catch (err) {
      setTranscriptPopup({ id: convId, error: err.message });
    } finally {
      setTranscriptLoading(false);
    }
  };

  // Handle click on [CONV:id] links
  const handleMessageClick = (e) => {
    const link = e.target.closest(".conv-link");
    if (link) {
      const convId = link.getAttribute("data-conv-id");
      if (convId) openTranscript(convId);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Parse transcript JSON into chat bubbles
  const parseTranscript = (transcriptStr) => {
    try {
      const msgs = typeof transcriptStr === "string" ? JSON.parse(transcriptStr) : transcriptStr;
      if (!Array.isArray(msgs)) return [];
      return msgs.filter(m => m.body && m.body.trim());
    } catch {
      return [];
    }
  };

  const isWelcome = messages.length === 0;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "calc(100vh - 220px)",
      minHeight: 500,
      background: "rgba(15,23,42,0.4)",
      borderRadius: 16,
      border: "1px solid rgba(255,255,255,0.06)",
      overflow: "hidden",
    }}>
      {/* Top Bar: Date Filters + Sync + Stats */}
      <div style={{
        padding: "14px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        background: "rgba(15,23,42,0.6)",
      }}>
        <SimpleDateInput label="From" value={dateStart} onChange={setDateStart} />
        <SimpleDateInput label="To" value={dateEnd} onChange={setDateEnd} />

        <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.08)", margin: "0 4px" }} />

        <button
          onClick={handleSync}
          disabled={syncing}
          style={{
            background: syncing ? "rgba(99,102,241,0.1)" : "rgba(99,102,241,0.15)",
            border: "1px solid rgba(99,102,241,0.3)",
            color: "#a5b4fc",
            borderRadius: 8,
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 600,
            cursor: syncing ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "all 0.2s",
          }}
        >
          {syncing ? (
            <>
              <span style={{ display: "inline-block", animation: "ti-spin 1s linear infinite", fontSize: 14 }}>&#8635;</span>
              Syncing...
            </>
          ) : (
            <>
              <span style={{ fontSize: 14 }}>&#8635;</span>
              Sync Embeddings
            </>
          )}
        </button>

        {syncResult && (
          <span style={{
            fontSize: 11,
            color: syncResult.error ? "#f87171" : "#4ade80",
            background: syncResult.error ? "rgba(248,113,113,0.08)" : "rgba(74,222,128,0.08)",
            padding: "4px 10px",
            borderRadius: 6,
          }}>
            {syncResult.error ? `Error: ${syncResult.error}` : `${syncResult.embedded} new, ${syncResult.existing} total`}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Stats hidden */}
      </div>

      {/* Chat Area */}
      <div
        ref={chatContainerRef}
        onClick={handleMessageClick}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {isWelcome ? (
          /* Welcome Screen */
          <div style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 24,
            padding: "40px 20px",
          }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
            }}>
              🧠
            </div>
            <div style={{ textAlign: "center" }}>
              <h2 style={{
                fontSize: 20,
                fontWeight: 700,
                color: "#f1f5f9",
                margin: "0 0 8px",
              }}>
                Transcript Intelligence
              </h2>
              <p style={{
                fontSize: 14,
                color: "#64748b",
                margin: 0,
                maxWidth: 440,
                lineHeight: 1.6,
              }}>
                Ask questions about customer conversations. Powered by RAG search across all transcripts.
              </p>
            </div>

            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              width: "100%",
              maxWidth: 520,
            }}>
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(s.text)}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    padding: "12px 16px",
                    color: "#cbd5e1",
                    fontSize: 13,
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    transition: "all 0.2s",
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.background = "rgba(99,102,241,0.08)";
                    e.currentTarget.style.borderColor = "rgba(99,102,241,0.2)";
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                  }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{s.icon}</span>
                  <span>{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Messages */
          <>
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                gap: 10,
              }}>
                {msg.role === "assistant" && (
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    background: msg.isError
                      ? "rgba(248,113,113,0.15)"
                      : "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    flexShrink: 0,
                    marginTop: 2,
                  }}>
                    {msg.isError ? "!" : "🧠"}
                  </div>
                )}
                <div style={{
                  maxWidth: msg.role === "user" ? "70%" : "85%",
                  padding: msg.role === "user" ? "10px 16px" : "14px 18px",
                  borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                  background: msg.role === "user"
                    ? "linear-gradient(135deg, #8B5CF6, #8B5CF6)"
                    : msg.isError
                      ? "rgba(248,113,113,0.08)"
                      : "rgba(255,255,255,0.04)",
                  border: msg.role === "user"
                    ? "none"
                    : msg.isError
                      ? "1px solid rgba(248,113,113,0.15)"
                      : "1px solid rgba(255,255,255,0.06)",
                  color: msg.role === "user" ? "#fff" : "#cbd5e1",
                  fontSize: 14,
                  lineHeight: 1.6,
                }}>
                  {msg.role === "user" ? (
                    <span>{msg.content}</span>
                  ) : (
                    <div
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                      style={{ wordBreak: "break-word" }}
                    />
                  )}

                  {/* Stats line for assistant messages */}
                  {msg.role === "assistant" && msg.stats && !msg.isError && (
                    <div style={{
                      marginTop: 10,
                      paddingTop: 8,
                      borderTop: "1px solid rgba(255,255,255,0.06)",
                      fontSize: 11,
                      color: "#475569",
                      display: "flex",
                      gap: 12,
                      flexWrap: "wrap",
                    }}>
                      {/* Stats hidden */}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  flexShrink: 0,
                }}>
                  🧠
                </div>
                <div style={{
                  padding: "14px 18px",
                  borderRadius: "16px 16px 16px 4px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  gap: 4,
                  alignItems: "center",
                }}>
                  <span className="ti-dot" style={{ animationDelay: "0ms" }} />
                  <span className="ti-dot" style={{ animationDelay: "200ms" }} />
                  <span className="ti-dot" style={{ animationDelay: "400ms" }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div style={{
        padding: "14px 20px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(15,23,42,0.6)",
      }}>
        <div style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about customer conversations..."
            rows={1}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              color: "#e2e8f0",
              padding: "12px 16px",
              fontSize: 14,
              outline: "none",
              resize: "none",
              fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
              lineHeight: 1.5,
              maxHeight: 120,
              overflow: "auto",
              transition: "border-color 0.2s",
            }}
            onFocus={e => e.target.style.borderColor = "rgba(99,102,241,0.4)"}
            onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.12)"}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            style={{
              background: (!input.trim() || loading)
                ? "rgba(99,102,241,0.15)"
                : "linear-gradient(135deg, #8B5CF6, #8B5CF6)",
              border: "none",
              borderRadius: 12,
              padding: "12px 20px",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: (!input.trim() || loading) ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.2s",
              opacity: (!input.trim() || loading) ? 0.5 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {loading ? "..." : "Send"}
            {!loading && <span style={{ fontSize: 16 }}>&#10148;</span>}
          </button>
        </div>
      </div>

      {/* Transcript Popup Overlay */}
      {transcriptPopup && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 2000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(4px)",
            }}
            onClick={() => setTranscriptPopup(null)}
          />
          <div style={{
            position: "relative",
            background: "#111827",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 16,
            width: "90%",
            maxWidth: 640,
            maxHeight: "80vh",
            display: "flex",
            flexDirection: "column",
            zIndex: 1,
            overflow: "hidden",
          }}>
            {/* Popup Header */}
            <div style={{
              padding: "16px 20px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
            }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9", margin: 0 }}>
                  Conversation Transcript
                </h3>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2, fontFamily: "monospace" }}>
                  {transcriptPopup.id}
                  {transcriptPopup.data && (
                    <>
                      {transcriptPopup.data.channel && <span> &middot; {transcriptPopup.data.channel}</span>}
                      {transcriptPopup.data.country && <span> &middot; {transcriptPopup.data.country}</span>}
                      {transcriptPopup.data.assignee_name && <span> &middot; {transcriptPopup.data.assignee_name}</span>}
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => setTranscriptPopup(null)}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "none",
                  color: "#94a3b8",
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                &#10005;
              </button>
            </div>

            {/* Popup Body */}
            <div style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px 20px",
            }}>
              {transcriptLoading && !transcriptPopup.data && (
                <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>
                  <div className="ti-dot" style={{ display: "inline-block", marginRight: 4 }} />
                  <div className="ti-dot" style={{ display: "inline-block", marginRight: 4, animationDelay: "200ms" }} />
                  <div className="ti-dot" style={{ display: "inline-block", animationDelay: "400ms" }} />
                  <div style={{ marginTop: 12, fontSize: 13 }}>Loading transcript...</div>
                </div>
              )}
              {transcriptPopup.error && (
                <div style={{ textAlign: "center", padding: 40, color: "#f87171", fontSize: 13 }}>
                  {transcriptPopup.error}
                </div>
              )}
              {transcriptPopup.data && transcriptPopup.data.Transcript && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {parseTranscript(transcriptPopup.data.Transcript).map((msg, i) => {
                    const isCustomer = msg.role === "USER";
                    const time = msg.time
                      ? new Date(msg.time * 1000).toLocaleTimeString("en-US", {
                          timeZone: "Asia/Dhaka",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        })
                      : "";
                    return (
                      <div key={i} style={{
                        display: "flex",
                        justifyContent: isCustomer ? "flex-start" : "flex-end",
                      }}>
                        <div style={{
                          maxWidth: "78%",
                          padding: "10px 14px",
                          borderRadius: isCustomer ? "4px 14px 14px 14px" : "14px 4px 14px 14px",
                          background: isCustomer
                            ? "rgba(255,255,255,0.04)"
                            : "rgba(99,102,241,0.12)",
                          border: isCustomer
                            ? "1px solid rgba(255,255,255,0.08)"
                            : "1px solid rgba(99,102,241,0.2)",
                        }}>
                          <div style={{
                            fontSize: 10,
                            color: isCustomer ? "#64748b" : "#a5b4fc",
                            fontWeight: 600,
                            marginBottom: 4,
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                          }}>
                            <span>{isCustomer ? "Customer" : (msg.author || "Agent")}</span>
                            {time && <span style={{ fontWeight: 400, opacity: 0.7 }}>{time}</span>}
                          </div>
                          <div style={{
                            fontSize: 13,
                            color: "#cbd5e1",
                            lineHeight: 1.5,
                            wordBreak: "break-word",
                          }}>
                            {msg.body}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {transcriptPopup.data && !transcriptPopup.data.Transcript && (
                <div style={{ textAlign: "center", padding: 40, color: "#64748b", fontSize: 13 }}>
                  No transcript data available for this conversation.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CSS animations via style tag */}
      <style>{`
        .ti-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #8B5CF6;
          display: inline-block;
          animation: ti-bounce 1.2s ease-in-out infinite;
        }
        @keyframes ti-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes ti-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .conv-link:hover {
          background: rgba(56,189,248,0.15) !important;
          color: #7dd3fc !important;
        }
      `}</style>
    </div>
  );
}
