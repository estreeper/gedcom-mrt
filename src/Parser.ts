export function parse(dbFile: File) {
  const reader = new FileReader();
  reader.onload = (evt) => {
    let dbString;
    if (typeof reader.result === 'string') {
      dbString = reader.result;
      // Windows uses carriage returns
      const lines = dbString.replace('\r', '').split('\n');
      const individuals = new Map();
      const families = new Map();

      let currentLineCount = 0;
      //while (currentLineCount < lines.length) {
      while (currentLineCount < 1000) {
        if (currentLineCount % 20000 === 0) {
          console.log(`On line ${currentLineCount}`);
        }

        const currentLine = lines[currentLineCount];

        if (isDelimiterLine(currentLine)) {
          const ret = extractRecord(lines, currentLineCount);
          const [record, newHeadPos] = extractRecord(lines, currentLineCount);
          const recordType = getRecordType(record[0]);
          if (recordType === 'INDIVIDUAL') {
            individuals.set(keyName, record);
          }
          currentLineCount = newHeadPos;
        } else {
          currentLineCount += 1;
        }
      }
      console.log(individuals);
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
function getRecordType(line: string) {
  const individual_regex = /\d\s@I\d+@/;
  const family_regex = /\d\s@F\d+@/;
  const source_regex = /\d\s@S\d+@/;
  const subm_regex = /\d\s@S\d+@/;
  const individual_match = individual_regex.exec(line);
  const family_match = family_regex.exec(line);
  const source_match = source_regex.exec(line);
  const subm_match = subm_regex.exec(line);

  if (individual_match) {
    return 'FAMILY';
  } else if (family_match) {
    return 'INDIVIDUAL';
  } else if (source_match) {
    return 'SOURCE';
  } else if (subm_match) {
    return 'SUBM';
  }
}

function extractRecord(lines: Array<string>, startLine: number) {
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
