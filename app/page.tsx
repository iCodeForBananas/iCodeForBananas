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
      <aside className='w-52 bg-zinc-800/20 dark:bg-zinc-900/20 text-white p-6 flex flex-col gap-4 border-r border-white/20'>
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
        </nav>
      </aside>

      {/* Main Content */}
      <main className='flex min-h-screen w-full flex-col py-32 px-16 bg-white/20 dark:bg-black/20'>
        {/* Your content goes here */}
      </main>
    </div>
  );
}
