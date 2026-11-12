// Entry point of the app.
//
// The app was one long script before it was split into the files in this folder, and its files still run
// in that original order: every file's first import is the file that runs right before it, so importing
// the last one (boot.js) runs them all, first to last. Keep that first import when adding a file that does
// work as soon as it loads; helpers that only export functions (app/lib/) need no place in the order.
import '../runtime/main.js';   // window.claude.use('sample' | 'db' | 'downloads') and window.PTL
import './boot.js';
