# Expenses Calculator

A personal expenses calculator. Enter your monthly income, your fixed commitments and your varying lifestyle spending (as a low and a high estimate), and see what remains each month as a best-to-worst range. A month-by-month projection honours start and end months and highlights the tightest month. Mark a commitment as a scenario to see, side by side, whether you could cope with something you are only considering. At month end, check in what you actually spent to see how it compares with your estimates.

It is a static site in plain HTML, CSS and JavaScript, with no build step and no dependencies. Amounts are in MYR. The app shows the numbers and leaves the judgement to you.

The app has two pages, switched from the bar at the top:

- **Expenses**: the calculator described above.
- **Houses**: keep track of housing loans. For each house enter the loan amount, the yearly interest rate, the term and the first installment month (and, optionally, the property price and the exact installment your bank charges). The page shows the monthly installment, the outstanding balance, principal and interest paid so far, total interest and total payable over the whole loan, plus a month-by-month schedule that splits every installment into interest and principal. Interest is charged on the reducing balance each month.

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

`server.js` serves only the files the app loads (listed in `PUBLIC_FILES` in `server.js`) and adds security headers. If you add a new file the app loads, add it to that list and to the list in `test/server.test.js`. GitHub Pages sends no custom headers, so `index.html` carries its own Content-Security-Policy tag.
