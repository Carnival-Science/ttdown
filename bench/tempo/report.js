"use strict";
const f = v => v == null ? "-" : v;
function table(rows, cands, withEngine, P) {
  const names = [...(withEngine ? ["engine"] : []), ...cands], out = [];
  out.push(`params: ${JSON.stringify(P)}`, "", "| Fixture | Candidate | Beat F (off-beat F) | Beat ms med / p95 / worst | BPM err | Acc1 / oct | Coverage | Changes (truth / found, missed, extra) | Boundary err s | ms |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) for (const n of names) { const x = r.results[n]; if (!x) continue;
    out.push(`| ${r.id} | ${n} | ${x.beatF} (${x.beatFOff}) | ${f(x.beatMsMed)} / ${f(x.beatMsP95)} / ${f(x.worstMs)} | ${f(x.bpmErr)} | ${f(x.acc1)} / ${f(x.acc1oct)} | ${x.coverage} | ${x.truthTransitions} / ${x.nChanges}, -${x.missed} +${x.extra} | ${f(x.boundaryErrS)} | ${f(x.ms)} |`); }
  return out.join("\n");
}
module.exports = { table };

/* Aggregates over a run: variable-tempo fixtures and constant-tempo controls apart, so a good constant average cannot hide a broken transition. */
const isControl = id => /const|halftime_drop|offbeat|dnb_double|slow_fills/.test(id);
function summary(rows, names) {
  const m = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, r2 = v => v == null ? "-" : (+v.toFixed(3)).toString(), out = [];
  for (const [label, pick] of [["variable-tempo fixtures", r => !isControl(r.id)], ["constant-tempo controls", r => isControl(r.id)]]) {
    const R = rows.filter(pick); out.push("", `**${label}** (${R.length})`, "", "| Candidate | mean beat F | mean off-beat F | mean BPM err | mean Acc1 (committed) | mean Acc1, unknown counted wrong | octave-tolerant, unknown counted wrong | mean coverage | transitions found / truth | missed | extra | worst boundary err s (any transition) | median ms |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const n of names) { const x = R.map(r => r.results[n]).filter(Boolean); if (!x.length) continue; const ms = x.map(y => y.ms).filter(v => v != null).sort((a, b) => a - b), be = x.flatMap(y => y.boundaryErrsS || []);
      out.push(`| ${n} | ${r2(m(x.map(y => y.beatF)))} | ${r2(m(x.map(y => y.beatFOff)))} | ${r2(m(x.map(y => y.bpmErr).filter(v => v != null)))} | ${r2(m(x.map(y => y.acc1).filter(v => v != null)))} | ${r2(m(x.map(y => y.acc1All)))} | ${r2(m(x.map(y => y.acc1octAll)))} | ${r2(m(x.map(y => y.coverage)))} | ${x.reduce((s, y) => s + y.truthTransitions - y.missed, 0)} / ${x.reduce((s, y) => s + y.truthTransitions, 0)} | ${x.reduce((s, y) => s + y.missed, 0)} | ${x.reduce((s, y) => s + y.extra, 0)} | ${be.length ? Math.max(...be) : "-"} | ${ms.length ? ms[ms.length >> 1] : "-"} |`); } }
  return out.join("\n");
}
module.exports.summary = summary; module.exports.isControl = isControl;
