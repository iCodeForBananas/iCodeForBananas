"use client";

import React, { useState } from "react";

interface LambdaExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  strategyId: string;
  strategyName: string;
  params: Record<string, number | boolean | string>;
}

// Generate Lambda code for a given strategy with Tradier API
function generateLambdaCode(
  strategyId: string,
  strategyName: string,
  params: Record<string, number | boolean | string>
): string {
  const paramsJson = JSON.stringify(params, null, 2).replace(/\n/g, "\n  ");

  // Strategy-specific code templates
  const strategyLogic = getStrategyLogic(strategyId);

  return `// AWS Lambda Function for ${strategyName} Trading Strategy
// Uses Tradier API for market data and order execution
// Auto-generated from iCodeForBananas Algo Backtest

const https = require('https');

// Strategy Parameters
const STRATEGY_PARAMS = ${paramsJson};

// Tradier API Configuration (set these in Lambda environment variables)
const TRADIER_API_KEY = process.env.TRADIER_API_KEY;
const TRADIER_ACCOUNT_ID = process.env.TRADIER_ACCOUNT_ID;
const TRADIER_BASE_URL = process.env.TRADIER_SANDBOX === 'true' 
  ? 'sandbox.tradier.com' 
  : 'api.tradier.com';

// Trading Configuration
const SYMBOL = process.env.SYMBOL || 'SPY';
const POSITION_SIZE = parseInt(process.env.POSITION_SIZE || '100'); // Number of shares

// State tracking (use DynamoDB for persistence in production)
let lastSignal = 'hold';
let inPosition = false;

// Helper function to make Tradier API requests
function tradierRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: TRADIER_BASE_URL,
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': \`Bearer \${TRADIER_API_KEY}\`,
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(new URLSearchParams(data).toString());
    }
    req.end();
  });
}

// Get historical price data for indicators
async function getHistoricalData(symbol, days = 200) {
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const response = await tradierRequest(
    'GET',
    \`/v1/markets/history?symbol=\${symbol}&interval=daily&start=\${startDate}&end=\${endDate}\`
  );
  
  if (response.history && response.history.day) {
    return response.history.day.map(d => ({
      time: new Date(d.date).getTime(),
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volume
    }));
  }
  
  return [];
}

// Get current quote
async function getCurrentQuote(symbol) {
  const response = await tradierRequest('GET', \`/v1/markets/quotes?symbols=\${symbol}\`);
  
  if (response.quotes && response.quotes.quote) {
    const quote = response.quotes.quote;
    return {
      price: quote.last,
      bid: quote.bid,
      ask: quote.ask
    };
  }
  
  return null;
}

// Check current position
async function getPosition(symbol) {
  const response = await tradierRequest('GET', \`/v1/accounts/\${TRADIER_ACCOUNT_ID}/positions\`);
  
  if (response.positions && response.positions.position) {
    const positions = Array.isArray(response.positions.position) 
      ? response.positions.position 
      : [response.positions.position];
    
    return positions.find(p => p.symbol === symbol);
  }
  
  return null;
}

// Place a market order
async function placeOrder(symbol, side, quantity) {
  console.log(\`Placing \${side} order for \${quantity} shares of \${symbol}\`);
  
  const response = await tradierRequest('POST', \`/v1/accounts/\${TRADIER_ACCOUNT_ID}/orders\`, {
    class: 'equity',
    symbol: symbol,
    side: side, // 'buy' or 'sell'
    quantity: quantity.toString(),
    type: 'market',
    duration: 'day'
  });
  
  console.log('Order response:', JSON.stringify(response));
  return response;
}

// Calculate indicators
${strategyLogic.indicatorCode}

// Strategy signal logic
${strategyLogic.signalCode}

// Main Lambda handler
exports.handler = async (event) => {
  console.log('Strategy: ${strategyName}');
  console.log('Parameters:', JSON.stringify(STRATEGY_PARAMS));
  
  try {
    // Get historical data for indicator calculation
    const historicalData = await getHistoricalData(SYMBOL, 250);
    
    if (historicalData.length < 50) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Insufficient historical data' })
      };
    }
    
    // Calculate indicators
    const dataWithIndicators = calculateIndicators(historicalData);
    
    // Get current bar and previous bar
    const currentBar = dataWithIndicators[dataWithIndicators.length - 1];
    const previousBar = dataWithIndicators[dataWithIndicators.length - 2];
    
    // Generate signal
    const signal = getSignal(currentBar, previousBar, STRATEGY_PARAMS);
    console.log('Signal:', signal.action, '-', signal.reason);
    
    // Check current position
    const position = await getPosition(SYMBOL);
    inPosition = position && position.quantity > 0;
    
    let orderResult = null;
    
    // Execute trades based on signal
    if (signal.action === 'buy' && !inPosition) {
      orderResult = await placeOrder(SYMBOL, 'buy', POSITION_SIZE);
      lastSignal = 'buy';
    } else if (signal.action === 'sell' && inPosition) {
      const qty = position ? position.quantity : POSITION_SIZE;
      orderResult = await placeOrder(SYMBOL, 'sell', qty);
      lastSignal = 'sell';
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        strategy: '${strategyName}',
        symbol: SYMBOL,
        signal: signal,
        inPosition: inPosition,
        orderPlaced: orderResult !== null,
        orderResult: orderResult,
        currentPrice: currentBar.close,
        timestamp: new Date().toISOString()
      })
    };
    
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
`;
}

