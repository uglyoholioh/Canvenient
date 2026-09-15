// OfflineBanner — muted "Offline — showing last sync" line for the shell.
// Reacts to canvenient-connectivity events from api.js; while offline,
// GET requests resolve from the last successful cache.

import { useEffect, useState } from "react";

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = (event) => setOffline(Boolean(event.detail?.offline));
    window.addEventListener("canvenient-connectivity", sync);
    return () => window.removeEventListener("canvenient-connectivity", sync);
  }, []);

  if (!offline) return null;
  return (
    <div className="offline-banner" role="status">
      Offline — showing last sync
    </div>
  );
}
