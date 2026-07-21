import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VLXD Hien Xa",
  description: "He thong van hanh cua hang vat lieu xay dung",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
