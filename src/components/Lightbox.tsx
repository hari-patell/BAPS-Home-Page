"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { proxiedAssetUrl } from "@/lib/utils";

interface Props {
  src?: string;
  alt?: string;
  caption?: string;
  onClose: () => void;
}

/**
 * Full-screen image preview. Clicking the backdrop or the close button, or
 * pressing Escape, dismisses it. Locks body scroll while open.
 */
export function Lightbox({ src, alt, caption, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const resolved = proxiedAssetUrl(src);
  if (!resolved) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="animate-fade-in fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-4 backdrop-blur-sm sm:p-8"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-asmita transition hover:bg-black/70"
      >
        <X className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- external source proxied through /api/proxy */}
      <img
        src={resolved}
        alt={alt ?? caption ?? "Preview"}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl"
      />
      {caption && (
        <p className="max-w-2xl text-center font-display text-base text-asmita/90 sm:text-lg">
          {caption}
        </p>
      )}
    </div>
  );
}
