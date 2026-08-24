import { describe, expect, it } from "vitest";
import { brandedEmail, brandedEmailHtml, brandedEmailText } from "@/lib/email/branded";

const content = {
  locale: "en" as const,
  heading: "Welcome to the archive",
  paragraphs: ["Eleanor,", "You have been invited."],
  callToAction: { label: "Choose my password", url: "https://archive.example/reset" },
  note: "The link is valid for 7 days.",
};

describe("branded email frame", () => {
  it("carries the masthead, body, action, and automated notice in text", () => {
    const text = brandedEmailText(content);
    expect(text.startsWith("VOICES OF THE SHOAH")).toBe(true);
    expect(text).toContain("volunteer committee of the Holocaust Memorial Museum");
    expect(text).toContain("Choose my password: https://archive.example/reset");
    expect(text).toContain("automated message");
  });

  it("renders inline-styled HTML with the wine masthead and one action", () => {
    const html = brandedEmailHtml(content);
    expect(html).toContain("#4f0908");
    expect(html).toContain("Voices of the Shoah");
    expect(html).toContain('href="https://archive.example/reset"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("class=");
  });

  it("escapes person-controlled text in the HTML part", () => {
    const html = brandedEmailHtml({
      ...content,
      paragraphs: ['<img src=x onerror=alert(1)> & "friends"'],
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&amp;");
  });

  it("refuses non-https action URLs in both parts", () => {
    const bad = { ...content, callToAction: { label: "x", url: "javascript:alert(1)" } };
    expect(() => brandedEmailHtml(bad)).toThrow(/https/);
    expect(() => brandedEmailText(bad)).toThrow(/https/);
  });

  it("localizes the institutional lines in Spanish", () => {
    const { text, html } = brandedEmail({ ...content, locale: "es" });
    expect(text).toContain("Museo Conmemorativo del Holocausto de San Antonio");
    expect(html).toContain("mensaje automático");
  });
});
