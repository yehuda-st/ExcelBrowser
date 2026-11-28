import {RECORD_COLUMNS,recordToRow} from "./data-schema.js";
export const CSV_RECORD_COLUMNS=Object.freeze([...RECORD_COLUMNS,"PatientName","Room"]);
export function recordToCsvRow(record,admission){
 return {...recordToRow(record,admission),PatientName:admission.name??"",Room:admission.room??""};
}
