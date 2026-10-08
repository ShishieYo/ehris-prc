import type { NextConfig } from "next";

// Security headers that do not depend on a per-request nonce live here; the
// Content-Security-Policy (which needs a nonce) is set in src/proxy.ts.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Cache Components is deliberately NOT enabled: every page here is
  // per-user and contains personal data, so nothing should be shared or
  // cached across requests.
  experimental: {
    // Document uploads go through a server action (max file size is 10 MB by
    // default; see documents.max_size_mb) — leave room for multipart overhead.
    serverActions: { bodySizeLimit: "12mb" },
  },
  serverExternalPackages: ["exceljs", "pdf-lib"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
