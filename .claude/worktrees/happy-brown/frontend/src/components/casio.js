import { useEffect, useRef, useState } from "react";
import "./styles/CasioCalculator.css";

/**
 * Comprehensive Casio fx-570ES PLUS emulator
 * Now includes all functions from the physical calculator layout
 */

const BUTTON_LAYOUT = [
  // Row 1: Top function buttons
  ["SHIFT", "ALPHA", "MODE", "SETUP", "ON"],
  // Row 2: Scientific core functions
  ["OPTN", "x⁻¹", "x²", "^", "√"],
  // Row 3: Trigonometric functions
  ["sin", "cos", "tan", "° ' \"", "DRG►"],
  // Row 4: Logarithmic & Exponential
  ["ln", "log", "×10ˣ", "EXP"],
  // Row 5: Fractions, Combinations, Permutations
  ["a b/c", "nCr", "x!", "(", ")", ","],
  // Row 6: Variable & Memory Controls
  ["STO", "RCL", "ENG", "M+", "Ans"],
  // Row 7: Statistical & Base Operations
  ["DATA", "Σx", "Ran#", "→POL", "→REC"],
  // Row 8: Number row 1
  ["7", "8", "9", "DEL", "AC"],
  // Row 9: Number row 2
  ["4", "5", "6", "×", "÷"],
  // Row 10: Number row 3
  ["1", "2", "3", "+", "−"],
  // Row 11: Bottom row
  ["0", ".", "(−)", "=", "M-"],
  // Additional memory row
  ["MR", "MC", "HIST", "PreAns", "nPr"],
];

// Wolfram Alpha backend query function
async function queryWolframAlphaBackend(expression) {
  try {
    const res = await fetch("http://localhost:4000/api/wolfram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: expression }),
    });

    const data = await res.json();
    if (data?.result) return data.result;
    return "Error";
  } catch (err) {
    console.error("Backend API error:", err);
    return "Error";
  }
}

