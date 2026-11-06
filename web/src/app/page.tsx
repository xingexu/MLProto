"use client";

import { useEffect, useState } from "react";
import { AnswerCard, CompareCard } from "@/components/AnswerCard";
import { api, ApiError, type Answer, type Mode, todayIso } from "@/lib/api";

const EXAMPLES = [
  {
    label: "B-10 scope, Sep 2023",
    question: "Does B-10 cover all third-party arrangements or only outsourcing?",
    asOf: "2023-09-01",
    commitment: "",
  },
  {
    label: "Grandfathered mortgage",
    question: "Which qualifying rate applies to an uninsured mortgage pre-approved before the change?",
    asOf: "2021-07-15",
    commitment: "2021-05-10",
  },
  {
    label: "E-21 resilience, Mar 2025",
    question: "What are the expectations for operational resilience and critical operations?",
    asOf: "2025-03-01",
    commitment: "",
  },
  {
    label: "Scenario testing, today",
    question: "When must scenario testing of all critical operations be completed?",
    asOf: "",
    commitment: "",
  },
];

type Results = Partial<Record<Mode, Answer>>;

export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [asOf, setAsOf] = useState("");
  const [commitment, setCommitment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Results | null>(null);

  useEffect(() => setAsOf(todayIso()), []);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const q = question.trim();
    const errs: Record<string, string> = {};
    if (q.length < 3) errs.question = "Enter a question of at least 3 characters.";
    if (!asOf) errs.asOf = "Pick a date.";
    if (commitment && asOf && commitment > asOf) errs.commitmentDate = "Must be on or before the as-of date.";
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    setError(null);
    try {
      const modes: Mode[] = ["lifecycle", "recency", "baseline"];
      const answers = await Promise.all(
        modes.map((mode) =>
          api<Answer>("ask", {
            method: "POST",
            body: JSON.stringify({ question: q, asOf, mode, commitmentDate: commitment || null }),
          }),
        ),
      );
      setResults(Object.fromEntries(modes.map((m, i) => [m, answers[i]])) as Results);
    } catch (err) {
      const e = err as ApiError;
      setError(e.message);
      if (e.fields) setFieldErrors(e.fields);
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  function applyExample(ex: (typeof EXAMPLES)[number]) {
    setQuestion(ex.question);
    setAsOf(ex.asOf || todayIso());
    setCommitment(ex.commitment);
    setFieldErrors({});
  }

  return (
    <>
      <section className="hero">
        <h1>Which rule applies on that date?</h1>
        <p className="lede">
          Ask about OSFI guidelines B-20, B-10 or E-21. InForce tells you which version is in force, and flags drafts,
          rules not yet effective, phased sections and grandfathered cases.
        </p>
      </section>

      <form className="card form" onSubmit={submit} noValidate>
        <label htmlFor="q">Question</label>
        <textarea
          id="q"
          rows={3}
          maxLength={500}
          placeholder="e.g. What is the minimum qualifying rate for uninsured mortgages?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          aria-invalid={!!fieldErrors.question}
          aria-describedby={fieldErrors.question ? "q-err" : undefined}
        />
        {fieldErrors.question && (
          <p id="q-err" className="field-error">
            {fieldErrors.question}
          </p>
        )}

        <div className="row">
          <div className="field">
            <label htmlFor="asof">As of</label>
            <input id="asof" type="date" min="2000-01-01" max="2035-12-31" value={asOf}
                   onChange={(e) => setAsOf(e.target.value)} aria-invalid={!!fieldErrors.asOf} />
            {fieldErrors.asOf && <p className="field-error">{fieldErrors.asOf}</p>}
          </div>
          <div className="field">
            <label htmlFor="commit">
              Approved or committed on <span className="muted">(optional)</span>
            </label>
            <input id="commit" type="date" min="2000-01-01" max="2035-12-31" value={commitment}
                   onChange={(e) => setCommitment(e.target.value)} aria-invalid={!!fieldErrors.commitmentDate} />
            {fieldErrors.commitmentDate && <p className="field-error">{fieldErrors.commitmentDate}</p>}
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Checking…" : "Ask"}
          </button>
        </div>

        <div className="examples" aria-label="Example questions">
          <span className="muted small">Try:</span>
          {EXAMPLES.map((ex) => (
            <button key={ex.label} type="button" className="chip" onClick={() => applyExample(ex)}>
              {ex.label}
            </button>
          ))}
        </div>
      </form>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}

      {results?.lifecycle && (
        <>
          <AnswerCard answer={results.lifecycle} />
          {results.recency && results.baseline && (
            <section className="compare-section">
              <h2>How a plain RAG pipeline answers the same question</h2>
              <div className="grid-2">
                <CompareCard answer={results.baseline} label="Standard RAG"
                             blurb="Top search result, dates ignored" />
                <CompareCard answer={results.recency} label="Recency fix"
                             blurb="Newest document published by the date" />
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
