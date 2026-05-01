const fs = require("fs");
const path = require("path");
const jpeg = require("jpeg-js");

function main() {
  const detector = require(path.resolve(__dirname, "../src/detector/markerDetector.js"));
  const root = path.resolve(__dirname, "../assets/reference/Marker1-TestImages");
  const cases = [
    ...fs.readdirSync(path.join(root, "Correct Marker Images")).map((name) => ({
      expected: true,
      file: path.join(root, "Correct Marker Images", name)
    })),
    ...fs.readdirSync(path.join(root, "Incorrect Marker Images")).map((name) => ({
      expected: false,
      file: path.join(root, "Incorrect Marker Images", name)
    }))
  ];

  let failures = 0;
  for (const item of cases) {
    const raw = jpeg.decode(fs.readFileSync(item.file), { useTArray: true });
    const result = detector.detectMarkerFromRaw(raw);
    const passed = result.ok === item.expected;
    if (!passed) failures += 1;
    console.log(`${passed ? "PASS" : "FAIL"} ${path.basename(item.file)} expected=${item.expected} actual=${result.ok} score=${result.score ?? "-"} reason=${result.reason ?? "detected"}`);
  }

  if (failures) process.exit(1);
}

main();
