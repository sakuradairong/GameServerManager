export function PlaceholderPage({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="page-card">
      <h2 className="page-title">{title}</h2>
      <p className="page-desc">{description}</p>
    </div>
  )
}
