import { createClient } from "@/lib/supabase/server";
import { StudioThread, type ThreadMessage } from "@/components/home/studio-thread";
import { DecisionCard } from "@/components/home/decision-card";
import { TodayPanel } from "@/components/home/today-panel";
import {
  loadDecisionQueue,
  loadRecentRuns,
} from "@/lib/overview/decision-queue";

const THREAD_LIMIT = 40;

/**
 * Studio home is the agent conversation. The latest persisted thread loads
 * first; the creator's pending decisions sit at its end, and a calm summary
 * column shows today's counts and Projects.
 */
export default async function StudioHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ownerId = user!.id;

  const [queue, runs, projectsRes, conversationRes] = await Promise.all([
    loadDecisionQueue(supabase, ownerId),
    loadRecentRuns(supabase, ownerId),
    supabase
      .from("projects")
      .select("id, name, status")
      .eq("owner_id", ownerId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("agent_conversations")
      .select("id")
      .eq("owner_id", ownerId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const conversationId = conversationRes.data?.id ?? null;
  let messages: ThreadMessage[] = [];
  if (conversationId) {
    const { data } = await supabase
      .from("agent_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", conversationId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(THREAD_LIMIT);
    messages = (data ?? [])
      .reverse()
      .filter((row) => typeof row.content === "string" && row.content.trim())
      .map((row) => ({
        id: row.id as string,
        role: row.role as ThreadMessage["role"],
        content: row.content as string,
        createdAt: row.created_at as string,
      }));
  }

  const yourCall = queue.filter((row) => row.track.waitingOn === "creator");
  const withAgent = queue.filter((row) => row.track.waitingOn === "agent");
  const scheduled = queue.filter((row) =>
    row.track.gates.some((gate) => gate.id === "publish" && gate.state === "working"),
  ).length;

  return (
    <div className="home">
      <StudioThread
        initialMessages={messages}
        initialConversationId={conversationId}
        decisions={
          <DecisionCard
            yourCall={yourCall}
            withAgent={withAgent}
            hasAnyConcepts={queue.length > 0}
          />
        }
      />
      <TodayPanel
        counts={{
          waitingOnYou: yourCall.length,
          withAgent: withAgent.length,
          scheduled,
        }}
        latestRun={runs[0] ?? null}
        projects={projectsRes.data ?? []}
        orchestratedByN8n={Boolean(process.env.N8N_WEBHOOK_BASE_URL?.trim())}
      />
    </div>
  );
}
