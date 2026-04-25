const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow Next.js to trace/import files from the monorepo root (lib/, api/)
  outputFileTracingRoot: path.join(__dirname, '../'),
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  // Disable default fetch cache so Supabase queries always return fresh data.
  // This is a safety net on top of the per-client cache:'no-store' in supabase.ts.
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
  },
};

module.exports = nextConfig;
