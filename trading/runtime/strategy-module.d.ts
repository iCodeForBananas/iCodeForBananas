// The deployment's strategy, resolved at bundle time: the stack aliases this
// module to app/strategies/<strategyId>.ts for each Lambda (lib/trading-stack.ts).
declare module '@trading/strategy' {
  import type { StrategyDefinition } from '@/app/strategies/types';
  const strategy: StrategyDefinition;
  export default strategy;
}
