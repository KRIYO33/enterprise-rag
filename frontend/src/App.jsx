import { useState } from "react";

const API_BASE = "http://localhost:8000";

export default function App() {
  const [token, setToken] = useState(null);
  const [role, setRole] = useState(null);
  const [view, setView] = useState("chat"); // "chat" | "admin"

  if (!token) {
    return <Login onLogin={(t, r) => { setToken(t); setRole(r); }} />;
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <strong>Enterprise Knowledge Assistant</strong>
          <span style={styles.roleTag}>{role}</span>
        </div>
        <nav>
          <button style={styles.navBtn} onClick={() => setView("chat")}>Chat</button>
          {role === "Admin" && (
            <>
              <button style={styles.navBtn} onClick={() => setView("admin")}>Admin Stats</button>
              <button style={styles.navBtn} onClick={() => setView("documents")}>Manage Documents</button>
            </>
          )}
          <button style={styles.navBtn} onClick={() => { setToken(null); setRole(null); }}>Logout</button>
        </nav>
      </header>

      {view === "chat" && <Chat token={token} />}
      {view === "admin" && <AdminStats token={token} />}
      {view === "documents" && <DocumentManager token={token} />}
    </div>
  );
}

function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Login failed");
      }
      const data = await res.json();
      // decode role out of the JWT payload (2nd segment, base64)
      const payload = JSON.parse(atob(data.access_token.split(".")[1]));
      onLogin(data.access_token, payload.role);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.loginPage}>
      <form onSubmit={handleSubmit} style={styles.loginCard}>
        <h2 style={{ marginTop: 0 }}>Enterprise Knowledge Assistant</h2>
        <p style={{ color: "#666", fontSize: 14 }}>
          Try: hr_user/hr123, eng_user/eng123, finance_user/finance123, it_user/it123, admin/admin123
        </p>
        <input
          style={styles.input}
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          style={styles.input}
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div style={styles.error}>{error}</div>}
        <button style={styles.primaryBtn} disabled={loading}>
          {loading ? "Logging in..." : "Log in"}
        </button>
      </form>
    </div>
  );
}

function Chat({ token }) {
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const sessionId = useState(() => Math.random().toString(36).slice(2))[0];

  async function handleAsk(e) {
    e.preventDefault();
    if (!query.trim()) return;
    const userMsg = { role: "user", text: query };
    setMessages((m) => [...m, userMsg]);
    setQuery("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query: userMsg.text, session_id: sessionId }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", text: data.answer, sources: data.sources }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Something went wrong. Is the backend running?" }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.chatContainer}>
      <div style={styles.messages}>
        {messages.length === 0 && (
          <div style={{ color: "#888", textAlign: "center", marginTop: 40 }}>
            Ask something like "How many sick leave days do I get?"
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={m.role === "user" ? styles.userBubble : styles.assistantBubble}>
            <div>{m.text}</div>
            {m.sources && m.sources.length > 0 && <Sources sources={m.sources} />}
          </div>
        ))}
        {loading && <div style={styles.assistantBubble}>Thinking...</div>}
      </div>
      <form onSubmit={handleAsk} style={styles.inputRow}>
        <input
          style={{ ...styles.input, flex: 1, marginBottom: 0 }}
          placeholder="Ask a question..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button style={styles.primaryBtn} disabled={loading}>Send</button>
      </form>
    </div>
  );
}

