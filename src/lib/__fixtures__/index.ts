// GEDCOM fixtures used by the parser/validator tests. Kept as exported template
// strings (rather than .ged files) so no extra loader dependency is needed.
//
// CLEAN, ONE_WAY, DANGLING and BROKEN all carry a BIRT date and a SOUR
// citation on every individual (with reasonable, well-separated birth years)
// so they stay silent under the semantic rules in lib/rules/ — each fixture
// is meant to isolate exactly the one (or two) structural issue(s) named in
// its comment, not also trip MISSING_LIFE_DATES/MISSING_SOURCES noise.

// A clean, internally-consistent file: HEAD, a symmetric family, TRLR.
export const CLEAN = `0 HEAD
1 SOUR mrt
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 DATE 1 JAN 1950
2 SOUR @S1@
1 FAMS @F1@
0 @I2@ INDI
1 NAME Jane /Doe/
1 SEX F
1 BIRT
2 DATE 1 JAN 1952
2 SOUR @S1@
1 FAMS @F1@
0 @I3@ INDI
1 NAME Child /Smith/
1 BIRT
2 DATE 1 JAN 1975
2 SOUR @S1@
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 @S1@ SOUR
1 TITL Family Bible
0 TRLR
`;

// Like CLEAN but @I3@ is missing its `1 FAMC @F1@` back-pointer, so the family's
// CHIL link is one-way (ASYMMETRIC_LINK).
export const ONE_WAY = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 BIRT
2 DATE 1 JAN 1950
2 SOUR @S1@
1 FAMS @F1@
0 @I2@ INDI
1 NAME Jane /Doe/
1 BIRT
2 DATE 1 JAN 1952
2 SOUR @S1@
1 FAMS @F1@
0 @I3@ INDI
1 NAME Child /Smith/
1 BIRT
2 DATE 1 JAN 1975
2 SOUR @S1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 @S1@ SOUR
1 TITL Family Bible
0 TRLR
`;

// @I1@ points to family @F99@ that does not exist (DANGLING_POINTER).
export const DANGLING = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 BIRT
2 DATE 1 JAN 1950
2 SOUR @S1@
1 FAMC @F99@
0 @S1@ SOUR
1 TITL Family Bible
0 TRLR
`;

// Two different problems at once: @I1@ points at a non-existent family @F99@
// (DANGLING_POINTER), and @F1@ lists @I3@ as a child with no FAMC back
// (ASYMMETRIC_LINK).
export const BROKEN = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 DATE 1 JAN 1950
2 SOUR @S1@
1 FAMS @F1@
1 FAMC @F99@
0 @I2@ INDI
1 NAME Jane /Doe/
1 SEX F
1 BIRT
2 DATE 1 JAN 1952
2 SOUR @S1@
1 FAMS @F1@
0 @I3@ INDI
1 NAME Child /Smith/
1 BIRT
2 DATE 1 JAN 1975
2 SOUR @S1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 @S1@ SOUR
1 TITL Family Bible
0 TRLR
`;

// Uses an unusual xref prefix (@N1@) and a custom underscore tag — must still
// parse and index.
export const QUIRKY = `0 HEAD
0 @N1@ NOTE A free-floating note.
0 @I1@ INDI
1 NAME John /Smith/
1 _CUSTOM some vendor extension
1 NOTE @N1@
0 TRLR
`;

// --- semantic ("valid but wrong") rule fixtures -----------------------------

// @I1@'s death date is before its birth date.
export const DEATH_BEFORE_BIRTH = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 BIRT
2 DATE 1 JAN 1950
1 DEAT
2 DATE 1 JAN 1900
0 TRLR
`;

// @I1@'s birth date is in the year 2999.
export const FUTURE_BIRTH = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 BIRT
2 DATE 1 JAN 2999
0 TRLR
`;

// @I1@ was born in 1900 and died in 2100 — a 200-year lifespan.
export const UNREALISTIC_LIFESPAN = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 BIRT
2 DATE 1 JAN 1900
1 DEAT
2 DATE 1 JAN 2100
0 TRLR
`;

