type PageHeadingProps = { title: string; description: string }

export function PageHeading({ title, description }: PageHeadingProps) {
  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-4 leading-7 text-muted-foreground">{description}</p>
    </div>
  )
}
