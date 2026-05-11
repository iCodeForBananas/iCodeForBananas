export type Column = "backlog" | "in-progress" | "done";

export interface Task {
  id: string;
  title: string;
  body: string; // TipTap HTML
  column: Column;
  order: number;
  coverImage?: string; // first image extracted from body, cached
  createdAt: string;
  updatedAt: string;
}
