import type { Answer, Citation } from "@/lib/api";
import { fmtDate } from "@/lib/api";
import { StatusBadge, STATUS_LABEL } from "./StatusBadge";

function Source({ c, label }: { c: Citation; label: string }) {
  const approximate = c.verification !== "verified";
  return (
    <div className="source">
      <div className="source-head">
        <span className="eyebrow">{label}</span>
        <span className="source-meta">
          {c.regulation} · {c.kind === "draft" ? "Draft" : c.kind === "letter" ? "Letter" : "Guideline"} · published{" "}
          {fmtDate(c.published)}
          {c.effective_from ? ` · effective ${fmtDate(c.effective_from)}` : ""}
        </span>
      </div>
      <p className="source-title">{c.document}</p>
      <blockquote>
        <strong>{c.heading}.</strong> {c.text}
      </blockquote>
      <div className="source-foot">
        <a href={c.source_url} target="_blank" rel="noopener noreferrer">
          Open source ↗
        </a>
        {approximate && (
          <span className="warn" title={c.verification}>
            Date not fully verified
          </span>
        )}
      </div>
    </div>
  );
}

export function AnswerCard({ answer }: { answer: Answer }) {
  return (
    <article className="card answer" aria-live="polite">
      <div className="answer-head">
        <StatusBadge status={answer.status} />
        <span className="muted">as of {fmtDate(answer.as_of)}</span>
      </div>
      <p className="answer-text">{answer.answer}</p>

      {answer.notes.length > 0 && (
        <ul className="notes">
          {answer.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      {answer.citation && <Source c={answer.citation} label="Cited" />}
      {answer.previous && <Source c={answer.previous} label="Replaced this earlier version" />}

      {answer.candidates.length > 1 && (
        <details className="versions">
          <summary>All {answer.candidates.length} versions of this rule on this date</summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Published</th>
                  <th>Effective</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {answer.candidates.map((c) => (
                  <tr key={c.passage_id} className={c.passage_id === answer.citation?.passage_id ? "row-active" : ""}>
                    <td>{c.document}</td>
                    <td className="nowrap">{fmtDate(c.published)}</td>
                    <td className="nowrap">{c.effective_from ? fmtDate(c.effective_from) : "—"}</td>
                    <td>
                      <StatusBadge status={c.status} size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </article>
  );
}

export function CompareCard({ answer, label, blurb }: { answer: Answer; label: string; blurb: string }) {
  const wrong = answer.true_status !== null && answer.true_status !== "IN_FORCE" && answer.status === "IN_FORCE";
  return (
    <div className={`card compare ${wrong ? "compare-wrong" : ""}`}>
      <div className="compare-head">
        <strong>{label}</strong>
        <span className="muted small">{blurb}</span>
      </div>
      <p>{answer.answer}</p>
      {answer.citation && (
        <p className="small muted">
          Cites: {answer.citation.document} ({fmtDate(answer.citation.published)})
        </p>
      )}
      {wrong && answer.true_status && (
        <p className="verdict-bad">
          Presented as in force, but this version is actually <strong>{STATUS_LABEL[answer.true_status].toLowerCase()}</strong> on
          this date.
        </p>
      )}
      {!wrong && answer.citation && <p className="verdict-ok">Cites a version that is in force on this date.</p>}
    </div>
  );
}
