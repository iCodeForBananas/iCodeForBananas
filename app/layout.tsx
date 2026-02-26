import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import "./components/fretboard.css";
import { ThemeProvider } from "./lib/ThemeContext";
import Sidebar from "./components/Sidebar";

export const metadata: Metadata = {
  title: "iCodeForBananas - Music Theory Tools",
  description: "Interactive music theory tools including harmonic flow and guitar fretboard explorer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en'>
      <head>
        <Script async src='https://www.googletagmanager.com/gtag/js?id=G-P12WB5Q85R' strategy='afterInteractive' />
        <Script id='google-analytics' strategy='afterInteractive'>
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-P12WB5Q85R');
          `}
        </Script>
      </head>
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
        <ThemeProvider>
          <div className='flex h-screen font-sans overflow-hidden'>
            <Sidebar />
            <div className='flex-1 min-w-0 overflow-auto'>{children}</div>
          </div>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
