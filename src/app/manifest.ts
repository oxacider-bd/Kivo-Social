import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KIVO — Social, but cleaner.",
    short_name: "KIVO",
    description:
      "A fast, modern social space. Share moments, join Spaces, and keep your conversations clean.",
    start_url: "/",
    display: "standalone",
    background_color: "#1b1917",
    theme_color: "#1b1917",
    icons: [
      { src: "/brand/kivo-mark-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/kivo-mark.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
