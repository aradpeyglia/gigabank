# Ahoura's Megagankybank

A fake banking website built as a personal demo / playground.
Fully static — runs on **GitHub Pages** with **zero build step**.
The only "backend" is a Google Sheet wired through Google Apps Script,
used to validate logins.

> ⚠️ **This is not a real bank.** Do not enter real credentials anywhere.
> Demo only.

---

## ✨ What's inside

**7 fully-built HTML pages** with a consistent off-white / tan / light-brown palette:

| Page              | File              | Highlights |
| ----------------- | ----------------- | ---------- |
| Home              | `index.html`      | Hero + slideshow, market ticker, animated stat counters, services grid, tabs, products carousel, testimonial slider, modal w/ QR code, news cards |
| About             | `about.html`      | Mission section, values grid, **animated vertical timeline**, leadership team cards, embedded YouTube video, careers CTA |
| Services          | `services.html`   | Pricing-style account cards, savings + CD rate table, **scrollable credit-card visual rail**, investing select-driven content swap, business banking section, security badges |
| Loans             | `loans.html`      | **Live mortgage calculator with sliders**, loan-type tabs, comparison table, 3-step process, customer story carousel, FAQ accordion |
| Contact / FAQ     | `contact.html`    | Contact methods grid, validated contact form with select, branch dropdown, **embedded Google Maps**, FAQ accordion, social link cards |
| Login             | `login.html`      | Two-column login w/ feature checklist; validates against Google Sheet (or built-in demo credentials) |
| Dashboard         | `dashboard.html`  | Auth-guarded internal banking UI: sidebar nav, balance cards, quick actions, **Chart.js doughnut + bar + line charts**, transaction list, notifications, animated budget bars, holdings table, card visuals |

**Every element type the user asked to test** is present somewhere:
hero, slideshow, ticker/marquee, animated counters, hover dropdowns,
tabs, accordions, modals, toasts, tooltips, progress bars, table, form
validation, range sliders, native selects, image carousel,
testimonial carousel, image gallery cards, video embed, map embed,
internal anchor scrolls, internal page links, **external `target="_blank"` links**,
ripple button effects, sticky header w/ scroll shadow,
mobile hamburger menu, reveal-on-scroll fade-ins, Chart.js charts,
fake credit-card visuals, and more.

---

## 📁 File structure

```
.
├── index.html              # Home
├── about.html              # About us
├── services.html           # Accounts / services
├── loans.html              # Loans landing
├── contact.html            # Contact + FAQ
├── login.html              # Sign in
├── dashboard.html          # Authenticated dashboard
├── google-apps-script.gs   # Paste into Apps Script editor (see below)
├── README.md               # ← you are here
└── assets/
    ├── css/
    │   └── styles.css      # All site-wide styles, organized by section
    └── js/
        ├── main.js         # Header, nav, animations, carousel, modals, toasts
        ├── auth.js         # Login + session helpers (talks to Apps Script)
        ├── dashboard.js    # Charts + dashboard data
        ├── loans.js        # Mortgage calculator math
        └── contact.js      # Contact form validation
```

---

## 🚀 Running locally

Just open `index.html` in your browser. No build, no install.

