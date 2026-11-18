
### ruler: share of TRUE downbeats with a drawn/clicked time within 70 ms (and 20 ms), median / max error; legacy grid -> TimeMap

| Set | Track | Grid used | Within 70 ms | Within 20 ms | Median / max error (ms) | Verdict |
|---|---|---|---|---|---|---|
| regression | pop127_Amaj | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 4.3 / 8.5 → 2.5 / 6.5 | unchanged |
| regression | trap142_Fsmin | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 1.5 / 3.6 → 3.1 / 8.7 | unchanged |
| regression | house124_Cmin | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 7.7 / 15.9 → 2.9 / 7.8 | unchanged |
| regression | swing100_Dmin | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 0 / 0 → 3 / 7.9 | unchanged |
| regression | lead120_Amin | tracked | 0.97 → 1.00 | 0.97 → 1.00 | 6 / 1994 → 2.8 / 7.9 | improved |
| regression | fast808_142 | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 1.5 / 3.6 → 3.1 / 8.7 | unchanged |
| regression | pop127_pad300 | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 3.3 / 7.5 → 2.9 / 6.8 | unchanged |
| regression | pop127_pad1200 | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 2.7 / 7 → 3 / 7 | unchanged |
| time-fixtures | leading_silence_2s | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 6 / 6 → 3.4 / 7.4 | unchanged |
| time-fixtures | pickup_1beat | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 4 / 4 → 3.4 / 7.4 | unchanged |
| time-fixtures | pickup_2beats_late | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 0.8 / 1.9 → 3.2 / 7 | unchanged |
| time-fixtures | halftime_140 | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 3 / 6.7 → 2.6 / 8.2 | unchanged |
| time-fixtures | dnb_174 | tracked | 0.00 → 0.00 | 0.00 → 0.00 | 1030 / 1037.2 → 1026.7 / 1037 | unchanged |
| time-fixtures | drift_slow | tracked | 1.00 → 1.00 | 0.25 → 1.00 | 39.9 / 52.9 → 1.7 / 7.2 | improved |
| time-fixtures | drift_fast | tracked | 0.07 → 1.00 | 0.04 → 1.00 | 514.3 / 2005 → 2.5 / 7.6 | improved |
| time-fixtures | tempo_change_step | tracked | 0.64 → 0.61 | 0.64 → 0.61 | 6 / 1994 → 5.9 / 997.1 | regressed |
| time-fixtures | halftime_breakdown | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 3 / 3 → 2.8 / 8.5 | unchanged |
| time-fixtures | meter_3_4 | tracked | 0.25 → 0.25 | 0.25 → 0.25 | 507 / 993 → 501.1 / 1002.9 | unchanged |
| time-fixtures | meter_5_4 | tracked | 0.25 → 0.25 | 0.25 → 0.25 | 430.6 / 856 → 430.5 / 858.1 | unchanged |
| time-fixtures | long_7min | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 3 / 3 → 3 / 8.5 | unchanged |

### metronome: share of TRUE beats with a drawn/clicked time within 70 ms (and 20 ms), median / max error; legacy grid -> TimeMap

| Set | Track | Grid used | Within 70 ms | Within 20 ms | Median / max error (ms) | Verdict |
|---|---|---|---|---|---|---|
| regression | pop127_Amaj | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 0 / 0 → 3 / 7.8 | unchanged |
| regression | trap142_Fsmin | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 2 / 2 → 2.9 / 8.7 | unchanged |
| regression | house124_Cmin | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 1 / 1 → 3 / 7.8 | unchanged |
| regression | swing100_Dmin | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 0 / 0 → 3 / 7.9 | unchanged |
| regression | lead120_Amin | tracked | 0.99 → 1.00 | 0.99 → 1.00 | 6 / 494 → 2.9 / 7.9 | unchanged |
| regression | fast808_142 | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 2 / 2 → 2.9 / 8.7 | unchanged |
| regression | pop127_pad300 | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 1 / 1 → 2.9 / 7.7 | unchanged |
| regression | pop127_pad1200 | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 7.2 / 7.2 → 3 / 7.5 | unchanged |
| time-fixtures | leading_silence_2s | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 6 / 6 → 2.8 / 7.5 | unchanged |
| time-fixtures | pickup_1beat | tracked | 0.99 → 1.00 | 0.99 → 1.00 | 4 / 496 → 2.8 / 7.5 | unchanged |
| time-fixtures | pickup_2beats_late | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 2 / 2.1 → 3 / 8.3 | unchanged |
| time-fixtures | halftime_140 | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 1 / 1 → 2.7 / 8.2 | unchanged |
| time-fixtures | dnb_174 | tracked | 0.50 → 0.50 | 0.50 → 0.50 | 340.3 / 340.4 → 337 / 348.2 | unchanged |
| time-fixtures | drift_slow | tracked | 1.00 → 1.00 | 0.20 → 1.00 | 43.1 / 57 → 2.6 / 8.2 | improved |
| time-fixtures | drift_fast | tracked | 0.33 → 1.00 | 0.08 → 1.00 | 104.3 / 426.3 → 3.1 / 7.8 | improved |
| time-fixtures | tempo_change_step | tracked | 0.65 → 0.68 | 0.65 → 0.68 | 6 / 494 → 5 / 208.7 | improved |
| time-fixtures | halftime_breakdown | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 3 / 3 → 3 / 8.5 | unchanged |
| time-fixtures | meter_3_4 | tracked | 0.99 → 1.00 | 0.99 → 1.00 | 7 / 493 → 2.8 / 7.5 | unchanged |
| time-fixtures | meter_5_4 | tracked | 0.99 → 1.00 | 0.99 → 1.00 | 1.1 / 427.4 → 2.9 / 8 | unchanged |
| time-fixtures | long_7min | tracked | 1.00 → 1.00 | 1.00 → 1.00 | 3 / 3 → 2.9 / 8.5 | unchanged |
