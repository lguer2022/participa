import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { configured } from '../api';
import Shape from './Shape';

export const AUTHOR = 'Mg. Lic. Prof. Leandro Guerschberg';

export function Wordmark() {
  return (
    <Link to="/" className="wordmark" aria-label="Participa, inicio">
      <span className="wordmark-cards" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={'mini c' + i}>
            <Shape index={i} size={9} />
          </span>
        ))}
      </span>
      participa
    </Link>
  );
}

export function ConfigAlert() {
  if (configured) return null;
  return (
    <div className="alert" role="alert">
      Falta conectar Supabase: completá <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> en
      el archivo <code>.env</code>.
    </div>
  );
}

export default function Layout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <>
      <header className="topbar">
        <Wordmark />
        <nav>
          <NavLink to="/" end>
            Unirme
          </NavLink>
          <NavLink to="/admin">Administrar</NavLink>
        </nav>
      </header>
      <main className={wide ? 'wide' : undefined}>
        <ConfigAlert />
        {children}
      </main>
      <footer className="credits">© 2026 {AUTHOR}</footer>
    </>
  );
}