// Get strategy-specific indicator and signal code
function getStrategyLogic(
  strategyId: string
): { indicatorCode: string; signalCode: string } {
  switch (strategyId) {
    case "ema-crossover":
      return {
        indicatorCode: `function calculateIndicators(data) {
  const fastPeriod = STRATEGY_PARAMS.fastPeriod || 9;
  const slowPeriod = STRATEGY_PARAMS.slowPeriod || 21;
  const fastMultiplier = 2 / (fastPeriod + 1);
  const slowMultiplier = 2 / (slowPeriod + 1);
  
  let fastEma = data[0].close;
  let slowEma = data[0].close;
  
  return data.map((bar, i) => {
    if (i === 0) {
      fastEma = bar.close;
      slowEma = bar.close;
    } else {
      fastEma = (bar.close - fastEma) * fastMultiplier + fastEma;
      slowEma = (bar.close - slowEma) * slowMultiplier + slowEma;
    }
    
    return {
      ...bar,
      fastEma: fastEma,
      slowEma: slowEma
    };
  });
}`,
        signalCode: `function getSignal(current, previous, params) {
  if (!current.fastEma || !current.slowEma || !previous.fastEma || !previous.slowEma) {
    return { action: 'hold', reason: 'Waiting for EMAs' };
  }
  
  // Bullish crossover
  if (previous.fastEma <= previous.slowEma && current.fastEma > current.slowEma) {
    return { 
      action: 'buy', 
      reason: \`EMA \${params.fastPeriod} crossed above EMA \${params.slowPeriod}\` 
    };
  }
  
  // Bearish crossover
  if (previous.fastEma >= previous.slowEma && current.fastEma < current.slowEma) {
    return { 
      action: 'sell', 
      reason: \`EMA \${params.fastPeriod} crossed below EMA \${params.slowPeriod}\` 
    };
  }
  
  return { action: 'hold', reason: 'No crossover' };
}`,
      };

    case "sma-crossover":
      return {
        indicatorCode: `function calculateIndicators(data) {
  const fastPeriod = STRATEGY_PARAMS.fastPeriod || 50;
  const slowPeriod = STRATEGY_PARAMS.slowPeriod || 200;
  
  return data.map((bar, i) => {
    let fastSma = null;
    let slowSma = null;
    
    if (i >= fastPeriod - 1) {
      const fastSlice = data.slice(i - fastPeriod + 1, i + 1);
      fastSma = fastSlice.reduce((sum, b) => sum + b.close, 0) / fastPeriod;
    }
    
    if (i >= slowPeriod - 1) {
      const slowSlice = data.slice(i - slowPeriod + 1, i + 1);
      slowSma = slowSlice.reduce((sum, b) => sum + b.close, 0) / slowPeriod;
    }
    
    return {
      ...bar,
      fastSma: fastSma,
      slowSma: slowSma
    };
  });
}`,
        signalCode: `function getSignal(current, previous, params) {
  if (!current.fastSma || !current.slowSma || !previous.fastSma || !previous.slowSma) {
    return { action: 'hold', reason: 'Waiting for SMAs' };
  }
  
  // Golden Cross
  if (previous.fastSma <= previous.slowSma && current.fastSma > current.slowSma) {
    return { 
      action: 'buy', 
      reason: \`Golden Cross - SMA \${params.fastPeriod} crossed above SMA \${params.slowPeriod}\` 
    };
  }
  
  // Death Cross
  if (previous.fastSma >= previous.slowSma && current.fastSma < current.slowSma) {
    return { 
      action: 'sell', 
      reason: \`Death Cross - SMA \${params.fastPeriod} crossed below SMA \${params.slowPeriod}\` 
    };
  }
  
  return { action: 'hold', reason: 'No crossover' };
}`,
      };

    case "rsi-mean-reversion":
      return {
        indicatorCode: `function calculateIndicators(data) {
  const rsiPeriod = 14;
  let avgGain = 0;
  let avgLoss = 0;
  
  return data.map((bar, i) => {
    let rsi = null;
    
    if (i > 0) {
      const change = bar.close - data[i - 1].close;
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;
      
      if (i < rsiPeriod) {
        avgGain += gain;
        avgLoss += loss;
      } else if (i === rsiPeriod) {
        avgGain = avgGain / rsiPeriod;
        avgLoss = avgLoss / rsiPeriod;
      } else {
        avgGain = (avgGain * (rsiPeriod - 1) + gain) / rsiPeriod;
        avgLoss = (avgLoss * (rsiPeriod - 1) + loss) / rsiPeriod;
      }
      
      if (i >= rsiPeriod) {
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi = 100 - 100 / (1 + rs);
      }
    }
    
    return {
      ...bar,
      rsi: rsi
    };
  });
}`,
        signalCode: `function getSignal(current, previous, params) {
  const oversold = params.oversold || 30;
  const overbought = params.overbought || 70;
  
  if (current.rsi === null) {
    return { action: 'hold', reason: 'Waiting for RSI' };
  }
  
  // RSI oversold - BUY signal
  if (current.rsi < oversold) {
    return { 
      action: 'buy', 
      reason: \`RSI oversold (\${current.rsi.toFixed(1)} < \${oversold})\` 
    };
  }
  
  // RSI overbought - SELL signal
  if (current.rsi > overbought) {
    return { 
      action: 'sell', 
      reason: \`RSI overbought (\${current.rsi.toFixed(1)} > \${overbought})\` 
    };
  }
  
  return { action: 'hold', reason: 'RSI in neutral zone' };
}`,
      };

    case "macd-crossover":
      return {
        indicatorCode: `function calculateIndicators(data) {
  const fastPeriod = STRATEGY_PARAMS.fastPeriod || 12;
  const slowPeriod = STRATEGY_PARAMS.slowPeriod || 26;
  const signalPeriod = STRATEGY_PARAMS.signalPeriod || 9;
  
  const fastMult = 2 / (fastPeriod + 1);
  const slowMult = 2 / (slowPeriod + 1);
  const signalMult = 2 / (signalPeriod + 1);
  
  let fastEma = data[0].close;
  let slowEma = data[0].close;
  let signalEma = 0;
  
  return data.map((bar, i) => {
    if (i === 0) {
      fastEma = bar.close;
      slowEma = bar.close;
    } else {
      fastEma = (bar.close - fastEma) * fastMult + fastEma;
      slowEma = (bar.close - slowEma) * slowMult + slowEma;
    }
    
    const macd = fastEma - slowEma;
    
    if (i === 0) {
      signalEma = macd;
    } else {
      signalEma = (macd - signalEma) * signalMult + signalEma;
    }
    
    return {
      ...bar,
      macd: macd,
      macdSignal: signalEma,
      macdHistogram: macd - signalEma
    };
  });
}`,
        signalCode: `function getSignal(current, previous, params) {
  const histogramThreshold = params.histogramThreshold || 0;
  
  if (current.macd === undefined || current.macdSignal === undefined || 
      previous.macd === undefined || previous.macdSignal === undefined) {
    return { action: 'hold', reason: 'Waiting for MACD' };
  }
  
  // Bullish crossover
  if (previous.macd <= previous.macdSignal && current.macd > current.macdSignal) {
    if (current.macdHistogram >= histogramThreshold) {
      return { 
        action: 'buy', 
        reason: \`MACD crossed above signal (histogram: \${current.macdHistogram.toFixed(2)})\` 
      };
    }
  }
  
  // Bearish crossover
  if (previous.macd >= previous.macdSignal && current.macd < current.macdSignal) {
    if (current.macdHistogram <= -histogramThreshold) {
      return { 
        action: 'sell', 
        reason: \`MACD crossed below signal (histogram: \${current.macdHistogram.toFixed(2)})\` 
      };
    }
  }
  
  return { action: 'hold', reason: 'No MACD crossover' };
}`,
      };

    case "bollinger-bands":
      return {
        indicatorCode: `function calculateIndicators(data) {
  const period = STRATEGY_PARAMS.period || 20;
  const stdDevMultiplier = STRATEGY_PARAMS.stdDev || 2;
  
  return data.map((bar, i) => {
    let upperBand = null;
    let lowerBand = null;
    let middleBand = null;
    
    if (i >= period - 1) {
      const closes = data.slice(i - period + 1, i + 1).map(b => b.close);
      const sma = closes.reduce((a, b) => a + b, 0) / period;
      const variance = closes.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
      const std = Math.sqrt(variance);
      
      middleBand = sma;
      upperBand = sma + (stdDevMultiplier * std);
      lowerBand = sma - (stdDevMultiplier * std);
    }
    
    return {
      ...bar,
      upperBand: upperBand,
      middleBand: middleBand,
      lowerBand: lowerBand
    };
  });
}`,
        signalCode: `function getSignal(current, previous, params) {
  if (!current.upperBand || !current.lowerBand || !previous) {
    return { action: 'hold', reason: 'Waiting for Bollinger Bands' };
  }
  
  // Buy signal: price crosses below lower band
  if (previous.close > previous.lowerBand && current.close < current.lowerBand) {
    return { 
      action: 'buy', 
      reason: \`Price touched lower Bollinger Band (\${current.close.toFixed(2)} < \${current.lowerBand.toFixed(2)})\` 
    };
  }
  
  // Sell signal: price crosses above upper band
  if (previous.close < previous.upperBand && current.close > current.upperBand) {
    return { 
      action: 'sell', 
      reason: \`Price touched upper Bollinger Band (\${current.close.toFixed(2)} > \${current.upperBand.toFixed(2)})\` 
    };
  }
  
  return { action: 'hold', reason: 'Price within bands' };
}`,
      };

    case "donchian-channel":
      return {
        indicatorCode: `function calculateIndicators(data) {
  const period = STRATEGY_PARAMS.period || 20;
  
  return data.map((bar, i) => {
    let upperChannel = null;
    let lowerChannel = null;
    
    if (i >= period - 1) {
      const slice = data.slice(i - period + 1, i + 1);
      upperChannel = Math.max(...slice.map(b => b.high));
      lowerChannel = Math.min(...slice.map(b => b.low));
    }
    
    return {
      ...bar,
      upperChannel: upperChannel,
      lowerChannel: lowerChannel
    };
  });
}`,
        signalCode: `function getSignal(current, previous, params) {
  if (!current.upperChannel || !current.lowerChannel || !previous) {
    return { action: 'hold', reason: 'Waiting for Donchian Channel' };
  }
  
  // Buy signal: breakout above upper channel
  if (current.high > previous.upperChannel) {
    return { 
      action: 'buy', 
      reason: \`Breakout above Donchian upper channel (\${current.high.toFixed(2)} > \${previous.upperChannel.toFixed(2)})\` 
    };
  }
  
  // Sell signal: breakdown below lower channel
  if (current.low < previous.lowerChannel) {
    return { 
      action: 'sell', 
      reason: \`Breakdown below Donchian lower channel (\${current.low.toFixed(2)} < \${previous.lowerChannel.toFixed(2)})\` 
    };
  }
  
  return { action: 'hold', reason: 'Price within channel' };
}`,
      };

    case "breakout":
      return {
        indicatorCode: `function calculateIndicators(data) {
  const lookbackPeriod = STRATEGY_PARAMS.lookbackPeriod || 20;
  
  return data.map((bar, i) => {
    let resistanceLevel = null;
    let supportLevel = null;
    
    if (i >= lookbackPeriod) {
      const slice = data.slice(i - lookbackPeriod, i);
      resistanceLevel = Math.max(...slice.map(b => b.high));
      supportLevel = Math.min(...slice.map(b => b.low));
    }
    
    return {
      ...bar,
      resistance: resistanceLevel,
      support: supportLevel
    };
  });
}`,
        signalCode: `function getSignal(current, previous, params) {
  const breakoutThreshold = params.breakoutThreshold || 0;
  
  if (!current.resistance || !current.support) {
    return { action: 'hold', reason: 'Waiting for support/resistance levels' };
  }
  
  // Buy signal: breakout above resistance
  if (current.close > current.resistance + breakoutThreshold) {
    return { 
      action: 'buy', 
      reason: \`Breakout above resistance (\${current.close.toFixed(2)} > \${current.resistance.toFixed(2)})\` 
    };
  }
  
  // Sell signal: breakdown below support
  if (current.close < current.support - breakoutThreshold) {
    return { 
      action: 'sell', 
      reason: \`Breakdown below support (\${current.close.toFixed(2)} < \${current.support.toFixed(2)})\` 
    };
  }
  
  return { action: 'hold', reason: 'Price within range' };
}`,
      };

    default:
      return {
        indicatorCode: `function calculateIndicators(data) {
  // Default indicator calculation
  return data.map(bar => ({ ...bar }));
}`,
        signalCode: `function getSignal(current, previous, params) {
  // Custom strategy logic goes here
  return { action: 'hold', reason: 'No signal' };
}`,
      };
  }
}

