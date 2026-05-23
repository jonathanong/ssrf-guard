export class UnsafeUrlError extends Error {
  readonly rawUrl: string;
  readonly reason: string;

  constructor(rawUrl: string, reason: string) {
    super(`Unsafe URL: ${reason} (${rawUrl})`);
    this.name = "UnsafeUrlError";
    this.rawUrl = rawUrl;
    this.reason = reason;
  }
}