export default function CasioCalculator() {
  const [expr, setExpr] = useState("");
  const [display, setDisplay] = useState("");
  const [history, setHistory] = useState([]);
  const [shift, setShift] = useState(false);
  const [alpha, setAlpha] = useState(false);
  const [angleMode, setAngleMode] = useState("DEG"); // DEG, RAD, GRAD
  const [memory, setMemory] = useState(0);
  const [lastAns, setLastAns] = useState("");
  const [preAns, setPreAns] = useState("");
  const [numberSystem, setNumberSystem] = useState("DEC"); // DEC, HEX, BIN, OCT
  const [calculatorMode, setCalculatorMode] = useState("COMP"); // COMP, STAT, CMPLX, EQN, MATRIX, VECTOR, BASE-N, TABLE
  const [variables, setVariables] = useState({}); // Store variables A, B, C, D, E, F, X, Y, M
  const [statData, setStatData] = useState([]); // For STAT mode
  const [matrixData, setMatrixData] = useState({}); // For MATRIX mode
  const [vectorData, setVectorData] = useState({}); // For VECTOR mode
  const rootRef = useRef(null);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  // Initialize variables
  useEffect(() => {
    const initialVars = {};
    "ABCDEFXYM".split("").forEach((char) => {
      initialVars[char] = 0;
    });
    setVariables(initialVars);
  }, []);

  // Enhanced safe evaluator with all Casio functions
  const safeEvaluate = (inputStr) => {
    if (!inputStr || inputStr.trim() === "") return "";
    try {
      let s = String(inputStr);

      // Replace symbols
      s = s.replace(/·/g, ".");
      s = s.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");

      // Square root and cube root
      s = s.replace(/√\(/g, "Math.sqrt(");
      s = s.replace(/³√\(/g, "(x=>Math.cbrt(x))(");

      // Power functions
      s = s.replace(/(\d+(\.\d+)?)\^(\d+(\.\d+)?)/g, "Math.pow($1,$3)");
      s = s.replace(/x\^y/g, "^");
      s = s.replace(/x²/g, "**2");
      s = s.replace(/x³/g, "**3");
      s = s.replace(/x⁻¹/g, "**(-1)");

      // Factorial
      s = s.replace(/(\d+)!/g, (m, n) => {
        const ni = parseInt(n, 10);
        if (ni < 0 || ni > 170) throw new Error("Invalid factorial");
        let f = 1;
        for (let i = 2; i <= ni; i++) f *= i;
        return f;
      });

      // Combinations and Permutations
      s = s.replace(/(\d+) nCr (\d+)/g, (m, n, r) => {
        const nInt = parseInt(n, 10);
        const rInt = parseInt(r, 10);
        if (nInt < rInt || nInt < 0 || rInt < 0) throw new Error("Invalid nCr");
        return combination(nInt, rInt);
      });

      s = s.replace(/(\d+) nPr (\d+)/g, (m, n, r) => {
        const nInt = parseInt(n, 10);
        const rInt = parseInt(r, 10);
        if (nInt < rInt || nInt < 0 || rInt < 0) throw new Error("Invalid nPr");
        return permutation(nInt, rInt);
      });

      // Constants
      s = s.replace(/π/g, "Math.PI").replace(/e/g, "Math.E");

      // Angle conversion for trigonometric functions
      const toRadians = (angle) => {
        switch (angleMode) {
          case "DEG":
            return (angle * Math.PI) / 180;
          case "GRAD":
            return (angle * Math.PI) / 200;
          default:
            return angle; // RAD
        }
      };

      const fromRadians = (angle) => {
        switch (angleMode) {
          case "DEG":
            return (angle * 180) / Math.PI;
          case "GRAD":
            return (angle * 200) / Math.PI;
          default:
            return angle; // RAD
        }
      };

      // Trigonometric functions
      s = s.replace(/sin\(/g, `(x=>Math.sin(${toRadians.toString()}(x)))(`);
      s = s.replace(/cos\(/g, `(x=>Math.cos(${toRadians.toString()}(x)))(`);
      s = s.replace(/tan\(/g, `(x=>Math.tan(${toRadians.toString()}(x)))(`);

      // Inverse trigonometric functions
      s = s.replace(
        /sin⁻¹\(/g,
        `(x=>${fromRadians.toString()}(Math.asin(x)))(`
      );
      s = s.replace(
        /cos⁻¹\(/g,
        `(x=>${fromRadians.toString()}(Math.acos(x)))(`
      );
      s = s.replace(
        /tan⁻¹\(/g,
        `(x=>${fromRadians.toString()}(Math.atan(x)))(`
      );

      // Hyperbolic functions
      s = s.replace(/sinh\(/g, "Math.sinh(");
      s = s.replace(/cosh\(/g, "Math.cosh(");
      s = s.replace(/tanh\(/g, "Math.tanh(");

      // Logarithmic functions
      s = s.replace(/log\(/g, "Math.log10(");
      s = s.replace(/ln\(/g, "Math.log(");
      s = s.replace(/10\^/g, "(x=>10**x)(");
      s = s.replace(/e\^/g, "Math.exp(");

      // Special functions
      s = s.replace(/Ans/g, `(${Number(lastAns) || 0})`);
      s = s.replace(/PreAns/g, `(${Number(preAns) || 0})`);
      s = s.replace(/×10\^x/g, "*10**");
      s = s.replace(/EXP/g, "e+");

      // Percentages
      s = s.replace(/(\d+(\.\d+)?)%/g, "($1/100)");

      // Random number
      s = s.replace(/Ran#/g, Math.random().toString());

      // Variables
      Object.keys(variables).forEach((varName) => {
        const regex = new RegExp(`\\b${varName}\\b`, "g");
        s = s.replace(regex, variables[varName]);
      });

      // Security check
      if (/[^0-9+\-*/().,MathPIEabscintgxloygd_]/i.test(s)) {
        throw new Error("Invalid characters");
      }

      // Evaluate
      // eslint-disable-next-line no-new-func
      const val = new Function(`return ${s}`)();

      if (typeof val === "number") {
        return clampResultString(val);
      }
      return "Error";
    } catch (e) {
      console.error("Evaluation error:", e);
      return "Error";
    }
  };

  // Combination function nCr
  const combination = (n, r) => {
    if (r > n) return 0;
    if (r === 0 || r === n) return 1;
    r = Math.min(r, n - r);
    let result = 1;
    for (let i = 1; i <= r; i++) {
      result = (result * (n - i + 1)) / i;
    }
    return Math.round(result);
  };

  // Permutation function nPr
  const permutation = (n, r) => {
    if (r > n) return 0;
    let result = 1;
    for (let i = 0; i < r; i++) {
      result *= n - i;
    }
    return result;
  };

  // Fraction conversion
  const handleFraction = (input) => {
    if (input.includes(" ")) {
      const parts = input.split(" ");
      if (parts.length === 3) {
        const whole = parseInt(parts[0]) || 0;
        const fractionParts = parts[2].split("/");
        if (fractionParts.length === 2) {
          const numerator = parseInt(fractionParts[0]);
          const denominator = parseInt(fractionParts[1]);
          if (denominator !== 0) {
            return whole + numerator / denominator;
          }
        }
      }
    } else if (
      input.includes("/") &&
      !input.includes("nCr") &&
      !input.includes("nPr")
    ) {
      const parts = input.split("/");
      if (parts.length === 2) {
        const numerator = parseInt(parts[0]);
        const denominator = parseInt(parts[1]);
        if (denominator !== 0) {
          return numerator / denominator;
        }
      }
    }
    return "Error";
  };

  const clampResultString = (v) => {
    if (typeof v !== "number") return String(v);
    if (!isFinite(v)) return v > 0 ? "∞" : v < 0 ? "-∞" : "Error";
    const rounded = Math.round(v * 1e12) / 1e12;
    const s = String(rounded);
    if (s.length > 14) return v.toExponential(8);
    return s;
  };

  // Handle button press
  const press = (key) => {
    // Mode toggles
    if (key === "SHIFT") {
      setShift((s) => !s);
      return;
    }
    if (key === "ALPHA") {
      setAlpha((a) => !a);
      return;
    }
    if (key === "MODE") {
      // Cycle through calculator modes
      const modes = [
        "COMP",
        "STAT",
        "CMPLX",
        "EQN",
        "MATRIX",
        "VECTOR",
        "BASE-N",
        "TABLE",
      ];
      const currentIndex = modes.indexOf(calculatorMode);
      setCalculatorMode(modes[(currentIndex + 1) % modes.length]);
      return;
    }
    if (key === "SETUP") {
      // Cycle through angle modes
      const angleModes = ["DEG", "RAD", "GRAD"];
      const currentIndex = angleModes.indexOf(angleMode);
      setAngleMode(angleModes[(currentIndex + 1) % angleModes.length]);
      return;
    }
    if (key === "ON") {
      // Reset
      setExpr("");
      setDisplay("");
      setHistory([]);
      setShift(false);
      setAlpha(false);
      setLastAns("");
      setPreAns("");
      setMemory(0);
      setCalculatorMode("COMP");
      setNumberSystem("DEC");
      // Reset variables
      const resetVars = {};
      "ABCDEFXYM".split("").forEach((char) => {
        resetVars[char] = 0;
      });
      setVariables(resetVars);
      return;
    }

    // Clear functions
    if (key === "DEL") {
      setExpr((e) => e.slice(0, -1));
      setDisplay("");
      return;
    }
    if (key === "AC") {
      setExpr("");
      setDisplay("");
      return;
    }

    // Equals with Wolfram fallback
    if (key === "=") {
      const res = safeEvaluate(expr);

      if (res === "Error" || res === "" || res === undefined) {
        setDisplay("Calculating…");
        queryWolframAlphaBackend(expr).then((wolframRes) => {
          const final = wolframRes || "Error";
          setDisplay(final);
          if (final !== "Error") {
            setPreAns(lastAns);
            setLastAns(final);
            setHistory((h) => [...h.slice(-7), `${expr} = ${final}`]);
            setExpr(String(final));
          }
        });
      } else {
        setDisplay(res);
        if (res !== "Error") {
          setPreAns(lastAns);
          setLastAns(res);
          setHistory((h) => [...h.slice(-7), `${expr} = ${res}`]);
          setExpr(String(res));
        }
      }
      return;
    }

    // Memory functions
    if (key === "M+") {
      const val = Number(safeEvaluate(expr));
      if (!isNaN(val)) {
        setMemory((m) => m + val);
        setVariables((vars) => ({ ...vars, M: vars.M + val }));
      }
      return;
    }
    if (key === "M-") {
      const val = Number(safeEvaluate(expr));
      if (!isNaN(val)) {
        setMemory((m) => m - val);
        setVariables((vars) => ({ ...vars, M: vars.M - val }));
      }
      return;
    }
    if (key === "MR") {
      setExpr((p) => p + "M");
      return;
    }
    if (key === "MC") {
      setMemory(0);
      setVariables((vars) => ({ ...vars, M: 0 }));
      return;
    }

    // Special functions
    if (key === "Ans") {
      setExpr((prev) => prev + "Ans");
      return;
    }
    if (key === "PreAns") {
      setExpr((prev) => prev + "PreAns");
      return;
    }
    if (key === "RCL") {
      // Recall variable - show variable selection
      setDisplay("Recall A,B,C,D,E,F,X,Y,M");
      return;
    }
    if (key === "ENG") {
      // Engineering notation toggle
      return;
    }
    if (key === "DRG►") {
      // Cycle angle modes
      const angleModes = ["DEG", "RAD", "GRAD"];
      const currentIndex = angleModes.indexOf(angleMode);
      setAngleMode(angleModes[(currentIndex + 1) % angleModes.length]);
      return;
    }
    if (key === "° ' \"") {
      // Degree-minute-second input
      setExpr((prev) => prev + "°");
      return;
    }
    if (key === "HIST") {
      const last = history[history.length - 1];
      if (last) {
        const lastAns = last.split(" = ")[1];
        if (lastAns) setExpr(String(lastAns));
      }
      return;
    }
    if (key === "OPTN") {
      // Option menu for advanced functions
      setDisplay("OPTN: Calc, ∫, d/dx, etc.");
      return;
    }
    if (key === "DATA") {
      // Enter data in STAT mode
      if (calculatorMode === "STAT") {
        const val = safeEvaluate(expr);
        if (val !== "Error") {
          setStatData((prev) => [...prev, Number(val)]);
          setDisplay(`Data[${statData.length + 1}]: ${val}`);
          setExpr("");
        }
      }
      return;
    }
    if (key === "Σx") {
      // Sum of data in STAT mode
      if (calculatorMode === "STAT" && statData.length > 0) {
        const sum = statData.reduce((a, b) => a + b, 0);
        setDisplay(`Σx = ${sum}`);
      }
      return;
    }
    if (key === "→POL" || key === "→REC") {
      // Coordinate conversion (placeholder)
      setDisplay(`${key} - Enter x,y`);
      return;
    }
    if (key === "a b/c") {
      // Fraction input
      setExpr((prev) => prev + " ");
      return;
    }

    // Handle variable storage
    if (key === "STO" && alpha) {
      const val = safeEvaluate(expr);
      if (val !== "Error") {
        setDisplay("Store to A,B,C,D,E,F,X,Y,M");
      }
      return;
    }

    // SHIFT alternate functions
    if (shift) {
      const shiftMap = {
        sin: "sin⁻¹",
        cos: "cos⁻¹",
        tan: "tan⁻¹",
        ln: "e^",
        log: "10^",
        "x²": "x³",
        "x⁻¹": "x!",
        "√": "³√",
        "^": "x√y",
        nCr: "nPr",
        "a b/c": "d/c",
        STO: "RCL",
        ENG: "←ENG→",
        "DRG►": "DRG►", // Same in shift
        "° ' \"": "° ' \"", // Same in shift
      };
      if (shiftMap[key]) {
        setExpr((p) => p + shiftMap[key]);
        setShift(false);
        return;
      }
    }

    // ALPHA alternate functions (variables and hyperbolic)
    if (alpha) {
      const alphaMap = {
        sin: "sinh",
        cos: "cosh",
        tan: "tanh",
        STO: "A", // When STO is pressed in ALPHA mode, it's for variable input
      };

      // Variable assignment
      if ("ABCDEFXYM".includes(key)) {
        const val = safeEvaluate(expr);
        if (val !== "Error") {
          setVariables((vars) => ({ ...vars, [key]: Number(val) }));
          setDisplay(`${key} = ${val}`);
          setExpr("");
          setAlpha(false);
          return;
        }
      }

      if (alphaMap[key]) {
        setExpr((p) => p + alphaMap[key]);
        setAlpha(false);
        return;
      }
    }

    // Default: append key
    setExpr((p) => p + key);
    setDisplay("");
  };

  // Keyboard support
  const handleKeyDown = (e) => {
    if (/^[0-9]$/.test(e.key)) {
      setExpr((p) => p + e.key);
      return;
    }
    if (e.key === "Enter") {
      press("=");
      return;
    }
    if (e.key === "Backspace") {
      press("DEL");
      return;
    }
    if (e.key === "+") {
      setExpr((p) => p + "+");
      return;
    }
    if (e.key === "-") {
      setExpr((p) => p + "−");
      return;
    }
    if (e.key === "*") {
      setExpr((p) => p + "×");
      return;
    }
    if (e.key === "/") {
      setExpr((p) => p + "÷");
      return;
    }
    if (e.key === ".") {
      setExpr((p) => p + ".");
      return;
    }
    if (e.key === "p" && e.altKey) {
      setExpr((p) => p + "π");
      return;
    }
    if (e.key === "e" && e.altKey) {
      setExpr((p) => p + "e");
      return;
    }
    if (e.key === "s" && e.shiftKey) {
      setShift(true);
      return;
    }
    if (e.key === "a" && e.shiftKey) {
      setAlpha(true);
      return;
    }
  };

  const renderButton = (k) => {
    const getButtonClass = () => {
      if (k === "=") return "btn-eq";
      if (k === "DEL" || k === "AC") return "btn-func";
      if (/\d|\.|\(−\)/.test(k)) return "btn-num";
      if (
        /sin|cos|tan|log|ln|√|\^|x²|x⁻¹|Ans|nCr|nPr|Σx|DATA|→POL|→REC/.test(k)
      )
        return "btn-sci";
      if (k === "SHIFT" || k === "ALPHA" || k === "MODE" || k === "SETUP")
        return "btn-mode";
      if (k === "STO" || k === "RCL" || k === "ENG" || k === "OPTN")
        return "btn-mem";
      return "btn-func";
    };

    return (
      <button
        key={k}
        onClick={() => press(k)}
        className={`calc-btn ${getButtonClass()} ${
          k === "SHIFT" && shift ? "active" : ""
        } ${k === "ALPHA" && alpha ? "active-alpha" : ""}`}
        aria-label={k}
      >
        {k}
      </button>
    );
  };

  return (
    <div
      tabIndex={0}
      ref={rootRef}
      onKeyDown={handleKeyDown}
      className="casio-shell"
      aria-label="Casio fx-570ES PLUS emulator"
    >
      {/* Top branding */}
      <div className="casio-topbar">
        <div className="casio-logo">CASIO</div>
        <div className="model">fx-570ES PLUS</div>
        <div className="natural">NATURAL-V.P.A.M.</div>
      </div>

      {/* Screen area */}
      <div className="screen-area">
        <div className="solar-panel" />
        <div className="lcd">
          <div className="lcd-content">
            {/* Replay pad */}
            <div className="replay-pad">
              <div className="replay-circle" />
              <div className="replay-arrows">
                <span>◀</span>
                <span>▶</span>
              </div>
            </div>

            {/* Main display */}
            <div className="lcd-text">
              <div className="status-line">
                <span className={`mode-indicator ${shift ? "active" : ""}`}>
                  S
                </span>
                <span className={`mode-indicator ${alpha ? "active" : ""}`}>
                  A
                </span>
                <span className="calc-mode">{calculatorMode}</span>
                <span className="number-system">{numberSystem}</span>
                <span className="angle-mode">{angleMode}</span>
              </div>
              <div className="expr-line">{expr || " "}</div>
              <div className="res-line">{display || (expr ? "" : "0")}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Indicators */}
      <div className="indicators">
        <div className="mode-indicators">
          <span className={calculatorMode === "COMP" ? "active" : ""}>
            COMP
          </span>
          <span className={calculatorMode === "STAT" ? "active" : ""}>
            STAT
          </span>
          <span className={calculatorMode === "CMPLX" ? "active" : ""}>
            CMPLX
          </span>
          <span className={calculatorMode === "EQN" ? "active" : ""}>EQN</span>
          <span className={calculatorMode === "MATRIX" ? "active" : ""}>
            MATRIX
          </span>
          <span className={calculatorMode === "VECTOR" ? "active" : ""}>
            VECTOR
          </span>
          <span className={calculatorMode === "BASE-N" ? "active" : ""}>
            BASE-N
          </span>
          <span className={calculatorMode === "TABLE" ? "active" : ""}>
            TABLE
          </span>
        </div>
      </div>

      {/* Keyboard */}
      <div className="keyboard-wrapper">
        <div className="keyboard">
          {BUTTON_LAYOUT.map((row, idx) => (
            <div key={idx} className="kb-row">
              {row.map((k) => (
                <div key={k} className="kb-cell">
                  {renderButton(k)}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Memory and variable display */}
        <div className="memory-strip">
          <div className="mem-display">
            M: {Number(memory).toExponential(4)} | Ans: {lastAns || "0"} |
            PreAns: {preAns || "0"}
          </div>
          <div className="variables-display">
            {Object.entries(variables)
              .slice(0, 4)
              .map(([key, value]) => (
                <span key={key} className="var-item">
                  {key}: {Number(value).toFixed(2)}
                </span>
              ))}
          </div>
          <div className="history-preview">
            {history.length > 0 ? (
              <div className="hist-item">{history[history.length - 1]}</div>
            ) : (
              <div className="hist-item empty">No history</div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="casio-footer">
        <div className="brand-row">
          <div className="brand-txt">SCIENTIFIC CALCULATOR</div>
        </div>
      </div>
    </div>
  );
}
