import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import "../styles/MessagingInterface.css";

// FIX: single API base — matches Ingestion.js
const API_BASE = "http://127.0.0.1:8000/api/v1";

export default function MessagingInterface() {
  const [sessionId, setSessionId] = useState(
    localStorage.getItem("session_id")
  );

  const [docs, setDocs] = useState([]);
  const [chatSessions, setChatSessions] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // prevents auto-select loop + React warning
  const autoSelectRef = useRef(false);

  useEffect(() => {
    const syncSession = () => {
      const storedSession = localStorage.getItem("session_id");
      setSessionId(storedSession);
    };

    syncSession();

    window.addEventListener("popstate", syncSession);

    const interval = setInterval(syncSession, 500);

    return () => {
      window.removeEventListener("popstate", syncSession);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    if (!textareaRef.current) return;

    textareaRef.current.style.height = "0px";
    textareaRef.current.style.height = `${Math.min(
      textareaRef.current.scrollHeight,
      180
    )}px`;
  }, [input]);

  // FIX: removed currentChatId from deps — it caused re-fetch + auto-select loop
  // on every chat selection. Auto-select only needs to run once on initial load.
  const fetchChatSessions = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE}/sessions/${sessionId}/chatsessions/`
      );

      if (!res.ok) return;

      const data = await res.json();

      setChatSessions(data);

      if (data.length > 0 && !autoSelectRef.current) {
        autoSelectRef.current = true;
        setCurrentChatId(data[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // FIX: track whether we still need to poll for docs.
  // Polling is only needed while waiting for the first doc to appear.
  // Once docs are present, the interval clears itself and we rely solely
  // on the "documentUploaded" custom event fired by Ingestion.js.
  const docsPollingRef = useRef(null);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE}/sessions/${sessionId}/docs/`
      );

      if (!res.ok) return;

      const data = await res.json();

      setDocs(data);

      // Stop polling as soon as we have at least one doc
      if (data.length > 0 && docsPollingRef.current) {
        clearInterval(docsPollingRef.current);
        docsPollingRef.current = null;
      }
    } catch (err) {
      console.error(err);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    const loadInitialData = async () => {
      await fetchChatSessions();
      fetchDocs();
    };

    loadInitialData();

    // Only start polling if no docs yet; interval clears itself once docs arrive
    docsPollingRef.current = setInterval(() => {
      fetchDocs();
    }, 3000);

    return () => {
      if (docsPollingRef.current) {
        clearInterval(docsPollingRef.current);
        docsPollingRef.current = null;
      }
    };
  }, [sessionId, fetchChatSessions, fetchDocs]);

  useEffect(() => {
    const handleDocumentUpload = () => {
      // A new doc was just uploaded — re-fetch once to update the sidebar
      fetchDocs();
    };

    window.addEventListener("documentUploaded", handleDocumentUpload);

    return () => {
      window.removeEventListener("documentUploaded", handleDocumentUpload);
    };
  }, [fetchDocs]);

  const fetchSingleChat = useCallback(async (chatId) => {
    try {
      const res = await fetch(
        `${API_BASE}/sessions/${sessionId}/chatsessions/${chatId}/`
      );

      if (!res.ok) return;

      const data = await res.json();

      setMessages(data.chats || []);
    } catch (err) {
      console.error(err);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!currentChatId) return;

    fetchSingleChat(currentChatId);
  }, [currentChatId, fetchSingleChat]);

  const createNewChat = async () => {
    try {
      const res = await fetch(
        `${API_BASE}/sessions/${sessionId}/chatsessions/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );

      if (!res.ok) return;

      const data = await res.json();

      setChatSessions((prev) => [data, ...prev]);
      setCurrentChatId(data.id);
      setMessages([]);
    } catch (err) {
      console.error(err);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    let activeChatId = currentChatId;

    if (!activeChatId) {
      try {
        const res = await fetch(
          `${API_BASE}/sessions/${sessionId}/chatsessions/`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }
        );

        if (!res.ok) return;

        const newChat = await res.json();

        activeChatId = newChat.id;
        setCurrentChatId(newChat.id);
        setChatSessions((prev) => [newChat, ...prev]);
      } catch (err) {
        console.error(err);
        return;
      }
    }

    const messageText = input;

    setInput("");
    setLoading(true);

    setMessages((prev) => [
      ...prev,
      { role: "user", chat: messageText },
      { role: "assistant", chat: "", streaming: true },
    ]);

    try {
      const saveRes = await fetch(
        `${API_BASE}/sessions/${sessionId}/chatsessions/${activeChatId}/chats/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat: messageText }),
        }
      );

      if (!saveRes.ok) {
        throw new Error("Failed to save message");
      }

      // FIX: replaced EventSource with fetch + ReadableStream.
      // EventSource has two problems here:
      // 1. JSON.parse crashes silently on any token containing special chars,
      //    killing the entire stream with no error surfaced to the user.
      // 2. EventSource cannot send credentials/headers and some browsers
      //    handle its CORS differently from fetch, causing silent drops.
      // fetch() with a streaming reader gives full control over parsing
      // and error handling, and respects the same CORS config as all other calls.

      let streamedText = "";

      const streamUrl = `${API_BASE}/chatsessions/${activeChatId}/stream/?query=${encodeURIComponent(messageText)}`;

      const streamRes = await fetch(streamUrl);

      if (!streamRes.ok || !streamRes.body) {
        throw new Error("Stream failed to open");
      }

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE lines are separated by \n\n; process complete events only
        const parts = buffer.split("\n\n");
        buffer = parts.pop(); // keep incomplete trailing chunk

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;

          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;

          let parsed;
          try {
            parsed = JSON.parse(payload);
          } catch {
            // Malformed SSE line — skip without killing the stream
            continue;
          }

          if (parsed.token) {
            streamedText += parsed.token;

            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                chat: streamedText,
                streaming: true,
              };
              return updated;
            });
          }

          if (parsed.done) {
            setLoading(false);
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                chat: streamedText,
              };
              return updated;
            });
            break;
          }

          if (parsed.error) {
            console.error("Stream error from server:", parsed.error);
            setLoading(false);
            break;
          }
        }
      }

      // Ensure loading is cleared if stream ends without explicit done event
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const handleSelectChat = async (chatSession) => {
    setCurrentChatId(chatSession.id);
    await fetchSingleChat(chatSession.id);
  };

  const deleteSession = async () => {
    if (!sessionId) return;

    try {
      const res = await fetch(
        `${API_BASE}/sessions/${sessionId}/`,
        { method: "DELETE" }
      );

      // 404 means the session already expired on the backend — that's fine,
      // treat it the same as a successful delete and clean up locally.
      if (!res.ok && res.status !== 404) {
        throw new Error("Delete failed");
      }

      localStorage.removeItem("session_id");
      window.location.href = "/";
    } catch (err) {
      console.error(err);
      // Even on unexpected error, clear local state so the user isn't stuck
      localStorage.removeItem("session_id");
      window.location.href = "/";
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // FIX: renders newlines in streamed/stored messages correctly
  const renderMessage = (text) => {
    if (!text) return null;
    return text.split("\n").map((line, i, arr) => (
      <span key={i}>
        {line}
        {i < arr.length - 1 && <br />}
      </span>
    ));
  };

  return (
    <div className="mi-wrapper">
      <aside className={`mi-sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <div className="mi-sidebar-top">
          <div className="mi-logo">
            <div className="mi-logo-icon">✦</div>
            <div>
              <h2>RAG Assistant</h2>
              <p>AI Workspace</p>
            </div>
          </div>

          <button className="mi-newchat-btn" onClick={createNewChat}>
            + New Chat
          </button>
        </div>

        <div className="mi-section">
          <div className="mi-section-title">Conversations</div>

          <div className="mi-chatlist">
            {chatSessions.length === 0 && (
              <div className="mi-empty">No chats yet</div>
            )}

            {chatSessions.map((c) => (
              <div
                key={c.id}
                className={`mi-chatitem ${
                  currentChatId === c.id ? "active" : ""
                }`}
                onClick={() => handleSelectChat(c)}
              >
                <div className="mi-chat-title">
                  {c.title || "Untitled Chat"}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mi-section">
          <div className="mi-section-title">Documents</div>

          <div className="mi-doclist">
            {docs.length === 0 && (
              <div className="mi-empty">No uploaded documents</div>
            )}

            {docs.map((d) => (
              <div key={d.id} className="mi-docitem">
                <span>📄</span>
                <span>{d.title || d.file_name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mi-sidebar-footer">
          <button className="del-btn" onClick={deleteSession}>
            Delete Session
          </button>
        </div>
      </aside>

      <main className="mi-main">
        <div className="mi-topbar">
          <button
            className="mi-mobile-toggle"
            onClick={() => setSidebarOpen((prev) => !prev)}
          >
            ☰
          </button>

          <div>
            <h3>AI Retrieval Workspace</h3>
            <p>Ask questions about your uploaded documents.</p>
          </div>
        </div>

        <div className="mi-messages">
          {messages.length === 0 && (
            <div className="mi-empty-state">
              <div className="mi-empty-icon">✨</div>
              <h2>Start chatting with your AI assistant</h2>
              <p>Upload documents and ask questions naturally.</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={msg.role === "user" ? "mi-user" : "mi-ai"}>
              <div className={`mi-bubble ${msg.role === "user" ? "user" : "ai"}`}>
                {/* FIX: use renderMessage to handle \n line breaks */}
                {renderMessage(msg.chat)}
                {msg.streaming && <span className="cursor">▋</span>}
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        <div className="mi-inputbar">
          <textarea
            ref={textareaRef}
            placeholder="Ask anything about your documents..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />

          <button onClick={sendMessage} disabled={loading}>
            {loading ? "..." : "Send"}
          </button>
        </div>
      </main>
    </div>
  );
}