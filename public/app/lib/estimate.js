// How big a translation job is. Pure function, unit-tested in tests/unit/estimate.test.mjs.

// Rough token model for the paragraphs still to translate: ~4 English characters per token in,
// ~0.5 Chinese token per source character out, plus the instructions and JSON wrapped around every batch.
// Returns null when there is nothing to translate.
export function translationSize(items){
  var chars=0, n=0;
  items.forEach(function(it){ chars+=it.en.length; n++; });
  if(!n) return null;
  var batches=Math.max(1,Math.ceil(chars/4200));
  return {words:Math.round(chars/5.8),inTok:Math.round(chars/4+n*12+batches*900),outTok:Math.round(chars*0.5+n*14+batches*80)};
}
