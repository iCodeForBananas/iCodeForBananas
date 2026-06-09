import type { Metadata } from 'next'
import WordsmithPage from './page-client'

export const metadata: Metadata = {
  title: 'Wordsmith',
  description: 'A writing and word exploration tool. Find synonyms, analyze text, and sharpen your prose.',
  openGraph: { title: 'Wordsmith', description: 'A writing and word exploration tool. Find synonyms, analyze text, and sharpen your prose.', type: 'website' },
}

export default function WordsmithServerPage() {
  return <WordsmithPage />
}
