# Counterpoint POS

A local POS for one shop computer, built with Node.js and SQLite. The source can be shared publicly on GitHub. Each person who downloads it runs their own independent shop database. No subscription, cloud account, package installation, or internet connection is needed after Node.js is installed.

This is an initial working implementation, not full Loyverse feature parity. Try the workflows with practice data before live trading.

## Start on Windows

1. Install **Node.js 24 LTS or newer** from https://nodejs.org/ (the official installer includes npm, but this app does not need npm).
2. Extract the project ZIP into a permanent folder, such as `Documents/Counterpoint`.
3. Double-click **start.cmd**. Keep its terminal window open while using the POS. If the browser opens before the server is ready, refresh it.
4. Open **http://127.0.0.1:3210** in Edge, Chrome, or another modern browser. Use this exact address; `localhost` is intentionally rejected.
5. Create your owner name and a PIN of 6–12 digits. There is no default password.
6. In **Settings**, set the shop name, currency, tax rate, loyalty reward, and receipt footer. The default currency is USD. Only currencies with two decimal places are supported. Currency cannot change after a sale.
7. Add products in **Items & stock**, then use **Adjust stock** to enter opening quantities and a reason. Alternatively, load sample items from Settings in an empty practice shop.
8. Open **Shifts & cash**, enter the opening cash float, and click **Open shift**.
9. Use **Sell** to take your first sale. Select a customer to earn or redeem loyalty points.

On macOS/Linux, run `node server.mjs` from the project directory and open the same address. Node 24+ is required for the built-in SQLite module.

Stop the server with Ctrl+C. Restart with `start.cmd` or `node server.mjs`. Saved business records survive a restart; unsaved carts do not. Save a ticket before closing if you need to keep an order.

## What works

| Area | Included |
| --- | --- |
| Checkout | Search, keyboard barcode scanner + Enter, quantities, fixed amount discounts, one exclusive tax rate, cash/change, recording externally processed card and other payments |
| Receipts | Sales history, browser printing / Save as PDF, full-receipt refunds, stock restoration, refund reason |
| Customers | Contact details, net purchase totals, earned points, redemption at checkout |
| Inventory | SKU/barcode, categories, cost, low stock badges, fractional stock quantities, reasoned adjustments, movement history, archive items |
| Purchasing | Suppliers, multiple-line purchase orders, receive all lines, update stock and latest cost |
| Orders | Named open tickets, dining option, kitchen note, New / Preparing / Ready status, reload ticket for payment |
| Cash | Per-employee shifts, opening float, cash in/out, counted versus expected closing drawer |
| Staff | Owner and cashier roles, PIN sign-in, time cards, change own PIN |
| Reports | Date range, sales minus refunds, tax, estimated gross profit, payment and employee breakdowns, item sales |
| Data | Local SQLite, atomic sales, inventory validation, duplicate payment key check, audit activity, CSV exports, database backup |

Owners can manage the whole shop. Cashiers can sell, manage customers and shared tickets, open/close their own shifts, record cash movements and attendance, and see their own receipts. Cost and owner reports are restricted through the server. Anyone with filesystem access to the computer can still read the database; use a separate protected OS account for the till.

Use one browser window and one active operator at a time. Switching staff does not close shifts. The server binds only to `127.0.0.1`, not the LAN. It is designed for one computer, not hardware-locked licensing: anyone can copy this open-source app and run a separate installation. Do not expose it through a tunnel or reverse proxy.

## Daily shop workflow

1. Sign in, clock in if tracking hours, and open your cash shift.
2. Select items. Scan a barcode into the search box and press Enter to add an exact SKU.
3. Select a customer, apply a discount if needed, and charge. Points are redeemed in whole minor units: 100 points = 1.00 in your currency. Earned points are calculated from the final total including tax; tax is calculated after discounts and redeemed points. Check that this policy suits your shop.
4. A card payment is only a record. Complete payment on your separate card terminal first. Never enter card numbers into this app.
5. Save unfinished orders as named tickets. Use Open tickets for kitchen status. Loading a ticket does not reserve stock; availability is checked at payment.
6. Issue refunds from Receipts as an owner. Refunds always return the entire receipt to stock. Complete any external card refund separately. A cash refund requires your own open shift and reduces that shift's expected drawer.
7. Count the drawer, close the shift, clock out, then download a database backup in Settings. Copy that backup to a separate drive.

Refunded loyalty earnings are reversed. If a customer already spent those points, their balance can become negative until future purchases earn them back. Reports put refunds on the date they are issued. Estimated gross profit subtracts stored sale-time cost and tax, and excludes operating expenses. Receipt headers use current shop settings.

## Back up and restore

**Settings → Download database backup** creates a consistent SQLite snapshot, even while the app is running. It includes business records and account PIN hashes. Keep it private. CSV files are exports for analysis, not full backups.

Restore a downloaded backup:

