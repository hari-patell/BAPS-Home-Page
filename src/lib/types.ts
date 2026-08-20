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

/** A single photo from a Vicharan day page, with its on-page caption. */
export interface VicharanPhoto {
  image: string;
  caption?: string;
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
  /** The day these photos are from, e.g. "18-Aug-2026". */
  date?: string;
  /** Where that day's Vicharan took place, e.g. "Ahmedabad, India". */
  location?: string;
  /** The day page all the photos were pulled from. */
  detailUrl?: string;
  /** Every photo on the latest day's page, in document order. */
  photos: VicharanPhoto[];
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
