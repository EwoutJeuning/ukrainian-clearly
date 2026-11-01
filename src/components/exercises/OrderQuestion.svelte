<!--
  Word order: tap or press a word in the bank to add it to the sentence; each
  placed word has buttons to move it earlier or later, or to remove it.
  No dragging. Focus stays on a sensible control after every change.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import type { OrderQuestion } from '../../lib/exercises/schema';
  import Icon from './Icon.svelte';
  import RichText from './RichText.svelte';

  interface Props {
    q: OrderQuestion;
    response: string[];
    locked: boolean;
    idPrefix: string;
    /** Called when the bank becomes empty, so the player can focus "Check answer". */
    onbankempty: () => void;
  }

  let { q, response = $bindable(), locked, idPrefix, onbankempty }: Props = $props();

  const text = $derived(new Map(q.tokens.map((t) => [t.id, t.text])));
  const bank = $derived(q.tokens.filter((t) => !response.includes(t.id)));
  let root = $state<HTMLElement>();

  function focusControl(selector: string) {
    root?.querySelector<HTMLButtonElement>(selector)?.focus();
  }

  async function add(id: string, bankIndex: number) {
    if (locked) return;
    response = [...response, id];
    await tick();
    const left = bank.length;
    if (left === 0) onbankempty();
    else focusControl(`[data-bank-index="${Math.min(bankIndex, left - 1)}"]`);
  }

  async function remove(index: number) {
    if (locked) return;
    const id = response[index];
    response = response.filter((_, i) => i !== index);
    await tick();
    focusControl(`[data-bank-token="${id}"]`);
  }

  async function move(index: number, delta: -1 | 1) {
    const to = index + delta;
    if (locked || to < 0 || to >= response.length) return;
    const next = [...response];
    [next[index], next[to]] = [next[to]!, next[index]!];
    response = next;
    await tick();
    const id = next[to];
    // At either end the pressed button is disabled; use the other direction.
    const atEdge = (delta === -1 && to === 0) || (delta === 1 && to === next.length - 1);
    const act = atEdge ? (delta === -1 ? 'later' : 'earlier') : delta === -1 ? 'earlier' : 'later';
    focusControl(`[data-token="${id}"][data-act="${act}"]`);
  }
</script>

<div bind:this={root}>
  <p class="prompt"><RichText text={q.prompt} /></p>
  <p class="meta"><span class="meta__label">Meaning:</span> <RichText text={q.translation} /></p>

  <div class="area">
    <p class="area__label" id="{idPrefix}-answer">Your sentence</p>
    {#if response.length === 0}
      <p class="area__empty">Choose words from the word bank below.</p>
    {:else}
      <ol class="placed" aria-labelledby="{idPrefix}-answer">
        {#each response as id, i (id)}
          {@const word = text.get(id) ?? ''}
          <li class="placed__item">
            <span class="token token--placed" lang="uk">{word}</span>
            {#if !locked}
              <span class="placed__controls">
                <button type="button" class="ctl" data-token={id} data-act="earlier" disabled={i === 0} onclick={() => move(i, -1)}>
                  <Icon name="up" /><span class="visually-hidden">Move <span lang="uk">{word}</span> earlier</span>
                </button>
                <button
                  type="button"
                  class="ctl"
                  data-token={id}
                  data-act="later"
                  disabled={i === response.length - 1}
                  onclick={() => move(i, 1)}
                >
                  <Icon name="down" /><span class="visually-hidden">Move <span lang="uk">{word}</span> later</span>
                </button>
                <button type="button" class="ctl" data-token={id} data-act="remove" onclick={() => remove(i)}>
                  <Icon name="remove" /><span class="visually-hidden">Remove <span lang="uk">{word}</span></span>
                </button>
              </span>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  </div>

  {#if !locked}
    <div class="bank">
      <p class="area__label" id="{idPrefix}-bank">Word bank</p>
      {#if bank.length === 0}
        <p class="area__empty">All words are placed. Reorder them if needed, then check your answer.</p>
      {:else}
        <ul class="bank__list" aria-labelledby="{idPrefix}-bank">
          {#each bank as t, i (t.id)}
            <li>
              <button type="button" class="token token--bank" data-bank-index={i} data-bank-token={t.id} onclick={() => add(t.id, i)}>
                <Icon name="add" /><span class="visually-hidden">Add </span><span lang="uk">{t.text}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

<style>
  .prompt {
    margin: 0 0 var(--space-2);
    font-weight: var(--weight-semibold);
  }

  .meta {
    margin: 0 0 var(--space-4);
    color: var(--color-text-muted);
  }

  .meta__label {
    font-weight: var(--weight-semibold);
  }

  .area,
  .bank {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
  }

  .area {
    border: 1px solid var(--color-border-strong);
    background: var(--color-blue-pale);
  }

  .bank {
    margin-top: var(--space-3);
    border: 1px dashed var(--color-border-strong);
  }

  .area__label {
    margin: 0 0 var(--space-2);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    color: var(--color-text-muted);
  }

  .area__empty {
    margin: 0;
    color: var(--color-text-muted);
  }

  .placed,
  .bank__list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .placed__item {
    display: inline-flex;
    flex-wrap: wrap;
    max-width: 100%;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-bg);
  }

  .placed__controls {
    display: inline-flex;
  }

  .token {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--touch-target);
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-lg);
  }

  .token--bank {
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-bg);
    color: var(--color-text);
    font-family: inherit;
    cursor: pointer;
  }

  .token--bank :global(.icon) {
    color: var(--color-blue);
    font-size: var(--text-sm);
  }

  .token--bank:hover,
  .ctl:hover:not(:disabled) {
    border-color: var(--color-blue);
    background: var(--color-blue-pale);
  }

  .ctl {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--touch-target);
    height: var(--touch-target);
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-blue);
    cursor: pointer;
  }

  .ctl:disabled {
    color: var(--color-border-strong);
    opacity: 0.5;
    cursor: default;
  }
</style>
