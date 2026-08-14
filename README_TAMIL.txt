CNC PRO V23 - TWO SEPARATE INSTALLABLE APPS

UPLOAD THE WHOLE FOLDER CONTENTS TO ONE GITHUB PAGES REPOSITORY.

After GitHub Pages is live:

ADMIN LINK
https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/admin/

OPERATOR LINK
https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/operator/

These are TWO separate PWA identities:
- CNC PRO V23 Admin
- CNC PRO V23 Operator Daily Report

Each folder has its own:
- index.html
- manifest.json
- service-worker.js
- app ID / scope
- cache

INSTALL:
Open the correct link in Chrome.
Menu -> Add to Home screen / Install app.
Admin and Operator can appear as two separate apps on the phone.

NEXT STEP:
Fill Firebase config and connect both apps to the same Realtime Database.
Then operator submissions will appear automatically in Admin Dashboard.
