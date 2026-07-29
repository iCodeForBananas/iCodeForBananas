"use client";

interface BentoPageLayoutProps {
  title: string;
  maxWidth?: string;
  boxClassName?: string;
  titleClassName?: string;
  children: React.ReactNode;
}

export default function BentoPageLayout({
  title,
  maxWidth,
  boxClassName,
  titleClassName,
  children,
}: BentoPageLayoutProps) {
  return (
    <div className='flex flex-col flex-1 min-h-0'>
      <main className='flex flex-col flex-1 min-h-0 pl-2 pt-2 pr-0 pb-0 sm:pl-4 sm:pt-4 sm:pr-0 sm:pb-0'>
        <div
          className={`flex flex-col flex-1 min-h-0 rounded-tl-2xl rounded-tr-none rounded-bl-none rounded-br-none overflow-hidden${maxWidth ? ` ${maxWidth} mx-auto` : ""}${boxClassName ? ` ${boxClassName}` : ""}`}
        >
          <div className='border-b shrink-0' style={{ borderColor: "var(--border-color)" }}>
            <div className='px-4 pt-2 pb-1.5 sm:px-6 sm:pt-3 sm:pb-2.5'>
              <h1
                className={`text-lg sm:text-xl font-bold leading-tight ${titleClassName ?? "text-black dark:text-yellow-400"}`}
              >
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
