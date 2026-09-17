// OrientationSheet — one quiet screen, once per account. States the three
// keys and, when the account has no name yet, records one. No tour, no tips.

import { useState } from "react";
import { updateProfile } from "../api";

export default function OrientationSheet({ token, user, onUpdateUser, onDone }) {
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const needsName = !user?.name?.trim();

  const finish = async () => {
    setSaving(true);
    try {
      if (needsName && name.trim()) {
        const updated = await updateProfile(token, { name: name.trim() });
        onUpdateUser?.(updated);
      }
    } catch {
      // The name can be set later in Settings; never block the way in.
    } finally {
      setSaving(false);
      if (user?.id) {
        localStorage.setItem(`canvenient_intro_completed_${user.id}`, "true");
        localStorage.setItem(
          `canvenient_onboarding_completed_${user.id}`,
          localStorage.getItem(`canvenient_onboarding_completed_${user.id}`) || "true",
        );
      }
      onDone();
    }
  };

  return (
    <div className="ins-backdrop">
      <section
        className="ins-sheet ins-orientation"
        role="dialog"
        aria-modal="true"
        aria-label="Welcome"
      >
        <p className="ins-cap">Canvenient</p>
        <h2 className="ins-display">Three keys.</h2>
        <p className="ins-orientation-sub">Everything in this app is reachable from one field.</p>
        <div className="ins-orientation-keys">
          <div className="ins-orientation-key">
            <kbd className="ins-kbd">⌘K</kbd>
            <span>search anything, run anything</span>
          </div>
          <div className="ins-orientation-key">
            <kbd className="ins-kbd">⌘N</kbd>
            <span>capture a thought</span>
          </div>
          <div className="ins-orientation-key">
            <kbd className="ins-kbd">⌘I</kbd>
            <span>ask about your own data</span>
          </div>
        </div>
        {needsName && (
          <label className="ins-orientation-name">
            <span className="ins-cap">Name on the account</span>
            <input
              className="ins-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") finish();
              }}
            />
          </label>
        )}
        <div className="ins-orientation-actions">
          <button type="button" className="ins-btn is-primary" onClick={finish} disabled={saving}>
            Open Canvenient
          </button>
        </div>
      </section>
    </div>
  );
}