// Generate AWS Lambda settings
function generateAWSSettings(strategyName: string): string {
  return `AWS Lambda Configuration for ${strategyName}
============================================

## Function Settings

Runtime: Node.js 20.x
Architecture: arm64 (Graviton2 - better price/performance)
Memory: 256 MB
Timeout: 30 seconds
Handler: index.handler

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| TRADIER_API_KEY | Your Tradier API access token | YOUR_API_KEY_HERE |
| TRADIER_ACCOUNT_ID | Your Tradier account ID | VA12345678 |
| TRADIER_SANDBOX | Use sandbox environment | true (for testing) |
| SYMBOL | Symbol to trade | SPY |
| POSITION_SIZE | Number of shares per trade | 100 |

## EventBridge (CloudWatch Events) Schedule

For market hours execution (M-F, 9:30 AM - 4:00 PM ET):

Schedule expression: cron(*/5 9-16 ? * MON-FRI *)
- Runs every 5 minutes during market hours
- Adjust frequency based on your strategy timeframe

For daily execution (after market close):
Schedule expression: cron(0 21 ? * MON-FRI *)
- Runs at 4:00 PM ET / 5:00 PM EDT (21:00 UTC) on weekdays
- Note: Adjust for daylight saving time if needed

## IAM Role Permissions

The Lambda execution role needs:
- AWSLambdaBasicExecutionRole (for CloudWatch Logs)
- Optional: DynamoDB access (if using for state persistence)

{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}

## Deployment Steps

1. Create a new Lambda function in AWS Console
2. Set the runtime to Node.js 20.x
3. Copy the generated code into the inline editor (or upload as .zip)
4. Configure environment variables with your Tradier credentials
5. Set up EventBridge trigger with desired schedule
6. Test with a manual invocation first (use sandbox mode)

## Production Considerations

- Use AWS Secrets Manager for API keys instead of environment variables
- Implement DynamoDB for state persistence across invocations
- Set up CloudWatch Alarms for monitoring
- Consider using Lambda@Edge for lower latency
- Implement proper error handling and retries
- Add SNS notifications for trade alerts

## Testing

1. Set TRADIER_SANDBOX=true for paper trading
2. Invoke manually from AWS Console
3. Check CloudWatch Logs for output
4. Verify no orders are placed (sandbox mode)
5. Switch to production after thorough testing

## Cost Estimation

With 5-minute intervals during market hours (78 invocations/day):
- ~1,560 invocations/month
- Lambda free tier: 1M requests/month
- Estimated monthly cost: < $1 (within free tier)
`;
}

