const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const source = fs.readFileSync(path.join(__dirname,'../src/main/main.js'),'utf8');
let passes=0;
function test(name, fn) { fn(); passes++; console.log('PASS',name); }
function boot(userData, encryption=true) {
  const handlers=new Map(); const events=new Map(); const windows=[]; const state={quit:false,errorShown:false};
  let start;
  class Window { constructor(options){this.options=options;windows.push(this);} on(){} loadFile(){} static getAllWindows(){return windows;} }
  const electron={
    app:{getPath:()=>userData,getVersion:()=> '0.6.0',requestSingleInstanceLock:()=>true,quit(){state.quit=true;},on:(n,f)=>events.set(n,f),whenReady:()=>({then:f=>{start=f;}})},
    BrowserWindow:Window,ipcMain:{handle:(n,f)=>handlers.set(n,f)},dialog:{showOpenDialog:async()=>({canceled:true,filePaths:[]}),showErrorBox:()=>{state.errorShown=true;}},
    safeStorage:{isEncryptionAvailable:()=>encryption,encryptString:v=>Buffer.from('MOCK_CIPHERTEXT:'+v)}
  };
  const ctx=vm.createContext({require:n=>n==='electron'?electron:require(n),__dirname:path.join(__dirname,'../src/main'),process,Buffer,console});
  vm.runInContext(source,ctx);start();
  return {ctx,handlers,events,windows,electron,state};
}
const base=fs.mkdtempSync(path.join(os.tmpdir(),'dvl-gate-'));
const data=path.join(base,'data'); const project=path.join(base,'project');
fs.mkdirSync(project);fs.writeFileSync(path.join(project,'notes.txt'),'unchanged');
const r=boot(data); const c=r.ctx;
try {
 test('SQLite schema and integrity',()=>{const d=new DatabaseSync(path.join(data,'dvl.sqlite'),{readOnly:true});assert.equal(d.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(d.prepare('SELECT count(*) n FROM schema_migrations').get().n,2);d.close();});
 const id=c.upsertProject(project).projectId;
 test('Same canonical path reuses ID',()=>assert.equal(c.upsertProject(project).projectId,id));
 test('Path alias reuses ID',()=>{const alias=path.join(base,'alias');fs.symlinkSync(project,alias);assert.equal(c.upsertProject(alias).projectId,id);});
 test('Settings read and write',()=>{c.setSetting('test',{n:1});assert.equal(c.getSetting('test').n,1);});
 test('Missing folder yields null and unavailable recent',()=>{fs.renameSync(project,project+'-away');assert.equal(c.getLastProject(),null);assert.equal(c.listRecentProjects()[0].available,false);fs.renameSync(project+'-away',project);});
 test('Restored folder preserves ID',()=>assert.equal(c.getLastProject().projectId,id));
 test('Project files unchanged',()=>assert.equal(fs.readFileSync(path.join(project,'notes.txt'),'utf8'),'unchanged'));
 test('Secret result contains status only (mock encryption)',()=>{const result=c.setSecret('test','fake-value');assert.deepEqual(Object.keys(result),['configured']);assert.equal(c.hasSecret('test').configured,true);assert.equal(c.deleteSecret('test').deleted,true);});
 test('BrowserWindow security flags',()=>{const w=r.windows[0].options.webPreferences;assert.equal(w.nodeIntegration,false);assert.equal(w.contextIsolation,true);assert.equal(w.sandbox,true);});
 c.closeDatabase();
 const reopened=boot(data);test('Restart preserves ID and setting',()=>{assert.equal(reopened.ctx.getLastProject().projectId,id);assert.equal(reopened.ctx.getSetting('test').n,1);});reopened.ctx.closeDatabase();
 const unavailable=boot(path.join(base,'no-crypto'),false);test('Unavailable encryption rejects secret write',()=>assert.throws(()=>unavailable.ctx.setSecret('test','fake'),/encryption is not available/));unavailable.ctx.closeDatabase();
 console.log('NORMAL CHECKS PASSED:',passes);
 const replaced=boot(data);fs.renameSync(project,project+'-away');fs.writeFileSync(project,'This is a regular file');
 const restored=replaced.ctx.getLastProject();
 test('File replacement is unavailable, not restored',()=>{assert.equal(restored,null);assert.equal(replaced.ctx.listRecentProjects()[0].available,false);assert.throws(()=>replaced.ctx.upsertProject(project),/directory/);});
 replaced.ctx.closeDatabase();fs.unlinkSync(project);fs.renameSync(project+'-away',project);
 const corrupt=path.join(base,'corrupt');fs.mkdirSync(corrupt);fs.writeFileSync(path.join(corrupt,'dvl.sqlite'),'not a sqlite database');
 test('Corrupt database handled and retained',()=>{const failed=boot(corrupt);assert.equal(failed.state.quit,true);assert.equal(failed.state.errorShown,true);assert.equal(failed.windows.length,0);assert.equal(fs.readFileSync(path.join(corrupt,'dvl.sqlite'),'utf8'),'not a sqlite database');assert.match(fs.readFileSync(path.join(corrupt,'logs/dvl.log'),'utf8'),/app.startup_failed/);}); console.log('TOTAL CHECKS PASSED:',passes);
} finally {c.closeDatabase();fs.rmSync(base,{recursive:true,force:true});}
