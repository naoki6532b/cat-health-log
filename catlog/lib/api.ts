export function getPin(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("catlog_pin") ?? "";
}

export function ensurePin(): string {
  const pin = getPin();
  if (pin) return pin;
  const v = prompt("PIN（共通）を入力してください");
  if (v) localStorage.setItem("catlog_pin", v);
  return v ?? "";
}

export async function apiFetch(path: string, init?: RequestInit) {
  const pin = ensurePin();
  const headers = new Headers(init?.headers ?? {});
  if (pin) headers.set("x-catlog-pin", pin);

  const res = await fetch(path, { ...init, headers, cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return res;
}