import type { Metadata } from "next";
import TradingEquityContent from "./TradingEquityContent";

export const metadata: Metadata = {
  title: "Trading Equity",
  description: "Live equity curves of the paper-trading strategies, each indexed to $10,000.",
  openGraph: {
    title: "Trading Equity",
    description: "Live equity curves of the paper-trading strategies, each indexed to $10,000.",
    type: "website",
  },
};

export default function TradingEquityPage() {
  return <TradingEquityContent />;
}
