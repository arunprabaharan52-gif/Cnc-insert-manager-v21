# CNC Insert Manager V37 — Production Setup

V37-ல் V36-ன் முழு Job/Insert/Operator workflow பாதுகாக்கப்பட்டு, Company Profile, மாத Turnover, 6/12 மாத growth chart மற்றும் முக்கிய Dashboard KPI-கள் சேர்க்கப்பட்டுள்ளன. ஒரு Operator-க்கு ஒரே நேரத்தில் **அதிகபட்சம் இரண்டு வேறு physical machines மட்டும்**; மூன்றாவது machine mode இல்லை.

## 1. Deploy செய்வதற்கு முன்

1. Firebase Console → Realtime Database → Export JSON மூலம் தற்போதைய data backup எடுக்கவும்.
2. Firebase Storage drawings, screen photos மற்றும் notice media-க்கு bucket backup/lifecycle policy அமைக்கவும்.
3. தற்போதைய GitHub Pages version-ஐ branch/tag ஆக வைத்துக்கொள்ளவும்.
4. Node.js 20 மற்றும் Firebase CLI நிறுவப்பட்டிருக்க வேண்டும்.
5. Package-ல் உள்ள tests ஓட்டவும்:

```bash
npm test
npm run check
```

## 2. Firebase Authentication

1. Authentication → Sign-in method-ல் Email/Password enable செய்யவும்.
2. தேவைப்பட்டால் Google login enable செய்யவும்.
3. Authorized domains-ல் `arunprabaharan52-gif.github.io` சேர்க்கவும்.
4. Shared password பயன்படுத்தாமல் ஒவ்வொரு Admin/Operator-க்கும் தனி account கொடுக்கவும்.

## 3. Backend deploy

Project root-ல்:

```bash
firebase login
npm --prefix functions ci
firebase use cnc-insert-manager
firebase deploy --only database,storage,functions
```

முக்கிய files:

- `database.rules.json` — role validation, Company Profile மற்றும் Monthly Turnover Admin-only validation
- `storage.rules` — drawing, machine-screen மற்றும் notice media பாதுகாப்பு
- `functions/index.js` — stock, issue/return, daily report, OCR மற்றும் production batch trusted processing
- `functions/logic.js` — server-side calculation மற்றும் validation
- `firebase.json` — deployment mapping

Rules/Functions deploy செய்யாமல் live stock அல்லது Operator workflow பயன்படுத்த வேண்டாம்.

## 4. முதல் Admin

Firebase Console → Authentication → Users-ல் Admin user உருவாக்கி, அதன் UID-க்கு Realtime Database-ல் கீழ்கண்ட record சேர்க்கவும்:

```json
{
  "uid": "UID",
  "email": "admin@example.com",
  "displayName": "Factory Admin",
  "role": "admin",
  "active": true
}
```

Operator signup requests-ஐ Admin → User Access-ல் operator code, shift மற்றும் daily salary உடன் approve செய்யவும். Role மாற்றத்துக்குப் பிறகு logout/login செய்யவும்.

## 5. Company Profile அமைப்பு

Admin Dashboard-ல் Company Profile form-ஐ ஒருமுறை நிரப்பவும்:

1. Display company name — Dashboard/print தலைப்பு.
2. Legal name, GSTIN, address, contact person, phone, email — reference details.
3. Company started date — எதிர்கால தேதி அனுமதிக்கப்படாது.
4. Default monthly target — தனி மாத target இல்லாதபோது chart பயன்படுத்தும் இலக்கு.

இது உங்கள் சொந்த factory profile. Job & Production பகுதியில் உள்ள Company Master என்பது MM Forgings/BHEL/KPN/Sunmark போன்ற customer companies.

## 6. Monthly Turnover பதிவு

