import { ArrowRight, Layers3 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const assetRoot = "/20260819210011936";

export default function Home() {
  return (
    <main className="welcome-page">
      <header className="welcome-header">
        <Link className="welcome-mark" href="/">
          <span>MS</span>
          <strong>Michał Stępień</strong>
        </Link>
        <nav className="welcome-nav" aria-label="Primary navigation">
          <Link href="/demo">Visual demo</Link>
          <Link href="/design-system">Design system</Link>
        </nav>
      </header>

      <section className="welcome-scene">
        <div className="welcome-side welcome-side-left">
          <Image src={`${assetRoot}/left-block-borders.png`} alt="Illustrated landscape" fill sizes="24vw" priority />
        </div>
        <div className="welcome-center" aria-hidden="true">
          <Image src={`${assetRoot}/center-block_img.png`} alt="" fill sizes="55vw" priority />
        </div>
        <div className="welcome-side welcome-side-right">
          <Image src={`${assetRoot}/right-block-borders.png`} alt="Illustrated forest" fill sizes="24vw" priority />
        </div>
        <div className="welcome-ornament welcome-ornament-left" aria-hidden="true" />
        <div className="welcome-ornament welcome-ornament-right" aria-hidden="true" />

        <div className="welcome-copy">
          <p>Welcome to the portfolio of</p>
          <h1>Michał<br />Stępień</h1>
          <span>Creative developer building playful 3D interfaces</span>
          <div className="welcome-actions">
            <Link className="storybook-button" href="/demo"><span>Enter demo</span><ArrowRight /></Link>
            <Link className="welcome-text-link" href="/design-system"><Layers3 />View design system</Link>
          </div>
        </div>
      </section>

      <footer className="welcome-footer"><span>Interactive portfolio · Work in progress</span><span>2026</span></footer>
    </main>
  );
}
