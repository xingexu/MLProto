"use client";

import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { api, ApiError, type EvalReport, fmtDate, type Mode, pct } from "@/lib/api";

const MODES: { id: Mode; label: string; blurb: string }[] = [
  { id: "baseline", label: "Standard RAG", blurb: "Top search result; ignores dates" },
  { id: "recency", label: "Recency fix", blurb: "Newest document published by the date" },
  { id: "lifecycle", label: "InForce", blurb: "Resolves draft, effective, phased and grandfathered states" },
];

const TYPE_LABEL: Record<string, string> = {
  current: "Current rule",
  point_in_time: "Point in time",
  draft_trap: "Draft exists",
  not_yet_effective: "Final, not yet effective",
  phased: "Phased sections",
  grandfathered: "Grandfathered",
  reaffirmed: "Reconfirmed unchanged",
};

export default function QualityPage() {
  const [report, setReport] = useState<EvalReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyFailures, setOnlyFailures] = useState(false);

  useEffect(() => {
    api<EvalReport>("eval").then(setReport).catch((e: ApiError) => setError(e.message));
  }, []);

  const types = useMemo(
    () => (report ? Object.keys(report.modes.lifecycle.by_type) : []),
    [report],
  );

  const rows = useMemo(() => {
    if (!report) return [];
    return report.modes.lifecycle.rows.map((r, i) => ({
      base: report.modes.baseline.rows[i],
      rec: report.modes.recency.rows[i],
      life: r,
    })).filter((r) => !onlyFailures || !r.base.correct || !r.rec.correct || !r.life.correct);
  }, [report, onlyFailures]);

  if (error) return <div className="alert" role="alert">{error}</div>;
  if (!report) return <div className="card skeleton" aria-busy="true">Running evaluation…</div>;

  return (
    <>
      <section className="hero">
        <h1>Answer quality</h1>
        <p className="lede">
          {report.n_questions} date-sensitive questions, scored for each strategy. An answer counts as correct only
          if it cites the right version <em>and</em> reports the right status.
        </p>
      </section>

      <div className="grid-3">
        {MODES.map((m) => {
          const s = report.modes[m.id];
          return (
            <div key={m.id} className={`card metric ${m.id === "lifecycle" ? "metric-accent" : ""}`}>
              <div className="metric-label">{m.label}</div>
              <div className="muted small">{m.blurb}</div>
              <div className="metric-row">
                <div>
                  <div className="metric-value">{pct(s.accuracy)}</div>
                  <div className="small muted">correct</div>
                </div>
                <div>
                  <div className={`metric-value ${s.confident_stale_rate > 0 ? "bad" : "good"}`}>
                    {pct(s.confident_stale_rate)}
                  </div>
                  <div className="small muted">confidently stale</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h2 className="card-title">Accuracy by question type</h2>
        <div className="bars" role="table" aria-label="Accuracy by question type and strategy">
          {types.map((t) => (
            <div key={t} className="bar-group" role="row">
              <div className="bar-label" role="rowheader">
                {TYPE_LABEL[t] ?? t} <span className="muted small">n={report.modes.lifecycle.by_type[t].n}</span>
              </div>
              <div className="bar-stack">
                {MODES.map((m) => {
                  const v = report.modes[m.id].by_type[t]?.accuracy ?? 0;
                  return (
                    <div key={m.id} className="bar-line" role="cell">
                      <span className="bar-name small">{m.label}</span>
                      <span className="bar-track">
                        <span className={`bar-fill fill-${m.id}`} style={{ width: `${Math.max(v * 100, 0.5)}%` }} />
                      </span>
                      <span className="bar-val small">{pct(v)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title-row">
          <h2 className="card-title">Every question</h2>
          <label className="check">
            <input type="checkbox" checked={onlyFailures} onChange={(e) => setOnlyFailures(e.target.checked)} />
            Only questions some strategy gets wrong
          </label>
        </div>
        <div className="table-wrap">
          <table className="eval-table">
            <thead>
              <tr>
                <th>Question</th>
                <th>As of</th>
                <th>Correct status</th>
                {MODES.map((m) => <th key={m.id} className="center">{m.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ base, rec, life }) => (
                <tr key={life.qid}>
                  <td>
                    <div>{life.question}</div>
                    <div className="small muted">{TYPE_LABEL[life.type] ?? life.type}</div>
                  </td>
                  <td className="nowrap">{fmtDate(life.as_of)}</td>
                  <td><StatusBadge status={life.expected_status} size="sm" /></td>
                  {[base, rec, life].map((r, i) => (
                    <td key={i} className="center"
                        title={`Cited ${r.cited ?? "nothing"}; actual status ${r.true_status ?? "n/a"}`}>
                      {r.correct ? <span className="tick">✓</span> : (
                        <span className={r.confident_stale ? "cross stale" : "cross"}>
                          ✗{r.confident_stale ? " stale" : ""}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted caveat">
          Caveat: this is a {report.n_questions}-question seed set, and InForce reads curated effective dates. Its perfect score shows
          the logic is correct when metadata is right; the open research question is how it holds up when dates
          must be extracted automatically.
        </p>
      </div>
    </>
  );
}
