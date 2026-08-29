// V37 uses Firebase Authentication and server-enforced roles.
// This compatibility file intentionally contains no password hashes.
globalThis.CNC_ACCESS_CONFIG = Object.freeze({ version: 37, sharedPasswordsDisabled: true });
