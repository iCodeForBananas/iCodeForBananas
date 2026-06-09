import type { Metadata } from 'next'
import GameWorldPageClient from './page-client'

export const metadata: Metadata = {
  title: 'Game World',
  description: 'An interactive 3D game world experiment built with Three.js.',
  keywords: ['game world', '3D', 'Three.js', 'interactive', 'WebGL', 'game'],
  openGraph: {
    title: 'Game World',
    description: 'An interactive 3D game world experiment built with Three.js.',
    type: 'website',
  },
}

export default function GameWorldPage() {
  return <GameWorldPageClient />
}
