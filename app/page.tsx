export default function Home() {
  return (
    <main className='flex min-h-screen w-full flex-col items-center justify-center py-32 px-16 bg-white/10 dark:bg-white/10 metronome-static'>
      <div className='w-full max-w-4xl flex flex-col gap-4'>
        {[...Array(10)].map((_, index) => (
          <div
            key={index}
            className='bg-white/50 dark:bg-white/50 p-6 rounded-[20px] shadow-lg transition-all'
            style={{
              marginLeft: index % 2 === 0 ? "50px" : "0",
              marginRight: index % 2 === 0 ? "0" : "50px",
            }}
          >
            <h3 className='text-xl font-semibold text-black dark:text-white'>Container {index + 1}</h3>
            <p className='text-gray-800 dark:text-gray-200 mt-2'>This is container number {index + 1}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
