import { useEffect, useState } from 'preact/hooks';
import { LIMITS, type QuestionState, type ResponseDTO, type VersionDTO, type VersionsResponse } from '../../shared/api';
import { api } from '../api';
import { useDraft } from '../lib/drafts';
import { relativeTime } from '../lib/format';
import { useMe } from '../lib/session';
import { toastError } from '../lib/toast';
import { VersionList } from './Entry';
import { AutoTextarea } from './Field';

/** A stable pick per question, so the tip doesn't change while you write. */
export const pick = (list: string[], id: string, salt = 0) => list[([...id].reduce((n, ch) => n + ch.charCodeAt(0), salt)) % list.length]!;

// Responding well is where the benefit is (perceived responsiveness; Gable’s work on
// active-constructive responding; question-asking and liking). See docs/research.md.
const RESPONSE_PROMPTS = [
  'Reflect back what you heard before adding your own view.',
  'Ask a follow-up question — curiosity is one of the clearest signs of care.',
  'Name something they wrote that you appreciated or didn’t know.',
  'If something surprised or moved you, say so, and ask about it.',
  'Share what it meant to you, not just whether you agree.',
];

/** The written conversation after a reveal, and the box for replying. */
export function Conversation({
  questionId,
  state,
  onChange,
  versions,
  loadVersions,
}: {
  questionId: string;
  state: QuestionState;
  onChange: (s: QuestionState) => void;
  versions: VersionsResponse | null;
  loadVersions: () => void;
}) {
  const me = useMe();
  const partnerName = me.partner?.name ?? 'your partner';
  // A reply sent since a draft was saved (maybe from another device) makes that draft stale.
  const lastSent = Math.max(0, ...state.responses.filter((r) => r.userId === me.user.id).map((r) => r.createdAt));
  const draft = useDraft(me.user.id, questionId, 'response', { staleBefore: lastSent });
  const text = draft.text;
  const [busy, setBusy] = useState(false);
  const tip = pick(RESPONSE_PROMPTS, questionId);

  async function send(e: Event) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await draft.settle();
      onChange(await api.respond(questionId, text));
      draft.clear();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="conversation" aria-label="Conversation">
      <h3 class="conversation__title">Conversation</h3>
      {state.responses.length > 0 && (
        <ol class="thread">
          {state.responses.map((r) => (
            <Message
              key={r.id}
              reply={r}
              mine={r.userId === me.user.id}
              name={partnerName}
              questionId={questionId}
              versions={versions?.responses[r.id] ?? (versions ? [] : undefined)}
              loadVersions={loadVersions}
              onChange={onChange}
            />
          ))}
        </ol>
      )}
      <form class="composer composer--reply" onSubmit={send}>
        <AutoTextarea
          value={text}
          onValue={draft.setText}
          maxLength={LIMITS.responseMax}
          rows={2}
          placeholder={state.responses.length ? 'Reply…' : `Respond to ${partnerName}…`}
          aria-label={`Respond to ${partnerName}`}
        />
        <div class="composer__footer">
          <span class="composer__tip">{tip}</span>
          <button class="btn btn--primary btn--sm" disabled={!text.trim() || busy}>
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </section>
  );
}

/** A reply in the conversation. You can edit your own; earlier versions are kept for both of you. */
function Message({
  reply,
  mine,
  name,
  questionId,
  versions,
  loadVersions,
  onChange,
}: {
  reply: ResponseDTO;
  mine: boolean;
  name: string;
  questionId: string;
  versions: VersionDTO[] | undefined;
  loadVersions: () => void;
  onChange: (s: QuestionState) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(reply.text);
  const [busy, setBusy] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  useEffect(() => {
    if (showVersions && !versions) loadVersions();
  }, [showVersions, versions]);

  async function save(e: Event) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    if (text.trim() === reply.text) return setEditing(false);
    setBusy(true);
    try {
      onChange(await api.editReply(questionId, reply.id, text));
      setEditing(false);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li class={`message message--${mine ? 'me' : 'partner'}${editing ? ' message--editing' : ''}`}>
      <span class="message__meta">
        {mine ? 'You' : name} · {relativeTime(reply.createdAt)}
        {reply.editedAt && (
          <>
            {' · '}
            <button type="button" class="message__action" aria-expanded={showVersions} onClick={() => setShowVersions(!showVersions)}>
              edited
            </button>
          </>
        )}
        {mine && !editing && (
          <>
            {' · '}
            <button
              type="button"
              class="message__action"
              onClick={() => {
                setText(reply.text);
                setEditing(true);
              }}
            >
              Edit
            </button>
          </>
        )}
      </span>
      {editing ? (
        <form class="message__edit" onSubmit={save}>
          <AutoTextarea value={text} onValue={setText} maxLength={LIMITS.responseMax} rows={2} aria-label="Edit your reply" />
          <div class="row">
            <button type="button" class="btn btn--ghost btn--sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button class="btn btn--primary btn--sm" disabled={!text.trim() || busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      ) : (
        <p class="message__text">{reply.text}</p>
      )}
      {showVersions && <VersionList versions={versions} />}
    </li>
  );
}
