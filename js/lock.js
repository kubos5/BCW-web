// Blocco opzionale dell'app.
//
// Dove il dispositivo ha un autenticatore integrato (Face ID, Touch ID, Windows Hello,
// sblocco di Android) si usa una passkey locale tramite WebAuthn; altrimenti un codice
// numerico, salvato solo come impronta SHA-256.

const CREDENTIAL_KEY = 'bcw.lock.credential';
const PIN_KEY = 'bcw.lock.pin';

const toBase64 = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)));
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const random = (n) => crypto.getRandomValues(new Uint8Array(n));

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`bcw:${text}`));
  return toBase64(digest);
}

export const Lock = {
  isLocked: false,
  biometryAvailable: false,

  async detect() {
    try {
      this.biometryAvailable = !!(window.PublicKeyCredential &&
        await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch {
      this.biometryAvailable = false;
    }
    return this.biometryAvailable;
  },

  get method() {
    try {
      if (localStorage.getItem(CREDENTIAL_KEY)) return 'passkey';
      if (localStorage.getItem(PIN_KEY)) return 'pin';
    } catch { /* ignorato */ }
    return null;
  },

  get name() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad/.test(ua)) return 'Face ID o Touch ID';
    if (/Macintosh/.test(ua)) return 'Touch ID';
    if (/Windows/.test(ua)) return 'Windows Hello';
    if (/Android/.test(ua)) return 'sblocco del dispositivo';
    return 'sblocco del dispositivo';
  },

  /** Attiva il blocco con una passkey del dispositivo. */
  async enablePasskey() {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: random(32),
        rp: { name: 'BCW' },
        user: { id: random(16), name: 'BCW', displayName: 'Blocco di BCW' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60_000,
      },
    });
    if (!credential) throw new Error('Operazione annullata.');
    localStorage.setItem(CREDENTIAL_KEY, toBase64(credential.rawId));
    localStorage.removeItem(PIN_KEY);
  },

  async enablePin(pin) {
    localStorage.setItem(PIN_KEY, await sha256(pin));
    localStorage.removeItem(CREDENTIAL_KEY);
  },

  disable() {
    localStorage.removeItem(CREDENTIAL_KEY);
    localStorage.removeItem(PIN_KEY);
    this.isLocked = false;
  },

  lock() {
    if (this.method) this.isLocked = true;
  },

  async unlockWithPasskey() {
    const id = localStorage.getItem(CREDENTIAL_KEY);
    if (!id) {
      this.isLocked = false;
      return true;
    }
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        allowCredentials: [{ type: 'public-key', id: fromBase64(id) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    if (assertion) this.isLocked = false;
    return !!assertion;
  },

  async unlockWithPin(pin) {
    const stored = localStorage.getItem(PIN_KEY);
    if (!stored || stored === await sha256(pin)) {
      this.isLocked = false;
      return true;
    }
    return false;
  },
};
