/** @type {import('next').NextConfig} */
const csp = [
  "default-src 'self'",
  // Next.js needs inline scripts; AdSense (when ads are on) loads from Google.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://pagead2.googlesyndication.com https://*.googlesyndication.com",
  "style-src 'self' 'unsafe-inline'",
  // Cover art comes from TikTok CDNs; ads may serve images too.
  "img-src 'self' data: https:",
  "media-src 'self' https: blob:",
  "connect-src 'self'",
  "font-src 'self' data:",
  "frame-src https://*.googlesyndication.com https://googleads.g.doubleclick.net",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
];

const nextConfig = {
  reactStrictMode: true,
  // Hide "X-Powered-By: Next.js" so the stack is not advertised.
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.tiktokcdn.com' },
      { protocol: 'https', hostname: '**.tikwm.com' },
      { protocol: 'https', hostname: '**.tiktok.com' },
    ],
  },
  async headers() {
    return [
      {
        // Security headers on every page and API route. The old wildcard
        // CORS on /api/* was removed: the frontend calls the API
        // same-origin, so no cross-origin access is needed.
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
