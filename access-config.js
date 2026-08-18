/*
  CNC PRO V23 access configuration.
  Passwords are not stored here as plain text. Only PBKDF2 hashes are kept.
  To change either password, generate a new hash and replace only this file.
*/
window.CNC_ACCESS_CONFIG={
  version:2,
  sessionMinutes:480,
  maxAttempts:5,
  lockSeconds:30,
  pbkdf2Iterations:120000,
  admin:{
    label:'Admin',
    title:'CNC Admin Login',
    subtitle:'Dashboard, reports, masters and settings',
    salt:'cnc-pro-v23-admin-2026-a8f3',
    passwordHash:'b139e9b422a6f37e4b0eb7866805bf0f074358702431442fd32e0c4649291a96'
  },
  operator:{
    label:'Operator',
    title:'CNC Operator Login',
    subtitle:'Daily operator entry only',
    salt:'cnc-pro-v23-operator-2026-d4b9',
    passwordHash:'c32fcd3048a659531ac194585f222380d5616758edbfbd235aebff4591077bce'
  }
};
