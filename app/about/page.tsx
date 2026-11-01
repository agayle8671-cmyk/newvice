import type { Metadata } from "next";
import { AboutPageView } from "@/components/newspaper/StaticPagesView";

export const metadata: Metadata = {
  title: "About Us — Leonida Vice",
  description: "Meet the editorial desk behind Leonida Vice.",
};

export default function AboutRoute() {
  return <AboutPageView />;
}
