export function isMermaidClass(className?: string): boolean {
  return className?.split(/\s+/).includes('language-mermaid') ?? false;
}
