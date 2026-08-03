import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VLXD Hiền Xa ERP",
    short_name: "VLXD HX",
    description: "Hệ thống vận hành ERP cho cửa hàng vật liệu xây dựng Hiền Xa.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f7f8",
    theme_color: "#1d6f92",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any"
      }
    ]
  };
}
