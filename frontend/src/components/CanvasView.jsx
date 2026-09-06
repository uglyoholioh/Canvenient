import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, BookOpen, CheckCircle2, Download, File, Loader2, RefreshCw, LayoutGrid } from "lucide-react";
import { getAcademicModules, getCanvasAnnouncements, getCanvasAssignments, getCanvasCourses, getCanvasFiles, getCanvasGrades, syncCanvasAssignments } from "../api";
import CanvasDrawer from "./drawers/CanvasDrawer";
import { useWorkspaceToolbar } from "./WorkspaceToolbarContext";

function stripHtml(value = "") {
  const node = document.createElement("div"); node.innerHTML = value; return node.textContent || "";
}

export default function CanvasView({ token }) {
  const [courses, setCourses] = useState([]);
  const [academicModules, setAcademicModules] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [grades, setGrades] = useState([]);
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedCourseId, setSelectedCourseId] = useState("all");
  const [tab, setTab] = useState("assignments");
  const [assignmentFilter, setAssignmentFilter] = useState("upcoming");
  const [activeItem, setActiveItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (force = false) => {
    setLoading(true); setError("");
    try {
      const [courseData, assignmentData, announcementData, modulesData] = await Promise.all([
        getCanvasCourses(token, force), getCanvasAssignments(token, force), getCanvasAnnouncements(token, force), getAcademicModules(token)
      ]);
      setCourses(courseData || []); setAssignments(assignmentData || []); setAnnouncements(announcementData || []); setAcademicModules(modulesData || []);
    } catch (loadError) { setError(loadError.message || "Could not load Canvas."); }
    finally { setLoading(false); }
  }, [token]);
  
  useEffect(() => {
    Promise.all([getCanvasCourses(token), getCanvasAssignments(token), getCanvasAnnouncements(token), getAcademicModules(token)])
      .then(([courseData, assignmentData, announcementData, modulesData]) => {
        setCourses(courseData || []); setAssignments(assignmentData || []); setAnnouncements(announcementData || []); setAcademicModules(modulesData || []);
      })
      .catch((loadError) => setError(loadError.message || "Could not load Canvas."))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (tab !== "grades" || grades.length) return;
    Promise.resolve().then(() => setTabLoading(true));
    getCanvasGrades(token).then(setGrades).catch((loadError) => setError(loadError.message)).finally(() => setTabLoading(false));
  }, [grades.length, tab, token]);

  useEffect(() => {
    if (tab !== "files") return;
    if (selectedCourseId === "all") return;
    Promise.resolve().then(() => setTabLoading(true));
    getCanvasFiles(token, selectedCourseId).then((data) => { setFiles(data || []); setSelectedFile(data?.[0] || null); }).catch((loadError) => setError(loadError.message)).finally(() => setTabLoading(false));
  }, [selectedCourseId, tab, token]);

  const displayedCourses = useMemo(() => {
    const validModules = academicModules
      .filter(m => m.is_selected && m.module_code && m.module_code.trim() !== "")
      .map(m => m.module_code.trim());
      
    if (validModules.length === 0) return [];
    
    return courses.filter(c => {
       if (!c.course_code) return false;
       return validModules.some(mod => {
         // Match the module code with word boundaries to avoid substring matching (e.g., CS101 in CS1010)
         // We use [^A-Z0-9] as a generic boundary since course codes are alphanumeric
         const regex = new RegExp(`(?:^|[^a-zA-Z0-9])${mod}(?![a-zA-Z0-9])`, 'i');
         return regex.test(c.course_code);
       });
    });
  }, [courses, academicModules]);

  const validCourseIds = useMemo(() => new Set(displayedCourses.map(c => String(c.id))), [displayedCourses]);

  const filteredAssignments = useMemo(() => {
    const list = assignments.filter((item) => {
      if (!validCourseIds.has(String(item.course_id))) return false;
      if (selectedCourseId !== "all" && String(item.course_id) !== String(selectedCourseId)) return false;
      if (assignmentFilter === "all") return true;
      const due = item.due_at ? new Date(item.due_at) : null;
      return assignmentFilter === "upcoming" ? (!due || due >= new Date()) : Boolean(due && due < new Date());
    });
    list.sort((a, b) => {
      if (!a.due_at) return 1;
      if (!b.due_at) return -1;
      const da = new Date(a.due_at).getTime();
      const db = new Date(b.due_at).getTime();
      return assignmentFilter === "past" ? db - da : da - db;
    });
    return list;
  }, [assignmentFilter, assignments, selectedCourseId, validCourseIds]);

  const filteredAnnouncements = useMemo(() => {
    const list = announcements.filter((item) => {
      if (!validCourseIds.has(String(item.course_id))) return false;
      return selectedCourseId === "all" || String(item.course_id) === String(selectedCourseId);
    });
    list.sort((a, b) => {
      const da = a.posted_at ? new Date(a.posted_at).getTime() : 0;
      const db = b.posted_at ? new Date(b.posted_at).getTime() : 0;
      return db - da;
    });
    return list;
  }, [announcements, selectedCourseId, validCourseIds]);

  const filteredGrades = useMemo(() => grades.filter((item) => {
    if (!validCourseIds.has(String(item.course_id))) return false;
    return selectedCourseId === "all" || String(item.course_id) === String(selectedCourseId);
  }), [grades, selectedCourseId, validCourseIds]);
  
  const courseColors = useMemo(() => new Map(courses.map((course) => [course.course_code, course.color])), [courses]);

  const sync = useCallback(async () => {
    setSyncing(true); setError("");
    try { await syncCanvasAssignments(token); await load(true); setGrades([]); setFiles([]); }
    catch (syncError) { setError(syncError.message || "Canvas sync failed."); }
    finally { setSyncing(false); }
  }, [load, token]);

  const selectedCourse = courses.find((course) => String(course.id) === String(selectedCourseId));
  const toolbarConfig = useMemo(() => ({
    title: "Modules",
    subtitle: selectedCourse ? selectedCourse.course_code : "Overview",
    actions: (
      <>
        <div className="canvas-tabs">
          <button type="button" className={tab === "assignments" ? "is-active" : ""} onClick={() => setTab("assignments")}>Assignments</button>
          <button type="button" className={tab === "announcements" ? "is-active" : ""} onClick={() => setTab("announcements")}>Announcements</button>
          <button type="button" className={tab === "grades" ? "is-active" : ""} onClick={() => setTab("grades")}>Grades</button>
          {selectedCourseId !== "all" && (
            <button type="button" className={tab === "files" ? "is-active" : ""} onClick={() => setTab("files")}>Files</button>
          )}
        </div>
        <button type="button" className="canvas-sync" onClick={sync} disabled={syncing}><RefreshCw size={14} className={syncing ? "retro-icon-spin" : ""} />{syncing ? "Syncing" : "Sync"}</button>
      </>
    ),
  }), [selectedCourse, syncing, sync, tab, selectedCourseId]);
  useWorkspaceToolbar(toolbarConfig);

  return (
    <div className="canvas-page" style={{ flexDirection: 'row' }}>
      <aside className="canvas-sidebar" style={{ width: '280px', flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
           <strong style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>Select Module</strong>
        </div>
        <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
           <button 
             type="button" 
             className="canvas-item-row"
             style={{ 
               border: selectedCourseId === "all" ? '1px solid var(--border-focus)' : '1px solid var(--border)',
               background: selectedCourseId === "all" ? 'var(--surface-muted)' : 'var(--surface)',
               boxShadow: selectedCourseId === "all" ? 'var(--shadow-soft)' : 'none'
             }}
             onClick={() => { setSelectedCourseId("all"); if (tab === "files") setTab("assignments"); }}
           >
             <span className="canvas-item-icon" style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)' }}><LayoutGrid size={15} /></span>
             <span className="canvas-item-copy">
               <strong>All Modules</strong>
               <small>Overview</small>
             </span>
           </button>

           <div style={{ margin: '8px 0', borderBottom: '1px solid var(--border)' }} />

           {loading ? <div className="module-empty" style={{ fontSize: '12px', padding: '10px' }}><Loader2 className="retro-icon-spin" size={14} /> Loading...</div> : 
             displayedCourses.length === 0 ? (
               <div className="module-empty" style={{ fontSize: '12px', padding: '10px' }}>No modules match your settings. Configure them in Settings.</div>
             ) : (
               displayedCourses.map(course => {
                 const upcomingCount = assignments.filter(a => String(a.course_id) === String(course.id) && a.due_at && new Date(a.due_at) >= new Date() && !a.has_submitted).length;
                 return (
                   <button
                     type="button"
                     key={course.id}
                     className="canvas-item-row"
                     style={{ 
                       "--module-color": course.color,
                       border: selectedCourseId === String(course.id) ? '1px solid var(--module-color, var(--accent))' : '1px solid var(--border)',
                       background: selectedCourseId === String(course.id) ? 'var(--surface-muted)' : 'var(--surface)',
                       boxShadow: selectedCourseId === String(course.id) ? 'var(--shadow-soft)' : 'none'
                     }}
                     onClick={() => { setSelectedCourseId(String(course.id)); setSelectedFile(null); }}
                   >
                     <span className="canvas-item-icon"><BookOpen size={15} /></span>
                     <span className="canvas-item-copy">
                       <strong>{course.course_code}</strong>
                       <small>{course.name}</small>
                     </span>
                     {upcomingCount > 0 && (
                       <span style={{ fontSize: '10px', background: 'var(--error-bg)', color: 'var(--error)', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold' }}>
                         {upcomingCount}
                       </span>
                     )}
                   </button>
                 );
               })
             )
           }
        </div>
      </aside>

      <main className="canvas-main" style={{ flex: 1, minWidth: 0, padding: '24px 40px', overflowY: 'auto' }}>
        <div className="canvas-content" style={{ maxWidth: '960px', margin: '0 auto', width: '100%' }}>
          {error && <div className="module-error">{error}</div>}

          {loading ? <div className="canvas-loading"><Loader2 className="retro-icon-spin" />Loading Content...</div> : <>
            {tab === "assignments" && <section>
              <div className="canvas-content-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-h)' }}>Assignments</h2>
                <div className="module-filter-tabs" style={{ display: 'flex', gap: '4px', background: 'var(--surface)', padding: '4px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  {["upcoming", "past", "all"].map((value) => (
                    <button 
                      type="button" 
                      key={value} 
                      style={{ 
                        padding: '4px 12px', 
                        borderRadius: '4px', 
                        background: assignmentFilter === value ? 'var(--surface-hover)' : 'transparent', 
                        color: assignmentFilter === value ? 'var(--text-h)' : 'var(--text-muted)', 
                        fontSize: '12px', 
                        border: 'none',
                        cursor: 'pointer', 
                        textTransform: 'capitalize' 
                      }} 
                      onClick={() => setAssignmentFilter(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
              {filteredAssignments.length === 0 ? <div className="module-empty">No assignments in this view.</div> : <div className="canvas-item-list">{filteredAssignments.map((item) => <button type="button" key={`${item.course_id}-${item.id}`} style={{ "--module-color": courseColors.get(item.course_code) }} className="canvas-item-row" onClick={() => setActiveItem({ ...item, itemType: "assignment" })}>
                <span className="canvas-item-icon"><BookOpen size={15} /></span><span className="canvas-item-copy"><strong>{item.title}</strong><small>{item.course_code} · {item.due_at ? new Date(item.due_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "No due date"}</small></span><span className={`canvas-status ${item.has_submitted ? "is-done" : ""}`}>{item.has_submitted && <CheckCircle2 size={12} />}{item.has_submitted ? "Submitted" : "Not submitted"}</span>
              </button>)}</div>}
            </section>}
            
            {tab === "announcements" && <section>
              <div className="canvas-content-toolbar" style={{ marginBottom: '20px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-h)' }}>Announcements</h2>
              </div>
              {filteredAnnouncements.length === 0 ? <div className="module-empty">No recent announcements.</div> : <div className="canvas-item-list">{filteredAnnouncements.map((item) => <button type="button" key={item.id} style={{ "--module-color": courseColors.get(item.course_code) }} className="canvas-item-row" onClick={() => setActiveItem({ ...item, itemType: "announcement" })}><span className="canvas-item-icon"><Bell size={15} /></span><span className="canvas-item-copy"><strong>{item.title}</strong><small>{item.course_code} · {item.posted_at ? new Date(item.posted_at).toLocaleDateString() : item.author}</small><p>{stripHtml(item.body).slice(0, 150)}</p></span></button>)}</div>}</section>}
            
            {tab === "grades" && <section>
              <div className="canvas-content-toolbar" style={{ marginBottom: '20px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-h)' }}>Grades</h2>
              </div>
              {tabLoading ? <div className="module-empty">Loading grades...</div> : filteredGrades.length === 0 ? <div className="module-empty">No grades available.</div> : <div className="grade-course-grid">{filteredGrades.map((course) => <article className="grade-course-card" key={course.course_id}><header><div><small>{course.course_code}</small><strong>{course.course_name}</strong></div><div className="grade-total"><strong>{course.current_score != null ? `${course.current_score}%` : "—"}</strong><span>{course.current_grade || "No grade"}</span></div></header><div className="grade-assignment-list">{course.assignments.filter((item) => item.score != null || item.grade).slice(0, 12).map((item) => <div key={item.id}><span>{item.title}</span><strong>{item.grade ?? `${item.score}/${item.points_possible ?? "?"}`}</strong></div>)}</div></article>)}</div>}</section>}
            
            {tab === "files" && selectedCourseId !== "all" && <section>
              <div className="canvas-content-toolbar" style={{ marginBottom: '20px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-h)' }}>Files</h2>
              </div>
              {tabLoading ? <div className="module-empty">Loading files...</div> : files.length === 0 ? <div className="module-empty">No files found for this course.</div> : <div className="canvas-file-layout"><div className="canvas-item-list">{files.map((item) => <div className={`canvas-item-row ${selectedFile?.id === item.id ? "is-selected" : ""}`} key={item.id}><button type="button" className="canvas-file-select" onClick={() => setSelectedFile(item)}><span className="canvas-item-icon"><File size={15} /></span><span className="canvas-item-copy"><strong>{item.display_name || item.filename}</strong><small>{item.size ? `${Math.ceil(item.size / 1024)} KB` : "Canvas file"}</small></span></button><a href={item.url || item.external_url} target="_blank" rel="noreferrer" title="Download"><Download size={15} /></a></div>)}</div>{selectedFile && <aside className="canvas-file-preview"><header><strong>{selectedFile.display_name || selectedFile.filename}</strong><a href={selectedFile.url || selectedFile.external_url} target="_blank" rel="noreferrer">Open</a></header>{/\.(png|jpe?g|gif|webp|svg)$/i.test(selectedFile.filename || selectedFile.display_name || "") ? <img src={selectedFile.url} alt={selectedFile.display_name || selectedFile.filename} /> : /\.pdf$/i.test(selectedFile.filename || selectedFile.display_name || "") ? <iframe src={selectedFile.url} title={selectedFile.display_name || selectedFile.filename} /> : <div className="module-empty">Preview is available for PDF and image files.</div>}</aside>}</div>}</section>}
          </>}
        </div>
      </main>
      <CanvasDrawer key={activeItem ? `${activeItem.itemType}-${activeItem.course_id}-${activeItem.id}` : "empty"} item={activeItem} token={token} onClose={() => setActiveItem(null)} />
    </div>
  );
}


