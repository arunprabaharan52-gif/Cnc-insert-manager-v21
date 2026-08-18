CNC PRO V23 V29 — OPERATOR REPORT REPAIR / OPERATOR EDIT / SEARCH FIX

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
- Operator report முதலில் safe pending queue-ல் சேமிக்கப்பட்டு, main Firebase entries-க்கு atomic sync ஆகும்.
- Firebase transaction உண்மையில் committed ஆனதா சரிபார்க்கப்படும்; தவறான success message இனி வராது.
- sourceId இல்லாத பழைய pending reports-க்கும் V29 தானாக ID உருவாக்கி Admin entries-ல் சேர்க்கும்.
- Admin Dashboard-ல் pending count/status மற்றும் “Sync Pending Reports Now” button உள்ளது; 15 seconds auto-retry இருக்கும்.
- 720 நேர option list நீக்கப்பட்டது. HH:MM-ஐ நேரடியாக type செய்து AM/PM தேர்வு செய்யலாம் (உதாரணம் 930 -> 09:30).
- Admin header-ல் “Search Records” தனி button உள்ளது; Operator / Job / Part No / Machine quick search, Operator filter, From/To date filter, Edit மற்றும் Delete உள்ளது.
- Operator Master-ல் பெயர்/code/shift/phone Search, Edit/Update, Delete வசதி உள்ளது; duplicate/தவறான பெயரை சரி செய்யலாம்.
- Operator-க்கு My Recent Reports / Edit வசதி உள்ளது.
- Admin password மற்றும் Operator password தனித்தனியாக மாற்றலாம்.
- Admin page-ல் Admin password-ஐயும் Operator password-ஐயும் மாற்றலாம்; Operator page-ல் Operator password மாற்றலாம்.
- Header-ல் V29 badge இருக்கும்; புதிய service-worker cache version பழைய HTML/cache-ஐ நீக்கும்.

முக்கியம்: ZIP file-ஐ மட்டும் upload செய்ய வேண்டாம். ZIP-ஐ extract செய்து மேலே உள்ள 11 files-ஐ repository root-ல் Replace செய்து Commit changes அழுத்தவும்.
Commit முடிந்தபின் page header-ல் V29 badge தெரிகிறதா சரிபார்க்கவும்.

Admin URL: https://arunprabaharan52-gif.github.io/Cnc-insert-manager-v21/
Admin direct URL: https://arunprabaharan52-gif.github.io/Cnc-insert-manager-v21/admin.html
Operator URL: https://arunprabaharan52-gif.github.io/Cnc-insert-manager-v21/operator.html
