import { createContext, useContext } from "react";

export const QuickCaptureContext = createContext({
  isOpen: false,
  openQuickCapture: () => {},
  closeQuickCapture: () => {},
  setCaptureContext: () => {},
});

export function useQuickCapture() {
  return useContext(QuickCaptureContext);
}
