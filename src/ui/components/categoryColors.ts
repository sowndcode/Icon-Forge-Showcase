// One quiet colour dot per asset category, the same in Home, Import and the library filter.
// Categories are listed in a stable order (categoriesOf), so a category keeps its colour.

export const CATEGORY_COLORS = ['#f2b33d', '#3ecf8e', '#5b9cf5', '#ef6aa8', '#a283f2', '#f0874a', '#45c6d3', '#c3d45a'];

export function categoryColor(index: number): string {
  return index < 0 ? 'var(--text-3)' : CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}
