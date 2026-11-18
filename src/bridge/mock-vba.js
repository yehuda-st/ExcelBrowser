import {ACTIONS} from "./command-contract.js";
const clone=value=>structuredClone(value);
export class MockVBA {
 constructor(files=[],settings={}){
  this.files=new Map(files.map(f=>[f.path,clone(f)]));
  this.settings=clone(settings);
  this.staging=new Map();
  this.bridgeFiles=[];
  this.queue=[];
  this.executed=new Map();
 }
 enqueue(job){
  if(!ACTIONS.includes(job.action)||!job.id)throw Error("Invalid command");
  if(this.queue.some(x=>x.id===job.id))throw Error("Duplicate command ID");
  const entry={...clone(job),status:"PENDING",result:null,error:null};
  this.queue.push(entry);return entry;
 }
 async trigger(){
  for(const job of this.queue.filter(j=>j.status==="PENDING")){
   job.status="RUNNING";
   try{
    if(this.executed.has(job.id)){job.result=clone(this.executed.get(job.id));job.status="DONE";continue;}
    const result=this.execute(job.action,job.params);
    job.result=result;this.executed.set(job.id,clone(result));job.status="DONE";
   }catch(error){job.error=String(error.message||error);job.status="ERROR";}
  }
  return clone(this.queue);
 }
 execute(action,p={}){
  switch(action){
   case "PING":return {pong:true};
   case "INIT":{
    const {PatientsFolder,DataFilePath}=this.settings;
    if(!PatientsFolder||!DataFilePath)throw Error("Missing Settings: PatientsFolder or DataFilePath");
    const folder=PatientsFolder.replace(/[\\/]+$/,"");
    const candidates=[...this.files.values()].filter(f=>f.path.replace(/\\/g,"/").startsWith(folder.replace(/\\/g,"/")+"/")&&/\\.xlsx?m?$/i.test(f.path));
    candidates.sort((a,b)=>String(b.modifiedAt).localeCompare(String(a.modifiedAt))||a.path.localeCompare(b.path));
    if(!candidates.length)throw Error("No patient files in folder: "+PatientsFolder);
    const data=this.files.get(DataFilePath);
    if(!data)throw Error("Data file not found: "+DataFilePath);
    const describe=(kind,f)=>({kind,path:f.path,modifiedAt:f.modifiedAt,size:f.size??0});
    this.bridgeFiles=[describe("PATIENTS",candidates[0]),describe("DATA",data)];
    return {files:clone(this.bridgeFiles)};
   }
   case "READ_FILE":{
    const file=this.files.get(p.path);
    if(!file)throw Error("File not found: "+p.path);
    if(file.locked)throw Error("File locked: "+p.path);
    if(!p.sheet)throw Error("Missing destination sheet");
    this.staging.set(p.sheet,clone(file.rows));return {sheet:p.sheet,rowCount:file.rows.length,modifiedAt:file.modifiedAt};
   }
   case "WRITE_ROWS":{
    const file=this.files.get(p.path);
    if(!file)throw Error("File not found: "+p.path);
    if(file.locked)throw Error("File locked: "+p.path);
    if(p.expectedModifiedAt!==file.modifiedAt)throw Error("File changed since read");
    const changes=this.staging.get(p.sheet);
    if(!Array.isArray(changes))throw Error("Missing staging sheet: "+p.sheet);
    const rows=clone(file.rows);
    for(const change of changes){
     if(change.operation==="UPDATE"){
      if(!Number.isInteger(change.rowIndex)||change.rowIndex<0||change.rowIndex>=rows.length)throw Error("Invalid row index");
      if(!change.values||typeof change.values!=="object")throw Error("Missing update values");
      Object.assign(rows[change.rowIndex],clone(change.values));
     }else if(change.operation==="INSERT"){
      if(!change.values||typeof change.values!=="object")throw Error("Missing insert values");
      rows.push(clone(change.values));
     }else throw Error("Unsupported row operation");
    }
    file.rows=rows;file.modifiedAt=new Date(Date.parse(file.modifiedAt||"2026-01-01T00:00:00Z")+1000).toISOString();
    return {written:changes.length,modifiedAt:file.modifiedAt};
   }
   default:throw Error("Unsupported action");
  }
 }
 getFile(path){return clone(this.files.get(path));}
 setStaging(sheet,rows){this.staging.set(sheet,clone(rows));}
 getStaging(sheet){return clone(this.staging.get(sheet));}
}
