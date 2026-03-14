// StudentDashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  Badge,
  Button,
  Card,
  Col,
  Container,
  Form,
  Row,
  Spinner,
  Table,
} from "react-bootstrap";

/**
 * StudentDashboard.jsx (React JSX)
 * - No api.js, all APIs are inside this file
 * - Backend is on http://localhost:4000 by default
 * - Auth probe:
 *   /api/users/checkAuth -> /api/users/profile -> /api/users/dashboard -> /api/auth/me
 * - Role gate: student only (no redirects to /admin)
 */

// ----------------------------- Base Paths -----------------------------
const ADMIN_BASE = "/api/admin";
const ADMIN_SYSTEM_BASE = "/api/admin/system";

// ----------------------------- Helpers -----------------------------
function cleanParams(params) {
  if (!params || typeof params !== "object") return undefined;

  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;

    if (typeof v === "string") {
      const s = v.trim();
      if (!s) continue;
      out[k] = s;
      continue;
    }

    out[k] = v;
  }

  return Object.keys(out).length ? out : undefined;
}

function fixLegacyPath(path) {
  const p = String(path || "");
  return p.replace(/^\/api\/admin\/super\b/, `${ADMIN_SYSTEM_BASE}/super`);
}

function upper(v) {
  return v === undefined || v === null ? v : String(v).toUpperCase();
}

function toRole(raw) {
  const up = String(raw || "STUDENT")
    .trim()
    .toUpperCase();
  return up === "SUPER_ADMIN" ? "SUPERADMIN" : up;
}

function isHtmlString(s) {
  if (typeof s !== "string") return false;
  const t = s.trim().toLowerCase();
  return (
    t.startsWith("<!doctype") || t.startsWith("<html") || t.includes("<body")
  );
}

function compressHtmlError(s) {
  if (!isHtmlString(s)) return s;
  const m = s.match(/Cannot\s+(GET|POST|PUT|PATCH|DELETE)\s+([^\s<]+)/i);
  if (m) return `Endpoint not found: ${m[2]}`;
  return "Request failed (HTML error page returned)";
}

function normalizeApiErrorPayload(payload) {
  if (!payload) return "Request failed";
  if (typeof payload === "string") return compressHtmlError(payload);

  return (
    payload.error ||
    payload.message ||
    payload.detail ||
    payload.msg ||
    "Request failed"
  );
}

class AuthError extends Error {}
class ForbiddenError extends Error {}

// ----------------------------- Config -----------------------------
const TOKEN_STORAGE_KEY = "auth_token";

// IMPORTANT: default to localhost:4000 so your /api/users/checkAuth works
const API_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_API_BASE_URL) ||
  "http://localhost:4000";

const AI_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_AI_BASE_URL) ||
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_AI_BASE_URL) ||
  API_BASE;

const PDF_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_PDF_BASE_URL) ||
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_PDF_BASE_URL) ||
  API_BASE;

function getToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function buildUrl(base, path, params) {
  const fixed = fixLegacyPath(path);
  const baseNorm = String(base || "").replace(/\/$/, "");
  const url = new URL(`${baseNorm}${fixed}`, window.location.origin);

  const p = cleanParams(params);
  if (p)
    Object.entries(p).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  // Keep absolute URL when base is absolute (http://localhost:4000)
  if (baseNorm.startsWith("http://") || baseNorm.startsWith("https://"))
    return url.toString();

  // Otherwise return relative
  return url.toString().replace(window.location.origin, "");
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function requestRaw(base, method, path, { params, body, headers } = {}) {
  const token = getToken();
  const h = new Headers(headers || {});
  h.set("Accept", "application/json");
  if (token) h.set("Authorization", `Bearer ${token}`);

  let reqBody = body;
  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;

  if (!isFormData && body !== undefined && body !== null) {
    h.set("Content-Type", "application/json");
    reqBody = JSON.stringify(body);
  }

  const res = await fetch(buildUrl(base, path, params), {
    method,
    headers: h,
    body: reqBody,
    credentials: "include",
  });

  const text = await res.text();
  const payload = text ? safeParseJson(text) : null;

  return { ok: res.ok, status: res.status, payload };
}

async function requestJson(base, method, path, { params, body, headers } = {}) {
  const r = await requestRaw(base, method, path, { params, body, headers });

  if (r.status === 401) throw new AuthError("Not authenticated");
  if (r.status === 403) throw new ForbiddenError("Not authorized");

  if (!r.ok)
    throw new Error(normalizeApiErrorPayload(r.payload) || `HTTP ${r.status}`);

  return r.payload ?? {};
}

async function requestBlob(base, method, path, { params, body, headers } = {}) {
  const token = getToken();
  const h = new Headers(headers || {});
  if (token) h.set("Authorization", `Bearer ${token}`);

  const res = await fetch(buildUrl(base, path, params), {
    method,
    headers: h,
    body,
    credentials: "include",
  });

  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 403) throw new ForbiddenError("Not authorized");

  if (!res.ok) {
    let errPayload = null;
    try {
      errPayload = await res.json();
    } catch {}
    throw new Error(
      normalizeApiErrorPayload(errPayload) || `HTTP ${res.status}`,
    );
  }

  return res.blob();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Optional legacy helpers
const apiGet = (path, config = {}) =>
  requestJson(API_BASE, "GET", fixLegacyPath(path), {
    params: config.params,
    headers: config.headers,
  });

const apiPost = (path, body, config = {}) =>
  requestJson(API_BASE, "POST", fixLegacyPath(path), {
    body,
    params: config.params,
    headers: config.headers,
  });

const apiPut = (path, body, config = {}) =>
  requestJson(API_BASE, "PUT", fixLegacyPath(path), {
    body,
    params: config.params,
    headers: config.headers,
  });

const apiPatch = (path, body, config = {}) =>
  requestJson(API_BASE, "PATCH", fixLegacyPath(path), {
    body,
    params: config.params,
    headers: config.headers,
  });

const apiDelete = (path, config = {}) =>
  requestJson(API_BASE, "DELETE", fixLegacyPath(path), {
    params: config.params,
    headers: config.headers,
    body: config.data,
  });

// ----------------------------- API (match your localhost:4000 list) -----------------------------
const api = {
  users: {
    signup: (payload) => apiPost("/api/users/signup", payload),
    login: (payload) => apiPost("/api/users/login", payload),
    logout: () => apiPost("/api/users/logout"),
    checkAuth: () => apiGet("/api/users/checkAuth"),
    getMyProfile: () => apiGet("/api/users/profile"),
    updateProfile: (userId, updates) =>
      requestJson(API_BASE, "PUT", `/api/users/profile/${userId}`, {
        body: updates,
      }),
    dashboardPing: () => apiGet("/api/users/dashboard"),
  },

  courses: {
    getAllCourses: (params) =>
      apiGet("/api/courses", { params: cleanParams(params) }),
    getCourseById: (courseId) => apiGet(`/api/courses/${courseId}`),
    searchCourses: (params) =>
      apiGet("/api/courses/search", { params: cleanParams(params) }),
    getCourseActivity: (courseId) =>
      apiGet(`/api/courses/${courseId}/activity`),
    getCoursesByUser: (userId) => apiGet(`/api/courses/user/${userId}`),
    submitAssignment: (courseId, assignmentId, formData) =>
      requestJson(
        API_BASE,
        "POST",
        `/api/courses/${courseId}/assignments/${assignmentId}/submit`,
        { body: formData },
      ),
  },

  documents: {
    getDocumentsInCourse: (courseId) =>
      apiGet(`/api/documents/course/${courseId}`),
    searchDocuments: (params) =>
      apiGet("/api/documents/search", { params: cleanParams(params) }),
    uploadDocument: (formData) =>
      requestJson(API_BASE, "POST", "/api/documents/upload", {
        body: formData,
      }),
    downloadDocument: (id) =>
      requestBlob(API_BASE, "GET", `/api/documents/download/${id}`),
    previewDocument: (id) => apiGet(`/api/documents/preview/${id}`),
    exportPdf: (payload) =>
      requestBlob(PDF_BASE, "POST", "/api/documents/export-pdf", {
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
          Accept: "application/pdf",
        },
      }),
  },

  collaborators: {
    fetchCollaborators: (workspaceId) =>
      apiGet(`/api/workspaces/${workspaceId}/collaborators`),
    addCollaborator: (workspaceId, userId, role) =>
      apiPost(`/api/workspaces/${workspaceId}/add-collaborator`, {
        userId,
        role,
      }),
    removeCollaborator: (workspaceId, collaboratorId) =>
      apiDelete(
        `/api/workspaces/${workspaceId}/remove-collaborator/${collaboratorId}`,
      ),
    updateCollaboratorRole: (workspaceId, collaboratorId, role) =>
      apiPut(`/api/workspaces/${workspaceId}/change-role/${collaboratorId}`, {
        role,
      }),
  },

  ai: {
    logUsage: (payload) => apiPost("/api/ai-usage", payload),
    listUsage: (params) =>
      apiGet("/api/ai-usage", { params: cleanParams(params) }),
    getUsageSummary: (params) =>
      apiGet("/api/ai-usage/summary", { params: cleanParams(params) }),
    generateQuiz: (payload) =>
      requestJson(AI_BASE, "POST", "/api/quiz/generate", { body: payload }),
  },
};

