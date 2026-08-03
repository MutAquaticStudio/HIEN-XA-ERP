import type { Metadata } from "next";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "@fontsource/be-vietnam-pro/800.css";
import "./globals.css";
import "./elder-friendly-ui.css";
import "./design-system.css";

export const metadata: Metadata = {
  title: "VLXD Hiền Xa",
  description: "Hệ thống vận hành cửa hàng vật liệu xây dựng Hiền Xa",
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
      <body>
        <a className="skip-link" href="#noi-dung-chinh">Bỏ qua menu, đến nội dung chính</a>
        <div className="root-content" id="noi-dung-chinh" tabIndex={-1}>{children}</div>
      </body>
    </html>
  );
}
