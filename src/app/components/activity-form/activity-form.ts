import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import {
  Activity,
  ActivityCategory,
  ActivityInput,
  ActivityModality,
  ActivityStatus,
  ActivitySubcategory,
  Category,
  Subcategory,
} from '../../models';
import { ActivityService } from '../../services/activity.service';
import { CategoryService } from '../../services/category.service';
import { apiErrorMessage } from '../../utils/api-error';

interface AddressSuggestion {
  label: string;
  lat: number;
  lon: number;
}

function toLocalDateTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function validateSchedule(control: AbstractControl): ValidationErrors | null {
  const startTime = control.get('startTime')?.value;
  const endTime = control.get('endTime')?.value;
  if (!startTime || !endTime) return null;
  return new Date(endTime) > new Date(startTime) ? null : { invalidSchedule: true };
}

function validateCoordinatesPair(control: AbstractControl): ValidationErrors | null {
  const lat = control.get('latitude')?.value;
  const lng = control.get('longitude')?.value;
  const hasLat = lat !== null && lat !== undefined && lat !== '';
  const hasLng = lng !== null && lng !== undefined && lng !== '';
  if (hasLat === hasLng) return null;
  return { incompleteCoordinates: true };
}

function toSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

@Component({
  selector: 'app-activity-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './activity-form.html',
  styleUrl: './activity-form.css',
})
export class ActivityForm implements OnInit {
  private fb = inject(NonNullableFormBuilder);
  private activityService = inject(ActivityService);
  private categoryService = inject(CategoryService);
  private router = inject(Router);

  id = input<string>();
  loading = signal(false);
  saving = signal(false);
  geocoding = signal(false);
  loadFailed = signal(false);
  error = signal('');

  // Catálogo dinámico de categorías y estado de los desplegables
  categories = signal<Category[]>([]);
  selectedCategorySlug = signal<string>('');
  categoryMenuOpen = signal(false);
  subcategoryMenuOpen = signal(false);
  catalogBusy = signal(false);

  // Inputs inline para añadir categoría o subcategoría desde el propio desplegable
  newCategoryName = signal('');
  newSubcategoryName = signal('');

  // Autocompletado de direcciones
  addressSuggestions = signal<AddressSuggestion[]>([]);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  selectedCategory = computed(
    () => this.categories().find((c) => c.slug === this.selectedCategorySlug()) ?? null
  );

  availableSubcategories = computed<Subcategory[]>(
    () => this.selectedCategory()?.subcategories ?? []
  );

  readonly modalities: ActivityModality[] = ['CASUAL', 'ORGANIZED'];
  readonly statuses: ActivityStatus[] = ['OPEN', 'FULL', 'COMPLETED', 'CANCELLED'];

  form = this.fb.group(
    {
      title: ['', [Validators.required, Validators.minLength(2)]],
      description: ['', [Validators.required, Validators.minLength(5)]],
      category: ['' as ActivityCategory, Validators.required],
      subcategory: ['' as ActivitySubcategory, Validators.required],
      modality: ['CASUAL' as ActivityModality, Validators.required],
      status: ['OPEN' as ActivityStatus, Validators.required],
      addressName: ['', [Validators.required, Validators.minLength(3)]],
      latitude: this.fb.control<number | null>(null, [
        Validators.min(-90),
        Validators.max(90),
      ]),
      longitude: this.fb.control<number | null>(null, [
        Validators.min(-180),
        Validators.max(180),
      ]),
      startTime: ['', Validators.required],
      endTime: ['', Validators.required],
      minParticipants: this.fb.control(2, [Validators.required, Validators.min(1)]),
      maxParticipants: this.fb.control(2, [Validators.required, Validators.min(1)]),
      price: this.fb.control(0, [Validators.required, Validators.min(0)]),
      prizeInfo: [''],
    },
    { validators: [validateSchedule, validateCoordinatesPair] }
  );

  ngOnInit(): void {
    this.loadCategories();

    const id = this.id();
    if (!id) return;

    this.loading.set(true);
    this.activityService.getActivity(id).subscribe({
      next: ({ activity }) => {
        this.fillForm(activity);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(apiErrorMessage(err));
        this.loadFailed.set(true);
        this.loading.set(false);
      },
    });
  }

