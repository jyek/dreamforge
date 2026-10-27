/** Notify other DreamForge tabs without storing account data in the browser. */
export function notifyBalanceChanged() {
  window.dispatchEvent(new Event("dreamforge:balance-changed"));
  try {
    localStorage.setItem("dreamforge:balance-changed", String(Date.now()));
  } catch {}
}

export function watchBalanceChanges(refresh: () => void) {
  const visibleRefresh = () => {
    if (document.visibilityState !== "hidden") refresh();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === "dreamforge:balance-changed") visibleRefresh();
  };
  window.addEventListener("focus", visibleRefresh);
  document.addEventListener("visibilitychange", visibleRefresh);
  window.addEventListener("dreamforge:balance-changed", visibleRefresh);
  window.addEventListener("storage", onStorage);
  // A parent can pay on another device, where browser events cannot reach us.
  const timer = setInterval(visibleRefresh, 30000);
  return () => {
    clearInterval(timer);
    window.removeEventListener("focus", visibleRefresh);
    document.removeEventListener("visibilitychange", visibleRefresh);
    window.removeEventListener("dreamforge:balance-changed", visibleRefresh);
    window.removeEventListener("storage", onStorage);
  };
}
