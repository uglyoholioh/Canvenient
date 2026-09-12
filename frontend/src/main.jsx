import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

document.addEventListener("contextmenu", (event) => event.preventDefault());

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
        <div
          style={{
            padding: 40,
            background: "red",
            color: "white",
            height: "100vh",
            boxSizing: "border-box",
            overflow: "auto",
          }}
        >
          <h1>App Crashed!</h1>
          <pre>{this.state.error?.toString()}</pre>
          <pre>{this.state.info?.componentStack}</pre>
          <button type="button" onClick={() => window.location.reload()}>
            Reload Canvenient
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// A background error (e.g. a PDF decoder failing) must never replace the
// whole workspace; log it and surface a dismissible toast instead.
window.addEventListener("error", (e) => {
  console.error("Unhandled error:", e.error || e.message);
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("Unhandled rejection:", e.reason);
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
