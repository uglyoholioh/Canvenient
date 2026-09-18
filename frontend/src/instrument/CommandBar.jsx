// CommandBar — the one search surface. Jumps across the workspace, the
// notes/tasks/Canvas corpus, capture, appearance, and escalation to the
// assistant. Keyboard-first: ↑↓ move, ↵ runs, Esc closes.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  House,
  ListTodo,
  CalendarDays,
  MapPin,
  BookOpen,
  FileText,
  Dices,
  Users,
  Settings,
  Plus,
  Search,
  Moon,
  Monitor,
  FileDown,
  Keyboard,
  Sparkles,
  StickyNote,
  CheckSquare,
} from "lucide-react";
import { loadCorpus } from "../omnibarCorpus";
import { getThemePreference, setThemePreference } from "./theme";
import { formatShortcut } from "../keyboardShortcuts";

const VIEWS = [
  { id: "dashboard", label: "Home", icon: House },
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "venues", label: "Campus", icon: MapPin },
  { id: "canvas", label: "Modules", icon: BookOpen },
  { id: "notes", label: "Notes", icon: FileText },
  { id: "wheel", label: "Decide", icon: Dices },
  { id: "groups", label: "Groups", icon: Users },
  { id: "settings", label: "Settings", icon: Settings },
];

function score(query, text) {
  if (!text) return 0;
  const hay = text.toLowerCase();
  const needle = query.toLowerCase();
  if (hay === needle) return 100;
  if (hay.startsWith(needle)) return 80;
  const idx = hay.indexOf(needle);
  if (idx >= 0) return 60 - Math.min(idx, 30);
  // loose subsequence
  let at = 0;
  for (const char of needle) {
    at = hay.indexOf(char, at);
    if (at < 0) return -1;
    at += 1;
  }
  return 10;
}

