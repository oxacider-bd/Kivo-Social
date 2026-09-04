import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel builds with its own optimized output; standalone is for self-hosting
  // (`bun run build:standalone` + `bun run start`).
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  reactStrictMode: false,
  // Expose the VITE_* Supabase variable names to the browser bundle.
  // (Next.js only inlines NEXT_PUBLIC_* by default; this mapping honors the
  // VITE_* naming requested for the Supabase integration. Values still live
  // exclusively in environment variables — nothing is hardcoded here.
  // NEXT_PUBLIC_* equivalents are supported as a fallback in src/lib/supabase.ts.)
  env: {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  },
};

export default nextConfig;
