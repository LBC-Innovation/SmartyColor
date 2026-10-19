import Link from "next/link";

export default function SharedPageNotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 text-center">
      <div className="max-w-sm">
        <h1 className="text-xl font-semibold">This page isn&apos;t shared anymore</h1>
        <p className="mt-2 text-sm text-v2-muted">
          The person who shared it may have turned the link off.
        </p>
        <Link href="/?utm_source=share&utm_medium=page_link&utm_campaign=revoked_page" className="v2-btn-primary mt-5 inline-flex">
          Make your own from your photos
        </Link>
      </div>
    </main>
  );
}
