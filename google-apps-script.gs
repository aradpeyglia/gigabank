/**
 * =========================================================================
 * MEGAGANKY LAB — Google Apps Script authentication adapter
 * -------------------------------------------------------------------------
 * Copy the entire contents of this file into the Apps Script editor of
 * your Google Sheet. Then deploy it as a Web App and paste the resulting
 * URL into assets/js/auth.js (the SHEETS_API_URL constant).
 *
 * What it does:
 *   • Accepts POSTs from the static site (form-urlencoded body)
 *   • Looks at the `action` parameter to decide what to do:
 *       - "login"   → check email + password against the Users sheet
 *       - "login" → validate the supplied fictional test identity
 *   • Returns JSON. Apps Script handles CORS automatically when deployed
 *     as a Web App with "Anyone" access.
 *
 * Expected Sheet structure (tab named exactly "Users"):
 *   | A: email           | B: password | C: name         | D: accountId  | E: balance |
 *   | demo@megaganky-lab.test | demo1234 | Ahoura Demo | LAB-0001 | 0 |
 *
 * SECURITY NOTE: Passwords are stored in plain text in a Google Sheet.
 * This is FINE for a personal demo or a closed test, but NEVER for real
 * users. If you ever go live, hash with bcrypt/SHA-256 + salt at minimum.
 * =========================================================================
 */


/* ---------------------------------------------------------------- CONFIG */
// Name of the tab inside the Sheet that holds user rows
const USERS_SHEET_NAME = 'Users';


/* =========================================================================
 * doPost — entry point for all POST requests from the website.
 * Apps Script automatically calls this when the deployed Web App URL
 * receives a POST.
 * ========================================================================= */
function doPost(e) {
  try {
    // e.parameter holds the form fields (because we POST as URL-encoded).
    // e.postData.contents would hold raw JSON if the client sent that.
    const action = (e.parameter.action || '').toLowerCase();

    let response;
    switch (action) {
      case 'login':
        response = handleLogin(e.parameter.email, e.parameter.password);
        break;
      default:
        response = { ok: false, error: 'Unknown action: ' + action };
    }

    return jsonResponse(response);
  } catch (err) {
    // Apps Script swallows errors — log them so they appear in "Executions"
    Logger.log('doPost error: ' + err);
    return jsonResponse({ ok: false, error: 'Server error: ' + err.message });
  }
}


/* =========================================================================
 * doGet — optional, gives you a friendly health-check page in a browser.
 * Visit the Web App URL directly to run a simple health check.
 * ========================================================================= */
function doGet() {
  return ContentService
    .createTextOutput("Megaganky Lab authentication adapter is live.")
    .setMimeType(ContentService.MimeType.TEXT);
}


/* =========================================================================
 * handleLogin — find a row in Users whose email + password matches.
 * Returns { ok: true, user: { name, email, accountId, balance } } on hit,
 * or { ok: false, error: '...' } on miss.
 * ========================================================================= */
function handleLogin(email, password) {
  if (!email || !password) {
    return { ok: false, error: 'Email and password are required.' };
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(USERS_SHEET_NAME);
  if (!sheet) {
    return { ok: false, error: 'Users sheet not found.' };
  }

  // Read all data including headers (row 1)
  const data = sheet.getDataRange().getValues();
  // Skip header row by starting at index 1
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowEmail = String(row[0] || '').trim().toLowerCase();
    const rowPwd   = String(row[1] || '');
    if (rowEmail === email.trim().toLowerCase() && rowPwd === password) {
      // Match — return public-safe user fields (no password)
      return {
        ok: true,
        user: {
          name:      row[2] || '',
          email:     row[0],
          accountId: row[3] || '',
          balance:   Number(row[4]) || 0,
        }
      };
    }
  }

  return { ok: false, error: 'Invalid email or password.' };
}


/* =========================================================================
 * jsonResponse — helper that wraps any object in a JSON HTTP response.
 * Apps Script Web Apps need ContentService.MimeType.JSON for it to be
 * parsed correctly on the client side.
 * ========================================================================= */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
