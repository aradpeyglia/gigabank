/* =========================================================================
   jwt.js — ES256 (ECDSA P-256) JWT sign + verify helpers
   -------------------------------------------------------------------------
   Uses the Web Crypto API that's built into Cloudflare Workers (it's the
   same `crypto.subtle` you'd find in modern browsers). NO external
   dependencies — this is intentional, the whole point of choosing Workers
   for this project is that we get strong crypto in the standard library.

   Why ES256 specifically? Because that's the only algorithm Glia's
   Direct ID accepts. ES256 = ECDSA with P-256 curve and SHA-256 hash.

   The "shape" of a signed JWT is three base64url-encoded chunks joined
   with dots:
       <base64url(header)>.<base64url(payload)>.<base64url(signature)>

   Header for ES256 is always: { "alg": "ES256", "typ": "JWT" }
   ========================================================================= */


/* -------------------------------------------------------------------------
   PEM ↔ ArrayBuffer helpers
   ------------------------------------------------------------------------- */

/**
 * Convert a PEM-formatted key string into the raw byte buffer that
 * `crypto.subtle.importKey` expects. PEM looks like:
 *
 *     -----BEGIN PRIVATE KEY-----
 *     MIGHAg.....BASE64....
 *     -----END PRIVATE KEY-----
 *
 * We strip the BEGIN/END markers + all whitespace, then base64-decode.
 */
function pemToArrayBuffer(pem) {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/, '')   // remove header line
    .replace(/-----END [^-]+-----/, '')     // remove footer line
    .replace(/\s/g, '');                    // strip all whitespace + newlines

  // atob() is base64 → binary string. We then walk it char-by-char into a
  // Uint8Array because that's what subtle.importKey wants.
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}


/* -------------------------------------------------------------------------
   Base64URL encode / decode
   These are JWT-flavored base64: no padding `=`, `+` becomes `-`, `/`
   becomes `_`. Standard for all JWT components.
   ------------------------------------------------------------------------- */

function base64UrlEncode(input) {
  // Accept either a string (we'll UTF-8 encode it) or a binary buffer.
  let bytes;
  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = new Uint8Array(input);
  }
  // Convert bytes to a binary string for btoa()
  let binStr = '';
  for (let i = 0; i < bytes.length; i++) binStr += String.fromCharCode(bytes[i]);
  // Standard base64 → base64url
  return btoa(binStr)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  // Pad back up to a multiple of 4 chars (base64 requirement)
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  // base64url → standard base64
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}


/* -------------------------------------------------------------------------
   Key caching
   importKey() is expensive (~1ms). The Worker keeps the same isolate alive
   across requests, so we cache the imported CryptoKey objects globally and
   reuse them on every invocation. First request pays the cost, all later
   ones are essentially free.
   ------------------------------------------------------------------------- */

let cachedSigningKey = null;    // private key (PKCS8) for signing
let cachedVerifyingKey = null;  // public key  (SPKI)  for verifying

async function getSigningKey(privateKeyPem) {
  if (cachedSigningKey) return cachedSigningKey;

  // PKCS8 is the standard format for private keys. The user must convert
  // their SEC1-format OpenSSL output with:
  //   openssl pkcs8 -topk8 -nocrypt -in private.pem -out private-pkcs8.pem
  // See worker/README.md for the full key-prep recipe.
  const keyBuffer = pemToArrayBuffer(privateKeyPem);
  cachedSigningKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    /* extractable */ false,
    /* keyUsages   */ ['sign']
  );
  return cachedSigningKey;
}

async function getVerifyingKey(publicKeyPem) {
  if (cachedVerifyingKey) return cachedVerifyingKey;

  // SPKI is the standard format for public keys — this is what
  // `openssl ec -in private.pem -pubout` writes by default.
  const keyBuffer = pemToArrayBuffer(publicKeyPem);
  cachedVerifyingKey = await crypto.subtle.importKey(
    'spki',
    keyBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    /* extractable */ false,
    /* keyUsages   */ ['verify']
  );
  return cachedVerifyingKey;
}


/* -------------------------------------------------------------------------
   PUBLIC API
   ------------------------------------------------------------------------- */

/**
 * Sign a payload object as an ES256 JWT using the given PEM private key.
 * Returns the compact JWT string ("xxx.yyy.zzz").
 */
export async function signES256Jwt(payload, privateKeyPem) {
  const header = { alg: 'ES256', typ: 'JWT' };

  // The "signing input" is the part the signature covers
  const encodedHeader  = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput   = `${encodedHeader}.${encodedPayload}`;

  const key = await getSigningKey(privateKeyPem);
  const signatureBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    key,
    new TextEncoder().encode(signingInput)
  );

  // The signature comes out as a raw 64-byte buffer (r||s for ES256), which
  // is exactly the format the JWT spec wants — just base64url-encode it.
  const encodedSignature = base64UrlEncode(signatureBuffer);
  return `${signingInput}.${encodedSignature}`;
}


/**
 * Verify a JWT's signature with the given PEM public key AND check that
 * `exp` is still in the future. Returns the decoded payload on success,
 * throws on any failure (bad shape, bad signature, expired).
 */
export async function verifyES256Jwt(token, publicKeyPem) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT — expected three dot-separated parts');

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signatureBuffer = base64UrlDecode(encodedSignature);

  // Verify the signature
  const key = await getVerifyingKey(publicKeyPem);
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    key,
    signatureBuffer,
    new TextEncoder().encode(signingInput)
  );
  if (!valid) throw new Error('Invalid JWT signature');

  // Signature is good — parse the payload
  const payloadJson = new TextDecoder().decode(base64UrlDecode(encodedPayload));
  const payload = JSON.parse(payloadJson);

  // Check expiration — `exp` is seconds-since-epoch per JWT spec
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < nowSeconds) {
    throw new Error('JWT has expired');
  }

  return payload;
}
