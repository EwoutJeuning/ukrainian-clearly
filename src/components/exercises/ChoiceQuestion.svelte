<!-- Single choice: a radio group in a fieldset; the legend is the prompt. -->
<script lang="ts">
  import type { ChoiceQuestion } from '../../lib/exercises/schema';
  import type { CheckResult } from '../../lib/exercises/check';
  import Icon from './Icon.svelte';
  import RichText from './RichText.svelte';

  interface Props {
    q: ChoiceQuestion;
    response: string | null;
    locked: boolean;
    showAnswer: boolean;
    /** The last check, only while the response is unchanged since. */
    result?: CheckResult | undefined;
    idPrefix: string;
  }

  let { q, response = $bindable(), locked, showAnswer, result, idPrefix }: Props = $props();
  const lang = $derived(q.choiceLang === 'uk' ? 'uk' : undefined);
</script>

<fieldset class="choices">
  <legend class="prompt"><RichText text={q.prompt} /></legend>
  {#if q.context}
    <p class="context" lang="uk">{q.context}</p>
  {/if}
  <div class="choices__list">
    {#each q.choices as c (c.id)}
      {@const isAnswer = showAnswer && c.id === q.answer}
      {@const isWrong = !locked && result?.verdict === 'incorrect' && response === c.id}
      <label class="choice" class:choice--answer={isAnswer} class:choice--wrong={isWrong}>
        <input type="radio" name={idPrefix} value={c.id} bind:group={response} disabled={locked} />
        <span class="choice__text" {lang}>{c.text}</span>
        {#if isAnswer}
          <span class="mark mark--correct"><Icon name="correct" />Correct answer</span>
        {:else if isWrong}
          <span class="mark"><Icon name="incorrect" />Not this one</span>
        {/if}
      </label>
    {/each}
  </div>
</fieldset>

<style>
  .choices {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }

  .prompt {
    padding: 0;
    margin-bottom: var(--space-4);
    font-weight: var(--weight-semibold);
  }

  .context {
    margin: 0 0 var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-left: 3px solid var(--color-blue);
    border-radius: var(--radius-sm);
    background: var(--color-blue-pale);
    font-size: var(--text-lg);
  }

  .choices__list {
    display: grid;
    gap: var(--space-2);
  }

  .choice {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    min-height: var(--touch-target);
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-bg);
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease), border-color var(--duration-fast) var(--ease);
  }

  .choice:hover {
    border-color: var(--color-blue);
    background: var(--color-blue-pale);
  }

  .choice:has(input:checked) {
    border-color: var(--color-blue);
    box-shadow: inset 0 0 0 1px var(--color-blue);
  }

  .choice:has(input:focus-visible) {
    outline: 3px solid var(--color-focus);
    outline-offset: 2px;
  }

  .choice:has(input:disabled) {
    cursor: default;
  }

  .choice--answer {
    border-color: var(--color-blue);
    background: var(--color-blue-pale);
  }

  .choice--wrong {
    border-style: dashed;
    border-color: var(--color-text);
  }

  input {
    width: 1.25rem;
    height: 1.25rem;
    margin: 0;
    accent-color: var(--color-blue);
  }

  input:focus-visible {
    outline: none;
  }

  .choice__text {
    font-size: var(--text-lg);
  }

  .choice__text:not([lang]) {
    font-size: var(--text-base);
  }

  .mark {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    margin-left: auto;
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }

  .mark--correct {
    color: var(--color-blue);
  }
</style>
