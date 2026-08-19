"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import type { VicharanPhoto } from "@/lib/types";
import { ProxiedImage } from "./ProxiedImage";

interface Props {
  date?: string;
  location?: string;
  photos: VicharanPhoto[];
  scheduleNote?: string;
  scheduleHref?: string;
}

const AUTOPLAY_MS = 6000;

export function VicharanCarousel({
  date,
  location,
  photos,
  scheduleNote,
  scheduleHref,
}: Props) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const trackRef = useRef<HTMLDivElement>(null);

  const count = photos.length;
  const current = photos[index];
  const dayLabel = [date, location].filter(Boolean).join(" — ");

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
      {/* Header: which day these photos are from. */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-asmita/10 bg-black/20 px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-shurvirta/80">
            Latest Vicharan
          </p>
          <p className="truncate font-display text-base text-asmita sm:text-lg">
            {dayLabel || "Recent photos"}
          </p>
        </div>
        {scheduleNote &&
          (scheduleHref ? (
            <a
              href={scheduleHref}
              target="_blank"
              rel="noreferrer"
              className="hidden shrink-0 whitespace-nowrap rounded-full border border-dharma/30 px-3 py-1.5 text-xs text-dharma transition hover:bg-dharma/10 sm:inline-block"
            >
              {scheduleNote}
            </a>
          ) : (
            <span className="hidden shrink-0 whitespace-nowrap rounded-full border border-asmita/10 px-3 py-1.5 text-xs text-asmita/50 sm:inline-block">
              {scheduleNote}
            </span>
          ))}
      </div>

      <div className="relative min-h-0 flex-1">
        <ProxiedImage
          key={current.image}
          src={current.image}
          alt={current.caption || dayLabel || "Vicharan"}
          className="absolute inset-0 animate-fade-in"
          fit="contain"
          priority
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

        {/* Caption of the current photo, as shown beneath it on baps.org. */}
        <div className="absolute bottom-4 left-4 right-28">
          {current.caption ? (
            <p className="font-display text-lg text-asmita drop-shadow sm:text-xl">
              {current.caption}
            </p>
          ) : (
            <p className="font-display text-lg text-asmita/70 drop-shadow sm:text-xl">
              {dayLabel}
            </p>
          )}
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

      {/* Thumbnail strip — one square per photo of the day. */}
      <div
        ref={trackRef}
        className="no-scrollbar flex shrink-0 items-center gap-2 overflow-x-auto border-t border-asmita/10 bg-black/20 p-3"
      >
        {photos.map((photo, i) => (
          <button
            key={`${photo.image}-${i}`}
            type="button"
            onClick={() => goto(i)}
            title={photo.caption}
            aria-label={photo.caption || `Photo ${i + 1}`}
            className={`shrink-0 overflow-hidden rounded-lg border transition ${
              i === index
                ? "border-shurvirta/70 ring-1 ring-shurvirta/40"
                : "border-asmita/10 opacity-70 hover:opacity-100"
            }`}
          >
            <ProxiedImage src={photo.image} alt="" className="h-11 w-11" />
          </button>
        ))}
      </div>
    </div>
  );
}
