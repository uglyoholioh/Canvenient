import { describe, it, expect, vi, afterEach } from 'vitest'
import { login, register, importIcs } from '../api'

describe('api.js error handling', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('handles empty response with application/json header without throwing SyntaxError', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.reject(new SyntaxError('Unexpected end of JSON input')),
    })

    await expect(login({ email: 'test@nus.edu', password: 'password' })).rejects.toThrow(
      'Server returned an empty or invalid JSON response.'
    )
  })

  it('handles 502 HTML error page from proxy or gateway', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: new Map([['content-type', 'text/html; charset=UTF-8']]),
      text: () => Promise.resolve('<html><body>502 Bad Gateway</body></html>'),
    })

    await expect(login({ email: 'test@nus.edu', password: 'password' })).rejects.toThrow(
      'Request to backend failed (502). Received HTML response instead of JSON. Ensure VITE_API_BASE_URL is configured correctly in your deployment settings.'
    )
  })

  it('handles 200 OK HTML rewrite page when VITE_API_BASE_URL is missing in production', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'text/html; charset=UTF-8']]),
      text: () => Promise.resolve('<!DOCTYPE html><html><body>SPA App</body></html>'),
    })

    await expect(login({ email: 'test@nus.edu', password: 'password' })).rejects.toThrow(
      'Received non-JSON response from server. Please verify that VITE_API_BASE_URL points to your live backend API URL.'
    )
  })

  it('handles network disconnect or offline server', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(login({ email: 'test@nus.edu', password: 'password' })).rejects.toThrow(
      'Could not connect to server'
    )
  })

  it('handles registration network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(register({ email: 'new@nus.edu', password: 'password' })).rejects.toThrow(
      'Could not connect to server'
    )
  })

  it('handles importIcs network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const mockFile = new File(['BEGIN:VCALENDAR'], 'test.ics', { type: 'text/calendar' })

    await expect(importIcs('test-token', mockFile)).rejects.toThrow(
      'Could not connect to server'
    )
  })
})
