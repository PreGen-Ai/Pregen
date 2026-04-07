import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

import "../../styles/AITutor.css";
import { useAuthContext } from "../../../context/AuthContext";
import api from "../../../services/api/api";

/** -----------------------------
 * Safe text conversion (always returns string)
 * ----------------------------- */
const toText = (v) => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);

  if (Array.isArray(v)) {
    return v
      .map((x) => {
        if (typeof x === "string") return x;
        if (x?.msg) {
          const loc = Array.isArray(x.loc) ? x.loc.join(" > ") : "";
          return loc ? `${x.msg} — ${loc}` : x.msg;
        }
        try {
          return JSON.stringify(x);
        } catch {
          return String(x);
        }
      })
      .join("\n");
  }

  if (typeof v === "object") {
    if (v.msg) return String(v.msg);
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  }

  return String(v);
};

/** ------------------------------------------------
 * Normalize API errors into:
 * - text (string)
 * - errors (array for rendering)
 * - raw (debug payload)
 * ------------------------------------------------ */
const normalizeApiError = (err) => {
  const status = err?.response?.status;
  const data = err?.response?.data;

  const detail = data?.detail ?? data?.message ?? data ?? err?.message;

  let errors = [];
  if (Array.isArray(detail)) {
    errors = detail.map((e) => ({
      msg: toText(e?.msg ?? e),
      loc: Array.isArray(e?.loc) ? e.loc : undefined,
      type: e?.type,
    }));
  } else if (detail && typeof detail === "object" && detail.msg) {
    errors = [
      {
        msg: toText(detail.msg),
        loc: Array.isArray(detail.loc) ? detail.loc : undefined,
        type: detail.type,
      },
    ];
  } else if (typeof detail === "string") {
    errors = [{ msg: detail }];
  }

  const baseText =
    status != null ? `Request failed (HTTP ${status}).` : "Request failed.";
  const extraText = toText(detail);
  const text = extraText ? `${baseText}\n\n${extraText}` : baseText;

  const raw = { status, data, detail };

  return { text, errors, raw };
};

/* ── SVG icons ─────────────────────────────────────────────── */

const BotIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
    <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.38-1 1.73V7h1a7 7 0 0 1 7 7H3a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 10 4a2 2 0 0 1 2-2zM7.5 14a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM3 21v-2a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2H3z" />
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
);

const SpinIcon = () => (
  <svg
    className="ait-spin"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    width="16"
    height="16"
  >
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </svg>
);

const ClipIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    width="19"
    height="19"
  >
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

/* ── Component ─────────────────────────────────────────────── */

