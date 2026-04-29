/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@localcompliance/types', '@localcompliance/utils'],

  /** Reduce noisy logs in dev */
  logging: {
    fetches: { fullUrl: false },
  },

  /** Security headers */
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },

  /**
   * Proxy API calls through Next.js server → internal API container.
   * This way only the FE needs to be exposed via Cloudflare Tunnel.
   * Browser calls /api/v1/* → Next.js rewrites to http://api:3001/api/v1/*
   */
  async rewrites() {
    const apiDestination = process.env.INTERNAL_API_URL || 'http://localhost:3001';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiDestination}/api/v1/:path*`,
      },
      {
        source: '/api/docs/:path*',
        destination: `${apiDestination}/api/docs/:path*`,
      },
    ];
  },
};

const { withSentryConfig } = require('@sentry/nextjs');

module.exports = withSentryConfig(
  nextConfig,
  {
    silent: true,
    org: "local-compliance",
    project: "web",
  },
  {
    widenClientFileUpload: true,
    transpileClientSDK: true,
    tunnelRoute: "/monitoring",
    hideSourceMaps: true,
    disableLogger: true,
  }
);
