import type { Metadata } from "next";
import ProgressionNavigator from "../components/ProgressionNavigator";

export const metadata: Metadata = { title: "Harmonic Flow" };

export default function HarmonicFlowPage() {
  return (
    <div className='flex flex-col flex-1'>
      <main className='pr-4 py-4 flex-1 '>
        <div className='rounded-lg p-6 bg-white'>
          <div className='text-center mb-10'>
            <h1 className='text-5xl font-bold drop-shadow-lg' style={{ color: "#000" }}>
              Harmonic Flow
            </h1>
            <p className='text-lg mt-3' style={{ color: "#000" }}>
              Build beautiful chord progressions interactively
            </p>
          </div>
          <div className='p-6'>
            <ProgressionNavigator startKey='G' bpm={80} />
          </div>
        </div>
      </main>
    </div>
  );
}
