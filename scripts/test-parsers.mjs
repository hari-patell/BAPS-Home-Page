// Tests the new parsing logic against the ACTUAL strings observed in the
// live /api/debug output, so we're not guessing again.
import {
  dateFromFilename,
  isLikelyChromeImage,
  collectAudioSources,
  collectImages,
  toContentImages,
} from "../src/lib/scrape/heuristics.ts";
import { collectDetailLinksByDate } from "../src/lib/scrape/vicharan.ts";
import * as cheerio from "cheerio";

let failed = 0;
const check = (label, pass, detail = "") => {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? "  -> " + detail : ""}`);
  if (!pass) failed++;
};

console.log("=== image classification (real srcs from live probe) ===");
const real = [
  ["https://www.baps.org/images/baps_logo.svg", true],
  ["https://www.baps.org/images/baps_logo_small.svg", true],
  ["https://www.baps.org/images/bulletL.png", true],
  ["https://www.baps.org/images/bulletR.png", true],
  ["https://www.baps.org/images/ds-separator.png", true],
  ["https://www.baps.org/Data/Sites/1/Media/dailysatsang/2026/260818-nashville.jpg", false],
  ["https://www.baps.org/Data/Sites/1/Media/dailysatsang/2026/260818S.jpg", false],
  ["https://www.baps.org//Data/Sites/1/Media/OtherImages/31774/Thumbnails/20260817_i.jpg", false],
  ["https://www.baps.org//Data/Sites/1/Media/GalleryImages/36866/Thumbnails/2026_08_07_095_Sarangpur.jpg", false],
];
for (const [src, expectChrome] of real) {
  const got = isLikelyChromeImage({ src, alt: "", title: "" });
  check(`${expectChrome ? "chrome" : "content"}: ${src.split("/").pop()}`, got === expectChrome);
}

console.log("\n=== date from thumbnail filename ===");
const dates = [
  ["https://www.baps.org//Data/Sites/1/Media/OtherImages/31774/Thumbnails/20260817_i.jpg", "17-Aug-2026"],
  ["https://www.baps.org//Data/Sites/1/Media/OtherImages/31711/Thumbnails/20260801_i.jpg", "1-Aug-2026"],
  ["https://www.baps.org//Data/Sites/1/Media/OtherImages/31766/Thumbnails/20260814.jpeg", "14-Aug-2026"],
  ["https://www.baps.org//Data/Sites/1/Media/OtherImages/31724/Thumbnails/2026_08_04_i.jpg", "4-Aug-2026"],
];
for (const [src, expected] of dates) {
  const got = dateFromFilename(src);
  check(`${src.split("/").pop()} -> ${expected}`, got === expected, `got ${got}`);
}

console.log("\n=== swamishri vs murti filename rule ===");
const SWAMISHRI_FILE_RE = /\d+S\.(?:jpe?g|png|webp)$/i;
check("260818S.jpg is swamishri", SWAMISHRI_FILE_RE.test("260818S.jpg"));
check("260818-nashville.jpg is NOT swamishri", !SWAMISHRI_FILE_RE.test("260818-nashville.jpg"));

console.log("\n=== darshan captions from real body text ===");
const bodyText =
  "Daily Satsang 18 Aug 2026, Shravan Sud Chhath Samvat 2082 Murti Darshan Shri Akshar Purushottam Maharaj, Nashville, TN, USA Swamishri's Darshan Param Pujya Pramukh Swami MaharajFebruary 1998, Galteshwar, India પ્રેરણા પરિમલ બ્રહ્મસ્વરૂપ";
const DARSHAN_CAPTIONS_RE =
  /Murti\s+Darshan\s+(.{3,160}?)\s+Swamishri'?s\s+Darshan\s+(.{3,160}?)(?=\s*(?:પ્રેરણા|Prerna|Vachanamrut\s+Gems))/i;
const capm = bodyText.match(DARSHAN_CAPTIONS_RE);
check("captions matched", Boolean(capm));
if (capm) {
  check("murti caption", capm[1].includes("Nashville"), capm[1]);
  check("swamishri caption", capm[2].includes("Galteshwar"), capm[2]);
}

console.log("\n=== samvat date ===");
const SAMVAT_RE = /([A-Za-z]+\s+(?:Sud|Vad)\s+[A-Za-z઀-૿]+\s*,?\s*Samvat\s*\d{4})/i;
const sam = bodyText.match(SAMVAT_RE)?.[1];
check("hindu date", sam === "Shravan Sud Chhath Samvat 2082", sam);

console.log("\n=== audio dedupe from real jPlayer script ===");
const html = `<html><body>
<script>$("#Jplayer_VS").jPlayer({ready: function () {$(this).jPlayer("setMedia", {mp3: "https://download.baps.org/Data/Sites/1/Media/DownloadableFile/DailySatsang/vachanamrut_2019/vachanamrut_219.mp3"});}});</script>
<script>$("#Jplayer_vt").jPlayer({ready: function () {$(this).jPlayer("setMedia", {mp3: "https://download.baps.org/Data/Sites/1/Media/DownloadableFile/DailySatsang/vato_2019/Upasana-008.mp3"});}});</script>
<script>$("#Jplayer_AP").jPlayer({ready: function () {$(this).jPlayer("setMedia", {mp3: "https://download.baps.org/Data/Sites/1/Media/DownloadableFile/DailySatsang/GurusravanYagn-3 _ 2018/52.mp3"});}});</script>
<a href="https://download.baps.org/download.php?file=Data/Sites/1/Media/DownloadableFile/DailySatsang/vachanamrut_2019/vachanamrut_219.mp3">dl</a>
</body></html>`;
const $ = cheerio.load(html);
const audio = collectAudioSources($, "https://www.baps.org/Daily-Satsang.aspx");
check("3 unique tracks (download.php twin folded)", audio.length === 3, `got ${audio.length}: ${audio.map(a=>a.src.split("/").pop()).join(", ")}`);

console.log("\n=== gujarati block excludes script/style ===");
const gujHtml = `<html><body>
<style>.ui-datepicker td { border: 0; padding: 2px 10px; } .x{color:red}</style>
<script>var a = 1; function f(){ return "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; }</script>
<p>બ્રહ્મસ્વરૂપ પ્રમુખસ્વામી મહારાજની પ્રેરક પ્રસંગ-સ્મૃતિઓ તા. 1-9-2010, ભાવનગર મુલાકાત દરમ્યાન ચકમપરના બેચરભાઈ આવ્યા.</p>
</body></html>`;
const $g = cheerio.load(gujHtml);
$g("script, style, noscript").remove();
const text = $g("body").text().replace(/\s+/g, " ").trim();
check("no CSS leaked into text", !text.includes("ui-datepicker") && !text.includes("var a"), text.slice(0, 60));

console.log("\n=== cheerio image collection (vicharan grid shape) ===");
// Mirrors the real listing: thumbnail inside an <a>, caption text in the
// sibling cell rather than inside the link.
const gridHtml = `<html><body>
  <img src="/images/baps_logo.svg">
  <table><tr>
    <td><a href="/Vicharan/2026/04-August-2026-31724.aspx"><img src="//Data/Sites/1/Media/OtherImages/31724/Thumbnails/20260804_i.jpg"></a></td>
  </tr><tr>
    <td>4-Aug-2026 - Sarangpur, India</td>
  </tr></table>
</body></html>`;
const $grid = cheerio.load(gridHtml);
const imgs = toContentImages(collectImages($grid, "https://www.baps.org/vicharan.aspx"));
check("logo excluded, 1 content image", imgs.length === 1, `got ${imgs.length}`);
if (imgs[0]) {
  check("absolute src", imgs[0].src.startsWith("https://www.baps.org/"), imgs[0].src);
  check("href captured", (imgs[0].href || "").includes("04-August-2026-31724"), imgs[0].href);
}

// A genuinely protocol-relative URL (dotted host) must still be respected.
const pr = cheerio.load(`<img src="//cdn.example.com/Media/x.jpg">`);
const prImgs = collectImages(pr, "https://www.baps.org/vicharan.aspx");
check("real protocol-relative host preserved",
  prImgs[0]?.src === "https://cdn.example.com/Media/x.jpg", prImgs[0]?.src);

console.log("\n=== prerna section slice (real 19-Aug page text) ===");
const realBody = "Daily Satsang 19 Aug 2026, Shravan Sud Satam Samvat 2082 Murti Darshan Shri Akshar Purushottam Maharaj, Cincinnati, OH, USA Swamishri's Darshan Param Pujya Pramukh Swami MaharajMay 1999, Silvassa, India પ્રેરણા પરિમલ બ્રહ્મસ્વરૂપ પ્રમુખસ્વામી મહારાજની પ્રેરક પ્રસંગ-સ્મૃતિઓ તા. 1-9-2010, ભાવનગર સ્વામીશ્રી રાત્રિભોજન અંગીકાર કરી રહ્યા હતા. Vachanamrut Gems Gadhada II-23.4: The Mind of a True Sadhu";
const PRERNA_SECTION_RE = /પ્રેરણા\s*પરિમલ\s*([\s\S]{40,4000}?)(?=Vachanamrut\s+Gems|Audio\s+Satsang|$)/;
const slice = realBody.match(PRERNA_SECTION_RE)?.[1]?.trim();
check("slice excludes darshan captions", Boolean(slice) && !slice.includes("Cincinnati"), (slice||"").slice(0,40));
check("slice excludes Vachanamrut section", Boolean(slice) && !slice.includes("True Sadhu"));
check("slice keeps the passage", Boolean(slice) && slice.includes("રાત્રિભોજન"));

console.log("\n=== vicharan location stops at markup junk ===");
const vtext = "17-Aug-2026 - Ahmedabad, India .socialmedia { position: absolute; } 16-Aug-2026 - Ahmedabad, India";
const DATE_TOKEN_SRC = /\b\d{1,2}[-\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s]\d{4}\b/i.source;
const vpat = new RegExp(`(${DATE_TOKEN_SRC})\\s*[-–—]\\s*([A-Za-z][A-Za-z .'-]{0,40},\\s*[A-Za-z][A-Za-z .'-]{0,40}?)(?=\\s*(?:[.#]|$|\\d{1,2}[-\\s][A-Z]))`, "gi");
const locs = [...vtext.matchAll(vpat)].map((m) => m[2].trim());
check("location has no CSS junk", locs[0] === "Ahmedabad, India", JSON.stringify(locs));

console.log("\n=== audio matcher finds jPlayer mp3s ===");
const audioHtml = `<html><body><script>$("#p").jPlayer({ready:function(){$(this).jPlayer("setMedia",{mp3:"https://download.baps.org/a/vachanamrut_219.mp3"});}});</script></body></html>`;
const $a = cheerio.load(audioHtml);
const tracks = collectAudioSources($a, "https://www.baps.org/Daily-Satsang.aspx");
check("1 track found", tracks.length === 1, JSON.stringify(tracks.map(t=>t.src)));


console.log("\n=== vicharan day-page links keyed by date ===");
{
  // Real listing markup: the caption sits outside the <a>, and the "read
  // more" link is a bare anchor with no image inside it at all.
  const $ = cheerio.load(`
    <a href="/Vicharan/2026/18-August-2026-31775.aspx">
      <img src="//Data/Sites/1/Media/OtherImages/31775/Thumbnails/20260818_i.jpg">
    </a>
    <span>18-Aug-2026 - Ahmedabad, India</span>
    <a href="/Vicharan/2026/4-August-2026-31724.aspx">More</a>
    <a href="/vicharan.aspx">Vicharan</a>
  `);
  const map = collectDetailLinksByDate($, "https://www.baps.org/vicharan.aspx");
  check("finds the 18-Aug day page", map.get("18-Aug-2026") ===
    "https://www.baps.org/Vicharan/2026/18-August-2026-31775.aspx", map.get("18-Aug-2026"));
  check("finds a day page with no image inside the link",
    map.get("4-Aug-2026") === "https://www.baps.org/Vicharan/2026/4-August-2026-31724.aspx");
  check("listing page itself is not a day page", map.size === 2, String(map.size));
}

console.log("\n=== day page: all full-size photos with captions ===");
{
  // A real day-page shape: full-size /Media/ photos each followed by a
  // caption cell, plus neighbouring-day /Thumbnails/ links that must be
  // dropped and site chrome that must be ignored.
  const $ = cheerio.load(`
    <img src="/images/baps_logo.svg">
    <div><img src="//Data/Sites/1/Media/OtherImages/31775/20260818_01.jpg"></div>
    <div>BAPS Shri Swaminarayan Mandir, Ahmedabad</div>
    <div><img src="//Data/Sites/1/Media/OtherImages/31775/20260818_02.jpg"></div>
    <div>Shri Ghanshyam Maharaj</div>
    <a href="/Vicharan/2026/17-August-2026-31774.aspx">
      <img src="//Data/Sites/1/Media/OtherImages/31774/Thumbnails/20260817_i.jpg">
    </a>
  `);
  const candidates = toContentImages(collectImages($, "https://www.baps.org/Vicharan/2026/18-August-2026-31775.aspx"));
  const photos = candidates
    .filter((c) => !/\/Thumbnails\//i.test(c.src))
    .map((c) => ({ image: c.src, caption: (c.caption || "").trim() || undefined }));
  check("two full-size photos, thumbnail dropped", photos.length === 2, `got ${photos.length}`);
  check("first caption", photos[0]?.caption === "BAPS Shri Swaminarayan Mandir, Ahmedabad", photos[0]?.caption);
  check("second caption", photos[1]?.caption === "Shri Ghanshyam Maharaj", photos[1]?.caption);
  check("no thumbnail leaked in", photos.every((p) => !/\/Thumbnails\//i.test(p.image)));
}

console.log(`\n${failed === 0 ? "ALL PASS" : failed + " FAILED"}`);
process.exit(failed === 0 ? 0 : 1);
