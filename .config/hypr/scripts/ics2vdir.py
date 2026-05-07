#!/usr/bin/env python3
"""Split a single ICS file into individual event files (vdir format)."""
import sys, os, re, hashlib

def split_ics(src, outdir):
    with open(src, encoding="utf-8", errors="replace") as f:
        content = f.read()

    # Normalize line endings
    content = content.replace("\r\n", "\n").replace("\r", "\n")

    # Extract calendar-level properties (VERSION, PRODID, CALSCALE, METHOD)
    calprops_match = re.match(r"(BEGIN:VCALENDAR\n.*?)(?=BEGIN:VEVENT|BEGIN:VTIMEZONE|$)",
                               content, re.DOTALL)
    calprops = calprops_match.group(1) if calprops_match else "BEGIN:VCALENDAR\nVERSION:2.0\n"

    # Extract VTIMEZONE block (shared across events)
    tz_match = re.search(r"BEGIN:VTIMEZONE.*?END:VTIMEZONE\n?", content, re.DOTALL)
    tz_block = tz_match.group() if tz_match else ""

    # Extract all VEVENT blocks
    events = re.findall(r"BEGIN:VEVENT.*?END:VEVENT", content, re.DOTALL)

    os.makedirs(outdir, exist_ok=True)

    # Remove events that no longer exist (clean stale files)
    existing = {f for f in os.listdir(outdir) if f.endswith(".ics")}
    current_uids = set()

    for event in events:
        uid_match = re.search(r"^UID:(.+)$", event, re.MULTILINE)
        if uid_match:
            uid = uid_match.group(1).strip()
        else:
            uid = hashlib.md5(event.encode()).hexdigest()

        # Sanitize UID for use as filename
        safe_uid = re.sub(r"[^\w@.-]", "_", uid)
        filename = f"{safe_uid}.ics"
        current_uids.add(filename)

        ical = f"{calprops}{tz_block}BEGIN:VEVENT\n{event[len('BEGIN:VEVENT'):].lstrip()}\nEND:VCALENDAR\n"
        # Normalize to CRLF (RFC 5545)
        ical = "\r\n".join(ical.split("\n"))

        filepath = os.path.join(outdir, filename)
        # Only write if content changed (avoid touching mtimes unnecessarily)
        if not os.path.exists(filepath) or open(filepath, "rb").read() != ical.encode():
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(ical)

    # Remove stale event files
    for stale in existing - current_uids:
        os.remove(os.path.join(outdir, stale))

    return len(events)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <input.ics> <output_vdir/>", file=sys.stderr)
        sys.exit(1)
    count = split_ics(sys.argv[1], sys.argv[2])
    print(f"  {count} events → {sys.argv[2]}")
