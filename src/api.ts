import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const configured = Boolean(url && key && !url.includes('YOUR_PROJECT'));
export const db = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder');

export type Mode = 'poll' | 'quiz';
export type Phase = 'waiting' | 'question' | 'results' | 'finished';

export type Option = {
  id: string;
  label: string;
  votes?: number | null;
  /** Solo llega cuando se revelan los resultados de una competencia. */
  is_correct?: boolean | null;
};

export type LeaderboardRow = { name: string; score: number; pos: number; me: boolean };

export type PublicState = {
  session_id: string;
  pin: string;
  title: string;
  mode: Mode;
  status: 'open' | 'closed';
  phase: Phase;
  question_id: string | null;
  question_text: string | null;
  question_number: number | null;
  question_total: number;
  options: Option[];
  total_votes: number;
  my_answer: string | null;
  participants: number;
  show_results: boolean;
  is_admin: boolean;
  nickname: string | null;
  my_points: number | null;
  my_score: number | null;
  my_rank: number | null;
  leaderboard: LeaderboardRow[] | null;
};

export type AdminSession = {
  id: string;
  pin: string;
  status: 'open' | 'closed';
  phase: Phase;
  question_index: number;
  question_total: number;
  activity_id: string;
  title: string;
  mode: Mode;
};

export type Activity = {
  id: string;
  title: string;
  mode: Mode;
  question_count: number;
  session_count: number;
  open_session: string | null;
};

export type EditableQuestion = {
  id: string;
  position: number;
  body: string;
  has_responses: boolean;
  options: { id: string; label: string; is_correct: boolean }[];
};

export type ActivityDetail = {
  id: string;
  title: string;
  mode: Mode;
  has_open_session: boolean;
  questions: EditableQuestion[];
};

export type ExportData = {
  participants: number;
  rows: { question_number: number; question: string; option: string; is_correct: boolean; votes: number }[];
  ranking: { name: string; score: number }[];
};

export const phaseLabel: Record<Phase, string> = {
  waiting: 'Esperando la primera pregunta',
  question: 'Votación abierta',
  results: 'Mostrando resultados',
  finished: 'Finalizada',
};

export const modeLabel: Record<Mode, string> = { poll: 'Encuesta', quiz: 'Competencia' };

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function ensureAnonymous() {
  const { data } = await db.auth.getUser();
  if (data.user) return;
  const result = await db.auth.signInAnonymously();
  if (result.error) {
    if (/rate limit/i.test(result.error.message))
      throw new Error('Entraron muchas personas desde esta red en la última hora. Probá con datos móviles o avisale a quien conduce.');
    throw new Error(result.error.message);
  }
}

export function listen(sessionId: string, refresh: () => void) {
  const channel = db
    .channel(`room:${sessionId}`)
    .on('broadcast', { event: 'refresh' }, () => refresh())
    .subscribe();
  return () => {
    void db.removeChannel(channel);
  };
}

/** Descarga los resultados de una sala como CSV (abre bien en Excel y Google Sheets). */
export function downloadCsv(filename: string, data: ExportData) {
  const esc = (v: string | number | boolean) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    ['Pregunta', 'Enunciado', 'Opción', 'Correcta', 'Votos'].map(esc).join(';'),
    ...data.rows.map((r) =>
      [r.question_number, r.question, r.option, r.is_correct ? 'Sí' : '', r.votes].map(esc).join(';'),
    ),
  ];
  if (data.ranking.length && data.ranking.some((r) => r.score > 0)) {
    lines.push('', ['Puesto', 'Apodo', 'Puntos'].map(esc).join(';'));
    data.ranking.forEach((r, i) => lines.push([i + 1, r.name, r.score].map(esc).join(';')));
  }
  lines.push('', [esc('Participantes'), esc(data.participants)].join(';'));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
