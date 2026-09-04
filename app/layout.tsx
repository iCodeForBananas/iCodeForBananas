import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Fraunces } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import "./components/fretboard.css";
import { ThemeProvider } from "./lib/ThemeContext";
import { FavoriteChordsProvider } from "./lib/FavoriteChordsContext";
import Sidebar from "./components/Sidebar";
import MusicFavoritesBar from "./components/MusicFavoritesBar";
import PathnameTitleSync from "./components/PathnameTitleSync";
import CopyPageHandler from "./components/CopyPageHandler";
import InstallPrompt from "./components/InstallPrompt";

/**
 * Song titles and library headers only. Fraunces carries an optical size axis,
 * so the letterforms are redrawn rather than just scaled as the size changes;
 * `font-optical-sizing: auto` in globals.css is what makes the browser use it.
 *
 * Loaded as a variable font, which next/font requires in order to request the
 * opsz axis at all. That means the weight axis ships continuous rather than as
 * the three named weights the system uses; the rule against 700 is enforced by
 * not writing it, not by the font file. See font.weight in tokens/.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-fraunces",
  display: "swap",
});

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
    // The font variables go on <html>, not <body>: they are referenced from
    // :root in globals.css, and a custom property whose value points at a
    // variable defined further down the tree computes to nothing at all.
    <html
      lang='en'
      className={`${GeistSans.variable} ${GeistMono.variable} ${fraunces.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Inline theme init — runs before paint to prevent flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme:dark)').matches;if(t==='dark'||(t===null&&d)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
        {/* Chrome offers the install prompt once, early — often before React
            has hydrated — and hands it to the page to fire later. Stash it
            here so InstallPrompt can adopt it whenever it mounts. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{window.__installPromptEvent=null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__installPromptEvent=e;window.dispatchEvent(new Event('installpromptready'))});window.addEventListener('appinstalled',function(){window.__installPromptEvent=null})}catch(e){}})()`,
          }}
        />
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
      <body className='antialiased'>
        <ThemeProvider>
          <FavoriteChordsProvider>
            <div id='app-shell' className='flex h-dvh overflow-hidden font-sans'>
              <Sidebar />
              <div id='main-content' className='flex-1 min-w-0 overflow-y-auto flex flex-col bg-black'>
                <MusicFavoritesBar />
                {children}
              </div>
            </div>
          </FavoriteChordsProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
        <PathnameTitleSync />
        <CopyPageHandler />
        <InstallPrompt />
      </body>
    </html>
  );
}
