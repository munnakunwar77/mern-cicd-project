# What was fixed and why

## Pipeline (Jenkinsfile, scripts/)
| Problem | Fix |
|---|---|
| Mongo test container used a hard-coded Docker network; readiness loop never failed | `scripts/ci-mongo.sh` auto-detects Jenkins' network, proves Mongo is reachable from Jenkins, fails fast with diagnostics |
| Push to ECR passed a literal `$c` to `docker tag` | Rewritten as single-quoted shell using env vars |
| Verify stage used `source` under `/bin/sh` (dash) | Moved into `scripts/verify-production.sh`, run with `bash` |
| `when { branch }` skipped stages outside Multibranch jobs | `currentBranch()` helper works for both job types |
| Deploy scripts needed the executable bit | Run as `bash scripts/...` |
| Mongo container name could collide between branches | Name includes build number and job hash |
| Trivy stopped at the first bad image | Scans both, then fails; `TRIVY_ENFORCE` parameter |
| NodeJS Jenkins tool had to be configured by hand | Removed; Node 22 is in the image |
| Pipeline timeout (90 min) shorter than approval waits | 150 min |
| Jenkinsfile CRLF line endings | LF + `.gitattributes` |

## Infrastructure
- `docker-compose.jenkins.yml`: SonarQube `validateWebhooks=false` (Quality Gate webhook) and ES bootstrap checks disabled (starts on Docker Desktop).
- Dockerfiles: `apk upgrade` to pick up security patches.
- `jenkins/Dockerfile`: removed stale commented duplicate.

## Application
- API returns 400 (not 500) for malformed JSON and non-string titles; 413 for oversized bodies.
- Server retries the MongoDB connection instead of giving up after one failure.
- Backend tests: 9 -> 22 (branch coverage 61.5% -> 95.5%). Frontend tests: 3 -> 8, with coverage thresholds.
- `backend/.env` replaced by `.env.example` (nothing read it and it contradicted compose).
