"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2 } from "lucide-react";
import type { AudioTrack } from "@/lib/types";
import { proxiedAssetUrl } from "@/lib/utils";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export function AudioTrackPlayer({ track }: { track: AudioTrack }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  const src = proxiedAssetUrl(track.src);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setCurrent(el.currentTime);
    const onLoaded = () => setDuration(el.duration);
    const onEnd = () => setPlaying(false);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("ended", onEnd);
    };
  }, [src]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      el.play().catch(() => setPlaying(false));
    }
    setPlaying((p) => !p);
  };

  const seek = (e: ChangeEvent<HTMLInputElement>) => {
    const el = audioRef.current;
    if (!el) return;
    const value = Number(e.target.value);
    el.currentTime = value;
    setCurrent(value);
  };

  const disabled = !src;

  return (
    <div className="rounded-2xl border border-asmita/10 bg-black/20 p-3">
      <p className="truncate text-sm font-semibold text-shurvirta">{track.title}</p>
      {track.subtitle && <p className="truncate text-xs text-asmita/50">{track.subtitle}</p>}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          disabled={disabled}
          aria-label={playing ? "Pause" : "Play"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-shurvirta text-ink transition disabled:cursor-not-allowed disabled:bg-asmita/10 disabled:text-asmita/30"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 translate-x-px" />}
        </button>
        <span className="w-16 shrink-0 text-[11px] tabular-nums text-asmita/50">
          {formatTime(current)} / {formatTime(duration)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          value={current}
          onChange={seek}
          disabled={disabled}
          aria-label={`Seek ${track.title}`}
          className="h-1 flex-1 accent-shurvirta disabled:opacity-30"
        />
        <Volume2 className="h-4 w-4 shrink-0 text-asmita/40" />
      </div>

      {src && <audio ref={audioRef} src={src} preload="none" />}
    </div>
  );
}
