import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main id="main-content" className="page-main">
      <section className="page-banner"><div className="content-wrap"><p className="eyebrow">Access boundary / Límite de acceso</p><h1>Not authorized</h1><p>This account does not have permission for that workspace or family group.</p></div></section>
      <section className="section"><div className="content-wrap"><Link className="button" href="/">Return home / Volver al inicio</Link></div></section>
    </main>
  );
}
