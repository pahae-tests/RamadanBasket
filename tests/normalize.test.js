import { describe, it, expect } from "vitest";
const n = require("../lib/normalize");

describe("normalisation", () => {
  it("normalise les CIN", () => {
    expect(n.normalizeCin(" ab 123-456 ")).toBe("AB123456");
    expect(n.normalizeCin("")).toBeNull();
    expect(n.normalizeCin(null)).toBeNull();
    expect(n.isValidCin("AB123456")).toBe(true);
    expect(n.isValidCin("123")).toBe(false);
  });

  it("normalise les téléphones marocains", () => {
    expect(n.normalizePhone("+212 6 12-34-56-78")).toBe("0612345678");
    expect(n.normalizePhone("00212612345678")).toBe("0612345678");
    expect(n.normalizePhone("612345678")).toBe("0612345678");
    expect(n.isValidPhone("0612345678")).toBe(true);
    expect(n.isValidPhone("12345")).toBe(false);
  });

  it("rejette les numéros trop longs ou absurdes", () => {
    expect(n.isValidPhone("070000000000000000000000000000")).toBe(false);
    expect(n.isValidPhone("0700000000")).toBe(false);
    expect(n.isValidPhone("06123456789")).toBe(false);
    expect(n.isValidPhone("0412345678")).toBe(false);
    expect(n.isValidPhone("0712345678")).toBe(true);
  });

  it("ignore accents, casse et ponctuation dans les noms", () => {
    expect(n.normalizeName("  Éléonore  El-Idrissi ")).toBe("eleonore el idrissi");
  });

  it("normalise les variantes arabes", () => {
    expect(n.normalizeName("أحمد")).toBe(n.normalizeName("احمد"));
  });

  it("calcule la distance de Damerau-Levenshtein avec transpositions", () => {
    expect(n.damerauLevenshtein("mohamed", "mohamde", 3)).toBe(1);
    expect(n.damerauLevenshtein("abc", "abc", 3)).toBe(0);
    expect(n.damerauLevenshtein("abcdef", "uvwxyz", 2)).toBeGreaterThan(2);
  });

  it("rapproche les cas cités par les utilisateurs", () => {
    expect(n.scoreName("Moahmd", "Mohamed").kind).not.toBe("none");
    expect(n.scoreName("محمد", "Mohamed").kind).not.toBe("none");
    expect(n.scoreName("بوقنيطير", "Bouknitir").kind).not.toBe("none");
    expect(n.scoreName("boqnitir", "Bouknitir").kind).not.toBe("none");
    expect(n.scoreName("Lobna", "Loubna").kind).not.toBe("none");
  });

  it("évite les fausses correspondances", () => {
    expect(n.scoreName("Ahmed", "Mohamed").kind).toBe("none");
    expect(n.scoreName("Ahmed Benali", "Mohamed Jabour").score).toBe(0);
    expect(n.scoreName("Fatima", "Hassan").score).toBe(0);
  });

  it("classe les correspondances approximatives sous les exactes", () => {
    expect(n.scoreName("Mohamed", "Mohamed").kind).toBe("exact");
    expect(n.scoreName("Mohamed", "Mohamed").score).toBeGreaterThan(n.scoreName("Mhoamed", "Mohamed").score);
  });
});
