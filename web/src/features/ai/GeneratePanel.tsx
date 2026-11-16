import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button, ErrorBanner, Field, Notice, Spinner } from "@/components/ui";
import type { MaterialKind } from "@/domain/taxonomy";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { AppError } from "@/lib/errors";
import { CompanionError, checkCompanion, generateWithCompanion, getPairingToken, setPairingToken } from "./companion";
import { generatedToDraftParts, partsMatchKind, type GeneratedParts } from "./generated";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_FILES = ".pdf,.txt,.md,application/pdf,text/plain,text/markdown";

export type ApplyMode = "append" | "replace";

function companionErrorKey(error: unknown): MessageKey {
  if (error instanceof CompanionError) return `ai.errors.${error.code}`;
  return "errors.generic";
}

/**
 * Optional local-AI panel inside the editor. Output becomes an UNSAVED editable
 * draft; the teacher must review, edit and explicitly save.
 */
export function GeneratePanel({
  kind,
  language,
  levelHint,
  onApply,
}: {
  kind: MaterialKind;
  language: string;
  levelHint: string;
  onApply: (parts: GeneratedParts, mode: ApplyMode) => void;
}) {
  const { t, tn } = useI18n();
  const status = useQuery({ queryKey: ["companion-status"], queryFn: checkCompanion, staleTime: 15_000, retry: false });
  const [tokenInput, setTokenInput] = useState("");
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(10);
  const [model, setModel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<MessageKey | null>(null);
  const [preview, setPreview] = useState<{ parts: GeneratedParts; truncated: boolean } | null>(null);

  const ready = status.data?.state === "ready" ? status.data : null;
  useEffect(() => {
    if (ready && !model) setModel(ready.defaultModel ?? ready.models[0] ?? "");
  }, [ready, model]);

  const generate = useMutation({
    mutationFn: async () => {
      const res = await generateWithCompanion({ kind, topic: topic.trim(), language, levelHint, count, model, file });
      if (res.draft.kind !== kind) throw new CompanionError("invalid_output", "kind mismatch");
      return res;
    },
    onSuccess: (res) => setPreview({ parts: generatedToDraftParts(res.draft), truncated: res.source?.truncated ?? false }),
  });

  const pickFile = (f: File | null) => {
    setFileError(null);
    if (f && f.size > MAX_FILE_BYTES) {
      setFileError("ai.file_too_large");
      setFile(null);
      return;
    }
    setFile(f);
  };

  const pair = () => {
    setPairingToken(tokenInput);
    setTokenInput("");
    void status.refetch();
  };

  const body = () => {
    if (status.isPending) return <Spinner label={t("ai.checking")} />;
    const s = status.data;
    if (!s || s.state === "unreachable") {
      return (
        <Notice>
          <p>{t("ai.unreachable")}</p>
          <p className="small muted">{t("ai.unreachable.help")}</p>
        </Notice>
      );
    }
    if (s.state === "unpaired") {
      return (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            pair();
          }}
        >
          <p>{t(getPairingToken() ? "ai.pairing.invalid" : "ai.pairing.needed")}</p>
          <Field label={t("ai.pairing.token")} hint={t("ai.pairing.hint")}>
            <input value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} autoComplete="off" spellCheck={false} />
          </Field>
          <div>
            <Button type="submit" variant="primary" disabled={!tokenInput.trim()}>
              {t("ai.pairing.connect")}
            </Button>
          </div>
        </form>
      );
    }
    if (s.state === "ollama_down") return <Notice tone="warning">{t("ai.ollama_down")}</Notice>;
    if (s.state === "no_models") return <Notice tone="warning">{t("ai.no_models")}</Notice>;

    if (preview) {
      const n = partsMatchKind(kind, preview.parts);
      return (
        <div className="stack">
          <Notice tone="success">{t("ai.preview.ready", { count: n })}</Notice>
          {preview.truncated && <Notice tone="warning">{t("ai.preview.truncated")}</Notice>}
          <p className="muted small">{t("ai.review_required")}</p>
          <div className="row wrap">
            <Button variant="primary" onClick={() => (onApply(preview.parts, "append"), setPreview(null))}>
              {t("ai.apply.append")}
            </Button>
            <Button onClick={() => (onApply(preview.parts, "replace"), setPreview(null))}>{t("ai.apply.replace")}</Button>
            <Button variant="ghost" onClick={() => setPreview(null)}>
              {t("ai.apply.discard")}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          generate.mutate();
        }}
      >
        <Field label={t("ai.topic")} hint={t("ai.topic.hint")}>
          <textarea rows={2} maxLength={500} value={topic} onChange={(e) => setTopic(e.target.value)} />
        </Field>
        <Field label={t("ai.file")} hint={t("ai.file.hint")} error={fileError ? t(fileError) : undefined}>
          <input type="file" accept={ACCEPTED_FILES} onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
        </Field>
        <div className="row wrap">
          <Field label={tn("ai.count", count)}>
            <input type="number" min={1} max={kind === "study_guide" ? 15 : 30} value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} />
          </Field>
          <Field label={t("ai.model")}>
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {s.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {generate.error && (
          <ErrorBanner error={new AppError(companionErrorKey(generate.error))} />
        )}
        <div className="row">
          <Button type="submit" variant="primary" busy={generate.isPending} disabled={!topic.trim() && !file}>
            {generate.isPending ? t("ai.generating") : t("ai.generate")}
          </Button>
        </div>
        <p className="muted small">{t("ai.local_only")}</p>
      </form>
    );
  };

  return (
    <details className="card ai-panel">
      <summary>
        <strong>{t("ai.title")}</strong> <span className="muted small">{t("ai.optional")}</span>
      </summary>
      <div className="stack ai-panel-body">{body()}</div>
    </details>
  );
}
