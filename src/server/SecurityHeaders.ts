import type { Response } from "express";

// Baseline hardening headers with no CSP. This app loads Pixi/WebGL workers
// via blob: URLs, CDN-hosted JS/assets, and opens cross-origin WebSockets to
// sibling deployments (docs/MultiServer.md) - a correct CSP needs to be built
// and verified live against all of those paths, so it's deliberately left for
// a separate, carefully-tested change rather than risk breaking the game with
// an untested directive.
export function setSecurityHeaders(res: Response): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Nothing in this app embeds itself in another site's iframe.
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Render terminates TLS in front of every deployment; HTTP is never the
  // real transport, so this is safe unconditionally. 180 days, not the full
  // year+preload commitment - this fork's domain isn't submitted anywhere.
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=15552000; includeSubDomains",
  );
  // camera/microphone/geolocation/usb: confirmed no call sites anywhere in
  // this codebase. `payment` is deliberately left alone - Stripe checkout
  // (StripeInline.ts/Payments.ts) embeds Stripe's own iframe and can offer
  // Apple/Google Pay, both gated on the Payment Request API being allowed to
  // propagate into that iframe; blocking it here would break real purchases.
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), usb=()",
  );
}
