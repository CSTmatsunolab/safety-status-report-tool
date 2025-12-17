// wink-tokenizer.d.ts
declare module 'wink-tokenizer' {
  interface Token {
    value: string;
    tag: string;
  }

  class WinkTokenizer {
    constructor();
    tokenize(text: string): Token[];
    defineConfig(config: Record<string, boolean>): void;
  }

  export = WinkTokenizer;
}
