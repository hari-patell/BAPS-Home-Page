import { Search } from "lucide-react";
import { SEARCH_ENGINE_URL } from "@/lib/config";

export function SearchBar() {
  return (
    <form
      action={SEARCH_ENGINE_URL}
      method="GET"
      target="_blank"
      className="flex w-full items-center gap-3 rounded-full border border-asmita/15 bg-black/20 px-5 py-3 backdrop-blur-sm transition focus-within:border-shurvirta/50 focus-within:bg-black/30"
    >
      <Search className="h-4 w-4 shrink-0 text-asmita/40" />
      <input
        type="text"
        name="q"
        placeholder="Search or type a URL"
        autoComplete="off"
        className="w-full bg-transparent text-sm text-asmita placeholder:text-asmita/40 focus:outline-none"
      />
    </form>
  );
}
