import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // This project is self-contained; don't let a stray lockfile higher up the tree become the workspace root.
  turbopack: { root: process.cwd() },
  images: { unoptimized: true },
};

export default nextConfig;
