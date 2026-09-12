import { describe, it, expect, vi, afterEach } from "vitest";
import { createTask, login, register, importIcs, updateProfile } from "../api";

describe("api.js error handling", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("handles empty response with application/json header without throwing SyntaxError", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([["content-type", "application/json"]]),
      json: () => Promise.reject(new SyntaxError("Unexpected end of JSON input")),
    });

    await expect(login({ email: "test@nus.edu", password: "password" })).rejects.toThrow(
      "Server returned an empty or invalid JSON response.",
    );
  });

  it("handles 502 HTML error page from proxy or gateway", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: new Map([["content-type", "text/html; charset=UTF-8"]]),
      text: () => Promise.resolve("<html><body>502 Bad Gateway</body></html>"),
    });

    await expect(login({ email: "test@nus.edu", password: "password" })).rejects.toThrow(
      "Request to backend failed (502). Received HTML response instead of JSON. Ensure VITE_API_BASE_URL is configured correctly in your deployment settings.",
    );
  });

  it("handles 200 OK HTML rewrite page when VITE_API_BASE_URL is missing in production", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([["content-type", "text/html; charset=UTF-8"]]),
      text: () => Promise.resolve("<!DOCTYPE html><html><body>SPA App</body></html>"),
    });

    await expect(login({ email: "test@nus.edu", password: "password" })).rejects.toThrow(
      "Received non-JSON response from server. Please verify that VITE_API_BASE_URL points to your live backend API URL.",
    );
  });

  it("handles network disconnect or offline server", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(login({ email: "test@nus.edu", password: "password" })).rejects.toThrow(
      "Could not connect to server",
    );
  });

  it("explains FastAPI field validation errors", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      headers: new Map([["content-type", "application/json"]]),
      json: () =>
        Promise.resolve({
          detail: [{ loc: ["body", "title"], msg: "String should have at most 160 characters" }],
        }),
    });

    await expect(createTask("test-token", { title: "A task" })).rejects.toThrow(
      "title: String should have at most 160 characters",
    );
  });

  it("sends Canvas token saves to the authenticated profile endpoint", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([["content-type", "application/json"]]),
      json: () =>
        Promise.resolve({
          id: 1,
          email: "test@nus.edu",
          name: "Test",
          canvas_token: "canvas-token",
          theme: "graphite",
        }),
    });

    await updateProfile("session-token", {
      name: "Test",
      canvas_token: "canvas-token",
      theme: "graphite",
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/auth/profile",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          Authorization: "Bearer session-token",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ name: "Test", canvas_token: "canvas-token", theme: "graphite" }),
      }),
    );
  });

  it("handles registration network failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(register({ email: "new@nus.edu", password: "password" })).rejects.toThrow(
      "Could not connect to server",
    );
  });

  it("handles importIcs network failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const mockFile = new File(["BEGIN:VCALENDAR"], "test.ics", { type: "text/calendar" });

    await expect(importIcs("test-token", mockFile)).rejects.toThrow("Could not connect to server");
  });
});
