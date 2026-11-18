import type { Metadata, Viewport } from "next";
import { DriverApp } from "./driver-app";

export const metadata: Metadata = {
  title: "Driver",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Layisha Driver", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#14181F",
};

/**
 * The driver app. This page is fully static so the service worker can keep a
 * copy on the phone; all data loads in the browser from /api/driver/*, and is
 * saved on the phone for when there is no signal.
 */
export default function DriverPage() {
  return <DriverApp />;
}
