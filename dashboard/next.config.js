/** @type {import('next').NextConfig} */
const nextConfig = {
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
