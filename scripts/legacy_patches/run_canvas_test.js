import React from 'react';
import { render } from '@testing-library/react';
import CanvasModule from './frontend/src/components/dashboard/CanvasModule.jsx';
import { it } from 'vitest';

it('renders canvas module', () => {
  try {
    render(<CanvasModule token="test" enabled={true} />);
    console.log("Canvas module rendered without crashing!");
  } catch(e) {
    console.error("Crash!", e);
  }
});
