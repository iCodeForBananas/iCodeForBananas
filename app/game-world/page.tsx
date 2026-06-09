import type { Metadata } from 'next'
import dynamic from 'next/dynamic'

const GameWorldPageClient = dynamic(() => import('./page-client'), { ssr: false })

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

export default GameWorldPageClient
