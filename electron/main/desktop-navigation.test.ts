import { describe, expect, it } from "vitest"

import {
  desktopEntryUrl,
  isAllowedDesktopAuthNavigation,
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

  it("allows only the exact Clerk and GitHub OAuth origins", () => {
    expect(
      isAllowedDesktopAuthNavigation(
        "https://accounts.a2zsoftware.ca/sign-in?redirect_url=%2Fdesktop"
      )
    ).toBe(true)
    expect(
      isAllowedDesktopAuthNavigation(
        "https://clerk.a2zsoftware.ca/v1/oauth_callback"
      )
    ).toBe(true)
    expect(
      isAllowedDesktopAuthNavigation(
        "https://clerk.shared.lcl.dev/v1/oauth_callback"
      )
    ).toBe(true)
    expect(
      isAllowedDesktopAuthNavigation(
        "https://github.com/login/oauth/authorize?client_id=test"
      )
    ).toBe(true)
    expect(
      isAllowedDesktopAuthNavigation(
        "https://github.com.evil.example/login/oauth/authorize"
      )
    ).toBe(false)
    expect(
      isAllowedDesktopAuthNavigation(
        "https://clerk.shared.lcl.dev.evil.example/v1/oauth_callback"
      )
    ).toBe(false)
    expect(
      isAllowedDesktopAuthNavigation("http://github.com/login/oauth/authorize")
    ).toBe(false)
    expect(isAllowedDesktopAuthNavigation("not a url")).toBe(false)
  })

  it("keeps Clerk callbacks inside the auth window until Clerk returns to the app", () => {
    expect(
      isAllowedDesktopAuthNavigation(
        "https://clerk.a2zsoftware.ca/v1/oauth_callback?status=complete"
      )
    ).toBe(true)
    expect(
      isAllowedDesktopNavigation(
        "https://clerk.a2zsoftware.ca/v1/oauth_callback?status=complete",
        "https://app.a2zsoftware.ca"
      )
    ).toBe(false)
    expect(
      isAllowedDesktopNavigation(
        "https://app.a2zsoftware.ca/chat",
        "https://app.a2zsoftware.ca"
      )
    ).toBe(true)
  })
})
