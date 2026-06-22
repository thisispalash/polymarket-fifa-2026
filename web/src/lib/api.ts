export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  const res = await fetch(path, init);

  if (!res.ok) {
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      parsed = undefined;
    }

    if (res.status === 401) {
      window.location.assign("/unlock");
    }

    const parsedMsg =
      typeof parsed === "object" &&
      parsed !== null &&
      "message" in parsed &&
      typeof (parsed as { message: unknown }).message === "string"
        ? (parsed as { message: string }).message
        : undefined;

    const msg = parsedMsg ?? res.statusText;

    throw new ApiError(res.status, msg, parsed);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>("GET", path);
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>("POST", path, body);
  },
  del<T>(path: string): Promise<T> {
    return request<T>("DELETE", path);
  },
};

// crypto.randomUUID is available on all evergreen targets the PWA runs on
// (iOS Safari 16+, Chrome 92+). Used to stamp POST /orders with a stable
// idempotency key so a mobile double-tap collapses to one order. Caller
// scopes the lifetime — call once per submit intent, reuse on retries.
export function newClientOrderId(): string {
  return crypto.randomUUID();
}
