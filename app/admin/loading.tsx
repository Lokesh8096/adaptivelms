export default function AdminLoading() {
  return (
    <div className="surface-card p-6 text-center">
      <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-[var(--border)] border-t-[var(--primary)]" />
      <p className="mt-3 text-sm muted-text">Loading admin pages...</p>
    </div>
  )
}
