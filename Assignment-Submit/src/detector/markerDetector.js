const jpeg = require("jpeg-js");
const { fromByteArray, toByteArray } = require("base64-js");

const OUTPUT_SIZE = 300;
const DETECT_SIZE = 720;
const MIN_COMPONENT_AREA = 1200;

function isBlack(r, g, b) {
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  const contrast = Math.max(r, g, b) - Math.min(r, g, b);
  return luminance < 175 && contrast < 115;
}

function isAlertRed(r, g, b) {
  return r > 165 && g < 80 && b < 90;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function decodeJpegBase64(base64) {
  const bytes = toByteArray(base64.replace(/^data:image\/\w+;base64,/, ""));
  return jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 256 });
}

function encodeJpegBase64(rawImageData) {
  const encoded = jpeg.encode(rawImageData, 92);
  return fromByteArray(encoded.data);
}

function sampleBlackMask(image) {
  const scale = Math.max(image.width, image.height) / DETECT_SIZE;
  const width = Math.max(1, Math.round(image.width / scale));
  const height = Math.max(1, Math.round(image.height / scale));
  const mask = new Uint8Array(width * height);
  const luminances = [];

  for (let y = 0; y < height; y += 2) {
    const sy = clamp(Math.round(y * scale), 0, image.height - 1);
    for (let x = 0; x < width; x += 2) {
      const sx = clamp(Math.round(x * scale), 0, image.width - 1);
      const i = (sy * image.width + sx) * 4;
      luminances.push(0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2]);
    }
  }

  luminances.sort((a, b) => a - b);
  const darkPercentile = luminances[Math.floor(luminances.length * 0.18)] || 80;
  const adaptiveThreshold = clamp(darkPercentile + 42, 120, 205);

  for (let y = 0; y < height; y += 1) {
    const sy = clamp(Math.round(y * scale), 0, image.height - 1);
    for (let x = 0; x < width; x += 1) {
      const sx = clamp(Math.round(x * scale), 0, image.width - 1);
      const i = (sy * image.width + sx) * 4;
      const luminance = 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2];
      const isDark = luminance < adaptiveThreshold && !isAlertRed(image.data[i], image.data[i + 1], image.data[i + 2]);
      mask[y * width + x] = isDark ? 1 : 0;
    }
  }

  return { mask, width, height, scale };
}

function findLargestComponent(maskData) {
  const { mask, width, height, scale } = maskData;
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let best = null;

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;

    let head = 0;
    let tail = 0;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    const extremes = {
      tl: { score: Infinity, x: 0, y: 0 },
      tr: { score: -Infinity, x: 0, y: 0 },
      br: { score: -Infinity, x: 0, y: 0 },
      bl: { score: Infinity, x: 0, y: 0 }
    };

    queue[tail] = start;
    tail += 1;
    visited[start] = 1;

    while (head < tail) {
      const index = queue[head];
      head += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      const tlScore = x + y;
      const trScore = x - y;
      const brScore = x + y;
      const blScore = x - y;
      if (tlScore < extremes.tl.score) extremes.tl = { score: tlScore, x, y };
      if (trScore > extremes.tr.score) extremes.tr = { score: trScore, x, y };
      if (brScore > extremes.br.score) extremes.br = { score: brScore, x, y };
      if (blScore < extremes.bl.score) extremes.bl = { score: blScore, x, y };

      const neighbors = [index - 1, index + 1, index - width, index + width];
      for (const next of neighbors) {
        if (next < 0 || next >= mask.length || visited[next] || !mask[next]) continue;
        if ((next === index - 1 && x === 0) || (next === index + 1 && x === width - 1)) continue;
        visited[next] = 1;
        queue[tail] = next;
        tail += 1;
      }
    }

    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const aspect = boxWidth / boxHeight;
    const fill = area / (boxWidth * boxHeight);
    const candidate = { area, boxWidth, boxHeight, aspect, fill, extremes };

    if (
      area >= MIN_COMPONENT_AREA &&
      aspect > 0.55 &&
      aspect < 1.8 &&
      fill > 0.08 &&
      fill < 0.55 &&
      (!best || area > best.area)
    ) {
      best = candidate;
    }
  }

  if (!best) return null;

  const toSource = (point) => ({
    x: clamp((point.x + 0.5) * scale, 0, maskData.sourceWidth || Number.MAX_VALUE),
    y: clamp((point.y + 0.5) * scale, 0, maskData.sourceHeight || Number.MAX_VALUE)
  });

  return {
    area: best.area,
    aspect: best.aspect,
    fill: best.fill,
    corners: [
      toSource(best.extremes.tl),
      toSource(best.extremes.tr),
      toSource(best.extremes.br),
      toSource(best.extremes.bl)
    ]
  };
}

