const fs = require("fs");
const path = require("path");

const lines = [
  "Alemeno Marker Scanner - Approach",
  "",
  "Marker choice",
  "The app uses the provided Marker 1. It is a square black border with a single filled black finder block near the top-left corner. The remaining interior is mostly empty, which leaves room for encoded content and makes the marker easy to distinguish from ordinary square objects.",
  "",
  "Camera flow",
  "The React Native app renders a live back-camera preview with a 1:1 capture ratio. On supported Android devices it selects a square picture size between 2000x2000 and 3000x3000 pixels, preferring the size closest to 2500x2500. The scan loop captures up to 60 frames and stops once 20 valid marker crops are produced.",
  "",
  "Detection",
  "Each JPEG frame is decoded in JavaScript, thresholded for true black pixels, and scanned for the largest square-like connected component. The detector extracts the four extreme corners of that component, validates that all four outer edges are continuous, and perspective-warps the candidate into a 300x300 image.",
  "",
  "Orientation correction",
  "After warping, the detector measures four corner finder zones. The crop is rotated in 90-degree steps until the filled finder block is in the top-left location. The final image is encoded as JPEG and displayed exactly at 300x300 pixels.",
  "",
  "False-positive rejection",
  "Validation checks the four black border bands, the expected top-left finder block, the absence of finder blocks in the other corners, low central black density, and the red error mark used in the supplied incorrect samples. The included test runner verifies that the three correct Marker 1 images are accepted and the four incorrect Marker 1 images are rejected.",
  "",
  "Performance",
  "Candidate detection runs on a downsampled frame for speed. Only the accepted square candidate is warped at 300x300 resolution, keeping per-frame work small enough for the assignment target of a sub-3000 ms scan-to-result path on a typical Android device."
];

function escapePdf(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrap(text, width = 88) {
  if (!text) return [""];
  const words = text.split(/\s+/);
  const out = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > width) {
      out.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) out.push(line);
  return out;
}

const contentLines = lines.flatMap((line) => wrap(line));
let y = 760;
const streamParts = ["BT", "/F1 11 Tf", "50 760 Td", "14 TL"];
contentLines.forEach((line, index) => {
  if (index > 0) streamParts.push("T*");
  if (y < 64) return;
  const size = index === 0 ? 18 : 11;
  if (index === 0) streamParts.push(`/F1 ${size} Tf`);
  if (index === 1) streamParts.push("/F1 11 Tf");
  streamParts.push(`(${escapePdf(line)}) Tj`);
  y -= 14;
});
streamParts.push("ET");
const stream = streamParts.join("\n");

const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
];

let pdf = "%PDF-1.4\n";
const offsets = [0];
objects.forEach((object, index) => {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
});
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (let i = 1; i < offsets.length; i += 1) {
  pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

const outDir = path.resolve(__dirname, "../docs");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "approach.pdf"), pdf);
console.log("docs/approach.pdf");
