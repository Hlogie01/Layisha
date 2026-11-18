import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Layisha Driver",
    short_name: "Layisha",
    description: "Your delivery stops, proof of delivery and cash, even without signal.",
    start_url: "/d",
    scope: "/",
    display: "standalone",
    background_color: "#F6F4EF",
    theme_color: "#14181F",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
