import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Slick Solutions",
  description: "Baseline Next.js + Convex project scaffold"
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
