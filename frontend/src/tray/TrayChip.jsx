// TrayChip — the optional floating always-on-top time display. Shows the
// live countdown while the tray timer runs, then hides itself. Drag it
// anywhere on the desktop.

import { useEffect, useState } from "react";
import { getCurrent } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";

export default function TrayChip() {
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    let disposed = false;
    const unlisten = listen("focus-tick", ({ payload }) => {
      if (disposed) return;
      setRemaining(payload.status === "idle" ? null : payload.remaining);
      if (payload.status === "idle") {
        getCurrent().hide();
      }
    });
    return () => {
      disposed = true;
      unlisten.then((dispose) => dispose());
    };
  }, []);

  const show = remaining != null;
  const minutes = String(Math.floor((remaining ?? 0) / 60)).padStart(2, "0");
  const seconds = String((remaining ?? 0) % 60).padStart(2, "0");

  return (
    <div
      className="tray-chip"
      onMouseDown={() => {
        getCurrent()
          .startDragging()
          .catch(() => {});
      }}
      role="timer"
      aria-label={show ? `Focus remaining ${minutes} minutes ${seconds} seconds` : "Focus idle"}
    >
      {show ? `${minutes}:${seconds}` : "—"}
    </div>
  );
}
