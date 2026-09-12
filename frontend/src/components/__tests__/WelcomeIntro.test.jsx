import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WelcomeIntro from "../WelcomeIntro";

vi.mock("../../api", () => ({
  probeHealth: vi.fn(),
}));

describe("WelcomeIntro", () => {
  let store = {};

  beforeEach(() => {
    vi.clearAllMocks();
    store = {};
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: vi.fn(() => {
          store = {};
        }),
        getItem: vi.fn((key) => store[key] || null),
        setItem: vi.fn((key, val) => {
          store[key] = String(val);
        }),
        removeItem: vi.fn((key) => {
          delete store[key];
        }),
      },
    });
  });

  const renderIntro = (onDone = vi.fn()) => {
    render(<WelcomeIntro user={{ id: 7, name: "", email: "new@test.com" }} onDone={onDone} />);
    return onDone;
  };

  it("shows the app introduction", () => {
    renderIntro();
    expect(screen.getByRole("dialog", { name: /welcome to canvenient/i })).toBeInTheDocument();
    for (const feature of ["Dashboard", "Tasks", "Schedule", "Assistant"]) {
      expect(screen.getByText(feature)).toBeInTheDocument();
    }
  });

  it("marks the intro seen and finishes on Get started", async () => {
    const user = userEvent.setup();
    const onDone = renderIntro();

    await user.click(screen.getByRole("button", { name: /get started/i }));

    expect(store["canvenient_intro_completed_7"]).toBe("true");
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("is skippable via the Skip button", async () => {
    const user = userEvent.setup();
    const onDone = renderIntro();

    await user.click(screen.getByRole("button", { name: /skip intro/i }));

    expect(store["canvenient_intro_completed_7"]).toBe("true");
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("is skippable via Escape", async () => {
    const user = userEvent.setup();
    const onDone = renderIntro();

    await user.keyboard("{Escape}");

    expect(store["canvenient_intro_completed_7"]).toBe("true");
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
