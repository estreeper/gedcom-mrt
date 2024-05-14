type Record = string[]
type ExtractedRecord = [Record, number];

export function parse(dbFile: File) {
  const reader = new FileReader();
  reader.onload = (evt) => {
    let dbString;
    if (typeof reader.result === 'string') {
      dbString = reader.result;
      // Windows uses carriage returns
      const lines = dbString.replaceAll('\r', '').split('\n');
      const individuals = new Map();
      const families = new Map();
      const records = new Map();

      let currentLineCount = 0;
      while (currentLineCount < lines.length) {
      //while (currentLineCount < 1000) {
        if (currentLineCount % 20000 === 0) {
          console.log(`On line ${currentLineCount}`);
        }

        const currentLine = lines[currentLineCount];

        if (isDelimiterLine(currentLine)) {
          const ret = extractRecord(lines, currentLineCount);
          const [record, newHeadPos] = extractRecord(lines, currentLineCount);
          const recordID = getRecordID(record);
	  records.set(recordID, record)
          currentLineCount = newHeadPos;
        } else {
          currentLineCount += 1;
        }
      }
      console.log(records);
    }
  }
  reader.readAsText(dbFile);
}

function isDelimiterLine(line: string) {
  const recordDelimiter = /^\d\s@/;
  const match = recordDelimiter.exec(line);
  return !!match;
}

//type RecordType = 'FAMILY' | 'INDIVIDUAL' | 'SOURCE' | 'SUBM';
function getRecordID(record: Record): string {
  const line = record[0];
  const regex = /@((I|F|S|SUB)\d+)@/;
  const match = line.match(regex);
  if (match) {
    return match[1]
  } else {
    throw new Error("Record does not contain an ID")
  }
}

function extractRecord(lines: Array<string>, startLine: number): ExtractedRecord {
  let headPos: number = startLine;
  const rows = [];
  while (true) {
    rows.push(lines[headPos]);
    headPos += 1;
    if (isDelimiterLine(lines[headPos]) || headPos === lines.length) {
      break;
    }
  }
  return [rows, headPos];
}
