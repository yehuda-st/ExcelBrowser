// Office.js transport for the same BridgeClient contract as MockExcelTransport.
// The staging cache is mirrored to Excel before a command, and refreshed after it.
const HEADERS=["CommandID","Status","Action","Path","TableName","SheetName","ExpectedModifiedAt","ExpectedRows","BatchID","Result","Error","Trigger"];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export class ExcelTransport {
 constructor({timeoutMs=30000}={}){this.timeoutMs=timeoutMs;this.staging=new Map();this.dirty=new Set();this.pending=null;}
 setStaging(sheet,rows){this.staging.set(sheet,structuredClone(rows));this.dirty.add(sheet);}
 getStaging(sheet){return structuredClone(this.staging.get(sheet));}
 enqueue(job){
  if(this.pending)throw Error("Only one outstanding Excel command is supported");
  const entry={...structuredClone(job),status:"PENDING",result:null,error:null};
  this.pending=entry;return entry;
 }
 async trigger(){
  const job=this.pending;if(!job)throw Error("No pending command");
  try{
   await Excel.run(async ctx=>{
    for(const sheet of this.dirty)await this.writeStaging(ctx,sheet,this.staging.get(sheet));
    const table=ctx.workbook.tables.getItem("BridgeQueue");
    const header=table.getHeaderRowRange();header.load("values");await ctx.sync();
    const columns=header.values[0].map(String);
    const values={CommandID:job.id,Status:"PENDING",Action:job.action,Path:job.params.path??"",TableName:job.params.table??"",SheetName:job.params.sheet??"",ExpectedModifiedAt:job.params.expectedModifiedAt??"",ExpectedRows:job.params.expectedRows??"",BatchID:job.params.batchId??"",Result:"",Error:"",Trigger:""};
    table.rows.add(null,[columns.map(h=>values[h]??"")]);
    await ctx.sync();
    const last=table.getDataBodyRange().getLastRow();
    last.getCell(0,columns.indexOf("Trigger")).formulas=[["=[@CommandID]"]];
    await ctx.sync();
   });
   this.dirty.clear();
   const deadline=Date.now()+this.timeoutMs;
   while(Date.now()<deadline){
    const row=await Excel.run(async ctx=>{
     const t=ctx.workbook.tables.getItem("BridgeQueue"),h=t.getHeaderRowRange(),b=t.getDataBodyRangeOrNullObject();
     h.load("values");b.load(["values","isNullObject"]);await ctx.sync();
     const cols=h.values[0].map(String);
     return (b.isNullObject?[]:b.values).map(v=>Object.fromEntries(cols.map((k,i)=>[k,v[i]]))).find(r=>String(r.CommandID)===job.id);
    });
    if(row?.Status==="DONE"){
     job.status="DONE";
     job.result=row.Result?JSON.parse(String(row.Result)):{};
     if(job.action==="READ_FILE"){
      this.staging.set(job.params.sheet,await this.readStaging(job.params.sheet));
     }
     break;
    }
    if(row?.Status==="ERROR"){job.status="ERROR";job.error=String(row.Error||row.Result||"VBA error");break;}
    await sleep(350);
   }
   if(job.status==="PENDING"){job.status="ERROR";job.error="Timed out waiting for VBA; inspect BridgeQueue";}
  }catch(e){job.status="ERROR";job.error=String(e.message||e);}
  finally{this.pending=null;}
 }
 async readStaging(sheet){
  return Excel.run(async ctx=>{
   const t=ctx.workbook.tables.getItem(sheet),h=t.getHeaderRowRange(),b=t.getDataBodyRangeOrNullObject();
   h.load("values");b.load(["values","isNullObject"]);await ctx.sync();
   const cols=h.values[0].map(String);
   return (b.isNullObject?[]:b.values).map(v=>Object.fromEntries(cols.map((k,i)=>[k,v[i]])));
  });
 }
 async writeStaging(ctx,sheet,rows){
  const t=ctx.workbook.tables.getItem(sheet),h=t.getHeaderRowRange(),b=t.getDataBodyRangeOrNullObject();
  h.load("values");b.load(["isNullObject","rowCount"]);await ctx.sync();
  const cols=h.values[0].map(String);
  if(!b.isNullObject&&b.rowCount)t.rows.deleteRowsAt(0,b.rowCount);
  if(rows.length)t.rows.add(null,rows.map(r=>cols.map(c=>r[c]??"")));
  await ctx.sync();
 }
}
