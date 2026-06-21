import type { Metadata } from "next";
import "./globals.css";
import FlashToast from "@/components/FlashToast";

export const metadata: Metadata = {
  title: "Crown Heirs — Team Hub",
  description: "Internal knowledge base, handbook, policies and training for the Crown Heirs team.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,400&family=Cinzel:wght@400;500&family=Jost:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <FlashToast />
        {children}
      </body>
    </html>
  );
}
