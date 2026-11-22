import LandingPage from "@/components/site/LandingPage";
import { homeMetadata } from "@/components/site/site-pages";

export const metadata = homeMetadata("pl");

export default function PolishHome() {
  return <LandingPage locale="pl" />;
}
