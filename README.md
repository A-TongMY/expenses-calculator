# Expenses Calculator

A personal expenses calculator: enter your monthly income and your commitments, and see what remains each month. A static site in plain HTML, CSS and JavaScript, with no build step and no dependencies. Amounts are in MYR.

Your data is stored in your browser only (`localStorage`). Nothing is sent to a server. Use **Export backup** to keep a copy or move to another device, and keep the exported file private.

## Run locally

Requires Node 20 or newer.

```sh
npm start        # serves the app at http://localhost:3000 (set PORT to change it)
npm test         # runs the test suite with Node's built-in test runner
```

## Deploy

The app is just static files, so it runs anywhere. Each site address has its own browser storage, so data entered on one host is not visible on another. Use export and import to move it.

### GitHub Pages

1. Push the repository to GitHub.
2. In **Settings → Pages**, set the source to **Deploy from a branch**, choose `main` and the `/ (root)` folder.
3. Open the URL GitHub shows. `server.js` is not used here.

### Railway (and similar hosts: Render, Fly.io, Koyeb)

1. In Railway choose **New Project → Deploy from GitHub repo** and select this repository.
2. Railway detects Node and runs `npm start`, which starts `server.js` on the `PORT` Railway provides. No configuration or environment variables are needed.
3. Under **Settings → Networking**, choose **Generate Domain**.

`server.js` serves only the six files the app needs (`index.html`, `app.js`, `calc.js`, `backup.js`, `rules.js`, `styles.css`) and adds basic security headers. If you add a new file the app loads, add it to `PUBLIC_FILES` in `server.js`.
