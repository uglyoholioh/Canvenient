// CheatSheet — the full keyboard map, one overlay. ⌘/ toggles it.

import { useEffect } from "react";
import { formatShortcut } from "../keyboardShortcuts";

export default function CheatSheet({ shortcuts, onClose }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" || e.key === "/") {
        if (e.key === "/" && !(e.metaKey || e.ctrlKey)) return;
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const groups = [
    {
      title: "Everyday",
      items: [
        ["Search anywhere", formatShortcut(shortcuts.search)],
        ["Capture a task", formatShortcut(shortcuts.quickTask)],
        ["Capture a note", formatShortcut(shortcuts.quickNote)],
        ["Assistant", formatShortcut(shortcuts.assistant)],
        ["Tasks panel", formatShortcut(shortcuts.tasksPanel)],
        ["This list", "⌘/"],
      ],
    },
    {
      title: "Moving around",
      items: [
        ["Today", "⌘1"],
        ["Tasks", "⌘2"],
        ["Schedule", "⌘3"],
        ["Campus", "⌘4"],
        ["Modules", "⌘5"],
        ["Notes", "⌘6"],
      ],
    },
    {
      title: "Workspace",
      items: [
        ["Import a timetable", "⌘O"],
        ["Settings", "⌘,"],
        ["Toggle sidebar", "⌘\\"],
        ["Close / dismiss", "esc"],
      ],
    },
  ];

  return (
    <div
      className="ins-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="ins-sheet ins-cheatsheet"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <header className="ins-cheatsheet-head">
          <h2 className="ins-title">Keyboard</h2>
          <kbd className="ins-kbd">esc</kbd>
        </header>
        <div className="ins-cheatsheet-grid">
          {groups.map((group) => (
            <div key={group.title} className="ins-cheatsheet-col">
              <h3 className="ins-cap">{group.title}</h3>
              <dl>
                {group.items.map(([label, keys]) => (
                  <div key={label} className="ins-cheatsheet-row">
                    <dt>{label}</dt>
                    <dd>
                      <kbd className="ins-kbd">{keys}</kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
