/** @type {import('next').NextConfig} */
const nextConfig = {
  // Packages the API loads at runtime: left out of the bundle and copied into the deployment.
  serverExternalPackages: ['qrcode', 'bcryptjs', 'stripe', 'express', 'light-my-request'],
  poweredByHeader: false,
  // The API files are loaded at runtime from ./server, so they must be shipped with every route.
  outputFileTracingIncludes: { '/**/*': ['./server/**/*', './node_modules/light-my-request/**/*', './node_modules/express/**/*'] },
};
export default nextConfig;
