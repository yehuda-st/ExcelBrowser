import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync,readFileSync,existsSync} from "node:fs";
import {resolve,dirname,extname} from "node:path";

const root=resolve(import.meta.dirname,"..");
const walk=(dir)=>existsSync(dir)?readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(dir,e.name)):[resolve(dir,e.name)]):[];
const source=walk(resolve(root,"docs/src")).filter(p=>p.endsWith(".js"));
const browser=[...source,resolve(root,"docs/discharge-data-adapter.js")];

test("Pages is the only home of application modules",()=>{
 assert.ok(source.length>=10,"Expected complete shared core and bridge modules");
 assert.equal(existsSync(resolve(root,"src")),false,"Legacy src tree must not be restored");
 assert.equal(existsSync(resolve(root,"docs/excel-bridge.js")),false,"Legacy bridge must not be restored");
});
test("all browser ES module imports resolve inside Pages",()=>{
 for(const path of browser){
  const text=readFileSync(path,"utf8");
  const imports=[...text.matchAll(/(?:from\s*|import\s*\()\s*["'](\.[^"']+)["']/g)];
  for(const match of imports){
   const target=resolve(dirname(path),match[1]);
   assert.ok(target.startsWith(resolve(root,"docs")+"/"),"Import escapes Pages: "+path+" -> "+match[1]);
   assert.ok(existsSync(target),"Missing module: "+target);
  }
 }
});
test("test suites import canonical modules rather than stale copies",()=>{
 for(const path of walk(resolve(root,"tests")).filter(p=>extname(p)===".mjs")){
  const content=readFileSync(path,"utf8");
  assert.ok(!content.includes("../src/"),"Test imports legacy src: "+path);
 }
});
