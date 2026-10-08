/**
 * AI assistance — design only. Nothing in this system calls an AI model.
 *
 * Guardrails that any implementation must keep:
 *  - Human-in-the-loop: AI output is a SUGGESTION placed in a review queue.
 *    It never creates, changes, approves or rejects a personnel record.
 *  - Least data: send only the fields needed for the task; never government
 *    identifiers, and only to a provider approved by the agency's DPO.
 *  - Grounded answers: the HR assistant answers only from approved internal
 *    knowledge sources and cites them; otherwise it says it doesn't know.
 *  - Everything it proposes and everything HR accepts or rejects is audited.
 */
export type Suggestion = {
  kind: "possible_duplicate" | "name_inconsistency" | "date_conflict" | "history_inconsistency";
  employeeIds: string[];
  explanation: string;
  confidence: number;
};

export type ExtractedMetadata = {
  fields: { name: string; value: string; confidence: number }[];
  /** Always true: extracted values must be confirmed by HR before they are saved. */
  requiresHumanValidation: true;
};

export type KnowledgeAnswer = { answer: string; sources: { title: string; location: string }[] } | { answer: null; reason: "no_approved_source" };

export interface AiProvider {
  readonly name: string;
  readonly configured: boolean;
  suggestDataQualityIssues(records: { id: string; fields: Record<string, string> }[]): Promise<Suggestion[]>;
  extractDocumentMetadata(file: { mime: string; bytes: Uint8Array }): Promise<ExtractedMetadata>;
  answerFromKnowledge(question: string, approvedSourceIds: string[]): Promise<KnowledgeAnswer>;
}

class NotConfiguredAiProvider implements AiProvider {
  readonly name = "none";
  readonly configured = false;
  private fail(): never {
    throw new Error("No AI provider is configured");
  }
  suggestDataQualityIssues(): Promise<Suggestion[]> { return this.fail(); }
  extractDocumentMetadata(): Promise<ExtractedMetadata> { return this.fail(); }
  answerFromKnowledge(): Promise<KnowledgeAnswer> { return this.fail(); }
}

export const aiProvider: AiProvider = new NotConfiguredAiProvider();
