export type Column = "backlog" | "in-progress" | "done";

export interface Task {
  id: string;
  user_id: string;
  title: string;
  body: string; // TipTap HTML
  board_column: Column;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
