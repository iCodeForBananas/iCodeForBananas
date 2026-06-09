import type { Metadata } from 'next'
import WordsmithPage from './page-client'

export const metadata: Metadata = {
  title: 'Wordsmith',
  description: 'A writing and word exploration tool for crafting better prose. Find synonyms, analyze text, and sharpen your writing.',
  keywords: ['wordsmith', 'writing', 'synonyms', 'text analysis', 'prose', 'word tools'],
  openGraph: {
    title: 'Wordsmith',
    description: 'A writing and word exploration tool for crafting better prose. Find synonyms, analyze text, and sharpen your writing.',
    type: 'website',
  },
}

export default function WordsmithServerPage() {
  return <WordsmithPage />
}
