from pathlib import Path
from datetime import date
from zipfile import ZipFile, ZIP_DEFLATED
from xml.sax.saxutils import escape
import os, re

OUT=Path("dis")
OUT.mkdir(exist_ok=True)
AD=["PatientID","AdmissionDate","PatientName","Room","AdmissionStatus"]
REC=["RecordID","PatientID","AdmissionDate","DischargeDate","Cancelled","NoticeAt","Recipient","Messenger","Remarks","Signer","SignedAt"]
PROM=["שם","סוג חולה","רגישויות","בידוד","חיידק עמיד","מעקב","מ.קליני","ד.סעודי","תרופות","תרופה בהשהייה","הוראות","תוכניות","סימנים","אירועים למעקב","אנטיביוטיקה","הזמנות","חדר/מיטה","יעוצים","מעבדות","מכונים","טפסים","אבחנות","ימים","מצב המטופל","שיחות מטופל/משפחה","רצף טיפולי","ממצא חריג","הדפס"]
def patient(name,pid,gender,age,bed,days):
    r=[""]*28
    r[0]=f"{name}        {pid}-P {gender},{age}"
    for i,v in {2:"C",4:"N",6:"O",7:"C",8:"C",9:"C",10:"N",11:"O",14:"אין אנטיביוטיקה",15:"C",16:str(bed),17:"O",18:"C",19:"C",20:"Y",21:"Y",22:str(days),24:"יש לבצע שיחה",25:"E",26:"לא קיים ממצא חריג/שינוי משמעותי"}.items():r[i]=v
    return r
def col(n):
    s=""
    while n:n,r=divmod(n-1,26);s=chr(65+r)+s
    return s
def xml(s):return escape(str(s),{'"':"&quot;"})
def create(path,sheets,macro=False):
    # Each sheet has a genuine Excel ListObject, including empty tables.
    ct=['<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>','<Default Extension="xml" ContentType="application/xml"/>']
    ct.append('<Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/>' if macro else '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>')
    files={}
    wr=[]
    rel=[]
    for i,(sheet,table,headers,rows) in enumerate(sheets,1):
        wr.append(f'<sheet name="{xml(sheet)}" sheetId="{i}" r:id="rId{i}"/>')
        rel.append(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>')
        ct.append(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>')
        cells=[]
        for j,row in enumerate([headers]+rows,1):
            cc=[]
            for k,v in enumerate(row,1):
                ref=f"{col(k)}{j}"
                cc.append(f'<c r="{ref}" t="inlineStr"><is><t>{xml(v)}</t></is></c>')
            cells.append(f'<row r="{j}">{"".join(cc)}</row>')
        tablepart=f'<tableParts count="1"><tablePart r:id="rId1"/></tableParts>' if table else ""
        files[f"xl/worksheets/sheet{i}.xml"]=f'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>{"".join(cells)}</sheetData>{tablepart}</worksheet>'
        if table:
            files[f"xl/worksheets/_rels/sheet{i}.xml.rels"]=f'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table{i}.xml"/></Relationships>'
            ct.append(f'<Override PartName="/xl/tables/table{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>')
            columns="".join(f'<tableColumn id="{j}" name="{xml(h)}"/>' for j,h in enumerate(headers,1))
            end=max(2,len(rows)+1)
            files[f"xl/tables/table{i}.xml"]=f'<?xml version="1.0" encoding="UTF-8"?><table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="{i}" name="{table}" displayName="{table}" ref="A1:{col(len(headers))}{end}" headerRowCount="1"><autoFilter ref="A1:{col(len(headers))}{end}"/><tableColumns count="{len(headers)}">{columns}</tableColumns><tableStyleInfo name="TableStyleMedium2" showRowStripes="1"/></table>'
    files["[Content_Types].xml"]='<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+"".join(ct)+'</Types>'
    files["_rels/.rels"]='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    files["xl/workbook.xml"]='<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+"".join(wr)+'</sheets></workbook>'
    files["xl/_rels/workbook.xml.rels"]='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+"".join(rel)+'</Relationships>'
    with ZipFile(path,"w",ZIP_DEFLATED) as z:
        for name,content in files.items():z.writestr(name,content)
    print(path)

patients=[patient("מטופל 5EB18D19","97790615","נ",95,1,13),patient("מטופל 9F6B1E90","97712864","נ",84,17,35),patient("מטופל D501B846","62202733","ז",79,18,1)]
create(OUT/f"Patients_{date.today():%Y-%m-%d}.xlsx",[("Patients","Patients",PROM,patients)])
create(OUT/"DischargeData.xlsx",[("Admissions","Admissions",AD,[]),("DischargeRecords","DischargeRecords",REC,[])])
settings=[["PatientsFolder","Patients"],["DataFilePath","DischargeData.xlsx"]]
create(OUT/"DischargeManager.xlsm",[
 ("Settings",None,["Key","Value"],settings),
 ("Bridge","BridgeQueue",["CommandID","Status","Action","Path","TableName","SheetName","ExpectedModifiedAt","ExpectedRows","BatchID","Result","Error","Trigger"],[]),
 ("BridgeFilesSheet","BridgeFiles",["Kind","Path","ModifiedAt","Size"],[]),
 ("PatientsStaging","Staging_Patients",AD,[]),
 ("AdmissionsStaging","Staging_Admissions",AD,[]),
 ("RecordsStaging","Staging_DischargeRecords",REC,[]),
 ("ChangesStaging","Staging_RecordChanges",["operation","rowIndex"]+REC+["PatientName","Room","AdmissionStatus"],[])
],macro=True)
