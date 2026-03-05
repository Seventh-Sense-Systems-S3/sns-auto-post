/**
 * Small fetch wrapper for Next.js App Router API routes.
 * Adds org scoping header when provided.
 */
export async function apiFetch<T>(
  input: string,
  init?: RequestInit & { orgId?: string },
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.orgId) {
    headers.set("X-Org-Id", init.orgId);
  }

  const res = await fetch(input, {
    ...init,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

export async function apiPost<TResponse, TBody>(
  input: string,
  body: TBody,
  init?: Omit<RequestInit, "method" | "body"> & { orgId?: string },
): Promise<TResponse> {
  return apiFetch<TResponse>(input, {
    ...init,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    body: JSON.stringify(body),
  });
}
