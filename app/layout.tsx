import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import "./components/fretboard.css";
import { ThemeProvider } from "./lib/ThemeContext";
import { FavoriteChordsProvider } from "./lib/FavoriteChordsContext";
import Sidebar from "./components/Sidebar";
import MusicFavoritesBar from "./components/MusicFavoritesBar";
import PwaRegistration from "./components/PwaRegistration";
import PathnameTitleSync from "./components/PathnameTitleSync";
import CopyPageHandler from "./components/CopyPageHandler";

export const viewport: Viewport = {
  themeColor: "#facc15",
};

export const metadata: Metadata = {
  title: {
    default: "iCodeForBananas",
    template: "%s | iCodeForBananas",
  },
  description: "Interactive music theory tools including harmonic flow and guitar fretboard explorer",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "iCodeForBananas",
  },
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
          <FavoriteChordsProvider>
            <div id='app-shell' className='flex h-dvh overflow-hidden font-sans'>
              <Sidebar />
              <div id='main-content' className='flex-1 min-w-0 overflow-y-auto flex flex-col'>
                <MusicFavoritesBar />
                {children}
              </div>
            </div>
          </FavoriteChordsProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
        <PwaRegistration />
        <PathnameTitleSync />
        <CopyPageHandler />
      </body>
    </html>
  );
}
