/** Audience message templates: "Parent of {number}, please come to the nursery". */

const TOKEN = /\{([A-Za-z][\w ]{0,30})\}/g;

/** The fill-in fields of a template, in order, each once. */
export function messageTokens(template: string): string[] {
  const seen = new Set<string>();
  for (const m of template.matchAll(TOKEN)) if (m[1]) seen.add(m[1].trim());
  return [...seen];
}

/** Template with its fields filled; a field left empty keeps its {name} so nothing vanishes. */
export function fillMessage(template: string, values: Record<string, string>): string {
  return template.replace(TOKEN, (whole, name: string) => values[name.trim()]?.trim() || whole);
}
