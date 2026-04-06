import React, { useState, useEffect, useRef, useContext } from "react";
import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import axios from "axios";
import { DashboardContext } from "../../../../context/DashboardContext";
import { useAuthContext } from "../../../../context/AuthContext";

// Stock tickers
const stockSymbols = [
  "AAPL",
  "META",
  "AMZN",
  "NFLX",
  "GOOGL",
  "MSFT",
  "TSLA",
  "NVDA",
  "BRK-B",
  "JPM",
  "V",
  "JNJ",
  "WMT",
  "UNH",
  "PG",
];

const timeRanges = ["5y", "3y", "1y", "6mo", "3mo", "1mo", "7d", "1d"];
const allButtons = [...timeRanges, "predict"];

export default function StatisticsChart() {
  const { user } = useAuthContext();
  const { profileData } = useContext(DashboardContext); // currently unused, can be used later
  const [range, setRange] = useState<string>("1y");
  const [selectedSymbol, setSelectedSymbol] = useState<string>("AAPL");
  const [categories, setCategories] = useState<string[]>([]);
  const [data, setData] = useState<number[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null); // Used for chart export

  const fetchData = async (period: string, symbol: string) => {
    try {
      if (period === "predict") {
        const { data: predData } = await axios.get(
          "http://localhost:8000/predict",
          {
            params: { symbol },
          }
        );
        if (
          !Array.isArray(predData.dates) ||
          !Array.isArray(predData.predicted)
        )
          return;

        setCategories(predData.dates);
        setData(predData.predicted);
      } else {
        const { data: histRes } = await axios.get(
          "http://localhost:8000/historical",
          {
            params: { symbol, period },
          }
        );

        const histData = histRes.data;
        const grouped: Record<string, number> = {};

        for (const entry of histData) {
          const rawDate = entry.date ?? entry.timestamp ?? entry.Date;
          const close = entry.close ?? entry.Close;
          if (!rawDate || close === undefined) continue;

          const date = new Date(rawDate);
          if (isNaN(date.getTime())) continue;

          const label =
            period === "1d"
              ? date.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : date.toLocaleDateString("en-US");

          grouped[label] = close;
        }

        setCategories(Object.keys(grouped));
        setData(Object.values(grouped));
      }
    } catch (err) {
      console.error("❌ Data fetch error:", err);
    }
  };

  useEffect(() => {
    fetchData(range, selectedSymbol);
  }, [range, selectedSymbol]);

  const exportChart = () => {
    const chart = chartRef.current?.chart;
    chart?.dataURI().then(({ imgURI }) => {
      const link = document.createElement("a");
      link.href = imgURI;
      link.download = `${selectedSymbol}-${range}-chart.png`;
      link.click();
    });
  };

  const options: ApexOptions = {
    colors: ["#465FFF"],
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "area" as const,
      height: 310,
      toolbar: { show: false },
    },
    stroke: { curve: "smooth", width: 2 },
    fill: { type: "gradient", gradient: { opacityFrom: 0.55, opacityTo: 0 } },
    markers: { size: 0, hover: { size: 5 } },
    grid: {
      yaxis: { lines: { show: true } },
      xaxis: { lines: { show: false } },
    },
    dataLabels: { enabled: false },
    tooltip: {
      x: { format: "d M yy H:m" },
      y: { formatter: (val: number) => val.toFixed(2) },
    },
    xaxis: {
      type: "category",
      categories,
      labels: {
        style: { fontSize: "11px", colors: ["#6B7280"] },
        rotate: -45,
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: { style: { fontSize: "12px", colors: ["#6B7280"] } },
    },
  };

  const series = [{ name: "Close Price", data }];

  const scrollLeft = () =>
    scrollRef.current?.scrollBy({ left: -200, behavior: "smooth" });
  const scrollRight = () =>
    scrollRef.current?.scrollBy({ left: 200, behavior: "smooth" });

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <div className="flex flex-col gap-5 mb-6 sm:flex-row sm:justify-between">
        <div className="w-full">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            📈 Stock Statistics for {selectedSymbol}
          </h3>
          <p className="mt-1 text-gray-500 text-sm dark:text-gray-400">
            Welcome {user?.username}, view historical data or forecast 15-day
            predictions.
          </p>
        </div>

        <div
          className="flex items-center gap-2 overflow-x-auto custom-scrollbar"
          ref={scrollRef}
        >
          <button onClick={scrollLeft} className="text-lg px-2">
            ←
          </button>
          {stockSymbols.map((sym) => (
            <button
              key={sym}
              onClick={() => setSelectedSymbol(sym)}
              className={`text-sm px-3 py-1 rounded-full border ${
                sym === selectedSymbol
                  ? "bg-green-600 text-white"
                  : "text-gray-600 border-gray-300 hover:bg-gray-100"
              }`}
            >
              {sym}
            </button>
          ))}
          <button onClick={scrollRight} className="text-lg px-2">
            →
          </button>
        </div>

        <div className="flex items-center flex-wrap sm:justify-end gap-2 w-full">
          {allButtons.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`text-sm px-3 py-1 rounded-full border ${
                r === range
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 border-gray-300 hover:bg-gray-100"
              }`}
            >
              {r === "predict" ? "📊 PREDICT" : r.toUpperCase()}
            </button>
          ))}
          <button
            onClick={exportChart}
            className="text-sm px-3 py-1 rounded-full border border-blue-400 text-blue-600 hover:bg-blue-50"
          >
            📤 Export PNG
          </button>
        </div>
      </div>

      <div className="max-w-full overflow-x-auto custom-scrollbar">
        <div className="min-w-[1000px] xl:min-w-full">
          <Chart
            options={options}
            series={series}
            type="area"
            height={310}
            ref={chartRef}
          />
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8 text-sm text-gray-700 dark:text-gray-200">
        {[
          [
            "📊 Multi-symbol Tracking",
            "Switch between 15 top stocks instantly.",
          ],
          ["📅 Range-Based Views", "Choose from 1 day to 5 years."],
          ["📈 Real-time Updates", "Coming soon with WebSocket integration."],
          ["📤 Export Reports", "Download charts as CSV or PNG."],
          ["🧩 Scrollable Selector", "Smooth ticker bar experience."],
          ["📌 Favorites", "Mark symbols to track on dashboard."],
          [
            "📊 Portfolio Visualizer",
            "Coming soon: your total stock allocations.",
          ],
          ["💹 Value Calculator", "Estimate investment returns."],
          ["📆 Custom Range Picker", "Drag-select timeframes."],
          ["🧾 Trade History", "Track your recent decisions."],
        ].map(([title, desc]) => (
          <div
            key={title}
            className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md shadow"
          >
            <h4 className="font-semibold mb-1">{title}</h4>
            <p className="text-gray-600 dark:text-gray-300">{desc}</p>
          </div>
        ))}

        {[
          ["🤖 AI Predictions", "15-day machine learning forecast."],
          ["📌 Confidence Levels", "High/medium/low prediction certainty."],
          ["💡 News-Based AI", "Use headlines to influence insights."],
          ["📈 Volatility Alerts", "Get alerts for rapid changes."],
          ["🎯 Goal Suggestions", "AI suggests goals based on profile."],
          ["🧠 Symbol Suggestions", "AI recommends new stock ideas."],
          [
            "📊 Pattern Detection",
            "Chart pattern auto-detection (coming soon).",
          ],
          ["🪙 Crypto + Stock Mix", "AI analysis from mixed asset input."],
          ["📉 Risk Estimator", "Shows your risk per stock."],
          ["📥 AI Highlights", "Daily report of all model signals."],
        ].map(([title, desc]) => (
          <div
            key={title}
            className="bg-green-50 dark:bg-green-900 p-4 rounded-md shadow"
          >
            <h4 className="font-semibold mb-1">{title}</h4>
            <p className="text-gray-600 dark:text-gray-200">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
