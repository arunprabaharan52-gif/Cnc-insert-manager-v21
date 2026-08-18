CNC INSERT MANAGER PRO V23 — ADMIN / OPERATOR PASSWORD LOGIN UPDATE

GitHub repository root-ல் கீழே உள்ள 6 files-ஐ replace / upload செய்யவும்:

1. admin.html
2. index.html
3. operator.html
4. service-worker.js
5. access-config.js
6. access-control.js

இந்த update-ல் செய்யப்பட்ட மாற்றங்கள்:

- மொத்த Daily Entry In Time / Out Time fields நீக்கப்பட்டுள்ளன.
- ஒரு CNC Machine report-ல் Job 1, Job 2, Job 3 சேர்க்கலாம்.
- ஒவ்வொரு Job-க்கும் தனியாக Job Name, Part Number, Cycle Time, Actual Jobs உள்ளன.
- ஒவ்வொரு Job-க்கும் தேவையான அளவு In / Out work sessions சேர்க்கலாம்.
- Lunch / break செல்லும்போது அந்த session-க்கு Out கொடுத்து, திரும்ப வந்ததும் “+ Resume / Add Session” மூலம் புதிய In / Out session சேர்க்கலாம்.
- எல்லா Job session time fields-மும் 12-hour format + AM/PM selection ஆகும்.
- ஒவ்வொரு session-ன் வேலை நேரம் தனியாகவும், ஒவ்வொரு Job-ன் மொத்த Active Working Hours தனியாகவும் automatic calculation ஆகும்.
- Session-களுக்கு நடுவிலுள்ள Lunch / Break நேரம் “Break Excluded” ஆகும்; Target மற்றும் Percentage கணக்கில் அது சேராது.
- Break நேரம் 30 நிமிடம் / 1 மணி என்று fixed கிடையாது. அனைத்து Job-களிலும் ஒரு Out-இலிருந்து அடுத்த In வரை உள்ள உண்மையான இடைவெளிகள் மட்டும் Actual Break ஆகும்.
- Job 1 முடிந்து Job 2 தொடங்கும் இடைவெளியும், Job 2 முடிந்து Job 3 தொடங்கும் இடைவெளியும் Overall Actual Break கணக்கில் சேரும்.
- First In முதல் Last Out வரை Total Presence கணக்கிடப்படும். அதிலிருந்து Actual Break கழித்ததே Net Active Working Hours.
- 8 மணி நேர cap கிடையாது; தனி Overtime கணக்கும் கிடையாது. Operator 8 மணி அல்லது 10 மணி இருந்தாலும், உண்மையான Break கழித்த முழு Net Work நேரமே Target / Percentage கணக்கில் வரும்.
- வேறு Job session-கள் ஒரே நேரத்தில் overlap ஆனால் Save அனுமதிக்காது; double working-hour count வராது.
- ஒவ்வொரு Job-ன் Active Working Hours, Target, Job Percentage தனியாக automatic calculation ஆகும்.
- Total Active Working Hours, Total Target, Total Actual, Overall Operator Percentage automatic calculation ஆகும்.
- Admin Saved Entries table மற்றும் CSV export-ல் Job 1–3-ன் எல்லா session நேரங்களும் தனித்தனியாக வரும்.
- பழைய single-job entries delete ஆகாது; அவை Job 1 ஆக தொடர்ந்து காணப்படும்.
- பழைய one In / Out கொண்ட Job entries ஒரு session ஆக தொடர்ந்து காணப்படும்.
- Firebase paths மாற்றப்படவில்லை: cncManager/db மற்றும் cncManager/operatorSubmissions அப்படியே உள்ளன.
- Root URL மற்றும் admin.html இரண்டுக்கும் Admin password login சேர்க்கப்பட்டுள்ளது.
- operator.html-க்கு தனியான Operator password login சேர்க்கப்பட்டுள்ளது.
- Operator login செய்தால் Daily Operator Entry page மட்டும் திறக்கும்; Dashboard, Operator Master, Insert Master, Backup போன்ற Admin பகுதிகள் கிடையாது.
- Admin password மற்றும் Operator password இரண்டும் வேறு; Operator password மூலம் Admin page திறக்க முடியாது.
- Password plain text-ஆக project file-ல் சேமிக்கப்படவில்லை; PBKDF2 hash மட்டுமே access-config.js-ல் உள்ளது.
- 5 தவறான password முயற்சிகளுக்குப் பிறகு 30 விநாடி தற்காலிக lock வரும்.
- Login session 8 மணி நேரம் செல்லுபடியாகும்; Logout button மூலம் உடனே வெளியேறலாம்.
- service-worker cache version மாற்றப்பட்டுள்ளது; பழைய page cache தானாக நீக்கப்படும்.

GitHub Pages URL:
Admin: https://arunprabaharan52-gif.github.io/Cnc-insert-manager-v21/admin.html
Operator: https://arunprabaharan52-gif.github.io/Cnc-insert-manager-v21/operator.html
Root: https://arunprabaharan52-gif.github.io/Cnc-insert-manager-v21/

கவனம்:
firebase-config.js, manifest.json மற்றும் மற்ற files-ஐ மாற்ற வேண்டாம்.
access-config.js மற்றும் access-control.js இரண்டையும் upload செய்யாமல் விட்டால் Login page வேலை செய்யாது.
Admin password-ஐ Operator-களிடம் கொடுக்க வேண்டாம். Operator page link மற்றும் Operator password மட்டும் கொடுக்கவும்.
Password-ஐ மாற்ற வேண்டுமெனில் புதிய password-க்கு புதிய hash உள்ள access-config.js உருவாக்க வேண்டும்.

கணக்கு உதாரணம்:
Session 1: 08:00 AM – 01:00 PM = 5 மணி
Session 2: 02:00 PM – 05:00 PM = 3 மணி
Active Working Hours = 8 மணி; Break Excluded = 1 மணி
Cycle Time 10 நிமிடம் என்றால் Target = 48; Actual 45 என்றால் Percentage = 93.75%

Variable Break உதாரணங்கள்:
08:00 AM – 04:00 PM Presence = 8 மணி; Actual Break 30 நிமிடம் என்றால் Net Work = 7.50 மணி.
08:00 AM – 06:00 PM Presence = 10 மணி; Actual Break 45 நிமிடம் என்றால் Net Work = 9.25 மணி.
10 மணி இருந்ததற்காக நேரம் 8 மணியாகக் குறைக்கப்படாது; Overtime என்று தனியாகவும் பிரிக்கப்படாது.
