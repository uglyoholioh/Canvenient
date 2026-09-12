// React is required by the test JSX transform.
 
import { useEffect, useRef, useState } from "react";
import { BookOpen, Calendar, ChevronDown, Clock, Flag, Plus, Sparkles, X } from "lucide-react";
import { createNote, createTask, getAcademicModules, parseTaskSmart } from "../api";

function focusProperty(index, scope) {
  scope?.current?.querySelector(`[data-property-index="${index}"]`)?.focus();
}

function handleArrowNav(event, index, scope) {
  if (event.key === "ArrowRight") {
    event.preventDefault();
    focusProperty(index + 1, scope);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    focusProperty(index - 1, scope);
  }
}

function CustomSelect({ value, onChange, options, placeholder, icon: Icon, onEscape, propIndex, propertyScope }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef(null);

  useEffect(() => {
    const close = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const openMenu = () => {
    const index = options.findIndex((option) => option.value === value);
    setActiveIndex(index >= 0 ? index : 0);
    setIsOpen(true);
  };

  const selected = options.find((option) => option.value === value);
  const choose = (option) => {
    onChange(option.value);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="task-property-wrap">
      <button
        type="button"
        className="task-property-pill property-pill"
        data-property-index={propIndex}
        aria-expanded={isOpen}
        onClick={() => { if (isOpen) setIsOpen(false); else openMenu(); }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (isOpen) choose(options[activeIndex]);
            else openMenu();
          } else if (event.key === "Escape") {
            event.preventDefault();
            if (isOpen) setIsOpen(false);
            else onEscape?.();
          } else if (isOpen && event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, options.length - 1));
          } else if (isOpen && event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (!isOpen) {
            handleArrowNav(event, propIndex, propertyScope);
          }
        }}
      >
        <span className="task-property-label">{Icon && <Icon size={12} />}{selected?.label || placeholder}</span>
        <ChevronDown size={12} />
      </button>
      {isOpen && (
        <div className="task-property-menu">
          {options.map((option, index) => (
            <button type="button" key={option.value} className={activeIndex === index ? "is-active" : ""} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option)}>
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DateSelect({ dateType, setDateType, customDate, setCustomDate, onEscape, propertyScope }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef(null);
  const presets = [
    { value: "", label: "No Date" },
    { value: "today", label: "Today" },
    { value: "tomorrow", label: "Tomorrow" },
    { value: "next_week", label: "Next Week" },
  ];

  useEffect(() => {
    const close = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const selected = presets.find((option) => option.value === dateType);
  const label = dateType === "custom" && customDate ? customDate : selected?.value ? selected.label : "Due Date";
  const choose = (value) => {
    setDateType(value);
    setCustomDate("");
    setIsOpen(false);
  };

  const handleKeyDown = (event) => {
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      const raw = `${customDate.replace(/\D/g, "")}${event.key}`.slice(0, 4);
      setCustomDate(raw.length > 2 ? `${raw.slice(0, 2)}/${raw.slice(2)}` : raw);
      setDateType("custom");
      return;
    }
    if (event.key === "Backspace" && (dateType === "custom" || customDate)) {
      event.preventDefault();
      const raw = customDate.replace(/\D/g, "").slice(0, -1);
      setCustomDate(raw.length > 2 ? `${raw.slice(0, 2)}/${raw.slice(2)}` : raw);
      if (!raw) setDateType("");
      return;
    }
    if (!isOpen) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const index = presets.findIndex((option) => option.value === dateType);
        setActiveIndex(index >= 0 ? index : 0);
        setIsOpen(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (customDate) choose("");
        else onEscape();
      } else {
        handleArrowNav(event, 0, propertyScope);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, presets.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (!(dateType === "custom" && customDate)) choose(presets[activeIndex].value);
      else setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="task-property-wrap">
      <button type="button" className="task-property-pill property-pill" data-property-index="0" aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)} onKeyDown={handleKeyDown}>
        <span className="task-property-label"><Calendar size={12} />{label}</span>
        <ChevronDown size={12} />
      </button>
      {isOpen && (
        <div className="task-property-menu task-date-menu">
          <div className="task-date-preview"><span>Type date</span><strong>{customDate || "dd/mm"}</strong></div>
          {presets.map((option, index) => (
            <button type="button" key={option.value} className={activeIndex === index && dateType !== "custom" ? "is-active" : ""} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option.value)}>
              {option.label}{dateType === option.value && <span>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function parseDueDate(dateType, customDate, time) {
  if (!dateType && !time) return null;
  const date = new Date();
  if (dateType === "tomorrow") date.setDate(date.getDate() + 1);
  if (dateType === "next_week") date.setDate(date.getDate() + 7);
  if (dateType === "custom" && customDate) {
    const [day, month] = customDate.split("/").map(Number);
    if (!day || !month || day > 31 || month > 12) throw new Error("Enter a valid date as dd/mm.");
    const now = new Date();
    date.setFullYear(now.getFullYear(), month - 1, day);
    if (date < now && month - 1 < now.getMonth()) date.setFullYear(now.getFullYear() + 1);
  }
  if (time?.includes(":")) {
    const [hours, minutes] = time.split(":").map(Number);
    if (hours > 23 || minutes > 59) throw new Error("Enter a valid time as HH:MM.");
    date.setHours(hours || 0, minutes || 0, 0, 0);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date.toISOString();
}

function normalizedMode(value) {
  return value === "note" ? "note" : "task";
}

export default function TaskInputBar({
  token,
  onTaskCreated,
  onNoteCreated,
  onSubmitTaskEdit,
  initialTask,
  autoFocus = true,
  isOpen = true,
  initialMode,
  onClose,
  showCancel = false,
  variant = "inline",
  allowedModes = ["task", "note"],
  focusRequestScope,
  onEmptyArrowKey,
}) {
  const availableModes = allowedModes.filter((mode) => ["task", "note"].includes(mode));
  const requestedMode = availableModes.includes(normalizedMode(initialMode))
    ? normalizedMode(initialMode)
    : availableModes[0] || "task";
  
  const initialDueDate = initialTask ? new Date(initialTask.effective_due_at || initialTask.due_at_override || initialTask.source_due_at) : null;
  const initialDateStr = initialDueDate && !isNaN(initialDueDate.getTime()) ? `${String(initialDueDate.getDate()).padStart(2, "0")}/${String(initialDueDate.getMonth() + 1).padStart(2, "0")}` : "";
  const initialTimeStr = initialDueDate && !isNaN(initialDueDate.getTime()) && (initialDueDate.getHours() > 0 || initialDueDate.getMinutes() > 0) ? `${String(initialDueDate.getHours()).padStart(2, "0")}:${String(initialDueDate.getMinutes()).padStart(2, "0")}` : "";

  const [modules, setModules] = useState([]);
  const [inputValue, setInputValue] = useState(initialTask?.title || "");
  const [description, setDescription] = useState(initialTask?.description || "");
  const [showTaskNote, setShowTaskNote] = useState(Boolean(initialTask?.description));
  const [inputMode, setInputMode] = useState(initialTask ? "task" : requestedMode);
  const [dateType, setDateType] = useState(initialDateStr ? "custom" : "");
  const [customDate, setCustomDate] = useState(initialDateStr);
  const [time, setTime] = useState(initialTimeStr);
  const [priority, setPriority] = useState(initialTask?.priority_manual || "medium");
  const [moduleId, setModuleId] = useState(initialTask?.module_id ? String(initialTask.module_id) : "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [parseHint, setParseHint] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const textareaRef = useRef(null);
  const noteRef = useRef(null);
  const cardRef = useRef(null);

  useEffect(() => {
    const loadModules = () => getAcademicModules(token).then((data) => setModules((data || []).filter((module) => module.is_selected !== false))).catch(() => setModules([]));
    loadModules();
    window.addEventListener("academic-modules-updated", loadModules);
    return () => window.removeEventListener("academic-modules-updated", loadModules);
  }, [token]);
  useEffect(() => {
    if (!isOpen || !autoFocus) return;
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [autoFocus, isOpen]);
  useEffect(() => {
    // The caller's requested mode is authoritative each time the composer opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOpen) setInputMode(requestedMode);
  }, [isOpen, requestedMode]);
  useEffect(() => {
    if (!focusRequestScope) return undefined;
    const focusInput = () => textareaRef.current?.focus();
    const handleFocusRequest = (event) => {
      if (event.detail?.scope === focusRequestScope) focusInput();
    };
    window.addEventListener("canvenient-focus-task-input", handleFocusRequest);
    return () => window.removeEventListener("canvenient-focus-task-input", handleFocusRequest);
  }, [focusRequestScope]);
  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
  }, [inputValue]);

  const reset = (shouldFocus = true) => {
    setInputValue("");
    setDescription("");
    setShowTaskNote(false);
    setDateType("");
    setCustomDate("");
    setTime("");
    setPriority("medium");
    setModuleId("");
    setError("");
    setParseHint("");
    if (shouldFocus) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  };

  const submit = async () => {
    const title = inputValue.trim();
    if (!title || isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    try {
      if (inputMode === "note") {
        const note = await createNote({ title, content: "" }, token);
        onNoteCreated?.(note);
      } else {
        const payload = { title, description: description.trim(), priority_manual: priority };
        const dueAt = parseDueDate(dateType, customDate, time);
        if (dueAt !== undefined) payload.due_at_override = dueAt;
        if (moduleId !== undefined) payload.module_id = moduleId ? Number(moduleId) : null;
        
        if (initialTask && onSubmitTaskEdit) {
          await onSubmitTaskEdit(initialTask.id, payload);
        } else {
          const task = await createTask(token, payload);
          onTaskCreated?.(task);
        }
      }
      reset();
    } catch (submitError) {
      setError(submitError.message || "Could not add this item.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const smartParse = async () => {
    const text = inputValue.trim();
    if (!text || isParsing || inputMode !== "task") return;
    setIsParsing(true);
    setParseHint("");
    try {
      const parsed = await parseTaskSmart(token, text);
      setInputValue(parsed.title || text);
      if (parsed.due_at) {
        const due = new Date(parsed.due_at);
        if (!isNaN(due.getTime())) {
          setDateType("custom");
          setCustomDate(`${String(due.getDate()).padStart(2, "0")}/${String(due.getMonth() + 1).padStart(2, "0")}`);
          setTime(`${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}`);
        }
      }
      if (parsed.priority) setPriority(parsed.priority);
      setParseHint("Fields filled from your text — check them, then press Enter to add.");
    } catch {
      setParseHint("Smart parse unavailable — press Enter to add as a plain task.");
    } finally {
      setIsParsing(false);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  };

  const handleInputKeyDown = (event) => {
    if (event.key === "Escape" && onClose) {
      event.preventDefault();
      onClose();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === "Enter" && event.shiftKey && !(event.metaKey || event.ctrlKey) && inputMode === "task" && inputValue.trim()) {
      // Smart parse: fill the form from the natural-language input. Plain
      // Enter still submits exactly as before.
      event.preventDefault();
      smartParse();
    } else if ((event.key === "Enter" && !event.shiftKey) || ((event.metaKey || event.ctrlKey) && event.key === "Enter")) {
      event.preventDefault();
      submit();
    } else if (
      (event.key === "ArrowUp" || event.key === "ArrowDown")
      && inputMode === "task"
      && inputValue === ""
      && onEmptyArrowKey
    ) {
      event.preventDefault();
      onEmptyArrowKey(event.key);
    } else if ((event.key === "ArrowRight" || event.key === "ArrowDown") && inputMode === "task" && textareaRef.current?.selectionEnd === inputValue.length) {
      event.preventDefault();
      focusProperty(0, cardRef);
    }
  };

  const handleTimeChange = (event) => {
    const raw = event.target.value.replace(/\D/g, "").slice(0, 4);
    const formatted = raw.length > 2 ? `${raw.slice(0, 2)}:${raw.slice(2)}` : raw;
    setTime(formatted);
    if (formatted && !dateType) {
      setDateType("today");
    }
    if (error) setError("");
  };

  return (
    <div
      className={`task-input-shell is-${variant} ${isOpen ? "is-open" : "is-closed"}`}
      aria-hidden={!isOpen}
      inert={isOpen ? undefined : true}
    >
      <div ref={cardRef} className="task-input-card" role={variant === "dock" ? "dialog" : undefined} aria-modal={variant === "dock" ? false : undefined} aria-label={variant === "dock" ? "Quick capture" : undefined}>
        {variant === "dock" && (
          <header className="quick-capture-header">
            <div>
              <strong>Quick capture</strong>
              <span>Stays open after you add an item</span>
            </div>
            <button type="button" onClick={onClose} aria-label="Close quick capture"><X size={14} /></button>
          </header>
        )}
        {availableModes.length > 1 && <div className="task-mode-switcher" role="tablist" aria-label="Capture type">
          {availableModes.map((modeId) => (
            <button
              type="button"
              key={modeId}
              role="tab"
              aria-selected={inputMode === modeId}
              tabIndex={inputMode === modeId ? 0 : -1}
              className={inputMode === modeId ? "is-active" : ""}
              onClick={() => setInputMode(modeId)}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
                event.preventDefault();
                const currentIndex = availableModes.indexOf(inputMode);
                const direction = event.key === "ArrowRight" ? 1 : -1;
                setInputMode(availableModes[(currentIndex + direction + availableModes.length) % availableModes.length]);
                requestAnimationFrame(() => event.currentTarget.parentElement?.querySelector("[aria-selected='true']")?.focus());
              }}
            >{modeId === "task" ? "Task" : "Note"}</button>
          ))}
        </div>}
        {error && <div className="task-input-error">{error}</div>}
        {parseHint && <div className="task-input-hint"><Sparkles size={11} /> {parseHint}</div>}
        <div className="task-input-main">
          {availableModes.length > 1 && <span className={`task-mode-badge is-${inputMode}`}>{inputMode.toUpperCase()}</span>}
          <textarea
            ref={textareaRef}
            value={inputValue}
            rows={1}
            maxLength={160}
            onChange={(event) => { setInputValue(event.target.value); if (error) setError(""); if (parseHint) setParseHint(""); }}
            onKeyDown={handleInputKeyDown}
            placeholder={inputMode === "task" ? "Short task title..." : "Capture a note title..."}
          />
        </div>
        {inputMode === "task" && (
          <>
            {showTaskNote && (
              <textarea
                ref={noteRef}
                className="task-input-note"
                aria-label="Task note"
                value={description}
                maxLength={4000}
                rows={2}
                onChange={(event) => { setDescription(event.target.value); if (error) setError(""); }}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    submit();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    if (onClose) onClose();
                    else textareaRef.current?.focus();
                  }
                }}
                placeholder="Add details or a note (optional)"
              />
            )}
            <div className="task-properties">
            <DateSelect dateType={dateType} setDateType={setDateType} customDate={customDate} setCustomDate={setCustomDate} onEscape={() => textareaRef.current?.focus()} propertyScope={cardRef} />
            <div className="task-time-pill property-pill">
              <Clock size={12} />
              <input data-property-index="1" value={time} onChange={handleTimeChange} onKeyDown={(event) => {
                if (event.key === "Escape") { event.preventDefault(); if (onClose) onClose(); else textareaRef.current?.focus(); }
                else if (event.key === "Enter" || ((event.metaKey || event.ctrlKey) && event.key === "Enter")) { event.preventDefault(); submit(); }
                else if (event.key === "ArrowRight" && (!time || event.currentTarget.selectionEnd === time.length)) handleArrowNav(event, 1, cardRef);
                else if (event.key === "ArrowLeft" && (!time || event.currentTarget.selectionStart === 0)) handleArrowNav(event, 1, cardRef);
              }} aria-label="Task time (24-hour HH:MM)" placeholder="24-hour HH:MM" />
            </div>
            <CustomSelect icon={Flag} value={priority} onChange={setPriority} onEscape={() => textareaRef.current?.focus()} propIndex={2} propertyScope={cardRef} placeholder="Priority" options={[
              { value: "low", label: "Low Priority" }, { value: "medium", label: "Med Priority" }, { value: "high", label: "High Priority" }, { value: "urgent", label: "Urgent" },
            ]} />
            <CustomSelect icon={BookOpen} value={moduleId} onChange={setModuleId} onEscape={() => textareaRef.current?.focus()} propIndex={3} propertyScope={cardRef} placeholder="Module" options={[
              { value: "", label: "No Module" }, ...modules.map((module) => ({ value: String(module.id), label: module.module_code })),
            ]} />
            {!showTaskNote && <button type="button" data-property-index="4" className="task-note-toggle" onClick={() => {
              setShowTaskNote(true);
              requestAnimationFrame(() => noteRef.current?.focus());
            }} onKeyDown={(event) => handleArrowNav(event, 4, cardRef)}>Add note</button>}
            {(showCancel || onClose) && variant !== "dock" && (
              <button
                type="button"
                className="task-cancel-button"
                onClick={() => {
                  reset(false);
                  onClose?.();
                }}
              >
                Cancel
              </button>
            )}
            <button type="button" data-property-index={showTaskNote ? "4" : "5"} className="task-add-button property-pill" disabled={!inputValue.trim() || isSubmitting} onClick={submit} onKeyDown={(event) => {
              if (event.key === "Escape") { if (onClose) onClose(); else textareaRef.current?.focus(); }
              else if (event.key === "Enter") submit();
              else handleArrowNav(event, showTaskNote ? 4 : 5, cardRef);
            }}><Plus size={14} />{isSubmitting ? (initialTask ? "Saving..." : "Adding...") : (initialTask ? "Save" : "Add")}</button>
            </div>
          </>
        )}
        {inputMode === "note" && (
          <div className="task-properties is-note-mode">
            {(showCancel || onClose) && variant !== "dock" && (
              <button
                type="button"
                className="task-cancel-button"
                onClick={() => {
                  reset(false);
                  onClose?.();
                }}
              >
                Cancel
              </button>
            )}
            <button type="button" className="task-add-button property-pill" disabled={!inputValue.trim() || isSubmitting} onClick={submit}><Plus size={14} />{isSubmitting ? "Adding..." : "Add note"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
