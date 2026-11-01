<!--
  Plays one exercise set (plan.md E4). Answer checking lives in
  src/lib/exercises/check.ts, state transitions and storage in state.ts; this
  component only presents them.

  Focus: Next / Skip / retry move focus to the new question's heading; checking
  never moves focus away from a text input. If the control that had focus
  disappears (e.g. "Show answer"), focus moves to the next action.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { Question } from '../../lib/exercises/schema';
  import {
    checkQuestion,
    displayAnswer,
    responseKey,
    type CheckResult,
    type MatchResponse,
    type Response,
  } from '../../lib/exercises/check';
  import {
    applyCheck,
    browserStorage,
    clearProgress,
    goTo,
    initialState,
    isSettled,
    loadProgress,
    nextOpen,
    outcome,
    retryAll,
    retryNeedsPractice,
    reveal,
    saveProgress,
    showHint,
    summarize,
    type SetState,
    type StorageLike,
  } from '../../lib/exercises/state';
  import ChoiceQuestion from './ChoiceQuestion.svelte';
  import FillQuestion from './FillQuestion.svelte';
  import OrderQuestion from './OrderQuestion.svelte';
  import MatchQuestion from './MatchQuestion.svelte';
  import Feedback from './Feedback.svelte';
  import Icon from './Icon.svelte';
  import RichText from './RichText.svelte';

  interface Props {
    setId: string;
    questions: Question[];
    /** Lesson page path (without #anchor) -> page title, for "Read more" links. */
    lessonTitles?: Record<string, string>;
  }

  let { setId, questions, lessonTitles = {} }: Props = $props();

  const emptyResponse = (q: Question): Response =>
    q.type === 'choice' ? null : q.type === 'fill' ? '' : q.type === 'order' ? [] : ({} as MatchResponse);
  const freshResponses = () => Object.fromEntries(questions.map((q) => [q.id, emptyResponse(q)]));

  // Server render and first client render use the same fresh state (no
  // hydration mismatch); saved progress is applied after mounting.
  let progress = $state<SetState>(initialState(questions));
  let responses = $state<Record<string, Response>>(freshResponses());
  /** The last check per question, with the response key it was made for. */
  let checks = $state<Record<string, { result: CheckResult; key: string } | undefined>>({});
  let announcement = $state('');
  let storage: StorageLike | undefined;
  let storageAvailable = $state(true);
  let mounted = $state(false);

  let heading = $state<HTMLElement>();
  let summaryHeading = $state<HTMLElement>();
  let nextButton = $state<HTMLButtonElement>();
  let checkButton = $state<HTMLButtonElement>();
  let questionArea = $state<HTMLElement>();

  const total = $derived(questions.length);
  const q = $derived(questions[progress.current]!);
  const qs = $derived(progress.questions[q.id]);
  const settled = $derived(isSettled(qs));
  const revealed = $derived(qs?.status === 'revealed');
  const correct = $derived(qs?.status === 'correct');
  const check = $derived(checks[q.id]);
  /** The last result, only while the learner has not changed the response since. */
  const current = $derived(check && check.key === responseKey(q, responses[q.id]) ? check.result : undefined);
  const summary = $derived(summarize(progress, questions));
  const toPractise = $derived(summary.total - summary.firstTry);
  const nextIsSummary = $derived(nextOpen(progress, questions).view === 'summary');
  const lessonHref = $derived(q.lesson);
  const lessonTitle = $derived(q.lesson ? lessonTitles[q.lesson.replace(/#.*$/, '')] : undefined);

  onMount(() => {
    storage = browserStorage();
    storageAvailable = Boolean(storage);
    progress = loadProgress(storage, setId, questions);
    mounted = true;
  });

  $effect(() => {
    if (!mounted) return;
    const snapshot = $state.snapshot(progress);
    storageAvailable = saveProgress(storage, setId, questions, snapshot);
  });

  async function announce(text: string) {
    // Clear first so the same message is read again when repeated.
    announcement = '';
    await tick();
    announcement = text;
  }

  /** After a change that removed the focused control, focus the next action. */
  async function keepFocus() {
    await tick();
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) (nextButton ?? heading)?.focus();
  }

  async function focusHeading() {
    await tick();
    (progress.view === 'summary' ? summaryHeading : heading)?.focus();
  }

  function onCheck() {
    if (settled) return;
    const response = responses[q.id];
    const result = checkQuestion(q, response);
    const key = responseKey(q, response);
    progress = applyCheck(progress, q.id, result, key);
    checks[q.id] = { result, key };
    if (result.verdict === 'correct') announce('Correct.');
    else if (result.verdict === 'incorrect') announce(`Not quite. ${result.feedback ?? 'Try again, or use the hint.'}`);
    else announce(result.feedback ?? 'Answer the question first.');
    keepFocus();
  }

  function onHint() {
    progress = showHint(progress, q.id);
    announce(`Hint: ${q.hint ?? ''}`);
    keepFocus();
  }

  function onReveal() {
    progress = reveal(progress, q.id);
    announce(`Answer shown: ${displayAnswer(q)}`);
    keepFocus();
  }

  async function onTryAgain() {
    checks[q.id] = undefined;
    announcement = '';
    await tick();
    questionArea?.querySelector<HTMLElement>('input:not([type=hidden]), select, button')?.focus();
  }

  function onNext() {
    progress = nextOpen(progress, questions);
    announcement = '';
    focusHeading();
  }

  function startOver(state: SetState) {
    progress = state;
    for (const x of questions) {
      if (!isSettled(state.questions[x.id])) {
        responses[x.id] = emptyResponse(x);
        checks[x.id] = undefined;
      }
    }
    announcement = '';
    focusHeading();
  }

  const onRetryAll = () => startOver(retryAll(questions));
  const onRetryPractice = () => startOver(retryNeedsPractice(progress, questions));
  const onGoTo = (index: number) => {
    progress = goTo(progress, index, total);
    focusHeading();
  };

  function onReset() {
    clearProgress(storage, setId);
    startOver(retryAll(questions));
    announce('Progress reset. Starting from question 1.');
  }

  const STATUS_LABEL = {
    'first-try': 'Right first time',
    'after-retry': 'Right after another try',
    revealed: 'Answer shown',
    open: 'Not answered yet',
  } as const;
</script>

<section class="exercise" aria-label="Practice" data-exercise-set={setId} data-ready={mounted ? 'true' : undefined}>
  <!-- Feedback announcements: short text only, read politely. -->
  <p class="visually-hidden" aria-live="polite" aria-atomic="true" data-live>{announcement}</p>

  {#if progress.view === 'question'}
    <div class="exercise__head">
      <h2 class="exercise__title" tabindex="-1" bind:this={heading}>Question {progress.current + 1} of {total}</h2>
      {#if correct}
        <p class="status status--correct"><Icon name="correct" />Answered</p>
      {:else if revealed}
        <p class="status"><Icon name="revealed" />Answer shown</p>
      {/if}
    </div>
    <div class="progress" aria-hidden="true">
      <span class="progress__bar" style:width="{((progress.current + 1) / total) * 100}%"></span>
    </div>

    {#key q.id}
      <div class="exercise__question" bind:this={questionArea} data-question={q.id} data-type={q.type}>
        {#if q.type === 'choice'}
          <ChoiceQuestion
            {q}
            bind:response={() => responses[q.id] as string | null, (v) => (responses[q.id] = v)}
            locked={settled}
            showAnswer={settled}
            result={current}
            idPrefix="{setId}-{q.id}"
          />
        {:else if q.type === 'fill'}
          <FillQuestion {q} bind:response={() => responses[q.id] as string, (v) => (responses[q.id] = v)} locked={settled} idPrefix="{setId}-{q.id}" onsubmit={onCheck} />
        {:else if q.type === 'order'}
          <OrderQuestion
            {q}
            bind:response={() => responses[q.id] as string[], (v) => (responses[q.id] = v)}
            locked={settled}
            idPrefix="{setId}-{q.id}"
            onbankempty={() => checkButton?.focus()}
          />
        {:else}
          <MatchQuestion
            {q}
            bind:response={() => responses[q.id] as MatchResponse, (v) => (responses[q.id] = v)}
            locked={settled}
            showAnswer={settled}
            result={current}
            idPrefix="{setId}-{q.id}"
          />
        {/if}
      </div>
    {/key}

    <div class="exercise__feedback">
      {#if qs?.hintShown && !settled && q.hint}
        <Feedback kind="hint" label="Hint"><p><RichText text={q.hint} /></p></Feedback>
      {/if}

      {#if correct || revealed}
        <Feedback kind={correct ? 'correct' : 'revealed'} label={correct ? 'Correct' : 'Answer shown'}>
          {#if q.type === 'fill' || q.type === 'order'}
            <p><span class="answer-label">Answer:</span> <span class="answer" lang="uk">{displayAnswer(q)}</span></p>
          {/if}
          <p><RichText text={q.explanation} /></p>
          {#if lessonHref}
            <p><a href={lessonHref}>Read more{lessonTitle ? `: ${lessonTitle}` : ' in the lesson'}</a></p>
          {/if}
        </Feedback>
      {:else if current?.verdict === 'incorrect'}
        <Feedback kind="incorrect" label="Not quite">
          <p><RichText text={current.feedback ?? 'That is not the expected answer. Try again, or use the hint.'} /></p>
        </Feedback>
      {:else if current && (current.verdict === 'empty' || current.verdict === 'incomplete')}
        <Feedback kind="info" label="Nothing checked yet">
          <p>{current.feedback}</p>
        </Feedback>
      {/if}
    </div>

    <div class="actions">
      {#if !settled}
        <button type="button" class="button" bind:this={checkButton} onclick={onCheck}>Check answer</button>
        {#if current?.verdict === 'incorrect'}
          <button type="button" class="button button--secondary" onclick={onTryAgain}>Try again</button>
        {/if}
        {#if q.hint && !qs?.hintShown}
          <button type="button" class="button button--secondary" onclick={onHint}>Hint</button>
        {/if}
        <button type="button" class="button button--secondary" onclick={onReveal}>Show answer</button>
      {/if}
      <button type="button" class="button" class:button--secondary={!settled} bind:this={nextButton} onclick={onNext}>
        {#if !settled}Skip for now{:else if nextIsSummary}See your results{:else}Next question{/if}
      </button>
    </div>
  {:else}
    <h2 class="exercise__title" tabindex="-1" bind:this={summaryHeading}>Your results</h2>
    {#if summary.complete}
      <p class="status status--correct"><Icon name="correct" />Set completed</p>
    {:else}
      <p>Some questions are not answered yet. You can go back to them below.</p>
    {/if}

    <dl class="summary">
      <div><dt>Right first time</dt><dd>{summary.firstTry}</dd></div>
      <div><dt>Right after another try</dt><dd>{summary.afterRetry}</dd></div>
      <div><dt>Answer shown</dt><dd>{summary.revealed}</dd></div>
      <div><dt>Not answered yet</dt><dd>{summary.open}</dd></div>
      <div><dt>Hints used</dt><dd>{summary.hintsUsed}</dd></div>
    </dl>

    <ol class="summary-list">
      {#each questions as x, i (x.id)}
        {@const s = outcome(progress.questions[x.id])}
        <li>
          <button type="button" class="link-button" onclick={() => onGoTo(i)}>Question {i + 1}</button>:
          <span class="outcome outcome--{s}">
            <Icon name={s === 'first-try' || s === 'after-retry' ? 'correct' : s === 'revealed' ? 'revealed' : 'info'} />{STATUS_LABEL[s]}
          </span>
        </li>
      {/each}
    </ol>

    <div class="actions">
      {#if toPractise > 0}
        <button type="button" class="button" onclick={onRetryPractice}>
          Practise the {toPractise === 1 ? 'question' : `${toPractise} questions`} that need it
        </button>
      {/if}
      <button type="button" class="button" class:button--secondary={toPractise > 0} onclick={onRetryAll}>Start the set again</button>
    </div>
  {/if}

  <div class="storage-note">
    {#if storageAvailable}
      <p>Your progress on this set is saved only in this browser. Nothing is sent anywhere.</p>
      <button type="button" class="link-button" onclick={onReset}>Reset progress</button>
    {:else}
      <p>Progress cannot be saved in this browser, but the exercises still work.</p>
    {/if}
  </div>
</section>

<style>
  .exercise {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    padding: var(--space-6);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-lg);
    background: var(--color-bg);
  }

  @media (max-width: 39.9375rem) {
    .exercise {
      padding: var(--space-4);
    }
  }

  .exercise__head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2) var(--space-4);
  }

  .exercise__title {
    font-size: var(--text-h3);
  }

  .exercise__title:focus {
    outline: none;
  }

  .exercise__title:focus-visible {
    outline: 3px solid var(--color-focus);
    outline-offset: 4px;
  }

  .progress {
    height: 6px;
    margin-top: calc(-1 * var(--space-4));
    border-radius: var(--radius-pill);
    background: var(--color-border);
    overflow: hidden;
  }

  .progress__bar {
    display: block;
    height: 100%;
    background: var(--color-blue);
    transition: width var(--duration) var(--ease);
  }

  .exercise__feedback {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .exercise__feedback:empty {
    display: none;
  }

  .answer-label {
    font-weight: var(--weight-semibold);
  }

  .answer {
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    font-weight: var(--weight-semibold);
    color: var(--color-text-muted);
  }

  .status--correct {
    color: var(--color-blue);
  }

  .summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: var(--space-3);
    margin: 0;
  }

  .summary div {
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .summary dt {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .summary dd {
    margin: 0;
    font-size: var(--text-h3);
    font-weight: var(--weight-bold);
  }

  .summary-list {
    margin: 0;
    padding-left: 0;
    list-style: none;
    display: grid;
    gap: var(--space-1);
  }

  .outcome {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .outcome--first-try,
  .outcome--after-retry {
    color: var(--color-blue);
  }

  .link-button {
    min-height: var(--touch-target);
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-blue);
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 0.2em;
    cursor: pointer;
  }

  .link-button:hover {
    color: var(--color-blue-hover);
    text-decoration-thickness: 2px;
  }

  .storage-note {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 var(--space-4);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-border);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .storage-note p {
    margin: 0;
  }
</style>
