/* These are from the GEDCOM 5.5.1 specification, pages 83-94
 *
 */

export default new Map([
  ["ABBR",
    {
      formalName: "ABBREVIATION",
      description: "A short name of a title, description, or name."
    }
  ],
  ["ADDR",
    {
      formalName: "ADDRESS",
      description: "The contemporary place, usually required for postal purposes, of an individual, a submitter of information, a repository, a business, a school, or a company."
    }
  ],
  ["ADR1",
    {
      formalName: "ADDRESS1",
      description: "The first line of an address."
    }
  ],
  ["ADR2",
    {
      formalName: "ADDRESS2",
      description: "The second line of an address."
    }
  ],
  ["ADOP",
    {
      formalName: "ADOPTION",
      description: "Pertaining to creation of a legally approved child-parent relationship that does not exist biologically."
    }
  ],
  ["AFN",
    {
      formalName: "AFN",
      description: "A unique permanent record file number of an individual record stored in Ancestral File."
    }
  ],
  ["AGE",
    {
      formalName: "AGE",
      description: "The age of the individual at the time an event occurred, or the age listed in the document."
    }
  ],
  ["AGNC",
    {
      formalName: "AGENCY",
      description: "The institution or individual having authority and/or responsibility to manage or govern."
    }
  ],
  ["ALIA",
    {
      formalName: "ALIAS",
      description: "An indicator to link different record descriptions of a person who may be the same person."
    }
  ],
  ["ANCE",
    {
      formalName: "ANCESTORS",
      description: "Pertaining to forbearers of an individual."
    }
  ],
  ["ANCI",
    {
      formalName: "ANCES_INTEREST",
      description: "Indicates an interest in additional research for ancestors of this individual. (See also DESI, page 86.)"
    }
  ],
  ["ANUL",
    {
      formalName: "ANNULMENT",
      description: "Declaring a marriage void from the beginning (never existed)."
    }
  ],
  ["ASSO",
    {
      formalName: "ASSOCIATES",
      description: "An indicator to link friends, neighbors, relatives, or associates of an individual."
    }
  ],
  ["AUTH",
    {
      formalName: "AUTHOR",
      description: "The name of the individual who created or compiled information."
    }
  ],
  ["BAPL",
    {
      formalName: "BAPTISM-LDS",
      description: "The event of baptism performed at age eight or later by priesthood authority of the LDS Church. (See also BAPM, next)"
    }
  ],
  ["BAPM",
    {
      formalName: "BAPTISM",
      description: "The event of baptism (not LDS), performed in infancy or later. (See also BAPL, above, and CHR, page 85.)"
    }
  ],
  ["BARM",
    {
      formalName: "BAR_MITZVAH",
      description: "The ceremonial event held when a Jewish boy reaches age 13."
    }
  ],
  ["BASM",
    {
      formalName: "BAS_MITZVAH",
      description: "The ceremonial event held when a Jewish girl reaches age 13, also known as 'Bat Mitzvah.'"
    }
  ],
  ["BIRT",
    {
      formalName: "BIRTH",
      description: "The event of entering into life."
    }
  ],
  ["BLES",
    {
      formalName: "BLESSING",
      description: "A religious event of bestowing divine care or intercession. Sometimes given in connection with a naming ceremony."
    }
  ],
  ["BURI",
    {
      formalName: "BURIAL",
      description: "The event of the proper disposing of the mortal remains of a deceased person."
    }
  ],
  ["CALN",
    {
      formalName: "CALL_NUMBER",
      description: "The number used by a repository to identify the specific items in its collections."
    }
  ],
  ["CAST",
    {
      formalName: "CASTE",
      description: "The name of an individual's rank or status in society which is sometimes based on racial or religious differences, or differences in wealth, inherited rank, profession, occupation, etc."
    }
  ],
  ["CAUS",
    {
      formalName: "CAUSE",
      description: "A description of the cause of the associated event or fact, such as the cause of death."
    }
  ],
  ["CENS",
    {
      formalName: "CENSUS",
      description: "The event of the periodic count of the population for a designated locality, such as a national or state Census."
    }
  ],
  ["CHAN",
    {
      formalName: "CHANGE",
      description: "Indicates a change, correction, or modification. Typically used in connection with a DATE to specify when a change in information occurred."
    }
  ],
  ["CHAR",
    {
      formalName: "CHARACTER",
      description: "An indicator of the character set used in writing this automated information."
    }
  ],
  ["CHIL",
    {
      formalName: "CHILD",
      description: "The natural, adopted, or sealed (LDS) child of a father and a mother."
    }
  ],
  ["CHR",
    {
      formalName: "CHRISTENING",
      description: "The religious event (not LDS) of baptizing and/or naming a child."
    }
  ],
  ["CHRA",
    {
      formalName: "ADULT_CHRISTENING",
      description: "The religious event (not LDS) of baptizing and/or naming an adult person."
    }
  ],
  ["CITY",
    {
      formalName: "CITY",
      description: "A lower level jurisdictional unit. Normally an incorporated municipal unit."
    }
  ],
  ["CONC",
    {
      formalName: "CONCATENATION",
      description: "An indicator that additional data belongs to the superior value. The information from the CONC value is to be connected to the value of the superior preceding line without a space and without a carriage return and/or new line character. Values that are split for a CONC tag must always be split at a nonspace. If the value is split on a space the space will be lost when concatenation takes place. This is because of the treatment that spaces get as a GEDCOM delimiter, many GEDCOM values are trimmedof trailing spaces and some systems look for the first non-space starting after the tag to determine the beginning of the value."
    }
  ],
  ["CONF",
    {
      formalName: "CONFIRMATION",
      description: "The religious event (not LDS) of conferring the gift of the Holy Ghost and, among protestants, full church membership."
    }
  ],
  ["CONL",
    {
      formalName: "CONFIRMATION_LDS",
      description: "The religious event by which a person receives membership in the LDS Church."
    }
  ],
  ["CONT",
    {
      formalName: "CONTINUED",
      description: "An indicator that additional data belongs to the superior value. The information from the CONT value is to be connected to the value of the superior preceding line with a carriage return and/or new line character. Leading spaces could be important to the formatting of the resultant text. When importing values from CONT lines the reader should assume only one delimiter character following the CONT tag. Assume that the rest of the leading spaces are to be a part of the value."
    }
  ],
  ["COPR",
    {
      formalName: "COPYRIGHT",
      description: "A statement that accompanies data to protect it from unlawful duplication and distribution."
    }
  ],
  ["CORP",
    {
      formalName: "CORPORATE",
      description: "A name of an institution, agency, corporation, or company."
    }
  ],
  ["CREM",
    {
      formalName: "CREMATION",
      description: "Disposal of the remains of a person's body by fire."
    }
  ],
  ["CTRY",
    {
      formalName: "COUNTRY",
      description: "The name or code of the country."
    }
  ],
  ["DATA",
    {
      formalName: "DATA",
      description: "Pertaining to stored automated information."
    }
  ],
  ["DATE",
    {
      formalName: "DATE",
      description: "The time of an event in a calendar format."
    }
  ],
  ["DEAT",
    {
      formalName: "DEATH",
      description: "The event when mortal life terminates."
    }
  ],
  ["DESC",
    {
      formalName: "DESCENDANTS",
      description: "Pertaining to offspring of an individual."
    }
  ],
  ["DESI",
    {
      formalName: "DESCENDANT_INT",
      description: "Indicates an interest in research to identify additional descendants of this individual. (See also ANCI, page 84.)"
    }
  ],
  ["DEST",
    {
      formalName: "DESTINATION",
      description: "A system receiving data."
    }
  ],
  ["DIV",
    {
      formalName: "DIVORCE",
      description: "An event of dissolving a marriage through civil action."
    }
  ],
  ["DIVF",
    {
      formalName: "DIVORCE_FILED",
      description: "An event of filing for a divorce by a spouse."
    }
  ],
  ["DSCR",
    {
      formalName: "PHY_DESCRIPTION",
      description: "The physical characteristics of a person, place, or thing."
    }
  ],
  ["EDUC",
    {
      formalName: "EDUCATION",
      description: "Indicator of a level of education attained."
    }
  ],
  ["EMAI",
    {
      formalName: "EMAIL",
      description: "An electronic mail address."
    }
  ],
  ["EMIG",
    {
      formalName: "EMIGRATION",
      description: "An event of leaving one's homeland with the intent of residing elsewhere."
    }
  ],
  ["ENDL",
    {
      formalName: "ENDOWMENT",
      description: "A religious event where an endowment ordinance for an individual was performed by priesthood authority in an LDS temple."
    }
  ],
  ["ENGA",
    {
      formalName: "ENGAGEMENT",
      description: "An event of recording or announcing an agreement between two people to become married."
    }
  ],
  ["EVEN",
    {
      formalName: "EVENT",
      description: "Pertaining to a noteworthy happening related to an individual, a group, or an organization. An EVENt structure is usually qualified or classified by a subordinate use of the TYPE tag."
    }
  ],
  ["FACT",
    {
      formalName: "FACT",
      description: "Pertaining to a noteworthy attribute or fact concerning an individual, a group, or an organization. A FACT structure is usually qualified or classified by a subordinate use of the TYPE tag."
    }
  ],
  ["FAM",
    {
      formalName: "FAMILY",
      description: "Identifies a legal, common law, or other customary relationship of man and woman and their children, if any, or a family created by virtue of the birth of a child to its biological father and mother."
    }
  ],
  ["FAMC",
    {
      formalName: "FAMILY_CHILD",
      description: "Identifies the family in which an individual appears as a child."
    }
  ],
  ["FAMF",
    {
      formalName: "FAMILY_FILE",
      description: "Pertaining to, or the name of, a family file. Names stored in a file that are assigned to a family for doing temple ordinance work."
    }
  ],
  ["FAMS",
    {
      formalName: "FAMILY_SPOUSE",
      description: "Identifies the family in which an individual appears as a spouse."
    }
  ],
  ["FAX",
    {
      formalName: "FACIMILIE",
      description: "Electronic facimilie transmission."
    }
  ],
  ["FCOM",
    {
      formalName: "FIRST_COMMUNION",
      description: "A religious rite, the first act of sharing in the Lord's supper as part of church worship."
    }
  ],
  ["FILE",
    {
      formalName: "FILE",
      description: "An information storage place that is ordered and arranged for preservation and reference."
    }
  ],
  ["FORM",
    {
      formalName: "FORMAT",
      description: "An assigned name given to a consistent format in which information can be conveyed."
    }
  ],
  ["FONE",
    {
      formalName: "PHONETIC",
      description: "A phonetic variation of a superior text string."
    }
  ],
  ["GEDC",
    {
      formalName: "GEDCOM",
      description: "Information about the use of GEDCOM in a transmission."
    }
  ],
  ["GIVN",
    {
      formalName: "GIVEN_NAME",
      description: "A given or earned name used for official identification of a person."
    }
  ],
  ["GRAD",
    {
      formalName: "GRADUATION",
      description: "An event of awarding educational diplomas or degrees to individuals."
    }
  ],
  ["HEAD",
    {
      formalName: "HEADER",
      description: "Identifies information pertaining to an entire GEDCOM transmission."
    }
  ],
  ["HUSB",
    {
      formalName: "HUSBAND",
      description: "An individual in the family role of a married man or father."
    }
  ],
  ["IDNO",
    {
      formalName: "IDENT_NUMBER",
      description: "A number assigned to identify a person within some significant external system."
    }
  ],
  ["IMMI",
    {
      formalName: "IMMIGRATION",
      description: "An event of entering into a new locality with the intent of residing there."
    }
  ],
  ["INDI",
    {
      formalName: "INDIVIDUAL",
      description: "A person."
    }
  ],
  ["LANG",
    {
      formalName: "LANGUAGE",
      description: "The name of the language used in a communication or transmission of information."
    }
  ],
  ["LATI",
    {
      formalName: "LATITUDE",
      description: "A value indicating a coordinate position on a line, plane, or space."
    }
  ],
  ["LONG",
    {
      formalName: "LONGITUDE",
      description: "A value indicating a coordinate position on a line, plane, or space."
    }
  ],
  ["MAP",
    {
      formalName: "MAP",
      description: "Pertains to a representation of measurements usually presented in a graphical form."
    }
  ],
  ["MARB",
    {
      formalName: "MARRIAGE_BANN",
      description: "An event of an official public notice given that two people intend to marry."
    }
  ],
  ["MARC",
    {
      formalName: "MARR_CONTRACT",
      description: "An event of recording a formal agreement of marriage, including the prenuptial agreement in which marriage partners reach agreement about the property rights of one or both, securing property to their children."
    }
  ],
  ["MARL",
    {
      formalName: "MARR_LICENSE",
      description: "An event of obtaining a legal license to marry."
    }
  ],
  ["MARR",
    {
      formalName: "MARRIAGE",
      description: "A legal, common-law, or customary event of creating a family unit of a man and a woman as husband and wife."
    }
  ],
  ["MARS",
    {
      formalName: "MARR_SETTLEMENT",
      description: "An event of creating an agreement between two people contemplating marriage, at which time they agree to release or modify property rights that would otherwise arise from the marriage."
    }
  ],
  ["MEDI",
    {
      formalName: "MEDIA",
      description: "Identifies information about the media or having to do with the medium in which information is stored."
    }
  ],
  ["NAME",
    {
      formalName: "NAME",
      description: "A word or combination of words used to help identify an individual, title, or other item. More than one NAME line should be used for people who were known by multiple names."
    }
  ],
  ["NATI",
    {
      formalName: "NATIONALITY",
      description: "The national heritage of an individual."
    }
  ],
  ["NATU",
    {
      formalName: "NATURALIZATION",
      description: "The event of obtaining citizenship."
    }
  ],
  ["NCHI",
    {
      formalName: "CHILDREN_COUNT",
      description: "The number of children that this person is known to be the parent of (all marriages) when subordinate to an individual, or that belong to this family when subordinate to a FAM_RECORD."
    }
  ],
  ["NICK",
    {
      formalName: "NICKNAME",
      description: "A descriptive or familiar that is used instead of, or in addition to, one's proper name."
    }
  ],
  ["NMR",
    {
      formalName: "MARRIAGE_COUNT",
      description: "The number of times this person has participated in a family as a spouse or parent."
    }
  ],
  ["NOTE",
    {
      formalName: "NOTE",
      description: "Additional information provided by the submitter for understanding the enclosing data."
    }
  ],
  ["NPFX",
    {
      formalName: "NAME_PREFIX",
      description: "Text which appears on a name line before the given and surname parts of a name. i.e. (Lt. Cmndr.) Joseph /Allen/ jr. In this example Lt. Cmndr. is considered as the name prefix portion."
    }
  ],
  ["NSFX",
    {
      formalName: "NAME_SUFFIX",
      description: "Text which appears on a name line after or behind the given and surname parts of a name. i.e. Lt. Cmndr. Joseph /Allen/ (jr.) In this example jr. is considered as the name suffix portion."
    }
  ],
  ["OBJE",
    {
      formalName: "OBJECT",
      description: "Pertaining to a grouping of attributes used in describing something. Usually referring to the data required to represent a multimedia object, such an audio recording, a photograph of a person, or an image of a document."
    }
  ],
  ["OCCU",
    {
      formalName: "OCCUPATION",
      description: "The type of work or profession of an individual."
    }
  ],
  ["ORDI",
    {
      formalName: "ORDINANCE",
      description: "Pertaining to a religious ordinance in general."
    }
  ],
  ["ORDN",
    {
      formalName: "ORDINATION",
      description: "A religious event of receiving authority to act in religious matters."
    }
  ],
  ["PAGE",
    {
      formalName: "PAGE",
      description: "A number or description to identify where information can be found in a referenced work."
    }
  ],
  ["PEDI",
    {
      formalName: "PEDIGREE",
      description: "Information pertaining to an individual to parent lineage chart."
    }
  ],
  ["PHON",
    {
      formalName: "PHONE",
      description: "A unique number assigned to access a specific telephone."
    }
  ],
  ["PLAC",
    {
      formalName: "PLACE",
      description: "A jurisdictional name to identify the place or location of an event."
    }
  ],
  ["POST",
    {
      formalName: "POSTAL_CODE",
      description: "A code used by a postal service to identify an area to facilitate mail handling."
    }
  ],
  ["PROB",
    {
      formalName: "PROBATE",
      description: "An event of judicial determination of the validity of a will. May indicate several related court activities over several dates."
    }
  ],
  ["PROP",
    {
      formalName: "PROPERTY",
      description: "Pertaining to possessions such as real estate or other property of interest."
    }
  ],
  ["PUBL",
    {
      formalName: "PUBLICATION",
      description: "Refers to when and/or where a work was published or created."
    }
  ],
  ["QUAY",
    {
      formalName: "QUALITY_OF_DATA",
      description: "An assessment of the certainty of the evidence to support the conclusion drawn from evidence."
    }
  ],
  ["REFN",
    {
      formalName: "REFERENCE",
      description: "A description or number used to identify an item for filing, storage, or other reference purposes."
    }
  ],
  ["RELA",
    {
      formalName: "RELATIONSHIP",
      description: "A relationship value between the indicated contexts."
    }
  ],
  ["RELI",
    {
      formalName: "RELIGION",
      description: "A religious denomination to which a person is affiliated or for which a record applies."
    }
  ],
  ["REPO",
    {
      formalName: "REPOSITORY",
      description: "An institution or person that has the specified item as part of their collection(s)."
    }
  ],
  ["RESI",
    {
      formalName: "RESIDENCE",
      description: "An address or place of residence that a family or individual resided."
    }
  ],
  ["RESN",
    {
      formalName: "RESTRICTION",
      description: "A processing indicator signifying access to information has been denied or otherwise restricted."
    }
  ],
  ["RETI",
    {
      formalName: "RETIREMENT",
      description: "An event of exiting an occupational relationship with an employer after a qualifying time period."
    }
  ],
  ["RFN",
    {
      formalName: "REC_FILE_NUMBER",
      description: "A permanent number assigned to a record that uniquely identifies it within a known file."
    }
  ],
  ["RIN",
    {
      formalName: "REC_ID_NUMBER",
      description: "A number assigned to a record by an originating automated system that can be used by a receiving system to report results pertaining to that record."
    }
  ],
  ["ROLE",
    {
      formalName: "ROLE",
      description: "A name given to a role played by an individual in connection with an event."
    }
  ],
  ["ROMN",
    {
      formalName: "ROMANIZED",
      description: "A romanized variation of a superior text string."
    }
  ],
  ["SEX",
    {
      formalName: "SEX",
      description: "Indicates the sex of an individual--male or female."
    }
  ],
  ["SLGC",
    {
      formalName: "SEALING_CHILD",
      description: "A religious event pertaining to the sealing of a child to his or her parents in an LDS temple ceremony."
    }
  ],
  ["SLGS",
    {
      formalName: "SEALING_SPOUSE",
      description: "A religious event pertaining to the sealing of a husband and wife in an LDS temple ceremony."
    }
  ],
  ["SOUR",
    {
      formalName: "SOURCE",
      description: "The initial or original material from which information was obtained."
    }
  ],
  ["SPFX",
    {
      formalName: "SURN_PREFIX",
      description: "A name piece used as a non-indexing pre-part of a surname."
    }
  ],
  ["SSN",
    {
      formalName: "SOC_SEC_NUMBER",
      description: "A number assigned by the United States Social Security Administration. Used for tax identification purposes."
    }
  ],
  ["STAE",
    {
      formalName: "STATE",
      description: "A geographical division of a larger jurisdictional area, such as a State within the United States of America."
    }
  ],
  ["STAT",
    {
      formalName: "STATUS",
      description: "An assessment of the state or condition of something."
    }
  ],
  ["SUBM",
    {
      formalName: "SUBMITTER",
      description: "An individual or organization who contributes genealogical data to a file or transfers it to someone else."
    }
  ],
  ["SUBN",
    {
      formalName: "SUBMISSION",
      description: "Pertains to a collection of data issued for processing."
    }
  ],
  ["SURN",
    {
      formalName: "SURNAME",
      description: "A family name passed on or used by members of a family."
    }
  ],
  ["TEMP",
    {
      formalName: "TEMPLE",
      description: "The name or code that represents the name of an LDS Church Temple."
    }
  ],
  ["TEXT",
    {
      formalName: "TEXT",
      description: "The exact wording found in an original source document."
    }
  ],
  ["TIME",
    {
      formalName: "TIME",
      description: "A time value in a 24-hour clock format, including hours, minutes, and optional seconds, separated by a colon (:). Fractions of seconds are shown in decimal notation."
    }
  ],
  ["TITL",
    {
      formalName: "TITLE",
      description: "A description of a specific writing or other work, such as the title of a book when used in a source context, or a formal designation used by an individual in connection with positions of royalty or other social status, such as Grand Duke."
    }
  ],
  ["TRLR",
    {
      formalName: "TRAILER",
      description: "At level 0, specifies the end of a GEDCOM transmission."
    }
  ],
  ["TYPE",
    {
      formalName: "TYPE",
      description: "A further qualification to the meaning of the associated superior tag. The value does not have any computer processing reliability. It is more in the form of a short one or two word note that should be displayed any time the associated data is displayed."
    }
  ],
  ["VERS",
    {
      formalName: "VERSION",
      description: "Indicates which version of a product, item, or publication is being used or referenced."
    }
  ],
  ["WIFE",
    {
      formalName: "WIFE",
      description: "An individual in the role as a mother and/or married woman."
    }
  ],
  ["WILL",
    {
      formalName: "WILL",
      description: "A legal document treated as an event, by which a person disposes of his or her estate, to take effect after death. The event date is the date the will was signed while the person was alive. (See also PROBate, page 91.)"
    }
  ],
  ["WWW",
    {
      formalName: "WEB",
      description: "World Wide Web home page."
    }
  ]
]);
