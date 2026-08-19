export interface DarshanImage {
  src: string;
  caption?: string;
  date?: string;
}

export interface AudioTrack {
  title: string;
  subtitle?: string;
  src?: string;
}

export interface TextBlock {
  heading?: string;
  title?: string;
  body: string;
  citation?: string;
}

export interface VicharanEntry {
  date: string;
  location: string;
  image?: string;
  href?: string;
}

export interface DailySatsangData {
  hinduDate?: string;
  prernaParimal?: TextBlock;
  vachanamrutGems?: TextBlock;
  audio: AudioTrack[];
  darshan: {
    murti: DarshanImage[];
    swamishri: DarshanImage[];
  };
  sourceUrl: string;
  fetchedAt: string;
  ok: boolean;
  error?: string;
}

export interface VicharanData {
  entries: VicharanEntry[];
  scheduleNote?: string;
  scheduleHref?: string;
  sourceUrl: string;
  fetchedAt: string;
  ok: boolean;
  error?: string;
}

export interface DashboardData {
  satsang: DailySatsangData;
  vicharan: VicharanData;
  generatedAt: string;
}
