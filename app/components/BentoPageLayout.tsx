"use client";

interface BentoPageLayoutProps {
  title: string;
  maxWidth?: string;
  children: React.ReactNode;
}

export default function BentoPageLayout({ title, maxWidth, children }: BentoPageLayoutProps) {
  return (
    <div className='flex flex-col flex-1 min-h-0'>
      <main className='flex flex-col flex-1 min-h-0 p-2 sm:p-4'>
        <div
          className={`flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden bg-white dark:bg-neutral-900${maxWidth ? ` ${maxWidth} mx-auto` : ""}`}
          style={{ border: "1px solid var(--border-color)" }}
        >
          <div className='border-b shrink-0' style={{ borderColor: "var(--border-color)" }}>
            <div className='px-4 pt-2 pb-1.5 sm:px-6 sm:pt-3 sm:pb-2.5'>
              <h1 className='text-lg sm:text-xl font-bold leading-tight text-black dark:text-yellow-400'>
                {title}
              </h1>
            </div>
          </div>
          <div className='flex-1 overflow-auto p-4 sm:p-6 flex flex-col'>{children}</div>
        </div>
      </main>
    </div>
  );
}
