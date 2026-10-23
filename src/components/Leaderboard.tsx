import type { LeaderboardRow } from '../api';

export default function Leaderboard({ rows, big = false }: { rows: LeaderboardRow[]; big?: boolean }) {
  if (!rows.length) return null;
  return (
    <ol className={'board' + (big ? ' big' : '')}>
      {rows.map((r, i) => (
        <li key={i} className={(r.me ? 'me ' : '') + (r.pos === 1 ? 'first' : '')}>
          <span className="board-pos">{r.pos}</span>
          <span className="board-name">{r.name}</span>
          <span className="board-score">{r.score.toLocaleString('es-AR')}</span>
        </li>
      ))}
    </ol>
  );
}
