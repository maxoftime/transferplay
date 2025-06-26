<script lang="ts">
  import { onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  let team = '';
  let results: any[] = [];
  let loading = false;
  let error = '';
  let showDropdown = false;
  let abortController: AbortController | null = null;

  // Debounce timer
  let debounceTimer: ReturnType<typeof setTimeout>;

  async function fetchTeams(query: string) {
    if (!query) {
      results = [];
      showDropdown = false;
      return;
    }
    loading = true;
    error = '';
    showDropdown = false;
    if (abortController) abortController.abort();
    abortController = new AbortController();
    try {
      // Call backend for team search (using the /api/team/:name endpoint)
      const res = await fetch(`/api/team/${encodeURIComponent(query)}`, {
        signal: abortController.signal
      });
      if (!res.ok) throw new Error('No team found');
      const data = await res.json();
      // For autocomplete, show all teams returned
      results = Array.isArray(data) ? data : [];
      showDropdown = results.length > 0;
    } catch (err: any) {
      results = [];
      showDropdown = false;
      if (err.name !== 'AbortError') error = 'No team found';
    } finally {
      loading = false;
    }
  }

  function onInput(e: Event) {
    clearTimeout(debounceTimer);
    team = (e.target as HTMLInputElement).value;
    debounceTimer = setTimeout(() => fetchTeams(team), 350);
  }

  function selectTeam(result: any) {
    team = result.name;
    showDropdown = false;
    // Extract slug from the team URL (remove domain and leading slash)
    const url = result.url;
    const slug = url.replace('https://www.transfermarkt.com/', '');
    goto(`/club/${slug}`);
  }

  onDestroy(() => {
    if (abortController) abortController.abort();
    clearTimeout(debounceTimer);
  });
</script>

<main class="container">
  <form class="search-form" on:submit|preventDefault>
    <div class="autocomplete-wrapper">
      <input
        type="text"
        placeholder="Search for a football team..."
        bind:value={team}
        aria-label="Team search"
        on:input={onInput}
        autocomplete="off"
        required
      />
      {#if loading}
        <span class="loader"></span>
      {/if}
      {#if showDropdown && results.length}
        <ul class="autocomplete-dropdown">
          {#each results as result}
            <li on:click={() => selectTeam(result)} tabindex="0" on:keydown={(e) => e.key === 'Enter' && selectTeam(result)}>
              {#if result.logo}
                <img src={result.logo} alt={result.name + ' logo'} class="team-logo" />
              {/if}
              <span>{result.name}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </form>
  {#if error}
    <div class="error">{error}</div>
  {/if}
  <p class="description">
    Find your favourite team and experiment with potential transfers and budgets. Search to get started!
  </p>
</main>

<style>
  .container {
    margin: 3rem auto;
  }
  .search-form {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    justify-content: center;
  }
  .autocomplete-wrapper {
    position: relative;
    width: 100%;
  }
  input[type="text"] {
    flex: 1;
    padding: 0.5rem 1rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 1rem;
    width: 100%;
  }
  .loader {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    width: 18px;
    height: 18px;
    border: 2px solid #0070f3;
    border-top: 2px solid transparent;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    0% { transform: translateY(-50%) rotate(0deg); }
    100% { transform: translateY(-50%) rotate(360deg); }
  }
  .autocomplete-dropdown {
    position: absolute;
    left: 0;
    right: 0;
    top: 110%;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 0 0 8px 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.07);
    z-index: 10;
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 200px;
    overflow-y: auto;
  }
  .team-logo {
    width: 28px;
    height: 28px;
    object-fit: contain;
    margin-right: 0.7rem;
    vertical-align: middle;
    border-radius: 4px;
    background: #f8f8f8;
    border: 1px solid #eee;
  }
  .autocomplete-dropdown li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.7rem 1rem;
    cursor: pointer;
    transition: background 0.15s;
  }
  .autocomplete-dropdown li:hover {
    background: #f0f4ff;
  }
  button {
    padding: 0.5rem 1.2rem;
    background: #0070f3;
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.2s;
  }
  button:hover {
    background: #005bb5;
  }
  .description {
    color: #444;
    font-size: 1.1rem;
    margin-top: 1.5rem;
  }
  .error {
    color: #c00;
    margin-bottom: 1rem;
  }
</style>
