import { formatAssetReport, processAssets } from "../lib/assets/asset-pipeline";

/**
 * pnpm assets           optimises the models in assets/models into public/assets/models
 * pnpm assets --force   rebuilds every model, changed or not
 *
 * Runs before `next dev` and `next build`. Exits 1 when a model or its
 * asset.json is broken, so a bad asset stops the build instead of the page.
 */
async function main() {
  const report = await processAssets({ force: process.argv.includes("--force") });
  console.log(formatAssetReport(report));
  if (report.errors.length > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
