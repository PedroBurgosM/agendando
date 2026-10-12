import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: [
    '192.168.1.184',
    '192.168.1.184:3000',
    'localhost:3000',
  ],
};

export default nextConfig;
