let loadingPromise = null;

export function loadMathJax() {
  // If MathJax already exists, we're done
  if (window.MathJax && window.MathJax.typesetPromise) {
    return Promise.resolve(window.MathJax);
  }

  // Prevent duplicate loads across components/routes
  if (loadingPromise) return loadingPromise;

  // Configure BEFORE the script loads
  window.MathJax = {
    tex: {
      inlineMath: [
        ["$", "$"],
        ["\\(", "\\)"],
      ],
    },
    svg: { fontCache: "global" },
  };

  loadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js";
    script.async = true; // not render-blocking
    script.onload = () => resolve(window.MathJax);
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return loadingPromise;
}