  private loadCategories(preferredCategorySlug?: string, preferredSubcategorySlug?: string): void {
    this.categoryService.getCategories({ limit: 100 }).subscribe({
      next: ({ data }) => {
        this.categories.set(data);
        if (data.length === 0) return;

        const targetCatSlug =
          preferredCategorySlug || this.form.controls.category.value || data[0].slug;
        const foundCat = data.find((c) => c.slug === targetCatSlug) ?? data[0];

        this.selectedCategorySlug.set(foundCat.slug);
        this.form.controls.category.setValue(foundCat.slug);

        const currentSub = preferredSubcategorySlug || this.form.controls.subcategory.value;
        const validSub = foundCat.subcategories.find((s) => s.slug === currentSub);
        const nextSubSlug = validSub ? validSub.slug : (foundCat.subcategories[0]?.slug ?? '');
        this.form.controls.subcategory.setValue(nextSubSlug);
      },
      error: (err: HttpErrorResponse) => this.error.set(apiErrorMessage(err)),
    });
  }

  selectCategory(category: Category): void {
    this.selectedCategorySlug.set(category.slug);
    this.form.controls.category.setValue(category.slug);
    const firstSub = category.subcategories[0]?.slug ?? '';
    this.form.controls.subcategory.setValue(firstSub);
    this.categoryMenuOpen.set(false);
  }

  selectSubcategory(subcategory: Subcategory): void {
    this.form.controls.subcategory.setValue(subcategory.slug);
    this.subcategoryMenuOpen.set(false);
  }

  createCategory(): void {
    const name = this.newCategoryName().trim();
    const slug = toSlug(name);
    if (name.length < 2 || !slug || this.catalogBusy()) return;

    this.catalogBusy.set(true);
    this.error.set('');
    this.categoryService.createCategory({ name, slug, subcategories: [] }).subscribe({
      next: ({ category }) => {
        this.newCategoryName.set('');
        this.catalogBusy.set(false);
        this.categoryMenuOpen.set(false);
        this.loadCategories(category.slug, '');
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(apiErrorMessage(err));
        this.catalogBusy.set(false);
      },
    });
  }

  createSubcategory(): void {
    const parent = this.selectedCategory();
    const name = this.newSubcategoryName().trim();
    const slug = toSlug(name);
    if (!parent || name.length < 2 || !slug || this.catalogBusy()) return;

    this.catalogBusy.set(true);
    this.error.set('');
    this.categoryService.addSubcategory(parent._id, { name, slug }).subscribe({
      next: () => {
        this.newSubcategoryName.set('');
        this.catalogBusy.set(false);
        this.subcategoryMenuOpen.set(false);
        this.loadCategories(parent.slug, slug);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(apiErrorMessage(err));
        this.catalogBusy.set(false);
      },
    });
  }

  archiveCategory(event: Event, category: Category): void {
    event.stopPropagation();
    if (this.catalogBusy()) return;

    this.catalogBusy.set(true);
    this.error.set('');
    this.categoryService.softDeleteCategory(category._id).subscribe({
      next: () => {
        this.catalogBusy.set(false);
        const isCurrent = this.selectedCategorySlug() === category.slug;
        this.loadCategories(isCurrent ? undefined : this.selectedCategorySlug());
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(apiErrorMessage(err));
        this.catalogBusy.set(false);
      },
    });
  }

  archiveSubcategory(event: Event, subcategory: Subcategory): void {
    event.stopPropagation();
    const parent = this.selectedCategory();
    if (!parent || this.catalogBusy()) return;

    this.catalogBusy.set(true);
    this.error.set('');
    this.categoryService.removeSubcategory(parent, subcategory.slug).subscribe({
      next: () => {
        this.catalogBusy.set(false);
        const isCurrent = this.form.controls.subcategory.value === subcategory.slug;
        this.loadCategories(parent.slug, isCurrent ? '' : this.form.controls.subcategory.value);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(apiErrorMessage(err));
        this.catalogBusy.set(false);
      },
    });
  }

