import type { Metadata } from "next";
import { brand, brandCssVariables } from "@/brand.config";
import "./globals.css";

export const metadata: Metadata = {
  title: `${brand.name} — Growth OS`,
  description: brand.tagline,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <head>
        {/* Brand tokens are emitted from brand.config.ts so a single file reskins the app. */}
        <style dangerouslySetInnerHTML={{ __html: brandCssVariables() }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
