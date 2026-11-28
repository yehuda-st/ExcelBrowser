export function parseCsv(text){
 const rows=[];let row=[],field="",quoted=false;
 text=text.replace(/^\uFEFF/,"");
 for(let i=0;i<text.length;i++){const c=text[i];
 if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else quoted=false;}else field+=c;}
 else if(c==='"'&&field==="")quoted=true;
 else if(c===","){row.push(field);field="";}
 else if(c==="\n"||c==="\r"){if(c==="\r"&&text[i+1]==="\n")i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field="";}
 else field+=c;
 }
 if(quoted)throw Error("Incomplete CSV");
 row.push(field);if(row.some(Boolean))rows.push(row);
 const headers=rows.shift()??[];
 if(new Set(headers).size!==headers.length)throw Error("Duplicate CSV headers");
 return rows.map(r=>{if(r.length!==headers.length)throw Error("Invalid CSV row length");return Object.fromEntries(headers.map((h,i)=>[h,r[i]]));});
}
export const encodeCsvRow=values=>values.map(v=>'"'+String(v??"").replaceAll('"','""')+'"').join(",")+"\r\n";
