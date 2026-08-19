import type { TextBlock } from "@/lib/types";

export function PrernaParimalCard({ block }: { block?: TextBlock }) {
  return (
    <div className="flex h-72 flex-col rounded-3xl border border-asmita/10 bg-black/20 p-5 backdrop-blur-sm">
      <h2 className="shrink-0 font-display text-lg italic text-dharma">
        {block?.heading ?? "Prerna Parimal"}
      </h2>
      {block ? (
        <div lang="gu" className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 scrollbar-thin">
          {block.title && <p className="font-semibold text-shurvirta">{block.title}</p>}
          <p className="text-sm leading-relaxed text-asmita/80">{block.body}</p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-asmita/40">Not available right now.</p>
      )}
    </div>
  );
}