// @F1@'s marriage date (1980) is before @I2@'s birth date (1990).
export const MARRIAGE_BEFORE_BIRTH = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 DATE 1 JAN 1950
1 FAMS @F1@
0 @I2@ INDI
1 NAME Jane /Doe/
1 SEX F
1 BIRT
2 DATE 1 JAN 1990
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 1 JAN 1980
0 TRLR
`;

// @F1@'s marriage date (2000) is after @I1@'s death date (1990).
export const MARRIAGE_AFTER_DEATH = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 DEAT
2 DATE 1 JAN 1990
1 FAMS @F1@
0 @I2@ INDI
1 NAME Jane /Doe/
1 SEX F
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 1 JAN 2000
0 TRLR
`;

// @I1@ (parent, born 1980) is recorded as @I3@'s (child, born 1950) parent.
export const PARENT_BORN_AFTER_CHILD = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 DATE 1 JAN 1980
1 FAMS @F1@
0 @I2@ INDI
1 NAME Jane /Doe/
1 SEX F
1 FAMS @F1@
0 @I3@ INDI
1 NAME Child /Smith/
1 BIRT
2 DATE 1 JAN 1950
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 TRLR
`;

// @I1@'s burial date (1899) is before its death date (1900).
export const BURIAL_BEFORE_DEATH = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 DEAT
2 DATE 1 JAN 1900
1 BURI
2 DATE 1 JAN 1899
0 TRLR
`;

// @I1@ (born 1900) married at age 8 (1908) in @F1@.
export const YOUNG_MARRIAGE = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 DATE 1 JAN 1900
1 FAMS @F1@
0 @I2@ INDI
1 NAME Jane /Doe/
1 SEX F
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 1 JAN 1908
0 TRLR
`;

// @I1@ is a spouse in three overlapping families at once.
export const PLURAL_MARRIAGE = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 FAMS @F1@
1 FAMS @F2@
0 @I2@ INDI
1 NAME Jane /Doe/
1 SEX F
1 FAMS @F1@
0 @I3@ INDI
1 NAME Mary /Jones/
1 SEX F
1 FAMS @F2@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 1 JAN 1970
0 @F2@ FAM
1 HUSB @I1@
1 WIFE @I3@
1 MARR
2 DATE 1 JAN 1975
0 TRLR
`;

// @I1@ has neither a birth nor a death record.
export const MISSING_LIFE_DATES = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
0 TRLR
`;

// @F1@ has a husband and wife but no children recorded.
export const CHILDLESS_FAMILY = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 FAMS @F1@
0 @I2@ INDI
1 NAME Jane /Doe/
1 SEX F
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
0 TRLR
`;

// @I1@ has no SOUR citation anywhere in the record.
export const MISSING_SOURCES = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 BIRT
2 DATE 1 JAN 1900
0 TRLR
`;

// @I1@ has a SOUR citation — should NOT trigger MISSING_SOURCES.
export const HAS_SOURCES = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 BIRT
2 DATE 1 JAN 1900
2 SOUR @S1@
0 @S1@ SOUR
1 TITL Birth certificate
0 TRLR
`;

// @I1@ and @I2@ share a name and birth year — likely duplicates.
export const DUPLICATE_INDIVIDUAL = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 BIRT
2 DATE 1 JAN 1900
0 @I2@ INDI
1 NAME John /Smith/
1 BIRT
2 DATE 15 JUN 1900
0 TRLR
`;

// @I1@ has no FAMC and no FAMS — not linked to any family.
export const ORPHAN_INDIVIDUAL = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
0 TRLR
`;

// @I1@ is recorded as a CHIL of @F1@, and @F1@'s HUSB is also @I1@ — a
// self-referential relationship (own parent).
export const SELF_PARENT = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 FAMC @F1@
1 FAMS @F1@
0 @I2@ INDI
1 NAME Jane /Doe/
1 SEX F
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I1@
0 TRLR
`;

// @I1@ is his own grandfather: @I1@ -> FAMC @F2@ -> HUSB @I2@ -> FAMC @F1@ ->
// HUSB @I1@ (a cycle in the ancestry graph).
export const CIRCULAR_ANCESTRY = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 FAMS @F1@
1 FAMC @F2@
0 @I2@ INDI
1 NAME Jane /Doe/
1 SEX F
1 FAMS @F1@
1 FAMC @F2@
0 @I3@ INDI
1 NAME Child /Smith/
1 SEX F
1 FAMC @F1@
1 FAMS @F2@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 @F2@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
0 TRLR
`;
