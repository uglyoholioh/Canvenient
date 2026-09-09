import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OnboardingModal from "../OnboardingModal";
import * as api from "../../api";

vi.mock("../../api", () => ({
  updateProfile: vi.fn(),
  validateCanvasToken: vi.fn(),
}));

describe("OnboardingModal", () => {
  let store = {};

  beforeEach(() => {
    vi.clearAllMocks();
    store = {};
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: vi.fn(() => { store = {}; }),
        getItem: vi.fn((key) => store[key] || null),
        setItem: vi.fn((key, val) => { store[key] = String(val); }),
        removeItem: vi.fn((key) => { delete store[key]; }),
      },
    });
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <OnboardingModal
        token="test-token"
        user={{ id: 1, name: "", email: "user@test.com" }}
        isOpen={false}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("walks through the 4 steps: Name, Canvas, Appearance, Finish", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const onClose = vi.fn();

    api.validateCanvasToken.mockResolvedValue({ valid: true, name: "Canvas Student" });
    api.updateProfile.mockResolvedValue({
      id: 1,
      name: "Alex Tan",
      canvas_token: "canvas-token-123",
      theme: "dusk",
    });

    render(
      <OnboardingModal
        token="auth-token"
        user={{ id: 1, name: "", email: "alex@example.com" }}
        isOpen={true}
        onComplete={onComplete}
        onClose={onClose}
      />
    );

    // Step 1: Identity
    expect(screen.getByText("Welcome to Canvenient")).toBeInTheDocument();
    const continueBtn = screen.getByRole("button", { name: /continue/i });
    expect(continueBtn).toBeDisabled();

    const nameInput = screen.getByLabelText(/your name/i);
    await user.type(nameInput, "Alex Tan");
    expect(continueBtn).not.toBeDisabled();
    await user.click(continueBtn);

    // Step 2: Canvas LMS
    expect(screen.getByText("Canvas LMS API Key")).toBeInTheDocument();
    const canvasInput = screen.getByPlaceholderText(/paste token here/i);
    await user.type(canvasInput, "canvas-token-123");

    const testBtn = screen.getByRole("button", { name: /test/i });
    await user.click(testBtn);

    await waitFor(() => {
      expect(screen.getByText(/connected to canvas: Canvas Student/i)).toBeInTheDocument();
    });

    const step2Continue = screen.getByRole("button", { name: /continue/i });
    await user.click(step2Continue);

    // Step 3: Appearance
    expect(screen.getByText("Workspace Appearance")).toBeInTheDocument();
    const duskThemeBtn = screen.getByRole("radio", { name: /dusk/i });
    await user.click(duskThemeBtn);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dusk");

    const step3Continue = screen.getByRole("button", { name: /continue/i });
    await user.click(step3Continue);

    // Step 4: Summary & Enter Workspace
    expect(screen.getByText("Workspace Ready")).toBeInTheDocument();
    expect(screen.getByText("Alex Tan")).toBeInTheDocument();

    const enterBtn = screen.getByRole("button", { name: /enter workspace/i });
    await user.click(enterBtn);

    await waitFor(() => {
      expect(api.updateProfile).toHaveBeenCalledWith("auth-token", {
        name: "Alex Tan",
        canvas_token: "canvas-token-123",
        theme: "dusk",
      });
      expect(onComplete).toHaveBeenCalled();
      expect(store["canvenient_onboarding_completed_1"]).toBe("true");
    });
  });

  it("allows skipping Canvas token in step 2", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    api.updateProfile.mockResolvedValue({
      id: 2,
      name: "Jamie",
      canvas_connected: false,
      canvas_token_hint: "",
      theme: "graphite",
    });

    render(
      <OnboardingModal
        token="auth-token"
        user={{ id: 2, name: "Jamie", email: "jamie@example.com" }}
        isOpen={true}
        onComplete={onComplete}
      />
    );

    // Already has name, click continue
    await user.click(screen.getByRole("button", { name: /continue/i }));

    // Step 2: Skip for now button should exist
    const skipBtn = screen.getByRole("button", { name: /skip for now/i });
    await user.click(skipBtn);

    // Now in Step 3
    expect(screen.getByText("Workspace Appearance")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /continue/i }));

    // Step 4: Canvas should show Not configured
    expect(screen.getByText("Not configured")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /enter workspace/i }));

    await waitFor(() => {
      // Skipping the Canvas step omits canvas_token so an existing
      // connection is preserved rather than wiped.
      expect(api.updateProfile).toHaveBeenCalledWith("auth-token", {
        name: "Jamie",
        theme: expect.any(String),
      });
    });
  });
});