function solveLinearSystem(matrix, values) {
  const n = values.length;
  const a = matrix.map((row, i) => [...row, values[i]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-9) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];

    const divisor = a[col][col];
    for (let k = col; k <= n; k += 1) a[col][k] /= divisor;

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let k = col; k <= n; k += 1) a[row][k] -= factor * a[col][k];
    }
  }

  return a.map((row) => row[n]);
}

function perspectiveCoefficients(corners) {
  const dest = [
    [0, 0],
    [OUTPUT_SIZE - 1, 0],
    [OUTPUT_SIZE - 1, OUTPUT_SIZE - 1],
    [0, OUTPUT_SIZE - 1]
  ];
  const matrix = [];
  const values = [];

  for (let i = 0; i < 4; i += 1) {
    const [u, v] = dest[i];
    const { x, y } = corners[i];
    matrix.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    values.push(x);
    matrix.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    values.push(y);
  }

  return solveLinearSystem(matrix, values);
}

function samplePixel(image, x, y) {
  const ix = clamp(Math.round(x), 0, image.width - 1);
  const iy = clamp(Math.round(y), 0, image.height - 1);
  const offset = (iy * image.width + ix) * 4;
  return [
    image.data[offset],
    image.data[offset + 1],
    image.data[offset + 2],
    image.data[offset + 3]
  ];
}

function hasBlackNear(image, x, y, radius) {
  const cx = Math.round(x);
  const cy = Math.round(y);
  for (let yy = cy - radius; yy <= cy + radius; yy += 1) {
    if (yy < 0 || yy >= image.height) continue;
    for (let xx = cx - radius; xx <= cx + radius; xx += 1) {
      if (xx < 0 || xx >= image.width) continue;
      const offset = (yy * image.width + xx) * 4;
      if (isBlack(image.data[offset], image.data[offset + 1], image.data[offset + 2])) return true;
    }
  }
  return false;
}

function edgeContinuity(image, corners) {
  const scores = [];
  const radius = Math.max(3, Math.round(Math.max(image.width, image.height) / 500));
  for (let i = 0; i < 4; i += 1) {
    const start = corners[i];
    const end = corners[(i + 1) % 4];
    let hits = 0;
    let total = 0;
    for (let step = 4; step <= 56; step += 1) {
      const t = step / 60;
      const x = start.x + (end.x - start.x) * t;
      const y = start.y + (end.y - start.y) * t;
      if (hasBlackNear(image, x, y, radius)) hits += 1;
      total += 1;
    }
    scores.push(hits / total);
  }
  return {
    valid: Math.min(...scores) > 0.72,
    scores
  };
}

function warpMarker(image, corners) {
  const coefficients = perspectiveCoefficients(corners);
  if (!coefficients) return null;
  const [a, b, c, d, e, f, g, h] = coefficients;
  const data = new Uint8Array(OUTPUT_SIZE * OUTPUT_SIZE * 4);

  for (let y = 0; y < OUTPUT_SIZE; y += 1) {
    for (let x = 0; x < OUTPUT_SIZE; x += 1) {
      const denominator = g * x + h * y + 1;
      const sx = (a * x + b * y + c) / denominator;
      const sy = (d * x + e * y + f) / denominator;
      const [r, gg, bb, aa] = samplePixel(image, sx, sy);
      const offset = (y * OUTPUT_SIZE + x) * 4;
      data[offset] = r;
      data[offset + 1] = gg;
      data[offset + 2] = bb;
      data[offset + 3] = aa;
    }
  }

  return { data, width: OUTPUT_SIZE, height: OUTPUT_SIZE };
}

function rotateImage(image, turns) {
  let current = image;
  for (let turn = 0; turn < turns; turn += 1) {
    const data = new Uint8Array(current.data.length);
    for (let y = 0; y < OUTPUT_SIZE; y += 1) {
      for (let x = 0; x < OUTPUT_SIZE; x += 1) {
        const source = (y * OUTPUT_SIZE + x) * 4;
        const nx = OUTPUT_SIZE - 1 - y;
        const ny = x;
        const target = (ny * OUTPUT_SIZE + nx) * 4;
        data[target] = current.data[source];
        data[target + 1] = current.data[source + 1];
        data[target + 2] = current.data[source + 2];
        data[target + 3] = current.data[source + 3];
      }
    }
    current = { data, width: OUTPUT_SIZE, height: OUTPUT_SIZE };
  }
  return current;
}

