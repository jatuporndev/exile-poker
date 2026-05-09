import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Exile Poker",
  description: "A real-time poker app for friends.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
