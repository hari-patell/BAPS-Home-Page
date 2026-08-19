// Launches Chromium with the SAME launch config and stealth patches the app
// uses, then reads back the fingerprint values a bot check would look at.
// Exits non-zero if any check fails.
//
//   npm run verify:stealth
//
// Useful because these patches can only be validated by actually running a
// browser — a passing build says nothing about whether they work.
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { applyStealth } from "../src/lib/scrape/stealth.ts";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const browser = await puppeteer.launch({
  args: [
    ...chromium.args,
    "--disable-blink-features=AutomationControlled",
    "--lang=en-US,en",
    "--no-sandbox",
  ],
  executablePath: await chromium.executablePath(),
  headless: true,
});

const page = await browser.newPage();
await applyStealth(page, UA);
await page.setViewport({ width: 1440, height: 900 });
await page.goto("data:text/html,<html><body>probe</body></html>");

const result = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl");
  return {
    webdriver: navigator.webdriver,
    webdriverInPrototype: "webdriver" in Navigator.prototype,
    hasWindowChrome: typeof window.chrome === "object" && window.chrome !== null,
    pluginCount: navigator.plugins.length,
    mimeTypeCount: navigator.mimeTypes.length,
    languages: navigator.languages,
    userAgent: navigator.userAgent,
    webglVendor: gl ? gl.getParameter(37445) : "no-webgl-context",
    webglRenderer: gl ? gl.getParameter(37446) : "no-webgl-context",
  };
});

console.log(JSON.stringify(result, null, 2));

const checks = [
  ["navigator.webdriver is undefined", result.webdriver === undefined],
  ["navigator.plugins is non-empty", result.pluginCount > 0],
  ["window.chrome exists", result.hasWindowChrome === true],
  ["UA has no HeadlessChrome", !/HeadlessChrome/i.test(result.userAgent)],
  ["WebGL vendor is not Google", !/google/i.test(String(result.webglVendor))],
  ["WebGL renderer is not SwiftShader", !/swiftshader/i.test(String(result.webglRenderer))],
];

console.log("\n--- checks ---");
let failed = 0;
for (const [label, pass] of checks) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}`);
  if (!pass) failed++;
}

await browser.close();
process.exit(failed === 0 ? 0 : 1);
