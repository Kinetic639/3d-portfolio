import LandingPage from "@/components/site/LandingPage";
import { homeMetadata } from "@/components/site/site-pages";

export const metadata = homeMetadata("en");

export default function Home() {
  return <LandingPage locale="en" />;
}
