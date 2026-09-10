import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SpinWheelView from "../wheel/SpinWheelView";
import * as api from "../../api";

vi.mock("../../api", () => ({
  getAcademicModules: vi.fn(),
  getCanvasCourses: vi.fn(),
}));

describe("SpinWheelView", () => {
  beforeEach(() => {
    // Mock localStorage
    const store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key) => store.get(key) ?? null),
      setItem: vi.fn((key, val) => store.set(key, String(val))),
      removeItem: vi.fn((key) => store.delete(key)),
      clear: vi.fn(() => store.clear()),
    });

    // Mock Canvas 2D context
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      moveTo: vi.fn(),
      closePath: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 50 })),
    }));
  });

  it("renders with Places to Eat in NUS preset by default", () => {
    render(<SpinWheelView token="fake-token" />);

    expect(screen.getByRole("heading", { name: "Spin the Wheel" })).toBeInTheDocument();
    expect(screen.getByText("Places to Eat in NUS")).toBeInTheDocument();
    expect(screen.getByText("The Deck (Arts / FASS)")).toBeInTheDocument();
    expect(screen.getByText("Techno Edge (Engineering)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /CYCLE FLAPS|SPIN WHEEL/i })).toBeInTheDocument();
  });

  it("switches to Modules to Study preset", () => {
    render(<SpinWheelView token="fake-token" />);

    const modulesTab = screen.getByRole("button", { name: /Modules to Study/i });
    fireEvent.click(modulesTab);

    expect(screen.getByText("CS1101S Programming Methodology")).toBeInTheDocument();
    expect(screen.getByText("CS2040S Data Structures & Algorithms")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sync Enrolled Modules/i })).toBeInTheDocument();
  });

  it("allows adding and deleting a custom option", () => {
    render(<SpinWheelView token="fake-token" />);

    const input = screen.getByPlaceholderText("Add custom option...");
    fireEvent.change(input, { target: { value: "Auntie Caifan Stall" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByText("Auntie Caifan Stall")).toBeInTheDocument();

    // Now delete it
    const deleteButtons = screen.getAllByTitle("Remove option");
    fireEvent.click(deleteButtons[0]);

    expect(screen.queryByText("Auntie Caifan Stall")).not.toBeInTheDocument();
  });

  it("allows toggling an option off and on", () => {
    render(<SpinWheelView token="fake-token" />);

    const disableBtn = screen.getAllByTitle("Disable from wheel")[0];
    fireEvent.click(disableBtn);

    // Option should now be marked disabled and toggleable back to enabled
    expect(screen.getByTitle("Enable on wheel")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Enable on wheel"));
    expect(screen.getAllByTitle("Disable from wheel").length).toBeGreaterThan(0);
  });

  it("creates a new custom wheel", () => {
    render(<SpinWheelView token="fake-token" />);

    fireEvent.click(screen.getByRole("button", { name: "New Wheel" }));

    const nameInput = screen.getByPlaceholderText("Wheel name...");
    fireEvent.change(nameInput, { target: { value: "Weekend Activities" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByText("Weekend Activities")).toBeInTheDocument();
    expect(screen.getByText("Option 1")).toBeInTheDocument();
  });

  it("syncs enrolled academic modules from API", async () => {
    api.getAcademicModules.mockResolvedValueOnce([
      { module_code: "CS2103T", name: "Software Engineering" },
      { module_code: "CS2101", name: "Effective Communication" },
    ]);
    api.getCanvasCourses.mockResolvedValueOnce([]);

    render(<SpinWheelView token="fake-token" />);

    fireEvent.click(screen.getByRole("button", { name: /Modules to Study/i }));

    const syncBtn = screen.getByRole("button", { name: /Sync Enrolled Modules/i });
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(screen.getByText(/Synced 2 enrolled modules/i)).toBeInTheDocument();
    });

    expect(screen.getByText("CS2103T Software Engineering")).toBeInTheDocument();
    expect(screen.getByText("CS2101 Effective Communication")).toBeInTheDocument();
  });

  it("has sound off by default and allows toggling sound on and off", () => {
    render(<SpinWheelView token="fake-token" />);

    // Sound should be off by default
    expect(screen.getByText("Sound: Off")).toBeInTheDocument();

    // Toggle on
    const soundBtn = screen.getByRole("button", { name: /Sound: Off/i });
    fireEvent.click(soundBtn);

    expect(screen.getByText("Sound: On")).toBeInTheDocument();
    expect(window.localStorage.setItem).toHaveBeenCalledWith("canvenient-wheel-sound", "true");

    // Toggle off
    fireEvent.click(screen.getByRole("button", { name: /Sound: On/i }));
    expect(screen.getByText("Sound: Off")).toBeInTheDocument();
    expect(window.localStorage.setItem).toHaveBeenCalledWith("canvenient-wheel-sound", "false");
  });
});
