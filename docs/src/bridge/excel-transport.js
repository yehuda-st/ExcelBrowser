// Office.js transport for the same BridgeClient contract as MockExcelTransport.
// The staging cache is mirrored to Excel before a command, and refreshed after it.
const HEADERS=["CommandID","Status","Action","Path","TableName","SheetName","ExpectedModifiedAt","ExpectedRows","BatchID","Result","Error","Trigger"];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Bounded, non-persistent diagnostics. Never log patient rows, file paths or record contents.
const diagnosticLog=[];
export function getBridgeDiagnostics(){return structuredClone(diagnosticLog);}
function logBridge(event,details={}){
 const item={at:new Date().toISOString(),event,...details};
 diagnosticLog.push(item);if(diagnosticLog.length>150)diagnosticLog.shift();
 if(event==="error")console.error("[ExcelBridge]",item);else console.debug("[ExcelBridge]",item);
}
function errorDetails(e){return {message:String(e?.message||e),code:String(e?.code||""),name:String(e?.name||""),debugCode:String(e?.debugInfo?.code||""),debugLocation:String(e?.debugInfo?.errorLocation||"")};}
export class ExcelTransport {
 constructor({timeoutMs=30000}={}){this.timeoutMs=timeoutMs;this.staging=new Map();this.dirty=new Set();this.pending=null;}
 setStaging(sheet,rows){this.staging.set(sheet,structuredClone(rows));this.dirty.add(sheet);}
 getStaging(sheet){return structuredClone(this.staging.get(sheet));}
 getDiagnostics(){return getBridgeDiagnostics();}
 enqueue(job){
  if(this.pending)throw Error("Only one outstanding Excel command is supported");
  const entry={...structuredClone(job),status:"PENDING",result:null,error:null};
  this.pending=entry;logBridge("enqueue",{action:job.action,commandId:job.id});return entry;
 }
 async trigger(){
  const job=this.pending;if(!job)throw Error("No pending command");
  let stage="starting",started=Date.now();
  const mark=(name,details={})=>{stage=name;logBridge("stage",{action:job.action,commandId:job.id,stage,...details});};
  try{
   mark("Excel.run: begin");
   await Excel.run(async ctx=>{
    for(const sheet of this.dirty){
     mark("staging: "+sheet+" begin",{rowCount:this.staging.get(sheet).length});
     await this.writeStaging(ctx,sheet,this.staging.get(sheet),mark);
     mark("staging: "+sheet+" complete");
    }
    mark("queue: get table/header");
    const table=ctx.workbook.tables.getItem("BridgeQueue");
    const header=table.getHeaderRowRange();header.load("values");await ctx.sync();
    const columns=header.values[0].map(String);
    const values={CommandID:job.id,Status:"PENDING",Action:job.action,Path:job.params.path??"",TableName:job.params.table??"",SheetName:job.params.sheet??"",ExpectedModifiedAt:job.params.expectedModifiedAt??"",ExpectedRows:job.params.expectedRows??"",BatchID:job.params.batchId??"",Result:"",Error:"",Trigger:""};
    mark("queue: read row count");
    table.rows.load("count");await ctx.sync();
    job.rowIndex=table.rows.count;
    mark("queue: append command");
    table.rows.add(null,[columns.map(h=>values[h]??"")]);
    await ctx.sync();
    mark("queue: append complete",{rowIndex:job.rowIndex});
    const last=table.getDataBodyRange().getLastRow();
    mark("queue: set trigger");
    last.getCell(0,columns.indexOf("Trigger")).values=[[job.id]];
    await ctx.sync();
    mark("queue: trigger complete");
   });
   this.dirty.clear();
   mark("queue: polling");
   const deadline=Date.now()+this.timeoutMs;
   while(Date.now()<deadline){
    const row=await Excel.run(async ctx=>{
     const t=ctx.workbook.tables.getItem("BridgeQueue");
     t.rows.load("count");await ctx.sync();
     if(t.rows.count<=job.rowIndex)throw Error("BridgeQueue command row removed");
     const h=t.getHeaderRowRange(),r=t.getDataBodyRange().getRow(job.rowIndex);
     h.load("values");r.load("values");await ctx.sync();
     const cols=h.values[0].map(String);
     const found=Object.fromEntries(cols.map((k,i)=>[k,r.values[0][i]]));
     if(String(found.CommandID)!==job.id)throw Error("BridgeQueue command row moved");
     return found;
    });
    if(row?.Status==="DONE"){
     job.status="DONE";
     mark("queue: DONE",{elapsedMs:Date.now()-started});
     job.result=row.Result?JSON.parse(String(row.Result)):{};
     if(job.action==="READ_FILE"){
      mark("staging: read response");
      this.staging.set(job.params.sheet,await this.readStaging(job.params.sheet));
     }
     break;
    }
    if(row?.Status==="ERROR"){job.status="ERROR";job.error=String(row.Error||row.Result||"VBA error");logBridge("error",{action:job.action,commandId:job.id,stage:"VBA response",message:job.error});break;}
    await sleep(350);
   }
   if(job.status==="PENDING"){job.status="ERROR";job.error="Timed out waiting for VBA; inspect BridgeQueue";logBridge("error",{action:job.action,commandId:job.id,stage,elapsedMs:Date.now()-started,message:job.error});}
  }catch(e){job.status="ERROR";const details=errorDetails(e);job.error=job.action+" ["+stage+"]: "+details.message+(details.code?" ("+details.code+")":"");logBridge("error",{action:job.action,commandId:job.id,stage,elapsedMs:Date.now()-started,...details});}
  finally{this.pending=null;}
 }
 async readStaging(sheet){
  return Excel.run(async ctx=>{
   const t=ctx.workbook.tables.getItem(sheet),h=t.getHeaderRowRange();
   h.load("values");t.rows.load("count");await ctx.sync();
   const cols=h.values[0].map(String);
   if(t.rows.count===0)return [];
   const b=t.getDataBodyRange();b.load("values");await ctx.sync();
   return b.values.map(v=>Object.fromEntries(cols.map((k,i)=>[k,v[i]])));
  });
 }
 async writeStaging(ctx,sheet,rows,mark=()=>{}){
  const t=ctx.workbook.tables.getItem(sheet),h=t.getHeaderRowRange();
  mark("staging: read headers/count");
  h.load("values");t.rows.load("count");await ctx.sync();
  const cols=h.values[0].map(String);
  const values=rows.map(r=>cols.map(c=>c==="operation"?(r.operation??""):c==="rowIndex"?(r.rowIndex??""):(r.values?.[c]??r[c]??"")));
  const existing=t.rows.count,overlap=Math.min(existing,values.length);
  // Excel 2019 rejects deleteRowsAt on some tables (InvalidArgument 0x80070057).
  // Reuse existing table rows; avoid structural edits on the common one-row write.
  if(overlap){
   mark("staging: update existing rows",{rowCount:overlap});
   t.getDataBodyRange().getCell(0,0).getResizedRange(overlap-1,cols.length-1).values=values.slice(0,overlap);
   await ctx.sync();
  }
  if(values.length>existing){
   mark("staging: append rows",{rowCount:values.length-existing});
   t.rows.add(null,values.slice(existing));
   await ctx.sync();
  }
  if(existing>values.length){
   // Remove surplus rows from the end only; never leave blank operations for VBA.
   mark("staging: remove surplus rows",{rowCount:existing-values.length});
   for(let i=existing-1;i>=values.length;i--)t.rows.getItemAt(i).delete();
   await ctx.sync();
  }
  mark("staging: sync complete");
 }
}
