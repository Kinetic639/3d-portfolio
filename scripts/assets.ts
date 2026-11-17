import { formatAssetReport, processAssets } from "../lib/assets/asset-pipeline";
import { buildMinimaps } from "../lib/minimap/minimap-image";

/**
 * pnpm assets           optimises the models in assets/models into public/assets/models,
 *                       and draws every map's minimap into public/assets/minimap
 * pnpm assets --force   rebuilds every model, changed or not
 *
 * Runs before `next dev` and `next build`. Exits 1 when a model or its
 * asset.json is broken, so a bad asset stops the build instead of the page.
 */
async function main() {
  const report = await processAssets({ force: process.argv.includes("--force") });
  console.log(formatAssetReport(report));
  if (report.errors.length > 0) process.exit(1);
  const minimaps = await buildMinimaps();
  console.log(`Minimaps: ${minimaps.map(({ mapId, bytes }) => `${mapId} ${(bytes / 1024).toFixed(0)} KB`).join(", ")}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
