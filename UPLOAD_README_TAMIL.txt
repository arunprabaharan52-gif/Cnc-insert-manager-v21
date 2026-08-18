CNC PRO V23 — SYNC / QUICK TIME / SEARCH / EDIT / PASSWORD FIX

GitHub repository root-ல் ZIP-ஐ extract செய்து கீழே உள்ள files அனைத்தையும் replace/upload செய்யவும்:
1. index.html
2. admin.html
3. operator.html
4. access-config.js
5. access-control.js
6. firebase-config.js
7. manifest.json
8. operator-manifest.json
9. service-worker.js
10. sw.js
11. firebase-messaging-sw.js

இந்த update-ல்:
- Operator report main Firebase entries-க்கு நேரடியாக atomic sync ஆகும்; Admin Dashboard உடனே refresh ஆகும்.
- Direct sync முடியாத நேரத்தில் pending queue fallback இருக்கும்; Admin திறந்ததும் atomic merge ஆகும்.
- 720 நேர option list நீக்கப்பட்டது. HH:MM-ஐ நேரடியாக type செய்து AM/PM தேர்வு செய்யலாம் (உதாரணம் 930 -> 09:30).
- Admin Saved Entries-ல் Operator / Job / Part No / Machine quick search, Operator filter, From/To date filter உள்ளது.
- Admin entry Edit / Update வசதி உள்ளது.
- Operator-க்கு My Recent Reports / Edit வசதி உள்ளது.
- Admin password மற்றும் Operator password தனித்தனியாக மாற்றலாம்.
- Admin page-ல் Admin password-ஐயும் Operator password-ஐயும் மாற்றலாம்; Operator page-ல் Operator password மாற்றலாம்.
- புதிய service-worker cache version பழைய HTML/cache-ஐ நீக்கும்.

Admin URL: https://arunprabaharan52-gif.github.io/Cnc-insert-manager-v21/
Admin direct URL: https://arunprabaharan52-gif.github.io/Cnc-insert-manager-v21/admin.html
Operator URL: https://arunprabaharan52-gif.github.io/Cnc-insert-manager-v21/operator.html
