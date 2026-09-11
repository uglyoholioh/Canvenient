import { useState, useMemo, useCallback } from "react";
import { Search, X, FileText, Image, FileVideo, File, Download, ExternalLink, Loader2 } from "lucide-react";
import { downloadCanvasFile } from "../api";

function getFileType(name = "") {
  const ext = name.split(".").pop().toLowerCase();
  if (["pdf"].includes(ext)) return "pdf";
  if (["png","jpg","jpeg","gif","webp","svg","bmp"].includes(ext)) return "img";
  if (["mp4","mov","avi","webm","mkv"].includes(ext)) return "vid";
  if (["doc","docx","ppt","pptx","xls","xlsx","txt","md"].includes(ext)) return "doc";
  if (["zip","tar","gz","rar","7z"].includes(ext)) return "zip";
  return "other";
}

function FileTypeIcon({ name, size = 13 }) {
  const type = getFileType(name);
  const iconMap = {
    pdf: <FileText size={size} />, img: <Image size={size} />,
    vid: <FileVideo size={size} />, doc: <FileText size={size} />,
    zip: <File size={size} />, other: <File size={size} />,
  };
  return <span className={`cv-file-type-icon type-${type}`}>{iconMap[type]}</span>;
}

function formatSize(b) {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${Math.ceil(b / 1024)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function relDate(str) {
  if (!str) return "";
  const d = new Date(str), now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function CanvasSearchSection({
  token,
  filesByCourse,
  displayedCourses,
  selectedCourseId,
  onSelectCourse,
}) {
  const [query, setQuery] = useState("");
  const [activeType, setActiveType] = useState("all");
  const [downloadingId, setDownloadingId] = useState(null);

  // Mirrored Canvas URLs expire within minutes, so downloads go through the
  // backend content proxy like the Files tab does.
  const handleDownload = useCallback(async (file) => {
    if (!file || downloadingId) return;
    setDownloadingId(file.id);
    try {
      await downloadCanvasFile(token, file.id, file.display_name || file.filename || "canvas-file");
    } catch (error) {
      window.dispatchEvent(new CustomEvent("canvenient-toast", { detail: { message: error.message || "Download failed." } }));
    } finally {
      setDownloadingId(null);
    }
  }, [downloadingId, token]);

  // Flatten all files with course info
  const allIndexedFiles = useMemo(() => {
    const list = [];
    for (const course of displayedCourses) {
      const cId = String(course.id);
      const cFiles = filesByCourse[cId] || [];
      for (const f of cFiles) {
        list.push({
          ...f,
          courseId: cId,
          courseCode: course.course_code,
          courseName: course.name,
          courseColor: course.color,
        });
      }
    }
    return list;
  }, [displayedCourses, filesByCourse]);

  // Context files: if on specific course, default to that course unless query specifies another module
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    // Parse tokens from query, e.g. "st2334 week 5 lecture" -> tokens: ["st2334", "week", "5", "lecture"]
    const rawTokens = q.split(/\s+/).filter(Boolean);

    // Check if any token matches a course code
    const courseCodeTokens = new Set(
      displayedCourses.map(c => (c.course_code || "").toLowerCase())
    );
    const targetCourseToken = rawTokens.find(t => courseCodeTokens.has(t));

    // Handle "week 5" or "w5" patterns
    const normalizedTokens = [];
    for (let i = 0; i < rawTokens.length; i++) {
      const token = rawTokens[i];
      if (token === "week" && i + 1 < rawTokens.length && /^\d+$/.test(rawTokens[i + 1])) {
        normalizedTokens.push(`week ${rawTokens[i + 1]}`);
        normalizedTokens.push(`w${rawTokens[i + 1]}`);
        normalizedTokens.push(`week${rawTokens[i + 1]}`);
        i++; // skip next
      } else if (/^w\d+$/.test(token)) {
        normalizedTokens.push(token);
        normalizedTokens.push(`week ${token.slice(1)}`);
        normalizedTokens.push(`week${token.slice(1)}`);
      } else {
        normalizedTokens.push(token);
      }
    }

    const scored = [];

    for (const file of allIndexedFiles) {
      // Filter by selected course if single course is active AND user didn't explicitly mention another course code
      if (selectedCourseId !== "all" && !targetCourseToken) {
        if (String(file.courseId) !== String(selectedCourseId)) continue;
      }

      // Filter by type if activeType selected
      const fType = getFileType(file.display_name || file.filename || "");
      if (activeType !== "all" && fType !== activeType) continue;

      const filename = (file.display_name || file.filename || "").toLowerCase();
      const courseCode = (file.courseCode || "").toLowerCase();
      const courseName = (file.courseName || "").toLowerCase();
      const folderName = (file.folder_name || "").toLowerCase();
      const searchableText = `${courseCode} ${courseName} ${filename} ${folderName}`;

      let score = 0;
      let matchedTokens = 0;

      for (const token of rawTokens) {
        if (searchableText.includes(token)) {
          matchedTokens++;
          if (filename.includes(token)) score += 10;
          if (courseCode.includes(token)) score += 15;
          if (filename.startsWith(token)) score += 5;
        }
      }

      // Extra boost for week matches
      for (const nToken of normalizedTokens) {
        if (filename.includes(nToken)) {
          score += 15;
          matchedTokens++;
        }
      }

      // Exact phrase match bonus
      if (filename.includes(q)) score += 30;

      // Must match at least one token
      if (matchedTokens > 0 || score > 0) {
        scored.push({ file, score, matchedTokens });
      }
    }

      scored.sort((a, b) => b.score - a.score || new Date(b.file.updated_at || 0) - new Date(a.file.updated_at || 0));
      return scored.slice(0, 60).map(s => s.file);
    }, [query, allIndexedFiles, selectedCourseId, displayedCourses, activeType]);

  const quickPills = useMemo(() => {
    if (selectedCourseId === "all") {
      return displayedCourses.map(c => ({
        label: c.course_code,
        query: `${c.course_code} `,
      }));
    }
    return [
      { label: "Lectures", query: "lecture " },
      { label: "Tutorials", query: "tutorial " },
      { label: "Notes / Slides", query: "slides " },
      { label: "Week 5", query: "week 5 " },
      { label: "Week 6", query: "week 6 " },
    ];
  }, [selectedCourseId, displayedCourses]);

  return (
    <section className="cv-card is-span-2 cv-search-card">
      <header className="cv-card-header">
        <div className="cv-card-title">
          <Search size={13} />
          <span>Quick Resource Search</span>
          <span className="cv-search-scope-badge">
            {selectedCourseId === "all" ? "All Modules" : displayedCourses.find(c => String(c.id) === String(selectedCourseId))?.course_code || "Module"}
          </span>
        </div>
        {query && (
          <span className="cv-search-count-label">
            {searchResults.length} {searchResults.length === 1 ? "match" : "matches"}
          </span>
        )}
      </header>

      <div className="cv-search-body">
        {/* Search input bar */}
        <div className="cv-search-input-wrapper">
          <Search size={14} className="cv-search-icon" />
          <input
            type="text"
            className="cv-search-input"
            placeholder={
              selectedCourseId === "all"
                ? "Search files & materials across all modules (e.g. 'ST2334 week 5 lecture', 'tutorial 2', 'exam formula')..."
                : "Search files in this module (e.g. 'week 5 lecture', 'tutorial slides', 'assignment specs')..."
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus={false}
          />
          {query && (
            <button
              type="button"
              className="cv-btn-icon"
              onClick={() => setQuery("")}
              title="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Quick query suggestion chips & type filters */}
        <div className="cv-search-toolbar">
          <div className="cv-search-chips">
            <span className="cv-search-chip-label">Suggestions:</span>
            {quickPills.map(p => (
              <button
                key={p.label}
                type="button"
                className="cv-search-chip"
                onClick={() => setQuery(prev => (prev.includes(p.query.trim()) ? prev : `${prev} ${p.query}`.trim()))}
              >
                + {p.label}
              </button>
            ))}
          </div>

          <div className="cv-search-type-filters">
            {["all", "pdf", "doc", "img", "zip"].map(t => (
              <button
                key={t}
                type="button"
                className={`cv-search-type-btn ${activeType === t ? "is-active" : ""}`}
                onClick={() => setActiveType(t)}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Search Results Display */}
        {query.trim() && (
          <div className="cv-search-results-pane">
            {searchResults.length === 0 ? (
              <div className="cv-search-empty">
                No files found matching "<strong>{query}</strong>". Try searching by module code (e.g. {displayedCourses[0]?.course_code || 'CS2040'}), week number, or file keywords.
              </div>
            ) : (
              <div className="cv-search-results-list">
                {searchResults.map(file => {
                  const name = file.display_name || file.filename || "Untitled";
                  return (
                    <div
                      key={`${file.courseId}-${file.id}`}
                      className="cv-search-result-row"
                      onClick={() => {
                        if (selectedCourseId === "all" && onSelectCourse) {
                          onSelectCourse(file.courseId);
                        }
                      }}
                    >
                      <FileTypeIcon name={name} size={14} />
                      <div className="cv-search-result-info">
                        <div className="cv-search-result-name" title={name}>
                          {name}
                        </div>
                        <div className="cv-search-result-meta">
                          {file.courseCode && (
                            <span
                              className="cv-search-module-tag"
                              style={{ "--module-color": file.courseColor }}
                            >
                              {file.courseCode}
                            </span>
                          )}
                          {!file.courseCode && file.courseName && (
                            <span className="cv-search-module-tag">{file.courseName}</span>
                          )}
                          <span>{formatSize(file.size)}</span>
                          {file.updated_at && <span>{relDate(file.updated_at)}</span>}
                        </div>
                      </div>
                      <div className="cv-search-result-actions" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          className="cv-btn-icon"
                          title="Download"
                          onClick={() => handleDownload(file)}
                        >
                          {downloadingId === file.id ? <Loader2 size={13} className="retro-icon-spin" /> : <Download size={13} />}
                        </button>
                        <a
                          href={file.external_url || file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="cv-btn-icon"
                          title="Open on Canvas"
                        >
                          <ExternalLink size={13} />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
