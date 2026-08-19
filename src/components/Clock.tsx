"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  const id = setInterval(callback, 1000);
  return () => clearInterval(id);
}

function getSnapshot() {
  return Date.now();
}

// Server render has no wall clock; React re-renders once on the client
// right after hydration with the real value, which is the documented
// pattern for external time sources like this.
function getServerSnapshot() {
  return 0;
}

export function Clock() {
  const ms = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (ms === 0) {
    return <div className="h-[68px]" aria-hidden />;
  }

  const now = new Date(ms);
  const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const date = now.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div>
      <div className="font-display text-4xl font-semibold tracking-tight text-asmita sm:text-5xl">
        {time}
      </div>
      <div className="mt-1 text-sm text-asmita/50">{date}</div>
    </div>
  );
}
