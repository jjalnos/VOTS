import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { escapeHtml } from "@/lib/email/branded";
import {
  appendTrackingPixel,
  createTrackingToken,
  failureReasonFor,
  hashTrackingToken,
  REDACTION_PLACEHOLDER,
  redactSecrets,
  TRACKING_TOKEN_PATTERN,
  trackingOriginFromEnvironment,
  trackingPixelMarkup,
} from "@/lib/email/log";
import { EmailConfigurationError, EmailDeliveryError } from "@/lib/email/smtp";

// Mirrors PASSWORD_RESET_TOKEN_PATTERN in src/lib/auth/password-reset.ts: a
// tracking token must never be mistakable for a one-time credential.
const RESET_TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;
const TOKEN = "xK9_v2-Lm7Nd4Rf6Ts1Wc5Zh0BjUaEiOoPq3Yp8Kx2L";
const LINK = `https://archive.example/reset-password?lang=en&invited=1#token=${TOKEN}`;

describe("redactSecrets", () => {
  it("removes the raw token and link in every encoding a template can produce", () => {
    expect(TOKEN).toMatch(RESET_TOKEN_SHAPE);
    const body = [
      `Plain: ${LINK}`,
      `Attribute: <a href="${escapeHtml(LINK)}">Reset</a>`,
      `Encoded: ${encodeURIComponent(LINK)}`,
      `Encoded then escaped: ${escapeHtml(encodeURIComponent(LINK))}`,
      `Escaped then encoded: ${encodeURIComponent(escapeHtml(LINK))}`,
      `Bare token: ${TOKEN}`,
    ].join("\n");

    const stored = redactSecrets(body, [TOKEN, LINK]);

    expect(stored).not.toContain(TOKEN);
    expect(stored).not.toContain(LINK);
    expect(stored).not.toContain(escapeHtml(LINK));
    expect(stored).not.toContain(encodeURIComponent(LINK));
    expect(stored).toContain(REDACTION_PLACEHOLDER);
    expect(stored).toContain("Plain: ");
    expect(stored).toContain('<a href="');
    // The link is removed as a whole, so no fragment of the token survives either.
    expect(stored).not.toContain(TOKEN.slice(0, 20));
  });

  it("sweeps token-shaped fragments even when no secret was handed over", () => {
    const long = "A".repeat(40);
    expect(redactSecrets(`see #token=${long} now`, [])).toBe("see #token=[removed] now");
    expect(redactSecrets(`see %23token%3D${long} now`, [])).toBe("see %23token%3D[removed] now");
    expect(redactSecrets(`see ?token=${long} now`, [])).toBe("see ?token=[removed] now");
    expect(redactSecrets(`see ?TOKEN=${long}`, [])).toContain(long.slice(0, 5)); // only lower-case keys are swept
  });

  it("leaves short query tokens and ordinary words alone", () => {
    expect(redactSecrets("token=abc is fine", [])).toBe("token=abc is fine");
    expect(redactSecrets("Hello world, hello archive", ["world", "hello"])).toBe(
      "Hello world, hello archive",
    );
    expect(redactSecrets("nothing here", [])).toBe("nothing here");
  });

  it("accepts a custom placeholder and ignores non-string secrets", () => {
    const secrets = [TOKEN, 42, null, undefined] as unknown as string[];
    expect(redactSecrets(`x ${TOKEN} y`, secrets, "[gone]")).toBe("x [gone] y");
  });

  it("is idempotent", () => {
    const once = redactSecrets(`x ${LINK} y`, [TOKEN, LINK]);
    expect(redactSecrets(once, [TOKEN, LINK])).toBe(once);
  });
});

describe("tracking tokens", () => {
  it("draws unique, URL-safe, 32-character tokens that never look like a reset token", () => {
    const seen = new Set<string>();
    for (let index = 0; index < 1000; index += 1) {
      const token = createTrackingToken();
      expect(token).toMatch(TRACKING_TOKEN_PATTERN);
      expect(token).not.toMatch(RESET_TOKEN_SHAPE);
      seen.add(token);
    }
    expect(seen.size).toBe(1000);
  });

  it("uses at least 128 bits of entropy and refuses a broken generator", () => {
    const token = createTrackingToken(() => Buffer.alloc(24, 7));
    expect(Buffer.from(token, "base64url")).toHaveLength(24);
    expect(() => createTrackingToken(() => Buffer.alloc(3, 1))).toThrow(/unexpected shape/);
  });

  it("hashes with SHA-256 so a stored row can never be turned back into a URL", () => {
    const token = createTrackingToken();
    const hash = hashTrackingToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(hash).not.toContain(token);
    expect(hashTrackingToken(token)).toBe(hash);
    expect(hashTrackingToken(createTrackingToken())).not.toBe(hash);
  });
});

