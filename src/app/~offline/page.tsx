import { AppHeader } from "@/components/AppHeader";

export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1120px] flex-col px-6 py-6 sm:px-8 sm:py-8">
      <AppHeader />
      <main className="mt-16 flex flex-1 flex-col items-center gap-4 text-center">
        <h1 className="font-display text-3xl font-bold text-ink">
          You&apos;re offline
        </h1>
        <p className="max-w-md font-body text-lg text-ink-soft">
          SmartyColor needs the internet to chat and make new sheets. Your saved
          idea on this device is still here when you reconnect.
        </p>
      </main>
    </div>
  );
}
