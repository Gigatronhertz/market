/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the database driver and the existing API on the server.
  serverExternalPackages: ['qrcode', 'bcryptjs', 'stripe'],
  poweredByHeader: false,
  // The API files are loaded at runtime from ./server, so they must be shipped with every route.
  outputFileTracingIncludes: { '/**/*': ['./server/**/*'] },
};
export default nextConfig;
