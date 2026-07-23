import { describe, expect, it } from "vitest"

import {
  desktopEntryUrl,
  isAllowedDesktopNavigation,
} from "./desktop-navigation"

describe("desktop navigation", () => {
  it("enters through desktop auth and excludes website-only pages", () => {
    expect(
      desktopEntryUrl(new URL("https://a2zsoftware.ca/landing?q=1")).href
    ).toBe("https://a2zsoftware.ca/desktop")
    expect(
      isAllowedDesktopNavigation(
        "https://a2zsoftware.ca/desktop/sign-in/factor-one",
        "https://a2zsoftware.ca"
      )
    ).toBe(true)
    expect(
      isAllowedDesktopNavigation(
        "https://a2zsoftware.ca/chat/project-1",
        "https://a2zsoftware.ca"
      )
    ).toBe(true)
    expect(
      isAllowedDesktopNavigation(
        "https://a2zsoftware.ca/",
        "https://a2zsoftware.ca"
      )
    ).toBe(false)
    expect(
      isAllowedDesktopNavigation(
        "https://a2zsoftware.ca/pricing",
        "https://a2zsoftware.ca"
      )
    ).toBe(false)
    expect(
      isAllowedDesktopNavigation(
        "https://example.com/desktop",
        "https://a2zsoftware.ca"
      )
    ).toBe(false)
  })
})
