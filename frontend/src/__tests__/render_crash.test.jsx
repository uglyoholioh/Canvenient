import { render } from '@testing-library/react';
import { it, vi } from 'vitest';
import App from '../App.jsx';

globalThis.localStorage = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};

it('renders app', () => {
  render(<App />);
  console.log("Render succeeded!");
});
