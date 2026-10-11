export function NotFound() {
  return (
    <main class="page page--narrow page--center">
      <p class="big-emoji" aria-hidden="true">
        🧭
      </p>
      <h1 class="page__title">Nothing here</h1>
      <p class="page__lede">That page doesn’t exist — maybe the link is old.</p>
      <a class="btn btn--primary" href="/">
        Go to today’s question
      </a>
    </main>
  );
}
