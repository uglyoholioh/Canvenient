import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, BookOpen, CheckCircle2, Download, File, Loader2, RefreshCw, LayoutGrid, Link as LinkIcon } from "lucide-react";
import { 
  getAcademicModules, 
  getCanvasAnnouncements, 
  getCanvasAssignments, 
  getCanvasCourses, 
  getCanvasFiles, 
  getCanvasGrades, 
  syncCanvasAssignments,
  getCanvasCourseModules,
  getCanvasPages,
  getCanvasSyllabus,
  getCanvasCourseNavigation
} from "../api";
import CanvasDrawer from "./drawers/CanvasDrawer";
import { useWorkspaceToolbar } from "./WorkspaceToolbarContext";

function stripHtml(value = "") {
  const node = document.createElement("div"); node.innerHTML = value; return node.textContent || "";
}

export default function CanvasView({ token }) {
  const [courses, setCourses] = useState([]);
  const [academicModules, setAcademicModules] = useState([]);
  
  // Global data
  const [assignments, setAssignments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [grades, setGrades] = useState([]);
  
  // Specific course data
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [courseModules, setCourseModules] = useState([]);
  const [coursePages, setCoursePages] = useState([]);
  const [courseSyllabus, setCourseSyllabus] = useState(null);

  const [selectedCourseId, setSelectedCourseId] = useState("all");
  const [tab, setTab] = useState("assignments");
  const [navigation, setNavigation] = useState([{id: "assignments", label: "Assignments"}, {id: "announcements", label: "Announcements"}]);
  
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
    load();
  }, [load]);

  // Handle course selection changes
  useEffect(() => {
    setFiles([]);
    setCourseModules([]);
    setCoursePages([]);
    setCourseSyllabus(null);
    setSelectedFile(null);
    
    if (selectedCourseId === "all") {
      setNavigation([
        {id: "assignments", label: "Assignments"}, 
        {id: "announcements", label: "Announcements"},
        {id: "grades", label: "Grades"}
      ]);
      setTab("assignments");
      return;
    }
    
    let canceled = false;
    setTabLoading(true);
    getCanvasCourseNavigation(token, selectedCourseId).then(nav => {
      if (canceled) return;
      if (nav.length === 0) {
        nav.push({id: "assignments", label: "Assignments"});
      }
      setNavigation(nav);
      setTab(nav[0].id);
    }).catch(err => {
      console.error(err);
      if (!canceled) {
        setNavigation([
          {id: "assignments", label: "Assignments"},
          {id: "announcements", label: "Announcements"},
          {id: "grades", label: "Grades"},
          {id: "files", label: "Files"}
        ]);
        setTab("assignments");
      }
    }).finally(() => { 
      if (!canceled) setTabLoading(false); 
    });
    
    return () => { canceled = true; };
  }, [selectedCourseId, token]);

  // Load Grades globally if tab is active
  useEffect(() => {
    if (tab !== "grades" || grades.length) return;
    let canceled = false;
    Promise.resolve().then(() => setTabLoading(true));
    getCanvasGrades(token).then(data => { if (!canceled) setGrades(data); }).catch((err) => { if (!canceled) setError(err.message); }).finally(() => { if (!canceled) setTabLoading(false); });
    return () => { canceled = true; };
  }, [grades.length, tab, token]);

  // Load specific course tabs
  useEffect(() => {
    if (selectedCourseId === "all") return;
    let canceled = false;
    
    if (tab === "files" && files.length === 0) {
      setTabLoading(true);
      getCanvasFiles(token, selectedCourseId)
        .then(data => { if (!canceled) { setFiles(data || []); setSelectedFile(data?.[0] || null); } })
        .catch(err => { if (!canceled) setError(err.message); })
        .finally(() => { if (!canceled) setTabLoading(false); });
    } else if (tab === "modules" && courseModules.length === 0) {
      setTabLoading(true);
      getCanvasCourseModules(token, selectedCourseId)
        .then(data => { if (!canceled) setCourseModules(data || []); })
        .catch(err => { if (!canceled) setError(err.message); })
        .finally(() => { if (!canceled) setTabLoading(false); });
    } else if (tab === "pages" && coursePages.length === 0) {
      setTabLoading(true);
      getCanvasPages(token, selectedCourseId)
        .then(data => { if (!canceled) setCoursePages(data || []); })
        .catch(err => { if (!canceled) setError(err.message); })
        .finally(() => { if (!canceled) setTabLoading(false); });
    } else if (tab === "syllabus" && courseSyllabus === null) {
      setTabLoading(true);
      getCanvasSyllabus(token, selectedCourseId)
        .then(data => { if (!canceled) setCourseSyllabus(data); })
        .catch(err => { if (!canceled) setError(err.message); })
        .finally(() => { if (!canceled) setTabLoading(false); });
    }
    
    return () => { canceled = true; };
  }, [tab, selectedCourseId, token, files.length, courseModules.length, coursePages.length, courseSyllabus]);

  const displayedCourses = useMemo(() => {
    const validModules = academicModules
      .filter(m => m.is_selected && m.module_code && m.module_code.trim() !== "")
      .map(m => m.module_code.trim());
      
    if (validModules.length === 0) return [];
    
    return courses.filter(c => {
       if (!c.course_code) return false;
       return validModules.some(mod => {
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
    try { await syncCanvasAssignments(token); await load(true); setGrades([]); setFiles([]); setCourseModules([]); setCoursePages([]); setCourseSyllabus(null); }
    catch (syncError) { setError(syncError.message || "Canvas sync failed."); }
    finally { setSyncing(false); }
  }, [load, token]);

  const selectedCourse = courses.find((course) => String(course.id) === String(selectedCourseId));
  const toolbarConfig = useMemo(() => ({
    title: "Modules",
    subtitle: selectedCourse ? selectedCourse.course_code : "Overview",
  }), [selectedCourse]);
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
             onClick={() => setSelectedCourseId("all")}
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
                     onClick={() => setSelectedCourseId(String(course.id))}
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
        <div className="canvas-view-header" style={{ maxWidth: '960px', margin: '0 auto', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '48px', marginBottom: '24px', borderBottom: '1px solid var(--border)' }}>
          <div className="canvas-tabs">
            {navigation.map(nav => (
              <button 
                key={nav.id} 
                type="button" 
                className={tab === nav.id ? "is-active" : ""}
                onClick={() => setTab(nav.id)}
              >
                {nav.label}
              </button>
            ))}
          </div>
          <button 
            type="button" 
            className="canvas-sync" 
            onClick={sync} 
            disabled={syncing}
          >
            <RefreshCw size={14} className={syncing ? "retro-icon-spin" : ""} />{syncing ? "Syncing" : "Sync"}
          </button>
        </div>
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
              
            {tab === "modules" && selectedCourseId !== "all" && <section>
              <div className="canvas-content-toolbar" style={{ marginBottom: '20px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-h)' }}>Modules</h2>
              </div>
              {tabLoading ? <div className="module-empty">Loading modules...</div> : courseModules.length === 0 ? <div className="module-empty">No modules found for this course.</div> : 
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {courseModules.map(mod => (
                    <div key={mod.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
                        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: 'var(--text-h)' }}>{mod.name}</h3>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {mod.items.map(item => (
                           <a 
                             key={item.id} 
                             href={item.external_url || item.html_url || "#"} 
                             target="_blank" 
                             rel="noreferrer"
                             style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text)', textDecoration: 'none', borderBottom: '1px solid var(--border)' }}
                           >
                             <span style={{ color: 'var(--text-muted)' }}><LinkIcon size={14} /></span>
                             <span style={{ fontSize: '14px' }}>{item.title}</span>
                           </a>
                        ))}
                        {mod.items.length === 0 && <div style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>Empty module.</div>}
                      </div>
                    </div>
                  ))}
                </div>
              }
            </section>}

            {tab === "pages" && selectedCourseId !== "all" && <section>
              <div className="canvas-content-toolbar" style={{ marginBottom: '20px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-h)' }}>Pages</h2>
              </div>
              {tabLoading ? <div className="module-empty">Loading pages...</div> : coursePages.length === 0 ? <div className="module-empty">No pages found.</div> : 
                <div className="canvas-item-list">
                  {coursePages.map(page => (
                     <a 
                       key={page.url} 
                       href={`https://canvas.nus.edu.sg/courses/${selectedCourseId}/pages/${page.url}`} 
                       target="_blank" 
                       rel="noreferrer"
                       className="canvas-item-row"
                       style={{ textDecoration: 'none', color: 'inherit' }}
                     >
                       <span className="canvas-item-icon"><File size={15} /></span>
                       <span className="canvas-item-copy">
                         <strong>{page.title}</strong>
                         <small>Updated: {new Date(page.updated_at).toLocaleDateString()}</small>
                       </span>
                     </a>
                  ))}
                </div>
              }
            </section>}

            {tab === "syllabus" && selectedCourseId !== "all" && <section>
              <div className="canvas-content-toolbar" style={{ marginBottom: '20px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-h)' }}>Syllabus</h2>
              </div>
              {tabLoading ? <div className="module-empty">Loading syllabus...</div> : !courseSyllabus?.body ? <div className="module-empty">No syllabus content available.</div> : 
                <div className="canvas-syllabus-body" style={{ background: 'var(--surface)', padding: '32px', borderRadius: '6px', border: '1px solid var(--border)' }} dangerouslySetInnerHTML={{ __html: courseSyllabus.body }} />
              }
            </section>}

            {!["assignments", "announcements", "grades", "files", "modules", "pages", "syllabus"].includes(tab) && selectedCourseId !== "all" && <section>
              <div className="canvas-content-toolbar" style={{ marginBottom: '20px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-h)' }}>{navigation.find(n => n.id === tab)?.label || "External Tool"}</h2>
              </div>
              <div className="module-empty" style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
                <p>This content is hosted outside of Canvenient.</p>
                <a 
                  href={navigation.find(n => n.id === tab)?.html_url || `https://canvas.nus.edu.sg/courses/${selectedCourseId}/${tab}`} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="retro-btn" 
                  style={{ padding: '8px 16px', borderRadius: '4px', background: 'var(--accent)', color: '#fff', textDecoration: 'none', fontWeight: 'bold' }}
                >
                  Open in Canvas
                </a>
              </div>
            </section>}
          </>}
        </div>
      </main>
      <CanvasDrawer key={activeItem ? `${activeItem.itemType}-${activeItem.course_id}-${activeItem.id}` : "empty"} item={activeItem} token={token} onClose={() => setActiveItem(null)} />
    </div>
  );
}

