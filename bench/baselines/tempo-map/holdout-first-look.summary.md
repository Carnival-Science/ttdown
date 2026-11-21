
**variable-tempo fixtures** (5)

| Candidate | mean beat F | mean off-beat F | mean BPM err | mean Acc1 | mean Acc1 (octave-tolerant) | mean coverage | transitions found / truth | missed | extra | worst boundary err s | median ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| engine | 0.659 | 0.069 | 16.198 | 0.51 | 0.51 | 0.985 | 6 / 8 | 2 | 0 | 1.53 | 2922 |
| const | 0.427 | 0.173 | 13.07 | 0.542 | 0.542 | 0.8 | 0 / 8 | 8 | 0 | - | 280 |
| dp | 0.937 | 0.002 | 5.17 | 0.937 | 0.991 | 0.956 | 7 / 8 | 1 | 0 | 0.48 | 717 |
| ctf | 0.929 | 0.01 | 5.818 | 0.898 | 0.953 | 1 | 7 / 8 | 1 | 1 | 0.26 | 404 |
| tempogram | 0.895 | 0.026 | 6.274 | 0.856 | 0.91 | 1 | 8 / 8 | 0 | 0 | 0.96 | 308 |

**constant-tempo controls** (4)

| Candidate | mean beat F | mean off-beat F | mean BPM err | mean Acc1 | mean Acc1 (octave-tolerant) | mean coverage | transitions found / truth | missed | extra | worst boundary err s | median ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| engine | 0.739 | 0.247 | 0.57 | 1 | 1 | 0.99 | 0 / 0 | 0 | 0 | - | 2746 |
| const | 0.739 | 0.247 | 0.01 | 1 | 1 | 1 | 0 / 0 | 0 | 0 | - | 221 |
| dp | 0.656 | 0.247 | 21.758 | 0.75 | 1 | 1 | 0 / 0 | 0 | 0 | - | 424 |
| ctf | 0.656 | 0.247 | 21.755 | 0.75 | 1 | 1 | 0 / 0 | 0 | 0 | - | 280 |
| tempogram | 0.739 | 0.247 | 0.01 | 1 | 1 | 1 | 0 / 0 | 0 | 0 | - | 241 |
