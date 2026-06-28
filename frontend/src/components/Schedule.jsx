import { useCallback, useEffect, useState } from "react"
import { getSchedule, importIcs, createEvent, updateEvent, deleteEvent, updateEventAttendance } from "../api"
import { Upload, RefreshCw, Calendar as CalendarIcon, Grid, List, X, Edit, Trash2, Clock, MapPin } from "lucide-react"
import { ThemeProvider, createTheme } from "@mui/material/styles"

import {
  EventCalendarProvider,
  EventDialogProvider,
  useEventDialogContext
} from "@mui/x-scheduler/internals"
import { MonthView } from "@mui/x-scheduler/month-view"
import { WeekView } from "@mui/x-scheduler/week-view"
import { AgendaView } from "@mui/x-scheduler/agenda-view"

const scheduleTheme = createTheme({
  components: {
    MuiEventDialog: {
      defaultProps: {
        disableScrollLock: true,
        disableEnforceFocus: true,
        disablePortal: true,
        hideBackdrop: true,
      },
      styleOverrides: {
        root: {
          display: "none !important",
        },
      },
    },
  },
})

function EventClickWatcher({ onEventClick }) {
  const { isOpen, data: occurrence, onClose } = useEventDialogContext()

  useEffect(() => {
    if (isOpen && occurrence) {
      const timer = setTimeout(() => {
        onClose()
        onEventClick(occurrence)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [isOpen, occurrence, onClose, onEventClick])

  return null
}

function Schedule({ token }) {
  const [schedule, setSchedule] = useState({ classes: [], exams: [], events: [] })
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [uploadingSchedule, setUploadingSchedule] = useState(false)
  const [error, setError] = useState("")
  const [viewMode, setViewMode] = useState("month")

  const [activeModal, setActiveModal] = useState(null)

  const loadSchedule = useCallback(async () => {
    if (!token) return
    setLoadingSchedule(true)
    setError("")
    try {
      const data = await getSchedule(token)
      setSchedule(data || { classes: [], exams: [], events: [] })
    } catch (err) {
      setError(err.message || "Could not load schedule.")
    } finally {
      setLoadingSchedule(false)
    }
  }, [token])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadSchedule()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadSchedule])

  const handleIcsUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadingSchedule(true)
    try {
      await importIcs(token, file)
      await loadSchedule()
    } catch (err) {
      setError(err.message || "Failed to import calendar.")
    } finally {
      setUploadingSchedule(false)
    }
  }

  const getMuiEvents = () => {
    const list = []
    if (schedule.classes) {
      schedule.classes.forEach(c => list.push({
        id: `class-${c.id}`, eventId: c.id, type: "class",
        title: `${c.module_code} ${c.lesson_type}`, description: c.module_name, venue: c.venue || "No Venue",
        start: new Date(`${c.class_date}T${c.start_time}`).toISOString(),
        end: new Date(`${c.class_date}T${c.end_time}`).toISOString(),
      }))
    }
    if (schedule.exams) {
      schedule.exams.forEach(e => list.push({
        id: `exam-${e.id}`, eventId: e.id, type: "exam",
        title: `${e.module_code} Exam`, description: e.module_name, venue: "See Exam Venue",
        start: new Date(e.start_at).toISOString(), end: new Date(e.end_at).toISOString(),
      }))
    }
    if (schedule.events) {
      schedule.events.forEach(ev => {
        const isGroupOrComm = ev.c_id != null || ev.g_id != null
        const isAttending = ev.is_attending

        let className = ""
        if (isGroupOrComm && !isAttending) {
          className = "event-pending-rsvp"
        }

        list.push({
          id: `event-${ev.id}`, eventId: ev.id, type: "event",
          title: ev.title, description: ev.description || "", venue: ev.venue || "No Venue",
          start: new Date(ev.start_at).toISOString(),
          end: ev.end_at ? new Date(ev.end_at).toISOString() : new Date(ev.start_at).toISOString(),
          c_id: ev.c_id,
          g_id: ev.g_id,
          is_attending: ev.is_attending,
          className
        })
      })
    }
    return list
  }

  const handleCreatePersonalEvent = async (e) => {
    e.preventDefault()
    const { event } = activeModal
    if (!event.title.trim() || !event.start) return
    try {
      await createEvent(token, {
        title: event.title,
        description: event.description || "",
        venue: event.venue || "",
        start_at: new Date(event.start).toISOString(),
        end_at: event.end ? new Date(event.end).toISOString() : null,
        is_all_day: false,
        c_id: null,
        g_id: null,
        module_code: null,
        event_type: null
      })
      setActiveModal(null)
      loadSchedule()
    } catch (err) {
      alert(err.message || "Failed to create personal event.")
    }
  }

  const handleSaveEdit = async (e) => {
    e.preventDefault()
    const { event } = activeModal
    try {
      await updateEvent(token, event.eventId, {
        title: event.title,
        description: event.description,
        venue: event.venue,
        start_at: event.start,
        end_at: event.end,
        is_all_day: false,
        module_code: null, c_id: null, g_id: null
      })
      setActiveModal(null)
      loadSchedule()
    } catch (err) {
      alert(err.message || "Failed to update.")
    }
  }

  const handleDelete = async () => {
    if (!window.confirm("Delete this event?")) return
    try {
      await deleteEvent(token, activeModal.event.eventId)
      setActiveModal(null)
      loadSchedule()
    } catch (err) {
      alert(err.message || "Failed to delete.")
    }
  }

  const handleUpdateAttendance = async (eventId, isAttending) => {
    try {
      await updateEventAttendance(token, eventId, isAttending)
      setActiveModal(prev => ({
        ...prev,
        event: {
          ...prev.event,
          is_attending: isAttending,
          className: (prev.event.c_id || prev.event.g_id) && !isAttending ? "event-pending-rsvp" : ""
        }
      }))
      loadSchedule()
    } catch (err) {
      alert(err.message || "Failed to update attendance.")
    }
  }


  return (
    <div className="app-shell" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card flex justify-between items-center mb-md">
        <div className="flex-col gap-xs">
          <h2 style={{ fontSize: "28px" }}>Academic Schedule</h2>
          <p className="text-muted text-sm">Interactive calendar with monthly, weekly, and agenda views.</p>
        </div>
        <div className="flex items-center gap-md">
          <div className="view-switcher-group flex" style={{ marginRight: "12px" }}>
            <button className={`btn btn--sm ${viewMode === "month" ? "btn--primary" : "btn--outline"}`} onClick={() => setViewMode("month")}><CalendarIcon size={14} style={{ marginRight: "4px" }} />Month</button>
            <button className={`btn btn--sm ${viewMode === "week" ? "btn--primary" : "btn--outline"}`} onClick={() => setViewMode("week")}><Grid size={14} style={{ marginRight: "4px" }} />Week</button>
            <button className={`btn btn--sm ${viewMode === "agenda" ? "btn--primary" : "btn--outline"}`} onClick={() => setViewMode("agenda")}><List size={14} style={{ marginRight: "4px" }} />Agenda</button>
          </div>
          <button className="btn btn--primary" onClick={() => setActiveModal({ mode: "create", event: { title: "", start: "", end: "", venue: "", description: "" } })} style={{ display: "inline-flex", alignItems: "center" }}>
            + New Event
          </button>
          <label className="btn btn--secondary cursor-pointer">
            <Upload size={14} style={{ marginRight: "6px" }} />Import .ics
            <input type="file" accept=".ics" onChange={handleIcsUpload} style={{ display: "none" }} disabled={uploadingSchedule} />
          </label>
        </div>
      </div>

      {error && <div className="card text-error mb-md" style={{ borderColor: "var(--error)", padding: "12px 16px" }}>{error}</div>}

      {loadingSchedule ? (
        <div className="state-box"><RefreshCw size={24} className="spin" /><span>Loading schedule...</span></div>
      ) : (
        <div className="card" style={{ padding: "20px" }}>
          <div style={{ height: "650px", width: "100%", overflow: "hidden" }}>
            <ThemeProvider theme={scheduleTheme}>
              <EventCalendarProvider events={getMuiEvents()} defaultVisibleDate={new Date()} readOnly>
                <EventDialogProvider>
                  <EventClickWatcher onEventClick={(occurrence) => {
                    const matchedEvent = getMuiEvents().find(ev => ev.id === occurrence.id)
                    if (matchedEvent) {
                      setActiveModal({ mode: "view", event: matchedEvent })
                    }
                  }} />
                  {viewMode === "month" && <MonthView />}
                  {viewMode === "week" && <WeekView />}
                  {viewMode === "agenda" && <AgendaView />}
                </EventDialogProvider>
              </EventCalendarProvider>
            </ThemeProvider>
          </div>
        </div>
      )}

      {activeModal && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "450px" }}>
            <div className="modal-header">
              <h3>
                {activeModal.mode === "create"
                  ? "New Personal Event"
                  : activeModal.mode === "edit"
                  ? "Edit Event"
                  : "Event Details"}
              </h3>
              <button className="close-modal" onClick={() => setActiveModal(null)}><X size={18} /></button>
            </div>

            {activeModal.mode === "create" ? (
              <form onSubmit={handleCreatePersonalEvent} className="form modal-body">
                <div className="form-group">
                  <label>Title</label>
                  <input
                    type="text"
                    className="form-input"
                    value={activeModal.event.title}
                    onChange={(e) => setActiveModal({ ...activeModal, event: { ...activeModal.event, title: e.target.value } })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Venue (optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={activeModal.event.venue}
                    onChange={(e) => setActiveModal({ ...activeModal, event: { ...activeModal.event, venue: e.target.value } })}
                  />
                </div>
                <div className="form-grid form-grid--2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div className="form-group">
                    <label>Start Date & Time</label>
                    <input
                      type="datetime-local"
                      className="form-input"
                      value={activeModal.event.start}
                      onChange={(e) => setActiveModal({ ...activeModal, event: { ...activeModal.event, start: e.target.value } })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>End (optional)</label>
                    <input
                      type="datetime-local"
                      className="form-input"
                      value={activeModal.event.end}
                      onChange={(e) => setActiveModal({ ...activeModal, event: { ...activeModal.event, end: e.target.value } })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Description (optional)</label>
                  <textarea
                    className="form-input"
                    value={activeModal.event.description}
                    onChange={(e) => setActiveModal({ ...activeModal, event: { ...activeModal.event, description: e.target.value } })}
                    rows={2}
                  />
                </div>
                <div className="modal-footer flex justify-end gap-sm" style={{ padding: "16px 0 0" }}>
                  <button type="button" className="btn btn--secondary" onClick={() => setActiveModal(null)}>Cancel</button>
                  <button type="submit" className="btn btn--primary">Create</button>
                </div>
              </form>
            ) : activeModal.mode === "edit" ? (
              <form onSubmit={handleSaveEdit} className="form modal-body">
                <div className="form-group">
                  <label>Title</label>
                  <input type="text" className="form-input" value={activeModal.event.title} onChange={(e) => setActiveModal({ ...activeModal, event: { ...activeModal.event, title: e.target.value } })} required />
                </div>
                <div className="form-group">
                  <label>Venue</label>
                  <input type="text" className="form-input" value={activeModal.event.venue} onChange={(e) => setActiveModal({ ...activeModal, event: { ...activeModal.event, venue: e.target.value } })} />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea className="form-input" value={activeModal.event.description} onChange={(e) => setActiveModal({ ...activeModal, event: { ...activeModal.event, description: e.target.value } })} rows={2} />
                </div>
                <div className="modal-footer flex justify-between w-full" style={{ padding: "16px 0 0" }}>
                  <button type="button" className="btn btn--danger" onClick={handleDelete}><Trash2 size={14} /></button>
                  <div className="flex gap-sm">
                    <button type="button" className="btn btn--secondary" onClick={() => setActiveModal({ ...activeModal, mode: "view" })}>Cancel</button>
                    <button type="submit" className="btn btn--primary">Save</button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="modal-body flex-col gap-md">
                <span className={`badge badge--square badge--${activeModal.event.type === "class" ? "primary" : activeModal.event.type === "exam" ? "danger" : "warning"}`} style={{ alignSelf: "flex-start" }}>
                  {activeModal.event.type}
                </span>
                <h4 style={{ fontSize: "20px", fontWeight: "600" }}>{activeModal.event.title}</h4>
                {activeModal.event.description && <p className="text-sm">{activeModal.event.description}</p>}

                <hr style={{ border: 0, height: "1px", background: "var(--border)", margin: "4px 0" }} />

                <div className="flex-col gap-xs text-sm text-muted">
                  <span className="flex items-center gap-xs"><Clock size={14} />{new Date(activeModal.event.start).toLocaleString("en-SG")}</span>
                  <span className="flex items-center gap-xs"><MapPin size={14} />{activeModal.event.venue}</span>
                  {(activeModal.event.c_id || activeModal.event.g_id) && (
                    <div style={{ marginTop: "12px" }}>
                      <span className="eyebrow" style={{ display: "block", marginBottom: "6px" }}>RSVP STATUS</span>
                      <div className="flex items-center gap-md">
                        <span className={`badge badge--${activeModal.event.is_attending ? "success" : "muted"}`}>
                          {activeModal.event.is_attending ? "Attending" : "Not Attending"}
                        </span>
                        <div className="flex gap-xs">
                          <button 
                            type="button"
                            className={`btn btn--sm ${activeModal.event.is_attending ? "btn--primary" : "btn--outline"}`}
                            style={{ padding: "4px 8px", fontSize: "11px" }}
                            onClick={() => handleUpdateAttendance(activeModal.event.eventId, true)}
                          >
                            Going
                          </button>
                          <button 
                            type="button"
                            className={`btn btn--sm ${!activeModal.event.is_attending ? "btn--danger" : "btn--outline"}`}
                            style={{ padding: "4px 8px", fontSize: "11px" }}
                            onClick={() => handleUpdateAttendance(activeModal.event.eventId, false)}
                          >
                            Not Going
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="modal-footer flex justify-end w-full" style={{ padding: "16px 0 0" }}>
                  {activeModal.event.type === "event" && !activeModal.event.c_id && !activeModal.event.g_id ?
                    <button className="btn btn--primary btn--sm" onClick={() => setActiveModal({ ...activeModal, mode: "edit" })}>Edit</button> : null}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Schedule
