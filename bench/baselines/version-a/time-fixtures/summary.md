| Fixture | Tempo truth → est (class) | Tracked beat F | Tracked downbeat F | Exported-grid beat F | Exported-grid max drift (class) | Kick / snare F (exported MIDI, ±50 ms) | Chords maj/min | TimeMap: local tempo steady? | TimeMap: tempo changes | TimeMap: pinned export grid error, max / RMS | TimeMap: export state (what the analyzer's assumed 4/4 needs, or why refused) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| leading_silence_2s | 120 → 120 (ok) | 0.99 | 0.98 | 0.96 | 6 ms (ok) | 0.98 / 0.98 | 1.00 | yes | 0 | 9 / 4 ms | needs-confirmation (downbeat, meter) |
| pickup_1beat | 120 → 120 (ok) | 0.98 | 0.98 | 0.98 | 4 ms (ok) | 1.00 / 0.99 | 1.00 | yes | 0 | 7 / 3 ms | needs-confirmation (downbeat, meter) |
| pickup_2beats_late | 118 → 118 (ok) | 0.99 | 0.98 | 0.98 | 2 ms (ok) | 0.98 / 0.99 | 1.00 | yes | 0 | 8 / 4 ms | needs-confirmation (downbeat, meter) |
| halftime_140 | 140 → 140 (ok) | 0.98 | 0.96 | 0.99 | 7 ms (ok) | 0.94 / 0.94 | 1.00 | yes | 0 | 9 / 4 ms | needs-confirmation (downbeat, meter) |
| dnb_174 | 174 → 87 (half) | 0.66 | 0.00 | 0.66 | 55.2 s (slipped-beats) | 0.57 / 0.89 | 0.67 | yes | 0 | 7 / 3 ms | needs-confirmation (downbeat, meter) |
| drift_slow | 120.5 → 120.5 (ok) | 0.99 | 0.96 | 0.99 | 53 ms (ok) | 0.69 / 0.70 | 0.99 | yes | 0 | 52 / 26 ms | refused: tempo-drift |
| drift_fast | 114.1 → 114 (ok) | 0.99 | 0.96 | 0.31 | 659 ms (slipped-beats) | 0.08 / 0.04 | 0.84 | no (±5.1 %) | 1 | 707 / 326 ms | refused: tempo-changes |
| tempo_change_step | 120 → 120 (ok) | 0.70 | 0.60 | 0.68 | 4.7 s (slipped-beats) | 0.74 / 0.71 | 0.91 | no (±6.4 %) | 3 | 237 / 106 ms | refused: tempo-changes |
| halftime_breakdown | 128 → 128 (ok) | 0.93 | 0.91 | 0.93 | 7.5 s (slipped-beats) | 0.88 / 0.87 | 1.00 | yes | 0 | 10 / 4 ms | needs-confirmation (downbeat, meter) |
| meter_3_4 | 120 → 120 (ok) | 0.99 | 0.29 | 0.99 | 7 ms (ok) | 0.49 / 0.78 | 0.81 | yes | 0 | 8 / 4 ms | needs-confirmation (downbeat, meter) |
| meter_5_4 | 140 → 140 (ok) | 0.98 | 0.22 | 0.99 | 10 ms (ok) | 0.42 / 0.00 | 0.85 | yes | 0 | 7 / 3 ms | needs-confirmation (downbeat, meter) |
| long_7min | 128 → 128 (ok) | 1.00 | 1.00 | 1.00 | 3 ms (ok) | 1.00 / 1.00 | 1.00 | yes | 0 | 11 / 4 ms | needs-confirmation (downbeat, meter) |
