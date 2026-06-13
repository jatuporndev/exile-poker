import type { Metadata } from "next";
import { Shantell_Sans, Kanit } from "next/font/google";
import "./globals.css";

// Playful body/game text and titles.
const playful = Shantell_Sans({
  subsets: ["latin"],
  variable: "--font-playful",
  display: "swap",
});

// Serious / functional text: codes, inputs, names, numbers.
const serious = Kanit({
  weight: ["400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
  variable: "--font-serious",
  display: "swap",
});

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
    <html
      lang="en"
      className={`${playful.variable} ${serious.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
