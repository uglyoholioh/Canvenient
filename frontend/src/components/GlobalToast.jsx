import React, { useState, useEffect } from "react";
import "./toast.css";

export default function GlobalToast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleShowToast = (e) => {
      const id = Date.now().toString() + Math.random().toString();
      const newToast = { id, ...e.detail };
      
      setToasts((current) => [...current, newToast]);

      if (newToast.timeout !== false) {
        setTimeout(() => {
          setToasts((current) => current.filter((t) => t.id !== id));
        }, newToast.timeout || 5000);
      }
    };

    window.addEventListener('canvenient-toast', handleShowToast);
    return () => window.removeEventListener('canvenient-toast', handleShowToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="mac-global-toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className="mac-global-toast" role="alert">
          <span>{toast.message}</span>
          {toast.actionLabel && (
            <button
              type="button"
              onClick={() => {
                if (toast.onAction) toast.onAction();
                setToasts((current) => current.filter((t) => t.id !== toast.id));
              }}
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
