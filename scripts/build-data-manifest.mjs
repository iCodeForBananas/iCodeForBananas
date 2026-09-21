/**
 * Writes public/data/manifest.json, the listing the backtester page reads to
 * know which datasets exist. Run with `npm run data:manifest`; the build runs
 * it too. See scripts/lib/data-manifest.mjs for why this is a file.
 */
import { writeManifest } from "./lib/data-manifest.mjs";

console.log(`public/data/manifest.json: ${writeManifest()} datasets`);
