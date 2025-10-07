# BPV Politician Trading

A lightweight web app that surfaces recent stock trades reported by members of the United States Congress. The interface pulls the latest periodic transaction reports (PTRs) that senators and representatives must file under the STOCK Act so you can quickly review who bought or sold specific securities.


## What already works

- **Resilient data fetches** – the browser downloads the newest Senate and House PTR disclosures directly from the official public mirrors. If a request is blocked by CORS or rate limits the client automatically falls back to a bundled sample dataset so the interface remains usable.
- **Filtering & search** – controls in the hero banner let you search by politician, ticker, or asset description and limit by chamber, transaction type, or filing window.
- **Mobile-friendly UI** – the layout is responsive, supports dark mode, and ships with a manifest so it can be installed as a Progressive Web App (PWA) on modern browsers.
- **Offline launch** – a service worker caches the core HTML, CSS, and JavaScript so the interface still opens when your device is temporarily offline.
- **In-app alerts** – while the tab is open the client checks the feeds every 15 minutes and can raise local notifications when new filings arrive.

## Gaps before it feels “production ready”

Even though the interface is functional, it still relies entirely on the client. To make the experience reliable on every device you will likely want to:

1. **Host it over HTTPS.** Service workers and install prompts require a secure context. Deploy the static files to GitHub Pages, Netlify, Vercel, or any HTTPS-capable host instead of opening the HTML file directly from disk.
2. **Front a lightweight API.** The Senate S3 mirror occasionally rate limits browsers. A tiny proxy (Cloudflare Worker, AWS Lambda, etc.) can cache the JSON, smooth over outages, and return smaller, pre-filtered payloads to the app.
3. **Persist seen filings.** Today “new filing” alerts reset whenever you refresh or switch devices. Storing hashes in IndexedDB or your proxy would keep the badge consistent across sessions.
4. **Add real push notifications.** Browsers need a server to send background push messages. If you want alerts when the app is closed, extend the proxy above to send Web Push or integrate with a service such as Firebase Cloud Messaging.
5. **Automate updates.** Set up a scheduled job (GitHub Action, cron job, etc.) that warms the proxy cache and runs simple health checks so you know when the upstream feeds change format.

## Getting started

1. Open `index.html` in any modern browser. For the service worker and install prompt to activate, serve the folder with a local web server (for example `python -m http.server 8000`) or deploy it to any HTTPS static host.

2. The page will immediately request the newest PTR filings from the U.S. Senate and U.S. House disclosure feeds. Depending on your connection this may take a few seconds.
3. Use the controls in the hero banner to refine what you see:
   - **Search politician** – match on name, state, party, ticker, or asset description.
   - **Transaction type** – toggle between buys, sells, or both.
   - **Chamber** – focus on senators, representatives, or both at once.
   - **Activity window** – limit the table to trades filed within the last 30/90/365 days or view all available records.

> Tip: The table shows the first 500 matches for performance. Narrow the filters to drill into a specific member or company if you expect a large result set.


## Handling CORS blocks & rate limits

The public Senate and House mirrors occasionally return HTTP 403/429 responses when requests come from generic browsers. The app now protects against that in three layers:

1. **Direct fetch** – by default the client requests each JSON feed from its origin. Successful responses are rendered immediately.
2. **Proxy mode (optional)** – when `window.APP_CONFIG.useProxy` is `true`, requests are routed through a Cloudflare Worker (or any proxy that echoes `Access-Control-Allow-Origin: *`). This keeps GitHub Pages deployments working even if the upstream blocks cross-origin requests.
3. **Sample fallback** – if every live attempt fails, the client automatically loads `sample-data.json` so you can continue testing the interface. A banner above the table calls out when the fallback is active.

### Configuring the proxy

1. Edit `app-config.js` (it is loaded before `app.js`) and set your deployment URL:

   ```js
   window.APP_CONFIG = {
     useProxy: true,
     proxyEndpoint: 'https://your-worker-subdomain.workers.dev',
   };
   ```

   The proxy endpoint should accept a `?url=` query string and return the upstream JSON with permissive CORS headers. You can temporarily toggle the proxy without editing files by appending `?proxy=1&proxyEndpoint=https://example.workers.dev` to the page URL.

2. Deploy the included `cloudflare-worker.js` script:
   - Install [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/).
   - Run `wrangler init politician-proxy` and replace the generated worker with `cloudflare-worker.js`.
   - Deploy with `wrangler deploy` and note the production URL (e.g. `https://politician-proxy.your-account.workers.dev`).
   - Update `proxyEndpoint` in `app-config.js` to point at that URL.

Cloudflare caches each response for 15 minutes and injects `Access-Control-Allow-Origin: *`, so the browser stops seeing 403/429 errors. When the proxy is active the summary banner in the UI labels the data source as “via proxy.”

### About the sample dataset

`sample-data.json` contains four representative filings (two from each chamber). The service worker precaches the file for offline use, and the loader automatically switches to it whenever the live feeds are unavailable. Swap the entries with your own fixtures if you want to demonstrate a specific scenario.

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


Because the SEC and congressional disclosure portals require a real browser user agent, direct `curl` requests from locked-down environments may fail. The production app runs entirely in the browser and automatically includes the headers those services expect. If you still encounter 403/429 responses, deploy the Cloudflare Worker proxy and enable it through `app-config.js` or the `?proxy=1` query parameter.


## Tech stack

- Vanilla HTML, CSS, and JavaScript (no frameworks or build steps)
- Responsive, dark-themed layout optimised for desktop and tablet
- Client-side filtering, summarisation, and deduplication of disclosure data