export default function LambdaExportModal({
  isOpen,
  onClose,
  strategyId,
  strategyName,
  params,
}: LambdaExportModalProps) {
  const [activeTab, setActiveTab] = useState<"code" | "settings">("code");
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const lambdaCode = generateLambdaCode(strategyId, strategyName, params);
  const awsSettings = generateAWSSettings(strategyName);

  const handleCopy = async () => {
    const content = activeTab === "code" ? lambdaCode : awsSettings;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const content = activeTab === "code" ? lambdaCode : awsSettings;
    const filename =
      activeTab === "code"
        ? `${strategyId}-lambda.js`
        : `${strategyId}-aws-settings.txt`;
    const mimeType =
      activeTab === "code" ? "application/javascript" : "text/plain";

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div>
            <h2 className="text-xl font-bold text-white">
              Export AWS Lambda Code
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              {strategyName} with Tradier API Integration
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700">
          <button
            onClick={() => setActiveTab("code")}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === "code"
                ? "text-blue-400 border-b-2 border-blue-400 bg-slate-900"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Lambda Code
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === "settings"
                ? "text-blue-400 border-b-2 border-blue-400 bg-slate-900"
                : "text-slate-400 hover:text-white"
            }`}
          >
            AWS Settings
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-4">
          <div className="h-full bg-slate-900 rounded-lg overflow-hidden flex flex-col">
            {/* Code/Settings Display */}
            <pre className="flex-1 overflow-auto p-4 text-sm text-slate-300 font-mono whitespace-pre">
              {activeTab === "code" ? lambdaCode : awsSettings}
            </pre>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-4 border-t border-slate-700 bg-slate-850">
          <div className="text-xs text-slate-500">
            Parameters: {JSON.stringify(params)}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCopy}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center gap-2 transition-colors"
            >
              {copied ? (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                    />
                  </svg>
                  Copy
                </>
              )}
            </button>
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-2 transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Download {activeTab === "code" ? ".js" : ".txt"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
