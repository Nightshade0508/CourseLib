// Cost estimate: Anthropic list prices, OpenRouter's own price list.
import './dict.js';
import { acct } from './ai-account.js';
import { loadOpenRouterModels, orPrice } from './openrouter.js';
import { modelFor } from './sample.js';

var PRICES={ // USD per million tokens [input, output]
  'claude-fable-5-1':[10,50],'claude-fable-5':[10,50],'claude-opus-5-5':[4,20],'claude-opus-5':[5,25],
  'claude-opus-4-8':[5,25],'claude-opus-4-7':[5,25],'claude-opus-4-6':[5,25],
  'claude-sonnet-5-5':[2,10],'claude-sonnet-5':[2,10],'claude-sonnet-4-6':[3,15],
  'claude-haiku-5-5':[0.1,0.5],'claude-haiku-4-5':[1,5]
};
export function estimate(o){
  if(!acct) return Promise.resolve(null);
  var quick=o.tier==='quick', model=modelFor({modelTier:o.tier});
  return (acct.provider==='openrouter'?loadOpenRouterModels():Promise.resolve()).then(function(){
    var p=acct.provider==='anthropic'?PRICES[model]:acct.provider==='openrouter'?orPrice[model]:null;
    // non-quick calls leave room for the model's own reasoning tokens
    var out=o.outTokens*(quick?1:1.3);
    return {model:model,tokens:Math.round(o.inTokens+out),usd:p?(o.inTokens*p[0]+out*p[1])/1e6:null,sameModel:(acct.quickModel||acct.model)===acct.model};
  });
}
