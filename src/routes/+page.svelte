<script lang="ts">
  import { onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { fade } from 'svelte/transition';
  let team = '';
  let results: any[] = [];
  let loading = false;
  let error = '';
  let showDropdown = false;
  let abortController: AbortController | null = null;

  // Debounce timer
  let debounceTimer: ReturnType<typeof setTimeout>;

  // Expanded and corrected placeholder teams array
  let placeholderTeams = [
    // Europe
    'Manchester United', 'Real Madrid', 'Barcelona', 'Bayern Munich', 'Juventus', 'Paris Saint-Germain', 'Ajax', 'Celtic', 'Rangers', 'Shamrock Rovers', 'HJK', 'AIK', 'FC Copenhagen', 'Benfica', 'Porto', 'Sporting CP', 'Galatasaray', 'Fenerbahce', 'Olympiacos', 'Dynamo Kyiv',
    'Arsenal', 'Chelsea', 'Liverpool', 'Tottenham Hotspur', 'Inter Milan', 'AC Milan', 'Atletico Madrid', 'Borussia Dortmund', 'RB Leipzig', 'Sevilla', 'Lyon', 'Marseille', 'PSV Eindhoven', 'Club Brugge', 'Zenit St. Petersburg', 'Spartak Moscow', 'Rapid Wien', 'Lech Poznań', 'Ferencváros', 'Partizan Belgrade', 'CFR Cluj',
    // South America
    'Boca Juniors', 'River Plate', 'Flamengo', 'Palmeiras', 'Santos', 'Corinthians', 'Nacional', 'Peñarol', 'Colo-Colo',
    'São Paulo', 'Internacional', 'Atlético Mineiro', 'Grêmio', 'Universidad de Chile', 'Universitario', 'Emelec', 'LDU Quito', 'Olimpia', 'Cerro Porteño', 'Bolívar',
    // Africa
    'Al Ahly', 'Zamalek', 'Mamelodi Sundowns', 'Kaizer Chiefs', 'Esperance', 'Wydad Casablanca', 'TP Mazembe',
    'Raja Casablanca', 'Orlando Pirates', 'Simba SC', 'Al-Merrikh', 'JS Kabylie', 'ASEC Mimosas', 'Horoya AC',
    // Asia
    'Al-Hilal', 'Al-Nassr', 'Urawa Red Diamonds', 'Kashima Antlers', 'Jeonbuk Hyundai', 'Guangzhou Evergrande', 'Persepolis',
    'Suwon Samsung Bluewings', 'Shanghai SIPG', 'Al-Sadd', 'Esteghlal', 'Sepahan', 'Buriram United',
    // North America
    'LA Galaxy', 'Club América', 'Tigres UANL', 'Toronto FC', 'Seattle Sounders', 'New York City FC', 'CF Montréal',
    'Chivas Guadalajara', 'Cruz Azul', 'Monterrey', 'Pachuca', 'Saprissa', 'Alajuelense', 'Motagua', 'Comunicaciones',
    // Oceania
    'Sydney FC', 'Auckland City', 'Wellington Phoenix', 'Melbourne Victory', 'Central Coast Mariners',
    // Middle East
    'Al-Ettifaq', 'Al-Ain', 'Hapoel Tel Aviv', 'Maccabi Haifa',
    // Others
    'Dinamo Zagreb', 'Red Star Belgrade', 'Shakhtar Donetsk', 'Basel', 'Young Boys', 'Anderlecht', 'Sparta Prague', 'Slovan Bratislava', 'Ludogorets Razgrad', 'Sheriff Tiraspol'
  ];

  // Shuffle the array (Fisher-Yates, not cryptographically random)
  function shuffleArray(arr: any[]) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  shuffleArray(placeholderTeams);

  let placeholderIndex = 0;
  let placeholder = placeholderTeams[0];
  let placeholderInterval: ReturnType<typeof setInterval>;

  function startPlaceholderSwitcher() {
    placeholderInterval = setInterval(() => {
      placeholderIndex = (placeholderIndex + 1) % placeholderTeams.length;
      placeholder = placeholderTeams[placeholderIndex];
    }, 2000);
  }

  startPlaceholderSwitcher();

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
    clearInterval(placeholderInterval);
  });
</script>

<main class="container">
  <form class="search-form" on:submit|preventDefault>
    <div class="autocomplete-wrapper">
      <input
        type="text"
        placeholder={team ? '' : `e.g. ${placeholder}`}
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
    Find your favourite team and experiment with potential transfers and budgets.
    <br><br>
    Search to get started!
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
    max-width: 720px;
  }
  .autocomplete-wrapper {
    position: relative;
    width: 100%;
  }
  input[type="text"] {
    flex: 1;
    padding: 1.3rem;
    font-size: 1rem;
    width: 100%;
    margin: 1rem auto 0;
    border-radius: 2px;
    border: none;
  }
  input:focus-visible {
    outline-color: var(--positive-green);
  }
  .loader {
    position: absolute;
    right: 20px;
    top: 60%;
    transform: translateY(-50%);
    width: 18px;
    height: 18px;
    border: 2px solid var(--positive-green);
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
    border: 1px solid #ccc;
    border-radius: 0 0 8px 8px;
    z-index: 10;
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 200px;
    overflow-y: auto;
    background: #fff;
    color: #222;
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
    background: var(--positive-green);
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.2s;
  }
  button:hover {
    background: var(--positive-green);
  }
  .description {
    font-size: min(3.5rem, 13vw);
    margin-top: 3rem;
    max-width: 760px;
  }
  .error {
    color: var(--negative-red);
    margin-bottom: 1rem;
  }
</style>
<svelte:head>
		<title>{'Transferplay'}</title>
		<meta name="description" content={'Simulate football/soccer transfers, budgets, and lineups for any club using real data from Transfermarkt. Plan your dream squad and share your edits!'}>
		<meta property="og:title" content={'Transferplay'}>
		<meta property="og:description" content={'Simulate football/soccer transfers, budgets, and lineups for any club using real data from Transfermarkt. Plan your dream squad and share your edits!'}>
		<meta property="og:type" content="website">
		<meta name="twitter:card" content="summary_large_image">
</svelte:head> 