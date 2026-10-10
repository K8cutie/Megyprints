#!/usr/bin/env python3
"""Extract PIMS .PAR backups (zlib-compressed Visual FoxPro DBF archives).

A .PAR file is a sequence of `DG2 <size>` + zlib blocks, each holding one file
from the parish data directory (DBF table, FPT memo file, or CDX index).
See docs/pims/PIMS_BACKUP_ANALYSIS.md for the full format specification.

Usage:
    python3 parse_par.py BACKUP.PAR                 # list tables + record counts
    python3 parse_par.py BACKUP.PAR --json out.json # dump all tables as JSON
    python3 parse_par.py BACKUP.PAR --extract DIR   # write the raw member files
"""
import argparse
import json
import re
import struct
import sys
import zlib

GLOBAL_HEADER_LEN = 20  # "V706Z" + nfiles + total bytes, first block only
ENTRY_NAME_LEN = 56
ENTRY_TS_LEN = 16
ENTRY_SIZE_LEN = 12
ENTRY_HEADER_LEN = ENTRY_NAME_LEN + ENTRY_TS_LEN + ENTRY_SIZE_LEN


def read_archive(path):
    """Return {filename: {"ts": str, "payload": bytes}} for every member."""
    data = open(path, "rb").read()
    members = {}
    pos = 0
    while True:
        idx = data.find(b"DG2", pos)
        if idx < 0:
            break
        m = re.match(rb"DG2\s+(\d+)", data[idx : idx + 16])
        if not m:
            pos = idx + 3
            continue
        comp_len = int(m.group(1))
        start = idx + m.end()
        raw = zlib.decompress(data[start : start + comp_len])
        off = GLOBAL_HEADER_LEN if raw[:1] == b"V" else 0
        name = raw[off : off + ENTRY_NAME_LEN].decode("ascii", "replace").strip()
        ts = raw[off + ENTRY_NAME_LEN : off + ENTRY_NAME_LEN + ENTRY_TS_LEN].decode("ascii", "replace")
        size_s = raw[off + ENTRY_NAME_LEN + ENTRY_TS_LEN : off + ENTRY_HEADER_LEN].decode("ascii", "replace").strip()
        body = raw[off + ENTRY_HEADER_LEN :]
        if size_s.isdigit():
            body = body[: int(size_s)]
        members[name] = {"ts": ts, "payload": body}
        pos = start + comp_len
    return members


def read_memo(fpt, index):
    """Read one memo entry from an FPT memo file."""
    if not index or not fpt:
        return ""
    block_size = struct.unpack(">H", fpt[6:8])[0] or 64
    off = index * block_size
    header = fpt[off : off + 8]
    if len(header) < 8:
        return ""
    _mtype, mlen = struct.unpack(">II", header)
    return fpt[off + 8 : off + 8 + mlen].decode("cp1252", "replace")


def parse_dbf(buf, fpt=None):
    """Parse a Visual FoxPro DBF (version 0x30) into fields + records."""
    nrec = struct.unpack("<I", buf[4:8])[0]
    hsize, rsize = struct.unpack("<HH", buf[8:12])
    fields = []
    p = 32
    while p < hsize and buf[p] not in (0x0D, 0x00):
        fname = buf[p : p + 11].split(b"\x00")[0].decode("ascii", "replace")
        ftype = chr(buf[p + 11])
        flen = buf[p + 16]
        fdec = buf[p + 17]
        fields.append({"name": fname, "type": ftype, "len": flen, "dec": fdec})
        p += 32
    records = []
    for r in range(nrec):
        rec = buf[hsize + r * rsize : hsize + (r + 1) * rsize]
        if len(rec) < rsize:
            break
        row = {"_deleted": rec[0:1] == b"*"}
        fp = 1
        for f in fields:
            raw = rec[fp : fp + f["len"]]
            fp += f["len"]
            if f["type"] == "M":
                memo_idx = struct.unpack("<I", raw)[0] if f["len"] == 4 else int(raw.strip() or 0)
                row[f["name"]] = read_memo(fpt, memo_idx)
            else:
                row[f["name"]] = raw.decode("cp1252", "replace").strip()
        records.append(row)
    return {"fields": fields, "nrec": nrec, "records": records}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("par_file")
    ap.add_argument("--json", metavar="OUT", help="dump all parsed tables as JSON")
    ap.add_argument("--extract", metavar="DIR", help="write raw member files to DIR")
    args = ap.parse_args()

    members = read_archive(args.par_file)
    print(f"{len(members)} files in archive", file=sys.stderr)

    if args.extract:
        import os

        os.makedirs(args.extract, exist_ok=True)
        for name, m in members.items():
            safe = name.replace("/", "_").lstrip("-")
            with open(os.path.join(args.extract, safe), "wb") as fh:
                fh.write(m["payload"])
        print(f"extracted to {args.extract}", file=sys.stderr)

    tables = {}
    for name, m in sorted(members.items()):
        if not name.upper().endswith(".DBF"):
            continue
        fpt = members.get(name[:-4] + ".FPT", {}).get("payload")
        try:
            tables[name] = parse_dbf(m["payload"], fpt)
            live = sum(1 for r in tables[name]["records"] if not r["_deleted"])
            print(f"{name:32s} mtime={m['ts'][:8]} records={tables[name]['nrec']} (live={live})")
        except Exception as exc:  # keep going: one corrupt table shouldn't kill the import
            print(f"{name:32s} PARSE ERROR: {exc}", file=sys.stderr)

    if args.json:
        json.dump(tables, open(args.json, "w"), indent=2, ensure_ascii=False)
        print(f"wrote {args.json}", file=sys.stderr)


if __name__ == "__main__":
    main()
