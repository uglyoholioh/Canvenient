import { useState } from "react";
import { FileUp, Link, Send, Type, X } from "lucide-react";

function normalizedTypes(types = []) {
  const values = [];
  if (types.includes("online_text_entry") || types.includes("text_entry")) values.push("text_entry");
  if (types.includes("online_url")) values.push("online_url");
  if (types.includes("online_upload") || types.includes("file_upload")) values.push("file_upload");
  return values;
}

export default function SubmitModal({ assignment, onClose, onSubmit }) {
  const types = normalizedTypes(assignment.submission_types);
  const [type, setType] = useState(types[0] || "text_entry");
  const [content, setContent] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true); setError("");
    try {
      if (type === "file_upload") {
        if (!file) throw new Error("Choose a file first.");
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = () => reject(new Error("Could not read that file."));
          reader.readAsDataURL(file);
        });
        await onSubmit({ type, filename: file.name, content_type: file.type || "application/octet-stream", content: data });
      } else {
        if (!content.trim()) throw new Error(type === "online_url" ? "Enter a URL." : "Enter your submission text.");
        await onSubmit({ type, content: content.trim() });
      }
      onClose();
    } catch (submitError) {
      setError(submitError.message || "Submission failed.");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="modal-backdrop">
      <form className="submit-modal" onSubmit={submit}>
        <header><div><small>Submit assignment</small><h3>{assignment.title}</h3></div><button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button></header>
        {types.length === 0 ? <div className="module-empty">This assignment does not accept an online submission supported by Canvenient.</div> : <>
          <div className="submit-tabs">
            {types.includes("text_entry") && <button type="button" className={type === "text_entry" ? "is-active" : ""} onClick={() => setType("text_entry")}><Type size={13} />Text</button>}
            {types.includes("online_url") && <button type="button" className={type === "online_url" ? "is-active" : ""} onClick={() => setType("online_url")}><Link size={13} />URL</button>}
            {types.includes("file_upload") && <button type="button" className={type === "file_upload" ? "is-active" : ""} onClick={() => setType("file_upload")}><FileUp size={13} />File</button>}
          </div>
          {type === "text_entry" && <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write your submission..." rows="8" />}
          {type === "online_url" && <input type="url" value={content} onChange={(event) => setContent(event.target.value)} placeholder="https://..." />}
          {type === "file_upload" && <label className="file-drop"><FileUp size={22} /><span>{file?.name || "Choose a file"}</span><input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>}
          {error && <div className="module-error">{error}</div>}
          <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={submitting}><Send size={14} />{submitting ? "Submitting..." : "Submit"}</button></footer>
        </>}
      </form>
    </div>
  );
}
