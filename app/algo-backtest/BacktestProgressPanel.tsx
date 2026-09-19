"use client";

import { useEffect, useState } from "react";
import { Button, Flex, Heading, Progress, Text } from "@radix-ui/themes";
import type { BacktestProgress } from "./useBacktestWorker";

const formatDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};

/**
 * What a running backtest is doing, counted in variations (one parameter set
 * on one dataset), since that's the unit the Run button promised. A per-dataset
 * count sat at 0 / 1 for the whole of a single-dataset run and looked frozen.
 */
export default function BacktestProgressPanel({
  progress,
  datasetLabel,
  onCancel,
}: {
  progress: BacktestProgress | null;
  datasetLabel: (file: string) => string;
  onCancel: () => void;
}) {
  // Re-render every second so elapsed time moves even between progress posts.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const total = progress?.total ?? 0;
  const completed = progress?.completed ?? 0;
  const fraction = total > 0 ? completed / total : 0;
  const percent = Math.floor(fraction * 100);
  const elapsed = progress ? now - progress.startedAt : 0;
  // Only estimate once there's enough done for the rate to mean something.
  const eta = fraction >= 0.02 && fraction < 1 ? (elapsed / fraction) * (1 - fraction) : null;

  const status = !progress || progress.phase === "starting"
    ? "Starting…"
    : progress.phase === "loading"
      ? `Loading ${datasetLabel(progress.currentDataset ?? "")} and computing indicators…`
      : `Testing ${progress.currentStrategy ?? "strategy"} on ${datasetLabel(progress.currentDataset ?? "")}`;

  return (
    <Flex flexGrow='1' align='center' justify='center' p='6'>
      <Flex direction='column' className='w-full max-w-md' role='status' aria-live='polite'>
        <Heading as='h2' size='4'>
          Running backtest
        </Heading>
        <Text size='2' color='gray' mt='1' truncate title={status}>
          {status}
        </Text>

        <Flex mt='5' align='baseline' justify='between' gap='4'>
          <Text size='6' weight='bold' className='tabular-nums'>
            {completed.toLocaleString()}
            <Text size='3' weight='regular' color='gray'>
              {" "}/ {total > 0 ? total.toLocaleString() : "…"} variations
            </Text>
          </Text>
          <Text size='3' weight='bold' color='amber' className='tabular-nums'>
            {percent}%
          </Text>
        </Flex>

        <Progress mt='2' size='2' value={fraction * 100} aria-label='Variations completed' />

        <Flex mt='2' justify='between' className='tabular-nums'>
          <Text size='1' color='gray'>
            {progress && progress.datasetCount > 1
              ? `Dataset ${Math.min(progress.datasetIndex + 1, progress.datasetCount)} of ${progress.datasetCount}`
              : "1 dataset"}
          </Text>
          <Text size='1' color='gray'>
            {formatDuration(elapsed)} elapsed{eta !== null ? ` · ~${formatDuration(eta)} left` : ""}
          </Text>
        </Flex>

        <Flex mt='6'>
          <Button variant='soft' color='gray' onClick={onCancel}>
            Cancel
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
}