If you want to test the login flow, run a tiny local web server so
`fetch()` works properly (cross-origin file:// requests are blocked):

```bash
# Python 3
python3 -m http.server 8000
# then visit http://localhost:8000
```

Default demo credentials (work with no backend):

```
demo@megagankybank.com   /   demo1234
jane@megagankybank.com    /   password
```

---

## 🌐 Deploying to GitHub Pages

1. Create a new GitHub repo and push this folder to it.
2. In GitHub: **Settings → Pages**.
3. Under **Source**, pick **Deploy from a branch**, branch `main`, folder `/ (root)`. Click **Save**.
4. After ~30 seconds your site will be live at
   `https://<your-username>.github.io/<repo-name>/`.

That's it. No build action needed.

---

## 🔐 Connecting a Google Sheet as your "user database"

This is the more involved part. Follow these steps once and you'll have
a working signup/login backed by a spreadsheet you control.

### Step 1 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a **new blank spreadsheet**.
2. Rename the file (top-left) to **`Megagankybank Users`** (anything is fine).
3. Rename the first tab (bottom-left) to exactly **`Users`** (case-sensitive — `auth.js` and the Apps Script use this name).
4. In row 1, add these headers in columns A through E:

   | A: `email` | B: `password` | C: `name` | D: `accountId` | E: `balance` |
   | ---------- | ------------- | --------- | -------------- | ------------ |

5. Add your seed users in row 2 onward. Example row 2:

   | demo@megagankybank.com | demo1234 | Ahoura Radpey | MGB-0001 | 42819.55 |
   | ---------------------- | -------- | ------------- | -------- | -------- |

### Step 2 — Add the Apps Script

1. Inside the spreadsheet, click **Extensions → Apps Script**. A new tab opens.
2. Delete any boilerplate code in the editor.
3. Open the file **`google-apps-script.gs`** from this repo, **copy the entire contents**, and paste it into the Apps Script editor.
4. Click the floppy-disk **Save** icon (or `Ctrl/Cmd + S`).

### Step 3 — Deploy as a Web App

1. In the Apps Script editor, click the blue **Deploy** button (top right) → **New deployment**.
2. Click the gear icon and pick **Web app**.
3. Fill in:
   - **Description**: `Megagankybank API v1`
   - **Execute as**: `Me (your-google@email.com)`
   - **Who has access**: **Anyone** ← important! Without this, anonymous browsers can't call it.
4. Click **Deploy**.
5. Google will ask for permission to access your spreadsheet. Click **Authorize access** → choose your account → click **Advanced → Go to (unsafe)** → **Allow**. (This warning is because the script is unverified, which is normal for your own scripts.)
6. After deployment, **copy the Web app URL** that Apps Script gives you. It looks like:
   `https://script.google.com/macros/s/AKfycby......./exec`

### Step 4 — Wire the URL into the site

1. Open `assets/js/auth.js`.
2. Find the constant near the top:
   ```js
   const SHEETS_API_URL = 'PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE';
   ```
3. Replace the placeholder with the URL you copied.
4. Save, commit, push. Your live site will now validate logins against your real Google Sheet.

### Step 5 — Test it

1. Visit `https://your-site/login.html`.
2. Enter the email + password you put in row 2 of the Sheet.
3. You should land on the dashboard. 🎉

### (Optional) Create new accounts from the site

`auth.js` already knows how to call the `signup` action of the Apps Script.
The Apps Script's `handleSignup` will:

- Check the email doesn't already exist
- Auto-generate an `accountId` (`MGB-0023`, etc.)
- Seed `balance` to `0`
- Append the row

You'd just need to add a tiny "Create account" form to `login.html` that
POSTs `{action: 'signup', name, email, password}` instead of `login`.
That's left out by default because the brief only required login validation.

### Re-deploying after changes to the script

If you edit `google-apps-script.gs`:

1. Paste the new code into the Apps Script editor.
2. **Deploy → Manage deployments**, pick the active deployment, click the
   pencil ✏️ icon, then **Version: New version** → **Deploy**.
3. The URL stays the same — no client changes needed.

---

## 🎨 Customizing the look

All colors are CSS custom properties at the top of `assets/css/styles.css`:

```css
:root {
  --color-bg:         #FAF6EF;  /* off-white                   */
  --color-cream:      #EFE3CC;  /* card surface                */
  --color-tan:        #D6B884;  /* primary tan                 */
  --color-tan-dark:   #B89464;
  --color-brown:      #8B6B43;
  --color-brown-dark: #5C4527;
  --color-text:       #3B2C1A;
  ...
}
```

Change these and the whole site re-themes instantly. Fonts also live there
(`--font-sans`, `--font-serif`) and are loaded from Google Fonts in each HTML head.

---

## 🧠 How the JS files talk to each other

```
main.js       ← runs on every page; sets up nav, animations, carousels, modals
auth.js       ← login.html and dashboard.html; manages session in localStorage
dashboard.js  ← dashboard.html only; draws charts, renders fake data
loans.js      ← loans.html only; runs the mortgage calculator math
contact.js    ← contact.html only; validates the contact form
```

`main.js` exposes a global `window.toast(message, type)` you can use
from anywhere on the site for cheap, pretty notifications.

---

## ⚠️ Security caveats (because someone always asks)

- Passwords are stored **in plain text** in your Google Sheet. Don't reuse a real password.
- The Apps Script Web App is publicly callable. Anyone who finds the URL can call its endpoints. For a real product, add a shared secret check, rate limiting, and hash passwords.
- Sessions live in `localStorage`. They're persisted client-side only and have no real auth on the dashboard — anyone who hits the `dashboard.html` URL with a forged session in localStorage can see the page. (The fake data displayed is generic, so the worst case is a person seeing your demo dashboard.)
- This site is suitable for personal testing and showing off. It should not be used to hold real banking data.

---

## 📜 License

Do whatever you'd like with this code. It's a demo by Ahoura. Have fun.
