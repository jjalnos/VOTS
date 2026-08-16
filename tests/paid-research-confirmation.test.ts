import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PaidResearchConfirmation,
  paidResearchConfirmationCopy,
} from "@/components/paid-research-confirmation";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [file] : [];
  });
}

describe("paid external-research confirmation", () => {
  it("uses direct plain-language cost and consent copy", () => {
    const copy = paidResearchConfirmationCopy("en");

    expect(copy.paidTokens).toBe("This search uses paid OpenAI tokens.");
    expect(copy.payer).toBe("Clicksmith pays the fee.");
    expect(copy.variableCost).toMatch(/actual cost varies/i);
    expect(copy.noAction).toBe("Nothing happens until you choose Continue.");
    expect(copy.everyTime).toMatch(/before every paid search/i);
    expect(copy.everyTime).toMatch(/no remember or skip option/i);
    expect(copy.continue).toMatch(/paid OpenAI/i);
  });

  it("renders the question, privacy boundary, cancel, and explicit paid continuation", () => {
    const html = renderToStaticMarkup(createElement(PaidResearchConfirmation, {
      locale: "en",
      open: true,
      query: "Find museum sources for this unresolved birth date.",
      onCancel: () => undefined,
      onContinue: () => undefined,
    }));

    expect(html).toContain("Before this paid search runs");
    expect(html).toContain("This search uses paid OpenAI tokens.");
    expect(html).toContain("Clicksmith pays the fee.");
    expect(html).toContain("Nothing happens until you choose Continue.");
    expect(html).toContain("Find museum sources for this unresolved birth date.");
    expect(html).toContain("Private archive uploads are not sent to OpenAI.");
    expect(html).toContain(">Cancel<");
    expect(html).toContain("Continue and use paid OpenAI");
    expect(html).not.toContain('type="checkbox"');
  });

  it("gates every client call to the paid endpoint behind a fresh modal state", () => {
    const projectRoot = process.cwd();
    const callers = sourceFiles(path.join(projectRoot, "src"))
      .filter((file) => readFileSync(file, "utf8").includes('fetch("/api/research"'));

    expect(callers.map((file) => path.relative(projectRoot, file))).toEqual([
      "src/components/research-form.tsx",
    ]);

    const source = readFileSync(callers[0]!, "utf8");
    const reviewStart = source.indexOf("function reviewPaidRequest");
    const confirmedStart = source.indexOf("async function runConfirmedResearch");
    const reviewFunction = source.slice(reviewStart, confirmedStart);
    const confirmedFunction = source.slice(confirmedStart, source.indexOf("return (", confirmedStart));

    expect(reviewFunction).toContain("setPendingQuery(query)");
    expect(reviewFunction).not.toContain("fetch(");
    expect(confirmedFunction).toContain('fetch("/api/research"');
    expect(confirmedFunction).toContain("setPendingQuery(null)");
    expect(confirmedFunction).toContain("confirmed: true");
    expect(confirmedFunction).toContain('costAcknowledgement: "CLICKSMITH_PAYS_OPENAI_FEES"');
    expect(source.match(/CLICKSMITH_PAYS_OPENAI_FEES/g)).toHaveLength(1);
    expect(source).toContain("open={pendingQuery !== null}");
    expect(source).not.toMatch(/localStorage|sessionStorage|type="checkbox"/);
  });

  it("provides the same required warning in Spanish", () => {
    const copy = paidResearchConfirmationCopy("es");

    expect(copy.paidTokens).toMatch(/tokens pagados de OpenAI/i);
    expect(copy.payer).toMatch(/Clicksmith paga/i);
    expect(copy.variableCost).toMatch(/costo real varía/i);
    expect(copy.noAction).toMatch(/No sucede nada.*Continuar/i);
    expect(copy.everyTime).toMatch(/cada búsqueda pagada/i);
  });
});
