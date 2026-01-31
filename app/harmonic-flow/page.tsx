import ProgressionNavigator from "../components/ProgressionNavigator";

export default function HarmonicFlowPage() {
  return (
    <main className='flex min-h-screen w-full flex-col items-center justify-center py-16 px-8 bg-white/10 dark:bg-white/10 metronome-static'>
      <div className='w-full max-w-4xl flex flex-col gap-8'>
        <div className='text-center mb-4'>
          <h1 className='text-5xl font-bold text-white mb-4'>Harmonic Flow</h1>
          <p className='text-xl text-white/90'>Build beautiful chord progressions interactively</p>
        </div>

        <ProgressionNavigator startKey='G' bpm={80} />
      </div>
    </main>
  );
}
