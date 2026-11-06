"use client";

import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { TimelineChart } from "@/components/TimelineChart";
import { api, ApiError, fmtDate, type Regulation, type Timeline, todayIso, type WatchItem } from "@/lib/api";

export default function TimelinePage() {
  const [regs, setRegs] = useState<Regulation[]>([]);
  const [selected, setSelected] = useState("B-20");
  const [asOf, setAsOf] = useState("");
  const [data, setData] = useState<Timeline | null>(null);
  const [watch, setWatch] = useState<WatchItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => setAsOf(todayIso()), []);

  useEffect(() => {
    api<Regulation[]>("regulations").then(setRegs).catch((e: ApiError) => setError(e.message));
    api<WatchItem[]>("watchlist").then(setWatch).catch((e: ApiError) => setWatchError(e.message));
  }, []);

  const load = useCallback(async (id: string, date: string) => {
    if (!date) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api<Timeline>(`regulations/${id}/timeline?asOf=${date}`));
    } catch (e) {
      setError((e as ApiError).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(selected, asOf);
  }, [selected, asOf, load]);

  const watched = watch.find((w) => w.regulationId === selected);

  async function toggleWatch() {
    setBusy(true);
    setWatchError(null);
    try {
      if (watched) {
        await api<void>(`watchlist/${watched.id}`, { method: "DELETE" });
        setWatch((w) => w.filter((x) => x.id !== watched.id));
      } else {
        const item = await api<WatchItem>("watchlist", {
          method: "POST",
          body: JSON.stringify({ regulationId: selected }),
        });
        setWatch((w) => [...w, item]);
      }
    } catch (e) {
      setWatchError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const current = regs.find((r) => r.id === selected);

  return (
    <>
      <section className="hero">
        <h1>Regulation timeline</h1>
        <p className="lede">Every version of each rule, and its state on the date you pick.</p>
      </section>

      <div className="card toolbar">
        <div className="tabs" role="tablist" aria-label="Regulation">
          {(regs.length ? regs.map((r) => r.id) : ["B-20", "B-10", "E-21"]).map((id) => (
            <button key={id} role="tab" aria-selected={id === selected}
                    className={id === selected ? "tab active" : "tab"} onClick={() => setSelected(id)}>
              {id}
            </button>
          ))}
        </div>
        <div className="field inline">
          <label htmlFor="asof">As of</label>
          <input id="asof" type="date" min="2000-01-01" max="2035-12-31" value={asOf}
                 onChange={(e) => e.target.value && setAsOf(e.target.value)} />
        </div>
        <button className={watched ? "btn-secondary" : "btn-primary"} onClick={toggleWatch} disabled={busy}
                aria-pressed={!!watched}>
          {watched ? "Watching ✓  Remove" : `Watch ${selected}`}
        </button>
      </div>
      {watchError && <div className="alert" role="alert">{watchError}</div>}

      {current && (
        <p className="muted subhead">
          {current.regulator} {current.id}: {current.title}
        </p>
      )}

      {error && <div className="alert" role="alert">{error}</div>}
      {loading && !data && !error && <div className="card skeleton" aria-busy="true">Loading timeline…</div>}

      {data && (
        <>
          <div className={`card ${loading ? "is-loading" : ""}`}>
            <TimelineChart data={data} />
          </div>
          <div className="card">
            <h2 className="card-title">Versions on {fmtDate(data.as_of)}</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th>Document</th>
                    <th>Published</th>
                    <th>Effective</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rules.flatMap((r) =>
                    r.versions.map((v, i) => (
                      <tr key={v.passage_id}>
                        <td className="rule-cell">{i === 0 ? r.heading : ""}</td>
                        <td>
                          <a href={v.source_url} target="_blank" rel="noopener noreferrer">{v.document}</a>
                          {v.verification !== "verified" && (
                            <span className="warn small" title={v.verification}> · date approximate</span>
                          )}
                        </td>
                        <td className="nowrap">{fmtDate(v.published)}</td>
                        <td className="nowrap">{v.effective_from ? fmtDate(v.effective_from) : "Never (draft)"}</td>
                        <td><StatusBadge status={v.status} size="sm" /></td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="card">
        <h2 className="card-title">Your watchlist</h2>
        {watch.length === 0 ? (
          <p className="muted">Nothing watched yet. Watch a regulation to track its changes.</p>
        ) : (
          <ul className="watchlist">
            {watch.map((w) => (
              <li key={w.id}>
                <button className="link" onClick={() => setSelected(w.regulationId)}>{w.regulationId}</button>
                <span className="muted small">since {fmtDate(w.createdAt.slice(0, 10))}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
