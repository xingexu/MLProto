import type { Timeline, TimelineVersion } from "@/lib/api";
import { fmtDate } from "@/lib/api";
import { STATUS_LABEL } from "./StatusBadge";

const W = 960;
const PAD_L = 16;
const PAD_R = 16;
const TOP = 36;
const LANE = 64;

function toDays(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

const FILL: Record<string, string> = {
  IN_FORCE: "var(--ok)",
  SUPERSEDED: "var(--muted-fill)",
  NOT_YET_EFFECTIVE: "var(--warn)",
  GRANDFATHERED: "var(--info)",
  NOT_PUBLISHED: "var(--muted-fill)",
};

export function TimelineChart({ data }: { data: Timeline }) {
  const all = data.rules.flatMap((r) => r.versions);
  const dates = all.flatMap((v) => [v.published, v.effective_from].filter(Boolean) as string[]).concat(data.as_of);
  const minYear = Math.min(...dates.map((d) => Number(d.slice(0, 4))));
  const maxYear = Math.max(...dates.map((d) => Number(d.slice(0, 4)))) + 1;
  const start = toDays(`${minYear}-01-01`);
  const end = toDays(`${maxYear}-12-31`);
  const x = (iso: string) => PAD_L + ((toDays(iso) - start) / (end - start)) * (W - PAD_L - PAD_R);
  const endIso = `${maxYear}-12-31`;

  const span = maxYear - minYear + 1;
  const step = span > 12 ? 2 : 1;
  const years: number[] = [];
  for (let y = minYear; y <= maxYear; y += step) years.push(y);

  const height = TOP + data.rules.length * LANE + 12;
  const asOfX = x(data.as_of);

  return (
    <figure className="timeline-figure">
      <svg viewBox={`0 0 ${W} ${height}`} role="img"
           aria-label={`Version timeline for ${data.regulation.id}; details in the table below`}>
        {years.map((y) => (
          <g key={y}>
            <line x1={x(`${y}-01-01`)} x2={x(`${y}-01-01`)} y1={TOP - 8} y2={height - 8} stroke="var(--grid)" />
            <text x={x(`${y}-01-01`) + 3} y={TOP - 14} fontSize="12" fill="var(--text-2)">
              {y}
            </text>
          </g>
        ))}

        {data.rules.map((rule, i) => {
          const y0 = TOP + i * LANE;
          const barY = y0 + 26;
          const finals = rule.versions
            .filter((v) => v.kind !== "draft" && v.effective_from)
            .sort((a, b) => (a.effective_from! < b.effective_from! ? -1 : 1));
          const drafts = rule.versions.filter((v) => v.kind === "draft");
          return (
            <g key={rule.rule_key}>
              <text x={PAD_L} y={y0 + 16} fontSize="13" fontWeight="600" fill="var(--text-1)">
                {rule.heading}
              </text>
              <rect x={PAD_L} y={barY} width={W - PAD_L - PAD_R} height={14} rx={7} fill="var(--track)" />
              {finals.map((v: TimelineVersion, j) => {
                const from = x(v.effective_from!);
                const to = x(finals[j + 1]?.effective_from ?? endIso);
                const pub = x(v.published);
                return (
                  <g key={v.passage_id}>
                    <title>
                      {`${v.document}\nPublished ${fmtDate(v.published)}, effective ${fmtDate(v.effective_from)}\n${STATUS_LABEL[v.status]} on ${fmtDate(data.as_of)}`}
                    </title>
                    {pub < from - 2 && (
                      <line x1={pub} x2={from} y1={barY + 7} y2={barY + 7} stroke="var(--text-2)"
                            strokeDasharray="3 3" />
                    )}
                    {pub < from - 2 && <circle cx={pub} cy={barY + 7} r={3.5} fill="var(--text-2)" />}
                    <rect x={from} y={barY} width={Math.max(to - from - 1, 2)} height={14} rx={7}
                          fill={FILL[v.status] ?? "var(--muted-fill)"} />
                  </g>
                );
              })}
              {drafts.map((v) => {
                const px = x(v.published);
                return (
                  <g key={v.passage_id}>
                    <title>{`${v.document}\nDraft published ${fmtDate(v.published)}; never in force`}</title>
                    <path d={`M${px} ${barY - 3} l7 10 l-7 10 l-7 -10 z`} fill="var(--surface)" stroke="var(--draft)"
                          strokeWidth={2} />
                  </g>
                );
              })}
            </g>
          );
        })}

        <line x1={asOfX} x2={asOfX} y1={TOP - 6} y2={height - 8} stroke="var(--accent)" strokeWidth={2}
              strokeDasharray="5 4" />
        <text x={Math.min(asOfX + 5, W - 120)} y={height - 2} fontSize="12" fontWeight="600" fill="var(--accent)">
          as of {fmtDate(data.as_of)}
        </text>
      </svg>
      <figcaption className="legend">
        <span><i className="sw sw-ok" /> In force</span>
        <span><i className="sw sw-warn" /> Not yet effective</span>
        <span><i className="sw sw-muted" /> Superseded</span>
        <span><i className="sw sw-draft" /> Draft (never in force)</span>
        <span><i className="sw sw-pub" /> Published, waiting to take effect</span>
      </figcaption>
    </figure>
  );
}
