# Space Math for iPad

Space Math pulled out of the main site into its own app: Vite + React for the
game, wrapped in a native iOS shell with [Capacitor](https://capacitorjs.com).
It runs fully offline. Nothing is sent to a server.

## Progress

All progress lives on the iPad in `localStorage`:

| Key                   | What                                                                  |
| --------------------- | --------------------------------------------------------------------- |
| `space-math-save`     | Star count and the spaced-repetition ladder (same format as the site) |
| `space-math-progress` | Per-skill lifetime totals plus the last 14 days of answers            |

The **Progress** button in the game shows the parent view built from
`space-math-progress`. **Reset** asks before clearing the ladder and never
touches the history. Deleting the app deletes its progress.

## Install on the iPad from Windows

1. Every push to `main` that touches `space-math-ios/` runs the **Space Math
   iOS** GitHub Action, which builds an unsigned `SpaceMath.ipa` on a Mac
   runner. Open the latest run under the repo's Actions tab (or start one with
   **Run workflow**) and download the `SpaceMath-ipa` artifact. Unzip it.
2. Install [Sideloadly](https://sideloadly.io) and iTunes (the apple.com
   installer, not the Microsoft Store one) on Windows.
3. Plug the iPad in by USB and tap **Trust** on it.
4. In Sideloadly, drop in `SpaceMath.ipa`, enter your Apple ID, and click
   **Start**. It signs the app with your Apple ID and installs it.
5. On the iPad: Settings → General → VPN & Device Management → trust your
   Apple ID. On iPadOS 16+, also turn on Settings → Privacy & Security →
   Developer Mode (needs a restart).

With a free Apple ID the signature lasts 7 days. Re-run step 4 to refresh it.
Progress survives a refresh as long as the bundle ID
(`com.icodeforbananas.spacemath`) stays the same, because Sideloadly updates
the app in place. A paid Apple Developer account makes it last a year.

## Working on it

```
npm install
npm run dev        # play it in a browser
npm test           # scheduler, generator and progress-store tests
npm run ios:sync   # build and copy into ios/ (then Xcode on a Mac: npm run ios:open)
```

`src/lib/spaceMath*.ts` are copies of `app/lib/spaceMath*.ts` from the main
site. Changes to the question set have to be made in both places.
