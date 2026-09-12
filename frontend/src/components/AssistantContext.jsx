import { createContext, useContext } from "react";

// Lets any view deep in the tree open the assistant pane, optionally with a
// natural-language query and/or an attached resource (a note, announcement,
// assignment or Canvas file) for the assistant to read.
export const AssistantContext = createContext({
  openAssistant: () => {},
  closeAssistant: () => {},
});

export function useAssistant() {
  return useContext(AssistantContext);
}
