import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { Roboto } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import "./components/fretboard.css";
import { Theme } from "@radix-ui/themes";
import { ThemeProvider } from "./lib/ThemeContext";
import { FavoriteChordsProvider } from "./lib/FavoriteChordsContext";
import Sidebar from "./components/Sidebar";
import MusicFavoritesBar from "./components/MusicFavoritesBar";
import PathnameTitleSync from "./components/PathnameTitleSync";
import CopyPageHandler from "./components/CopyPageHandler";
import InstallPrompt from "./components/InstallPrompt";

/**
 * Every face on the site — UI chrome, song titles, library headers, all of
 * it — used to split across Geist Sans and Fraunces; both are gone in favor
 * of one family. Loaded as a variable font (no `weight` means the full wght
 * axis, 100-900, ships in one file) so every weight and both styles the app
 * asks for — regular, the 500/600 the design system actually uses, bold if
 * something reaches for it, italic — resolve without a second font load.
 * `--ds-font-sans` and `--ds-font-display` both point at it in globals.css;
 * see tokens/README.md for why that distinction still exists as a class name
 * even though it no longer names a different family.
 *
 * Geist Mono is not part of this: `.leadsheet-doc` (the lyric and chord
 * pane) depends on every glyph advancing the same width to keep a chord over
 * its syllable, `npm run type:check` proves that alignment holds, and a
 * proportional face would silently break it.
 */
const roboto = Roboto({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-roboto",
  display: "swap",
});

/**
 * The browser chrome sits on the same plane as the page, so this is
 * color.surface.base in each theme rather than the brand. Written as sRGB
 * because the meta tag is read before any stylesheet: these are exactly what
 * `oklch(0.19 0.009 80)` and `oklch(0.97 0.004 85)` resolve to, and
 * `npm run tokens:check` is what keeps those two values honest.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#16130f" },
  ],
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
      // Dark is what :root carries in app/tokens.css, so it is also what the
      // server renders. The inline script below corrects it before first paint.
      data-theme='dark'
      className={`dark ${roboto.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Inline theme init — runs before paint to prevent flash. data-theme
            is the only switch: app/tokens.css keys the light half of Layer 2
            off [data-theme="light"], and globals.css points Tailwind's `dark:`
            variant at the same attribute. The server renders data-theme="dark"
            below, which is the token default; this corrects it to light before
            the first paint when that is what the visitor wants. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme:dark)').matches;var dark=t==='dark'||(t===null&&d);var h=document.documentElement;h.setAttribute('data-theme',dark?'dark':'light');h.classList.toggle('dark',dark);h.classList.toggle('light',!dark)}catch(e){}})()`,
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
          {/* Radix Themes for every component in the app. appearance='inherit'
              reads the dark/light class on <html>, which the script above sets
              before paint and ThemeContext keeps in step with data-theme, so
              Radix never renders a theme of its own first. Colors, fonts and
              cursors are bound to the brand tokens in globals.css. */}
          <Theme appearance='inherit' accentColor='amber' grayColor='slate' radius='medium' panelBackground='solid' hasBackground={false}>
            <FavoriteChordsProvider>
              <div id='app-shell' className='flex h-dvh overflow-hidden bg-surface-base font-sans text-ink-primary'>
                <Sidebar />
                <div id='main-content' className='flex-1 min-w-0 overflow-y-auto flex flex-col bg-surface-base'>
                  <MusicFavoritesBar />
                  {children}
                </div>
              </div>
            </FavoriteChordsProvider>
          </Theme>
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
