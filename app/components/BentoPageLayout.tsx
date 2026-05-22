"use client";

interface BentoPageLayoutProps {
  title: string;
  maxWidth?: string;
  children: React.ReactNode;
}

export default function BentoPageLayout({ title, maxWidth, children }: BentoPageLayoutProps) {
  return (
    <div className='flex flex-col flex-1 min-h-0'>
      <main className='flex flex-col flex-1 min-h-0 pr-4 py-4'>
        <div
          className={`flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden${maxWidth ? ` ${maxWidth} mx-auto` : ""}`}
          style={{ background: "#fff", border: "1px solid var(--border-color)" }}
        >
          <div className='border-b shrink-0' style={{ borderColor: "var(--border-color)" }}>
            <div className='px-6 pt-6 pb-5'>
              <h1 className='text-3xl font-bold leading-tight' style={{ color: "#000" }}>
                {title}
              </h1>
            </div>
          </div>
          <div className='flex-1 overflow-auto p-6'>{children}</div>
        </div>
      </main>
    </div>
  );
}
