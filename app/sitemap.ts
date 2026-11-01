import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://leonidavice.com",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: "https://leonidavice.com/room/main-theater",
      lastModified: new Date(),
      changeFrequency: "always",
      priority: 0.9,
    },
  ];
}
