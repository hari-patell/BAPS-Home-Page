"use client";

import { useState } from "react";
import type { DarshanImage } from "@/lib/types";
import { ProxiedImage } from "./ProxiedImage";

interface Props {
  murti: DarshanImage[];
  swamishri: DarshanImage[];
}

type Tab = "murti" | "swamishri";

export function DarshanPanel({ murti, swamishri }: Props) {
  const hasMurti = murti.length > 0;
  const hasSwamishri = swamishri.length > 0;
  const [tab, setTab] = useState<Tab>(hasSwamishri ? "swamishri" : "murti");
  const [index, setIndex] = useState(0);

  const active = tab === "swamishri" ? swamishri : murti;
  const current = active[index] ?? active[0];

  const selectTab = (t: Tab) => {
    setTab(t);
    setIndex(0);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-asmita/10 bg-black/20 backdrop-blur-sm">
      <div className="flex shrink-0 items-center justify-between gap-2 px-5 pt-4">
        <h2 className="font-display text-lg italic text-dharma">Darshan</h2>
        {(hasMurti || hasSwamishri) && (
          <div className="flex items-center gap-1 rounded-full border border-asmita/10 bg-black/20 p-1 text-xs">
            <button
              type="button"
              disabled={!hasMurti}
              onClick={() => selectTab("murti")}
              className={`rounded-full px-3 py-1 transition disabled:opacity-30 ${
                tab === "murti" ? "bg-asmita/10 text-asmita" : "text-asmita/40"
              }`}
            >
              Murti
            </button>
            <button
              type="button"
              disabled={!hasSwamishri}
              onClick={() => selectTab("swamishri")}
              className={`rounded-full px-3 py-1 font-medium transition disabled:opacity-30 ${
                tab === "swamishri" ? "bg-shurvirta text-ink" : "text-asmita/40"
              }`}
            >
              Swamishri
            </button>
          </div>
        )}
      </div>

      {current ? (
        <>
          <div className="mt-4 min-h-0 flex-1 px-5">
            <ProxiedImage
              key={current.src}
              src={current.src}
              alt={current.caption ?? "Darshan"}
              className="h-full w-full rounded-2xl"
            />
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2 px-5 pb-4 pt-3">
            <p className="line-clamp-2 text-xs text-asmita/60">{current.caption}</p>
            {active.length > 1 && (
              <div className="flex shrink-0 gap-1">
                {active.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Photo ${i + 1}`}
                    className={`h-1.5 w-1.5 rounded-full transition ${
                      i === index ? "bg-shurvirta" : "bg-asmita/20"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-asmita/40">
          Darshan photos aren&apos;t available right now.
        </div>
      )}
    </div>
  );
}
