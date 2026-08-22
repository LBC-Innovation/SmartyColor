import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { KidButton } from "@/components/KidButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <div className="mx-auto max-w-lg px-6 py-8">
        <AppHeader />
        <p className="mt-10 font-display text-2xl">
          Saving pictures needs an account connection.
        </p>
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-6 py-8">
        <AppHeader />
        <p className="mt-10 font-display text-2xl">
          Sign in to reopen pictures you already made.
        </p>
        <Link href="/sign-in" className="mt-6 inline-block">
          <KidButton>Sign in</KidButton>
        </Link>
      </div>
    );
  }

  const { data: sheets } = await supabase
    .from("generated_sheets")
    .select("id, title, image_path, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const withUrls = await Promise.all(
    (sheets ?? []).map(async (sheet) => {
      const { data } = await supabase.storage
        .from("sheets")
        .createSignedUrl(sheet.image_path, 60 * 60);
      return { ...sheet, url: data?.signedUrl ?? null };
    }),
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <AppHeader />
      <h1 className="mt-8 font-display text-4xl font-bold">Pictures I made</h1>
      {withUrls.length === 0 ? (
        <p className="mt-4 font-body text-xl text-ink-soft">
          None yet. Make a sheet, then it will live here.
        </p>
      ) : (
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {withUrls.map((sheet) => (
            <li
              key={sheet.id}
              className="overflow-hidden rounded-(--radius-card) border-[3px] border-ink bg-paper shadow-crayon"
            >
              {sheet.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sheet.url}
                  alt={sheet.title}
                  className="aspect-[3/4] w-full bg-white object-contain"
                />
              ) : null}
              <div className="p-4">
                <p className="font-display text-lg font-semibold">{sheet.title}</p>
                <a
                  href={sheet.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="font-body text-sm underline decoration-2"
                >
                  Open
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Link href="/" className="mt-8 inline-block">
        <KidButton>Make another</KidButton>
      </Link>
    </div>
  );
}
