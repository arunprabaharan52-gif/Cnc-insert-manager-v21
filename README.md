# CNC Insert Manager V37

Production-oriented insert and job control for **5 CNC machines + 1 VMC + 1 VTL**.

- Firebase email/password and Google authentication with per-user roles
- Own-company profile with started date, GSTIN/contact details and default monthly revenue target
- Admin-confirmed monthly turnover register with production-derived fallback and 6/12-month growth chart
- Priority dashboard for total insert quantity/value, selected-date net insert usage/value, all-time revenue, selected-month turnover, active operators and Shift A/B performance percentage
- Selected-date operator table with target, actual, percentage and insert usage/value
- Company → reusable drawing → Job master → Job Planning & Cost Estimate → assigned Production Batch data model
- Admin-only PDF/JPG/PNG/WebP drawing upload (25 MB), Cloud Vision OCR suggestions, mandatory Admin operation-count review and original drawing access for operators
- One to four sequential Head/Side stages: PENDING, RUNNING, COMPLETE, MACHINING COMPLETE, final inspection/oiling/packing and DISPATCH READY
- Every Head/Side independently selects any CNC/VMC/VTL machine; two sides may intentionally use the same machine
- Per-Head/Side standard machine, cycle time, setup time, RPM, tool/holder, tool cost, insert SKU and customer rate
- PO/quantity planning estimate with conservative completion days, machine cost range, tool cost, edge-life-derived insert need, quote/margin and explicit NEEDS DATA protection
- Each batch is assigned to one operator UID; the current assignments may cover at most two active physical machines, and a third machine Start is rejected
- Two different-machine Job time ranges may overlap in one daily report; same-machine overlap and a third concurrent machine are rejected, with separate operator net-active and summed machine-run minutes
- Operator Production screen clearly lists both assigned machines and the current/next Job on each machine
- Backend-enforced stage order; assigned operator only can Start/Complete, with trusted timestamps, completed quantity and actual cycle required
- Target-versus-actual cycle variance with BETTER / ON TARGET / WATCH / IMPROVEMENT REQUIRED classification
- Drawing-derived dimension callout suggestions and a reusable Dimension Inspection CSV template foundation
- Full-SKU rack/channel mapping and exactly-one control for one-piece SKUs
- Mandatory old insert return, global physical-machine lock, supervisor exception approval and chute verification
- Atomic stock requests, idempotent issue processing and dispenser rollback
- INDEX / REPLACE / PART-USED RETURN / SCRAP RETURN tracking
- Good/rejected parts and cutting minutes for every completed edge, with expected output and GOOD/POOR purchase classification
- One to three jobs per day; every job supports Part/Operation 1–4 with its own part number, physical machine, side, cycle time, RPM, customer side rate and program number
- Photo-derived minimum/maximum machine cost defaults in ₹/minute: CNC‑1 6.6–7.5, CNC‑2 8–9, CNC‑3 5.5–6.6, CNC‑4/5 6.6–7.5, VMC‑1 11.1–13.3 and VTL‑1 13.3–15.5
- Server-derived per-side and per-job running cost, profit range, PROFIT/BORDERLINE/NOT SUITABLE decision and today quantity value
- Explicit No Insert Used or one-to-six trusted issued-insert links on every job
- Secure machine-screen photo upload and Cloud Vision OCR autofill for cycle time/RPM, with operator review required before save
- Tamil/English voice-command autofill such as `Job 2 second side CNC 3 cycle 1.5 RPM 1200`, plus typed fallback
- Separate 12-hour AM/PM In/Out, automatic batch timestamp fill, actual gap-based break, presence and net-active time
- Side 1–4 CNC/VMC/VTL routing with backend-derived WORK RUNNING / JOB COMPLETE status
- Backend-verified deterministic daily report per operator/date, daily salary and labour cost per good part
- Real Firebase Storage photo/voice notices with Web Share, clipboard and SMS hand-off
- Historical stock ledger, safe CSV export, backup preview and one-time V30 migration

The GitHub Pages files are the user interface. The trusted inventory, report and machine workflow requires the included Realtime Database Rules, Storage Rules and Cloud Functions to be deployed before production use.

See [SETUP_V37_TAMIL.md](./SETUP_V37_TAMIL.md) for deployment, company dashboard setup, two-machine assignment workflow, rate formula, Cloud Vision and first-admin setup.
