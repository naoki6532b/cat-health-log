// catlog/lib/api.ts
export type ApiFetchInit = RequestInit & {
  /**
   * 明示的にPINを渡したいときだけ使う（通常は不要）
   */
  pin?: string;
};

function resolvePin(explicitPin?: string): string {
  if (explicitPin) return explicitPin;

  // ブラウザ（Client Components）では NEXT_PUBLIC_* しか使えない
  const clientPin = process.env.NEXT_PUBLIC_CATLOG_PIN ?? "";
  if (clientPin) return clientPin;

  // サーバー側なら CATLOG_PIN も参照できる
  const serverPin =
    (typeof window === "undefined" ? process.env.CATLOG_PIN : "") ?? "";

  return serverPin || "";
}

/**
 * Catlog用 fetch ラッパー
 * - x-catlog-pin を常に付与（既に指定されていれば上書きしない）
 * - credentials: same-origin
 * - cache: no-store（指定が無ければ）
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init: ApiFetchInit = {}
) {
  const headers = new Headers(init.headers);

  // 既に指定されているなら尊重
  if (!headers.has("x-catlog-pin")) {
    const pin = resolvePin(init.pin);
    if (pin) headers.set("x-catlog-pin", pin);
  }

  const finalInit: RequestInit = {
    ...init,
    headers,
    credentials: init.credentials ?? "same-origin",
    cache: init.cache ?? "no-store",
  };

  // pin は RequestInit に無いので消す
  delete (finalInit as any).pin;

  return fetch(input, finalInit);
}

/**
 * JSON を返すAPI向け（エラー時は本文付きで throw）
 */
export async function apiJson<T>(
  input: RequestInfo | URL,
  init: ApiFetchInit = {}
): Promise<T> {
  const res = await apiFetch(input, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}
