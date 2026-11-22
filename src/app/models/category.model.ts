export interface Subcategory {
  name: string;
  slug: string;
}

export interface Category {
  _id: string;
  name: string;
  slug: string;
  subcategories: Subcategory[];
  deleted: boolean;
  deletedAt?: string | null;
  createdAt?: string;
}

export interface CategoryInput {
  name: string;
  slug: string;
  subcategories?: Subcategory[];
}