import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Layisha Driver",
    short_name: "Layisha",
    description: "Your delivery stops, proof of delivery and cash, even without signal.",
    start_url: "/d",
    scope: "/",
    display: "standalone",
    background_color: "#f5f5f4",
    theme_color: "#0f766e",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
