import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VLXD Hien Xa ERP",
    short_name: "VLXD HX",
    description: "He thong van hanh ERP cho cua hang vat lieu xay dung.",
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
