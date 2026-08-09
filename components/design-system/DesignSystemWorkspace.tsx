"use client";

import { Layers, Sparkles } from "lucide-react";
import { useState } from "react";
import {
  Badge,
  Button,
  Dialog,
  HoverTooltipCard,
  IconButton,
  KeyValue,
  LocationArrivalOverlay,
  Panel,
  TextAreaField,
  TextField,
  WelcomeHero,
} from "@/components/ui";
import styles from "./DesignSystemWorkspace.module.css";

const COLOR_TOKENS: { name: string; description: string }[] = [
  { name: "--background", description: "Page background" },
  { name: "--foreground", description: "Primary text" },
  { name: "--muted", description: "Secondary text" },
  { name: "--surface", description: "Solid card/dialog surface" },
  { name: "--panel", description: "Glass panel fill" },
  { name: "--border", description: "Hairline borders" },
  { name: "--accent", description: "Brand accent" },
  { name: "--accent-strong", description: "Accent hover/emphasis" },
  { name: "--accent-soft", description: "Accent tint fill" },
  { name: "--warning", description: "Warning text" },
  { name: "--danger", description: "Destructive actions" },
];

const BUTTON_VARIANTS = ["primary", "secondary", "ghost", "danger"] as const;
const BADGE_VARIANTS = ["neutral", "accent", "success", "warning", "danger"] as const;

export default function DesignSystemWorkspace({ enabled }: { enabled: boolean }) {
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!enabled) {
    return (
      <main className={styles.page}>
        <section className={styles.unavailable}>
          <h1>Design system disabled</h1>
          <p>Enable it in development or set the explicit design-system flag for production builds.</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>Design system</p>
        <h1>DOM &amp; web UI kit</h1>
        <p className={styles.lede}>
          Reusable, non-3D building blocks — welcome screens, dialogs, panels, buttons, badges and form fields — for
          everything on this site that renders as regular HTML rather than the WebGL scene or the map editor&apos;s
          dark tool UI. Components live in <code>components/ui</code> and read their colors, radii and shadows from
          the tokens below.
        </p>
      </header>

      <section className={styles.section} id="dark-concept">
        <h2>Dark UI concept (in progress)</h2>
        <p className={styles.sectionLede}>
          1:1 recreations from the new concept art, both built on the shared <code>CutCornerPanel</code> shape
          (rounded rect, top-right corner cut and filled with an accent triangle). Colors in <code>.dsd-scope</code>{" "}
          are a best-effort read of the reference; exact hex values are still to be confirmed against the source
          file.
        </p>
        <div className={`dsd-scope ${styles.darkStage}`}>
          <HoverTooltipCard
            eyebrow="Project 03"
            title="Inventory Platform"
            description="Warehouse inventory management system"
            actionLabel="View project"
          />
          <LocationArrivalOverlay index="03" title="Projects" metaLines={["Selected work", "2023 – 2026"]} stopCount={5} activeStop={2} />
        </div>
      </section>

      <section className={styles.section} id="colors">
        <h2>Color tokens</h2>
        <p className={styles.sectionLede}>Defined once in <code>app/globals.css</code> and reused by every primitive.</p>
        <div className={styles.swatchGrid}>
          {COLOR_TOKENS.map((token) => (
            <div key={token.name} className={styles.swatchCard}>
              <span className={styles.swatch} style={{ background: `var(${token.name})` }} aria-hidden="true" />
              <div>
                <code>{token.name}</code>
                <p>{token.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section} id="typography">
        <h2>Typography</h2>
        <div className={styles.typeStack}>
          <p className={styles.typeKicker}>Kicker / eyebrow</p>
          <h3 className={styles.typeHeading}>Heading</h3>
          <p className={styles.typeBody}>
            Body copy uses the muted foreground color for secondary emphasis, sized for comfortable reading inside
            panels and dialogs.
          </p>
          <code className={styles.typeMono}>--font-mono for metrics, coordinates and code</code>
        </div>
      </section>

      <section className={styles.section} id="buttons">
        <h2>Buttons</h2>
        <p className={styles.sectionLede}><code>Button</code> and <code>IconButton</code> from <code>components/ui/Button.tsx</code>.</p>
        <div className={styles.row}>
          {BUTTON_VARIANTS.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant[0].toUpperCase() + variant.slice(1)}
            </Button>
          ))}
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
        <div className={styles.row}>
          <Button size="sm" icon={<Sparkles size={14} />}>
            Small with icon
          </Button>
          <IconButton label="Layers">
            <Layers size={16} />
          </IconButton>
          <IconButton label="Active state" active>
            <Layers size={16} />
          </IconButton>
        </div>
      </section>

      <section className={styles.section} id="badges">
        <h2>Badges</h2>
        <p className={styles.sectionLede}><code>Badge</code> from <code>components/ui/Badge.tsx</code>.</p>
        <div className={styles.row}>
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant} dot>
              {variant}
            </Badge>
          ))}
        </div>
      </section>

      <section className={styles.section} id="panels">
        <h2>Panels</h2>
        <p className={styles.sectionLede}><code>Panel</code> from <code>components/ui/Panel.tsx</code>.</p>
        <div className={styles.panelGrid}>
          <Panel title="Glass panel" actions={<IconButton label="Layers"><Layers size={14} /></IconButton>}>
            <p>Default variant — translucent, blurred, sits on top of the 3D scene or page background.</p>
            <KeyValue label="Variant" value="glass" />
            <KeyValue label="Backdrop filter" value="blur(12px)" mono />
          </Panel>
          <Panel title="Solid panel" glass={false}>
            <p>Opaque surface for content that needs full contrast, like a dialog body or a settings page section.</p>
            <KeyValue label="Variant" value="solid" />
            <KeyValue label="Background" value="var(--surface)" mono />
          </Panel>
        </div>
      </section>

      <section className={styles.section} id="forms">
        <h2>Form fields</h2>
        <p className={styles.sectionLede}><code>TextField</code> / <code>TextAreaField</code> from <code>components/ui/Field.tsx</code>.</p>
        <Panel glass={false} className={styles.formPanel}>
          <TextField label="Name" placeholder="Ada Lovelace" />
          <TextField label="Email" type="email" placeholder="ada@example.com" hint="We only use this to reply." />
          <TextAreaField label="Message" placeholder="What are you building?" />
        </Panel>
      </section>

      <section className={styles.section} id="dialog">
        <h2>Dialog</h2>
        <p className={styles.sectionLede}><code>Dialog</code> from <code>components/ui/Dialog.tsx</code> — portal, Escape/backdrop close, focus restore.</p>
        <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="Example dialog"
          description="This is the shared Dialog primitive — the same one any confirmation, settings, or preview surface should use."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => setDialogOpen(false)}>
                Confirm
              </Button>
            </>
          }
        >
          <TextField label="Project name" placeholder="New portfolio" />
        </Dialog>
      </section>

      <section className={styles.section} id="hero">
        <h2>Welcome hero</h2>
        <p className={styles.sectionLede}>
          <code>WelcomeHero</code> from <code>components/ui/WelcomeHero.tsx</code> — extracted from the experience&apos;s
          welcome screen so the same kicker/title entrance can be reused for other intros.
        </p>
        <div className={styles.heroStage}>
          <WelcomeHero kicker="Welcome" title="Michał Stępień" subtitle="Software engineer building playful, technical interfaces." actions={<Button variant="primary">Enter</Button>} />
        </div>
      </section>
    </main>
  );
}
