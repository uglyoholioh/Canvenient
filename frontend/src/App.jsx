import { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import RegisterForm from "./components/RegisterForm";
import LoginForm from "./components/LoginForm";
import AuthShell, { BrandMark } from "./components/AuthShell";
import InstrumentWorkspace from "./instrument/InstrumentWorkspace";
import GlobalToast from "./components/GlobalToast";
import TrayPanel from "./tray/TrayPanel";
import TrayChip from "./tray/TrayChip";
import "./components/auth.css";
import "./design/system.css";

import {
  getStoredToken,
  persistToken,
  clearStoredToken,
  getStoredUser,
  persistUser,
  getCurrentUser,
} from "./api";

// The tray panel and floating chip run in their own windows and render
// outside the auth/workspace shell entirely — they read the stored token
// directly and degrade to cached/empty data when signed out.
const TRAY_ROUTE = window.location.hash.split("?")[0];

function Root() {
  if (TRAY_ROUTE === "#/tray") return <TrayPanel />;
  if (TRAY_ROUTE === "#/tray-chip") return <TrayChip />;
  return <App />;
}

function App() {
  const [token, setToken] = useState(() => getStoredToken());
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());
  const [isCheckingSession, setIsCheckingSession] = useState(() => Boolean(getStoredToken()));

  useEffect(() => {
    let cancelled = false;
    async function restoreSession() {
      if (!token) {
        setCurrentUser(null);
        setIsCheckingSession(false);
        return;
      }
      try {
        const user = await getCurrentUser(token);
        if (!cancelled) {
          setCurrentUser(user);
          persistUser(user);
        }
      } catch {
        if (!cancelled) {
          clearStoredToken();
          setToken("");
          setCurrentUser(null);
        }
      } finally {
        if (!cancelled) setIsCheckingSession(false);
      }
    }
    restoreSession();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    // The draft speaks two materials: instrument-dark (default) and
    // instrument-light. Legacy preferences map onto them.
    const storedPreference = localStorage.getItem("canvenient-theme") || "instrument-dark";
    const resolvedTheme =
      storedPreference === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "instrument-dark"
          : "instrument-light"
        : storedPreference === "instrument-light" || storedPreference === "light"
          ? "instrument-light"
          : "instrument-dark";
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, []);

  const handleLoginSuccess = (session) => {
    persistToken(session.access_token);
    persistUser(session.user);
    setToken(session.access_token);
    setCurrentUser(session.user);
  };

  const handleLogout = () => {
    clearStoredToken();
    setToken("");
    setCurrentUser(null);
  };

  const handleUserProfileUpdate = (user) => {
    persistUser(user);
    setCurrentUser(user);
  };

  if (isCheckingSession) {
    return (
      <AuthShell>
        <div className="auth-splash">
          <BrandMark compact />
          <p className="auth-splash-status">Restoring session…</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route
          path="/register"
          element={
            currentUser ? (
              <Navigate to="/workspace" replace />
            ) : (
              <RegisterForm onLoginSuccess={handleLoginSuccess} />
            )
          }
        />
        <Route
          path="/login"
          element={
            currentUser ? (
              <Navigate to="/workspace" replace />
            ) : (
              <LoginForm onLoginSuccess={handleLoginSuccess} />
            )
          }
        />
        <Route
          path="/workspace"
          element={
            !currentUser ? (
              <Navigate to="/login" replace />
            ) : (
              <InstrumentWorkspace
                token={token}
                user={currentUser}
                onLogout={handleLogout}
                onUpdateUser={handleUserProfileUpdate}
              />
            )
          }
        />
        <Route path="*" element={<Navigate to="/workspace" replace />} />
      </Routes>
      <GlobalToast />
    </Router>
  );
}

export default Root;
