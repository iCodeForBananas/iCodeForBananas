import ProgressionNavigator from "../components/ProgressionNavigator";

export default function HarmonicFlowPage() {
  return (
    <main className='px-4 py-6 flex-1 metronome-static'>
      <div className='w-full lg:max-w-4xl lg:mx-auto'>
        <div className='rounded-lg p-6 bg-white'>
          <div className='text-center mb-10'>
            <h1 className='text-5xl font-bold drop-shadow-lg' style={{ color: "#000" }}>Harmonic Flow</h1>
            <p className='text-lg mt-3' style={{ color: "#000" }}>Build beautiful chord progressions interactively</p>
          </div>
          <div className='p-6'>
            <ProgressionNavigator startKey='G' bpm={80} />
          </div>
        </div>
      </div>
    </main>
  );
}
