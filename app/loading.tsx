export default function GlobalLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="surface-card p-6 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[var(--border)] border-t-[var(--primary)]" />
        <p className="mt-3 text-sm muted-text">Loading page...</p>
      </div>
    </div>
  )
}
