/**
 * The site's own address, for the absolute URLs search engines need
 * (canonical, hreflang). SITE_URL wins when set (a custom domain, or a local
 * production server under test); on Vercel it is the project's production
 * domain, so preview deployments also point search engines at production.
 */
export function siteUrl(): URL {
  if (process.env.SITE_URL) return new URL(process.env.SITE_URL);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  return new URL("http://localhost:3000");
}
