import type { Metadata, Viewport } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Layisha",
    template: "%s · Layisha",
  },
  description:
    "Run your deliveries in one place: orders, drivers, proof of delivery and cash, built for South African businesses.",
};

export const viewport: Viewport = {
  themeColor: "#14181F",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-ZA" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-chalk text-ink">
        {children}
      </body>
    </html>
  );
}
