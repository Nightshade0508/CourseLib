// Site settings. This file is loaded before the app.
//
// Accounts and cloud sync are off until `firebase` is filled in with the web-app configuration of a Firebase
// project (docs/ACCOUNTS.md walks through creating one). These values identify the project; they are meant to
// be public. What protects each account's data is the security rules in firebase/firestore.rules.
window.PTL_CONFIG = {
  firebase: null,
  // firebase: { apiKey: '…', authDomain: '….firebaseapp.com', projectId: '…', appId: '…' },
};
