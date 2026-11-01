import type { Metadata } from "next";
import { PrivacyPolicyView } from "@/components/newspaper/StaticPagesView";

export const metadata: Metadata = {
  title: "Privacy & Fan-Site Policy — Leonida Vice",
  description: "Privacy policy and non-commercial Rockstar Games fan-site disclosure.",
};

export default function PrivacyPolicyRoute() {
  return <PrivacyPolicyView />;
}