function blackRatio(image, x0, y0, x1, y1) {
  let black = 0;
  let total = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * OUTPUT_SIZE + x) * 4;
      if (isBlack(image.data[offset], image.data[offset + 1], image.data[offset + 2])) black += 1;
      total += 1;
    }
  }
  return total ? black / total : 0;
}

function redRatio(image, x0, y0, x1, y1) {
  let red = 0;
  let total = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * OUTPUT_SIZE + x) * 4;
      if (isAlertRed(image.data[offset], image.data[offset + 1], image.data[offset + 2])) red += 1;
      total += 1;
    }
  }
  return total ? red / total : 0;
}

function orientMarker(image) {
  const zones = [
    blackRatio(image, 34, 34, 86, 86),
    blackRatio(image, 214, 34, 266, 86),
    blackRatio(image, 214, 214, 266, 266),
    blackRatio(image, 34, 214, 86, 266)
  ];
  const maxIndex = zones.indexOf(Math.max(...zones));
  const turnsToTopLeft = [0, 3, 2, 1][maxIndex];
  return { image: rotateImage(image, turnsToTopLeft), orientationScore: zones[maxIndex], zones };
}

function validateMarker(image, orientationScore) {
  const top = blackRatio(image, 0, 0, OUTPUT_SIZE, 28);
  const bottom = blackRatio(image, 0, 272, OUTPUT_SIZE, OUTPUT_SIZE);
  const left = blackRatio(image, 0, 0, 28, OUTPUT_SIZE);
  const right = blackRatio(image, 272, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  const center = blackRatio(image, 105, 105, 195, 195);
  const topLeftFinder = blackRatio(image, 34, 34, 86, 86);
  const topRightFinder = blackRatio(image, 214, 34, 266, 86);
  const bottomRightFinder = blackRatio(image, 214, 214, 266, 266);
  const bottomLeftFinder = blackRatio(image, 34, 214, 86, 266);
  const bottomRightAlert = redRatio(image, 190, 180, 285, 270);

  const sides = [top, bottom, left, right];
  const sideScore = sides.reduce((sum, value) => sum + value, 0) / sides.length;
  const falseFinderScore = Math.max(topRightFinder, bottomRightFinder, bottomLeftFinder);
  const valid =
    sideScore > 0.52 &&
    Math.min(...sides) > 0.42 &&
    topLeftFinder > 0.34 &&
    orientationScore > 0.34 &&
    falseFinderScore < 0.28 &&
    bottomRightAlert < 0.008 &&
    center < 0.5;

  return {
    valid,
    score: Number((sideScore * 0.65 + topLeftFinder * 0.35).toFixed(3)),
    metrics: {
      top,
      bottom,
      left,
      right,
      center,
      topLeftFinder,
      falseFinderScore,
      bottomRightAlert
    }
  };
}

function detectMarkerFromRaw(image) {
  const startedAt = Date.now();
  const maskData = sampleBlackMask(image);
  maskData.sourceWidth = image.width - 1;
  maskData.sourceHeight = image.height - 1;
  const component = findLargestComponent(maskData);
  if (!component) {
    return { ok: false, reason: "No square marker candidate found", durationMs: Date.now() - startedAt };
  }

  const continuity = edgeContinuity(image, component.corners);
  if (!continuity.valid) {
    return {
      ok: false,
      reason: "Candidate border is incomplete",
      edgeScores: continuity.scores,
      durationMs: Date.now() - startedAt
    };
  }

  const warped = warpMarker(image, component.corners);
  if (!warped) {
    return { ok: false, reason: "Perspective transform failed", durationMs: Date.now() - startedAt };
  }

  const oriented = orientMarker(warped);
  const validation = validateMarker(oriented.image, oriented.orientationScore);
  if (!validation.valid) {
    return {
      ok: false,
      reason: "Candidate did not match Marker 1 geometry",
      score: validation.score,
      metrics: validation.metrics,
      durationMs: Date.now() - startedAt
    };
  }

  return {
    ok: true,
    image: oriented.image,
    base64: encodeJpegBase64(oriented.image),
    score: validation.score,
    metrics: validation.metrics,
    corners: component.corners,
    durationMs: Date.now() - startedAt
  };
}

function detectMarkerFromJpegBase64(base64) {
  return detectMarkerFromRaw(decodeJpegBase64(base64));
}

module.exports = {
  detectMarkerFromJpegBase64,
  detectMarkerFromRaw
};
