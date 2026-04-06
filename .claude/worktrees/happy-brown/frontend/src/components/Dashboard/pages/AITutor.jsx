import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

import "../../styles/AITutor.css";
import "../../styles/dashboard.css";
import { useAuthContext } from "../../../context/AuthContext"; // enable when ready

const API_BASE_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:8000"
    : "https://pregen.onrender.com";

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

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

export default function AITutor() {
  // const { user } = useAuthContext();
  const user = null; // replace with auth user when ready

  const [messages, setMessages] = useState([
    {
      id: "m0",
      sender: "bot",
      text: "Hello. Upload a file or ask a question.",
    },
  ]);

  // input + sending states
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  // session
  const [sessionId, setSessionId] = useState(null);

  // preferences (from version 1)
  const [subject, setSubject] = useState("mathematics");
  const [tone, setTone] = useState("supportive");
  const [language, setLanguage] = useState("English");
  const [curriculum, setCurriculum] = useState("SAT");

  // debugging toggle
  const [showDebug, setShowDebug] = useState(false);

  // file attach (version 2 quick attach) + material upload input (version 1)
  const [attachedFile, setAttachedFile] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const fileInputRef = useRef(null);

  // UI helpers
  const scrollRef = useRef(null);
  const abortRef = useRef(null);

  const canSend = useMemo(() => {
    return !sending && (input.trim().length > 0 || !!attachedFile);
  }, [sending, input, attachedFile]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // Start session on mount (version 1 behavior)
  useEffect(() => {
    const startSession = async () => {
      try {
        const newSessionId = `session_${Date.now()}`;
        setSessionId(newSessionId);

        await api.post(`/api/tutor/session/${newSessionId}`, {
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

  // Material upload to session (version 1)
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
        text: "Processing the file and extracting key points...",
      },
    ]);

    try {
      const form = new FormData();
      form.append("file", file);

      await api.post(`/api/tutor/material/${sessionId}`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `b_${Date.now() + 2}`,
          sender: "bot",
          text: "File stored for this session. Ask questions based on it.",
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

  // Send chat message:
  // - If attachedFile exists => send multipart (keeps version 2 feature)
  // - Else send JSON with prefs + session_id (version 1)
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

        // pass prefs too (best effort)
        form.append("subject", subject);
        form.append("tone", tone);
        form.append("language", language);
        form.append("curriculum", curriculum);

        if (user?._id) form.append("user_id", user._id);

        form.append("file", attachedFile);

        res = await api.post("/api/tutor/chat", form, {
          headers: { "Content-Type": "multipart/form-data" },
          signal: controller.signal,
        });
      } else {
        res = await api.post(
          "/api/tutor/chat",
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

      const botReply =
        res?.data?.reply ??
        res?.data?.message ??
        res?.data?.text ??
        "No response.";

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
    // Enter sends, Shift+Enter new line
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="ai-tutor-page">
      {/* Header with title, subtitle and actions */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h2>AI Tutor</h2>
          <p className="text-muted">
            Ask questions, upload a file, get explanations with math support.
          </p>
        </div>
        {sending && (
          <button
            className="btn btn-outline-light"
            onClick={() => abortRef.current?.abort()}
            type="button"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Toolbar (version 1) */}
      <div className="tutor-toolbar">
        <select value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option value="mathematics">Mathematics</option>
          <option value="physics">Physics</option>
          <option value="chemistry">Chemistry</option>
          <option value="biology">Biology</option>
          <option value="english">English</option>
          <option value="history">History</option>
          <option value="general">General</option>
        </select>

        <select
          value={curriculum}
          onChange={(e) => setCurriculum(e.target.value)}
        >
          <option value="SAT">SAT</option>
          <option value="IGCSE">IGCSE</option>
          <option value="">Unknown</option>
        </select>

        <select value={tone} onChange={(e) => setTone(e.target.value)}>
          <option value="supportive">Supportive</option>
          <option value="friendly">Friendly</option>
          <option value="strict">Strict</option>
          <option value="encouraging">Encouraging</option>
        </select>

        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="English">English</option>
          <option value="Arabic">Arabic</option>
        </select>

        {/* Material upload (stored for session) */}
        <div className="tutor-upload">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt"
            disabled={!sessionId || uploading || sending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadMaterial(f);
            }}
          />
          <small>
            {uploadedFileName
              ? `Last: ${uploadedFileName}`
              : "Upload PDF/DOCX/TXT (optional)"}
          </small>
        </div>

        {/* Debug toggle */}
        <label className="tutor-debug-toggle">
          <input
            type="checkbox"
            checked={showDebug}
            onChange={(e) => setShowDebug(e.target.checked)}
          />
          <small>Debug</small>
        </label>
      </div>

      {/* Chat shell (dashboard-style) */}
      <div className="chat-shell">
        <div className="chat-messages" ref={scrollRef}>
          {messages.map((m) => (
            <div
              key={m.id}
              className={`chat-bubble ${m.sender === "user" ? "user" : ""}`}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {toText(m.text)}
              </ReactMarkdown>

              {/* structured errors */}
              {Array.isArray(m.errors) && m.errors.length > 0 && (
                <ul className="ai-error-list">
                  {m.errors.map((e, idx) => (
                    <li key={idx}>
                      {e.msg}
                      {Array.isArray(e.loc) ? ` — ${e.loc.join(" > ")}` : ""}
                    </li>
                  ))}
                </ul>
              )}

              {/* raw debug */}
              {showDebug && m.raw && (
                <pre className="ai-debug-pre">
                  {JSON.stringify(m.raw, null, 2)}
                </pre>
              )}
            </div>
          ))}

          {(sending || uploading) && <p className="typing">Thinking...</p>}
        </div>

        {/* Inputbar (textarea + attach + send) */}
        <div className="chat-inputbar">
          {attachedFile ? (
            <div className="dash-card mb-2" style={{ padding: 10 }}>
              <div className="d-flex align-items-center justify-content-between gap-2">
                <div className="dash-card-muted" style={{ margin: 0 }}>
                  Attached: <strong>{attachedFile.name}</strong>
                </div>
                <button
                  className="btn btn-sm btn-outline-light"
                  onClick={() => setAttachedFile(null)}
                  type="button"
                  disabled={sending}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : null}

          <div className="chat-row">
            <textarea
              className="chat-textarea"
              rows={2}
              placeholder="Type your question… (Shift+Enter for new line)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={!sessionId || sending || uploading}
            />

            <label className="btn btn-outline-light chat-btn mb-0">
              File
              <input
                type="file"
                hidden
                onChange={(e) => setAttachedFile(e.target.files?.[0] || null)}
                disabled={!sessionId || sending || uploading}
              />
            </label>

            <button
              className="btn btn-primary chat-btn"
              onClick={onSend}
              disabled={!sessionId || uploading || !canSend}
              type="button"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
