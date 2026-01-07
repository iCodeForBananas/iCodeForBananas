import ProgressionNavigator from "../components/ProgressionNavigator";

export default function HarmonicFlowPage() {
  return (
    <div
      className='flex min-h-screen font-sans bg-cover bg-center bg-fixed'
      style={{
        backgroundImage:
          "url(https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=100&w=3000)",
      }}
    >
      {/* Sidebar */}
      <aside className='w-52 bg-white/10 dark:bg-white/10 text-white p-6 flex flex-col gap-4 border-r border-white/20'>
        <h2 className='text-xl font-bold'>Sidebar</h2>
        <nav className='flex flex-col gap-2'>
          <a href='/' className='hover:text-zinc-300 transition-colors'>
            Home
          </a>
          <a href='#' className='hover:text-zinc-300 transition-colors'>
            About
          </a>
          <a href='#' className='hover:text-zinc-300 transition-colors'>
            Services
          </a>
          <a href='#' className='hover:text-zinc-300 transition-colors'>
            Contact
          </a>
          <a href='/harmonic-flow' className='hover:text-zinc-300 transition-colors'>
            Harmonic Flow
          </a>
        </nav>
      </aside>

      {/* Main Content */}
      <main className='flex min-h-screen w-full flex-col items-center justify-center py-16 px-8 bg-white/10 dark:bg-white/10'>
        <div className='w-full max-w-4xl flex flex-col gap-8'>
          <div className='text-center mb-4'>
            <h1 className='text-5xl font-bold text-white mb-4'>Harmonic Flow</h1>
            <p className='text-xl text-white/90'>Build beautiful chord progressions interactively</p>
          </div>

          <ProgressionNavigator startKey='G' bpm={80} />
        </div>
      </main>
    </div>
  );
}
