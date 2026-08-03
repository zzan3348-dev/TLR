function hasFinalConsonant(word: string): boolean {
  const last = [...word.trim()].at(-1);
  if (!last) return false;
  const code = last.charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 !== 0 : false;
}

export function withParticle(word: string, consonantForm: string, vowelForm: string): string {
  return `${word}${hasFinalConsonant(word) ? consonantForm : vowelForm}`;
}
