import type { Metadata } from 'next'
import TaskBoardPage from './page-client'

export const metadata: Metadata = {
  title: 'Task Board',
  description: 'A simple Kanban board for tracking tasks across Backlog, In Progress, and Done. Drag and drop to move tasks.',
  openGraph: { title: 'Task Board', description: 'A simple Kanban board for tracking tasks across Backlog, In Progress, and Done. Drag and drop to move tasks.', type: 'website' },
}

export default function TaskBoardServerPage() {
  return <TaskBoardPage />
}
