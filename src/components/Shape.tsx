/** Forma de cada tarjeta de votación: el color nunca es la única pista (daltonismo). */
export default function Shape({ index, size = 22 }: { index: number; size?: number }) {
  const shapes = [
    <circle cx="12" cy="12" r="9" />,
    <path d="M12 3.5 21 20H3z" />,
    <rect x="4" y="4" width="16" height="16" rx="2" />,
    <path d="M12 2.5 21.5 12 12 21.5 2.5 12z" />,
  ];
  return (
    <svg className="shape" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {shapes[index % 4]}
    </svg>
  );
}

export const shapeName = ['círculo', 'triángulo', 'cuadrado', 'rombo'];
