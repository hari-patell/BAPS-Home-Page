"use client";

import { useState } from "react";
import { RefreshCw, Share2 } from "lucide-react";

interface Props {
  onRefresh: () => void;
  refreshing: boolean;
}

export function IconRail({ onRefresh, refreshing }: Props) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try {
        await navigator.share({ title: "BAPS Daily Darshan", url });
      } catch {
        // user cancelled the share sheet
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  const buttonClass =
    "flex h-10 w-10 items-center justify-center rounded-full border border-asmita/10 bg-black/25 text-asmita/70 backdrop-blur transition hover:border-shurvirta/40 hover:text-shurvirta";

  return (
    <div className="hidden shrink-0 flex-col items-center justify-center gap-3 lg:flex">
      <button
        type="button"
        onClick={onRefresh}
        aria-label="Refresh dashboard"
        title="Refresh"
        className={buttonClass}
      >
        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
      </button>
      <div className="relative">
        <button type="button" onClick={share} aria-label="Share" title="Share" className={buttonClass}>
          <Share2 className="h-4 w-4" />
        </button>
        {copied && (
          <span className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/70 px-2 py-1 text-[10px] text-asmita">
            Copied!
          </span>
        )}
      </div>
    </div>
  );
}