export default function CommandBar({ token, onClose, onNavigate, onCommand }) {
  const [query, setQuery] = useState("");
  const [corpus, setCorpus] = useState(null);
  const [hotIndex, setHotIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let alive = true;
    loadCorpus(token)
      .then((data) => {
        if (alive) setCorpus(data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token]);

  const commands = useMemo(() => {
    const themePref = getThemePreference();
    return [
      {
        key: "cmd-capture-task",
        group: "Capture",
        label: "Capture a task",
        icon: Plus,
        hint: "⌘N",
        run: () => onCommand?.("quick-task"),
      },
      {
        key: "cmd-capture-note",
        group: "Capture",
        label: "Capture a note",
        icon: FileText,
        hint: "⇧⌘N",
        run: () => onCommand?.("quick-note"),
      },
      {
        key: "cmd-triage",
        group: "Capture",
        label: "Triage tasks and posts",
        icon: CheckSquare,
        run: () => onCommand?.("triage"),
      },
      {
        key: "cmd-import",
        group: "Capture",
        label: "Import a timetable",
        icon: FileDown,
        hint: "⌘O",
        run: () => {
          window.dispatchEvent(new CustomEvent("canvenient-open-schedule-import"));
          onNavigate?.("view", { view: "schedule" });
        },
      },
      {
        key: "cmd-theme-dark",
        group: "Appearance",
        label: "Appearance — Graphite (dark)",
        icon: Moon,
        active: themePref !== "instrument-light",
        run: () => setThemePreference("instrument-dark"),
      },
      {
        key: "cmd-theme-light",
        group: "Appearance",
        label: "Appearance — Paper (light)",
        icon: Monitor,
        active: themePref === "instrument-light",
        run: () => setThemePreference("instrument-light"),
      },
      {
        key: "cmd-cheatsheet",
        group: "Appearance",
        label: "Keyboard shortcuts",
        icon: Keyboard,
        hint: "⌘/",
        run: () => onCommand?.("cheat-sheet"),
      },
    ];
  }, [onCommand, onNavigate]);

  const results = useMemo(() => {
    const q = query.trim();
    const out = [];

    const pushResult = (group, item) => out.push({ group, ...item });

    if (!q) {
      VIEWS.forEach((view) =>
        pushResult("Go to", {
          key: `view-${view.id}`,
          label: view.label,
          icon: view.icon,
          run: () => onNavigate?.("view", { view: view.id }),
        }),
      );
      commands.forEach((cmd) =>
        pushResult(cmd.group, {
          key: cmd.key,
          label: cmd.label,
          icon: cmd.icon,
          hint: cmd.hint,
          active: cmd.active,
          run: cmd.run,
        }),
      );
      return out;
    }

    VIEWS.forEach((view) => {
      const s = score(q, view.label);
      if (s > 0)
        pushResult("Go to", {
          key: `view-${view.id}`,
          label: view.label,
          icon: view.icon,
          order: s,
          run: () => onNavigate?.("view", { view: view.id }),
        });
    });
    commands.forEach((cmd) => {
      const s = score(q, cmd.label);
      if (s > 0)
        pushResult(cmd.group, {
          key: cmd.key,
          label: cmd.label,
          icon: cmd.icon,
          hint: cmd.hint,
          order: s,
          run: cmd.run,
        });
    });

    if (corpus) {
      (corpus.notes || []).forEach((note) => {
        const s = Math.max(score(q, note.title), score(q, (note.content || "").slice(0, 400)) - 10);
        if (s > 0)
          pushResult("Notes", {
            key: `note-${note.id}`,
            label: note.title || "Untitled",
            icon: StickyNote,
            order: s,
            run: () => onNavigate?.("note", note),
          });
      });
      (corpus.tasks || []).forEach((task) => {
        const s = score(q, task.title);
        if (s > 0)
          pushResult("Tasks", {
            key: `task-${task.id}`,
            label: task.title,
            icon: CheckSquare,
            order: s,
            run: () => onNavigate?.("task", task),
          });
      });
      (corpus.canvas?.courses || []).forEach((course) => {
        const s = Math.max(score(q, course.name), score(q, course.course_code));
        if (s > 0)
          pushResult("Modules", {
            key: `course-${course.id}`,
            label: course.name,
            icon: BookOpen,
            order: s,
            run: () =>
              onNavigate?.("canvas_resource", {
                type: "course",
                id: course.id,
                title: course.name,
              }),
          });
      });
      (corpus.canvas?.assignments || []).forEach((assignment) => {
        const s = score(q, assignment.title);
        if (s > 0)
          pushResult("Modules", {
            key: `asg-${assignment.id}`,
            label: assignment.title,
            icon: BookOpen,
            order: s,
            run: () =>
              onNavigate?.("canvas_resource", {
                type: "canvas_resource",
                itemType: "assignment",
                id: assignment.id,
                title: assignment.title,
              }),
          });
      });
      (corpus.canvas?.files || []).forEach((file) => {
        const s = score(q, file.title);
        if (s > 0)
          pushResult("Files", {
            key: `file-${file.id}`,
            label: file.title,
            icon: FileText,
            order: s,
            run: () =>
              onNavigate?.("canvas_resource", {
                type: "canvas_resource",
                itemType: "file",
                id: file.id,
                title: file.title,
              }),
          });
      });
    }

    // Ask the assistant — always available as the last resort.
    pushResult("Assistant", {
      key: "ai-escalation",
      label: `Ask the assistant: “${q}”`,
      icon: Sparkles,
      order: -1,
      run: () => onNavigate?.("ai", { title: q }),
    });

    out.sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
    return out;
  }, [query, corpus, commands, onNavigate]);

  useEffect(() => {
    setHotIndex(0);
  }, [query]);

  useEffect(() => {
    const hot = listRef.current?.querySelector(".is-hot");
    hot?.scrollIntoView({ block: "nearest" });
  }, [hotIndex]);

  const runHot = () => {
    const item = results[hotIndex];
    if (!item) return;
    item.run();
    if (!["cmd-theme-dark", "cmd-theme-light"].includes(item.key)) onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHotIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHotIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runHot();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup = null;

  return (
    <div
      className="ins-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="ins-commandbar"
        role="dialog"
        aria-modal="true"
        aria-label="Search and commands"
      >
        <div className="ins-commandbar-field">
          <Search size={15} strokeWidth={1.8} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search or type a command"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
          />
          <kbd className="ins-kbd">esc</kbd>
        </div>
        <div className="ins-commandbar-list" ref={listRef}>
          {results.length === 0 && <div className="ins-empty">No matches for “{query}”</div>}
          {results.map((item, index) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            const Icon = item.icon;
            return (
              <div key={item.key}>
                {header && <div className="ins-commandbar-group">{header}</div>}
                <button
                  type="button"
                  className={`ins-commandbar-row ${index === hotIndex ? "is-hot" : ""}`}
                  onMouseMove={() => setHotIndex(index)}
                  onClick={() => {
                    item.run();
                    if (!["cmd-theme-dark", "cmd-theme-light"].includes(item.key)) onClose();
                  }}
                >
                  <Icon size={15} strokeWidth={1.8} />
                  <span className="ins-commandbar-label">{item.label}</span>
                  {item.active && <span className="ins-tag">on</span>}
                  {item.hint && <kbd className="ins-kbd">{item.hint}</kbd>}
                </button>
              </div>
            );
          })}
        </div>
        <footer className="ins-commandbar-foot">
          <span>
            <kbd className="ins-kbd">↑↓</kbd> move
          </span>
          <span>
            <kbd className="ins-kbd">↵</kbd> run
          </span>
          <span>
            {formatShortcut("Meta+K")} search · {formatShortcut("Meta+/")} shortcuts
          </span>
        </footer>
      </section>
    </div>
  );
}
