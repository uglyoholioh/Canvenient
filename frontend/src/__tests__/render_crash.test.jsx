import React from 'react';
import { render } from '@testing-library/react';
import { it } from 'vitest';
import App from '../App.jsx';

it('renders app', () => {
  const { container } = render(<App />);
  console.log("Render succeeded!");
});
