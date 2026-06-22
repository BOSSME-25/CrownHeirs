import type { Metadata } from "next";
import "./globals.css";
import FlashToast from "@/components/FlashToast";
import MessagesDock from "@/components/MessagesDock";
import { FONT_PRESETS, getOrgSettings } from "@/lib/orgConfig";

export const metadata: Metadata = {
  title: "Crown Heirs — Team Hub",
  description: "Internal knowledge base, handbook, policies and training for the Crown Heirs team.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Per-tenant branding — font pairing + accent colour applied via CSS variables.
  let accent: string | null = null;
  let preset = FONT_PRESETS.crown;
  try {
    const { settings } = await getOrgSettings();
    if (settings.accent && /^#[0-9a-fA-F]{6}$/.test(settings.accent)) accent = settings.accent;
    if (settings.font && FONT_PRESETS[settings.font]) preset = FONT_PRESETS[settings.font];
  } catch {
    // DB not ready — fall back to defaults
  }
  const brandCss = `:root{${accent ? `--terra:${accent};--accent:${accent};--terra-hi:${accent};` : ""}--font-serif:${preset.serif};--font-display:${preset.display};--font-ui:${preset.ui};}`;

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href={preset.href} rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: brandCss }} />
      </head>
      <body>
        <FlashToast />
        {children}
        <MessagesDock />
      </body>
    </html>
  );
}