function Sources({ sources }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 8 }}>
      <button style={styles.sourceToggle} onClick={() => setOpen((o) => !o)}>
        {open ? "Hide" : "Show"} sources ({sources.length})
      </button>
      {open && (
        <ul style={styles.sourceList}>
          {sources.map((s, i) => (
            <li key={i}>{s.document} — page {s.page}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AdminStats({ token }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useState(() => {
    fetch(`${API_BASE}/admin/stats`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load stats");
        return r.json();
      })
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div style={{ padding: 20, color: "crimson" }}>{error}</div>;
  if (!stats) return <div style={{ padding: 20 }}>Loading...</div>;

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: "0 auto" }}>
      <h2>Admin Dashboard</h2>
      <div style={styles.statRow}>
        <StatCard label="Total Documents" value={stats.total_documents} />
        <StatCard label="Total Chunks" value={stats.total_chunks} />
      </div>
      <h3>Chunks per Department</h3>
      <ul>
        {Object.entries(stats.chunks_per_department || {}).map(([dept, count]) => (
          <li key={dept}>{dept}: {count}</li>
        ))}
      </ul>
      <h3>Recent Questions</h3>
      <ul>
        {stats.recent_questions.length === 0 && <li style={{ color: "#888" }}>No questions asked yet.</li>}
        {stats.recent_questions.map((q, i) => (
          <li key={i}>
            <strong>[{q.role}]</strong> {q.query} {q.had_answer ? "" : "(no access)"}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={styles.statCard}>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
      <div style={{ color: "#666", fontSize: 13 }}>{label}</div>
    </div>
  );
}

function DocumentManager({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [department, setDepartment] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function load() {
    fetch(`${API_BASE}/admin/documents`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load documents");
        return r.json();
      })
      .then((d) => {
        setData(d);
        if (!department && d.departments.length) setDepartment(d.departments[0]);
      })
      .catch((e) => setError(e.message));
  }

  useState(() => { load(); }, []);

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const formData = new FormData();
      formData.append("department", department);
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/admin/documents/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Upload failed");
      }
      setMessage(`Uploaded and re-indexed: ${file.name}`);
      setFile(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(dept, filename) {
    if (!confirm(`Delete ${filename} from ${dept}? This re-indexes all documents.`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/admin/documents/${dept}/${filename}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Delete failed");
      }
      setMessage(`Deleted and re-indexed: ${filename}`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <div style={{ padding: 20, color: "crimson" }}>{error}</div>;
  if (!data) return <div style={{ padding: 20 }}>Loading...</div>;

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: "0 auto" }}>
      <h2>Manage Documents</h2>

      <form onSubmit={handleUpload} style={{ background: "#fff", padding: 16, borderRadius: 10, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Upload a new PDF</h3>
        <select style={styles.input} value={department} onChange={(e) => setDepartment(e.target.value)}>
          {data.departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <input
          style={styles.input}
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files[0])}
        />
        <button style={styles.primaryBtn} disabled={busy || !file}>
          {busy ? "Uploading + re-indexing..." : "Upload"}
        </button>
      </form>

      {message && <div style={{ color: "green", marginBottom: 12 }}>{message}</div>}
      {error && <div style={styles.error}>{error}</div>}

      <h3>Existing Documents ({data.documents.length})</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {data.documents.map((doc) => (
          <li key={`${doc.department}/${doc.filename}`} style={styles.docRow}>
            <span><strong>{doc.department}</strong> / {doc.filename} <span style={{ color: "#888" }}>({doc.size_kb} KB)</span></span>
            <button
              style={styles.deleteBtn}
              disabled={busy}
              onClick={() => handleDelete(doc.department, doc.filename)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const styles = {
  page: { fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "#f5f6f8" },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 20px", background: "#1a1a2e", color: "#fff",
  },
  roleTag: { marginLeft: 10, fontSize: 12, background: "#4a4a6a", padding: "2px 8px", borderRadius: 10 },
  navBtn: { marginLeft: 8, background: "transparent", color: "#fff", border: "1px solid #555", padding: "6px 12px", borderRadius: 6, cursor: "pointer" },
  loginPage: { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#1a1a2e" },
  loginCard: { background: "#fff", padding: 32, borderRadius: 12, width: 320, boxShadow: "0 10px 30px rgba(0,0,0,0.3)" },
  input: { width: "100%", padding: 10, marginBottom: 10, borderRadius: 6, border: "1px solid #ccc", boxSizing: "border-box" },
  primaryBtn: { background: "#4a4ae6", color: "#fff", border: "none", padding: "10px 18px", borderRadius: 6, cursor: "pointer" },
  error: { color: "crimson", fontSize: 13, marginBottom: 10 },
  chatContainer: { maxWidth: 700, margin: "0 auto", padding: 20, display: "flex", flexDirection: "column", height: "calc(100vh - 60px)" },
  messages: { flex: 1, overflowY: "auto", marginBottom: 12 },
  userBubble: { background: "#4a4ae6", color: "#fff", padding: "10px 14px", borderRadius: 12, marginBottom: 10, maxWidth: "75%", marginLeft: "auto" },
  assistantBubble: { background: "#fff", padding: "10px 14px", borderRadius: 12, marginBottom: 10, maxWidth: "80%", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" },
  sourceToggle: { background: "none", border: "none", color: "#4a4ae6", cursor: "pointer", fontSize: 12, padding: 0 },
  sourceList: { fontSize: 12, color: "#555", marginTop: 6 },
  inputRow: { display: "flex", gap: 8 },
  statRow: { display: "flex", gap: 16, marginBottom: 20 },
  statCard: { background: "#fff", padding: 16, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.1)", flex: 1 },
  docRow: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", padding: "10px 14px", borderRadius: 8, marginBottom: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.1)" },
  deleteBtn: { background: "#e64a4a", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12 },
};
