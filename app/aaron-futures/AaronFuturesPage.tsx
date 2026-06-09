"use client";

import { useEffect, useRef, useState } from "react";
import { Permanent_Marker } from "next/font/google";
import styles from "./aaron-futures.module.css";

const permanentMarker = Permanent_Marker({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-permanent-marker",
  display: "swap",
});

type PlayState = "main" | "intro" | "play";

const INTRO_MS = 14_300;
const COUNT_TICK_MS = 6000;
const BILLBOARD_TICK_MS = 10_000;

function Billboard() {
  const [currentImage, setCurrentImage] = useState(1);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      setCurrentImage(1 + Math.floor(Math.random() * 13));
      timeoutId = setTimeout(tick, BILLBOARD_TICK_MS);
    };
    tick();
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className={styles.buildingBillboard}>
      <div
        className={styles.buildingBillboardViewer}
        style={{ backgroundImage: `url(/aaron-futures/images/${currentImage}.gif)` }}
      />
    </div>
  );
}

function Fireworks() {
  return (
    <div className={styles.pyro}>
      <div className={styles.before} />
      <div className={styles.after} />
    </div>
  );
}

function MainMenu({ onStart, playState }: { onStart: () => void; playState: PlayState }) {
  return (
    <div
      className={`${styles.centerContainer} ${
        playState === "intro" ? styles.centerContainerZoomed : ""
      }`}
      onClick={onStart}
    >
      <svg
        className={`${styles.triangle} ${styles.triangle1} ${styles.centerContents}`}
        height="300"
        width="350"
      >
        <polygon points="0,300 175,0 350,300" />
      </svg>
      <svg
        className={`${styles.triangle} ${styles.triangle2} ${styles.centerContents}`}
        height="300"
        width="350"
      >
        <polygon points="0,300 175,0 350,300" />
      </svg>
      <svg
        className={`${styles.triangle} ${styles.triangle3} ${styles.centerContents}`}
        height="300"
        width="350"
      >
        <polygon points="0,300 175,0 350,300" />
      </svg>
      <h1 className={`${styles.spinText} ${styles.centerContents}`}>Aaron Futures</h1>
    </div>
  );
}

function MusicVideo({ count }: { count: number }) {
  return (
    <>
      <Fireworks />

      <div className={styles.scoreCounter}>{count} FUTURES</div>

      <div className={styles.moon} />

      <div className={styles.skyline}>
        <div className={styles.building1Shadow} />
        <div className={styles.building1}>
          <Billboard />
          <div className={styles.buildingLeftHalf} />
          <div className={styles.buildingRightHalf} />
        </div>
      </div>

      <div className={styles.road}>
        <div className={styles.roadTopHalf} />
      </div>

      <div className={styles.carContainer}>
        <div className={styles.carTop1}>
          <div className={styles.window1} />
          <div className={styles.window2} />
        </div>
        <div className={styles.carTop2}>
          <div className={styles.door}>
            <div className={styles.doorKnob} />
          </div>
        </div>
        <div>
          <div className={styles.wheel1Top} />
          <div className={styles.wheel1}>
            <div className={styles.wheelDot1} />
            <div className={styles.wheelDot2} />
            <div className={styles.wheelDot3} />
            <div className={styles.wheelDot4} />
          </div>

          <div className={styles.wheel2Top} />
          <div className={styles.wheel2}>
            <div className={styles.wheelDot1} />
            <div className={styles.wheelDot2} />
            <div className={styles.wheelDot3} />
            <div className={styles.wheelDot4} />
          </div>
          <div className={styles.carAaron} />
        </div>
      </div>
    </>
  );
}

export default function AaronFuturesPage() {
  const [playState, setPlayState] = useState<PlayState>("main");
  const [count, setCount] = useState(0);
  const introTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const countTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleStart = () => {
    if (playState !== "main") return;
    setPlayState("intro");
    introTimer.current = setTimeout(() => {
      setPlayState("play");
      const tick = () => {
        setCount((c) => c + 1);
        countTimer.current = setTimeout(tick, COUNT_TICK_MS);
      };
      countTimer.current = setTimeout(tick, COUNT_TICK_MS);
    }, INTRO_MS);
  };

  useEffect(
    () => () => {
      if (introTimer.current) clearTimeout(introTimer.current);
      if (countTimer.current) clearTimeout(countTimer.current);
    },
    [],
  );

  return (
    <div className={`${styles.aaronFuturesRoot} ${permanentMarker.variable}`}>
      {playState !== "main" && (
        <audio loop autoPlay src="/aaron-futures/song.mp3" />
      )}
      {playState === "play" ? (
        <MusicVideo count={count} />
      ) : (
        <MainMenu onStart={handleStart} playState={playState} />
      )}
    </div>
  );
}
