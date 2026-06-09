import type { Metadata } from 'next'
import DRMPage from './page-client'

export const metadata: Metadata = {
  title: 'DRM – Dating Relationship Manager',
  description: 'Track your dating pipeline with stage-based momentum scoring. From Talking to Partnership — know where things stand.',
  keywords: ['DRM', 'dating', 'relationship tracker', 'dating pipeline', 'momentum scoring'],
  openGraph: {
    title: 'DRM – Dating Relationship Manager',
    description: 'Track your dating pipeline with stage-based momentum scoring. From Talking to Partnership — know where things stand.',
    type: 'website',
  },
}

export default function DRMServerPage() {
  return <DRMPage />
}
