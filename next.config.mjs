/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverComponentsExternalPackages: ["pdf-parse", "pdfkit", "exceljs"] },
  webpack: (config) => {
    config.resolve.fallback = { ...(config.resolve.fallback || {}), canvas: false };
    return config;
  }
};
export default nextConfig;
