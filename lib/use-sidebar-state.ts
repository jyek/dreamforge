"use client";
import { useCallback, useEffect, useState } from "react";
const KEY = "dreamforge.sidebar.collapsed";
const EVENT = "dreamforge:sidebar-preference";
export function useSidebarState() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const read = () => {
      try {
        setCollapsed(localStorage.getItem(KEY) === "true");
      } catch {}
    };
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  const setPreference = useCallback((next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(KEY, String(next));
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return {
    collapsed,
    setCollapsed: setPreference,
    toggle: () => setPreference(!collapsed),
  };
}
