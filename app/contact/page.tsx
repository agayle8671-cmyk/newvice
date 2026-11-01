import type { Metadata } from "next";
import { ContactPageView } from "@/components/newspaper/StaticPagesView";

export const metadata: Metadata = {
  title: "Contact & Advertising — Leonida Vice",
  description: "Contact the Leonida Vice newsroom or inquire about advertising.",
};

export default function ContactRoute() {
  return <ContactPageView />;
}
