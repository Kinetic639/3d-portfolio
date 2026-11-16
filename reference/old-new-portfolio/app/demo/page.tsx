import type { Metadata } from "next";
import { NomadicLanding } from "../ui/NomadicLanding";

export const metadata: Metadata = {
  title: "Visual Demo · Michał Stępień",
  description: "A reconstructed interactive landing composition.",
};

export default function DemoPage() {
  return <NomadicLanding />;
}
