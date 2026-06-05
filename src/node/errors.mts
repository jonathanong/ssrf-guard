import { redactUrl } from "../core/index.mjs";

export class UnsafeUrlError extends Error {
  readonly rawUrl: string;
  readonly reason: string;

  constructor(rawUrl: string, reason: string) {
    const redacted = redactUrl(rawUrl);
    super(`Unsafe URL: ${reason} (${redacted})`);
    this.name = "UnsafeUrlError";
    this.rawUrl = redacted;
    this.reason = reason;
  }
}
