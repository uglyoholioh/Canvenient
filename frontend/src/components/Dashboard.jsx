import { useState } from "react";
import { BookOpen, CalendarDays, CheckSquare, FileText } from "lucide-react";
import TaskInputBar from "./TaskInputBar";
import CanvasDrawer from "./drawers/CanvasDrawer";
import NoteDrawer from "./drawers/NoteDrawer";
import CanvasModule from "./dashboard/CanvasModule";
import ModuleCard from "./dashboard/ModuleCard";
import NotesModule from "./dashboard/NotesModule";
import ScheduleModule from "./dashboard/ScheduleModule";
import TasksModule from "./dashboard/TasksModule";

function initialCollapsedState() {
  try { return JSON.parse(localStorage.getItem("canvenient-dashboard-collapsed") || "{}"); }
  catch { return {}; }
}

export default function Dashboard({ token, user, onNavigate }) {
  const [collapsed, setCollapsed] = useState(initialCollapsedState);
  const [activeNote, setActiveNote] = useState(null);
  const [activeCanvasItem, setActiveCanvasItem] = useState(null);
  const [taskRefreshKey, setTaskRefreshKey] = useState(0);
  const [noteRefreshKey, setNoteRefreshKey] = useState(0);

  const toggle = (module) => {
    setCollapsed((current) => {
      const next = { ...current, [module]: !current[module] };
      localStorage.setItem("canvenient-dashboard-collapsed", JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="dashboard-page">
      <div className="dashboard-scroll">
        <div className="dashboard-grid">
          <ModuleCard icon={CheckSquare} title="Tasks" collapsed={collapsed.tasks} onToggle={() => toggle("tasks")} onViewFull={() => onNavigate("tasks")}>
            <TasksModule token={token} refreshKey={taskRefreshKey} />
          </ModuleCard>
          <ModuleCard icon={BookOpen} title="Canvas" collapsed={collapsed.canvas} onToggle={() => toggle("canvas")} onViewFull={() => onNavigate("canvas")}>
            <CanvasModule token={token} enabled={Boolean(user?.canvas_token)} onOpenItem={setActiveCanvasItem} />
          </ModuleCard>
          <ModuleCard icon={FileText} title="Notes" collapsed={collapsed.notes} onToggle={() => toggle("notes")} onViewFull={() => onNavigate("notes")}>
            <NotesModule token={token} refreshKey={noteRefreshKey} onOpenNote={setActiveNote} />
          </ModuleCard>
          <ModuleCard icon={CalendarDays} title="Schedule" collapsed={collapsed.schedule} onToggle={() => toggle("schedule")}>
            <ScheduleModule token={token} />
          </ModuleCard>
        </div>
      </div>
      <TaskInputBar token={token} onTaskCreated={() => setTaskRefreshKey((key) => key + 1)} onNoteCreated={(note) => { setNoteRefreshKey((key) => key + 1); setActiveNote(note); }} />
      <NoteDrawer note={activeNote} token={token} onClose={() => setActiveNote(null)} />
      <CanvasDrawer key={activeCanvasItem ? `${activeCanvasItem.itemType}-${activeCanvasItem.course_id}-${activeCanvasItem.id}` : "empty"} item={activeCanvasItem} token={token} onClose={() => setActiveCanvasItem(null)} />
    </div>
  );
}
