'use client';
import { createContext, useCallback, useContext, useRef, useState } from 'react';

// One toast for the whole app (the mockup's .toast, shown from any component).
const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const timer = useRef(null);
  const show = useCallback((text, bad = false) => {
    setMsg({ text, bad, id: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3200);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {msg && <div key={msg.id} className={'toast show'} role="status" style={msg.bad ? { background: '#8A2A1C' } : undefined}>{msg.text}</div>}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
