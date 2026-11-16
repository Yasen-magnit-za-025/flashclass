import { useMemo, useState } from "react";
import { Button, EmptyState } from "@/components/ui";
import type { FlashcardContent } from "@/domain/content";
import { useI18n } from "@/i18n/I18nProvider";

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/** Client-only review session (no attempts are recorded for flashcards in v1). */
export function FlashcardReview({ content }: { content: FlashcardContent }) {
  const { t } = useI18n();
  const [order, setOrder] = useState(() => content.cards.map((_, i) => i));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());

  const card = useMemo(() => content.cards[order[index] ?? 0], [content.cards, order, index]);
  if (!card) return <EmptyState title={t("flashcards.empty")} />;

  const go = (next: number) => {
    setIndex((next + order.length) % order.length);
    setFlipped(false);
  };
  const mark = (isKnown: boolean) => {
    const cardIndex = order[index]!;
    setKnown((prev) => {
      const next = new Set(prev);
      if (isKnown) next.add(cardIndex);
      else next.delete(cardIndex);
      return next;
    });
    go(index + 1);
  };

  return (
    <section className="stack flashcards">
      <p className="muted" aria-live="polite">
        {t("flashcards.position", { current: index + 1, total: order.length })} · {t("flashcards.known", { count: known.size })}
      </p>
      <button
        type="button"
        className={`flashcard ${flipped ? "is-flipped" : ""}`}
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? t("flashcards.show_front") : t("flashcards.show_back")}
      >
        <span className="flashcard-face">{flipped ? card.back : card.front}</span>
        <span className="flashcard-hint muted small">{flipped ? t("flashcards.back") : t("flashcards.front")}</span>
      </button>
      <div className="row wrap space-between">
        <Button onClick={() => go(index - 1)}>{t("common.previous")}</Button>
        <div className="row">
          <Button variant="ghost" onClick={() => mark(false)}>
            {t("flashcards.again")}
          </Button>
          <Button variant="primary" onClick={() => mark(true)}>
            {t("flashcards.got_it")}
          </Button>
        </div>
        <Button onClick={() => go(index + 1)}>{t("common.next")}</Button>
      </div>
      <div>
        <Button
          variant="ghost"
          onClick={() => {
            setOrder(shuffled(order));
            setIndex(0);
            setFlipped(false);
          }}
        >
          {t("flashcards.shuffle")}
        </Button>
      </div>
    </section>
  );
}
