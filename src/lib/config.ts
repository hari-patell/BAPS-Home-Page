export const SOURCES = {
  dailySatsang: "https://www.baps.org/Daily-Satsang.aspx",
  vicharan: "https://www.baps.org/vicharan.aspx",
  baseUrl: "https://www.baps.org/",
};

// How long fetched HTML is cached before Next.js re-fetches, in seconds.
export const REVALIDATE_SECONDS = {
  dailySatsang: 1800, // 30 min — new "Daily" content each morning
  vicharan: 3600, // 1 hr — travel schedule updates less often
};

export interface QuickLink {
  label: string;
  href: string;
}

// Edit this list to change the icon row under the search bar.
export const QUICK_LINKS: QuickLink[] = [
  { label: "BAPS.org", href: "https://www.baps.org/" },
  { label: "Daily Satsang", href: "https://www.baps.org/Daily-Satsang.aspx" },
  { label: "Vicharan", href: "https://www.baps.org/vicharan.aspx" },
  { label: "Media Gallery", href: "https://www.baps.org/Media.aspx" },
  { label: "Mandirs", href: "https://www.baps.org/Global-Network/Mandirs.aspx" },
];

export const SEARCH_ENGINE_URL = "https://www.google.com/search";
