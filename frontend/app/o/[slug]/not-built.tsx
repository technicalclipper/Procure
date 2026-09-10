import Link from "next/link";

/**
 * Placeholder for routes in the nav that aren't built yet.
 *
 * Better than a 404: it says what the page will do and where it sits in
 * the flow, so navigating the app doesn't feel broken while it's in
 * progress.
 */
export function NotBuilt({
  title,
  description,
  step,
  slug,
}: {
  title: string;
  description: string;
  step: string;
  slug: string;
}) {
  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-7">
        <h1 className="text-[19px] font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-[13px] text-slate-500">{description}</p>
      </header>

      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
        <div className="text-[13px] font-medium text-slate-900">
          Not built yet
        </div>
        <p className="mx-auto mt-1 max-w-md text-[12px] text-slate-500">
          {step}
        </p>
        <div className="mt-5 flex justify-center gap-4 text-[12px]">
          <Link
            href={`/o/${slug}`}
            className="text-indigo-600 underline-offset-2 hover:underline"
          >
            Back to overview
          </Link>
          <Link
            href={`/o/${slug}/settings/departments`}
            className="text-indigo-600 underline-offset-2 hover:underline"
          >
            Departments &amp; budgets
          </Link>
        </div>
      </div>
    </div>
  );
}
