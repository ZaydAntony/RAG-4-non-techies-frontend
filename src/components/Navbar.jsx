import "../styles/Nav.css";
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL;

function Nav() {
  const [loading, setLoading] = useState(false);
  const [sessionExists, setSessionExists] = useState(false);
  const [alert, setAlert] = useState({
    show: false,
    message: "",
    type: "",
  });

  useEffect(() => {
    const sessionId = localStorage.getItem("session_id");
    if (!sessionId) return;

    // FIX: don't trust localStorage blindly — sessions expire after 2hrs on
    // the backend. Verify the stored ID is still valid before marking it active.
    const verifySession = async () => {
      try {
        const res = await fetch(`${API_BASE}/sessions/${sessionId}/`);

        if (res.ok) {
          setSessionExists(true);
        } else {
          // 404 or any error → session is gone, clear stale local state
          localStorage.removeItem("session_id");
          setSessionExists(false);
        }
      } catch {
        // Network error — don't clear, assume temporarily unreachable
        setSessionExists(true);
      }
    };

    verifySession();
  }, []);

  const handleStartSession = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/sessions/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        throw new Error("Failed to start session");
      }

      const data = await res.json();
      const sessionId = data.id || data.session_id;

      if (!sessionId) {
        throw new Error("No session UUID returned");
      }

      localStorage.setItem("session_id", sessionId);
      setSessionExists(true);

      setAlert({
        show: true,
        type: "success",
        message: "Session started successfully 😉✅",
      });

      setTimeout(() => {
        setAlert((prev) => ({ ...prev, show: false }));
      }, 4000);

      window.location.href = `/session/${sessionId}`;
    } catch (err) {
      console.error(err);
      setAlert({
        show: true,
        type: "danger",
        message: "Failed to start session. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="nav-container">
      <nav className="navbar ai-navbar">
        <div className="container-fluid ai-navbar-inner">
          <a className="navbar-brand ai-brand" href="#">
            Raggit
          </a>

          <div className="nav-actions">
            <button
              className="btn ai-btn"
              type="button"
              onClick={handleStartSession}
              disabled={loading || sessionExists}
            >
              {loading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" />
                  Starting...
                </>
              ) : sessionExists ? (
                "Session Active"
              ) : (
                "Start Session"
              )}
            </button>
          </div>
        </div>
      </nav>

      {alert.show && (
        <div
          className={`alert alert-${alert.type} m-0`}
          role="alert"
          style={{ borderRadius: 0 }}
        >
          {alert.message}
        </div>
      )}

      <div className="alert ai-alert" role="alert">
        ⚠️ Notice: All uploaded documents will be automatically deleted after 2 hours.
        <p>To delete everything immediately press the delete button.</p>
      </div>
    </div>
  );
}

export default Nav;