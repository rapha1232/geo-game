import { describe, expect, it } from "vitest";
import { t } from "./i18n";

describe("t()", () => {
  it("interpolates params", () => {
    expect(t("footer.rights", { year: 2026, brand: "Meridian" })).toBe(
      "© 2026 Meridian. All rights reserved.",
    );
  });
});
