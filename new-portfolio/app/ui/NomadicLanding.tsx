"use client";

import { Volume2, VolumeX } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { StoryButton } from "./StoryButton";

const assetRoot = "/20260819210011936";

export function NomadicLanding() {
  const [muted, setMuted] = useState(false);
  const [starting, setStarting] = useState(false);

  function startExperience() {
    if (starting) return;

    setStarting(true);
    window.dispatchEvent(new CustomEvent("portfolio:start"));
  }

  return (
    <main className={`nomadic-landing${starting ? " is-starting" : ""}`}>
      <div className="paper-grain" aria-hidden="true" />

      <section className="landing-stage" aria-label="Nomadic Tribe introduction">
        <div className="panel side-panel side-panel-left">
          <Image
            src={`${assetRoot}/left-block-borders.png`}
            alt="Illustrated hillside and foliage"
            fill
            sizes="20vw"
            priority
          />
        </div>

        <div className="center-arch" aria-hidden="true">
          <Image src={`${assetRoot}/center-block_img.png`} alt="" fill sizes="57vw" priority />
        </div>

        <div className="center-corner center-corner-left" aria-hidden="true" />
        <div className="center-corner center-corner-right" aria-hidden="true" />
        <div className="center-bar center-bar-left" aria-hidden="true" />
        <div className="center-bar center-bar-right" aria-hidden="true" />

        <div className="panel side-panel side-panel-right">
          <Image
            src={`${assetRoot}/right-block-borders.png`}
            alt="Illustrated forest and flowers"
            fill
            sizes="20vw"
            priority
          />
        </div>

        <div className="bottom-panel bottom-panel-left" aria-hidden="true">
          <Image src={`${assetRoot}/left-bot-tex.png`} alt="" fill sizes="13vw" />
          <span />
        </div>
        <div className="bottom-panel bottom-panel-right" aria-hidden="true">
          <Image src={`${assetRoot}/right-bot-tex.png`} alt="" fill sizes="13vw" />
          <span />
        </div>

        <StoryButton
          onClick={startExperience}
          disabled={starting}
        >
          {starting ? "ENTERING" : "START"}
        </StoryButton>
      </section>

      <button
        className="sound-toggle"
        type="button"
        aria-label={muted ? "Enable sound" : "Mute sound"}
        aria-pressed={muted}
        onClick={() => setMuted((value) => !value)}
      >
        {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
      </button>

      <div className="entry-wash" aria-hidden="true" />
    </main>
  );
}
