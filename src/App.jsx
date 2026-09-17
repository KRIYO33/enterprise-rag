import { useState, useEffect } from "react";
import "./theme.css";

const API_BASE = "http://localhost:8000";

const DEPARTMENTS = ["HR", "Engineering", "Finance", "IT", "Training"];
const deptVar = (dept) => `var(--dept-${(dept || "training").toLowerCase()})`;
const deptSoftVar = (dept) => `var(--dept-${(dept || "training").toLowerCase()}-soft)`;

export default function App() {
  const [token, setToken] = useState(null);
  const [role, setRole] = useState(null);
  const [view, setView] = useState("chat");

  if (!token) {
    return <Login onLogin={(t, r) => { setToken(t); setRole(r); }} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          Enterprise Knowledge Assistant
          <span className="role-badge">{role}</span>
        </div>
        <nav className="topnav">
          <button className={`nav-btn ${view === "chat" ? "active" : ""}`} onClick={() => setView("chat")}>Chat</button>
          <button className={`nav-btn ${view === "docs" ? "active" : ""}`} onClick={() => setView("docs")}>Manage Documents</button>
          {role === "Admin" && (
            <>
              <button className={`nav-btn ${view === "users" ? "active" : ""}`} onClick={() => setView("users")}>Manage Users</button>
              <button className={`nav-btn ${view === "admin" ? "active" : ""}`} onClick={() => setView("admin")}>Stats</button>
            </>
          )}
          <button className="nav-btn" onClick={() => { setToken(null); setRole(null); }}>Logout</button>
        </nav>
      </header>

      {view === "chat" && <Chat token={token} />}
      {view === "admin" && <AdminStats token={token} />}
      {view === "docs" && <DocumentManager token={token} role={role} />}
      {view === "users" && <UserManager token={token} />}
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
      const base64Url = data.access_token.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(base64));
      onLogin(data.access_token, payload.role);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-visual">
        <div className="dot-grid" />
        <div className="login-visual-content fade-in">
          <span className="brand-mark" style={{ marginBottom: 18, display: "inline-block" }} />
          <h1 className="login-visual-title">Ask anything.<br />See only what you're cleared for.</h1>
          <p className="login-visual-sub">
            Hybrid search across your company's documents, with every answer
            traced back to a source — and access enforced by role, not by trust.
          </p>
          <div className="dept-legend">
            {DEPARTMENTS.map((d) => (
              <span key={d} className="dept-chip" style={{ background: deptSoftVar(d), color: deptVar(d) }}>
                <span className="dept-dot" style={{ background: deptVar(d) }} />
                {d}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="login-form-side">
        <form onSubmit={handleSubmit} className="login-card fade-in">
          <h2>Sign in</h2>
          <p style={{ color: "var(--text-on-paper-muted)", fontSize: 13, marginBottom: 20 }}>
            Use your company credentials
          </p>
          <div className="login-hint">
            hr_user / hr123 &nbsp;·&nbsp; eng_user / eng123 &nbsp;·&nbsp; finance_user / finance123<br />
            it_user / it123 &nbsp;·&nbsp; admin / admin123
          </div>
          <label className="field-label">Username</label>
          <input className="text-input" value={username} onChange={(e) => setUsername(e.target.value)} />
          <label className="field-label">Password</label>
          <input className="text-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="error-text">{error}</div>}
          <button className="primary-btn" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
    <div className="chat-shell">
      <div className="messages">
        {messages.length === 0 && (
          <div className="chat-empty fade-in">
            <span className="chat-empty-eyebrow">Ready</span>
            Ask something like "How many sick leave days do I get?"
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg-row ${m.role}`}>
            <div className={`bubble ${m.role} fade-in`}>
              <div>{m.text}</div>
              {m.sources && m.sources.length > 0 && <Sources sources={m.sources} />}
            </div>
          </div>
        ))}
        {loading && (
          <div className="msg-row assistant">
            <div className="bubble thinking fade-in">retrieving · reranking · generating…</div>
          </div>
        )}
      </div>
      <form onSubmit={handleAsk} className="input-row">
        <input
          className="text-input"
          style={{ flex: 1 }}
          placeholder="Ask a question…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="primary-btn" style={{ width: "auto", padding: "0 22px" }} disabled={loading}>Send</button>
      </form>
    </div>
  );
}

function Sources({ sources }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button className="sources-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? "hide" : "show"} sources ({sources.length})
      </button>
      {open && (
        <div className="source-chips">
          {sources.map((s, i) => (
            <span key={i} className="source-chip" style={{ background: deptSoftVar(s.department), color: deptVar(s.department) }}>
              {s.document} · p{s.page}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminStats({ token }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/admin/stats`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => { if (!r.ok) throw new Error("Failed to load stats"); return r.json(); })
      .then(setStats)
      .catch((e) => setError(e.message));
  }, [token]);

  if (error) return <div className="admin-shell error-text">{error}</div>;
  if (!stats) return <div className="admin-shell empty-note">Loading…</div>;

  const deptCounts = stats.chunks_per_department || {};
  const maxCount = Math.max(1, ...Object.values(deptCounts));

  return (
    <div className="admin-shell fade-in">
      <h2 className="admin-title">Admin Dashboard</h2>
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-num">{stats.total_documents}</div>
          <div className="stat-label">Documents indexed</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{stats.total_chunks}</div>
          <div className="stat-label">Chunks in vector store</div>
        </div>
      </div>

      <div className="section-label">Chunks per department</div>
      {Object.entries(deptCounts).map(([dept, count]) => (
        <div className="dept-bar-row" key={dept}>
          <span className="dept-bar-label" style={{ color: deptVar(dept) }}>{dept}</span>
          <div className="dept-bar-track">
            <div className="dept-bar-fill" style={{ width: `${(count / maxCount) * 100}%`, background: deptVar(dept) }} />
          </div>
          <span className="dept-bar-count">{count}</span>
        </div>
      ))}

      <div className="section-label">Recent questions</div>
      {stats.recent_questions.length === 0 && <div className="empty-note">No questions asked yet.</div>}
      {stats.recent_questions.map((q, i) => (
        <div className="question-row" key={i}>
          <span className="source-chip" style={{ background: deptSoftVar(q.role), color: deptVar(q.role) }}>{q.role}</span>
          <span>{q.query}</span>
          {!q.had_answer && <span style={{ color: "var(--danger)", fontSize: 11, fontFamily: "var(--font-mono)" }}>no access</span>}
        </div>
      ))}
    </div>
  );
}

function DocumentManager({ token, role }) {
  const [docs, setDocs] = useState(null);
  const [departmentsList, setDepartmentsList] = useState(DEPARTMENTS);
  const [department, setDepartment] = useState(DEPARTMENTS.includes(role) ? role : "HR");
  const [file, setFile] = useState(null);

  // New Department Form State
  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptFile, setNewDeptFile] = useState(null);

  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  function loadDocs() {
    fetch(`${API_BASE}/admin/documents`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        setDocs(d.documents || []);
        if (d.departments && d.departments.length > 0) {
          setDepartmentsList(d.departments);
        }
      })
      .catch(() => setError("Failed to load documents"));
  }

  useEffect(() => { loadDocs(); }, [token]);

  async function handleCreateDepartment(e) {
    e.preventDefault();
    if (!newDeptName || !newDeptFile) return;
    setStatus(`Creating department '${newDeptName}' & indexing initial PDF…`);
    setError("");
    const formData = new FormData();
    formData.append("department", newDeptName);
    formData.append("file", newDeptFile);
    try {
      const res = await fetch(`${API_BASE}/admin/departments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to create department");
      }
      setStatus(`Department '${newDeptName}' created successfully with initial PDF.`);
      setNewDeptName("");
      setNewDeptFile(null);
      loadDocs();
    } catch (err) {
      setError(err.message);
      setStatus("");
    }
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) return;
    setStatus("Uploading and re-indexing…");
    setError("");
    const formData = new FormData();
    formData.append("department", department);
    formData.append("file", file);
    try {
      const res = await fetch(`${API_BASE}/admin/documents/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Upload failed");
      }
      setStatus("Uploaded and indexed.");
      setFile(null);
      loadDocs();
    } catch (err) {
      setError(err.message);
      setStatus("");
    }
  }

  async function handleDelete(dept, filename) {
    setStatus(`Removing ${filename}…`);
    try {
      const res = await fetch(`${API_BASE}/admin/documents/${dept}/${filename}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Delete failed");
      setStatus("Removed and re-indexed.");
      loadDocs();
    } catch {
      setError("Failed to delete document");
      setStatus("");
    }
  }

  const availableDepts = role === "Admin" ? departmentsList : departmentsList.filter((d) => d === role);

  return (
    <div className="admin-shell fade-in">
      <h2 className="admin-title">Manage Documents & Departments</h2>

      {role === "Admin" && (
        <>
          <div className="section-label">Create New Department (Requires Initial PDF)</div>
          <form className="upload-panel" onSubmit={handleCreateDepartment} style={{ marginBottom: 24 }}>
            <div>
              <label className="field-label">Department Name</label>
              <input
                className="text-input"
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                placeholder="e.g. Legal, Marketing, Operations"
              />
            </div>
            <div>
              <label className="field-label">Initial PDF Document (Required)</label>
              <input type="file" accept=".pdf" onChange={(e) => setNewDeptFile(e.target.files[0])} />
            </div>
            <button className="primary-btn" style={{ width: "auto", padding: "11px 20px" }} disabled={!newDeptName || !newDeptFile}>
              Create Department
            </button>
          </form>
        </>
      )}

      <div className="section-label">Upload Document to Existing Department</div>
      <form className="upload-panel" onSubmit={handleUpload}>
        <div>
          <label className="field-label">Department</label>
          <select className="select-input" value={department} onChange={(e) => setDepartment(e.target.value)} disabled={role !== "Admin"}>
            {availableDepts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">PDF file</label>
          <input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files[0])} />
        </div>
        <button className="primary-btn" style={{ width: "auto", padding: "11px 20px" }} disabled={!file}>
          Upload
        </button>
      </form>
      {status && <div className="empty-note" style={{ marginBottom: 14 }}>{status}</div>}
      {error && <div className="error-text">{error}</div>}

      <div className="section-label">Indexed documents</div>
      {!docs && <div className="empty-note">Loading…</div>}
      {docs && docs.length === 0 && <div className="empty-note">No documents yet.</div>}
      {docs && docs.length > 0 && (
        <table className="doc-table">
          <thead>
            <tr><th>Document</th><th>Department</th><th></th></tr>
          </thead>
          <tbody>
            {docs.map((d, i) => (
              <tr key={i}>
                <td>{d.filename}</td>
                <td>
                  <span className="source-chip" style={{ background: deptSoftVar(d.department), color: deptVar(d.department) }}>
                    {d.department}
                  </span>
                </td>
                <td style={{ textAlign: "right" }}>
                  {role === "Admin" && (
                    <button className="delete-btn" onClick={() => handleDelete(d.department, d.filename)}>Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function UserManager({ token }) {
  const [users, setUsers] = useState(null);
  const [rolesList, setRolesList] = useState(["Admin", "HR", "Engineering", "Finance", "IT", "Training"]);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("HR");
  const [selectedUser, setSelectedUser] = useState("");
  const [changePasswordVal, setChangePasswordVal] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/admin/documents`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.departments && d.departments.length > 0) {
          setRolesList(Array.from(new Set(["Admin", ...d.departments])));
        }
      })
      .catch(() => {});
  }, [token]);

  function loadUsers() {
    fetch(`${API_BASE}/admin/users`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .catch(() => setError("Failed to load users"));
  }

  useEffect(() => { loadUsers(); }, [token]);

  async function handleAddUser(e) {
    e.preventDefault();
    if (!newUsername || !newPassword) return;
    setStatus("Adding user…");
    setError("");
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to add user");
      }
      setStatus(`User '${newUsername}' added successfully.`);
      setNewUsername("");
      setNewPassword("");
      loadUsers();
    } catch (err) {
      setError(err.message);
      setStatus("");
    }
  }

  async function handleDeleteUser(username) {
    setStatus(`Deleting ${username}…`);
    try {
      const res = await fetch(`${API_BASE}/admin/users/${username}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Delete failed");
      }
      setStatus(`User '${username}' deleted.`);
      loadUsers();
    } catch (err) {
      setError(err.message);
      setStatus("");
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    if (!selectedUser || !changePasswordVal) return;
    setStatus(`Updating password for ${selectedUser}…`);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/admin/users/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username: selectedUser, new_password: changePasswordVal }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to change password");
      }
      setStatus(`Password for '${selectedUser}' updated successfully.`);
      setSelectedUser("");
      setChangePasswordVal("");
    } catch (err) {
      setError(err.message);
      setStatus("");
    }
  }

  return (
    <div className="admin-shell fade-in">
      <h2 className="admin-title">Manage System Users</h2>

      <div className="section-label">Add New User</div>
      <form className="upload-panel" onSubmit={handleAddUser} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
        <div>
          <label className="field-label">Username</label>
          <input className="text-input" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="e.g. john_hr" />
        </div>
        <div>
          <label className="field-label">Initial Password</label>
          <input className="text-input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Password" />
        </div>
        <div>
          <label className="field-label">Role / Access Level</label>
          <select className="select-input" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            {rolesList.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <button className="primary-btn" style={{ width: "auto", padding: "11px 20px" }} disabled={!newUsername || !newPassword}>
          Add User
        </button>
      </form>

      <div className="section-label" style={{ marginTop: 24 }}>Change User Password</div>
      <form className="upload-panel" onSubmit={handleChangePassword} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end" }}>
        <div>
          <label className="field-label">Select User</label>
          <select className="select-input" value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}>
            <option value="">-- Choose User --</option>
            {users && users.map((u) => <option key={u.username} value={u.username}>{u.username} ({u.role})</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">New Password</label>
          <input className="text-input" type="password" value={changePasswordVal} onChange={(e) => setChangePasswordVal(e.target.value)} placeholder="New Password" />
        </div>
        <button className="primary-btn" style={{ width: "auto", padding: "11px 20px" }} disabled={!selectedUser || !changePasswordVal}>
          Update Password
        </button>
      </form>

      {status && <div className="empty-note" style={{ marginBottom: 14 }}>{status}</div>}
      {error && <div className="error-text" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="section-label" style={{ marginTop: 24 }}>Existing System Users</div>
      {!users && <div className="empty-note">Loading users…</div>}
      {users && (
        <table className="doc-table">
          <thead>
            <tr><th>Username</th><th>Role / Access Level</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.username}>
                <td><strong>{u.username}</strong></td>
                <td>
                  <span className="source-chip" style={{ background: deptSoftVar(u.role), color: deptVar(u.role) }}>
                    {u.role}
                  </span>
                </td>
                <td style={{ textAlign: "right" }}>
                  {u.username !== "admin" && (
                    <button className="delete-btn" onClick={() => handleDeleteUser(u.username)}>Delete User</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
