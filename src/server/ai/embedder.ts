/** Turns texts into vectors. The fake and the real provider both implement it. */
export type Embedder = {
  /**
   * Stored with every passage, so changing the model re-embeds them all
   * instead of mixing vectors from two models.
   */
  readonly model: string;
  readonly dimensions: number;
  /** Returns one vector per text, in the same order. */
  embed(texts: string[]): Promise<number[][]>;
};
