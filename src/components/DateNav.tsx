import { ChevronLeft, ChevronRight } from "lucide-react";

export function DateNav({ hinduDate }: { hinduDate?: string }) {
  const today = new Date().toLocaleDateString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled
        aria-label="Previous day"
        title="Archive browsing isn't available yet"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-asmita/10 text-asmita/25"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div className="text-right">
        <div className="font-display text-lg text-asmita">{today}</div>
        {hinduDate && <div className="text-xs text-shurvirta/80">{hinduDate}</div>}
      </div>
      <button
        type="button"
        disabled
        aria-label="Next day"
        title="Archive browsing isn't available yet"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-asmita/10 text-asmita/25"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
