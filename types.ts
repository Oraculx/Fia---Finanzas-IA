
export type Category = 
  | 'Alimentación' 
  | 'Transporte' 
  | 'Vivienda' 
  | 'Entretenimiento' 
  | 'Salud' 
  | 'Educación' 
  | 'Otros';

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  category: Category;
  date: string;
  type: 'income' | 'expense';
}

export interface AIAnalysis {
  summary: string;
  recommendations: string[];
  savingsPotential: string;
}
