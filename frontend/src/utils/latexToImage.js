/**
 * High-quality MathJax LaTeX → PNG renderer
 * Supports: inline math, display math, fractions, integrals, Arabic text.
 * Output: Retina PNG Base64
 */

const SCALE = 4; // ← super-resolution (4x recommended)
const PADDING = 20; // extra whitespace trimming safety

export const latexToImage = async (latex, opts = {}) => {
  const {
    background = "transparent", // Can be: "transparent" or "#FFFFFF"
    scale = SCALE,
  } = opts;

  return new Promise(async (resolve, reject) => {
    try {
      // ---- 1) Render LaTeX → SVG element (MathJax v3 API)
      const svgNode = window.MathJax.tex2svg(latex, {
        display: true,
        em: 16,
        ex: 8,
      }).querySelector("svg");

      if (!svgNode) {
        return reject("MathJax failed to render the SVG.");
      }

      // ---- 2) Serialize SVG properly
      let svgString = new XMLSerializer().serializeToString(svgNode);

      // Fix SVG namespaces + ensure UTF-8 correctness
      svgString = svgString.replace(
        /^<svg/,
        `<svg xmlns="http://www.w3.org/2000/svg" version="1.1"`
      );

      // Add XML header (important for consistency)
      svgString = `<?xml version="1.0" encoding="UTF-8"?>\n` + svgString;

      const encodedSVG =
        "data:image/svg+xml;base64," +
        btoa(unescape(encodeURIComponent(svgString)));

      // ---- 3) Load SVG into <img> for rasterization
      const img = new Image();
      img.src = encodedSVG;

      img.onload = () => {
        // ---- 4) Create high-resolution canvas
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale + PADDING;
        canvas.height = img.height * scale + PADDING;
        const ctx = canvas.getContext("2d");

        // Background (optional)
        if (background !== "transparent") {
          ctx.fillStyle = background;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // ---- 5) Draw SVG → PNG
        ctx.drawImage(
          img,
          PADDING / 2,
          PADDING / 2,
          img.width * scale,
          img.height * scale
        );

        // ---- 6) Trim transparent borders (auto-crop)
        const cropped = autoCrop(canvas);

        resolve(cropped.toDataURL("image/png"));
      };

      img.onerror = (err) => {
        console.error("MathJax SVG failed to load:", err);
        reject("Failed to load rendered SVG.");
      };
    } catch (err) {
      console.error("Latex rendering error:", err);
      reject(err);
    }
  });
};

/**
 * Auto-crops transparent pixels around the formula
 */
const autoCrop = (canvas) => {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);

  let top = null;
  let bottom = null;
  let left = null;
  let right = null;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = imgData.data[(y * w + x) * 4 + 3];
      if (alpha > 0) {
        if (top === null) top = y;
        bottom = y;
        if (left === null || x < left) left = x;
        if (right === null || x > right) right = x;
      }
    }
  }

  // If empty (should never happen)
  if (top === null) return canvas;

  const cropped = document.createElement("canvas");
  const cw = right - left + 1;
  const ch = bottom - top + 1;

  cropped.width = cw;
  cropped.height = ch;

  const croppedCtx = cropped.getContext("2d");

  croppedCtx.putImageData(ctx.getImageData(left, top, cw, ch), 0, 0);

  return cropped;
};
