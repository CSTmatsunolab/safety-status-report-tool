// src/types/wink-tokenizer.d.ts
declare module 'wink-tokenizer' {
  
  interface WinkToken {
    value: string;
    tag: string;
    type: string;
  }

  export default class Tokenizer {
    constructor();
    tokenize(text: string): WinkToken[];
  }
}