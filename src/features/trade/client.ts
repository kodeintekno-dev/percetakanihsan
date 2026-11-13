"use client";
import { useRouter } from "next/navigation";
export function useTradeRequest() {
  const router = useRouter();
  return async function tradeRequest<T>(
    url: string,
    method = "GET",
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await fetch(url, {
      method,
      signal,
      headers: body ? { "Content-Type": "application/json" } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (response.status === 401) {
      router.replace("/login");
      throw new Error("Sesi berakhir. Silakan masuk kembali.");
    }
    if (!response.ok)
      throw new Error(
        [data.error, ...Object.values(data.fields ?? {}).flat()]
          .filter(Boolean)
          .join(" "),
      );
    return data as T;
  };
}
