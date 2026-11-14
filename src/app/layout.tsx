import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orbit",
  description: "AS Groups · Digital Marketing — internal platform",
  robots: { index: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
