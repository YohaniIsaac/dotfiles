#!/usr/bin/env python3
"""Output day numbers (1-31) that have events in the given year/month.
Usage: cal-event-days.py <year> <month>
"""
import sys, re
from pathlib import Path

year  = int(sys.argv[1])
month = int(sys.argv[2])

caldir  = Path.home() / ".local/share/calendars"
pattern = re.compile(r"DTSTART[^:]*:(\d{4})(\d{2})(\d{2})")
days    = set()

for ics in caldir.rglob("*.ics"):
    try:
        for m in pattern.finditer(ics.read_text(errors="replace")):
            y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if y == year and mo == month:
                days.add(d)
    except Exception:
        pass

for d in sorted(days):
    print(d)
