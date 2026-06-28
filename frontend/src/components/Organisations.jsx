import { useState, useEffect } from "react"
import { useLocation } from "react-router-dom"
import {
  getCommunities, createCommunity,
  getGroups, createGroup,
  createInvite, joinGroup,
  getEvents, createEvent,
  getForms, createForm, submitFormResponse, getFormResponses, getFormStats,
  getGroupMembers,
  getEventAttendanceSummary, markEventActualAttendance,
  updateEventAttendance
} from "../api"
import {
  Plus, Users, UserPlus, Calendar, FileText,
  Copy, Check, ChevronLeft, ChevronDown, ChevronRight, X, Clock, MapPin
} from "lucide-react"

const EVENT_TYPES = {
  training: { label: "TRAINING", bg: "#E8F5F3", color: "#2F7A72" },
  competition: { label: "COMPETITION", bg: "#FDECEA", color: "#C62828" },
  meeting: { label: "MEETING", bg: "#E8EAF6", color: "#3949AB" },
  social: { label: "SOCIAL", bg: "#FFF8E1", color: "#E65100" },
  other: { label: "OTHER", bg: "#F5F5F5", color: "#757575" },
}

const FORM_TYPES = {
  survey: { label: "SURVEY", bg: "#E3F2FD", color: "#1565C0" },
  poll: { label: "AVAILABILITY POLL", bg: "#FFF3E0", color: "#BF360C" },
  "sign-up": { label: "SIGN-UP", bg: "#E8F5E9", color: "#2E7D32" },
}

async function fetchOrganisationData(token) {
  const [communities, groups, events, forms] = await Promise.all([
    getCommunities(token),
    getGroups(token),
    getEvents(token),
    getForms(token),
  ])

  return {
    communities: communities || [],
    groups: groups || [],
    events: events || [],
    forms: forms || [],
  }
}

function getInitials(name, email) {
  const src = (name && name.trim()) ? name.trim() : (email || "")
  return src.slice(0, 2).toUpperCase() || "?"
}

