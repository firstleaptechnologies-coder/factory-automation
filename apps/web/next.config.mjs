/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @decor/shared ships TypeScript source, so Next must compile it rather than
  // expect a prebuilt package.
  transpilePackages: ['@decor/shared'],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api',
  },
};

export default nextConfig;
