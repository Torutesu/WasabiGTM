import { resolveModel } from "./models";
import type { CompleteArgs, GenerateArgs, LlmProvider, ModelTier } from "./types";

/**
 * Deterministic provider. Selected when no vendor key is present and always in
 * E2E, so tests assert on application logic rather than model output. Fixtures
 * live in offline-fixtures.ts and are keyed by `offlineKey`.
 */
export class OfflineProvider implements LlmProvider {
  readonly id = "offline" as const;

  modelFor(tier: ModelTier): string {
    return resolveModel(this.id, tier);
  }

  async generate<T>(args: GenerateArgs): Promise<T> {
    const { offlineFixture } = await import("./offline-fixtures");
    return offlineFixture<T>(args);
  }

  async complete(args: CompleteArgs): Promise<string> {
    const { offlineCompletion } = await import("./offline-fixtures");
    return offlineCompletion(args);
  }
}