1. Close every POS browser tab and stop the server with Ctrl+C. Ensure no other copy of the server is running.
2. Rename the whole `data` folder to a dated recovery folder, for example `data-before-restore-2026-11-16`. This preserves the old database and all WAL/SHM sidecars together.
3. Create a new, empty `data` folder.
4. Copy your downloaded backup into it and rename the copy **pos.sqlite**. Do not copy old `-wal` or `-shm` files into the new folder.
5. Start the app. Sign in using an account and PIN from that backup. Check products, the last receipt, customers, and shifts before resuming.

Restoration replaces the shop's current state with the snapshot date. Protect the old recovery folder until you have checked the result. Store backups outside the project. Never upload them to a GitHub release.

For a separate practice shop, stop the app and run in PowerShell:

```powershell
$env:POS_DATA_DIR = Join-Path $PWD 'data/practice'
node server.mjs
```

Close that terminal when finished. Start normally in a new terminal for the main database. Keep all test data under `data/`, which Git ignores.

## Share the app on GitHub

GitHub hosts the **source and downloadable ZIP**, while your shop runs the app locally. **GitHub Pages cannot run this Node.js server or SQLite database.** Do not enable Pages for the working POS. This arrangement keeps the one-computer design.

### Publish using Git

1. Install Git from https://git-scm.com/downloads and create a GitHub account.
2. On GitHub, click **+ → New repository**, name it `counterpoint-pos`, and choose **Public** if everyone should be able to download it.
3. Leave the options to initialize a README, license, and `.gitignore` unchecked; those files are already in this project. Create the empty repository.
4. Open PowerShell **inside this project's folder**, where `package.json` and `server.mjs` are located. Run:

```powershell
git init -b main
git add .
git status
```

5. Review the staged file list. It should contain code, documentation, and tests. **It must not contain `data/`, customer exports, or backups.** The included `.gitignore` excludes the default data folder and SQLite files; it cannot protect business exports saved under arbitrary filenames.
6. Commit and push, replacing `YOUR-USERNAME` with your GitHub username:

```powershell
git commit -m "Add Counterpoint local POS"
git remote add origin https://github.com/YOUR-USERNAME/counterpoint-pos.git
git push -u origin main
```

Git may ask you to set your author name/email first; follow its displayed `git config` instructions. Authenticate through Git's browser sign-in when prompted. Do not put a password or token into the source files.

7. Open your repository on GitHub. Other people can use **Code → Download ZIP**, extract it, install Node 24+, and launch `start.cmd`. Their shop data remains on their own computers.
8. For a versioned download, open **Releases → Draft a new release**, create tag `v1.0.0`, describe the release, and publish. GitHub supplies source ZIP and tar archives automatically. Only attach clean code archives, never your working database.

### Publish updates

Run the checks, review the changed files, then push:

```powershell
node --test test/core.test.mjs test/server.test.mjs
git add .
git status
git commit -m "Describe your changes"
git push
```

Users should back up their database and stop the POS before replacing code. Keep their existing `data/` folder. This version has no automatic updater or schema migration system; future changes to the data structure need a migration plan.

Official instructions: [Add local code to GitHub](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github?platform=windows) and [GitHub Pages limitations](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages).

## Differences from Loyverse / work still needed

The feature reference is https://loyverse.com/features. This project is independent and is not affiliated with Loyverse.

This version does **not** include integrated card processing, split tenders, partial refunds, tips, email receipts, multiple tax rules, tax-inclusive pricing, zero/three-decimal currencies, bulk CSV import, photo uploads, variant groups/modifier pricing, recipes/composite ingredients, inventory counts, stock transfers, assembly/disassembly, purchase order partial receiving, supplier returns, weighted-average cost accounting, staff disabling or granular roles, PIN recovery, multiple stores/devices, cloud sync, separate customer/kitchen display apps, delivery integrations, or external APIs. Variant SKUs can be created as separate items. Kitchen statuses work on the same computer and update on refresh; they are not a network kitchen display.

Printing uses the browser's printer dialog. Dedicated ESC/POS commands, cash drawer opening, scales, camera scanning, payment terminals, and fiscal/tax certification are not integrated. Test your printer and scanner with the actual hardware. Business data is not encrypted by this app, and the activity log is not tamper-proof against a person with database access.

The database stores the shop as one JSON document inside SQLite. This keeps transactional changes simple for a small single-computer installation; it is not intended for large enterprise datasets. There is no unattended backup schedule. PIN sessions expire after eight hours, and failed login attempts are rate limited in memory.

## Development and checks

No third-party runtime dependencies. Files: `server.mjs` (local HTTP/auth/SQLite), `src/core.mjs` (business rules), `public/` (UI), `test/` (Node test runner).

```powershell
node --check server.mjs
node --check public/app.js
node --test test/core.test.mjs test/server.test.mjs
```

Automated checks cover totals, discounts, tax, points, change, refunds across shifts, stock, duplicate payments, permissions, purchasing, HTTP login, origin blocking, transaction rollback, backup contents, and persistence after restart. HTTP tests bind to loopback port 33219 and use an isolated temporary database. They do not touch your shop data.

License: MIT. You can share and modify the source, subject to the included license.
