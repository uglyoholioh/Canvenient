// React is required by the test JSX transform.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import LoginForm from "../LoginForm";

describe("LoginForm Component", () => {
  it("renders login form headings and input fields without crashing", () => {
    const mockOnLoginSuccess = vi.fn();

    render(
      <MemoryRouter>
        <LoginForm onLoginSuccess={mockOnLoginSuccess} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LoginForm onLoginSuccess={vi.fn()} />
      </MemoryRouter>,
    );

    const passwordInput = screen.getByLabelText(/^password$/i);
    expect(passwordInput).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: /show password/i }));
    expect(passwordInput).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: /hide password/i }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });
});
