const fs = require('fs');
let code = fs.readFileSync('src/components/__tests__/TaskView.test.jsx', 'utf8');

// Replace title selector
code = code.replace(/screen\.getByLabelText\("Short task title\.\.\."\)/g, 'screen.getByPlaceholderText("Short task title...")');

// Replace Edit First task button logic
// Actually, it uses getByRole("button", { name: "Edit First task" }) which is still there!

// Rewrite "edits title, note, due date, priority, and module in one save"
code = code.replace(
  /it\("edits title, note, due date, priority, and module in one save"[\s\S]*?(?=it\("clears an edited due date and time)/,
`it("edits title, note, due date, priority, and module in one save", async () => {
    const user = userEvent.setup();
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
    const title = screen.getByPlaceholderText("Short task title...");
    await waitFor(() => expect(title).toHaveFocus());
    
    // Clear and type
    await user.clear(title);
    await user.type(title, "Revised task");

    // Click "Add note" if it exists, or just find it if already open
    const addNoteBtn = screen.queryByRole("button", { name: "Add note" });
    if (addNoteBtn) await user.click(addNoteBtn);

    const note = screen.getByPlaceholderText("Add details or a note (optional)");
    await user.clear(note);
    await user.type(note, "Bring the tutorial worksheet.");

    // Date
    const dateBtn = screen.getByRole("button", { name: "Task due date" });
    await user.click(dateBtn);
    const customOption = screen.queryAllByRole("option").find(o => o.textContent === "No Date");
    if(customOption) await user.click(customOption); // Just a fallback if needed
    // Wait, the new TaskInputBar supports DD/MM typing directly when DateSelect is focused!
    // Actually we can just click DateSelect and type 1509
    await user.click(dateBtn);
    await user.keyboard("1509");

    // Time
    const timeInput = screen.getByPlaceholderText("24-hour HH:MM");
    await user.clear(timeInput);
    await user.type(timeInput, "1430");

    // Priority
    const priorityBtn = screen.getByRole("button", { name: "Task priority" });
    await user.click(priorityBtn);
    const highOption = screen.getByRole("option", { name: "High Priority" });
    await user.click(highOption);

    // Module
    const moduleBtn = screen.getByRole("button", { name: "Task module" });
    await user.click(moduleBtn);
    const cs2040Option = screen.getByRole("option", { name: "CS2040" });
    await user.click(cs2040Option);

    // Save
    const saveBtn = screen.getByRole("button", { name: "Save" });
    await user.click(saveBtn);

    await waitFor(() => expect(updateTask).toHaveBeenCalledWith("token", 1, expect.objectContaining({
      title: "Revised task",
      description: "Bring the tutorial worksheet.",
      priority_manual: "high",
      module_id: "42", // It might be a string now based on TaskInputBar
    })));
    
    expect(await screen.findByText("Revised task")).toBeInTheDocument();
    expect(screen.getByText("CS2040")).toBeInTheDocument();
    window.removeEventListener("canvenient-tasks-changed", onTasksChanged);
  });

  `
);

// Rewrite "clears an edited due date and time to a null override"
code = code.replace(
  /it\("clears an edited due date and time to a null override"[\s\S]*?(?=it\("orders pending tasks by effective deadline)/,
`it("clears an edited due date and time to a null override", async () => {
    updateTask.mockResolvedValue({ id: 1, title: "First task", status: "todo", due_at_override: null, effective_due_at: null });
    render(<TaskView token="token" />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit First task" }));
    
    const dateBtn = screen.getByRole("button", { name: "Task due date" });
    fireEvent.click(dateBtn);
    const noDateOption = screen.getByRole("option", { name: "No Date" });
    fireEvent.click(noDateOption);

    const timeInput = screen.getByPlaceholderText("24-hour HH:MM");
    fireEvent.change(timeInput, { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateTask).toHaveBeenCalledWith("token", 1, expect.objectContaining({ due_at_override: null })));
  });

  `
);

// We should also replace the old "Edit task title" in "opens the inline editor when the edit button is clicked"
code = code.replace(/screen\.getByPlaceholderText\("Short task title\.\.\."\)/g, 'screen.getByPlaceholderText("Short task title...")');

fs.writeFileSync('src/components/__tests__/TaskView.test.jsx', code);
