import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "CollabSpace",
  description: "A real-time collaborative workspace",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans bg-dotgrid">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
