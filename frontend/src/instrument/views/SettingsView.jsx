// Settings — native panes, two materials, no tint gallery.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  claimTelegramLink,
  getBackups,
  getTelegramLink,
  restoreBackup,
  unlinkTelegram,
  updateProfile,
  validateCanvasToken,
} from "../../api";
import { useWorkspaceToolbar } from "../../components/WorkspaceToolbarContext";
import { getThemePreference, setThemePreference } from "../theme";
import "./settings.css";

const PANES = [
  ["appearance", "Appearance"],
  ["connections", "Connections"],
  ["backups", "Backups"],
  ["account", "Account"],
];

function CanvasRow({ token, user, onUpdateUser }) {
  const [value, setValue] = useState("");
  const [state, setState] = useState({ busy: false, message: "" });
  const connected = Boolean(user?.canvas_connected);

  const connect = async () => {
    setState({ busy: true, message: "" });
    try {
      const check = await validateCanvasToken(token, value.trim());
      if (!check?.valid) throw new Error(check?.message || "Token not accepted by Canvas.");
      const updated = await updateProfile(token, { canvas_token: value.trim() });
      onUpdateUser?.(updated);
      setState({ busy: false, message: "Connected." });
      setValue("");
    } catch (err) {
      setState({ busy: false, message: err.message || "Could not connect." });
    }
  };

  const disconnect = async () => {
    setState({ busy: true, message: "" });
    try {
      const updated = await updateProfile(token, { canvas_token: "" });
      onUpdateUser?.(updated);
      setState({ busy: false, message: "Disconnected." });
    } catch (err) {
      setState({ busy: false, message: err.message || "Could not disconnect." });
    }
  };

  return (
    <div className="ins-setting">
      <div className="ins-setting-head">
        <span>Canvas</span>
        <span className="ins-cap">{connected ? "connected" : "not connected"}</span>
      </div>
      <p className="ins-cap">
        Syncs courses, assignments, announcements and files from canvas.nus.edu.sg.
      </p>
      <div className="ins-setting-inline">
        <input
          className="ins-input"
          type="password"
          placeholder={connected ? "Replace token" : "Canvas API token"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="button"
          className="ins-btn is-primary"
          disabled={!value.trim() || state.busy}
          onClick={connect}
        >
          Connect
        </button>
        {connected && (
          <button type="button" className="ins-btn" onClick={disconnect} disabled={state.busy}>
            Disconnect
          </button>
        )}
      </div>
      {state.message && <p className="ins-cap">{state.message}</p>}
    </div>
  );
}

function TelegramRow({ token }) {
  const [link, setLink] = useState(null);
  const [code, setCode] = useState("");
  const [state, setState] = useState({ busy: false, message: "" });

  useEffect(() => {
    getTelegramLink(token)
      .then(setLink)
      .catch(() => {});
  }, [token]);

  const claim = async () => {
    setState({ busy: true, message: "" });
    try {
      const result = await claimTelegramLink(token, code.trim());
      setLink(result);
      setCode("");
      setState({ busy: false, message: "Linked." });
    } catch (err) {
      setState({ busy: false, message: err.message || "Could not link." });
    }
  };

  const unlink = async () => {
    setState({ busy: true, message: "" });
    try {
      await unlinkTelegram(token);
      setLink(null);
      setState({ busy: false, message: "Unlinked." });
    } catch (err) {
      setState({ busy: false, message: err.message || "Could not unlink." });
    }
  };

  return (
    <div className="ins-setting">
      <div className="ins-setting-head">
        <span>Telegram</span>
        <span className="ins-cap">{link?.linked ? "linked" : "not linked"}</span>
      </div>
      <p className="ins-cap">
        The daily digest reads from this account and sends facts, once a day.
      </p>
      {link?.linked ? (
        <div className="ins-setting-inline">
          <span className="ins-mono ins-cap">chat {link.chat_id}</span>
          <button type="button" className="ins-btn" onClick={unlink} disabled={state.busy}>
            Unlink
          </button>
        </div>
      ) : (
        <div className="ins-setting-inline">
          <input
            className="ins-input"
            placeholder="Pairing code from the bot"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button
            type="button"
            className="ins-btn is-primary"
            disabled={!code.trim() || state.busy}
            onClick={claim}
          >
            Link
          </button>
        </div>
      )}
      {state.message && <p className="ins-cap">{state.message}</p>}
    </div>
  );
}

export default function SettingsView({ token, user, onUpdateUser, onReplayOrientation }) {
  const [pane, setPane] = useState("appearance");
  const [theme, setTheme] = useState(getThemePreference());
  const [name, setName] = useState(user?.name || "");
  const [nameState, setNameState] = useState({ busy: false, message: "" });
  const [backups, setBackups] = useState([]);
  const [backupState, setBackupState] = useState("");

  useEffect(() => {
    const onThemeChanged = () => setTheme(getThemePreference());
    window.addEventListener("canvenient-theme-changed", onThemeChanged);
    window.addEventListener("storage", onThemeChanged);
    return () => {
      window.removeEventListener("canvenient-theme-changed", onThemeChanged);
      window.removeEventListener("storage", onThemeChanged);
    };
  }, []);

  useEffect(() => {
    if (pane !== "backups") return;
    getBackups(token)
      .then((data) => setBackups(data?.backups || []))
      .catch(() => {});
  }, [token, pane]);

  const pickTheme = (pref) => {
    setThemePreference(pref);
    setTheme(pref);
  };

  const saveName = async () => {
    if (!name.trim()) return;
    setNameState({ busy: true, message: "" });
    try {
      const updated = await updateProfile(token, { name: name.trim() });
      onUpdateUser?.(updated);
      setNameState({ busy: false, message: "Saved." });
    } catch (err) {
      setNameState({ busy: false, message: err.message || "Could not save." });
    }
  };

  const restore = async (backup) => {
    setBackupState(`Restoring ${backup.name || backup}…`);
    try {
      await restoreBackup(token, backup.name || backup);
      setBackupState("Restored.");
    } catch (err) {
      setBackupState(err.message || "Restore failed.");
    }
  };

  const themeOptions = [
    ["instrument-dark", "Graphite", "the default material"],
    ["instrument-light", "Paper", "warm light"],
    ["system", "System", "follows macOS"],
  ];

  return (
    <div className="ins-settings">
      <div className="ins-settings-nav">
        {PANES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`ins-settings-tab ${pane === id ? "is-active" : ""}`}
            onClick={() => setPane(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="ins-settings-pane">
        {pane === "appearance" && (
          <>
            <div className="ins-sec">
              <div className="ins-sec-head">
                <h2>Material</h2>
              </div>
              <div className="ins-themes">
                {themeOptions.map(([value, label, caption]) => (
                  <button
                    key={value}
                    type="button"
                    className={`ins-theme ${theme === value ? "is-active" : ""}`}
                    onClick={() => pickTheme(value)}
                  >
                    <span className="ins-cap">{label}</span>
                    <span className="ins-cap ins-theme-caption">{caption}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="ins-sec">
              <div className="ins-sec-head">
                <h2>Keyboard</h2>
              </div>
              <p className="ins-cap">
                The full map lives under <kbd className="ins-kbd">⌘/</kbd>. Every key is also in the
                native menu bar.
              </p>
            </div>
            <div className="ins-sec">
              <div className="ins-sec-head">
                <h2>Orientation</h2>
              </div>
              <p className="ins-cap">The three-key screen, shown once per account.</p>
              <button type="button" className="ins-btn" onClick={onReplayOrientation}>
                Show again
              </button>
            </div>
          </>
        )}

        {pane === "connections" && (
          <>
            <CanvasRow token={token} user={user} onUpdateUser={onUpdateUser} />
            <TelegramRow token={token} />
          </>
        )}

        {pane === "backups" && (
          <div className="ins-sec">
            <div className="ins-sec-head">
              <h2>Launch backups</h2>
            </div>
            {backups.length === 0 && <p className="ins-cap">No backups on record.</p>}
            {backups.map((backup) => (
              <div key={backup.name || backup} className="ins-backuprow">
                <span className="ins-mono ins-cap">{backup.name || backup}</span>
                <button type="button" className="ins-btn" onClick={() => restore(backup)}>
                  Restore
                </button>
              </div>
            ))}
            {backupState && <p className="ins-cap">{backupState}</p>}
          </div>
        )}

        {pane === "account" && (
          <>
            <div className="ins-sec">
              <div className="ins-setting-head">
                <span>Name</span>
              </div>
              <div className="ins-setting-inline">
                <input
                  className="ins-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name"
                />
                <button
                  type="button"
                  className="ins-btn is-primary"
                  disabled={!name.trim() || nameState.busy}
                  onClick={saveName}
                >
                  Save
                </button>
              </div>
              {nameState.message && <p className="ins-cap">{nameState.message}</p>}
            </div>
            <div className="ins-sec">
              <div className="ins-setting-head">
                <span>Email</span>
                <span className="ins-mono ins-cap">{user?.email}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
