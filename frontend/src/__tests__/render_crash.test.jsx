import React from 'react';
import { render } from '@testing-library/react';
import { it, vi } from 'vitest';
import App from '../App.jsx';

global.localStorage = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};

it('renders app', () => {
  const { container } = render(<App />);
  console.log("Render succeeded!");
});
