
**variable-tempo fixtures** (9)

| Candidate | mean beat F | mean off-beat F | mean BPM err | mean Acc1 | mean Acc1 (octave-tolerant) | mean coverage | transitions found / truth | missed | extra | worst boundary err s | median ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| engine | 0.867 | 0.044 | 6.137 | 0.822 | 0.822 | 0.988 | 10 / 12 | 2 | 17 | 0.12 | 2846 |
| const | 0.511 | 0.111 | 8.283 | 0.54 | 0.54 | 0.778 | 0 / 12 | 12 | 0 | - | 221 |
| dp | 0.969 | 0.003 | 0.333 | 0.988 | 0.988 | 0.979 | 11 / 12 | 1 | 0 | 1.4 | 457 |
| ctf | 0.97 | 0.002 | 0.39 | 0.988 | 0.988 | 0.982 | 11 / 12 | 1 | 0 | 1.16 | 394 |
| tempogram | 0.891 | 0.026 | 1.378 | 0.917 | 0.917 | 0.941 | 10 / 12 | 2 | 0 | 0.45 | 254 |

**constant-tempo controls** (4)

| Candidate | mean beat F | mean off-beat F | mean BPM err | mean Acc1 | mean Acc1 (octave-tolerant) | mean coverage | transitions found / truth | missed | extra | worst boundary err s | median ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| engine | 0.739 | 0.247 | 0.895 | 1 | 1 | 0.99 | 0 / 0 | 0 | 0 | - | 2816 |
| const | 0.739 | 0.247 | 0.01 | 1 | 1 | 1 | 0 / 0 | 0 | 0 | - | 239 |
| dp | 0.739 | 0.247 | 0.01 | 1 | 1 | 1 | 0 / 0 | 0 | 0 | - | 440 |
| ctf | 0.739 | 0.247 | 0.01 | 1 | 1 | 1 | 0 / 0 | 0 | 0 | - | 356 |
| tempogram | 0.739 | 0.247 | 0.01 | 1 | 1 | 1 | 0 / 0 | 0 | 0 | - | 265 |
