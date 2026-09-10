import { render } from '@testing-library/react';
import CanvasModule from '../components/dashboard/CanvasModule.jsx';
import { it } from 'vitest';

it('renders canvas module', () => {
  render(<CanvasModule token="test" enabled={true} />);
  console.log("Canvas module rendered without crashing!");
});
