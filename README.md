# Sara's Luck — data API

A tiny, free, self-updating data feed for the **Sara's Luck** apps (Powerball & Lotto America).

A GitHub Action runs twice a day, pulls the latest results, and commits a fresh **`data.json`**.
Because `raw.githubusercontent.com` sends CORS headers, the apps (desktop PWA, phone, browser)
can fetch it directly:

```
https://raw.githubusercontent.com/SaraSineadiii/saras-luck-data/main/data.json
```

## What's inside `data.json`

```jsonc
{
  "updated": "2026-07-02T…Z",
  "powerball":    { "draws", "dataThrough", "whiteFreq", "specialFreq",
                    "ticketData": {white,special}, "ticketEdge": {white,special} },
  "lottoAmerica": { … same shape … }
}
```

- `ticketData` = most-drawn line (documented tie-break)
- `ticketEdge` = consensus edge line (robust across 80 weightings)
- `whiteFreq` / `specialFreq` = full frequency tables on the correct window

## Sources & windows

- **Powerball** — Texas Lottery CSV, with NY open-data as fallback. Window: current
  5/69 + 1/26 matrix (since 2015-10-07). Fetched fresh every run.
- **Lotto America** — seeded RNG-era history (`la-history.json`, since the 2023-04-17 RNG
  switch); the Action appends new draws parsed from lottonumbers.com, with guards
  (range-checked, de-duplicated, alignment-verified). If a fetch ever fails, the last
  good data stays — it never overwrites with garbage.

## Honest note

This feed keeps the numbers **current and correct**. It does **not** predict anything —
each draw is independent and every combination is equally likely (Powerball 1 in
292,201,338; Lotto America 1 in 25,989,600). The picks are the most-frequent / most-robust
lines the data can name; the mimic is a fair crypto-random draw. Play for fun, on a budget.

## Run it yourself

```
node build.mjs   # writes data.json + updates la-history.json
```
