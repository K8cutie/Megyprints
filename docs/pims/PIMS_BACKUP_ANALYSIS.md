# PIMS `.PAR` Backup File — Format Analysis

Analysis of a PIMS (Parish Information Management System) backup file (`TUE.PAR`, 11,397 bytes,
sample from 2026-07-14). This is the legacy system churchOS needs to import data from.

## TL;DR

- A `.PAR` file is a **custom compressed archive of Visual FoxPro database files** (`.DBF` tables,
  `.FPT` memo files, `.CDX` compound indexes).
- Compression is plain **zlib** per file, each preceded by a small ASCII header (`DG2` + compressed size).
- The daily backups (`MON.PAR` … `SUN.PAR`) are full snapshots of the parish database directory.
- All data needed by churchOS lives in the `.DBF` + `.FPT` pairs. The `.CDX` indexes can be
  ignored (they are derivable).
- A working extractor lives at `scripts/pims/parse_par.py`.

## Container format

```
Archive  := GlobalHeader FileEntry*
GlobalHeader (only inside the first compressed block):
    "V706Z"          signature / PIMS version (7.06?)
    <nfiles>         ASCII, space padded        e.g. " 51"
    <totalbytes>     ASCII, right justified     e.g. "      147039"

FileEntry := "DG2" <compsize:ASCII right-justified in 6 chars> <zlib stream>
```

Each zlib stream decompresses to:

```
DecompressedBlock :=
    [GlobalHeader — 20 bytes, first block only]
    FileName        56 bytes, ASCII, left justified   e.g. "-ftns-PARBAPT.DBF"
    Timestamp       16 bytes  "YYYYMMDDHH:MM:SS"      (file mtime)
    FileSize        12 bytes, ASCII, right justified
    FileBytes       <FileSize> bytes — the raw DBF/FPT/CDX file
```

The `-ftns-` prefix on every filename is the source folder tag (the parish data directory).
Filenames after the prefix are classic 8.3 DOS names.

## Archive contents (51 files, 17 tables)

Each table is a trio: `NAME.DBF` (table), `NAME.FPT` (memo/long-text), `NAME.CDX` (index).
Tables ending in `C` are certificate-issuance logs for the matching register.

| Table | Purpose | Certificate log |
|---|---|---|
| `PARBAPT` | Baptism register | `PARBAPTC` |
| `PARCOMM` | First Communion register | `PARCOMMC` |
| `PARCONF` | Confirmation register | `PARCONFC` |
| `PARCONV` | Convert/reception register | `PARCONVC` |
| `PARMARR` | Marriage register | `PARMARRC` |
| `PARDEAD` | Death/interment register | `PARDEADC` |
| `PARBLESS` | Blessings register | — |
| `PARSICK` | Sick calls / anointing register | — |
| `PARMASS` | Mass schedule & intentions | — |
| `PARMEM` | Parish membership directory | — |
| `EVFORMS` | Event/form templates | — |

File mtimes reveal usage: in the sample only `PARBAPT` (2026-07-14) and `PARMASS`
(2025-06-27) contain records; the rest are empty shells untouched since the 2011-08-31 install.

## DBF specifics

- DBF version byte `0x30` = **Visual FoxPro** (header includes a 263-byte backlink block).
- Text encoding is effectively **CP1252/ASCII**.
- Dates are stored as `YYYYMMDD` text in `D` fields; empty dates are 8 spaces.
- `M` (memo) fields hold a 4-byte little-endian block index into the sibling `.FPT`.
  FPT header: bytes 0–3 next-free-block (big-endian), bytes 6–7 block size (big-endian,
  64 in this data). Each memo record: 4-byte type + 4-byte length (big-endian), then text.
- Multi-value memos (e.g. `SPONSORS`) pack rows as **tab-separated columns with CRLF row
  separators**: `"SALLY PINEDA\tMANILA\tCATHOLIC\r\nCARLOS VALERIO\tQC\tCATHOLIC"`.
- Deleted records are flagged with `*` in byte 0 of the record — skip them on import.
- `RMARK C(1)` appears on every table (value `M` on live rows) — an internal row-state marker.
- `MIDIDX N(2)` = index of the middle name/initial within `NAME` (name is stored
  `"SURNAME, FIRST MIDDLE"` in one field).

## Register schemas (import-relevant)

### PARBAPT — Baptisms (record: 349 bytes, 23 fields)
```
BOOKNO N(5)  PAGENO N(5)  LINENO N(5)      ← canonical register citation (book/page/line)
NAME C(60)   MIDIDX N(2)  GENDER C(1)
DATE D       — baptism date        MINISTER C(60)     STIPEND N(9,2)
BDATE D      — birth date          AGE N(4)           BPLACE M — birthplace
FATHER C(60) FATHERORG M — father's origin/place
MOTHER C(60) MOTHERORG M
ADDRESS M    LEGITIMACY C(8)       SPONSORS M — tab/CRLF packed (name, place, religion)
REMARKS M    POSTBY C(20)  POSTDATE D  RMARK C(1)
```

