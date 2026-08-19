import { Clock } from "./Clock";
import { SearchBar } from "./SearchBar";
import { QuickLinks } from "./QuickLinks";
import { DateNav } from "./DateNav";

export function Header({ hinduDate }: { hinduDate?: string }) {
  return (
    <header className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
      <div className="flex items-center justify-center gap-4 text-shurvirta/90">
        <span className="h-px w-10 bg-shurvirta/40 sm:w-16" />
        <h1 className="font-display text-xl italic tracking-wide sm:text-2xl">
          Jay Swaminarayan
        </h1>
        <span className="h-px w-10 bg-shurvirta/40 sm:w-16" />
      </div>

      <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <Clock />
        <div className="w-full lg:max-w-xl">
          <SearchBar />
        </div>
        <DateNav hinduDate={hinduDate} />
      </div>

      <div className="mt-6 flex justify-center lg:justify-start">
        <QuickLinks />
      </div>
    </header>
  );
}
