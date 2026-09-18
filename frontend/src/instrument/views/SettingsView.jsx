// Settings — native panes, two materials, no tint gallery.

import { useEffect, useState } from "react";
import {
  claimTelegramLink,
  getBackups,
  getTelegramLink,
  restoreBackup,
  unlinkTelegram,
  updateProfile,
  validateCanvasToken,
} from "../../api";
import { getThemePreference, setThemePreference } from "../theme";
import { getScheduleCardStyle, setScheduleCardStyle } from "../scheduleCardStyle";
import { readDashboardConfig, writeDashboardConfig } from "../dashboardConfig";
import { BUS_CARDS } from "../busCards";
import "./settings.css";

const PANES = [
  ["dashboard", "Dashboard"],
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
  const [cardStyle, setCardStyle] = useState(getScheduleCardStyle());
  const [dash, setDash] = useState(readDashboardConfig);
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

  const pickCardStyle = (style) => {
    setScheduleCardStyle(style);
    setCardStyle(style);
  };

  const setDash_ = (patch) => setDash(writeDashboardConfig(patch));

  const seg = (value, options, onPick) => (
    <div className="ins-seg">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          className={value === key ? "is-active" : ""}
          onClick={() => onPick(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );

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
    ["instrument-light", "Fog", "soft light — the default", "light"],
    ["instrument-dark", "Dusk", "soft dark", "dark"],
    ["system", "System", "follows macOS", "system"],
  ];

  const cardOptions = [
    ["slab", "Slab", "the colour is the card"],
    ["registrar", "Registrar", "quiet print — hue as a dot"],
    ["wash", "Wash", "the soft tint, refined"],
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
        {pane === "dashboard" && (
          <>
            <div className="ins-sec">
              <div className="ins-sec-head">
                <h2>Clock</h2>
              </div>
              <div className="ins-setting-inline">
                {seg(
                  dash.clock,
                  [
                    ["24h", "24-hour"],
                    ["12h", "12-hour"],
                  ],
                  (clock) => setDash_({ clock }),
                )}
                {seg(
                  dash.seconds,
                  [
                    [true, "Seconds"],
                    [false, "No seconds"],
                  ],
                  (seconds) => setDash_({ seconds }),
                )}
              </div>
            </div>
            <div className="ins-sec">
              <div className="ins-sec-head">
                <h2>Type</h2>
              </div>
              <div className="ins-setting-inline">
                {seg(
                  dash.font,
                  [
                    ["rounded", "Rounded"],
                    ["standard", "Standard"],
                    ["serif", "Serif"],
                  ],
                  (font) => setDash_({ font }),
                )}
              </div>
            </div>
            <div className="ins-sec">
              <div className="ins-sec-head">
                <h2>Arrangement</h2>
              </div>
              <div className="ins-setting-inline">
                {seg(
                  dash.layout,
                  [
                    ["ledger", "Ledger"],
                    ["columns", "Columns"],
                    ["focus", "Focus"],
                  ],
                  (layout) => setDash_({ layout }),
                )}
              </div>
              <p className="ins-cap">
                Ledger balances dues and campus; Columns uses three across on wide windows; Focus
                keeps one quiet column.
              </p>
            </div>
            <div className="ins-sec">
              <div className="ins-sec-head">
                <h2>The day</h2>
              </div>
              <div className="ins-setting-inline">
                {seg(
                  dash.dayView,
                  [
                    ["timeline", "Timeline"],
                    ["rail", "Rail"],
                    ["none", "Hidden"],
                  ],
                  (dayView) => setDash_({ dayView }),
                )}
              </div>
            </div>
            <div className="ins-sec">
              <div className="ins-sec-head">
                <h2>Sections</h2>
              </div>
              <div className="ins-setting-inline">
                {seg(
                  dash.brief,
                  [
                    [true, "Brief"],
                    [false, "No brief"],
                  ],
                  (brief) => setDash_({ brief }),
                )}
                {seg(
                  dash.dues,
                  [
                    [true, "Dues"],
                    [false, "No dues"],
                  ],
                  (dues) => setDash_({ dues }),
                )}
                {seg(
                  dash.exams,
                  [
                    [true, "Exams"],
                    [false, "No exams"],
                  ],
                  (exams) => setDash_({ exams }),
                )}
              </div>
            </div>
            <div className="ins-sec">
              <div className="ins-sec-head">
                <h2>Horizon</h2>
              </div>
              <div className="ins-setting-inline">
                {seg(
                  dash.horizon.view,
                  [
                    ["columns", "Columns"],
                    ["strip", "Strip"],
                    ["list", "List"],
                  ],
                  (view) => setDash_({ horizon: { ...dash.horizon, view } }),
                )}
                {seg(
                  dash.horizon.range,
                  [
                    [7, "7 days"],
                    [14, "14 days"],
                  ],
                  (range) => setDash_({ horizon: { ...dash.horizon, range } }),
                )}
              </div>
              <div className="ins-setting-inline">
                <input
                  className="ins-input"
                  value={dash.horizon.label}
                  placeholder="No caption"
                  onChange={(e) =>
                    setDash_({ horizon: { ...dash.horizon, label: e.target.value } })
                  }
                />
              </div>
              <p className="ins-cap">The caption above the horizon — leave empty for none.</p>
            </div>
            <div className="ins-sec">
              <div className="ins-sec-head">
                <h2>Bus card</h2>
              </div>
              <div className="ins-themes">
                {BUS_CARDS.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className={`ins-theme ${dash.busCard === card.id ? "is-active" : ""}`}
                    onClick={() => setDash_({ busCard: card.id })}
                  >
                    <span className="ins-theme-names">
                      <span className="ins-theme-name">{card.name}</span>
                      <span className="ins-cap ins-theme-caption">{card.caption}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {pane === "appearance" && (
          <>
            <div className="ins-sec">
              <div className="ins-sec-head">
                <h2>Material</h2>
              </div>
              <div className="ins-themes">
                {themeOptions.map(([value, label, caption, kind]) => (
                  <button
                    key={value}
                    type="button"
                    className={`ins-theme ${theme === value ? "is-active" : ""}`}
                    onClick={() => pickTheme(value)}
                  >
                    <span className={`ins-theme-swatch is-${kind}`} aria-hidden="true">
                      <span />
                      <span />
                    </span>
                    <span className="ins-theme-names">
                      <span className="ins-theme-name">{label}</span>
                      <span className="ins-cap ins-theme-caption">{caption}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="ins-sec">
              <div className="ins-sec-head">
                <h2>Schedule cards</h2>
              </div>
              <div className="ins-themes">
                {cardOptions.map(([value, label, caption]) => (
                  <button
                    key={value}
                    type="button"
                    className={`ins-theme ${cardStyle === value ? "is-active" : ""}`}
                    onClick={() => pickCardStyle(value)}
                  >
                    <span className="ins-theme-names">
                      <span className="ins-theme-name">{label}</span>
                      <span className="ins-cap ins-theme-caption">{caption}</span>
                    </span>
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
