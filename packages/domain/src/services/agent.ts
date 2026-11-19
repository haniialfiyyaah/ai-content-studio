import { AppError, ErrorCodes, type AgentMessageRole } from "@acs/schemas";
import type { DbClient } from "./projects";

const ACTIONABLE_KEYWORDS = [
  "video",
  "content",
  "create",
  "campaign",
  "script",
] as const;

/** Heuristic: long briefs or keyword hits are treated as planning-worthy. */
export function detectActionableIntent(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length > 20) return true;
  const lower = trimmed.toLowerCase();
  return ACTIONABLE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export interface AgentConversation {
  id: string;
  ownerId: string;
  projectId: string | null;
  title: string | null;
  status: string;
}

export interface AgentMessage {
  id: string;
  conversationId: string;
  ownerId: string;
  role: AgentMessageRole;
  content: string;
  sourceSurface: string | null;
  sourceMessageId: string | null;
}

export interface WorkflowRun {
  id: string;
  ownerId: string;
  conversationId: string | null;
  projectId: string | null;
  workflowType: string;
  status: string;
  idempotencyKey: string | null;
  correlationId: string | null;
}

interface ConversationRow {
  id: string;
  owner_id: string;
  project_id: string | null;
  title: string | null;
  status: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  owner_id: string;
  role: AgentMessageRole;
  content: string;
  source_surface: string | null;
  source_message_id: string | null;
}

interface WorkflowRunRow {
  id: string;
  owner_id: string;
  conversation_id: string | null;
  project_id: string | null;
  workflow_type: string;
  status: string;
  idempotency_key: string | null;
  correlation_id: string | null;
}

function mapConversation(row: ConversationRow): AgentConversation {
  return {
    id: row.id,
    ownerId: row.owner_id,
    projectId: row.project_id,
    title: row.title,
    status: row.status,
  };
}

function mapMessage(row: MessageRow): AgentMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    ownerId: row.owner_id,
    role: row.role,
    content: row.content,
    sourceSurface: row.source_surface,
    sourceMessageId: row.source_message_id,
  };
}

function mapRun(row: WorkflowRunRow): WorkflowRun {
  return {
    id: row.id,
    ownerId: row.owner_id,
    conversationId: row.conversation_id,
    projectId: row.project_id,
    workflowType: row.workflow_type,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    correlationId: row.correlation_id,
  };
}

/** Broader query chain for agent helpers (select/eq/update/maybeSingle). */
export interface AgentDbClient {
  from: (table: string) => any;
}

export interface CreateConversationParams {
  ownerId: string;
  projectId?: string | null;
  title?: string | null;
}

export async function createConversation(
  supabase: AgentDbClient,
  params: CreateConversationParams,
): Promise<AgentConversation> {
  const { data, error } = await supabase
    .from("agent_conversations")
    .insert({
      owner_id: params.ownerId,
      project_id: params.projectId ?? null,
      title: params.title ?? null,
      status: "active",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to create agent conversation",
      500,
    );
  }

  return mapConversation(data as ConversationRow);
}

export interface AppendMessageParams {
  conversationId: string;
  ownerId: string;
  role: AgentMessageRole;
  content: string;
  sourceSurface?: string | null;
  sourceMessageId?: string | null;
  modelMetadata?: Record<string, unknown>;
}

export async function appendMessage(
  supabase: AgentDbClient,
  params: AppendMessageParams,
): Promise<AgentMessage> {
  const { data, error } = await supabase
    .from("agent_messages")
    .insert({
      conversation_id: params.conversationId,
      owner_id: params.ownerId,
      role: params.role,
      content: params.content,
      source_surface: params.sourceSurface ?? null,
      source_message_id: params.sourceMessageId ?? null,
      model_metadata: params.modelMetadata ?? {},
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to append agent message",
      500,
    );
  }

  // Keep conversation recency without exposing message content in logs.
  await supabase
    .from("agent_conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", params.conversationId);

  return mapMessage(data as MessageRow);
}

export interface StartPlanningRunParams {
  ownerId: string;
  conversationId: string;
  messageId: string;
  projectId?: string | null;
  correlationId: string;
  /** Defaults to `project_planning:{messageId}` for idempotent retries. */
  idempotencyKey?: string;
}

/**
 * Queues a project_planning workflow run keyed by the triggering message id
 * so duplicate POSTs do not spawn parallel planners.
 */
export async function startPlanningRun(
  supabase: AgentDbClient,
  params: StartPlanningRunParams,
): Promise<WorkflowRun> {
  const idempotencyKey =
    params.idempotencyKey ?? `project_planning:${params.messageId}`;

  const { data: existing } = await supabase
    .from("workflow_runs")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing) {
    return mapRun(existing as WorkflowRunRow);
  }

  const { data, error } = await supabase
    .from("workflow_runs")
    .insert({
      owner_id: params.ownerId,
      conversation_id: params.conversationId,
      project_id: params.projectId ?? null,
      workflow_type: "project_planning",
      correlation_id: params.correlationId,
      idempotency_key: idempotencyKey,
      input_reference: { messageId: params.messageId },
      stage: "queued",
      status: "queued",
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) {
    // Race on unique idempotency_key — re-read the winner.
    const { data: raced } = await supabase
      .from("workflow_runs")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (raced) {
      return mapRun(raced as WorkflowRunRow);
    }

    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Failed to start planning run",
      500,
      { correlationId: params.correlationId },
    );
  }

  return mapRun(data as WorkflowRunRow);
}

/** Re-export DbClient for callers that only need insert/upsert. */
export type { DbClient };
