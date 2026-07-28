"use client";

// Penyimpanan API key yang tidak bisa dibaca cuma dengan buka localStorage.
//
// Masalah versi sebelumnya: key ditulis apa adanya di localStorage, jadi siapa
// pun yang pegang perangkat itu (atau buka devtools) bisa baca. Sekarang yang
// disimpan cuma hasil ENKRIPSI, dan kuncinya diturunkan dari kata sandi yang
// cuma ada di kepala pemiliknya.
//
// Cara kerjanya:
//   kata sandi --PBKDF2 (250k putaran, SHA-256, garam acak)--> kunci AES
//   API key    --AES-GCM (IV acak per penyimpanan)---------> ciphertext
// Yang masuk localStorage: garam, IV, dan ciphertext. Tanpa kata sandi, itu
// semua cuma angka acak.
//
// Setelah dibuka, API key HANYA ada di memori halaman ini dan hilang begitu
// tab ditutup atau halaman dimuat ulang. Itu memang disengaja: kenyamanan
// "sekali isi selamanya" persis yang bikin key gampang bocor.
//
// Batasnya jujur: ini melindungi dari orang yang meminjam perangkat lu dan
// dari key yang teronggok di penyimpanan. Ini TIDAK melindungi kalau ada
// skrip jahat jalan di halaman yang sama sewaktu key-nya lagi kebuka. Buat
// perlindungan penuh, pakai mode proxy — di situ key gak pernah masuk browser.

const STORE = "guru-biola-ai-enc";
const ITERATIONS = 250_000;

interface Vault {
  v: 1;
  salt: string;
  iv: string;
  ct: string;
  baseUrl: string;
  model: string;
  hint: string;
}

const b64 = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer)));

const unb64 = (s: string) =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(pass: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pass),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function saveEncryptedKey(
  apiKey: string,
  passphrase: string,
  meta: { baseUrl: string; model: string; hint?: string }
): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    new TextEncoder().encode(apiKey)
  );
  const vault: Vault = {
    v: 1,
    salt: b64(salt),
    iv: b64(iv),
    ct: b64(ct),
    baseUrl: meta.baseUrl,
    model: meta.model,
    hint: meta.hint ?? "",
  };
  localStorage.setItem(STORE, JSON.stringify(vault));
}

export function readVault(): Vault | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Vault) : null;
  } catch {
    return null;
  }
}

export function hasVault(): boolean {
  return readVault() !== null;
}

export function clearVault() {
  localStorage.removeItem(STORE);
}

export async function unlockKey(passphrase: string): Promise<string> {
  const vault = readVault();
  if (!vault) throw new Error("Belum ada key tersimpan di perangkat ini.");
  const key = await deriveKey(passphrase, unb64(vault.salt));
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(vault.iv) as unknown as BufferSource },
      key,
      unb64(vault.ct) as unknown as BufferSource
    );
    return new TextDecoder().decode(plain);
  } catch {
    // AES-GCM gagal decrypt = kata sandi salah (atau datanya diubah orang).
    throw new Error("Kata sandi salah.");
  }
}

// Migrasi dari versi lama yang nyimpen key polos. Dipanggil sekali di halaman
// Guru: key polosnya dihapus, pemiliknya diminta nyimpen ulang pakai sandi.
export function findLegacyPlainKey(): { baseUrl: string; model: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("guru-biola-ai");
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.apiKey) return null;
    return { baseUrl: s.baseUrl ?? "", model: s.model ?? "" };
  } catch {
    return null;
  }
}

export function purgeLegacyPlainKey() {
  localStorage.removeItem("guru-biola-ai");
}
