/** Plano da sequência: frase 1 -> pausa -> frase 2 -> pausa -> ... -> loop até a duração total. */

export type EndMode = 'completas' | 'cortar';

export interface Occurrence {
  start: number; // amostra inicial (inclusiva)
  end: number; // amostra final (exclusiva)
  index: number; // índice da frase
  truncated: boolean;
}

export interface SequencePlan {
  occurrences: Occurrence[];
  totalSamples: number;
  gapSamples: number;
  /** amostras após a última frase em que só o fundo toca (modo 'completas') */
  tailSamples: number;
}

/**
 * 'completas' (padrão): só entram frases inteiras; o tempo restante fica apenas com o fundo,
 *   evitando letras cortadas — final previsível.
 * 'cortar': a última ocorrência é truncada (com fade) exatamente no fim.
 */
export function planSequence(phraseLengths: number[], gapSamples: number, totalSamples: number, endMode: EndMode = 'completas'): SequencePlan {
  if (!phraseLengths.length) throw new Error('Insira pelo menos uma frase.');
  if (gapSamples < 0) throw new Error('Pausa inválida.');
  const occ: Occurrence[] = [];
  let pos = 0, idx = 0;
  while (pos < totalSamples) {
    const len = phraseLengths[idx];
    if (pos + len > totalSamples) {
      if (endMode === 'cortar') occ.push({ start: pos, end: totalSamples, index: idx, truncated: true });
      break;
    }
    occ.push({ start: pos, end: pos + len, index: idx, truncated: false });
    pos += len + gapSamples;
    idx = (idx + 1) % phraseLengths.length;
  }
  const lastEnd = occ.length ? occ[occ.length - 1].end : 0;
  return { occurrences: occ, totalSamples, gapSamples, tailSamples: totalSamples - lastEnd };
}

/** Duração de um ciclo completo (todas as frases + pausas), em amostras. */
export function cycleSamples(phraseLengths: number[], gapSamples: number): number {
  return phraseLengths.reduce((a, b) => a + b + gapSamples, 0);
}
