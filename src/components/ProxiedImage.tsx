"use client";

import { useState } from "react";
import { proxiedAssetUrl } from "@/lib/utils";

interface ProxiedImageProps {
  src?: string;
  alt: string;
  className?: string;
  /**
   * `cover` crops the photo to fill the tile — right for small fixed shapes
   * like the carousel chips. `contain` shows the whole photo, which is what
   * the big panels want: baps.org mixes portrait and landscape freely, and
   * cropping was cutting heads and temple spires off.
   */
  fit?: "cover" | "contain";
  /** Skips lazy loading for above-the-fold hero images. */
  priority?: boolean;
}

/**
 * Image tile that fills whatever box it's given via `className` (e.g.
 * `h-full w-full`, `absolute inset-0`) and degrades to a placeholder rather
 * than a broken-image icon.
 *
 * With `fit="contain"` the tile keeps its container's exact dimensions — so
 * nothing in the layout shifts when a portrait photo follows a landscape one
 * — and the letterboxing is filled with a blurred, zoomed copy of the same
 * photo instead of dead space.
 */
export function ProxiedImage({
  src,
  alt,
  className = "",
  fit = "cover",
  priority = false,
}: ProxiedImageProps) {
  const [errored, setErrored] = useState(false);
  const resolved = proxiedAssetUrl(src);

  if (!resolved || errored) {
    return (
      <div
        className={`flex items-center justify-center bg-asmita/5 text-center text-[11px] text-asmita/30 ${className}`}
      >
        Image unavailable
      </div>
    );
  }

  return (
    <div className={`overflow-hidden ${className}`}>
      {/* Inner wrapper owns the positioning context, so the caller's own
          className stays free to be `absolute inset-0` or `h-full w-full`. */}
      <div className="relative h-full w-full">
        {fit === "contain" && (
          /* eslint-disable-next-line @next/next/no-img-element -- see below */
          <img
            src={resolved}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-2xl"
          />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external source proxied through /api/proxy, next/image remotePatterns would need constant upkeep */}
        <img
          src={resolved}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          onError={() => setErrored(true)}
          className={`relative h-full w-full ${
            fit === "contain" ? "object-contain" : "object-cover"
          }`}
        />
      </div>
    </div>
  );
}
