import { parseText } from './Parser';
import {
  individualName,
  nameOf,
  describeFamily,
  describeRecord,
  capitalizeFirst,
} from './Describe';

const db = parseText(`0 HEAD
0 @I1@ INDI
1 NAME John /Smith/
0 @I2@ INDI
1 NAME Jane /Doe/
0 @I3@ INDI
1 NAME   
0 @I4@ INDI
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
0 @F2@ FAM
1 WIFE @I2@
0 @F3@ FAM
1 HUSB @I4@
1 WIFE @I9@
0 @F4@ FAM
0 @S1@ SOUR
0 TRLR
`);

describe('individualName', () => {
  it('returns the NAME value as authored', () => {
    expect(individualName(db.byId.get('I1'))).toBe('John /Smith/');
  });
  it('is undefined for a missing record, a blank NAME, or no NAME', () => {
    expect(individualName(undefined)).toBeUndefined();
    expect(individualName(db.byId.get('I3'))).toBeUndefined();
    expect(individualName(db.byId.get('I4'))).toBeUndefined();
  });
});

describe('nameOf', () => {
  it('prefers the name and falls back to the xref', () => {
    expect(nameOf(db, 'I1')).toBe('John /Smith/');
    expect(nameOf(db, 'I4')).toBe('@I4@');
    expect(nameOf(db, 'NOPE')).toBe('@NOPE@');
    expect(nameOf(db, undefined)).toBe('an unknown person');
  });
});

describe('describeFamily', () => {
  it('uses both spouses, one spouse, or a generic phrase', () => {
    expect(describeFamily(db, 'F1')).toBe('the family of John /Smith/ and Jane /Doe/');
    expect(describeFamily(db, 'F2')).toBe('the family of Jane /Doe/');
    expect(describeFamily(db, 'F4')).toBe('a family');
    expect(describeFamily(db, 'NOPE')).toBe('a family');
    expect(describeFamily(db, undefined)).toBe('a family');
  });
  it('falls back to xrefs for unnamed or missing spouses', () => {
    expect(describeFamily(db, 'F3')).toBe('the family of @I4@ and @I9@');
  });
});

describe('describeRecord', () => {
  it('describes by record type', () => {
    expect(describeRecord(db, 'I1')).toBe('John /Smith/');
    expect(describeRecord(db, 'I4')).toBe('@I4@');
    expect(describeRecord(db, 'F1')).toBe('the family of John /Smith/ and Jane /Doe/');
    expect(describeRecord(db, 'S1')).toBe('@S1@');
    expect(describeRecord(db, 'NOPE')).toBe('@NOPE@');
    expect(describeRecord(db, undefined)).toBe('a record');
  });
});

describe('capitalizeFirst', () => {
  it('upper-cases only the first character', () => {
    expect(capitalizeFirst('the family')).toBe('The family');
    expect(capitalizeFirst('')).toBe('');
  });
});
