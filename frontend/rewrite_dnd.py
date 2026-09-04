import re

with open("src/components/TaskManagerDashboard.jsx", "r") as f:
    content = f.read()

# Add imports
imports = """import { DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, defaultDropAnimationSideEffects } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
"""
content = content.replace('import { useEffect, useState } from "react";', 'import { useEffect, useState, useMemo } from "react";\n' + imports)

# We need a DraggableTaskCard component
draggable_comp = """
function DraggableTaskCard({ task, academicModules, isDragging, onStatusChange, onDelete, busyKey, currentTime }) {
  const { attributes, listeners, setNodeRef, transform, isDragging: isDndDragging } = useDraggable({
    id: String(task.id),
    data: { task },
    disabled: busyKey !== "",
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDndDragging ? 0.4 : 1,
    zIndex: isDndDragging ? 999 : "auto",
    position: isDndDragging ? "relative" : "static",
  };

  const taskModuleColor = getTaskModuleColor(task, academicModules);

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`card--draggable card--status-${task.status === "in_progress" ? "progress" : task.status} ${
        isDragging || isDndDragging ? "is-dragging" : ""
      } ${taskModuleColor ? "has-module" : ""}`}
      style={{ ...(taskModuleColor ? { "--task-module-color": taskModuleColor } : {}), ...style }}
    >
      {taskModuleColor && (
        <span
          className="task-module-strip"
          aria-hidden="true"
          style={{ backgroundColor: taskModuleColor }}
        />
      )}
      <div className="flex justify-between items-start gap-lg">
        <div>
          <p
            style={{
              margin: "0 0 10px",
              padding: "4px 8px",
              backgroundColor: "var(--surface-warm)",
              borderLeft: taskModuleColor ? `3px solid ${taskModuleColor}` : "none",
              borderRadius: "var(--radius-pill)",
              display: "inline-block",
              fontSize: "12px",
              color: "var(--text-muted)",
            }}
          >
            {task.module_code || "No module"}
            {task.category_name ? ` - ${task.category_name}` : ""}
          </p>
          <h3 className="text-h" style={{ fontSize: "18px" }}>
            {task.title}
          </h3>
        </div>

        {task.source_type !== "canvas" && (
          <button
            className="btn btn--ghost-danger btn--sm"
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
            disabled={busyKey === `task-delete-${task.id}`}
          >
            Delete
          </button>
        )}
      </div>

      <div className="flex gap-md flex-wrap">
        <span className="text-xs text-muted">
          Source: <strong className="text-h">{task.source_type}</strong>
        </span>
        <span className="text-xs text-muted">
          Due:{" "}
          <strong
            className={
              isPastDue(task, currentTime) && task.status !== "done"
                ? "text-error"
                : "text-h"
            }
          >
            {formatDueDate(task.effective_due_at)}
          </strong>
        </span>
        <span className="text-xs text-muted">
          Suggested: <strong className="text-h">{task.recommended_priority}</strong>
        </span>
      </div>

      {task.external_url && (
        <a
          className="text-info no-underline text-sm"
          style={{ fontWeight: "700" }}
          href={task.external_url}
          target="_blank"
          rel="noreferrer"
          onPointerDown={(e) => e.stopPropagation()}
        >
          Open in Canvas
        </a>
      )}

      <div style={{ marginTop: "10px" }}>
        <label className="form-group task-status-control" onPointerDown={(e) => e.stopPropagation()}>
          <span>Status</span>
          <select
            className={`form-input text-xs themed-select task-status-select status-${task.status}`}
            value={task.status}
            onChange={(event) => onStatusChange(task.id, event.target.value)}
            disabled={busyKey === `task-status-${task.id}`}
          >
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
          </select>
        </label>
      </div>
    </article>
  );
}

function DroppableLane({ lane, count, children, isOver }) {
  const { setNodeRef } = useDroppable({
    id: lane.value,
  });

  return (
    <section
      ref={setNodeRef}
      className={`planner-column ${isOver ? "planner-column--dragover" : ""}`}
    >
      <div className="planner-column-header">
        <h3>{lane.label}</h3>
        <span>{count}</span>
      </div>
      <div className="list">
        {children}
      </div>
    </section>
  );
}
"""

content = content.replace("function TaskManagerDashboard", draggable_comp + "\nfunction TaskManagerDashboard")

# Add sensors to TaskManagerDashboard
sensors_code = """
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const [activeId, setActiveId] = useState(null);
  const activeTask = useMemo(() => tasks.find((t) => String(t.id) === activeId), [activeId, tasks]);

  function handleDragStart(event) {
    setActiveId(event.active.id);
  }

  function handleDragEnd(event) {
    setActiveId(null);
    const { active, over } = event;
    if (over && over.id) {
      const priorityValue = String(over.id);
      const taskId = Number.parseInt(active.id, 10);
      const task = tasks.find((t) => t.id === taskId);
      if (task && task.priority_manual !== priorityValue) {
        handleTaskPriorityChange(taskId, priorityValue);
      }
    }
  }

  function handleDragCancel() {
    setActiveId(null);
  }
"""
content = content.replace("const [draggedTaskId, setDraggedTaskId] = useState(\"\");\n  const [dragOverPriority, setDragOverPriority] = useState(\"\");", sensors_code)

# Replace planner-board JSX
board_start = content.find('<div className="planner-board">')
board_end = content.find('</section>\n    </main>')
if board_start != -1 and board_end != -1:
    new_board = """
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="planner-board">
              {priorityLanes.map((lane) => (
                <DroppableLane
                  key={lane.value}
                  lane={lane}
                  count={visibleTasksByPriority[lane.value].length}
                  isOver={false}
                >
                  {visibleTasksByPriority[lane.value].length === 0 ? (
                    <p
                      className="text-sm text-muted text-center"
                      style={{ fontStyle: "italic", padding: "10px 0" }}
                    >
                      Drop tasks here.
                    </p>
                  ) : (
                    visibleTasksByPriority[lane.value].map((task) => (
                      <DraggableTaskCard
                        key={task.id}
                        task={task}
                        academicModules={academicModules}
                        isDragging={false}
                        onStatusChange={handleTaskStatusChange}
                        onDelete={handleDeleteTask}
                        busyKey={busyKey}
                        currentTime={currentTime}
                      />
                    ))
                  )}
                </DroppableLane>
              ))}
            </div>
            <DragOverlay dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.4" } } }) }}>
              {activeTask ? (
                <DraggableTaskCard
                  task={activeTask}
                  academicModules={academicModules}
                  isDragging={true}
                  onStatusChange={() => {}}
                  onDelete={() => {}}
                  busyKey={busyKey}
                  currentTime={currentTime}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
"""
    content = content[:board_start] + new_board + content[board_end:]

# Remove old drag handlers to clean up
content = re.sub(r'  function handleTaskDragStart.*?  }\n', '', content, flags=re.DOTALL)
content = re.sub(r'  function handleTaskDragEnd.*?  }\n', '', content, flags=re.DOTALL)
content = re.sub(r'  async function handlePriorityDrop.*?  }\n', '', content, flags=re.DOTALL)

with open("src/components/TaskManagerDashboard.jsx", "w") as f:
    f.write(content)

print("TaskManagerDashboard.jsx rewritten successfully.")
