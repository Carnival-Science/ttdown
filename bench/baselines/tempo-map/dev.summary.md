
**variable-tempo fixtures** (9)

| Candidate | mean beat F | mean off-beat F | mean BPM err | mean Acc1 (committed) | mean Acc1, unknown counted wrong | octave-tolerant, unknown counted wrong | mean coverage | transitions found / truth | missed | extra | worst boundary err s (any transition) | median ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| engine | 0.875 | 0.044 | 6.137 | 0.822 | 0.813 | 0.813 | 0.988 | 10 / 12 | 2 | 1 | 0.23 | 2846 |
| const | 0.517 | 0.111 | 8.283 | 0.54 | 0.42 | 0.42 | 0.778 | 0 / 12 | 12 | 0 | - | 228 |
| dp | 0.981 | 0.003 | 0.333 | 0.988 | 0.967 | 0.967 | 0.979 | 11 / 12 | 1 | 0 | 1.4 | 493 |
| ctf | 0.982 | 0.002 | 0.39 | 0.988 | 0.97 | 0.97 | 0.982 | 11 / 12 | 1 | 0 | 2.99 | 388 |
| tempogram | 0.902 | 0.027 | 1.378 | 0.917 | 0.859 | 0.859 | 0.941 | 10 / 12 | 2 | 0 | 0.73 | 274 |

**constant-tempo controls** (4)

| Candidate | mean beat F | mean off-beat F | mean BPM err | mean Acc1 (committed) | mean Acc1, unknown counted wrong | octave-tolerant, unknown counted wrong | mean coverage | transitions found / truth | missed | extra | worst boundary err s (any transition) | median ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| engine | 0.747 | 0.248 | 0.895 | 1 | 0.99 | 0.99 | 0.99 | 0 / 0 | 0 | 0 | - | 2816 |
| const | 0.747 | 0.248 | 0.01 | 1 | 1 | 1 | 1 | 0 / 0 | 0 | 0 | - | 212 |
| dp | 0.747 | 0.248 | 0.01 | 1 | 1 | 1 | 1 | 0 / 0 | 0 | 0 | - | 309 |
| ctf | 0.747 | 0.248 | 0.01 | 1 | 1 | 1 | 1 | 0 / 0 | 0 | 0 | - | 269 |
| tempogram | 0.747 | 0.248 | 0.01 | 1 | 1 | 1 | 1 | 0 / 0 | 0 | 0 | - | 231 |
