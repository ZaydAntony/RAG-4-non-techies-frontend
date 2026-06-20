import { useEffect, useRef, useState } from "react";

import approved from "../Raggit-mp4-files/approved.mp4";
import uploadbot from "../Raggit-mp4-files/file-upload-bot.mp4";
import filemp4 from "../Raggit-mp4-files/fileupload.mp4";
import processingVid from "../Raggit-mp4-files/process-gears.mp4";

import aibot from "../Raggit-static-assets/ai-bot.png";
import processingImg from "../Raggit-static-assets/progress-gears.png";

import "../styles/Ingestion.css";

import MessagingInterface from "./MessagingInterface";
import Nav from "./Navbar";

// FIX: single source of truth for the API base — no more localhost vs 127.0.0.1 mismatch
const API_BASE = import.meta.env.VITE_API_URL;

const STATUS_LABELS = {
  idle: "Upload Knowledge Files",
  uploading: "Uploading Files",
  processing: "Processing Knowledge",
  ready: "Knowledge Ready",
  error: "Upload Failed",
};

const H_FILL = {
  idle: "0%",
  uploading: "52%",
  processing: "88%",
  ready: "100%",
  error: "0%",
};

const V_FILL = {
  idle: "0%",
  uploading: "0%",
  processing: "80%",
  ready: "100%",
  error: "0%",
};

function Ingestion() {
  const [status, setStatus] = useState("idle");
  const [ready, setReady] = useState(false);
  const prevStatusRef = useRef(null);

  const [labelVisible, setLabelVisible] = useState(true);
  const [pipelineKey, setPipelineKey] = useState(0);
  const [verticalKey, setVerticalKey] = useState(0);
  const [uploadError, setUploadError] = useState(null);
  const labelTimeoutRef = useRef(null);
  
  useEffect(() => {
    if (prevStatusRef.current === null) {
      prevStatusRef.current = status;
      return;
    }

    if (prevStatusRef.current !== status) {
      setLabelVisible(false);

      labelTimeoutRef.current = setTimeout(() => {
        setLabelVisible(true);
        prevStatusRef.current = status;
      }, 200);
    }

    return () => clearTimeout(labelTimeoutRef.current);
  }, [status]);

  useEffect(() => {
    if (status === "uploading") {
      setTimeout(() => setPipelineKey((k) => k + 1), 0);
    }

    if (status === "processing") {
      setTimeout(() => setVerticalKey((k) => k + 1), 0);
    }
  }, [status]);

  const pollStatus = (docId, sessionId) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/sessions/${sessionId}/docs/${docId}/`
        );

        const data = await res.json();
        setStatus(data.status);

        if (data.status === "ready") {
          setReady(true);
          window.dispatchEvent(new CustomEvent("documentUploaded"));
          clearInterval(interval);
        }

        if (data.status === "error") {
          setReady(false);
          clearInterval(interval);
        }
      } catch (err) {
        console.error(err);
        setStatus("error");
        clearInterval(interval);
      }
    }, 1500);
  };

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    setUploadError(null);

    const sessionId =
      window.location.pathname.split("/session/")[1] ||
      localStorage.getItem("session_id");

    if (!sessionId) return alert("No active session found");
    if (!files.length) return;

    const file = files[0];

    if (file.type !== "application/pdf") {
      setUploadError("Only PDF files are accepted.");
      e.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadError("File must be under 5 MB.");
      e.target.value = "";
      return;
    }

    try {
      setStatus("uploading");
      setReady(false);

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `${API_BASE}/sessions/${sessionId}/docs/`,
        { method: "POST", body: formData }
      );

      if (!response.ok) throw new Error("Upload failed");

      const data = await response.json();
      pollStatus(data.id, sessionId);
    } catch (error) {
      console.error(error);
      setStatus("error");
      setReady(false);
    }
  };

  const isIdle = status === "idle";
  const isUploading = status === "uploading";
  const isProcessing = status === "processing";
  const isReady = status === "ready";
  const isError = status === "error";
  const isPipelineActive = isUploading || isProcessing;

  const showGearsPng = isIdle || isReady || isError;
  const showGearsVid = isUploading || isProcessing;

  return (
    <>
      <Nav />
      <div className="container">
        <div className="file-upload">
          <label htmlFor="fileInput" className="uploadbot-wrapper">
            <div
              className={`uploadbot-text ${
                labelVisible ? "label-visible" : "label-hidden"
              } status-${status}`}
            >
              {STATUS_LABELS[status]}
            </div>

            <video className="uploadbot" autoPlay loop muted playsInline width="120" height="120">
              <source src={uploadbot} type="video/mp4"/>
            </video>
          </label>

          {uploadError && (
            <div className="upload-error-pill">{uploadError}</div>
          )}

          <input
            type="file"
            id="fileInput"
            className="upload-input"
            accept="application/pdf"
            onChange={handleFileUpload}
          />
        </div>

        <div className={`loading ${isPipelineActive ? "pipeline-active" : ""}`}>
          <div
            className={`loading-fill status-${status}`}
            style={{ width: H_FILL[status] || "0%" }}
          />

          {isUploading && (
            <video
              key={pipelineKey}
              className="pipeline-bot"
              autoPlay
              loop
              muted
              playsInline
              width="48"
              height="48"
            >
              <source src={filemp4} type="video/mp4" />
            </video>
          )}
        </div>

        <div className="gears">
          <img
            src={processingImg}
            alt="Idle gears"
            className={`processingImg ${
              showGearsPng ? "gears-visible" : "gears-hidden"
            }`}
            width="96"
            height="96"
          />

          <video
            autoPlay
            loop
            muted
            playsInline
            className={
              showGearsVid ? "gears-vid-visible" : "gears-vid-hidden"
            }
            width="96"
            height="96"
          >
            <source src={processingVid} type="video/mp4" />
          </video>
        </div>
      </div>

      <div className="container2">
        <div className="Messaging">
          <MessagingInterface />
        </div>

        <div className="Ingest-pipeline-extension">
          <div
            className={`loading2 ${isPipelineActive ? "pipeline-active" : ""}`}
          >
            <div
              className={`loading2-fill status-${status}`}
              style={{ height: V_FILL[status] || "0%" }}
            />

            {isProcessing && (
              <video
                key={verticalKey}
                className="vertical-bot"
                autoPlay
                loop
                muted
                playsInline
                width="48"
                height="48"
              >
                <source src={filemp4} type="video/mp4" />
              </video>
            )}
          </div>

          <div className="ai-bot-wrapper">
            <img
              src={aibot}
              className={`uploadcompletebot ${ready ? "ai-ready" : ""}`}
              alt="AI Bot"
              width="96"
              height="96"
            />

            {isReady && (
              <video className="success-popout" autoPlay loop muted playsInline width="48" height="48">
                <source src={approved} type="video/mp4" />
              </video>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default Ingestion;