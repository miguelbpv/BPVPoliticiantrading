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

## Mobile install & notifications

The tracker now ships as a Progressive Web App (PWA), so you can add it to your phone for quick access and opt into mobile alerts when new disclosures arrive while the app is running.

1. Serve the project over HTTP so your phone can reach it. For example, run `python -m http.server 8000` from the project folder and keep the terminal window open.
2. On your phone, connect to the same network and open `http://<your-computer-ip>:8000/index.html` in Chrome, Edge, Firefox, or another modern browser.
3. Use the browser’s “Install app” or “Add to Home Screen” prompt. Chrome will show an **Install app** button in the page header when it is ready; iOS Safari exposes the option from the share sheet.
4. Launch the installed shortcut to browse the disclosures in a standalone experience.

### Notifications

- Tap **Enable alerts** in the header to grant notification permission. Alerts appear only when the app is open (in the foreground or background) because push messaging requires a dedicated server.
- The app checks for new Senate and House PTR filings every 15 minutes. When it finds something you have not seen before it raises a native notification (if permission is granted) and adds a brief summary note above the table.
- You can pause alerts at any time with the same button.

### Offline caching

- A service worker caches the core HTML, CSS, JavaScript, and manifest metadata so the interface still launches without a network connection.
- When you reconnect, the app automatically refreshes the data feeds and clears the offline warning banner.

## Data pipeline

- **Senate PTRs** – Pulled from the public S3 mirror of the Senate financial disclosure system, which republishes Form PTR filings sourced from [efdsearch.senate.gov](https://efdsearch.senate.gov/). The script attempts the current and previous filing years.
- **House PTRs** – Pulled from the House Stock Watcher dataset which mirrors official filings made to the [Clerk of the House](https://disclosures-clerk.house.gov/).

Because the SEC and congressional disclosure portals require a real browser user agent, direct `curl` requests from locked-down environments may fail. The production app runs entirely in the browser and automatically includes the headers those services expect.

## Tech stack

- Vanilla HTML, CSS, and JavaScript (no frameworks or build steps)
- Responsive, dark-themed layout optimised for desktop and tablet
- Client-side filtering, summarisation, and deduplication of disclosure data
