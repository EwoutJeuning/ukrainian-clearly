<!--
  A feedback panel: icon + text label + body. The label carries the meaning
  ("Correct", "Not quite", ...); colour only supports it.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  type Kind = 'correct' | 'incorrect' | 'revealed' | 'hint' | 'info';
  let { kind, label, children }: { kind: Kind; label: string; children?: Snippet } = $props();
</script>

<div class="feedback feedback--{kind}" data-feedback={kind}>
  <p class="feedback__label"><Icon name={kind} /><span>{label}</span></p>
  {#if children}
    <div class="feedback__body">{@render children()}</div>
  {/if}
</div>

<style>
  .feedback {
    padding: var(--space-4) var(--space-6);
    border: 1px solid var(--color-border);
    border-left-width: 4px;
    border-radius: var(--radius-md);
    background: var(--color-bg);
  }

  .feedback--correct {
    border-color: var(--color-blue);
    background: var(--color-blue-pale);
  }

  .feedback--incorrect {
    border-color: var(--color-text);
    background: var(--color-yellow-pale);
  }

  .feedback--revealed {
    border-color: var(--color-border-strong);
  }

  .feedback--hint,
  .feedback--info {
    border-color: var(--color-yellow);
    background: var(--color-yellow-pale);
  }

  .feedback__label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    font-weight: var(--weight-bold);
  }

  .feedback--correct .feedback__label {
    color: var(--color-blue);
  }

  .feedback__body {
    margin-top: var(--space-2);
  }

  .feedback__body :global(p) {
    margin: 0;
  }

  .feedback__body :global(* + *) {
    margin-top: var(--space-2);
  }
</style>
