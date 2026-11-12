// Sentence splitting and sentence alignment between an English paragraph and its Chinese translation.
// Pure functions (no DOM), unit-tested in tests/unit/sentences.test.mjs.

var ABBR=/(?:^|[\s(\[])(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|cf|al|ed|eds|vol|vols|no|nos|p|pp|ch|chap|fig|figs|Inc|Ltd|Co|ca|approx|op|cit|ibid|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|[A-Z])\.$/;
function trimSeg(t,a,b){ while(a<b&&/\s/.test(t[a])) a++; while(b>a&&/\s/.test(t[b-1])) b--; return [a,b]; }
export function splitEn(t){
  var out=[], start=0, re=/[.!?]+["'’”)\]]*(?=\s+["'‘“(\[]?[A-Z0-9]|\s*$)/g, m;
  while((m=re.exec(t))){
    var end=m.index+m[0].length;
    if(m[0]==='.'&&ABBR.test(t.slice(Math.max(start,m.index-12),m.index+1))) continue;
    var s=trimSeg(t,start,end); if(s[1]>s[0]) out.push(s);
    start=end;
  }
  var s2=trimSeg(t,start,t.length); if(s2[1]>s2[0]) out.push(s2);
  return out;
}
export function splitZh(t){
  var out=[], start=0, re=/(?:[。！？]|[!?](?=\s|$)|…+(?=\s*$))+[”」』）)"'’]*/g, m;
  while((m=re.exec(t))){ var end=m.index+m[0].length, s=trimSeg(t,start,end); if(s[1]>s[0]) out.push(s); start=end; }
  var s2=trimSeg(t,start,t.length); if(s2[1]>s2[0]) out.push(s2);
  return out;
}
// length-based alignment (Gale & Church 1993) allowing 1-1, 2-1, 1-2, 2-2, 3-1, 1-3 and unmatched sentences
var BEADS=[[1,1,0],[2,1,2.2],[1,2,2.2],[1,0,4.5],[0,1,4.5],[2,2,3.4],[3,1,4],[1,3,4]];
export function alignLens(a,b){
  var n=a.length, m=b.length, A=[0], B=[0], i, j, k;
  for(i=0;i<n;i++) A.push(A[i]+a[i]);
  for(j=0;j<m;j++) B.push(B[j]+b[j]);
  var c=B[m]/Math.max(1,A[n]), D=[], P=[];
  for(i=0;i<=n;i++){ D.push([]); P.push([]); for(j=0;j<=m;j++){ D[i].push(Infinity); P[i].push(null); } }
  D[0][0]=0;
  for(i=0;i<=n;i++) for(j=0;j<=m;j++){
    if(!i&&!j) continue;
    for(k=0;k<BEADS.length;k++){
      var bd=BEADS[k]; if(bd[0]>i||bd[1]>j) continue;
      var prev=D[i-bd[0]][j-bd[1]]; if(prev===Infinity) continue;
      var l1=(A[i]-A[i-bd[0]])*c, l2=B[j]-B[j-bd[1]], d=(l2-l1)/Math.sqrt(0.3*(l1+l2)+9), cost=prev+bd[2]+d*d/2;
      if(cost<D[i][j]){ D[i][j]=cost; P[i][j]=bd; }
    }
  }
  var beads=[]; i=n; j=m;
  while(i>0||j>0){ var b2=P[i][j]; if(!b2) break; beads.unshift({en:[i-b2[0],i],zh:[j-b2[1],j]}); i-=b2[0]; j-=b2[1]; }
  return beads;
}

// Align the sentences of an English text with those of its Chinese translation.
// Returns {es, zs, beads}: sentence [start,end) offsets in each text, and beads {en:[i,j), zh:[i,j)} pairing them.
export function alignSentences(et,zt){
  var es=splitEn(et), zs=splitZh(zt);
  // Latin names and terms inside the Chinese count at roughly their English weight
  var zl=zs.map(function(s){ var t=zt.slice(s[0],s[1]); return (t.match(/[㐀-鿿]/g)||[]).length+(t.match(/[A-Za-z0-9]/g)||[]).length*0.35+1; });
  return {es:es,zs:zs,beads:alignLens(es.map(function(s){ return s[1]-s[0]; }),zl)};
}
