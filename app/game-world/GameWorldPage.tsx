import type { Metadata } from 'next'
import GameWorldPage from './page-client'

export const metadata: Metadata = {
  title: 'Game World',
  description: 'An interactive 3D game world experiment built with Three.js.',
  openGraph: { title: 'Game World', description: 'An interactive 3D game world experiment built with Three.js.', type: 'website' },
}

export default function GameWorldServerPage() {
  return <GameWorldPage />
}
