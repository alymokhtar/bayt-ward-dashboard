import withPWAInit, { runtimeCaching as defaultRuntimeCaching } from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    runtimeCaching: defaultRuntimeCaching.filter(
      (route) => route.options?.cacheName !== "apis",
    ),
  },
});

export default withPWA({
  images: {
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "105mb",
    },
  },
});
