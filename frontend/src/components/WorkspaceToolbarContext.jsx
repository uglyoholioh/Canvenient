import { createContext, useContext, useEffect } from "react";

export const WorkspaceToolbarContext = createContext(null);

export function useWorkspaceToolbar(config, enabled = true) {
  const setToolbar = useContext(WorkspaceToolbarContext);

  useEffect(() => {
    if (!setToolbar || !enabled) return undefined;
    setToolbar(config);
    return () => setToolbar(null);
  }, [config, enabled, setToolbar]);
}
