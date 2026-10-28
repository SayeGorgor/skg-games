"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AdSlot } from "@/components/ad-slot";
import { SiteHeader } from "@/components/site-header";
import {
  getAnonymousId,
  getRestoredDailyAlibiState,
  saveDailyAlibiResult,
} from "@/lib/client-progress";
import {
  fingerprintAlibiCase,
  type AlibiCase,
  type AlibiSuspect,
  type DailyAlibiCase,
} from "@/lib/games/alibi";

async function persist(caseData: AlibiCase, solved: boolean, suspect: string) {
  try {
    await fetch("/api/games/complete", {
      method: "POST",
      keepalive: true,
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

const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
const outcomeFor = (suspect: AlibiSuspect) => ({
  correct: suspect.correct,
  explanation: suspect.explanation,
  name: suspect.name,
});

export function AlibiGame({ caseData }: { caseData: DailyAlibiCase }) {
  const ready = useSyncExternalStore(
    subscribeToHydration,
    clientReady,
    serverReady,
  );
  if (!ready)
    return (
      <main className="alibi-shell">
        <SiteHeader />
        <section className="alibi-hero container" aria-busy="true">
          <h1>{caseData.title}</h1>
          <p role="status">Loading your case...</p>
        </section>
      </main>
    );
  return (
    <AlibiSession
      key={`${caseData.challengeDate}:${caseData.challengeNumber}:${fingerprintAlibiCase(caseData)}`}
      caseData={caseData}
    />
  );
}
function AlibiSession({ caseData }: { caseData: DailyAlibiCase }) {
  const [initial] = useState(() => getRestoredDailyAlibiState(caseData));
  const [selected, setSelected] = useState<string | null>(
    initial?.accused.key ?? null,
  );
  const [result, setResult] = useState<ReturnType<typeof outcomeFor> | null>(
    () => (initial ? outcomeFor(initial.accused) : null),
  );
  const submittedRef = useRef(initial !== null);
  const resultDialog = useRef<HTMLDialogElement>(null);
  const resultButton = useRef<HTMLButtonElement>(null);
  const resultTitleId = useId();
  const resultExplanationId = useId();
  const resultTitle = result?.correct ? "Case closed." : "That alibi holds up.";

  useEffect(() => {
    if (result) resultDialog.current?.showModal();
  }, [result]);

  function accuse() {
    if (!selected || result || submittedRef.current) return;
    // Another mounted tab may already have finalized this same case.
    const restored = getRestoredDailyAlibiState(caseData);
    if (restored) {
      submittedRef.current = true;
      setSelected(restored.accused.key);
      setResult(outcomeFor(restored.accused));
      return;
    }
    const suspect = caseData.suspects.find((s) => s.key === selected);
    if (!suspect) return;
    submittedRef.current = true;
    saveDailyAlibiResult(caseData, suspect.key);
    setResult(outcomeFor(suspect));
    void persist(caseData, suspect.correct, suspect.key);
  }

  return (
    <main className="alibi-shell">
      <SiteHeader />
      <section className="alibi-hero container">
        <span className="case-pill">
          CASE #{caseData.challengeNumber} &bull;{" "}
          {new Date(caseData.challengeDate + "T12:00:00Z")
            .toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })
            .toUpperCase()}
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
              onClick={() => {
                if (result || submittedRef.current) return;
                setSelected(s.key);
              }}
              aria-pressed={selected === s.key}
              className={`suspect-card ${selected === s.key ? "selected" : ""} ${result && selected === s.key ? (result.correct ? "correct" : "incorrect") : ""}`}
            >
              <span className="avatar">{s.initial}</span>
              <strong>{s.name}</strong>
              <b>{s.role}</b>
              <p>{s.statement}</p>
            </button>
          ))}
        </div>
      </section>
      <section
        className={`container accusation ${result ? (result.correct ? "success" : "failure") : ""}`}
      >
        <div>
          <h3>{result ? resultTitle : "Ready to make your case?"}</h3>
          <p>
            {result
              ? result.explanation
              : "Select one suspect. Your accusation is final for today’s case."}
          </p>
        </div>
        {result ? (
          <div className="button-row">
            <button
              ref={resultButton}
              className="button alibi-button"
              aria-haspopup="dialog"
              onClick={() => resultDialog.current?.showModal()}
            >
              View result
            </button>
            <Link className="button alibi-button" href="/">
              Back to SKG Games
            </Link>
          </div>
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
      {result && (
        <dialog
          ref={resultDialog}
          className={`stack-help-dialog alibi-result-dialog ${result.correct ? "success" : "failure"}`}
          aria-labelledby={resultTitleId}
          aria-describedby={resultExplanationId}
          onClose={() => resultButton.current?.focus()}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            const rect = event.currentTarget.getBoundingClientRect();
            if (
              event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom
            )
              resultDialog.current?.close();
          }}
        >
          <div className="stack-help-content">
            <header className="stack-help-heading">
              <span className="eyebrow gold">
                DAILY ALIBI &middot; CASE #{caseData.challengeNumber}
              </span>
              <button
                className="stack-help-close"
                aria-label="Close accusation result"
                onClick={() => resultDialog.current?.close()}
                autoFocus
              >
                &times;
              </button>
            </header>
            <div className="alibi-result-heading">
              <span className="alibi-result-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 32 32"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {result.correct ? (
                    <path d="m8 16 5 5 11-11" />
                  ) : (
                    <path d="m10 10 12 12m0-12L10 22" />
                  )}
                </svg>
              </span>
              <span className="eyebrow">
                {result.correct ? "CASE SOLVED" : "ACCUSATION UNSUCCESSFUL"}
              </span>
              <h2 id={resultTitleId}>{resultTitle}</h2>
            </div>
            <div className="alibi-result-suspect">
              <span className="eyebrow">YOUR ACCUSATION</span>
              <strong>{result.name}</strong>
            </div>
            <p className="alibi-result-explanation" id={resultExplanationId}>
              {result.explanation}
            </p>
            <div className="alibi-result-actions">
              <button
                className="button"
                onClick={() => resultDialog.current?.close()}
              >
                Review evidence
              </button>
              <Link className="button alibi-button" href="/">
                Back to SKG Games
              </Link>
            </div>
          </div>
        </dialog>
      )}
      <footer className="alibi-footer container">
        DAILY ALIBI • A NEW CASE EVERY DAY{" "}
        <span>Privacy &nbsp; Terms &nbsp; Feedback</span>
      </footer>
    </main>
  );
}
