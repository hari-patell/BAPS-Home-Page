import type { AudioTrack } from "@/lib/types";
import { AudioTrackPlayer } from "./AudioTrackPlayer";

export function DailyAudioCard({ tracks }: { tracks: AudioTrack[] }) {
  return (
    <div className="flex h-72 flex-col rounded-3xl border border-asmita/10 bg-black/20 p-5 backdrop-blur-sm">
      <h2 className="shrink-0 font-display text-lg italic text-dharma">Daily Audio</h2>
      {tracks.length > 0 ? (
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1 scrollbar-thin">
          {tracks.map((track, i) => (
            <AudioTrackPlayer key={`${track.src ?? track.title}-${i}`} track={track} />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-asmita/40">No audio available right now.</p>
      )}
    </div>
  );
}
