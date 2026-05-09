import yahooFinance from "yahoo-finance2";
import { PricePoint } from "../types";

export interface YahooQuote {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Fetches SPY historical data from Yahoo Finance
 * Note: Yahoo Finance only provides ~60 days of 5-minute data
 * @param symbol - Stock symbol (default: SPY)
 * @param period1 - Start date
 * @param period2 - End date
 * @param interval - Data interval (1m, 5m, 15m, 1h, 1d, etc)
 */
export async function fetchSPYData(
  symbol: string = "SPY",
  days: number = 60, // Maximum ~60 days for 5-minute data
  interval: "1m" | "5m" | "15m" | "1h" | "1d" = "5m",
): Promise<PricePoint[]> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    interface YFQuote {
      date: Date;
      open?: number;
      high?: number;
      low?: number;
      close?: number;
    }

    interface YFResult {
      quotes?: YFQuote[];
    }

    const result = (await yahooFinance.chart(symbol, {
      period1: startDate,
      period2: endDate,
      interval: interval,
    })) as YFResult;

    const quotes = result?.quotes || [];

    if (!quotes || quotes.length === 0) {
      throw new Error("No data received from Yahoo Finance");
    }

    // Convert Yahoo Finance data to our PricePoint format
    const pricePoints: PricePoint[] = quotes
      .filter((q) => q.open && q.high && q.low && q.close)
      .map((quote) => ({
        time: quote.date.getTime(),
        open: quote.open!,
        high: quote.high!,
        low: quote.low!,
        close: quote.close!,
      }));

    // Calculate SMAs
    return calculateSMAs(pricePoints);
  } catch (error) {
    console.error("Error fetching Yahoo Finance data:", error);
    throw error;
  }
}

/**
 * Calculate Simple Moving Averages for the data
 */
function calculateSMAs(data: PricePoint[], period: number = 20): PricePoint[] {
  return data.map((point, index) => {
    const result = { ...point };

    // Calculate Trailstop SMA
    if (index >= period - 1) {
      const lastN = data.slice(index - period + 1, index + 1);
      result.trailstopSma = lastN.reduce((sum, p) => sum + p.close, 0) / period;
    }

    return result;
  });
}

/**
 * Save data to localStorage for offline use
 */
export function saveSPYDataToCache(data: PricePoint[]): void {
  try {
    localStorage.setItem("spy_historical_data", JSON.stringify(data));
    localStorage.setItem("spy_data_timestamp", new Date().toISOString());
  } catch (error) {
    console.error("Error saving data to cache:", error);
  }
}

/**
 * Load data from localStorage cache
 */
export function loadSPYDataFromCache(): PricePoint[] | null {
  try {
    const cached = localStorage.getItem("spy_historical_data");
    const timestamp = localStorage.getItem("spy_data_timestamp");

    if (!cached || !timestamp) return null;

    // Check if cache is older than 1 day
    const cacheDate = new Date(timestamp);
    const now = new Date();
    const hoursSinceCache = (now.getTime() - cacheDate.getTime()) / (1000 * 60 * 60);

    if (hoursSinceCache > 24) {
      // Cache expired
      return null;
    }

    return JSON.parse(cached);
  } catch (error) {
    console.error("Error loading data from cache:", error);
    return null;
  }
}
