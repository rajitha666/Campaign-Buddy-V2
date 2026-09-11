import { test, expect } from "@playwright/test";
import { loginAs, Persona } from "./support/auth";
import { NAV } from "../src/config/nav.js";

// Every nav route this persona can see, deduped. Reads the live nav config
// so a route added to nav.js is covered automatically — no route list to
// keep in sync by hand.
function routesFor(persona: Persona): string[] {
  const paths = new Set<string>();
  for (const section of NAV) {
    for (const item of section.items) {
      const visible = (item.roles || section.roles || []).includes(persona);
      if (!visible) continue;
      if (item.path) paths.add(item.path);
      for (const child of item.children || []) {
        if (child.path) paths.add(child.path);
      }
    }
  }
  return [...paths];
}

const personas: Persona[] = ["admin", "supervisor", "sponsor"];

for (const persona of personas) {
  test(`${persona}: every nav route loads without crashing`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await loginAs(page, persona);

    const routes = routesFor(persona);
    expect(routes.length).toBeGreaterThan(0);

    for (const path of routes) {
      errors.length = 0;
      await page.goto(path);
      // A crashed render leaves #root empty (no error boundary in the app).
      await expect(page.locator("#root"), `#root emptied out on ${path}`).not.toBeEmpty();
      expect(errors, `uncaught error on ${path}: ${errors.join("; ")}`).toEqual([]);
    }
  });
}
