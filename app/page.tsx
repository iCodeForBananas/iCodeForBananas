export default function Home() {
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
          <a href='#' className='hover:text-zinc-300 transition-colors'>
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
          <a href='#' className='hover:text-zinc-300 transition-colors'>
            Harmonic Flow
          </a>
        </nav>
      </aside>

      {/* Main Content */}
      <main className='flex min-h-screen w-full flex-col items-center justify-center py-32 px-16 bg-white/10 dark:bg-white/10'>
        <div className='w-full max-w-4xl flex flex-col gap-4'>
          {[...Array(10)].map((_, index) => (
            <div key={index} className='bg-white/50 dark:bg-white/50 p-6 rounded-[20px] shadow-lg'>
              <h3 className='text-xl font-semibold text-black dark:text-white'>Container {index + 1}</h3>
              <p className='text-gray-800 dark:text-gray-200 mt-2'>This is container number {index + 1}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
