import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {dirname,resolve} from "node:path";
const paths=[
 "src/bridge/bridge-client.js",
 "src/bridge/command-contract.js",
 "src/bridge/excel-transport.js",
 "src/core/data-schema.js",
 "src/core/record-workflow.js",
 "src/core/write-batch.js"
];
const check=process.argv.includes("--check");
let failures=0;
for(const path of paths){
 const source=readFileSync(resolve(path),"utf8");
 const dest=resolve("docs",path);
 if(check){
  try{if(readFileSync(dest,"utf8")!==source){console.error("Out of sync:",dest);failures++;}}
  catch{console.error("Missing:",dest);failures++;}
 }else{
  mkdirSync(dirname(dest),{recursive:true});
  writeFileSync(dest,source);
  console.log("Synced",dest);
 }
}
if(failures)process.exitCode=1;
