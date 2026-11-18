import {ACTIONS} from "./command-contract.js";
import {MockVBA} from "./mock-vba.js";

const copy=value=>structuredClone(value);

/**
 * In-memory Excel workbook boundary.
 * The client writes BridgeQueue and Staging tables; MockVBA only reads them
 * when a simulated Worksheet_Calculate event is raised.
 */
export class MockExcelTransport {
 constructor(files=[],settings={}){
  this.tables=new Map();
  this.tables.set("BridgeQueue",[]);
  this.staging=new Map();
  this.vba=new MockVBA(files,settings);
  // Both sides observe the same workbook tables, not separate message queues.
  this.vba.queue=this.tables.get("BridgeQueue");
  this.vba.staging=this.staging;
  this.calculateCount=0;
 }
 get files(){return this.vba.files;}
 get settings(){return this.vba.settings;}
 set settings(value){this.vba.settings=value;}
 get queue(){return this.tables.get("BridgeQueue");}
 get bridgeFiles(){return this.vba.bridgeFiles;}
 enqueue(command){
  if(!ACTIONS.includes(command.action)||!command.id)throw Error("Invalid command");
  if(this.queue.some(row=>row.id===command.id))throw Error("Duplicate command ID");
  const row={id:command.id,action:command.action,params:copy(command.params),status:"PENDING",result:null,error:null};
  this.queue.push(row);
  return row;
 }
 setStaging(sheet,rows){
  if(!sheet||!Array.isArray(rows))throw Error("Invalid staging table");
  this.staging.set(sheet,copy(rows));
 }
 getStaging(sheet){return copy(this.staging.get(sheet));}
 getTable(name){
  if(name==="BridgeQueue")return copy(this.queue);
  return this.getStaging(name);
 }
 async trigger(){
  // Models Worksheet_Calculate: VBA is invoked only by this event.
  this.calculateCount++;
  await this.vba.trigger();
  return this.getTable("BridgeQueue");
 }
 getFile(path){return this.vba.getFile(path);}
}
