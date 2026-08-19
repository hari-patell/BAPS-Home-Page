import { BookOpen, Compass, Home, Images, Landmark, Link2 } from "lucide-react";
import { QUICK_LINKS } from "@/lib/config";

const ICONS: Record<string, typeof Home> = {
  "BAPS.org": Home,
  "Daily Satsang": BookOpen,
  Vicharan: Compass,
  "Media Gallery": Images,
  Mandirs: Landmark,
};

export function QuickLinks() {
  return (
    <div className="flex items-center gap-3">
      {QUICK_LINKS.map((link) => {
        const Icon = ICONS[link.label] ?? Link2;
        return (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            title={link.label}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-asmita/10 bg-black/25 text-shurvirta transition hover:border-shurvirta/40 hover:bg-black/40"
          >
            <Icon className="h-4 w-4" />
            <span className="sr-only">{link.label}</span>
          </a>
        );
      })}
    </div>
  );
}
