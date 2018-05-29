import { Category } from '@hyperbudget/hyperbudget-core';

export type SystemConfig = {
  preferences: {
    categories: Category[],
    report?: {
      category_ids: string[],
    }
  }
}