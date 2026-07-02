// catlog/lib/api.ts

/**
 * Catlog用 fetch ラッパー
 * - 認証は cookie セッション(same-origin)で行う
 * - 401(未ログイン)→ /login、409(猫未選択)→ /cats へ誘導
 * - cache: no-store(指定が無ければ)
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
) {
  const res = await fetch(input, {
    ...init,
    credentials: init.credentials ?? "same-origin",
    cache: init.cache ?? "no-store",
  });

  if (typeof window !== "undefined") {
    if (res.status === 401) {
      window.location.href = "/login";
    } else if (res.status === 409) {
      const body = await res.clone().json().catch(() => null);
      if (body?.error === "no_cat" || body?.error === "cat_not_selected") {
        window.location.href = "/cats";
      }
    }
  }

  return res;
}

/**
 * JSON を返すAPI向け(エラー時は本文付きで throw)
 */
export async function apiJson<T>(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<T> {
  const res = await apiFetch(input, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}
