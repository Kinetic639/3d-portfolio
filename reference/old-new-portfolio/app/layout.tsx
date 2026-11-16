import type { Metadata } from "next";
import "./globals.css";
import "./portfolio-ui.css";

export const metadata: Metadata = {
  title: "Nomadic Tribe",
  description: "An illustrated journey into the portfolio world.",
  icons: {
    icon: "/20260819210011936/favicon-32x32.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