export default function AITutor() {
  const { user } = useAuthContext() || {};

  const [messages, setMessages] = useState([
    {
      id: "m0",
      sender: "bot",
      text: "Hello! Upload a file or ask me any question — I'm here to help you learn.",
    },
  ]);

  const [input, setInput]       = useState("");
  const [sending, setSending]   = useState(false);
  const [uploading, setUploading] = useState(false);

  const [sessionId, setSessionId] = useState(null);

  const [subject, setSubject]       = useState("mathematics");
  const [tone, setTone]             = useState("supportive");
  const [language, setLanguage]     = useState("English");
  const [curriculum, setCurriculum] = useState("SAT");

  const [showDebug, setShowDebug] = useState(false);

  const [attachedFile, setAttachedFile]         = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const fileInputRef = useRef(null);

  const scrollRef = useRef(null);
  const abortRef  = useRef(null);

  const canSend = useMemo(
    () => !sending && (input.trim().length > 0 || !!attachedFile),
    [sending, input, attachedFile],
  );

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  useEffect(() => {
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  // Start session on mount
  useEffect(() => {
    const startSession = async () => {
      try {
        const newSessionId = `session_${Date.now()}`;
        setSessionId(newSessionId);
        await api.ai.startTutorSession(newSessionId, {
          context: { subject: "general", level: "student" },
        });
      } catch (error) {
        const norm = normalizeApiError(error);
        setMessages((prev) => [
          ...prev,
          {
            id: `b_${Date.now()}`,
            sender: "bot",
            text: "Unable to start AI Tutor session. Refresh the page.",
            errors: norm.errors,
            raw: norm.raw,
          },
        ]);
      }
    };
    startSession();
  }, []);

  // Material upload to session
  const uploadMaterial = async (file) => {
    if (!file || !sessionId || uploading || sending) return;

    setUploading(true);
    setUploadedFileName(file.name);

    setMessages((prev) => [
      ...prev,
      { id: `u_${Date.now()}`, sender: "user", text: `Uploaded: ${file.name}` },
      {
        id: `b_${Date.now() + 1}`,
        sender: "bot",
        text: "Processing the file and extracting key points…",
      },
    ]);

    try {
      const form = new FormData();
      form.append("file", file);
      await api.ai.uploadTutorMaterial(sessionId, form);
      setMessages((prev) => [
        ...prev,
        {
          id: `b_${Date.now() + 2}`,
          sender: "bot",
          text: "File stored for this session. Ask me questions based on it.",
        },
      ]);
    } catch (err) {
      const norm = normalizeApiError(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `b_${Date.now()}`,
          sender: "bot",
          text:
            norm.text ||
            "Upload failed. The file may be image-only or unsupported.",
          errors: norm.errors,
          raw: norm.raw,
        },
      ]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Send message
  const onSend = async () => {
    if (!canSend || !sessionId) return;

    const msgText = input.trim() || "(file attached)";
    setMessages((prev) => [
      ...prev,
      { id: `u_${Date.now()}`, sender: "user", text: msgText },
    ]);
    setInput("");
    setSending(true);

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      let res;

      if (attachedFile) {
        const form = new FormData();
        form.append("message", msgText);
        form.append("session_id", sessionId);
        form.append("subject", subject);
        form.append("tone", tone);
        form.append("language", language);
        form.append("curriculum", curriculum);
        if (user?._id) form.append("user_id", user._id);
        form.append("file", attachedFile);
        res = await api.ai.tutorChat(form, { signal: controller.signal });
      } else {
        res = await api.ai.tutorChat(
          {
            session_id: sessionId,
            message: msgText,
            subject,
            tone,
            language,
            curriculum,
            user_profile: user?._id ? { _id: user._id } : undefined,
          },
          { signal: controller.signal },
        );
      }

      const botReply = res?.reply ?? res?.message ?? res?.text ?? "No response.";
      setMessages((prev) => [
        ...prev,
        { id: `b_${Date.now()}`, sender: "bot", text: toText(botReply) },
      ]);
      setAttachedFile(null);
    } catch (e) {
      const isCanceled =
        e?.name === "CanceledError" ||
        e?.code === "ERR_CANCELED" ||
        e?.message?.toLowerCase?.().includes("canceled");

      if (isCanceled) {
        setMessages((prev) => [
          ...prev,
          { id: `b_${Date.now()}`, sender: "bot", text: "Request cancelled." },
        ]);
      } else {
        const norm = normalizeApiError(e);
        setMessages((prev) => [
          ...prev,
          {
            id: `b_${Date.now()}`,
            sender: "bot",
            text: norm.text || "I had trouble processing that. Try again.",
            errors: norm.errors,
            raw: norm.raw,
          },
        ]);
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const isStudent = String(user?.role || "").toUpperCase() === "STUDENT";
  const userInitial = (user?.username || user?.name || "U")[0].toUpperCase();

  /* ── Render ─────────────────────────────────────────────── */

  return (
    <div className="ait-page">

      {/* Header */}
      <div className="ait-header">
        <div className="ait-header-info">
          <div className="ait-header-icon">
            <BotIcon />
          </div>
          <div>
            <h2 className="ait-title">AI Tutor</h2>
            <p className="ait-subtitle">
              Ask questions, upload a file, get explanations with math support.
            </p>
          </div>
        </div>

        {sending && (
          <button
            className="ait-btn-cancel"
            onClick={() => abortRef.current?.abort()}
            type="button"
          >
            ✕ Cancel
          </button>
        )}
      </div>

      {/* Student notice */}
      {isStudent && (
        <div className="ait-notice">
          <span className="ait-notice-icon">⚠</span>
          <div>
            <strong>Study help only.</strong> The AI Tutor can explain concepts,
            help you understand material, and answer study questions. It will not
            complete assignments, quizzes, or exams for you.
          </div>
        </div>
      )}

      {/* Settings bar */}
      <div className="ait-settings-bar">
        <div className="ait-setting">
          <label className="ait-setting-label">Subject</label>
          <select
            className="ait-select"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          >
            <option value="mathematics">Mathematics</option>
            <option value="physics">Physics</option>
            <option value="chemistry">Chemistry</option>
            <option value="biology">Biology</option>
            <option value="english">English</option>
            <option value="history">History</option>
            <option value="general">General</option>
          </select>
        </div>

        <div className="ait-setting">
          <label className="ait-setting-label">Curriculum</label>
          <select
            className="ait-select"
            value={curriculum}
            onChange={(e) => setCurriculum(e.target.value)}
          >
            <option value="SAT">SAT</option>
            <option value="IGCSE">IGCSE</option>
            <option value="">General</option>
          </select>
        </div>

        <div className="ait-setting">
          <label className="ait-setting-label">Tone</label>
          <select
            className="ait-select"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
          >
            <option value="supportive">Supportive</option>
            <option value="friendly">Friendly</option>
            <option value="strict">Strict</option>
            <option value="encouraging">Encouraging</option>
          </select>
        </div>

        <div className="ait-setting">
          <label className="ait-setting-label">Language</label>
          <select
            className="ait-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="English">English</option>
            <option value="Arabic">Arabic</option>
          </select>
        </div>

        <div className="ait-setting">
          <label className="ait-setting-label">Session Doc</label>
          <label className="ait-upload-btn" title="Upload PDF/DOCX/TXT for this session">
            {uploading
              ? "Uploading…"
              : uploadedFileName
              ? `✓ ${uploadedFileName}`
              : "📎 Upload doc"}
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept=".pdf,.docx,.txt"
              disabled={!sessionId || uploading || sending}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadMaterial(f);
              }}
            />
          </label>
        </div>

        <label className="ait-debug-check">
          <input
            type="checkbox"
            checked={showDebug}
            onChange={(e) => setShowDebug(e.target.checked)}
          />
          <span>Debug</span>
        </label>
      </div>

      {/* Chat window */}
      <div className="ait-chat-window">

        {/* Messages */}
        <div className="ait-messages" ref={scrollRef}>
          {messages.map((m) => (
            <div
              key={m.id}
              className={`ait-msg ${
                m.sender === "user" ? "ait-msg--user" : "ait-msg--bot"
              }`}
            >
              {m.sender === "bot" && (
                <div className="ait-avatar ait-avatar--bot" aria-hidden="true">
                  <BotIcon />
                </div>
              )}

              <div className="ait-bubble">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                >
                  {toText(m.text)}
                </ReactMarkdown>

                {Array.isArray(m.errors) && m.errors.length > 0 && (
                  <ul className="ait-error-list">
                    {m.errors.map((e, idx) => (
                      <li key={idx}>
                        {e.msg}
                        {Array.isArray(e.loc) ? ` — ${e.loc.join(" > ")}` : ""}
                      </li>
                    ))}
                  </ul>
                )}

                {showDebug && m.raw && (
                  <pre className="ait-debug-pre">
                    {JSON.stringify(m.raw, null, 2)}
                  </pre>
                )}
              </div>

              {m.sender === "user" && (
                <div className="ait-avatar ait-avatar--user" aria-hidden="true">
                  {userInitial}
                </div>
              )}
            </div>
          ))}

          {(sending || uploading) && (
            <div className="ait-msg ait-msg--bot">
              <div className="ait-avatar ait-avatar--bot" aria-hidden="true">
                <BotIcon />
              </div>
              <div className="ait-typing">
                <span /><span /><span />
              </div>
            </div>
          )}
        </div>

        {/* Input footer */}
        <div className="ait-input-footer">
          {attachedFile && (
            <div className="ait-file-chip">
              <span>📎 {attachedFile.name}</span>
              <button
                className="ait-file-remove"
                onClick={() => setAttachedFile(null)}
                disabled={sending}
                type="button"
                aria-label="Remove attached file"
              >
                ✕
              </button>
            </div>
          )}

          <div className="ait-input-row">
            <textarea
              className="ait-textarea"
              rows={2}
              placeholder="Type your question… (Shift+Enter for new line)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={!sessionId || sending || uploading}
            />

            <div className="ait-input-btns">
              <label className="ait-attach" title="Attach file to message">
                <ClipIcon />
                <input
                  type="file"
                  hidden
                  onChange={(e) =>
                    setAttachedFile(e.target.files?.[0] || null)
                  }
                  disabled={!sessionId || sending || uploading}
                />
              </label>

              <button
                className="ait-send"
                onClick={onSend}
                disabled={!sessionId || uploading || !canSend}
                type="button"
              >
                {sending ? <SpinIcon /> : <SendIcon />}
                <span>{sending ? "Sending…" : "Send"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
