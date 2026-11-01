import type { Metadata } from "next";
import { NewsletterPageView } from "@/components/newspaper/StaticPagesView";

export const metadata: Metadata = {
  title: "Newsletter — Leonida Vice",
  description: "Subscribe to the Leonida Vice GTA VI dispatch.",
};

export default function NewsletterRoute() {
  return <NewsletterPageView />;
}
