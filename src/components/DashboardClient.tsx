"use client";

import { useCallback, useState } from "react";
import type { DashboardData } from "@/lib/types";
import { Header } from "./Header";
import { VicharanCarousel } from "./VicharanCarousel";
import { DarshanPanel } from "./DarshanPanel";
import { IconRail } from "./IconRail";
import { PrernaParimalCard } from "./PrernaParimalCard";
import { VachanamrutGemsCard } from "./VachanamrutGemsCard";
import { DailyAudioCard } from "./DailyAudioCard";

export function DashboardClient({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState(initialData);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      // keep showing the last good data on a failed refresh
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <Header hinduDate={data.satsang.hinduDate} />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        {/* Row 1: the latest Vicharan and the Murti / Swamishri darshan sit
            side by side on desktop, with the icon rail beside them. They stack
            on smaller screens. */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
          <div className="h-[360px] sm:h-[420px] lg:h-[520px] lg:flex-[2]">
            <VicharanCarousel
              date={data.vicharan.date}
              location={data.vicharan.location}
              photos={data.vicharan.photos}
              scheduleNote={data.vicharan.scheduleNote}
              scheduleHref={data.vicharan.scheduleHref}
            />
          </div>
          <div className="h-[360px] sm:h-[420px] lg:h-[520px] lg:flex-1">
            <DarshanPanel
              murti={data.satsang.darshan.murti}
              swamishri={data.satsang.darshan.swamishri}
            />
          </div>
          <IconRail onRefresh={refresh} refreshing={refreshing} />
        </div>

        {/* Row 2: the reading + audio cards. */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <PrernaParimalCard block={data.satsang.prernaParimal} />
          <VachanamrutGemsCard block={data.satsang.vachanamrutGems} />
          <DailyAudioCard tracks={data.satsang.audio} />
        </div>
      </main>
    </div>
  );
}
