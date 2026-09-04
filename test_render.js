import React from 'react';
import { render } from '@testing-library/react';
import App from './frontend/src/App.jsx';

try {
  const { container } = render(<App />);
  console.log("Render succeeded! HTML:", container.innerHTML.substring(0, 200));
} catch (e) {
  console.error("Render failed:", e);
}
