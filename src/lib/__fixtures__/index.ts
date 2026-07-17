// GEDCOM fixtures used by the parser/validator tests. Kept as exported template
// strings (rather than .ged files) so no extra loader dependency is needed.

// A clean, internally-consistent file: HEAD, a symmetric family, TRLR.
export const CLEAN = `0 HEAD
1 SOUR mrt
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 FAMS @F1@
0 @I2@ INDI
1 NAME Jane /Doe/
1 SEX F
1 FAMS @F1@
0 @I3@ INDI
1 NAME Child /Smith/
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 TRLR
`;

// Like CLEAN but @I3@ is missing its `1 FAMC @F1@` back-pointer, so the family's
// CHIL link is one-way (ASYMMETRIC_LINK).
export const ONE_WAY = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 FAMS @F1@
0 @I2@ INDI
1 NAME Jane /Doe/
1 FAMS @F1@
0 @I3@ INDI
1 NAME Child /Smith/
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 TRLR
`;

// @I1@ points to family @F99@ that does not exist (DANGLING_POINTER).
export const DANGLING = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 FAMC @F99@
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
1 FAMS @F1@
1 FAMC @F99@
0 @I2@ INDI
1 NAME Jane /Doe/
1 SEX F
1 FAMS @F1@
0 @I3@ INDI
1 NAME Child /Smith/
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
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
