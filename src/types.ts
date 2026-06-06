export type Category = "numeric" | "verbal" | "spatial";

export interface Question {
  id: string;
  image: string;
  type: string;
  category: Category;
  options: string[]; // always ["A","B","C","D"]
  correctIndex: number; // 0..3
}

export interface Answer {
  questionId: string;
  selectedIndex: number | null; // null = timed out / skipped
  correct: boolean;
  category: Category;
}

export type Phase = "start" | "question" | "results";
