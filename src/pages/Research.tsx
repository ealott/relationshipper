import { CATEGORIES } from '../../shared/categories';
import { CATEGORY_RESEARCH, CAVEATS, PRINCIPLES, REFERENCES } from '../../shared/research';
import { BackIcon } from '../components/Icons';
import { Sources } from '../components/Sources';

function Strength({ value }: { value: string }) {
  return (
    <p class="strength">
      <strong>Evidence:</strong> {value}
    </p>
  );
}

export function Research() {
  return (
    <main class="page page--reading">
      <a
        href="/"
        class="back-link"
        onClick={(e) => {
          if (history.length > 1) {
            e.preventDefault();
            history.back();
          }
        }}
      >
        <BackIcon size={18} /> Back
      </a>
      <header>
        <p class="eyebrow">The research</p>
        <h1 class="page__title">Why Relationshipper works the way it does</h1>
        <p class="page__lede">
          Writing instead of tapping, answering before you can read your partner’s answer, responding afterwards, and the themes the
          questions explore all draw on relationship science. Here’s what that research found, what the app does with it, and how much
          weight the evidence can bear.
        </p>
      </header>

      <section class="section">
        <h2 class="section__title">Read this first</h2>
        <ul class="research-caveats">
          <li>No study has tested Relationshipper itself. It borrows ideas tested in labs, clinics, diaries and online programs, and a light-touch app will likely have smaller effects.</li>
          <li>Much of this research is correlational, and most studies sampled white, heterosexual, married couples in the U.S.</li>
          <li>
            <strong>Strong</strong> means meta-analyses or several randomized trials agree. <strong>Moderate</strong> means at least one
            randomized trial or consistent long-term studies. <strong>Emerging</strong> means small or correlational studies, or clinical
            ideas with few direct tests.
          </li>
        </ul>
      </section>

      <section class="section">
        <h2 class="section__title">How the app is designed</h2>
        <div class="principles-list">
          {PRINCIPLES.map((p) => (
            <article class="principle">
              <h3>{p.title}</h3>
              <Strength value={p.strength} />
              <p>{p.body}</p>
              <p class="principle__inapp">
                <strong>In the app:</strong> {p.inApp}
              </p>
              <Sources sources={p.sources} />
            </article>
          ))}
        </div>
      </section>

      <section class="section">
        <h2 class="section__title">What we leave out</h2>
        <div class="principles-list">
          {CAVEATS.map((c) => (
            <article class="principle">
              <h3>{c.title}</h3>
              <p>{c.body}</p>
              <Sources sources={c.sources} />
            </article>
          ))}
        </div>
      </section>

      <section class="section">
        <h2 class="section__title">The themes</h2>
        <div class="principles-list">
          {CATEGORIES.map((c) => {
            const note = CATEGORY_RESEARCH[c.id];
            return (
              <article class="principle" style={{ '--cat': c.color }}>
                <h3 class="principle__theme">{c.name}</h3>
                <Strength value={note.strength} />
                <p>{note.summary}</p>
                <Sources sources={note.sources} />
              </article>
            );
          })}
        </div>
      </section>

      <details class="section research-references">
        <summary class="section__title">All {REFERENCES.length} sources</summary>
        <Sources sources={REFERENCES} />
      </details>

      <p class="muted research-footnote">
        Relationshipper is a reflection tool, not therapy. If you’re facing serious conflict, abuse, or a crisis, please reach out to a
        licensed couples therapist or a local support service.
      </p>
    </main>
  );
}
