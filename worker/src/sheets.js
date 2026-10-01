/* =========================================================================
   sheets.js — thin wrapper around the existing Google Apps Script API
   -------------------------------------------------------------------------
   The existing Apps Script validates the lab's single test identity
   against a private Google Sheet. This Worker:
     1) Receives login requests from the browser
     2) Calls the Apps Script to validate the fictional test identity
     3) On success, mints a JWT and returns it (that part is in jwt.js)

   The Apps Script accepts form-urlencoded POSTs and returns JSON like:
     { ok: true,  user: { name, email, accountId, balance } }   on success
     { ok: false, error: "..." }                                on failure
   ========================================================================= */


/**
 * POST {action, ...params} as form-urlencoded data to the Apps Script
 * Web App. Returns the parsed JSON response.
 *
 * @param {string} sheetsUrl  The Apps Script Web App URL (stored as the
 *                            SHEETS_API_URL Worker secret).
 * @param {string} action     The adapter action; currently only 'login'.
 * @param {object} params     Extra fields the Apps Script needs.
 */
export async function callSheetsAction(sheetsUrl, action, params) {
  // Apps Script reads form-urlencoded bodies via `e.parameter`. Using
  // URLSearchParams also avoids a CORS preflight on the Apps Script side
  // (form bodies are simple requests; JSON bodies are not).
  const body = new URLSearchParams();
  body.append('action', action);
  for (const [key, value] of Object.entries(params)) {
    body.append(key, value);
  }

  const res = await fetch(sheetsUrl, {
    method: 'POST',
    body,
    // Apps Script Web Apps respond with 302 → JSON. Workers `fetch` follows
    // redirects by default, which is exactly what we want.
  });

  // Defensive: if Apps Script throws an uncaught error, it returns HTML.
  // Try to parse JSON; on failure, surface a clean error.
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: 'Sheets API returned non-JSON response.' };
  }
}
