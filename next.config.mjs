/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false, // app.disable('x-powered-by')
  reactStrictMode: true,
  // Node-only packages stay external to the server bundle (native engines, require-time file access).
  serverExternalPackages: ['@prisma/client', '.prisma/client', 'bcryptjs', 'nodemailer', 'node-cron', 'swagger-ui-dist'],
};

export default nextConfig;
