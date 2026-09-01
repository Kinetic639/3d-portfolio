import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StoryButton } from "../ui/StoryButton";

export const metadata: Metadata = {
  title: "Design System · Michał Stępień",
  description: "Portfolio interface design-system workspace.",
};

export default function DesignSystemPage() {
  return (
    <main className="design-page">
      <header className="design-header">
        <Link href="/" className="design-back"><ArrowLeft />Portfolio</Link>
        <span>UI reference · 0.1</span>
      </header>
      <section className="design-title">
        <p>Portfolio interface system</p>
        <h1>Design<br />system</h1>
      </section>
      <section className="design-workspace" aria-label="Design-system preview workspace">
        <div className="design-component-heading">
          <span>01 · Control</span>
          <h2>Start button</h2>
        </div>
        <div className="design-button-preview" aria-label="Button shape variants">
          <div className="design-button-row">
            <StoryButton shape="arch">Back</StoryButton>
            <StoryButton>Start</StoryButton>
            <StoryButton shape="capsule">View project</StoryButton>
          </div>
          <div className="design-button-row design-button-row--generated">
            <StoryButton shape="pill">Continue</StoryButton>
            <StoryButton shape="oval">Explore</StoryButton>
            <StoryButton shape="circle" aria-label="Continue">
              <ArrowRight aria-hidden="true" />
            </StoryButton>
          </div>
        </div>
      </section>
    </main>
  );
}
