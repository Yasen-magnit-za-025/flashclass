import { EmptyState } from "@/components/ui";
import type { StudyGuideContent } from "@/domain/content";
import { useI18n } from "@/i18n/I18nProvider";

/** Plain-text rendering (paragraphs on blank lines). No HTML is ever injected. */
export function StudyGuideView({ content }: { content: StudyGuideContent }) {
  const { t } = useI18n();
  if (content.sections.length === 0) return <EmptyState title={t("study_guide.empty")} />;
  return (
    <article className="prose study-guide">
      {content.sections.length > 2 && (
        <nav aria-label={t("study_guide.contents")} className="card">
          <ol>
            {content.sections.map((s, i) => (
              <li key={i}>
                <a href={`#section-${i}`}>{s.heading || t("study_guide.section", { n: i + 1 })}</a>
              </li>
            ))}
          </ol>
        </nav>
      )}
      {content.sections.map((s, i) => (
        <section key={i} id={`section-${i}`}>
          {s.heading && <h2>{s.heading}</h2>}
          {s.body.split(/\n{2,}/).map((paragraph, j) => (
            <p key={j}>{paragraph}</p>
          ))}
        </section>
      ))}
    </article>
  );
}
