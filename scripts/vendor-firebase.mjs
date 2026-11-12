// Bundles the parts of the Firebase web SDK the site uses (accounts and cloud sync) into one browser module:
// public/vendor/firebase.mjs. It is loaded only when public/config.js turns accounts on.
// Run after changing the firebase version in package.json: npm install && npm run vendor:firebase
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await build({
  stdin: {
    resolveDir: root,
    contents: `
      export { initializeApp, SDK_VERSION } from 'firebase/app';
      export {
        initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserPopupRedirectResolver, connectAuthEmulator,
        onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider,
        sendPasswordResetEmail, sendEmailVerification, signOut, deleteUser,
      } from 'firebase/auth';
      export {
        getFirestore, connectFirestoreEmulator, collection, doc, query, orderBy, limit, startAfter, getDocs, writeBatch,
        serverTimestamp, documentId, Timestamp,
      } from 'firebase/firestore/lite';
    `,
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
  banner: { js: '/* Firebase JS SDK (app, auth, firestore/lite) — Apache-2.0, https://github.com/firebase/firebase-js-sdk */' },
  outfile: path.join(root, 'public/vendor/firebase.mjs'),
});
console.log('wrote public/vendor/firebase.mjs');
