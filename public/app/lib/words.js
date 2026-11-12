// Vocabulary helpers for learning mode. Pure functions, unit-tested in tests/unit/words.test.mjs.

// Frequency rank of a word (1 = most common) in `words`, a Map from lower-case word form to rank.
// Inflected forms missing from the list fall back to their likely base form; unknown words rank Infinity.
export function wordRank(words,w){
  var r=words.get(w); if(r) return r;
  var f=[];
  if(/ies$/.test(w)) f.push(w.slice(0,-3)+'y');
  if(/es$/.test(w)) f.push(w.slice(0,-2));
  if(/s$/.test(w)) f.push(w.slice(0,-1));
  if(/ed$/.test(w)){ f.push(w.slice(0,-2)); f.push(w.slice(0,-1)); }
  if(/ing$/.test(w)){ f.push(w.slice(0,-3)); f.push(w.slice(0,-3)+'e'); }
  if(/ly$/.test(w)) f.push(w.slice(0,-2));
  for(var i=0;i<f.length;i++){ r=words.get(f[i]); if(r) return r; }
  return Infinity;
}

// Walk the words of a paragraph. isUnknown(word, sentenceInitial) decides; returns the word count and
// the [start,end) offsets of the unknown ones.
export function scanWords(t,isUnknown){
  var unk=[], words=0, re=/[A-Za-z][A-Za-z'’-]*[A-Za-z]|[A-Za-z]/g, m;
  while((m=re.exec(t))){
    words++;
    var initial=/(^|[.!?:]["'’”)\]]*\s+|^["'‘“(\[]+)$/.test(t.slice(Math.max(0,m.index-4),m.index));
    if(isUnknown(m[0],initial)) unk.push([m.index,m.index+m[0].length]);
  }
  return {unk:unk,words:words};
}

// A paragraph keeps its Chinese when it has two or more obstacles (unknown words, sentences over 40 words),
// or a single unknown word in a very short paragraph.
export function isHardParagraph(unknown,words,longSentences){
  return unknown+longSentences>=2||(unknown>=1&&words<=12);
}