  selectedCategoryLabel(): string {
    const found = this.selectedCategory();
    return found ? `${found.name} (${found.slug})` : 'Selecciona categoría...';
  }

  selectedSubcategoryLabel(): string {
    const slug = this.form.controls.subcategory.value;
    const found = this.availableSubcategories().find((s) => s.slug === slug);
    return found ? `${found.name} (${found.slug})` : 'Selecciona subcategoría...';
  }

  onAddressInput(value: string): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    const query = value.trim();
    if (query.length < 3) {
      this.addressSuggestions.set([]);
      return;
    }

    this.searchTimer = setTimeout(() => {
      this.geocoding.set(true);
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`;

      fetch(url)
        .then((res) => res.json())
        .then((data: {
          features?: {
            geometry: { coordinates: [number, number] };
            properties: {
              name?: string;
              street?: string;
              housenumber?: string;
              postcode?: string;
              city?: string;
              town?: string;
              village?: string;
              state?: string;
            };
          }[];
        }) => {
          const items: AddressSuggestion[] = (data.features ?? []).map((f) => {
            const p = f.properties;
            const streetPart = [p.street || p.name, p.housenumber].filter(Boolean).join(' ');
            const cityPart = p.city || p.town || p.village || '';
            const label = [streetPart, p.postcode, cityPart, p.state]
              .filter(Boolean)
              .join(', ');
            return {
              label: label || query,
              lon: Number(f.geometry.coordinates[0].toFixed(6)),
              lat: Number(f.geometry.coordinates[1].toFixed(6)),
            };
          });
          this.addressSuggestions.set(items);
        })
        .catch(() => {
          this.addressSuggestions.set([]);
        })
        .finally(() => {
          this.geocoding.set(false);
        });
    }, 350);
  }

  selectAddressSuggestion(item: AddressSuggestion): void {
    this.form.patchValue({
      addressName: item.label,
      latitude: item.lat,
      longitude: item.lon,
    });
    this.addressSuggestions.set([]);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const values = this.form.getRawValue();
    const hasCoordinates = values.latitude !== null && values.longitude !== null;

    const payload: ActivityInput = {
      title: values.title.trim(),
      description: values.description.trim(),
      category: values.category,
      subcategory: values.subcategory,
      modality: values.modality,
      status: values.status,
      location: {
        type: 'Point',
        ...(hasCoordinates ? { coordinates: [values.longitude!, values.latitude!] } : {}),
        addressName: values.addressName.trim(),
        isStoreLocation: false,
      },
      schedule: {
        startTime: new Date(values.startTime).toISOString(),
        endTime: new Date(values.endTime).toISOString(),
      },
      capacity: {
        minParticipants: values.minParticipants,
        maxParticipants: values.maxParticipants,
      },
      pricing: {
        price: values.price,
        prizeInfo: values.prizeInfo.trim(),
      },
    };

    const id = this.id();
    this.saving.set(true);
    this.error.set('');
    const request = id
      ? this.activityService.updateActivity(id, payload)
      : this.activityService.createActivity(payload);
    request.subscribe({
      next: () => this.router.navigate(['/activities'], { replaceUrl: true }),
      error: (err: HttpErrorResponse) => {
        this.error.set(apiErrorMessage(err));
        this.saving.set(false);
      },
    });
  }

  private fillForm(activity: Activity): void {
    this.selectedCategorySlug.set(activity.category);
    this.form.patchValue({
      title: activity.title,
      description: activity.description,
      category: activity.category,
      subcategory: activity.subcategory,
      modality: activity.modality,
      status: activity.status,
      addressName: activity.location.addressName,
      latitude: activity.location.coordinates?.[1] ?? null,
      longitude: activity.location.coordinates?.[0] ?? null,
      startTime: toLocalDateTime(activity.schedule.startTime),
      endTime: toLocalDateTime(activity.schedule.endTime),
      minParticipants: activity.capacity.minParticipants,
      maxParticipants: activity.capacity.maxParticipants,
      price: activity.pricing.price,
      prizeInfo: activity.pricing.prizeInfo ?? '',
    });
  }
}