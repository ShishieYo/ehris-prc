export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4">
      <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-brand-900">Page not found</h1>
        <p className="mt-2 text-sm text-slate-600">
          The page doesn&apos;t exist, or you don&apos;t have access to it. If you think this is a mistake, contact HR Support.
        </p>
        <a href="/dashboard" className="mt-4 inline-block rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">Go to dashboard</a>
      </div>
    </main>
  );
}
