import { createContext, useContext, useEffect } from "react";

export const WorkspaceToolbarContext = createContext(null);

export function useWorkspaceToolbar(config) {
  const setToolbar = useContext(WorkspaceToolbarContext);

  useEffect(() => {
    if (!setToolbar) return undefined;
    setToolbar(config);
    return () => setToolbar(null);
  }, [config, setToolbar]);
}
