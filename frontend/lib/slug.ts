/**
 * Pure slug helpers.
 *
 * Deliberately in their own module with no imports: client components need
 * slugify for the live URL preview, and pulling it from lib/org.ts would
 * drag Prisma and pg into the browser bundle.
 */

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
