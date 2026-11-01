<!-- Small decorative icons. Always paired with visible text; never the only cue. -->
<script lang="ts" module>
  export type IconName = 'correct' | 'incorrect' | 'revealed' | 'hint' | 'info' | 'up' | 'down' | 'remove' | 'add';
</script>

<script lang="ts">
  let { name }: { name: IconName } = $props();
</script>

<svg class="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
  {#if name === 'correct'}
    <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6" />
    <path d="M5 8.2l2 2 4-4.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
  {:else if name === 'incorrect'}
    <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6" />
    <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  {:else if name === 'revealed'}
    <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z" fill="none" stroke="currentColor" stroke-width="1.5" />
    <circle cx="8" cy="8" r="2" fill="currentColor" />
  {:else if name === 'hint'}
    <path d="M8 1.8a4.4 4.4 0 0 0-2.6 8v1.7h5.2V9.8A4.4 4.4 0 0 0 8 1.8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
    <path d="M6 13.8h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  {:else if name === 'info'}
    <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6" />
    <path d="M8 7v4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    <circle cx="8" cy="4.75" r="1" fill="currentColor" />
  {:else if name === 'up'}
    <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
  {:else if name === 'down'}
    <path d="M8 3v10M3.5 8.5L8 13l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
  {:else if name === 'remove'}
    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
  {:else if name === 'add'}
    <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
  {/if}
</svg>

<style>
  .icon {
    flex: none;
    width: 1em;
    height: 1em;
  }
</style>
