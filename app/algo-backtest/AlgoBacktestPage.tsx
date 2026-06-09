import type { Metadata } from "next";
import AlgoBacktestPage from "./page-client";

export const metadata: Metadata = {
  title: "Algo Back Tester",
  description: "Backtest algorithmic trading strategies against real historical data. Compare momentum, moving average, and custom strategies.",
  keywords: ["algorithmic trading", "backtesting", "trading strategies", "momentum", "moving average", "quantitative trading"],
  openGraph: {
    title: "Algo Back Tester",
    description: "Backtest algorithmic trading strategies against real historical data. Compare momentum, moving average, and custom strategies.",
    type: "website",
  },
};

export default AlgoBacktestPage;
