
**variable-tempo fixtures** (5)

| Candidate | mean beat F | mean off-beat F | mean BPM err | mean Acc1 (committed) | mean Acc1, unknown counted wrong | octave-tolerant, unknown counted wrong | mean coverage | transitions found / truth | missed | extra | worst boundary err s (any transition) | median ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| engine | 0.666 | 0.07 | 16.198 | 0.51 | 0.502 | 0.502 | 0.985 | 6 / 8 | 2 | 0 | 2.5 | 2922 |
| const | 0.432 | 0.173 | 13.07 | 0.542 | 0.434 | 0.434 | 0.8 | 0 / 8 | 8 | 0 | - | 258 |
| dp | 0.947 | 0.002 | 5.17 | 0.937 | 0.892 | 0.947 | 0.956 | 7 / 8 | 1 | 0 | 0.51 | 618 |
| ctf | 0.939 | 0.01 | 5.81 | 0.898 | 0.898 | 0.953 | 1 | 7 / 8 | 1 | 1 | 0.48 | 388 |
| tempogram | 0.905 | 0.026 | 6.274 | 0.856 | 0.856 | 0.91 | 1 | 8 / 8 | 0 | 0 | 0.96 | 279 |

**constant-tempo controls** (4)

| Candidate | mean beat F | mean off-beat F | mean BPM err | mean Acc1 (committed) | mean Acc1, unknown counted wrong | octave-tolerant, unknown counted wrong | mean coverage | transitions found / truth | missed | extra | worst boundary err s (any transition) | median ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| engine | 0.747 | 0.248 | 0.57 | 1 | 0.99 | 0.99 | 0.99 | 0 / 0 | 0 | 0 | - | 2746 |
| const | 0.747 | 0.248 | 0.01 | 1 | 1 | 1 | 1 | 0 / 0 | 0 | 0 | - | 237 |
| dp | 0.747 | 0.248 | 0.01 | 1 | 1 | 1 | 1 | 0 / 0 | 0 | 0 | - | 400 |
| ctf | 0.747 | 0.248 | 0.01 | 1 | 1 | 1 | 1 | 0 / 0 | 0 | 0 | - | 304 |
| tempogram | 0.747 | 0.248 | 0.01 | 1 | 1 | 1 | 1 | 0 / 0 | 0 | 0 | - | 261 |
