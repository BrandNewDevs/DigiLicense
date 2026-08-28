import { expect, test } from "@playwright/test"

test("public shell remains secure and usable on a slow mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 })
  await page.route("**/*", async (route) => {
    if (["script", "stylesheet"].includes(route.request().resourceType())) {
      await new Promise((resolve) => setTimeout(resolve, 40))
    }
    await route.continue()
  })

  const response = await page.goto("/")
  expect(response?.status()).toBe(200)
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff")
  expect(response?.headers()["x-frame-options"]).toBe("DENY")
  expect(response?.headers()["access-control-allow-origin"]).toBeUndefined()
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Licence services without the confusion",
    })
  ).toBeVisible()
  await expect(
    page.getByText("No government service is connected.")
  ).toBeVisible()

  await page.keyboard.press("Tab")
  await expect(
    page.getByRole("link", { name: "Skip to main content" })
  ).toBeFocused()
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  )
  expect(hasHorizontalOverflow).toBe(false)
})

test("an applicant can establish a server session and open the dashboard", async ({
  page,
}) => {
  await page.goto("/dashboard")
  await page.waitForLoadState("networkidle")
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true })
  ).toBeVisible()
  await page.getByRole("button", { name: "Sign in", exact: true }).click()

  await expect(
    page.getByRole("heading", { level: 1, name: "Your dashboard" })
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Refresh" })).toBeEnabled()
  await expect(
    page.getByText("Your dashboard is temporarily unavailable.")
  ).toHaveCount(0)
})

test("a signed-in applicant receives grounded guidance through FastAPI", async ({
  page,
}) => {
  await page.goto("/dashboard")
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(
    page.getByRole("heading", { level: 1, name: "Your dashboard" })
  ).toBeVisible()

  await page.goto("/services/appointments")
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: "Open guidance assistant" }).click()
  await expect(
    page.getByRole("complementary", {
      name: "DigiLicense guidance assistant",
    })
  ).toBeVisible()
  await page
    .getByRole("textbox", { name: "Your question" })
    .fill("How does the appointment waitlist work?")
  await page.getByRole("button", { name: "Send question" }).click()

  await expect(page.getByText("Answer", { exact: true })).toBeVisible()
  await expect(
    page.getByText(
      "This is deterministic guidance. No external AI service was called. This is simulated prototype behavior."
    )
  ).toBeVisible()
  await expect(
    page.getByText("DigiLicense prototype behavior", { exact: true })
  ).toBeVisible()
})
