import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

document.addEventListener('contextmenu', event => event.preventDefault());

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, background: 'red', color: 'white', height: '100vh', boxSizing: 'border-box', overflow: 'auto' }}>
          <h1>App Crashed!</h1>
          <pre>{this.state.error?.toString()}</pre>
          <pre>{this.state.info?.componentStack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

window.addEventListener('error', e => {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="padding: 40px; background: red; color: white;"><h1>Global Error!</h1><pre>${e.error?.stack || e.message}</pre></div>`;
  }
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
