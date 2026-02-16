import type { ReactElement, ReactNode } from "react";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Slick Solutions",
  description: "Sequential multi-tenant self-assessment platform scaffold",
};

type RootLayoutProps = Readonly<{ children: ReactNode }>;

export default function RootLayout({ children }: RootLayoutProps): ReactElement {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
