"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import type { VicharanEntry } from "@/lib/types";
import { ProxiedImage } from "./ProxiedImage";

interface Props {
  entries: VicharanEntry[];
  scheduleNote?: string;
  scheduleHref?: string;
}

const AUTOPLAY_MS = 6000;

export function VicharanCarousel({ entries, scheduleNote, scheduleHref }: Props) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const trackRef = useRef<HTMLDivElement>(null);

  const count = entries.length;
  const current = entries[index];

  useEffect(() => {
    if (!playing || count < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [playing, count]);

  useEffect(() => {
    const chip = trackRef.current?.children[index] as HTMLElement | undefined;
    chip?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [index]);

  if (count === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-3xl border border-asmita/10 bg-black/20 p-8 text-center backdrop-blur-sm">
        <p className="font-display text-lg text-asmita/70">
          Vicharan updates aren&apos;t available right now
        </p>
        <p className="text-sm text-asmita/40">
          Check back soon, or visit baps.org/vicharan.aspx directly.
        </p>
      </div>
    );
  }

  const goto = (i: number) => {
    setIndex(((i % count) + count) % count);
    setPlaying(false);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-asmita/10 bg-black/20 backdrop-blur-sm">
      <div className="relative min-h-0 flex-1">
        <ProxiedImage
          key={current.image}
          src={current.image}
          alt={[current.date, current.location].filter(Boolean).join(" — ") || "Vicharan"}
          className="absolute inset-0 animate-fade-in"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-transparent" />

        <div className="absolute right-4 top-4 flex items-center gap-2">
          <span className="rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-asmita/80 backdrop-blur">
            {index + 1} of {count}
          </span>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause slideshow" : "Play slideshow"}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-asmita backdrop-blur transition hover:bg-black/70"
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
        </div>

        <div className="absolute bottom-4 left-4 right-28">
          <p className="font-display text-lg text-asmita drop-shadow sm:text-xl">
            {[current.date, current.location].filter(Boolean).join(" — ")}
          </p>
        </div>

        <div className="absolute bottom-4 right-4 flex gap-2">
          <button
            type="button"
            onClick={() => goto(index - 1)}
            aria-label="Previous photo"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-asmita backdrop-blur transition hover:bg-black/70"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => goto(index + 1)}
            aria-label="Next photo"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-asmita backdrop-blur transition hover:bg-black/70"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        className="no-scrollbar flex shrink-0 items-center gap-2 overflow-x-auto border-t border-asmita/10 bg-black/20 p-3"
      >
        {entries.map((entry, i) => (
          <button
            key={`${entry.image}-${i}`}
            type="button"
            onClick={() => goto(i)}
            className={`flex shrink-0 items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-xs transition ${
              i === index
                ? "border-shurvirta/60 bg-shurvirta/10 text-shurvirta"
                : "border-asmita/10 text-asmita/60 hover:border-asmita/25"
            }`}
          >
            <ProxiedImage src={entry.image} alt="" className="h-6 w-6 rounded-full" />
            <span className="whitespace-nowrap">
              {[entry.date, entry.location].filter(Boolean).join(" — ") || `Photo ${i + 1}`}
            </span>
          </button>
        ))}
        {scheduleNote &&
          (scheduleHref ? (
            <a
              href={scheduleHref}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 whitespace-nowrap rounded-full border border-dharma/30 px-3 py-1.5 text-xs text-dharma transition hover:bg-dharma/10"
            >
              {scheduleNote}
            </a>
          ) : (
            <span className="shrink-0 whitespace-nowrap rounded-full border border-asmita/10 px-3 py-1.5 text-xs text-asmita/50">
              {scheduleNote}
            </span>
          ))}
      </div>
    </div>
  );
}
