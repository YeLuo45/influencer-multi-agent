export type Persona = {
  id: string;
  name: string;
  tone: string;
  targetAudience: string;
  signaturePhrases: string[];
  bannedWords: string[];
  defaultPlatforms: string[];
  examples: string[];
  createdAt: string;
  updatedAt: string;
};

export function createPersona(opts: {
  id: string;
  name: string;
  tone?: string;
  targetAudience?: string;
  signaturePhrases?: string[];
  bannedWords?: string[];
  defaultPlatforms?: string[];
  examples?: string[];
  now?: string;
}): Persona {
  const now = opts.now ?? new Date().toISOString();
  return {
    id: opts.id,
    name: opts.name,
    tone: opts.tone ?? 'professional',
    targetAudience: opts.targetAudience ?? 'general',
    signaturePhrases: opts.signaturePhrases ?? [],
    bannedWords: opts.bannedWords ?? [],
    defaultPlatforms: opts.defaultPlatforms ?? [],
    examples: opts.examples ?? [],
    createdAt: now,
    updatedAt: now,
  };
}

export class PersonaRegistry {
  private readonly personas = new Map<string, Persona>();

  upsert(p: Persona): Persona {
    this.personas.set(p.id, { ...p, updatedAt: new Date().toISOString() });
    return this.personas.get(p.id)!;
  }

  get(id: string): Persona | null {
    return this.personas.get(id) ?? null;
  }

  has(id: string): boolean {
    return this.personas.has(id);
  }

  remove(id: string): boolean {
    return this.personas.delete(id);
  }

  list(): Persona[] {
    return Array.from(this.personas.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  count(): number {
    return this.personas.size;
  }
}

export function applyPersonaToPrompt(persona: Persona, basePrompt: string): string {
  const lines = [
    basePrompt,
    '',
    '--- Persona context ---',
    `Voice/Tone: ${persona.tone}`,
    `Target audience: ${persona.targetAudience}`,
  ];
  if (persona.signaturePhrases.length > 0) {
    lines.push(`Signature phrases to use: ${persona.signaturePhrases.join('; ')}`);
  }
  if (persona.bannedWords.length > 0) {
    lines.push(`Banned words (NEVER use): ${persona.bannedWords.join(', ')}`);
  }
  if (persona.examples.length > 0) {
    lines.push(`Reference examples:\n${persona.examples.map((e) => '  - ' + e).join('\n')}`);
  }
  return lines.join('\n');
}