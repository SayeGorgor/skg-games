"use client";

import Link from "next/link";
import { useState } from "react";
import { AdSlot } from "@/components/ad-slot";
import { SiteHeader } from "@/components/site-header";
import { getAnonymousId, markLocalSolved } from "@/lib/client-progress";
import type { AlibiCase } from "@/lib/games/alibi";

async function persist(caseData: AlibiCase, solved: boolean, suspect: string) {
  try {
    await fetch("/api/games/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        gameSlug: "daily-alibi",
        challengeNumber: caseData.challengeNumber,
        solved,
        anonymousId: getAnonymousId(),
        result: { suspect },
      }),
    });
  } catch {}
}

export function AlibiGame({ caseData }: { caseData: AlibiCase }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<{
    correct: boolean;
    explanation: string;
    name: string;
  } | null>(null);

  function accuse() {
    if (!selected || result) return;
    const suspect = caseData.suspects.find((s) => s.key === selected)!;
    const next = {
      correct: suspect.correct,
      explanation: suspect.explanation,
      name: suspect.name,
    };
    setResult(next);
    if (suspect.correct) markLocalSolved("alibi");
    void persist(caseData, suspect.correct, suspect.key);
  }

  return (
    <main className="alibi-shell">
      <SiteHeader />
      <section className="alibi-hero container">
        <span className="case-pill">
          CASE #{caseData.challengeNumber} • SUNDAY, OCT 25
        </span>
        <h1>{caseData.title}</h1>
        <p>{caseData.dek}</p>
      </section>
      <section className="container alibi-layout">
        <div className="alibi-main">
          <article className="alibi-brief">
            <span className="eyebrow red">CASE BRIEF</span>
            <h2>{caseData.briefTitle}</h2>
            <p>{caseData.brief}</p>
            <div className="objective">
              <i />
              {caseData.objective}
            </div>
          </article>
          <div className="evidence">
            <div className="section-heading">
              <h2>Evidence</h2>
              <span>4 CLUES</span>
            </div>
            {caseData.clues.map((clue, i) => (
              <div className="clue" key={clue}>
                <b>{String(i + 1).padStart(2, "0")}</b>
                <span>{clue}</span>
              </div>
            ))}
          </div>
        </div>
        <aside className="alibi-rail">
          <div className="alibi-stat">
            <span className="eyebrow gold">YOUR RUN</span>
            <strong>14 days</strong>
            <div>
              <span>
                11<small>solved</small>
              </span>
              <span>
                78%<small>accuracy</small>
              </span>
            </div>
          </div>
          <AdSlot />
          <div className="alibi-how">
            <h3>How to play</h3>
            <p>
              <b>1</b>Read the case
            </p>
            <p>
              <b>2</b>Connect the clues
            </p>
            <p>
              <b>3</b>Accuse one suspect
            </p>
          </div>
        </aside>
      </section>
      <section className="container suspects">
        <div className="section-heading">
          <h2>Choose your suspect</h2>
          <span>YOU GET ONE ACCUSATION</span>
        </div>
        <div className="suspect-grid">
          {caseData.suspects.map((s) => (
            <button
              key={s.key}
              disabled={!!result}
              onClick={() => setSelected(s.key)}
              className={`suspect-card ${selected === s.key ? "selected" : ""}`}
            >
              <span className="avatar">{s.initial}</span>
              <strong>{s.name}</strong>
              <b>{s.role}</b>
              <p>{s.statement}</p>
            </button>
          ))}
        </div>
      </section>
      <section className="container accusation">
        <div>
          <h3>
            {result
              ? result.correct
                ? "Case closed."
                : "That alibi holds up."
              : "Ready to make your case?"}
          </h3>
          <p>
            {result
              ? result.explanation
              : "Select one suspect. Your accusation is final for today’s case."}
          </p>
        </div>
        {result ? (
          <Link className="button alibi-button" href="/">
            Back to SKG Games
          </Link>
        ) : (
          <button
            className="button alibi-button"
            disabled={!selected}
            onClick={accuse}
          >
            Make accusation
          </button>
        )}
      </section>
      <footer className="alibi-footer container">
        DAILY ALIBI • A NEW CASE EVERY DAY{" "}
        <span>Privacy &nbsp; Terms &nbsp; Feedback</span>
      </footer>
    </main>
  );
}
