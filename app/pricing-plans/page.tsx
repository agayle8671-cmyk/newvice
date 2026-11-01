import type { Metadata } from "next";
import { PricingPlansView } from "@/components/newspaper/StaticPagesView";

export const metadata: Metadata = {
  title: "Pricing & Membership Plans — Leonida Vice",
  description: "Open access citizen pass and upcoming supporter tiers for Leonida Vice.",
};

export default function PricingPlansRoute() {
  return <PricingPlansView />;
}
