import type { Metadata } from 'next';
import TerritoryGame from './TerritoryGame';

export const metadata: Metadata = {
  title: 'Territory | iCodeForBananas',
  description: 'Real-time multiplayer territory control game',
};

export default function TerritoryPage() {
  return <TerritoryGame />;
}
