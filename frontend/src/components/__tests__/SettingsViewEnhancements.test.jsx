import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsView from "../SettingsView";
import * as api from "../../api";

vi.mock("../../api", () => ({
  applyModulePalette: vi.fn(),
  claimTelegramLink: vi.fn(),
  getAcademicModules: vi.fn().mockResolvedValue([]),
  getModuleColors: vi
    .fn()
    .mockResolvedValue({ active_palette: "balanced", palettes: [], modules: [] }),
  getTelegramLink: vi.fn().mockResolvedValue({ linked: false }),
  unlinkTelegram: vi.fn(),
  updateAcademicModuleSelection: vi.fn(),
  updateModuleColor: vi.fn(),
  updateProfile: vi.fn(),
  validateCanvasToken: vi.fn(),
  getBackups: vi.fn().mockResolvedValue([]),
  restoreBackup: vi.fn(),
}));

describe("SettingsView Enhancements", () => {
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

  it("allows updating profile display name", async () => {
    const user = userEvent.setup();
    const onUpdateUser = vi.fn();

    api.updateProfile.mockResolvedValue({
      id: 1,
      name: "Jordan Lee",
      email: "jordan@example.com",
      canvas_connected: false,
      canvas_token_hint: "",
      theme: "graphite",
    });

    render(
      <SettingsView
        token="test-token"
        user={{
          id: 1,
          name: "Jordan",
          email: "jordan@example.com",
          canvas_connected: false,
          theme: "graphite",
        }}
        onUpdateUser={onUpdateUser}
      />,
    );

    expect(screen.getByLabelText("Email Address")).toHaveValue("jordan@example.com");

    const nameInput = screen.getByLabelText("Display Name");
    expect(nameInput).toHaveValue("Jordan");

    await user.clear(nameInput);
    await user.type(nameInput, "Jordan Lee");

    const saveBtn = screen.getByRole("button", { name: "Save Name" });
    await user.click(saveBtn);

    await waitFor(() => {
      // No canvas_token in the payload: the raw token never round-trips
      // through the client, and an untouched input keeps the stored token.
      expect(api.updateProfile).toHaveBeenCalledWith("test-token", {
        name: "Jordan Lee",
        theme: "graphite",
      });
      expect(screen.getByText("Profile updated.")).toBeInTheDocument();
      expect(onUpdateUser).toHaveBeenCalled();
    });
  });

  it("tests and saves Canvas token with connection feedback", async () => {
    const user = userEvent.setup();
    const onUpdateUser = vi.fn();

    api.validateCanvasToken.mockResolvedValue({ valid: true, name: "NUS Student" });
    api.updateProfile.mockResolvedValue({
      id: 1,
      name: "Jordan",
      canvas_connected: true,
      canvas_token_hint: "•••• -abc",
      theme: "graphite",
    });

    render(
      <SettingsView
        token="test-token"
        user={{
          id: 1,
          name: "Jordan",
          email: "jordan@example.com",
          canvas_connected: false,
          theme: "graphite",
        }}
        onUpdateUser={onUpdateUser}
      />,
    );

    const tokenInput = screen.getByLabelText("Canvas API Token");
    await user.type(tokenInput, "new-token-abc");

    // Click test connection
    const testBtn = screen.getByRole("button", { name: /test/i });
    await user.click(testBtn);

    await waitFor(() => {
      expect(api.validateCanvasToken).toHaveBeenCalledWith("test-token", "new-token-abc");
      expect(screen.getByText(/Canvas token is valid/i)).toBeInTheDocument();
    });

    // Click Save
    const saveBtn = screen.getByRole("button", { name: "Save" });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(api.updateProfile).toHaveBeenCalledWith("test-token", {
        name: "Jordan",
        canvas_token: "new-token-abc",
        theme: "graphite",
      });
      expect(screen.getByText("Canvas token saved.")).toBeInTheDocument();
    });
  });

  it("allows disconnecting Canvas token", async () => {
    const user = userEvent.setup();
    const onUpdateUser = vi.fn();

    api.updateProfile.mockResolvedValue({
      id: 1,
      name: "Jordan",
      canvas_connected: false,
      canvas_token_hint: "",
      theme: "graphite",
    });

    render(
      <SettingsView
        token="test-token"
        user={{
          id: 1,
          name: "Jordan",
          email: "jordan@example.com",
          canvas_connected: true,
          canvas_token_hint: "•••• oken",
          theme: "graphite",
        }}
        onUpdateUser={onUpdateUser}
      />,
    );

    expect(screen.getByText("Connected")).toBeInTheDocument();

    const disconnectBtn = screen.getByRole("button", { name: "Disconnect" });
    await user.click(disconnectBtn);

    await waitFor(() => {
      expect(api.updateProfile).toHaveBeenCalledWith("test-token", {
        name: "Jordan",
        canvas_token: "",
        theme: "graphite",
      });
      expect(screen.getByText("Canvas disconnected.")).toBeInTheDocument();
    });
  });

  it("supports linking Telegram bot and replaying onboarding", async () => {
    const user = userEvent.setup();
    const onReplayOnboarding = vi.fn();

    api.claimTelegramLink.mockResolvedValue({ linked: true, telegram_chat_id: "123456" });

    render(
      <SettingsView
        token="test-token"
        user={{
          id: 1,
          name: "Jordan",
          email: "jordan@example.com",
          canvas_connected: false,
          theme: "graphite",
        }}
        onReplayOnboarding={onReplayOnboarding}
      />,
    );

    const tgInput = screen.getByLabelText("Telegram link code");
    await user.type(tgInput, "TG-CODE-999");

    const connectBtn = screen.getByRole("button", { name: "Connect" });
    await user.click(connectBtn);

    await waitFor(() => {
      expect(api.claimTelegramLink).toHaveBeenCalledWith("test-token", "TG-CODE-999");
      expect(screen.getByText("Telegram connected successfully!")).toBeInTheDocument();
    });

    const replayBtn = screen.getByRole("button", { name: "Replay Setup" });
    await user.click(replayBtn);
    expect(onReplayOnboarding).toHaveBeenCalled();
  });
});
