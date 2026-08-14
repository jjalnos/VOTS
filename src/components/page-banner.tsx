export function PageBanner({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <section className="page-banner">
      <div className="content-wrap">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </section>
  );
}
