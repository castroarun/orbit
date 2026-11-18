import type { Metadata } from "next";
import { Geist, Noto_Sans_Tamil } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const tamil = Noto_Sans_Tamil({ subsets: ["tamil"], weight: ["400", "500"], variable: "--font-noto-tamil" });

export const metadata: Metadata = {
  title: "Orbit",
  description: "AS Groups · Digital Marketing — internal platform",
  robots: { index: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${tamil.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