// ----------------------------- AUTH PROBE -----------------------------
function pickUser(authRes) {
  if (!authRes) return null;
  if (authRes.user) return authRes.user;
  if (authRes.data && authRes.data.user) return authRes.data.user;
  if (authRes.profile) return authRes.profile;
  return authRes;
}

async function getCurrentUserProbe() {
  const candidates = [
    "/api/users/checkAuth",
    "/api/users/profile",
    "/api/users/dashboard",
    "/api/auth/me",
  ];

  let lastErr = null;

  for (const path of candidates) {
    const r = await requestRaw(API_BASE, "GET", path);

    if (r.status === 401) throw new AuthError("Not authenticated");
    if (r.status === 403) throw new ForbiddenError("Not authorized");

    if (r.status === 404) {
      lastErr = new Error(`Endpoint not found: ${path}`);
      continue;
    }

    if (!r.ok) {
      lastErr = new Error(
        normalizeApiErrorPayload(r.payload) || `HTTP ${r.status}`,
      );
      continue;
    }

    const u = pickUser(r.payload);
    if (u) return { user: u, source: path };
    lastErr = new Error(`Auth response had no user: ${path}`);
  }

  throw lastErr || new Error("No auth endpoint matched");
}

// ----------------------------- UI Helpers -----------------------------
function JsonBox({ value }) {
  if (value === undefined || value === null)
    return <div className="text-muted">—</div>;
  return (
    <pre
      style={{
        margin: 0,
        padding: 12,
        background: "#0b1020",
        color: "#d7e1ff",
        borderRadius: 10,
        overflowX: "auto",
        fontSize: 12,
      }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function roleBadge(role) {
  const v = String(role || "").toLowerCase();
  if (v === "student") return <Badge bg="secondary">student</Badge>;
  if (v === "teacher") return <Badge bg="info">teacher</Badge>;
  if (v === "admin") return <Badge bg="primary">admin</Badge>;
  if (v === "superadmin") return <Badge bg="danger">superadmin</Badge>;
  return (
    <Badge bg="light" text="dark">
      {role || "unknown"}
    </Badge>
  );
}

export default function StudentDashboard() {
  const [me, setMe] = useState(null);
  const [authSource, setAuthSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState("");

  const [profile, setProfile] = useState(null);
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [courseActivity, setCourseActivity] = useState(null);

  const [docQuery, setDocQuery] = useState("");
  const [docResults, setDocResults] = useState([]);

  const [assignmentId, setAssignmentId] = useState("");
  const [assignmentFile, setAssignmentFile] = useState(null);
  const [submitResult, setSubmitResult] = useState(null);

  const [quizTopic, setQuizTopic] = useState("");
  const [quizOut, setQuizOut] = useState(null);

  const [workspaceId, setWorkspaceId] = useState("");
  const [collabs, setCollabs] = useState(null);

  const displayName = useMemo(
    () => (me && (me.name || me.email)) || "Student",
    [me],
  );

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setFatal("");

      try {
        const { user: u, source } = await getCurrentUserProbe();
        if (!alive) return;

        setAuthSource(source);

        const role = toRole(u?.role);
        if (!u) throw new AuthError("No user");

        if (role !== "STUDENT") {
          setMe({ ...u, role });
          setFatal(
            "This account does not have access to the Student Dashboard.",
          );
          return;
        }

        setMe({ ...u, role });

        const userId = u.id || u._id;

        const [p, c] = await Promise.all([
          api.users.getMyProfile(),
          api.courses.getCoursesByUser(userId),
        ]);

        if (!alive) return;
        setProfile(p);
        setCourses(Array.isArray(c) ? c : c.courses || []);
      } catch (e) {
        if (!alive) return;

        if (e instanceof AuthError) {
          window.location.href = "/login";
          return;
        }

        if (e instanceof ForbiddenError) {
          setFatal(
            "You are logged in, but you do not have access to the Student Dashboard.",
          );
          return;
        }

        setFatal((e && e.message) || "Failed to load dashboard.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const onLogout = async () => {
    try {
      await api.users.logout();
    } catch {}
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {}
    window.location.href = "/login";
  };

  const loadCourseActivity = async () => {
    if (!selectedCourseId) return;
    setCourseActivity(null);
    const out = await api.courses.getCourseActivity(selectedCourseId);
    setCourseActivity(out);
  };

  const searchDocs = async () => {
    const out = await api.documents.searchDocuments({
      q: docQuery,
      courseId: selectedCourseId || undefined,
    });
    setDocResults(Array.isArray(out) ? out : out.items || []);
  };

  const previewDoc = async (id) => {
    const out = await api.documents.previewDocument(id);
    alert(typeof out === "string" ? out : JSON.stringify(out, null, 2));
  };

  const downloadDoc = async (id) => {
    const blob = await api.documents.downloadDocument(id);
    downloadBlob(blob, `document_${id}`);
  };

  const submitAssignment = async () => {
    if (!selectedCourseId || !assignmentId || !assignmentFile) return;

    const form = new FormData();
    form.append("file", assignmentFile);

    const out = await api.courses.submitAssignment(
      selectedCourseId,
      assignmentId,
      form,
    );
    setSubmitResult(out);

    try {
      await api.ai.logUsage({
        feature: "assignment_submit",
        courseId: selectedCourseId,
        assignmentId,
      });
    } catch {}
  };

  const generateQuiz = async () => {
    if (!quizTopic.trim()) return;
    const out = await api.ai.generateQuiz({
      topic: quizTopic.trim(),
      courseId: selectedCourseId || undefined,
    });
    setQuizOut(out);

    try {
      await api.ai.logUsage({
        feature: "quiz_generate",
        topic: quizTopic.trim(),
        courseId: selectedCourseId || undefined,
      });
    } catch {}
  };

  const loadCollaborators = async () => {
    if (!workspaceId.trim()) return;
    const out = await api.collaborators.fetchCollaborators(workspaceId.trim());
    setCollabs(out);
  };

  if (loading) {
    return (
      <Container className="py-5">
        <div className="d-flex align-items-center gap-3">
          <Spinner animation="border" />
          <div>Loading your dashboard…</div>
        </div>
      </Container>
    );
  }

  if (fatal) {
    return (
      <Container className="py-5">
        <Card>
          <Card.Body>
            <Card.Title>Student Dashboard</Card.Title>
            <Card.Text className="text-danger">{fatal}</Card.Text>
            <div className="d-flex gap-2">
              <Button
                variant="secondary"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
              <Button variant="outline-danger" onClick={onLogout}>
                Logout
              </Button>
            </div>

            {authSource ? (
              <div className="text-muted mt-3" style={{ fontSize: 13 }}>
                Auth source: {authSource}
              </div>
            ) : null}

            <div className="text-muted mt-2" style={{ fontSize: 13 }}>
              API base: {API_BASE}
            </div>
          </Card.Body>
        </Card>
      </Container>
    );
  }

  return (
    <Container className="py-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h2 className="mb-1">Welcome, {displayName}</h2>
          <div className="text-muted d-flex align-items-center gap-2">
            Student Dashboard {roleBadge(me && me.role)}
          </div>
          {authSource ? (
            <div className="text-muted" style={{ fontSize: 12 }}>
              Auth source: {authSource}
            </div>
          ) : null}
        </div>
        <Button variant="outline-danger" onClick={onLogout}>
          Logout
        </Button>
      </div>

      <Row className="g-3">
        <Col md={4}>
          <Card className="h-100">
            <Card.Body>
              <Card.Title>Your profile</Card.Title>
              <JsonBox value={profile} />
            </Card.Body>
          </Card>
        </Col>

        <Col md={8}>
          <Card className="h-100">
            <Card.Body>
              <Card.Title>Courses</Card.Title>

              <div className="d-flex gap-2 align-items-end flex-wrap">
                <Form.Group style={{ minWidth: 260 }}>
                  <Form.Label>Select course</Form.Label>
                  <Form.Select
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                  >
                    <option value="">Choose…</option>
                    {courses.map((c) => (
                      <option key={c._id || c.id} value={c._id || c.id}>
                        {c.title || c.name || c.code || c._id || c.id}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>

                <Button
                  variant="primary"
                  disabled={!selectedCourseId}
                  onClick={loadCourseActivity}
                >
                  Load activity
                </Button>
              </div>

              <div className="mt-3">
                <Card className="p-2">
                  <div className="fw-semibold mb-2">Course activity</div>
                  <JsonBox value={courseActivity} />
                </Card>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col md={12}>
          <Accordion defaultActiveKey="docs">
            <Accordion.Item eventKey="docs">
              <Accordion.Header>Documents</Accordion.Header>
              <Accordion.Body>
                <div className="d-flex gap-2 flex-wrap align-items-end">
                  <Form.Group style={{ minWidth: 320 }}>
                    <Form.Label>Search</Form.Label>
                    <Form.Control
                      value={docQuery}
                      onChange={(e) => setDocQuery(e.target.value)}
                      placeholder="e.g. networking notes, lab 3, pdf"
                    />
                  </Form.Group>
                  <Button variant="secondary" onClick={searchDocs}>
                    Search
                  </Button>
                </div>

                <div className="mt-3">
                  <Table responsive hover>
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Type</th>
                        <th>Course</th>
                        <th style={{ width: 240 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {docResults.map((d) => (
                        <tr key={d._id || d.id}>
                          <td>{d.title || d.name || d._id || d.id}</td>
                          <td>{d.type || d.mime || "—"}</td>
                          <td>{d.courseTitle || d.courseId || "—"}</td>
                          <td className="d-flex gap-2 flex-wrap">
                            <Button
                              size="sm"
                              variant="outline-primary"
                              onClick={() => previewDoc(d._id || d.id)}
                            >
                              Preview
                            </Button>
                            <Button
                              size="sm"
                              variant="outline-success"
                              onClick={() => downloadDoc(d._id || d.id)}
                            >
                              Download
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {docResults.length === 0 && (
                        <tr>
                          <td colSpan={4} className="text-muted">
                            No documents found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </Table>
                </div>
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="submit">
              <Accordion.Header>Submit assignment</Accordion.Header>
              <Accordion.Body>
                <Row className="g-3">
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label>Assignment ID</Form.Label>
                      <Form.Control
                        value={assignmentId}
                        onChange={(e) => setAssignmentId(e.target.value)}
                        placeholder="assignmentId"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={5}>
                    <Form.Group>
                      <Form.Label>File</Form.Label>
                      <Form.Control
                        type="file"
                        onChange={(e) =>
                          setAssignmentFile(e.target.files && e.target.files[0])
                        }
                      />
                    </Form.Group>
                  </Col>
                  <Col md={3} className="d-flex align-items-end">
                    <Button
                      variant="primary"
                      disabled={
                        !selectedCourseId || !assignmentId || !assignmentFile
                      }
                      onClick={submitAssignment}
                    >
                      Submit
                    </Button>
                  </Col>
                </Row>

                <div className="mt-3">
                  <div className="fw-semibold mb-2">Result</div>
                  <JsonBox value={submitResult} />
                </div>
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="quiz">
              <Accordion.Header>AI quiz generator</Accordion.Header>
              <Accordion.Body>
                <Row className="g-3">
                  <Col md={9}>
                    <Form.Group>
                      <Form.Label>Topic</Form.Label>
                      <Form.Control
                        value={quizTopic}
                        onChange={(e) => setQuizTopic(e.target.value)}
                        placeholder="e.g. OS scheduling, TCP vs UDP"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={3} className="d-flex align-items-end">
                    <Button
                      variant="success"
                      onClick={generateQuiz}
                      disabled={!quizTopic.trim()}
                    >
                      Generate
                    </Button>
                  </Col>
                </Row>

                <div className="mt-3">
                  <div className="fw-semibold mb-2">Quiz output</div>
                  <JsonBox value={quizOut} />
                </div>
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="collab">
              <Accordion.Header>Workspace collaborators</Accordion.Header>
              <Accordion.Body>
                <Row className="g-3">
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Workspace ID</Form.Label>
                      <Form.Control
                        value={workspaceId}
                        onChange={(e) => setWorkspaceId(e.target.value)}
                        placeholder="workspaceId"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6} className="d-flex align-items-end">
                    <Button
                      variant="secondary"
                      onClick={loadCollaborators}
                      disabled={!workspaceId.trim()}
                    >
                      Load collaborators
                    </Button>
                  </Col>
                </Row>

                <div className="mt-3">
                  <JsonBox value={collabs} />
                </div>
              </Accordion.Body>
            </Accordion.Item>
          </Accordion>
        </Col>
      </Row>
    </Container>
  );
}
