import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "idevelopit-vault",
    short_name: "iDevelop Vault",
    description: "A private workspace for client relationships, work, billing, and spending.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f5f6f8",
    theme_color: "#171a23",
    icons: [
      {
        src: "/idevelopit-vault-logo.jpeg",
        sizes: "512x512",
        type: "image/jpeg",
        purpose: "any",
      },
    ],
  };
}
