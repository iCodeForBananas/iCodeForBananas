import type { Metadata } from "next";
import BuildAWord from "./BuildAWord";

export const metadata: Metadata = {
  title: "Decode Dash",
  description: "Phonics learning game where kids tap phoneme tiles in the correct order to build words. Includes minimal pairs matching to sharpen early reading and decoding skills.",
  keywords: ["phonics game", "phoneme tiles", "build a word", "early reading", "minimal pairs", "kids literacy", "decode", "phonics practice"],
  openGraph: {
    title: "Decode Dash",
    description: "Phonics learning game where kids tap phoneme tiles to build words and sharpen decoding skills.",
    type: "website",
  },
};

export default BuildAWord;
