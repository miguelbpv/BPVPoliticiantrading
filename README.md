# BPV Politician Trading

A lightweight web app that surfaces recent stock trades reported by members of the United States Congress. The interface pulls the latest periodic transaction reports (PTRs) that senators and representatives must file under the STOCK Act so you can quickly review who bought or sold specific securities.

## Getting started

1. Open `index.html` in any modern browser. No build tooling or backend setup is required.
2. The page will immediately request the newest PTR filings from the U.S. Senate and U.S. House disclosure feeds. Depending on your connection this may take a few seconds.
3. Use the controls in the hero banner to refine what you see:
   - **Search politician** – match on name, state, party, ticker, or asset description.
   - **Transaction type** – toggle between buys, sells, or both.
   - **Chamber** – focus on senators, representatives, or both at once.
   - **Activity window** – limit the table to trades filed within the last 30/90/365 days or view all available records.

> Tip: The table shows the first 500 matches for performance. Narrow the filters to drill into a specific member or company if you expect a large result set.

## Data pipeline

- **Senate PTRs** – Pulled from the public S3 mirror of the Senate financial disclosure system, which republishes Form PTR filings sourced from [efdsearch.senate.gov](https://efdsearch.senate.gov/). The script attempts the current and previous filing years.
- **House PTRs** – Pulled from the House Stock Watcher dataset which mirrors official filings made to the [Clerk of the House](https://disclosures-clerk.house.gov/).

Because the SEC and congressional disclosure portals require a real browser user agent, direct `curl` requests from locked-down environments may fail. The production app runs entirely in the browser and automatically includes the headers those services expect.

## Tech stack

- Vanilla HTML, CSS, and JavaScript (no frameworks or build steps)
- Responsive, dark-themed layout optimised for desktop and tablet
- Client-side filtering, summarisation, and deduplication of disclosure data
