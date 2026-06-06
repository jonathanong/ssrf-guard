/* oxlint-disable no-await-in-loop -- redirects must validate and fetch each hop sequentially */
import {
  fetch as undiciFetch,
  Headers,
  type Dispatcher,
  type Response as UndiciResponse,
} from "undici";
import { validateUrl } from "./validate-url.mjs";
import { createPinnedDispatcher } from "./pinned-dispatcher.mjs";
import { UnsafeUrlError } from "./errors.mjs";
import type { BlockedHostnamePolicy, ResolvedSafeAddress } from "../core/index.mjs";

export interface SafeFetchOptions extends Omit<RequestInit, "signal"> {
  blockedHostnames?: BlockedHostnamePolicy;
  maxRedirects?: number;
  signal?: AbortSignal;
}

const DEFAULT_MAX_REDIRECTS = 10;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// Security: headers stripped on cross-origin redirects
const SENSITIVE_HEADERS = new Set(["authorization", "cookie", "cookie2", "proxy-authorization"]);

type NonEmptyAddresses = [ResolvedSafeAddress, ...ResolvedSafeAddress[]];

function hasResolvedAddress(
  addresses: ResolvedSafeAddress[] | undefined,
): addresses is NonEmptyAddresses {
  return addresses !== undefined && addresses.length > 0;
}

function closeDispatcher(dispatcher: Dispatcher | undefined): void {
  // v8 ignore next
  dispatcher?.close().catch(() => {});
}

function getRedirectUrl(response: UndiciResponse, currentUrl: string): URL {
  const location = response.headers.get("location");
  if (!location) throw new UnsafeUrlError(currentUrl, "redirect response missing Location header");
  try {
    return new URL(location, currentUrl);
  } catch {
    throw new UnsafeUrlError(currentUrl, "invalid redirect URL");
  }
}

export async function safeFetch(
  initialUrl: string | URL,
  options?: SafeFetchOptions,
): Promise<UndiciResponse> {
  const {
    blockedHostnames,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    signal,
    ...fetchInit
  } = options ?? {};
  let currentFetchInit = fetchInit;
  let currentUrl = new URL(initialUrl);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    if (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") {
      throw new UnsafeUrlError(currentUrl.href, "URL protocol is not allowed");
    }

    const validateOptions = blockedHostnames !== undefined ? { blockedHostnames } : undefined;
    const resolvedAddresses: ResolvedSafeAddress[] = await validateUrl(
      currentUrl.href,
      validateOptions,
    );

    // v8 ignore next 3 -- validateUrl never returns an empty array (throws DNS_NULL_ROUTE instead)
    const dispatcher = hasResolvedAddress(resolvedAddresses)
      ? createPinnedDispatcher(resolvedAddresses)
      : undefined;

    try {
      const response = await undiciFetch(currentUrl.href, {
        ...currentFetchInit,
        dispatcher,
        redirect: "manual",
        signal,
      } as Parameters<typeof undiciFetch>[1]);

      if (!REDIRECT_STATUSES.has(response.status)) {
        closeDispatcher(dispatcher);
        return response;
      }

      if (redirectCount === maxRedirects) {
        // v8 ignore next
        response.body?.cancel().catch(() => {});
        closeDispatcher(dispatcher);
        throw new UnsafeUrlError(currentUrl.href, `too many redirects (max: ${maxRedirects})`);
      }

      // v8 ignore next
      response.body?.cancel().catch(() => {});
      const nextUrl = getRedirectUrl(response, currentUrl.href);

      // Security: methods and bodies are stripped on 301/302/303 redirects
      if (
        response.status === 303 ||
        ((response.status === 301 || response.status === 302) && currentFetchInit.method === "POST")
      ) {
        currentFetchInit = { ...currentFetchInit, method: "GET" };
        delete currentFetchInit.body;
      }

      // Strip sensitive headers on cross-origin redirect
      if (nextUrl.origin !== currentUrl.origin && currentFetchInit.headers) {
        const headers = new Headers(currentFetchInit.headers);
        for (const sensitiveHeader of SENSITIVE_HEADERS) {
          headers.delete(sensitiveHeader);
        }
        currentFetchInit = { ...currentFetchInit, headers: headers as HeadersInit };
      }

      closeDispatcher(dispatcher);
      currentUrl = nextUrl;
    } catch (error) {
      closeDispatcher(dispatcher);
      throw error;
    }
  }

  throw new UnsafeUrlError(currentUrl.href, `too many redirects (max: ${maxRedirects})`);
}
