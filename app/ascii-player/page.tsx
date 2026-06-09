import type { Metadata } from "next";
import AsciiPlayerPage from "./AsciiPlayerPage";

export const metadata: Metadata = {
  title: "ASCII Player",
  description: "Watch classic ASCII art movies in your browser — Rick Astley's Never Gonna Give You Up and Star Wars Episode IV rendered entirely in animated text characters.",
  keywords: ["ASCII art", "ASCII movie", "Rick Roll", "Star Wars ASCII", "text animation", "ASCII video", "terminal art"],
  openGraph: {
    title: "ASCII Player",
    description: "Watch ASCII art movies — Rick Roll and Star Wars Episode IV in pure text animation.",
    type: "website",
  },
};

export default AsciiPlayerPage;
