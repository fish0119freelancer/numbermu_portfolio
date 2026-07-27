import { workItems } from '../data/work';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://numbermu-portfolio.onrender.com';

export default function sitemap() {
  const staticRoutes = ['', '/about', '/work', '/art', '/type'];
  const workRoutes = workItems
    .filter((item) => item.slug)
    .map((item) => `/work/${encodeURIComponent(item.slug)}`);

  return [...staticRoutes, ...workRoutes].map((route) => ({
    url: `${siteUrl}${route}`,
  }));
}
