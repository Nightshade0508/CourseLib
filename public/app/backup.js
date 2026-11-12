// Export everything to a file, restore from one.
import './focus.js';
import { el, lsGet, lsSet } from './util.js';
import { modal, mroot } from './modal.js';
import { alertBox } from './db-actions.js';
import { toast } from './citations.js';
import { todayISO } from './study.js';
import { saveFile } from './views.js';

function sinceText(ms){
  var d=Math.floor((Date.now()-ms)/864e5);
  return d<1?'今天':d===1?'昨天':d+' 天前';
}
export function lastBackup(){ var t=+lsGet('lastBackup','0'); return t?'上次备份：'+sinceText(t):'还没有备份过'; }
export function exportBackup(){
  PTL.exportAll().then(function(b){
    lsSet('lastBackup',String(Date.now()));
    saveFile('parallel-text-library-'+todayISO()+'.json',new Blob([JSON.stringify(b)],{type:'application/json'}));
  }).catch(function(e){ alertBox('导出失败：'+((e&&e.message)||e)); });
}
export function importBackup(){
  var file=null, armed=false;
  modal('从备份恢复',[
    {name:'file',label:'备份文件（.json）',type:'file',accept:'.json,application/json',
     after:function(i){ i.addEventListener('change',function(){ file=i.files&&i.files[0]||null; armed=false; }); }},
    {name:'mode',label:'恢复方式',type:'select',options:[
      {value:'merge',label:'合并：保留这台设备上的内容，同一文档以备份为准'},
      {value:'replace',label:'替换：先清空这台设备上的全部内容'}],
     after:function(i){ i.addEventListener('change',function(){ armed=false; }); }}
  ],function(v){
    if(!file) return {error:'请先选择备份文件。'};
    if(v.mode==='replace'&&!armed){ armed=true; return {error:'替换会删除这台设备上现有的全部文档、标注和生词。确定的话再点一次「恢复」。'}; }
    return file.text().then(function(t){
      var b; try{ b=JSON.parse(t); }catch(e){ return {error:'这个文件不是有效的 JSON。'}; }
      return PTL.importAll(b,v.mode).then(function(r){
        toast('已恢复 '+r.records+' 条记录，正在刷新…');
        setTimeout(function(){ location.reload(); },800);
      });
    }).catch(function(e){ return {error:(e&&e.message)||'恢复失败'}; });
  },'恢复');
  var t=mroot.querySelector('.mtitle');
  t.parentNode.insertBefore(el('p','fhint','备份包含文档、译文、标注、生词和阅读进度，不包含 AI 账号密钥。'),t.nextSibling);
}
