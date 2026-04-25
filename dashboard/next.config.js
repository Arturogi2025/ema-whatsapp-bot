const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow Next.js to trace/import files from the monorepo root (lib/, api/)
  outputFileTracingRoot: path.join(__dirname, '../'),
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  // Disable default fetch cache so Supabase queries always return fresh data.
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
  },
  // When importing files from root lib/ (../lib/*), webpack resolves their
  // dependencies against the root node_modules, which isn't installed by Vercel.
  // This tells webpack to also look in dashboard/node_modules for all packages.
  webpack: (config) => {
    config.resolve.modules = [
      ...config.resolve.modules,
      path.join(__dirname, 'node_modules'),
    ];
    return config;
  },
};

module.exports = nextConfig;
