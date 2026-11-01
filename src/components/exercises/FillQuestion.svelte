<!--
  Fill in the blank: one labelled text input inside the Ukrainian sentence.
  Enter checks the answer (the form's submit); the page never navigates.
  An on-screen panel inserts any of the 33 letters of the Ukrainian alphabet
  and the apostrophe, for people without a Ukrainian keyboard layout.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import type { FillQuestion } from '../../lib/exercises/schema';
  import RichText from './RichText.svelte';

  interface Props {
    q: FillQuestion;
    response: string;
    locked: boolean;
    idPrefix: string;
    onsubmit: () => void;
  }

  let { q, response = $bindable(), locked, idPrefix, onsubmit }: Props = $props();

  const parts = $derived(q.text.split('___'));
  const size = $derived(Math.max(4, ...q.answers.map((a) => [...a].length + 2)));
  // The 33 letters in alphabetical order (Pravopys §4), then the apostrophe.
  const LETTERS = [...'абвгґдеєжзиіїйклмнопрстуфхцчшщьюя', '’'];
  let input = $state<HTMLInputElement>();

  async function insert(ch: string) {
    if (!input || locked) return;
    const start = input.selectionStart ?? response.length;
    const end = input.selectionEnd ?? response.length;
    response = response.slice(0, start) + ch + response.slice(end);
    await tick();
    input.focus();
    input.setSelectionRange(start + ch.length, start + ch.length);
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    onsubmit();
  }
</script>

<p class="prompt"><RichText text={q.prompt} /></p>
<form class="fill" onsubmit={submit} novalidate>
  <label class="visually-hidden" for="{idPrefix}-input">Missing word</label>
  <p class="sentence" lang="uk">
    {parts[0]}<input
      bind:this={input}
      bind:value={response}
      id="{idPrefix}-input"
      class="blank"
      style:--size="{size}ch"
      type="text"
      lang="uk"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      enterkeyhint="done"
      readonly={locked}
      aria-describedby="{idPrefix}-sentence {idPrefix}-translation{q.cue ? ` ${idPrefix}-cue` : ''}"
    />{parts[1]}
  </p>
  <p class="visually-hidden" id="{idPrefix}-sentence">Sentence: <span lang="uk">{parts[0].trim()} … {parts[1].trim()}</span></p>
  <p class="meta" id="{idPrefix}-translation"><span class="meta__label">Meaning:</span> <RichText text={q.translation} /></p>
  {#if q.cue}
    <p class="meta" id="{idPrefix}-cue"><span class="meta__label">Word to use:</span> <span lang="uk">{q.cue}</span></p>
  {/if}
</form>

{#if !locked}
  <p class="helper__note">Stress marks are optional.</p>
  <details class="helper" open>
    <summary id="{idPrefix}-helper">Ukrainian letters (no Ukrainian keyboard?)</summary>
    <div class="helper__keys" role="group" aria-labelledby="{idPrefix}-helper">
      {#each LETTERS as ch (ch)}
        <button type="button" class="key" onclick={() => insert(ch)}>
          <span class="visually-hidden">Insert </span><span lang="uk">{ch}</span>{#if ch === '’'}<span class="visually-hidden"> (apostrophe)</span>{/if}
        </button>
      {/each}
    </div>
  </details>
{/if}

<style>
  .prompt {
    margin: 0 0 var(--space-4);
    font-weight: var(--weight-semibold);
  }

  .sentence {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border-left: 3px solid var(--color-blue);
    border-radius: var(--radius-sm);
    background: var(--color-blue-pale);
    font-size: var(--text-lg);
    line-height: 2.2;
  }

  .blank {
    width: min(100%, calc(var(--size) + 1.5rem));
    min-height: var(--touch-target);
    margin-inline: 0.25em;
    padding: var(--space-1) var(--space-3);
    border: 2px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-bg);
    color: var(--color-text);
    font: inherit;
    line-height: 1.3;
    vertical-align: middle;
  }

  .blank:focus-visible {
    border-color: var(--color-blue);
  }

  .blank[readonly] {
    border-style: dashed;
  }

  .meta {
    margin: var(--space-2) 0 0;
    color: var(--color-text-muted);
  }

  .meta__label {
    font-weight: var(--weight-semibold);
  }

  .helper__note {
    margin: var(--space-4) 0 0;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .helper {
    margin-top: var(--space-2);
  }

  .helper summary {
    min-height: var(--touch-target);
    display: flex;
    align-items: center;
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    color: var(--color-blue);
    cursor: pointer;
  }

  .helper__keys {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--touch-target), 1fr));
    gap: var(--space-1);
    max-width: 40rem;
    margin-top: var(--space-2);
  }

  .key {
    min-width: var(--touch-target);
    min-height: var(--touch-target);
    padding: var(--space-1);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-bg);
    color: var(--color-text);
    font: inherit;
    font-size: var(--text-lg);
    cursor: pointer;
  }

  .key:hover {
    border-color: var(--color-blue);
    background: var(--color-blue-pale);
  }
</style>
