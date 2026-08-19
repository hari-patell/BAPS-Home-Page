"use client";

import { useState } from "react";
import { proxiedAssetUrl } from "@/lib/utils";

interface ProxiedImageProps {
  src?: string;
  alt: string;
  className?: string;
}

/**
 * Fixed-ratio image tile that fills whatever container it's given via
 * `className` (e.g. `h-full w-full`, `aspect-video`) and crops to fit with
 * object-cover — so photos of any source size look consistent, and a
 * missing/broken source degrades to a placeholder instead of a broken-image
 * icon.
 */
export function ProxiedImage({ src, alt, className = "" }: ProxiedImageProps) {
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
      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external source proxied through /api/proxy, next/image remotePatterns would need constant upkeep */}
      <img
        src={resolved}
        alt={alt}
        loading="lazy"
        onError={() => setErrored(true)}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
