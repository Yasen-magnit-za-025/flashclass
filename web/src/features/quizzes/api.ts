import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useSession } from "@/app/session";
import { attemptResultSchema, questionSchema, type QuestionResponse } from "@/domain/content";
import { unwrap } from "@/lib/errors";
import { supabase } from "@/lib/supabase";

export function useQuestions(materialId: string | undefined) {
  return useQuery({
    queryKey: ["questions", materialId],
    enabled: Boolean(materialId),
    queryFn: async () =>
      z.array(questionSchema).parse(
        unwrap(
          await supabase
            .from("material_questions")
            .select("id, position, type, prompt, options")
            .eq("material_id", materialId!)
            .order("position"),
        ),
      ),
  });
}

export async function startAttempt(materialId: string): Promise<string> {
  return unwrap(await supabase.rpc("start_attempt", { p_material_id: materialId }));
}

export async function submitAttempt(attemptId: string, answers: Record<string, QuestionResponse>) {
  const payload = Object.entries(answers).map(([question_id, response]) => ({ question_id, response }));
  return attemptResultSchema.parse(unwrap(await supabase.rpc("submit_attempt", { p_attempt_id: attemptId, p_answers: payload })));
}

export function useAttemptResult(attemptId: string | undefined) {
  return useQuery({
    queryKey: ["attempt-result", attemptId],
    enabled: Boolean(attemptId),
    staleTime: Infinity,
    queryFn: async () => attemptResultSchema.parse(unwrap(await supabase.rpc("get_attempt_result", { p_attempt_id: attemptId! }))),
  });
}

export function useMyAttempts() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["attempts", user?.id],
    enabled: Boolean(user),
    queryFn: async () =>
      unwrap(
        await supabase
          .from("quiz_attempts")
          .select("id, material_id, material_title, status, started_at, submitted_at, question_count, correct_count, score_percent")
          .order("started_at", { ascending: false })
          .limit(200),
      ),
  });
}