### PARMARR — Marriages (587 bytes, 34 fields)
Groom (`G*`) and bride (`B*`) blocks: `GNAME/BNAME C(60)`, `GMIDIDX/BMIDIDX`,
`GBDATE/BBDATE D`, `GAGE/BAGE N(4)`, `GINFO/BINFO M`, `GBPLACE/BBPLACE M`,
`GFATHER/GMOTHER/BFATHER/BMOTHER C(60)`. Plus: `TYPE C(2)`, `FF L` (banns flag?),
`DATE D` (wedding), `LICNO C(15)` + `REGDATE/REGPLACE` (civil license),
`CRASMNO C(15)` + `CRASMDATE` (canonical cert), `MINISTER`, `STIPEND`, `SPONSORS M`,
`REMARKS M`, `POSTBY/POSTDATE/RMARK`.

### PARCONF / PARCOMM — Confirmations & First Communions (361 bytes, 25 fields)
Identical schema to each other: baptism cross-reference (`BAPTDATE D`, `BAPTCHURCH M`)
plus the same person/parents/sponsors block as PARBAPT.

### PARCONV — Converts (365 bytes)
Like PARCONF plus `BAPTORIG M` (original baptism denomination) and `BAPTPLACE M`.

### PARDEAD — Deaths (197 bytes)
`DATE` (service), `DDATE` (death), `INTDATE` (interment), `STATUS C(10)`,
`KIN M`, `SACRAMENT C(10)` (last sacraments), `CAUSE M`, `INTLOC M` (interment location),
`FUNERAL M` (funeral home), plus common fields.

### PARBLESS — Blessings (192 bytes)
`NAME`, `DATE`, `TIME C(5)` + `TIMEAP C(2)`, `MINISTER`, `TYPE C(2)`, `BLESSINGOF M`.

### PARSICK — Sick calls (204 bytes)
`NAME`, `DATE`, `MINISTER`, `REQDATE D`, `REQCONTACT M`, `SACRAMENTS M`, `STIPEND`.

### PARMASS — Mass schedule & intentions (324 bytes)
`BOOKNO` holds the **year**; `NAME C(120)` is a denormalized display string
(`"06/29/2025 (am) 06:00am - CHRIST THE KING - FR. DANNY"`); structured fields:
`DATE D`, `TIME C(5)`, `TIMEAP C(2)`, `CELEBRANT C(60)`, `PLACE C(60)`, `TYPE C(2)`,
intention memos `INTTG` (thanksgiving), `INTRS` (repose of souls), `INTSPECIAL`, `INTOTHERS`.

### PARMEM — Members (316 bytes)
`ID C(15)`, `GRPID C(15)` + `GRPCHK L` (family/group linkage), `NAME C(50)`, `GENDER`,
`NICKNAME`, `BDATE`, `BPLACE M`, `ADDRESS M`, `TELNO/CELNO C(30)`, `EMAIL M`, `CONTACT M`,
`CHAPEL M`, `OCCUPATION M`, `BUSADDRESS M`, `STATUS C(20)`, `SACRAMENTS M`, `SEMINARS M`,
`SPOUSE C(50)`, `CHILDREN M`, `REMARKS M`.

### *C certificate logs (38 bytes)
`BOOKNO/PAGENO/LINENO` (FK to the register row) + `DATE` issued, `CERTNO N(5)`,
`PURPOSE M` (or `REQUEST M` on PARDEADC), `REMARKS M`.

## Sample data (verified round-trip)

PARBAPT record 1: `GARCIA, ARCHIE VALERIO`, M, baptized 1978-12-14 by
FR. DANNY PAJARILLAGA, born 1978-06-14 QC, father RENATO V. GARCIA (MANILA), mother
BRIGIDA V. GARCIA (MANILA), address 502 EDSA CUBAO Q.C., legitimacy `Cath.`, sponsors
SALLY PINEDA (MANILA) and CARLOS VALERIO (QC), book 1 / page 1 / line 1, posted by
BRIGITTE on 2026-07-14.

## churchOS import notes

1. **Natural key** for register rows is `(register, BOOKNO, PAGENO, LINENO)` — it's also
   how certificate logs reference their register and how parishes cite records on paper
   certificates. Preserve it verbatim.
2. Parse `NAME` as `"SURNAME, GIVEN [MIDDLE]"`; `MIDIDX` gives the middle-name offset if
   splitting is needed.
3. Explode `SPONSORS`-style memos on `\r\n` rows / `\t` columns into child tables.
4. Skip records where byte 0 = `*` (soft-deleted) and blank-`DATE` placeholder rows.
5. A `.PAR` is a **full snapshot** — import should be idempotent upsert by natural key,
   taking the newest file per weekday set (`MON.PAR`…`SUN.PAR`).
6. Only `.DBF` + `.FPT` matter; skip `.CDX` entirely.
