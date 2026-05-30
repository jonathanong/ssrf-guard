import { sanitizeUrl } from "../core/index.mjs";

export class UnsafeUrlError extends Error {
  readonly rawUrl: string;
  readonly reason: string;

  constructor(rawUrl: string, reason: string) {
    const safeUrl = sanitizeUrl(rawUrl);
    super(`Unsafe URL: ${reason} (${safeUrl})`);
    this.name = "UnsafeUrlError";
    this.rawUrl = safeUrl;
    this.reason = reason;
  }
}
