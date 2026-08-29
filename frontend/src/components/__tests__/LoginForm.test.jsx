// React is required by the test JSX transform.
// eslint-disable-next-line no-unused-vars
import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import LoginForm from '../LoginForm'

describe('LoginForm Component', () => {
  it('renders login form headings and input fields without crashing', () => {
    const mockOnLoginSuccess = vi.fn()

    render(
      <MemoryRouter>
        <LoginForm onLoginSuccess={mockOnLoginSuccess} />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })
})
