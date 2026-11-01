<!--
  Matching: each left item has a native <select> listing the right column in
  its fixed display order. Works with keyboard, touch and pointer. After a
  check, each pair is marked right or not right in text.
-->
<script lang="ts">
  import type { MatchQuestion } from '../../lib/exercises/schema';
  import type { CheckResult, MatchResponse } from '../../lib/exercises/check';
  import Icon from './Icon.svelte';
  import RichText from './RichText.svelte';

  interface Props {
    q: MatchQuestion;
    response: MatchResponse;
    locked: boolean;
    showAnswer: boolean;
    result?: CheckResult | undefined;
    idPrefix: string;
  }

  let { q, response = $bindable(), locked, showAnswer, result, idPrefix }: Props = $props();

  const byId = $derived(new Map(q.pairs.map((p) => [p.id, p])));
  const leftLang = $derived(q.leftLang === 'uk' ? 'uk' : undefined);
  const rightLang = $derived(q.rightLang === 'uk' ? 'uk' : undefined);
</script>

<p class="prompt" id="{idPrefix}-prompt"><RichText text={q.prompt} /></p>
<ul class="pairs" aria-labelledby="{idPrefix}-prompt">
  {#each q.pairs as p (p.id)}
    {@const mark = !locked && result?.pairs ? result.pairs[p.id] : undefined}
    <li class="pair">
      <label class="pair__left" for="{idPrefix}-{p.id}" lang={leftLang}>{p.left}</label>
      <select
        id="{idPrefix}-{p.id}"
        class="pair__select"
        bind:value={response[p.id]}
        disabled={locked}
        aria-invalid={mark === false ? 'true' : undefined}
        aria-describedby={showAnswer || mark !== undefined ? `${idPrefix}-${p.id}-mark` : undefined}
      >
        <option value="">Choose…</option>
        {#each q.rightOrder as rid (rid)}
          <option value={rid} lang={rightLang}>{byId.get(rid)?.right}</option>
        {/each}
      </select>
      {#if showAnswer}
        <span class="mark mark--correct" id="{idPrefix}-{p.id}-mark"><Icon name="correct" /><span>Answer: <span lang={rightLang}>{p.right}</span></span></span>
      {:else if mark === true}
        <span class="mark mark--correct" id="{idPrefix}-{p.id}-mark"><Icon name="correct" />Right</span>
      {:else if mark === false}
        <span class="mark" id="{idPrefix}-{p.id}-mark"><Icon name="incorrect" />Not this one</span>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .prompt {
    margin: 0 0 var(--space-4);
    font-weight: var(--weight-semibold);
  }

  .pairs {
    display: grid;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  @media (min-width: 640px) {
    .pair {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
      align-items: center;
    }

    .mark {
      grid-column: 2;
    }
  }

  .pair__left {
    font-size: var(--text-lg);
    font-weight: var(--weight-medium);
  }

  .pair__select {
    width: 100%;
    min-height: var(--touch-target);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-bg);
    color: var(--color-text);
    font: inherit;
  }

  .pair__select:disabled {
    border-style: dashed;
    opacity: 1;
    color: var(--color-text);
  }

  .mark {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }

  .mark--correct {
    color: var(--color-blue);
  }
</style>
