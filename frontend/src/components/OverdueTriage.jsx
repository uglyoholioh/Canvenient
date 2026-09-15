// OverdueTriage — the "clear the deck" ritual for My Day. One full-screen
// monochrome sheet that walks through overdue tasks one at a time: push to
// today, pick a new date, mark done, or skip. Frontend-only — every action
// goes through the existing task PATCH endpoint.

import { useMemo, useState } from "react";
import { updateTask } from "../api";
import { collectOverdue } from "../taskUtils";

export default function OverdueTriage({ token, tasks, onChanged, onClose }) {
  const overdue = useMemo(() => collectOverdue(tasks), [tasks]);
  const [index, setIndex] = useState(0);
  const [dateValue, setDateValue] = useState("");
  const [showDatePick, setShowDatePick] = useState(false);
  const [error, setError] = useState("");

  const current = overdue[index];

  const apply = async (payload) => {
    setError("");
    try {
      await updateTask(token, current.id, payload);
      onChanged?.();
    } catch (updateError) {
      setError(updateError.message || "Could not update this task.");
    }
  };

  if (!current) return null;

  const advance = () => setIndex((value) => value + 1);

  const pushToToday = async () => {
    const endOfToday = new Date();
    endOfToday.setHours(17, 0, 0, 0);
    await apply({ due_at_override: endOfToday.toISOString() });
    advance();
  };

  const markDone = async () => {
    await apply({ status: "done" });
    advance();
  };

  const pickDate = async () => {
    if (!dateValue) return;
    const [year, month, day] = dateValue.split("-").map(Number);
    const chosen = new Date(year, month - 1, day, 17, 0, 0, 0);
    await apply({ due_at_override: chosen.toISOString() });
    setShowDatePick(false);
    setDateValue("");
    advance();
  };

  return (
    <div className="triage-overlay" role="dialog" aria-modal="true" aria-label="Overdue review">
      <div className="triage-card">
        <header className="triage-header">
          <span className="triage-count">
            {Math.min(index + 1, overdue.length)} of {overdue.length}
          </span>
          <button
            type="button"
            className="triage-close"
            onClick={onClose}
            aria-label="Close review"
          >
            Close
          </button>
        </header>

        <p className="triage-due">
          Was due{" "}
          {current._due.toLocaleDateString([], {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}
          {current.module_code ? ` · ${current.module_code}` : ""}
        </p>
        <h2 className="triage-title">{current.title}</h2>

        {error && (
          <p className="triage-error" role="alert">
            {error}
          </p>
        )}

        {showDatePick ? (
          <div className="triage-datepick">
            <input
              type="date"
              value={dateValue}
              onChange={(event) => setDateValue(event.target.value)}
              aria-label="New due date"
              autoFocus
            />
            <button
              type="button"
              className="triage-action is-primary"
              onClick={pickDate}
              disabled={!dateValue}
            >
              Reschedule
            </button>
            <button type="button" className="triage-action" onClick={() => setShowDatePick(false)}>
              Back
            </button>
          </div>
        ) : (
          <div className="triage-actions">
            <button type="button" className="triage-action is-primary" onClick={pushToToday}>
              Today
            </button>
            <button type="button" className="triage-action" onClick={markDone}>
              Done
            </button>
            <button
              type="button"
              className="triage-action"
              onClick={() => {
                setShowDatePick(true);
              }}
            >
              Pick date…
            </button>
            <button type="button" className="triage-action" onClick={advance}>
              Skip
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
