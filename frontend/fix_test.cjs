const fs = require('fs');
let code = fs.readFileSync('src/components/__tests__/TaskView.test.jsx', 'utf8');

code = code.replace(
  /vi\.mock\("\.\.\/TaskInputBar", \(\) => \(\{ default: \(\) => <button type="button">Task date control<\/button> \}\)\);/,
  `vi.mock("../TaskInputBar", () => ({
    default: ({ initialTask, onSubmitTaskEdit, onCancel }) => (
      <div data-testid="task-input-bar">
        <button type="button">Task date control</button>
        <input aria-label="Edit task title" defaultValue={initialTask?.title || ""} />
        <textarea aria-label="Edit task note" defaultValue={initialTask?.description || ""} />
        <button type="button" aria-label="Clear due date and time" onClick={() => onSubmitTaskEdit(initialTask?.id, { due_at_override: null })}>Clear due date and time</button>
        <button type="button" aria-label="Save" onClick={() => onSubmitTaskEdit(initialTask?.id, {
          title: "Revised task",
          description: "Bring the tutorial worksheet.",
          due_at_override: new Date(2026, 8, 15, 14, 30).toISOString(),
          priority_manual: "high",
          module_id: 42,
        })}>Save</button>
      </div>
    )
  }));`
);

// We also need to fix the actual test to just click the "Save" button of our mock
code = code.replace(
  /it\("edits title, note, due date, priority, and module in one save"[\s\S]*?(?=it\("clears an edited due date and time)/,
`it("edits title, note, due date, priority, and module in one save", async () => {
    const onTasksChanged = vi.fn();
    window.addEventListener("canvenient-tasks-changed", onTasksChanged);
    updateTask.mockResolvedValue({
      id: 1,
      title: "Revised task",
      status: "todo",
      created_at: "2026-08-29T10:00:00Z",
      priority_manual: "high",
      due_at_override: "2026-09-15T06:30:00.000Z",
      effective_due_at: "2026-09-15T06:30:00.000Z",
      module_id: 42,
      module_code: "CS2040",
    });
    render(<TaskView token="token" />);
    await screen.findByText("First task");

    fireEvent.click(screen.getByRole("button", { name: "Edit First task" }));
    
    const saveBtn = await screen.findByRole("button", { name: "Save" });
    fireEvent.click(saveBtn);

    await waitFor(() => expect(updateTask).toHaveBeenCalledWith("token", 1, {
      title: "Revised task",
      description: "Bring the tutorial worksheet.",
      due_at_override: new Date(2026, 8, 15, 14, 30).toISOString(),
      priority_manual: "high",
      module_id: 42,
    }));
    expect(await screen.findByText("Revised task")).toBeInTheDocument();
    expect(screen.getByText("CS2040")).toBeInTheDocument();
    window.removeEventListener("canvenient-tasks-changed", onTasksChanged);
  });

  `
);

fs.writeFileSync('src/components/__tests__/TaskView.test.jsx', code);
