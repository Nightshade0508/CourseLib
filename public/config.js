// Site settings. This file is loaded before the app.
//
// Accounts and cloud sync are off until `firebase` is filled in with the web-app configuration of a Firebase
// project (docs/ACCOUNTS.md walks through creating one). These values identify the project; they are meant to
// be public. What protects each account's data is the security rules in firebase/firestore.rules.
window.PTL_CONFIG = {
  firebase: { apiKey: "AIzaSyCCS_rlrheJSWpgDFReUQtZ1D87rkbhtsc",
  authDomain: "courselib.firebaseapp.com",
  projectId: "courselib",
  storageBucket: "courselib.firebasestorage.app",
  messagingSenderId: "258458546907",
  appId: "1:258458546907:web:50b388bf30ba914c2c52fe",
  measurementId: "G-68B3Y2JJZJ" },
};
