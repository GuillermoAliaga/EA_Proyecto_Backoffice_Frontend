import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { Category, CategoryInput, PageParams, PaginatedResponse, Subcategory } from '../models';
import { toHttpParams } from '../utils/page-params';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/categories`;

  getCategories(params: PageParams = { limit: 100 }): Observable<PaginatedResponse<Category>> {
    return this.http.get<PaginatedResponse<Category>>(this.apiUrl, {
      params: toHttpParams({ ...params, search: params.search?.trim() }),
    });
  }

  createCategory(payload: CategoryInput): Observable<{ category: Category }> {
    return this.http.post<{ category: Category }>(this.apiUrl, payload);
  }

  addSubcategory(categoryId: string, payload: Subcategory): Observable<{ category: Category }> {
    return this.http.post<{ category: Category }>(`${this.apiUrl}/${categoryId}/subcategories`, payload);
  }

  updateCategory(id: string, payload: Partial<CategoryInput>): Observable<{ category: Category }> {
    return this.http.put<{ category: Category }>(`${this.apiUrl}/${id}`, payload);
  }

  // Borrado lógico de una categoría completa
  softDeleteCategory(id: string): Observable<void> {
    return this.http.patch<void>(`${this.apiUrl}/${id}/soft-delete`, {});
  }

  // Borrado lógico de una subcategoría suelta actualizando el array de la categoría padre
  removeSubcategory(category: Category, subcategorySlug: string): Observable<{ category: Category }> {
    const remaining = category.subcategories.filter((s) => s.slug !== subcategorySlug);
    return this.updateCategory(category._id, { subcategories: remaining });
  }
}