const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig = {
  images: {
    unoptimized: true,
  },
  assetPrefix: basePath ? `${basePath}/` : undefined,
  basePath: basePath || undefined,
};

export default nextConfig;
