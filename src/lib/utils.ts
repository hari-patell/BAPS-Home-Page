/** Routes a baps.org asset URL through our own /api/proxy (see that route for why). */
export function proxiedAssetUrl(src?: string): string | undefined {
  if (!src) return undefined;
  if (src.startsWith("data:")) return src;
  return `/api/proxy?src=${encodeURIComponent(src)}`;
}
