import { Inter, Space_Grotesk } from "next/font/google";

/** Display/label typeface for the dark UI concept ("DISPLAY" / "UI-LABEL" in the reference). */
export const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--dsd-font-display",
});

/** Body typeface for the dark UI concept ("BODY" in the reference). */
export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--dsd-font-body",
});
