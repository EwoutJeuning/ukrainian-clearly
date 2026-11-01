<!--
  Exercise text: plain text with *emphasis*. Cyrillic runs get lang="uk"
  (unless `uk` is set because the surrounding element already has it).
  No {@html}: content is rendered as text.
-->
<script lang="ts">
  import { splitUk } from '../../lib/uk-markup';

  let { text, uk = false }: { text: string; uk?: boolean } = $props();

  const parts = $derived(
    text
      .split(/(\*[^*\n]+\*)/)
      .filter(Boolean)
      .map((seg) => {
        const em = seg.length > 2 && seg.startsWith('*') && seg.endsWith('*');
        const body = em ? seg.slice(1, -1) : seg;
        return { em, runs: uk ? [{ text: body, uk: false }] : splitUk(body) };
      }),
  );
</script>

{#snippet runs(list: { text: string; uk: boolean }[])}{#each list as r, i (i)}{#if r.uk}<span lang="uk">{r.text}</span>{:else}{r.text}{/if}{/each}{/snippet}
{#each parts as part, i (i)}{#if part.em}<em>{@render runs(part.runs)}</em>{:else}{@render runs(part.runs)}{/if}{/each}