1. Accounts/invoice-ல் உறுதி செய்யப்பட்ட மாதத்தைத் தேர்வு செய்யவும்.
2. Confirmed turnover மற்றும் விருப்பமான month target/note கொடுத்து Save செய்யவும்.
3. Month target `0` என்றால் Company Profile default monthly target பயன்படுத்தப்படும்.
4. ஏற்கனவே உள்ள மாதத்தை மாற்ற Register-ல் `Edit` அழுத்தவும்.
5. Confirmed turnover இல்லாத மாதத்தில் production reports-ல் கணக்கான revenue fallback ஆக chart-ல் காட்டப்படும்.

Chart-ல் `CONFIRMED` மற்றும் `PRODUCTION` source தனித்தனியாகக் காட்டப்படும். Accounts turnover மற்றும் production-derived revenue சமமாக இருக்க வேண்டிய அவசியமில்லை; invoice timing, dispatch மற்றும் tax/accounting cut-off வேறுபடலாம்.

## 7. Dashboard கணக்குகள்

- **Total Insert** — தேர்ந்தெடுத்த தேதி முடிய stock ledger quantity.
- **Insert Stock Value** — quantity × Insert Master unit value.
- **Used Insert / Value** — தேர்ந்தெடுத்த நாளில் issue ஆன qty/value; issue CLOSED என்றால் unused return கழித்த net consumed qty.
- **Total Revenue** — சேமிக்கப்பட்ட அனைத்து structured reports-ன் actual quantity × Side rates.
- **Selected-date Revenue** — Dashboard date reports மட்டும்.
- **Selected Month Turnover** — confirmed accounts turnover; இல்லையெனில் production-derived revenue.
- **Active Operators** — active Operator Master count.
- **Shift A/B Performance** — தேர்ந்தெடுத்த நாளின் Actual output ÷ Target output × 100.
- **Operator Percentage** — ஒவ்வொரு operator-ன் Target, Actual, percentage, used insert qty/value.

Dashboard date மாற்றினால் stock, daily usage, revenue, Shift மற்றும் Operator performance அந்த தேதிக்கே மாறும். Turnover chart அந்தத் தேதி உள்ள மாதத்தை முடிவு மாதமாக வைத்து Last 6 / Last 12 months காட்டும்.

## 8. Company → Drawing → Job → Estimate → Batch

1. Customer company உருவாக்கவும்.
2. PDF/JPG/PNG/WebP drawing upload செய்யவும்.
3. OCR Drawing No, Revision, Head/Side count மற்றும் dimensions suggestion மட்டும்; Admin drawing பார்த்து Confirm செய்ய வேண்டும்.
4. Job Master-ல் Part No மற்றும் Side 1–4 ஒவ்வொன்றுக்கும் machine, target cycle, setup, RPM, tool/holder, insert SKU மற்றும் customer rate நிரப்பவும்.
5. First/Second/Third/Fourth Side ஒவ்வொன்றுக்கும் CNC‑1…5, VMC‑1 அல்லது VTL‑1 எதையும் தனியாகத் தேர்வு செய்யலாம்; ஒரே machine-ஐ பல sides-க்கு பயன்படுத்தலாம்.
6. PO, quantity, planned start, available minutes/day, efficiency கொண்டு Job Planning & Cost Estimate save செய்யவும்.
7. Estimate-ஐ Production Batch ஆக்கி Operator assign செய்யவும்.
8. Side வரிசை PENDING → RUNNING → COMPLETE. எல்லா sides + Inspection + Oiling + Packing முடிந்த பிறகே Dispatch Ready.

## 9. இரண்டு-machine Operator விதி

1. ஒரு Operator-க்கு active current/next operations அதிகபட்சம் 2 physical machines.
2. ஒரே machine-ல் பல pending batches இருந்தால் ஒரு slot மட்டுமே.
3. `CNC-1 + VMC-1` என்பது `2/2` slots.
4. மூன்றாவது machine assignment/START Admin UI, Operator UI மற்றும் backend-ல் தடுக்கப்படும்.
5. இரண்டு வேறு machines-ல் jobs ஒரே நேரத்தில் RUNNING ஆகலாம்.
6. ஒரே physical machine-ல் இரண்டு jobs ஒரே நேரத்தில் START ஆகாது.
7. Daily Report-ல் இரண்டு வேறு-machine நேரங்கள் overlap ஆகலாம்; same-machine overlap மற்றும் மூன்றாவது concurrent machine reject ஆகும்.