function fmtDate(dt) {
  return new Date(dt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
}

function fmtTime(dt) {
  return new Date(dt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

function TypeBadge({ value, map }) {
  const style = map[value] || map.other || { label: (value || "").toUpperCase(), bg: "#F5F5F5", color: "#757575" }
  if (!value) return null
  return (
    <span style={{
      fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em",
      background: style.bg, color: style.color,
      padding: "2px 8px", borderRadius: "var(--radius-pill)",
      display: "inline-block", marginBottom: "6px", textTransform: "uppercase"
    }}>
      {style.label || value.toUpperCase()}
    </span>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
      onClick={onClose}
    >
      <div
        className="card flex-col gap-lg"
        style={{ maxWidth: "500px", width: "100%", maxHeight: "88vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center">
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="btn btn--ghost btn--sm" onClick={onClose} style={{ padding: "4px" }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function GroupCard({ group, community, nextEvent, latestForm, onClick }) {
  return (
    <div
      className="card flex-col gap-md"
      style={{ cursor: "pointer", borderColor: "var(--border)" }}
      onClick={onClick}
    >
      <div>
        {community && (
          <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent)" }}>
            {community.name}
          </span>
        )}
        <h3 style={{ margin: "2px 0 0", fontSize: "18px" }}>{group.name}</h3>
        {group.description && <p className="text-sm text-muted" style={{ marginTop: "4px" }}>{group.description}</p>}
      </div>
      <div className="flex-col gap-xs" style={{ borderTop: "1px solid var(--border)", paddingTop: "10px" }}>
        {nextEvent ? (
          <div className="flex items-center gap-sm" style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            <Calendar size={12} style={{ flexShrink: 0 }} />
            <span className="truncate"><strong style={{ color: "var(--text-h)" }}>{nextEvent.title}</strong> · {fmtDate(nextEvent.start_at)}</span>
          </div>
        ) : (
          <span className="text-xs text-muted">No upcoming events</span>
        )}
        {latestForm && (
          <div className="flex items-center gap-sm" style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            <FileText size={12} style={{ flexShrink: 0 }} />
            <span className="truncate">{latestForm.title}</span>
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <span style={{ fontSize: "11px", color: "var(--primary)", fontWeight: 600 }}>Open →</span>
      </div>
    </div>
  )
}

function EventCard({ event, isAdmin, onViewAttendance, onRsvp }) {
  return (
    <div className="card flex-col gap-sm" style={{ gap: "8px" }}>
      <TypeBadge value={event.event_type} map={EVENT_TYPES} />
      <div className="flex justify-between items-start gap-md">
        <div className="flex-col gap-xs flex-1">
          <strong style={{ fontSize: "15px" }}>{event.title}</strong>
          <div className="flex gap-md flex-wrap" style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <Calendar size={11} /> {fmtDate(event.start_at)} &nbsp; <Clock size={11} /> {fmtTime(event.start_at)}{event.end_at ? `–${fmtTime(event.end_at)}` : ""}
            </span>
            {event.venue && (
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <MapPin size={11} /> {event.venue}
              </span>
            )}
          </div>
          {event.description && <p className="text-sm" style={{ color: "var(--text-muted)", marginTop: "2px" }}>{event.description}</p>}
        </div>
        <div className="flex-col gap-xs items-end" style={{ flexShrink: 0, minWidth: "130px", textAlign: "right" }}>
          {event.g_id && (
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              <Users size={11} style={{ display: "inline", marginRight: "3px" }} />
              {event.rsvp_count}/{event.total_members} attending
            </span>
          )}
          {isAdmin && (
            <button className="btn btn--outline btn--sm" onClick={() => onViewAttendance(event)}>View Attendance</button>
          )}
          {!isAdmin && (
            <button
              className={`btn btn--sm ${event.is_attending ? "btn--secondary" : "btn--primary"}`}
              onClick={() => onRsvp(event)}
            >
              {event.is_attending ? "Attending" : "RSVP"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function EventsTab({ upcomingEvents, pastEvents, isAdmin, onCreateClick, onViewAttendance, onRsvp }) {
  const [showPast, setShowPast] = useState(false)
  return (
    <div className="flex-col gap-md">
      <div className="flex justify-between items-center">
        <h3 style={{ margin: 0, fontSize: "16px" }}>Upcoming Events</h3>
        {isAdmin && (
          <button className="btn btn--primary btn--sm" onClick={onCreateClick}>
            <Plus size={14} /> Create Event
          </button>
        )}
      </div>
      {upcomingEvents.length === 0 && <div className="state-box state-box--dashed text-sm">No upcoming events scheduled.</div>}
      {upcomingEvents.map(evt => (
        <EventCard key={evt.id} event={evt} isAdmin={isAdmin} onViewAttendance={onViewAttendance} onRsvp={onRsvp} />
      ))}
      {pastEvents.length > 0 && (
        <>
          <button
            onClick={() => setShowPast(v => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", color: "var(--text-muted)", padding: "4px 0", alignSelf: "flex-start" }}
          >
            {showPast ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Past Events ({pastEvents.length})
          </button>
          {showPast && pastEvents.map(evt => (
            <EventCard key={evt.id} event={evt} isAdmin={isAdmin} onViewAttendance={onViewAttendance} onRsvp={onRsvp} />
          ))}
        </>
      )}
    </div>
  )
}

function FormsTab({
  groupForms, isAdmin,
  fillingForm, fillingAnswers, setFillingAnswers,
  viewingFormSubmissions, formSubmissions, formStats,
  showFormBuilder, setShowFormBuilder,
  formTitle, setFormTitle, formDesc, setFormDesc,
  formType, setFormType, formFields,
  fieldName, setFieldName, fieldType, setFieldType,
  fieldOptions, setFieldOptions, fieldRequired, setFieldRequired,
  onAddField, onRemoveField, onCreateForm,
  onOpenFormFiller, onFormSubmission, onViewResponses,
  onBackFromSubmissions, onCancelFilling
}) {
  if (viewingFormSubmissions) {
    const fieldKeys = viewingFormSubmissions.fields?.map(f => f.name) || []
    return (
      <div className="flex-col gap-lg">
        <div>
          <button className="btn btn--secondary btn--sm" style={{ marginBottom: "8px" }} onClick={onBackFromSubmissions}>← Back to Forms</button>
          <h3 style={{ margin: 0, fontSize: "16px" }}>{viewingFormSubmissions.title}</h3>
        </div>
        {formStats && (
          <div className="flex gap-xl" style={{ padding: "12px 16px", background: "var(--surface-warm)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
            <div>
              <span className="text-xs text-muted" style={{ display: "block" }}>Responses</span>
              <strong>{formStats.responses_count} / {formStats.total_members}</strong>
            </div>
            <div>
              <span className="text-xs text-muted" style={{ display: "block" }}>Response Rate</span>
              <strong>{(formStats.response_rate * 100).toFixed(0)}%</strong>
            </div>
          </div>
        )}
        {formSubmissions.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>Submitted</th>
                  {fieldKeys.map(k => (
                    <th key={k} style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>{k.replace(/_/g, " ")}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {formSubmissions.map(sub => (
                  <tr key={sub.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 12px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {new Date(sub.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    {fieldKeys.map(k => (
                      <td key={k} style={{ padding: "10px 12px" }}>{String(sub.response_data?.[k] ?? "—")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="state-box text-sm">No submissions yet.</div>
        )}
      </div>
    )
  }

  if (fillingForm) {
    const alreadyResponded = !!fillingForm.user_response
    return (
      <div className="flex-col gap-lg">
        <div>
          <button className="btn btn--secondary btn--sm" style={{ marginBottom: "8px" }} onClick={onCancelFilling}>← Back to Forms</button>
          <div className="flex items-center gap-md">
            <h3 style={{ margin: 0, fontSize: "16px" }}>{fillingForm.title}</h3>
            <TypeBadge value={fillingForm.form_type} map={FORM_TYPES} />
          </div>
          {fillingForm.description && <p className="text-sm text-muted" style={{ marginTop: "4px" }}>{fillingForm.description}</p>}
        </div>
        {alreadyResponded && (
          <div className="badge badge--success p-md" style={{ borderRadius: "var(--radius-md)", textTransform: "none", fontSize: "13px" }}>
            You have already submitted a response.
          </div>
        )}
        <form onSubmit={onFormSubmission} className="form flex-col gap-md">
          {fillingForm.fields.map(field => (
            <div key={field.name} className="form-group">
              <label>{field.label}{field.required && !alreadyResponded && <span className="text-error"> *</span>}</label>
              {field.type === "textarea" ? (
                <textarea className="form-input" required={field.required} disabled={alreadyResponded}
                  value={fillingAnswers[field.name] || ""} onChange={e => setFillingAnswers({ ...fillingAnswers, [field.name]: e.target.value })} />
              ) : field.type === "select" ? (
                <select className="form-input" required={field.required} disabled={alreadyResponded}
                  value={fillingAnswers[field.name] || ""} onChange={e => setFillingAnswers({ ...fillingAnswers, [field.name]: e.target.value })}>
                  <option value="">-- Choose --</option>
                  {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input type={field.type === "number" ? "number" : "text"} className="form-input"
                  required={field.required} disabled={alreadyResponded}
                  value={fillingAnswers[field.name] || ""} onChange={e => setFillingAnswers({ ...fillingAnswers, [field.name]: e.target.value })} />
              )}
            </div>
          ))}
          <div className="flex gap-sm">
            {!alreadyResponded && <button type="submit" className="btn btn--primary btn--sm">Submit Response</button>}
            <button type="button" className="btn btn--secondary btn--sm" onClick={onCancelFilling}>{alreadyResponded ? "Close" : "Cancel"}</button>
          </div>
        </form>
      </div>
    )
  }

  if (showFormBuilder) {
    return (
      <div className="flex-col gap-lg">
        <div>
          <button className="btn btn--secondary btn--sm" style={{ marginBottom: "8px" }} onClick={() => setShowFormBuilder(false)}>← Cancel</button>
          <h3 style={{ margin: 0, fontSize: "16px" }}>New Form</h3>
        </div>
        <form onSubmit={onCreateForm} className="form flex-col gap-md">
          <div className="form-grid form-grid--2col">
            <div className="form-group">
              <label>Title</label>
              <input type="text" className="form-input" required value={formTitle} onChange={e => setFormTitle(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select className="form-input" value={formType} onChange={e => setFormType(e.target.value)}>
                <option value="survey">Survey</option>
                <option value="poll">Poll</option>
                <option value="sign-up">Sign-up</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea className="form-input" rows={2} value={formDesc} onChange={e => setFormDesc(e.target.value)} />
          </div>
          <div className="card flex-col gap-md" style={{ background: "var(--surface-warm)" }}>
            <span className="eyebrow" style={{ margin: 0, fontSize: "11px" }}>Form Fields</span>
            {formFields.map((f, i) => (
              <div key={i} className="flex justify-between items-center" style={{ padding: "8px 12px", background: "var(--surface)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                <span className="text-sm"><strong>{f.label}</strong> <span className="text-muted">({f.type})</span></span>
                <button type="button" className="btn btn--ghost-danger btn--sm" onClick={() => onRemoveField(i)}>Remove</button>
              </div>
            ))}
            <div className="form-grid form-grid--3col">
              <div className="form-group">
                <label>Field Name</label>
                <input type="text" className="form-input" value={fieldName} onChange={e => setFieldName(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Type</label>
                <select className="form-input" value={fieldType} onChange={e => setFieldType(e.target.value)}>
                  <option value="text">Short Text</option>
                  <option value="textarea">Long Text</option>
                  <option value="number">Number</option>
                  <option value="select">Dropdown</option>
                </select>
              </div>
              <div className="form-group">
                <label>Required</label>
                <select className="form-input" value={fieldRequired ? "yes" : "no"} onChange={e => setFieldRequired(e.target.value === "yes")}>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>
            {fieldType === "select" && (
              <div className="form-group">
                <label>Options (comma separated)</label>
                <input type="text" className="form-input" placeholder="XS, S, M, L, XL" value={fieldOptions} onChange={e => setFieldOptions(e.target.value)} />
              </div>
            )}
            <button type="button" className="btn btn--secondary btn--sm" onClick={onAddField}>+ Add Field</button>
          </div>
          <div className="flex gap-sm">
            <button type="submit" className="btn btn--primary btn--sm" disabled={formFields.length === 0}>Publish Form</button>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setShowFormBuilder(false)}>Cancel</button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="flex-col gap-md">
      <div className="flex justify-between items-center">
        <h3 style={{ margin: 0, fontSize: "16px" }}>Active Forms</h3>
        {isAdmin && (
          <button className="btn btn--primary btn--sm" onClick={() => setShowFormBuilder(true)}>
            <Plus size={14} /> Create Form
          </button>
        )}
      </div>
      {groupForms.length === 0 && <div className="state-box state-box--dashed text-sm">No forms published yet.</div>}
      {groupForms.map(frm => {
        const responded = !!frm.user_response
        return (
          <div key={frm.id} className="card flex-col gap-xs">
            <TypeBadge value={frm.form_type} map={FORM_TYPES} />
            <div className="flex justify-between items-start gap-md">
              <div className="flex-col gap-xs flex-1">
                <strong style={{ fontSize: "15px" }}>{frm.title}</strong>
                {frm.description && <p className="text-sm text-muted">{frm.description}</p>}
                {frm.closes_at && (
                  <span style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Calendar size={11} /> Due {new Date(frm.closes_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                )}
              </div>
              <div className="flex gap-xs items-center" style={{ flexShrink: 0 }}>
                {responded && <span className="badge badge--success" style={{ fontSize: "11px" }}>Responded</span>}
                {!responded && <button className="btn btn--primary btn--sm" onClick={() => onOpenFormFiller(frm)}>Fill in</button>}
                {responded && <button className="btn btn--outline btn--sm" onClick={() => onOpenFormFiller(frm)}>View</button>}
                {isAdmin && <button className="btn btn--outline btn--sm" onClick={() => onViewResponses(frm)}>View Responses</button>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MembersTab({ members, currentUserId, isAdmin, generatedInvite, copied, onInvite, onCopyInvite }) {
  return (
    <div className="flex-col gap-md">
      <div className="flex justify-between items-center">
        <h3 style={{ margin: 0, fontSize: "16px" }}>Members ({members.length})</h3>
        {isAdmin && (
          <button className="btn btn--primary btn--sm" onClick={onInvite}>
            <UserPlus size={14} /> Invite Member
          </button>
        )}
      </div>
      {generatedInvite && (
        <div className="flex justify-between items-center p-md" style={{ background: "var(--surface-warm)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
          <span className="text-sm"><code>{window.location.origin}/join/{generatedInvite}</code></span>
          <button className="btn btn--primary btn--sm" onClick={onCopyInvite}>
            {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
          </button>
        </div>
      )}
      {members.length === 0 && <div className="state-box text-sm">No members found.</div>}
      {members.map(m => (
        <div key={m.user_id} className="list-item flex justify-between items-center">
          <div className="flex items-center gap-md">
            <div style={{
              width: "36px", height: "36px", borderRadius: "50%",
              background: "var(--primary)", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "13px", fontWeight: 700, flexShrink: 0
            }}>
              {getInitials(m.name, m.email)}
            </div>
            <div>
              <div className="flex items-center gap-sm">
                <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-h)" }}>
                  {m.name || m.email}
                </span>
                <span style={{
                  fontSize: "10px", fontWeight: 700, textTransform: "capitalize",
                  background: m.role === "admin" ? "var(--primary)" : "var(--surface-warm)",
                  color: m.role === "admin" ? "#fff" : "var(--text-muted)",
                  border: m.role !== "admin" ? "1px solid var(--border)" : "none",
                  padding: "2px 8px", borderRadius: "var(--radius-pill)"
                }}>
                  {m.role}
                </span>
                {m.user_id === currentUserId && <span className="text-xs text-muted">(you)</span>}
              </div>
              {m.name && <span className="text-xs text-muted">{m.email}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function AttendanceModal({ event, summary, onClose, onMarkAttendance }) {
  return (
    <Modal title={`Attendance: ${event.title}`} onClose={onClose}>
      <div className="flex gap-xl" style={{ padding: "10px 14px", background: "var(--surface-warm)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
        <div>
          <span className="text-xs text-muted" style={{ display: "block" }}>RSVPd</span>
          <strong>{summary.filter(r => r.is_attending).length} / {summary.length}</strong>
        </div>
        <div>
          <span className="text-xs text-muted" style={{ display: "block" }}>Attended</span>
          <strong>{summary.filter(r => r.attended === true).length} / {summary.length}</strong>
        </div>
      </div>
      <div className="flex-col gap-xs">
        {summary.map(row => (
          <div key={row.user_id} className="list-item flex justify-between items-center">
            <div className="flex items-center gap-md">
              <div style={{
                width: "32px", height: "32px", borderRadius: "50%",
                background: "var(--surface-warm)", border: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "12px", fontWeight: 700, color: "var(--primary)", flexShrink: 0
              }}>
                {getInitials(row.name, row.email)}
              </div>
              <div>
                <span style={{ fontSize: "13px", fontWeight: 500 }}>{row.name || row.email}</span>
                {row.name && <span className="text-xs text-muted" style={{ display: "block" }}>{row.email}</span>}
                <span style={{ fontSize: "11px", color: row.is_attending ? "var(--success)" : "var(--text-muted)" }}>
                  {row.is_attending ? "RSVP'd attending" : "Not RSVP'd"}
                </span>
              </div>
            </div>
            <div className="flex gap-xs">
              <button
                className={`btn btn--sm ${row.attended === true ? "btn--primary" : "btn--secondary"}`}
                style={{ fontSize: "11px", padding: "4px 10px" }}
                onClick={() => onMarkAttendance(row.user_id, row.attended === true ? null : true)}
              >
                {row.attended === true ? "Present" : "Mark Present"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

function Organisations({ token, currentUser }) {
  const location = useLocation()
  const [communities, setCommunities] = useState([])
  const [groups, setGroups] = useState([])
  const [allEvents, setAllEvents] = useState([])
  const [allForms, setAllForms] = useState([])

  const [view, setView] = useState("list")
  const [activeGroup, setActiveGroup] = useState(null)
  const [activeCommunity, setActiveCommunity] = useState(null)
  const [activeTab, setActiveTab] = useState("events")

  const [showCreateCommunity, setShowCreateCommunity] = useState(false)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [showEventModal, setShowEventModal] = useState(false)

  const [inviteCodeInput, setInviteCodeInput] = useState("")
  const [generatedInvite, setGeneratedInvite] = useState("")
  const [copied, setCopied] = useState(false)

  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const [newCommName, setNewCommName] = useState("")
  const [newCommDesc, setNewCommDesc] = useState("")
  const [newGroupName, setNewGroupName] = useState("")
  const [newGroupDesc, setNewGroupDesc] = useState("")
  const [newGroupCommId, setNewGroupCommId] = useState("")

  const [eventTitle, setEventTitle] = useState("")
  const [eventType, setEventType] = useState("")
  const [customEventType, setCustomEventType] = useState("")
  const [eventDesc, setEventDesc] = useState("")
  const [eventVenue, setEventVenue] = useState("")
  const [eventStart, setEventStart] = useState("")
  const [eventEnd, setEventEnd] = useState("")

  const [formTitle, setFormTitle] = useState("")
  const [formDesc, setFormDesc] = useState("")
  const [formType, setFormType] = useState("survey")
  const [formFields, setFormFields] = useState([])
  const [fieldName, setFieldName] = useState("")
  const [fieldType, setFieldType] = useState("text")
  const [fieldOptions, setFieldOptions] = useState("")
  const [fieldRequired, setFieldRequired] = useState(true)
  const [showFormBuilder, setShowFormBuilder] = useState(false)

  const [fillingForm, setFillingForm] = useState(null)
  const [fillingAnswers, setFillingAnswers] = useState({})
  const [viewingFormSubmissions, setViewingFormSubmissions] = useState(null)
  const [formSubmissions, setFormSubmissions] = useState([])
  const [formStats, setFormStats] = useState(null)

  const [members, setMembers] = useState([])
  const [viewingAttendance, setViewingAttendance] = useState(null)
  const [attendanceSummary, setAttendanceSummary] = useState([])

  async function loadData() {
    try {
      const data = await fetchOrganisationData(token)
      setCommunities(data.communities)
      setGroups(data.groups)
      setAllEvents(data.events)
      setAllForms(data.forms)
    } catch {
      setError("Failed to load data from server.")
    }
  }

  useEffect(() => {
    let cancelled = false
    const joinSuccess = sessionStorage.getItem("join_success")
    const joinError = sessionStorage.getItem("join_error")
    sessionStorage.removeItem("join_success")
    sessionStorage.removeItem("join_error")

    async function loadInitialData() {
      try {
        const data = await fetchOrganisationData(token)
        if (cancelled) return
        setCommunities(data.communities)
        setGroups(data.groups)
        setAllEvents(data.events)
        setAllForms(data.forms)
        if (joinSuccess) setSuccess(joinSuccess)
        if (joinError) setError(joinError)
      } catch {
        if (!cancelled) setError("Failed to load data from server.")
      }
    }

    loadInitialData()
    return () => { cancelled = true }
  }, [token])

  useEffect(() => {
    if (!activeGroup || activeTab !== "members") return
    let cancelled = false

    async function loadMembers() {
      try {
        const data = await getGroupMembers(token, activeGroup.id)
        if (!cancelled) setMembers(data)
      } catch {
        if (!cancelled) setMembers([])
      }
    }

    loadMembers()
    return () => { cancelled = true }
  }, [activeGroup, activeTab, token])

  useEffect(() => {
    if (location.state && location.state.openGroupId && groups.length > 0) {
      const grp = groups.find(g => g.id === location.state.openGroupId)
      if (grp) {
        const comm = communities.find(c => c.id === grp.c_id) || null
        setActiveGroup(grp)
        setActiveCommunity(comm)
        setActiveTab(location.state.openTab || "events")
        setGeneratedInvite("")
        setFillingForm(null)
        setViewingFormSubmissions(null)
        setShowFormBuilder(false)
        setView("group")
        setError(""); setSuccess("")
      }
    }
  }, [location.state, groups, communities])

  const handleJoinGroup = async (e) => {
    e.preventDefault()
    setError(""); setSuccess("")
    if (!inviteCodeInput.trim()) return
    try {
      const res = await joinGroup(token, inviteCodeInput.trim())
      setSuccess(res.message || "Successfully joined!")
      setInviteCodeInput("")
      loadData()
    } catch (err) { setError(err.message || "Invalid or expired invite code.") }
  }

  const handleCreateCommunity = async (e) => {
    e.preventDefault()
    setError(""); setSuccess("")
    if (!newCommName.trim()) return
    try {
      await createCommunity(token, { name: newCommName, description: newCommDesc })
      setNewCommName(""); setNewCommDesc("")
      setShowCreateCommunity(false)
      setSuccess("Community created!")
      loadData()
    } catch (err) { setError(err.message || "Failed to create community.") }
  }

  const handleCreateGroup = async (e) => {
    e.preventDefault()
    setError(""); setSuccess("")
    if (!newGroupName.trim() || !newGroupCommId) return
    try {
      await createGroup(token, { c_id: parseInt(newGroupCommId), name: newGroupName, description: newGroupDesc })
      setNewGroupName(""); setNewGroupDesc(""); setNewGroupCommId("")
      setShowCreateGroup(false)
      setSuccess("Group created!")
      loadData()
    } catch (err) { setError(err.message || "Failed to create group.") }
  }

  const handleCreateEvent = async (e) => {
    e.preventDefault()
    setError(""); setSuccess("")
    if (!eventTitle.trim() || !activeGroup) return
    try {
      const resolvedEventType = eventType === "other" ? (customEventType.trim() || null) : (eventType || null)
      await createEvent(token, {
        title: eventTitle, description: eventDesc, venue: eventVenue,
        start_at: new Date(eventStart).toISOString(),
        end_at: eventEnd ? new Date(eventEnd).toISOString() : null,
        is_all_day: false, g_id: activeGroup.id,
        event_type: resolvedEventType
      })
      setEventTitle(""); setEventDesc(""); setEventVenue(""); setEventStart(""); setEventEnd(""); setEventType(""); setCustomEventType("")
      setShowEventModal(false)
      setSuccess("Event created!")
      loadData()
    } catch (err) { setError(err.message || "Failed to create event.") }
  }

  const handleAddField = () => {
    if (!fieldName.trim()) return
    setFormFields([...formFields, {
      name: fieldName.toLowerCase().replace(/[^a-z0-9]/g, "_"),
      label: fieldName, type: fieldType, required: fieldRequired,
      options: fieldOptions ? fieldOptions.split(",").map(o => o.trim()) : []
    }])
    setFieldName(""); setFieldOptions("")
  }

  const handleCreateForm = async (e) => {
    e.preventDefault()
    setError(""); setSuccess("")
    if (!formTitle.trim() || !activeGroup) return
    try {
      await createForm(token, { title: formTitle, description: formDesc, form_type: formType, fields: formFields, g_id: activeGroup.id })
      setFormTitle(""); setFormDesc(""); setFormFields([])
      setShowFormBuilder(false)
      setSuccess("Form published!")
      loadData()
    } catch (err) { setError(err.message || "Failed to publish form.") }
  }

  const handleOpenFormFiller = (form) => {
    setFillingForm(form)
    setFillingAnswers(form.user_response || {})
    setViewingFormSubmissions(null)
  }

  const handleFormSubmission = async (e) => {
    e.preventDefault()
    setError(""); setSuccess("")
    try {
      await submitFormResponse(token, fillingForm.id, fillingAnswers)
      setFillingForm(null)
      setSuccess("Response submitted!")
      loadData()
    } catch (err) { setError(err.message || "Failed to submit response.") }
  }

  const handleViewResponses = async (form) => {
    setError("")
    try {
      const [resps, stats] = await Promise.all([getFormResponses(token, form.id), getFormStats(token, form.id)])
      setFormSubmissions(resps)
      setFormStats(stats)
      setViewingFormSubmissions(form)
      setFillingForm(null)
    } catch { setError("Access denied. Only group admins can view responses.") }
  }

  const handleGenerateInvite = async () => {
    setError("")
    try {
      const res = await createInvite(token, { g_id: activeGroup.id })
      setGeneratedInvite(res.code)
      setCopied(false)
    } catch (err) { setError(err.message || "Failed to generate invite.") }
  }

  const handleCopyInvite = () => {
    if (!generatedInvite) return
    navigator.clipboard.writeText(`${window.location.origin}/join/${generatedInvite}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRsvp = async (event) => {
    try {
      await updateEventAttendance(token, event.id, !event.is_attending)
      loadData()
    } catch (err) { setError(err.message || "Failed to update RSVP.") }
  }

  const handleViewAttendance = async (event) => {
    setError("")
    try {
      const summary = await getEventAttendanceSummary(token, event.id)
      setAttendanceSummary(summary)
      setViewingAttendance(event)
    } catch (err) { setError(err.message || "Failed to load attendance.") }
  }

  const handleMarkAttendance = async (userId, attended) => {
    try {
      await markEventActualAttendance(token, viewingAttendance.id, userId, attended)
      const updated = await getEventAttendanceSummary(token, viewingAttendance.id)
      setAttendanceSummary(updated)
    } catch (err) { setError(err.message || "Failed to mark attendance.") }
  }

  const openGroup = (grp) => {
    const comm = communities.find(c => c.id === grp.c_id) || null
    setActiveGroup(grp)
    setActiveCommunity(comm)
    setActiveTab("events")
    setGeneratedInvite("")
    setFillingForm(null)
    setViewingFormSubmissions(null)
    setShowFormBuilder(false)
    setView("group")
    setError(""); setSuccess("")
  }

  const communityMap = Object.fromEntries(communities.map(c => [c.id, c]))
  const isAdmin = activeGroup && groups.find(g => g.id === activeGroup.id)?.user_id === currentUser?.id
  const groupEvents = allEvents.filter(e => e.g_id === activeGroup?.id)
  const groupForms = allForms.filter(f => f.g_id === activeGroup?.id)
  const now = new Date()
  const upcomingEvents = groupEvents.filter(e => new Date(e.start_at) >= now)
  const pastEvents = groupEvents.filter(e => new Date(e.start_at) < now).reverse()

  const tabs = [
    { key: "events", icon: <Calendar size={14} />, label: "Events" },
    { key: "forms", icon: <FileText size={14} />, label: "Forms" },
    { key: "members", icon: <Users size={14} />, label: "Members" },
  ]

  if (view === "group" && activeGroup) {
    return (
      <main className="app-shell">
        <div>
          <button
            className="btn btn--ghost btn--sm"
            style={{ marginBottom: "16px" }}
            onClick={() => { setView("list"); setActiveGroup(null); setActiveCommunity(null); setError(""); setSuccess("") }}
          >
            <ChevronLeft size={14} /> Groups
          </button>

          <span className="eyebrow" style={{ display: "block", marginBottom: "4px" }}>ORGANISATION</span>
          <div className="flex items-center gap-md">
            <h1 style={{ fontSize: "28px", lineHeight: 1.2 }}>{activeGroup.name}</h1>
            <span style={{
              fontSize: "11px", fontWeight: 600, padding: "3px 10px",
              borderRadius: "var(--radius-pill)",
              background: isAdmin ? "var(--primary)" : "var(--surface-warm)",
              color: isAdmin ? "#fff" : "var(--text-muted)",
              border: isAdmin ? "none" : "1px solid var(--border)"
            }}>
              {isAdmin ? "Admin" : "Member"}
            </span>
          </div>
          {activeCommunity && (
            <span className="text-sm text-muted">{activeCommunity.name}</span>
          )}
        </div>

        {error && <div className="badge badge--danger w-full" style={{ padding: "10px 14px" }}>{error}</div>}
        {success && <div className="badge badge--success w-full" style={{ padding: "10px 14px" }}>{success}</div>}

        <div className="flex gap-xs" style={{ borderBottom: "1px solid var(--border)" }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key)
                setFillingForm(null)
                setViewingFormSubmissions(null)
                setShowFormBuilder(false)
              }}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                background: "none", border: "none", padding: "10px 16px",
                cursor: "pointer", fontSize: "13px", fontWeight: 600,
                color: activeTab === tab.key ? "var(--primary)" : "var(--text-muted)",
                borderBottom: activeTab === tab.key ? "2px solid var(--primary)" : "2px solid transparent",
                marginBottom: "-1px"
              }}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        <div className="card flex-col gap-lg">
          {activeTab === "events" && (
            <EventsTab
              upcomingEvents={upcomingEvents}
              pastEvents={pastEvents}
              isAdmin={isAdmin}
              onCreateClick={() => setShowEventModal(true)}
              onViewAttendance={handleViewAttendance}
              onRsvp={handleRsvp}
            />
          )}
          {activeTab === "forms" && (
            <FormsTab
              groupForms={groupForms}
              isAdmin={isAdmin}
              fillingForm={fillingForm}
              fillingAnswers={fillingAnswers}
              setFillingAnswers={setFillingAnswers}
              viewingFormSubmissions={viewingFormSubmissions}
              formSubmissions={formSubmissions}
              formStats={formStats}
              showFormBuilder={showFormBuilder}
              setShowFormBuilder={setShowFormBuilder}
              formTitle={formTitle} setFormTitle={setFormTitle}
              formDesc={formDesc} setFormDesc={setFormDesc}
              formType={formType} setFormType={setFormType}
              formFields={formFields}
              fieldName={fieldName} setFieldName={setFieldName}
              fieldType={fieldType} setFieldType={setFieldType}
              fieldOptions={fieldOptions} setFieldOptions={setFieldOptions}
              fieldRequired={fieldRequired} setFieldRequired={setFieldRequired}
              onAddField={handleAddField}
              onRemoveField={i => setFormFields(formFields.filter((_, idx) => idx !== i))}
              onCreateForm={handleCreateForm}
              onOpenFormFiller={handleOpenFormFiller}
              onFormSubmission={handleFormSubmission}
              onViewResponses={handleViewResponses}
              onBackFromSubmissions={() => setViewingFormSubmissions(null)}
              onCancelFilling={() => setFillingForm(null)}
            />
          )}
          {activeTab === "members" && (
            <MembersTab
              members={members}
              currentUserId={currentUser?.id}
              isAdmin={isAdmin}
              generatedInvite={generatedInvite}
              copied={copied}
              onInvite={handleGenerateInvite}
              onCopyInvite={handleCopyInvite}
            />
          )}
        </div>

        {showEventModal && (
          <Modal title="Create Event" onClose={() => setShowEventModal(false)}>
            <form onSubmit={handleCreateEvent} className="form flex-col gap-md">
              <div className="form-grid form-grid--2col">
                <div className="form-group">
                  <label>Event Title</label>
                  <input type="text" className="form-input" required value={eventTitle} onChange={e => setEventTitle(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Type</label>
                  <select className="form-input" value={eventType} onChange={e => { setEventType(e.target.value); setCustomEventType("") }}>
                    <option value="">No type</option>
                    <option value="training">Training</option>
                    <option value="competition">Competition</option>
                    <option value="meeting">Meeting</option>
                    <option value="social">Social</option>
                    <option value="other">Other</option>
                  </select>
                  {eventType === "other" && (
                    <input
                      type="text"
                      className="form-input"
                      style={{ marginTop: "8px" }}
                      placeholder="Enter custom type..."
                      value={customEventType}
                      onChange={e => setCustomEventType(e.target.value)}
                      required
                    />
                  )}
                </div>
              </div>
              <div className="form-grid form-grid--2col">
                <div className="form-group">
                  <label>Date & Time</label>
                  <input type="datetime-local" className="form-input" required value={eventStart} onChange={e => setEventStart(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>End (optional)</label>
                  <input type="datetime-local" className="form-input" value={eventEnd} onChange={e => setEventEnd(e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Location</label>
                <input type="text" className="form-input" value={eventVenue} onChange={e => setEventVenue(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea className="form-input" rows={2} value={eventDesc} onChange={e => setEventDesc(e.target.value)} />
              </div>
              <div className="flex gap-sm">
                <button type="submit" className="btn btn--primary btn--sm">Create Event</button>
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => setShowEventModal(false)}>Cancel</button>
              </div>
            </form>
          </Modal>
        )}

        {viewingAttendance && (
          <AttendanceModal
            event={viewingAttendance}
            summary={attendanceSummary}
            onClose={() => setViewingAttendance(null)}
            onMarkAttendance={handleMarkAttendance}
          />
        )}
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="flex justify-between items-center">
        <h1>Groups & Communities</h1>
        <div className="flex gap-sm items-center flex-wrap" style={{ justifyContent: "flex-end" }}>
          <form onSubmit={handleJoinGroup} className="flex gap-sm">
            <input
              type="text"
              placeholder="Join via invite code..."
              className="form-input"
              style={{ width: "200px", fontSize: "13px" }}
              value={inviteCodeInput}
              onChange={e => setInviteCodeInput(e.target.value)}
            />
            <button type="submit" className="btn btn--secondary btn--sm">Join</button>
          </form>
          <button className="btn btn--outline btn--sm" onClick={() => { setShowCreateGroup(true); setNewGroupCommId(communities[0]?.id?.toString() || "") }}>
            <Plus size={14} /> New Group
          </button>
          <button className="btn btn--primary btn--sm" onClick={() => setShowCreateCommunity(true)}>
            <Plus size={14} /> New Community
          </button>
        </div>
      </header>

      {error && <div className="badge badge--danger w-full" style={{ padding: "10px 14px" }}>{error}</div>}
      {success && <div className="badge badge--success w-full" style={{ padding: "10px 14px" }}>{success}</div>}

      {groups.length === 0 ? (
        <div className="card flex-col gap-md" style={{ padding: "48px", textAlign: "center" }}>
          <Users size={40} style={{ margin: "0 auto", color: "var(--text-muted)" }} />
          <p className="text-muted">You are not part of any groups yet.</p>
          <p className="text-sm text-muted">Create a community and group, or join one via an invite code.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
          {groups.map(grp => {
            const nextEvt = allEvents
              .filter(e => e.g_id === grp.id && new Date(e.start_at) >= now)
              .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))[0] || null
            const latestForm = allForms.filter(f => f.g_id === grp.id)[0] || null
            return (
              <GroupCard
                key={grp.id}
                group={grp}
                community={communityMap[grp.c_id]}
                nextEvent={nextEvt}
                latestForm={latestForm}
                onClick={() => openGroup(grp)}
              />
            )
          })}
        </div>
      )}

      {showCreateCommunity && (
        <Modal title="New Community" onClose={() => setShowCreateCommunity(false)}>
          <form onSubmit={handleCreateCommunity} className="form flex-col gap-md">
            <div className="form-group">
              <label>Community Name</label>
              <input type="text" className="form-input" required value={newCommName} onChange={e => setNewCommName(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Description (optional)</label>
              <textarea className="form-input" rows={2} value={newCommDesc} onChange={e => setNewCommDesc(e.target.value)} />
            </div>
            <div className="flex gap-sm">
              <button type="submit" className="btn btn--primary btn--sm">Create Community</button>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => setShowCreateCommunity(false)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {showCreateGroup && (
        <Modal title="New Group" onClose={() => setShowCreateGroup(false)}>
          <form onSubmit={handleCreateGroup} className="form flex-col gap-md">
            <div className="form-group">
              <label>Community</label>
              <select className="form-input" required value={newGroupCommId} onChange={e => setNewGroupCommId(e.target.value)}>
                <option value="">-- Select community --</option>
                {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Group Name</label>
              <input type="text" className="form-input" required value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Description (optional)</label>
              <textarea className="form-input" rows={2} value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)} />
            </div>
            <div className="flex gap-sm">
              <button type="submit" className="btn btn--primary btn--sm">Create Group</button>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => setShowCreateGroup(false)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  )
}

export default Organisations
