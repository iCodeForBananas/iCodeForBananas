import Songwriter from "../components/Songwriter";
import PinnedChordProgression from "../components/PinnedChordProgression";

export default function SongwriterPage() {
  return (
    <div className='flex flex-col flex-1'>
      {/* <PinnedChordProgression /> */}
      <main className='relative min-h-screen px-3 py-2 metronome-static flex-1'>
        <div className='relative w-full lg:mx-auto h-full'>
          <Songwriter />
        </div>
      </main>
    </div>
  );
}