describe("appendTrackingPixel", () => {
  const url = "https://archive.example/api/email/open/abc&def";

  it("inserts the pixel before the last closing body tag", () => {
    const html = "<html><body><p>Hi</p></BODY></html>";
    const result = appendTrackingPixel(html, url);
    expect(result.indexOf("<img")).toBeLessThan(result.indexOf("</BODY>"));
    expect(result).toContain('width="1" height="1" alt=""');
    expect(result).toContain('src="https://archive.example/api/email/open/abc&amp;def"');
    expect(result.endsWith("</BODY></html>")).toBe(true);
  });

  it("appends when there is no body tag and keeps the original untouched", () => {
    const html = "<p>Hi</p>";
    const result = appendTrackingPixel(html, url);
    expect(result.startsWith(html)).toBe(true);
    expect(result).toBe(`${html}${trackingPixelMarkup(url)}`);
    expect(html).toBe("<p>Hi</p>");
  });

  it("finds the tag at the right index when the body holds characters that grow when lower-cased", () => {
    // "İ" (U+0130) lower-cases to two code units, so an index computed on a
    // lower-cased copy would land one character early per İ.
    const html = "<html><body><p>Merhaba İlhan İnci İpek</p></body></html>";
    const result = appendTrackingPixel(html, url);
    expect(result).toBe(
      `<html><body><p>Merhaba İlhan İnci İpek</p>${trackingPixelMarkup(url)}</body></html>`,
    );
  });

  it("accepts whitespace before the closing bracket and picks the last of several", () => {
    const spaced = "<html><body><p>Hi</p></body ></html>";
    expect(appendTrackingPixel(spaced, url)).toBe(
      `<html><body><p>Hi</p>${trackingPixelMarkup(url)}</body ></html>`,
    );
    const several = "<body>a</body><body>b</Body>";
    expect(appendTrackingPixel(several, url)).toBe(
      `<body>a</body><body>b${trackingPixelMarkup(url)}</Body>`,
    );
  });
});

describe("trackingOriginFromEnvironment", () => {
  it("answers null for anything other than a bare, valid origin", () => {
    expect(trackingOriginFromEnvironment({})).toBeNull();
    expect(trackingOriginFromEnvironment({ NEXT_PUBLIC_SITE_URL: "" })).toBeNull();
    expect(trackingOriginFromEnvironment({ NEXT_PUBLIC_SITE_URL: "not a url" })).toBeNull();
    expect(trackingOriginFromEnvironment({ NEXT_PUBLIC_SITE_URL: "https://a.org/path" })).toBeNull();
    expect(trackingOriginFromEnvironment({ NEXT_PUBLIC_SITE_URL: "https://a.org/?x=1" })).toBeNull();
    expect(trackingOriginFromEnvironment({ NEXT_PUBLIC_SITE_URL: "https://a.org/#f" })).toBeNull();
    expect(trackingOriginFromEnvironment({ NEXT_PUBLIC_SITE_URL: "https://u:p@a.org/" })).toBeNull();
    expect(trackingOriginFromEnvironment({ NEXT_PUBLIC_SITE_URL: "ftp://a.org/" })).toBeNull();
  });

  it("allows http only outside production", () => {
    expect(trackingOriginFromEnvironment({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" })).toBe(
      "http://localhost:3000",
    );
    expect(
      trackingOriginFromEnvironment({
        NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
        NODE_ENV: "production",
      }),
    ).toBeNull();
    expect(
      trackingOriginFromEnvironment({
        NEXT_PUBLIC_SITE_URL: "https://voicesoftheshoah.org/",
        NODE_ENV: "production",
      }),
    ).toBe("https://voicesoftheshoah.org");
  });
});

describe("failureReasonFor", () => {
  it("keeps only the variable NAME of a configuration error", () => {
    expect(failureReasonFor(new EmailConfigurationError(undefined, "SMTP_USER"))).toBe(
      "configuration: SMTP_USER",
    );
    expect(failureReasonFor(new EmailConfigurationError())).toBe("invalid message");
    const foreign = Object.assign(new Error("Reset email cannot be sent."), {
      variable: "PASSWORD_RESET_CONFIGURATION",
    });
    expect(failureReasonFor(foreign, "setup")).toBe("configuration: PASSWORD_RESET_CONFIGURATION");
  });

  it("never copies a variable VALUE, a message, or provider text into the reason", () => {
    const leaky = Object.assign(new Error("password=hunter2"), {
      variable: "smtp password is hunter2",
    });
    expect(failureReasonFor(leaky)).toBe("configuration: UNKNOWN");
    expect(failureReasonFor(new Error("535 Authentication failed for user hunter2"))).toBe(
      "delivery failed",
    );
    expect(failureReasonFor(new EmailDeliveryError())).toBe("delivery failed");
    expect(failureReasonFor("535 hunter2")).toBe("delivery failed");
    expect(failureReasonFor(new Error("boom"), "setup")).toBe("not attempted");
    expect(failureReasonFor(undefined, "setup")).toBe("not attempted");
  });
});
