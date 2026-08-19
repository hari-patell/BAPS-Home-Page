import { SOURCES } from "@/lib/config";

export function Footer() {
  return (
    <footer className="mx-auto w-full max-w-7xl px-4 pb-8 text-center text-xs text-asmita/30 sm:px-6 lg:px-8">
      Content from{" "}
      <a
        href={SOURCES.dailySatsang}
        target="_blank"
        rel="noreferrer"
        className="underline decoration-asmita/20 underline-offset-2 hover:text-asmita/50"
      >
        Daily Satsang
      </a>{" "}
      and{" "}
      <a
        href={SOURCES.vicharan}
        target="_blank"
        rel="noreferrer"
        className="underline decoration-asmita/20 underline-offset-2 hover:text-asmita/50"
      >
        Vicharan
      </a>{" "}
      on baps.org · Images and audio © BAPS Swaminarayan Sanstha
    </footer>
  );
}
