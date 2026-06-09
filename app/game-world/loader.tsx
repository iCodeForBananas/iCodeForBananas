'use client'

import dynamic from 'next/dynamic'

const GameWorldPageClient = dynamic(() => import('./page-client'), { ssr: false })

export default GameWorldPageClient