## 10. Cycle மற்றும் rate விளக்கம்

Photo படி default ₹/minute range:

- CNC‑1 ₹6.6–₹7.5
- CNC‑2 ₹8–₹9
- CNC‑3 ₹5.5–₹6.6
- CNC‑4/5 ₹6.6–₹7.5
- VMC‑1 ₹11.1–₹13.3
- VTL‑1 ₹13.3–₹15.5

`Side running cost = Cycle minutes × machine ₹/minute`

- Customer Side rate ≥ maximum cost: `PROFIT`
- Rate minimum–maximum cost இடையில்: `BORDERLINE`
- Rate < minimum cost: `NOT SUITABLE`
- Target 10 min, actual 15 min: +50%, `IMPROVEMENT REQUIRED`

இந்த cost machine-running estimate. Labour, power, tool, rejection, maintenance போன்றவை machine rate-ல் சரியாக சேர்க்கப்பட்டுள்ளதா accounts review செய்ய வேண்டும்.

## 11. Insert மற்றும் drawing safety

1. One-piece insert issue qty எப்போதும் 1.
2. Old insert return அல்லது approved exception இல்லாமல் replacement close ஆகாது.
3. ஒவ்வொரு edge-க்கும் Good/Reject/cutting minutes பதிவு செய்து expected output அடிப்படையில் GOOD/POOR பார்க்கவும்.
4. Drawing OCR suggestion-ஐ மனிதர் உறுதி செய்யாமல் material/tool/inspection முடிவு எடுக்க வேண்டாம்.
5. `M10` என்பது thread callout ஆக இருக்கலாம்; material grade என்று தானாக கருதக்கூடாது.
6. Scrap estimate-க்கு raw blank weight, finished weight/actual scrap weight மற்றும் scrap rate தேவை.

## 12. V37 acceptance test

Live data-க்கு முன் test records கொண்டு சரிபார்க்கவும்:

1. Company Profile save ஆனதும் Dashboard banner மாறுகிறது.
2. மூன்று மாத turnover entries save செய்து chart value/source/growth சரியா பார்க்கவும்.
3. 6/12 selector chart மாத எண்ணிக்கையை மாற்றுகிறது.
4. Shift A/B Actual ÷ Target percentage மற்றும் operator table ஒன்றாக பொருந்துகின்றன.
5. Closed multi-piece issue-ல் unused return கழித்து Used Insert காட்டுகிறது.
6. Operator-க்கு CNC‑1 + VMC‑1 `2/2` காட்டுகிறது; மூன்றாவது machine reject ஆகிறது.
7. Side order, actual cycle, report validation மற்றும் Dispatch Ready checks சரியாக உள்ளன.
8. V37 JSON backup download செய்து preview மட்டும் சோதிக்கவும்; live restore confirmation செய்ய வேண்டாம்.

## 13. GitHub Pages release

Backend deploy மற்றும் acceptance test முடிந்த பிறகு reviewed source-ஐ GitHub repository-க்கு push செய்யவும்:

```bash
git add -A
git commit -m "Release CNC Insert Manager V37 company performance dashboard"
git push origin main
```

URLs:

- Admin: `https://arunprabaharan52-gif.github.io/Cnc-insert-manager-v21/admin.html`
- Operator: `https://arunprabaharan52-gif.github.io/Cnc-insert-manager-v21/operator.html`

பழைய PWA தெரிந்தால் browser site data/cache clear செய்து reload செய்யவும். Hardware dispenser/interlock சோதனை supervisor/electrician முன்னிலையில் isolated machine நிலையில் மட்டும் செய்ய வேண்டும்.
