/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '8mb' },
  },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
