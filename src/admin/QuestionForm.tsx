import { useState, type FormEvent } from 'react';
import Shape from '../components/Shape';
import type { EditableQuestion, Mode } from '../api';

type Props = {
  mode: Mode;
  initial?: EditableQuestion;
  submitLabel: string;
  onSave: (text: string, options: string[], correct: number | null) => Promise<void>;
  onCancel?: () => void;
};

export default function QuestionForm({ mode, initial, submitLabel, onSave, onCancel }: Props) {
  const [text, setText] = useState(initial?.body ?? '');
  const [answers, setAnswers] = useState(() => {
    const base = initial?.options.map((o) => o.label) ?? [];
    return [...base, '', '', '', ''].slice(0, 4);
  });
  const [correct, setCorrect] = useState(() => Math.max(0, initial?.options.findIndex((o) => o.is_correct) ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const quiz = mode === 'quiz';
  const locked = Boolean(initial?.has_responses);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const filled = answers.map((a, i) => ({ text: a.trim(), i })).filter((a) => a.text);
    if (filled.length < 2) return setError('Escribí al menos dos opciones.');
    const correctIndex = quiz ? filled.findIndex((a) => a.i === correct) : null;
    if (quiz && correctIndex === -1) return setError('Marcá cuál es la respuesta correcta.');
    setBusy(true);
    try {
      await onSave(text, filled.map((a) => a.text), correctIndex);
      if (!initial) {
        setText('');
        setAnswers(['', '', '', '']);
        setCorrect(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="qform" onSubmit={submit}>
      <label className="field">
        <span>Pregunta</span>
        <textarea
          required
          minLength={3}
          maxLength={500}
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="¿Qué querés preguntarle a la sala?"
        />
      </label>
      <fieldset className="qform-options">
        <legend>
          Opciones
          {quiz && !locked && <span className="muted"> (marcá la correcta con el círculo de la derecha)</span>}
          {locked && <span className="muted"> (ya tiene votos: solo se puede corregir el enunciado)</span>}
        </legend>
        {answers.map((a, i) => (
          <div className={'optrow c' + i} key={i}>
            <span className="optshape">
              <Shape index={i} size={16} />
            </span>
            <input
              maxLength={150}
              value={a}
              disabled={locked}
              aria-label={`Opción ${i + 1}`}
              placeholder={i < 2 ? `Opción ${i + 1}` : `Opción ${i + 1} (opcional)`}
              onChange={(e) => setAnswers((v) => v.map((item, idx) => (idx === i ? e.target.value : item)))}
            />
            {quiz && (
              <label className="correct-pick" title="Respuesta correcta">
                <input
                  type="radio"
                  name="correct"
                  checked={correct === i}
                  disabled={locked || !a.trim()}
                  onChange={() => setCorrect(i)}
                  aria-label={`La opción ${i + 1} es la correcta`}
                />
              </label>
            )}
          </div>
        ))}
      </fieldset>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button disabled={busy}>{busy ? 'Guardando…' : submitLabel}</button>
        {onCancel && (
          <button type="button" className="ghost" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
