import type { Metadata } from "next";
import AdminNewsroomView from "@/components/newspaper/AdminNewsroomView";

export const metadata: Metadata = {
  title: "Newsroom Studio — Leonida Vice Admin",
  description: "Uniform broadsheet article composer and editorial desk for Leonida Vice.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminPage() {
  return <AdminNewsroomView />;
}
