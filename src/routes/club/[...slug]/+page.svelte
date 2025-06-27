<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { tick } from 'svelte';

  let club: any = null;
  let loading = true;
  let error = '';
  let playerSearch = '';
  let incoming: any[] = [];
  let outgoing: any[] = [];
  let playerResults: any[] = [];
  let playerSearchLoading = false;
  let playerSearchError = '';
  let showPlayerDropdown = false;
  let playerDebounce: ReturnType<typeof setTimeout>;
  let stateLoaded = false;
  let showIncoming = true;
  let showOutgoing = true;
  let showOriginalSquad = true;
  let showNewSquad = true;
  let showLineup = true;
  let showShareCopied = false;
  let loadedFromShare = false;

  $: slugArr = $page.params.slug;
  $: slug = Array.isArray(slugArr) ? slugArr.join('/') : slugArr;
  $: incomingJson = JSON.stringify(incoming);
  $: outgoingJson = JSON.stringify(outgoing);
  $: netValues = (() => { incomingJson; outgoingJson; return calculateNetValue(); })();
  $: squadDifference = (() => { incomingJson; outgoingJson; return calculateSquadDifference(); })();
  $: console.log('Arrays changed:', { incoming: incoming.length, outgoing: outgoing.length, netValues, squadDifference });

  $: squadDummy = JSON.stringify(club?.players) + incomingJson + outgoingJson;
  $: newSquad = (club && stateLoaded)
    ? [
        ...(club?.players?.filter(
          (player: any) => !outgoing.some((o) => o.name === player.name && o.value === player.value)
        ) ?? []),
        ...incoming
      ]
    : [];

  // Lineup builder state
  const formations = [
    { name: '4-3-3', positions: ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'CM', 'CM', 'LW', 'ST', 'RW'] },
    { name: '4-2-3-1', positions: ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'CDM', 'LM', 'CAM', 'RM', 'ST'] },
    { name: '4-4-2', positions: ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'] },
    { name: '3-5-2', positions: ['GK', 'CB', 'CB', 'CB', 'LWB', 'CDM', 'CM', 'CM', 'RWB', 'ST', 'ST'] },
    { name: '3-4-3', positions: ['GK', 'CB', 'CB', 'CB', 'LM', 'CM', 'CM', 'RM', 'LW', 'ST', 'RW'] },
  ];
  let selectedFormationName = formations[0].name;
  $: selectedFormation = formations.find(f => f.name === selectedFormationName) ?? formations[0];
  let lineup: { position: string, player: any | null }[] = [];

  $: if (selectedFormation && newSquad) {
    const validPlayers = newSquad.map(p => p.name);
    if (
      lineup.length !== selectedFormation.positions.length ||
      lineup.some(slot => slot.player && !validPlayers.includes(slot.player.name))
    ) {
      lineup = selectedFormation.positions.map(pos => ({ position: pos, player: null }));
    }
  }

  function setPlayerForPosition(idx: number, player: any) {
    lineup = lineup.map((slot, i) => i === idx ? { ...slot, player } : slot);
  }
  function removePlayerFromPosition(idx: number) {
    lineup = lineup.map((slot, i) => i === idx ? { ...slot, player: null } : slot);
  }
  function availablePlayers(idx: number) {
    const pickedKeys = lineup
      .filter((slot, i) => slot.player && i !== idx)
      .map(slot => slot.player && getPlayerKey(slot.player));
    const allKeys = newSquad.map(getPlayerKey);
    console.log('pickedKeys', pickedKeys, 'allKeys', allKeys, 'newSquad', newSquad);
    return newSquad.filter(p => !pickedKeys.includes(getPlayerKey(p)));
  }

  async function fetchClub() {
    loading = true;
    error = '';
    try {
      const res = await fetch(`/api/club/${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error('Failed to fetch club data');
      club = await res.json();
    } catch (e: any) {
      error = e.message || 'Unknown error';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchClub();
    // Check for ?share= param
    const params = new URLSearchParams(window.location.search);
    const shareParam = params.get('share');
    if (shareParam) {
      loadStateFromShareParam(shareParam);
      loadedFromShare = true;
    }
  });

  $: if (saveKey && !loadedFromShare) {
    loadState();
  }

  function handlePlayerSearch(e: Event) {
    e.preventDefault();
    // TODO: Implement player search for incoming transfers
    alert(`Search for player: ${playerSearch}`);
  }

  async function searchPlayers(query: string) {
    if (!query) {
      playerResults = [];
      showPlayerDropdown = false;
      return;
    }
    playerSearchLoading = true;
    playerSearchError = '';
    showPlayerDropdown = false;
    try {
      const res = await fetch(`/api/player?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('No player found');
      const data = await res.json();
      playerResults = Array.isArray(data) ? data : [];
      showPlayerDropdown = playerResults.length > 0;
    } catch (err: any) {
      playerResults = [];
      showPlayerDropdown = false;
      playerSearchError = 'No player found';
    } finally {
      playerSearchLoading = false;
    }
  }

  function onPlayerInput(e: Event) {
    clearTimeout(playerDebounce);
    playerSearch = (e.target as HTMLInputElement).value;
    playerDebounce = setTimeout(() => searchPlayers(playerSearch), 350);
  }

  function selectPlayer(player: any) {
    if (!incoming.some(p => p.name === player.name && p.value === player.value)) {
      incoming = [...incoming, player];
    }
    playerSearch = '';
    playerResults = [];
    showPlayerDropdown = false;
  }

  function removePlayer(index: number) {
    incoming = [...incoming.filter((_, i) => i !== index)];
  }

  function normalizeValue(val: string) {
    return (val || '').replace(/\s+/g, '').toLowerCase();
  }

  function getPlayerKey(player: any) {
    return [
      (player.name || '').trim().toLowerCase(),
      normalizeValue(player.value),
      String(player.age ?? '').trim().toLowerCase()
    ].join('|');
  }

  function isPlayerOutgoing(player: any) {
    const key = getPlayerKey(player);
    return outgoing.some((p) => getPlayerKey(p) === key);
  }

  function addToOutgoing(player: any) {
    const key = getPlayerKey(player);
    if (!outgoing.some((p) => getPlayerKey(p) === key)) {
      outgoing = [...outgoing, player];
    }
  }

  function removeOutgoing(index: number) {
    // Remove by key to ensure correct removal
    const keyToRemove = getPlayerKey(outgoing[index]);
    outgoing = outgoing.filter((p, i) => getPlayerKey(p) !== keyToRemove || i !== index);
  }

  function parseValue(value: string): number {
    if (!value || value === '-') return 0;
    const match = value.match(/€?([\d.]+)([km])?/i);
    if (!match) return 0;
    const num = parseFloat(match[1]);
    const unit = match[2]?.toLowerCase();
    if (unit === 'k') return num * 1000;
    if (unit === 'm') return num * 1000000;
    return num;
  }

  function calculateNetValue(): { incoming: number; outgoing: number; net: number } {
    const incomingTotal = incoming.reduce((sum, player) => {
      const parsed = parseValue(player.value);
      return sum + parsed;
    }, 0);
    const outgoingTotal = outgoing.reduce((sum, player) => {
      const parsed = parseValue(player.value);
      return sum + parsed;
    }, 0);
    console.log('Totals:', { incomingTotal, outgoingTotal });
    return {
      incoming: incomingTotal,
      outgoing: outgoingTotal,
      net: outgoingTotal - incomingTotal
    };
  }

  function calculateSquadDifference(): number {
    const originalSquadValue = parseValue(club?.totalMarketValue || '0');
    const outgoingValue = outgoing.reduce((sum, player) => sum + parseValue(player.value), 0);
    const incomingValue = incoming.reduce((sum, player) => sum + parseValue(player.value), 0);
    const result = originalSquadValue - outgoingValue + incomingValue;
    console.log('Squad difference calculation:', { originalSquadValue, outgoingValue, incomingValue, result });
    return result;
  }

  function formatValue(value: number): string {
    if (value >= 1000000) {
      return `€${(value / 1000000).toFixed(2)}m`;
    } else if (value >= 1000) {
      return `€${(value / 1000).toFixed(0)}k`;
    }
    return `€${value.toFixed(0)}`;
  }

  function getAge(player: any): string | number {
    if (!player.age) return '';
    if (typeof player.age === 'number') return player.age;
    if (typeof player.age === 'string') {
      // If age is like "Apr 2, 1996 (29)"
      const match = player.age.match(/\((\d{1,2})\)/);
      if (match) return match[1];
      // If age is just a number string
      if (/^\d{1,2}$/.test(player.age.trim())) return player.age.trim();
      // If age contains a number anywhere (e.g. "29" or "Apr 2, 1996 (29)")
      const anyNum = player.age.match(/(\d{1,2})/);
      if (anyNum) return anyNum[1];
    }
    return '';
  }

  function resetLineup() {
    lineup = selectedFormation.positions.map(pos => ({ position: pos, player: null }));
  }

  // Use a per-club save key so state is not shared between teams
  $: saveKey = club ? `transferplay-state-${slug}` : null;

  function getCurrentState() {
    return {
      incoming,
      outgoing,
      lineup,
      selectedFormationName: selectedFormationName
    };
  }

  function saveState() {
    if (saveKey) {
      localStorage.setItem(saveKey, JSON.stringify(getCurrentState()));
    }
  }

  async function loadState() {
    if (saveKey) {
      const data = localStorage.getItem(saveKey);
      if (data) {
        const state = JSON.parse(data);
        incoming = state.incoming || [];
        outgoing = state.outgoing || [];
        lineup = state.lineup || [];
        selectedFormationName = state.selectedFormationName;
        $: selectedFormation = formations.find(f => f.name === selectedFormationName) ?? formations[0];
        await tick();
        // Re-assign to force reactivity
        incoming = [...incoming];
        outgoing = [...outgoing];
      }
    }
    stateLoaded = true;
  }

  function resetState() {
    incoming = [];
    outgoing = [];
    lineup = selectedFormation.positions.map(pos => ({ position: pos, player: null }));
    selectedFormationName = formations[0].name;
    $: selectedFormation = formations.find(f => f.name === selectedFormationName) ?? formations[0];
    saveState();
  }

  function isNewPlayer(player: any) {
    return !(club?.players?.some((p: any) => p.name === player.name && p.value === player.value));
  }

  function getPitchSlotStyle(positions: string[], idx: number) {
    // Calculate row and column based on position in formation
    // GK always row 1, defenders row 2, mids row 3, forwards row 4, etc.
    // This is a simple heuristic, can be improved for more formations
    const totalRows = 5;
    let rowMap: Record<string, number> = {
      GK: 1,
      LB: 2, CB: 2, RB: 2, LWB: 2, RWB: 2,
      CDM: 3, CM: 3, LM: 3, RM: 3, CAM: 4, LW: 4, RW: 4, ST: 4, CF: 4
    };
    // Count how many in each row
    let rowCounts: number[] = Array(totalRows + 1).fill(0);
    let rowIndices: number[] = Array(positions.length).fill(0);
    positions.forEach((pos, i) => {
      let row = rowMap[pos] || 3;
      rowCounts[row]++;
      rowIndices[i] = row;
    });
    // For each slot, calculate its position in its row
    let rowSlots: number[] = Array(totalRows + 1).fill(0);
    let slotIndexInRow = rowIndices.map((row, i) => {
      let idxInRow = rowSlots[row];
      rowSlots[row]++;
      return idxInRow;
    });
    // Now, for this idx, get its row and index in row
    let row = rowIndices[idx];
    let countInRow = rowCounts[row];
    let indexInRow = slotIndexInRow[idx];
    // Vertically center the rows: use 20% to 80% instead of 10% to 90%
    let top = 80 - (row - 1) * 20; // 80%, 65%, 50%, 35%, 20%
    let left = 50;
    if (countInRow > 1) {
      left = 50 + ((indexInRow - (countInRow - 1) / 2) * (60 / (countInRow - 1)));
    }
    return `top: ${top}%; left: ${left}%; transform: translate(-50%, -50%);`;
  }

  $: availablePlayersList = lineup.map((slot, idx) => {
    const pickedKeys = lineup
      .filter((s, i) => s.player && i !== idx)
      .map(s => s.player && getPlayerKey(s.player));
    return newSquad.filter(p => !pickedKeys.includes(getPlayerKey(p)));
  });

  function shareState() {
    const state = getCurrentState();
    const encoded = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(state)))));
    const url = `${window.location.origin}/club/${slug}?share=${encoded}`;
    navigator.clipboard.writeText(url);
    showShareCopied = true;
    setTimeout(() => showShareCopied = false, 1800);
  }

  function loadStateFromShareParam(param: string) {
    try {
      const decoded = decodeURIComponent(param);
      const json = decodeURIComponent(escape(atob(decoded)));
      const state = JSON.parse(json);
      incoming = state.incoming || [];
      outgoing = state.outgoing || [];
      lineup = state.lineup || [];
      selectedFormationName = state.selectedFormationName;
      $: selectedFormation = formations.find(f => f.name === selectedFormationName) ?? formations[0];
      stateLoaded = true;
    } catch (e) {
      error = 'Failed to load shared team.';
    }
  }
</script>

<main class="club-container">
  {#if loading}
    <div class="loader">Loading club data<span class="animated-loader">...</span></div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if club}
    <div style="display:flex;align-items:center;justify-content:space-between;gap:1.5rem;margin-bottom:1.5rem;">
      <h1 style="margin:0;">{club.name}</h1>
      <div style="display:flex;gap:0.5rem;position:relative;">
        <button class="header-btn" on:click={saveState}>Save</button>
        <button class="header-btn" on:click={resetState}>Reset</button>
        <button class="header-btn" on:click={shareState}>Share</button>
        {#if showShareCopied}
          <span class="share-tooltip">Link copied!</span>
        {/if}
      </div>
    </div>
    
    <div class="transfer-summary">
      <h3>Transfer Summary</h3>
      <div class="summary-grid">
        <div class="summary-item">
          <span class="summary-label">Market Value: </span>
          <span class="summary-value outgoing">{club.totalMarketValue.replace(" Total market value", "")}</span>
        </div>
      
        <div class="summary-item">
          <span class="summary-label">Spent:</span>
          <span class="summary-value outgoing">{formatValue(netValues.incoming)}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Earned:</span>
          <span class="summary-value incoming">{formatValue(netValues.outgoing)}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Net:</span>
          <span class="summary-value {netValues.net >= 0 ? 'positive' : 'negative'}">{formatValue(netValues.net)}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">New Squad Value:</span>
          <span class="summary-value">{formatValue(squadDifference)}</span>
        </div>
      </div>
    </div>
    <div class="transfers-grid">
      <section class="transfer-box">
        <h3 style="display:flex;align-items:center;justify-content:space-between;">
          Incoming Transfers
          <button type="button" class="collapse-btn" on:click={() => showIncoming = !showIncoming}>{showIncoming ? '−' : '+'}</button>
        </h3>
        {#if showIncoming}
          <form on:submit|preventDefault={handlePlayerSearch} autocomplete="off">
            <input type="text" placeholder="Find player" bind:value={playerSearch} on:input={onPlayerInput} />
            <button type="submit">Search</button>
            {#if playerSearchLoading}
              <span class="loader-inline"></span>
            {/if}
            {#if playerResults.length}
              <div class="debug">Found {playerResults.length} players</div>
            {/if}
            {#if showPlayerDropdown && playerResults.length}
              <ul class="autocomplete-dropdown">
                {#each playerResults as player}
                  <li tabindex="0" on:keydown={(e) => e.key === 'Enter' && selectPlayer(player)}>
                    <span>{player.name}</span>
                    {#if getAge(player)} <span class="player-age">{getAge(player)}<!-- debug: {player.age} --></span>{/if}
                    {#if player.value} <span class="player-value">{player.value}</span>{/if}
                    <button type="button" class="back-btn" on:click={() => selectPlayer(player)} title="Add to incoming">←</button>
                  </li>
                {/each}
              </ul>
            {/if}
          </form>
          <table class="squad-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Age</th>
                <th>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each incoming as player, index}
                <tr>
                  <td class="player-name">{player.name}</td>
                  <td>{getAge(player)}</td>
                  <td class="player-value">{player.value}</td>
                  <td><button type="button" class="remove-btn" on:click={() => removePlayer(index)} title="Remove">×</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </section>
      <section class="transfer-box">
        <h3 style="display:flex;align-items:center;justify-content:space-between;">
          Outgoing Transfers
          <button type="button" class="collapse-btn" on:click={() => showOutgoing = !showOutgoing}>{showOutgoing ? '−' : '+'}</button>
        </h3>
        {#if showOutgoing}
          <table class="squad-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Age</th>
                <th>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each outgoing as player, index}
                <tr>
                  <td class="player-name">{player.name}</td>
                  <td>{getAge(player)}</td>
                  <td class="player-value">{player.value}</td>
                  <td><button type="button" class="remove-btn" on:click={() => removeOutgoing(index)} title="Remove">×</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </section>
    </div>
    <div class="squads-comparison">
      <div class="squad-section">
        <h3 style="display:flex;align-items:center;justify-content:space-between;">
          Original Squad
          <button type="button" class="collapse-btn" on:click={() => showOriginalSquad = !showOriginalSquad}>{showOriginalSquad ? '−' : '+'}</button>
        </h3>
        {#if showOriginalSquad}
          <table class="squad-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Age</th>
                <th>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each club.players as player}
                <tr class:outgoing={isPlayerOutgoing(player)}>
                  <td class="player-name">{player.name}</td>
                  <td>{getAge(player)}</td>
                  <td class="player-value">{player.value}</td>
                  <td>
                    <button
                      type="button"
                      class="arrow-btn"
                      on:click={() => addToOutgoing(player)}
                      title="Add to outgoing"
                      disabled={isPlayerOutgoing(player)}
                    >→</button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>
      <div class="squad-section">
        <h3 style="display:flex;align-items:center;justify-content:space-between;">
          New Squad
          <button type="button" class="collapse-btn" on:click={() => showNewSquad = !showNewSquad}>{showNewSquad ? '−' : '+'}</button>
        </h3>
        {#if showNewSquad}
          <table class="squad-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Age</th>
                <th>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each newSquad as player}
                <tr class:new-player={isNewPlayer(player)}>
                  <td class="player-name">{player.name}</td>
                  <td>{getAge(player)}</td>
                  <td class="player-value">{player.value}</td>
                  <td></td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>
    </div>
    <div class="lineup-builder-section">
      <h3 style="display:flex;align-items:center;justify-content:space-between;">
        Build Your Lineup
        <button type="button" class="collapse-btn" on:click={() => showLineup = !showLineup}>{showLineup ? '−' : '+'}</button>
      </h3>
      {#if showLineup}
        <div class="formation-select">
          <label for="formation">Formation:</label>
          <select id="formation" bind:value={selectedFormationName} on:change={resetLineup}>
            {#each formations as formation}
              <option value={formation.name}>{formation.name}</option>
            {/each}
          </select>
          <button type="button" class="reset-btn" on:click={resetLineup}>Reset Lineup</button>
        </div>
        <div class="pitch">
          {#each lineup as slot, idx}
            {#key slot.position + '-' + idx}
              <div class="pitch-slot" style={getPitchSlotStyle(selectedFormation.positions, idx)}>
                
                {#if slot.player}
                  <div class="player-chip">
                    <span>{slot.player.name}</span>
                    <button type="button" class="remove-btn" on:click={() => removePlayerFromPosition(idx)} title="Remove">×</button>
                  </div>
                {:else}
                  <div class="add-player-dropdown">
                    <select
                      on:change={(e) => {
                        const val = (e.target as HTMLSelectElement).value;
                        const [name, value] = val.split('|');
                        setPlayerForPosition(idx, newSquad.find(p => p.name === name && p.value === value));
                        (e.target as HTMLSelectElement).value = "";
                      }}>
                      <option value="">{slot.position}</option>
                      {#each availablePlayersList[idx] as player}
                        <option value={player.name + '|' + player.value}>{player.name}</option>
                      {/each}
                    </select>
                  </div>
                {/if}
              </div>
            {/key}
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</main>

<style>
.club-container {
  margin: 2rem auto;
}
.valuation {
  font-size: 1.2rem;
  margin-bottom: 1.5rem;
}
.squad-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
}
.squad-table th, .squad-table td {
  padding: 0.5rem 0.7rem;
  border-bottom: 1px solid var(--border-color);
  text-align: left;
  vertical-align: middle;
  min-height: 2.5rem;
  font-size: 1rem;
}
.squad-table th {
  border-bottom-width: 2px;
  font-weight: 500;
}
.squad-table tr.outgoing {
  background: color-mix(in srgb, var(--negative-red) 30%, #ffffff33)
}
.squad-table tr.new-player {
  background: color-mix(in srgb, var(--positive-green) 30%, #ffffff33)
}
.squad-table .player-value {
  font-weight: 500;
}
.squad-table .remove-btn {
  margin-left: 0;
}
.transfers-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
}
.transfer-box {
  flex: 1;
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  align-items: flex-start;
  align-content: flex-start;
}
.transfer-box h3 {
  margin-top: 0;
}
.transfer-box form {
  display: flex;
  gap: 0.5rem;
  position: relative;
}
.transfer-box input[type="text"] {
  flex: 1;
  padding: 0.4rem 0.8rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
}
.transfer-box button {
  padding: 0.4rem 1rem;
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
}
.transfer-box > ul {
  flex-basis: 100%;
}
.transfer-box ul {
  margin-left: 0;
  padding-left: 0;
  list-style: none;
}
.loader {
  font-weight: 15;
  font-size: 3rem;
  color: var(--positive-green);
}
.animated-loader {
  position: relative;
  overflow: hidden;
  white-space: nowrap;
  animation: animated-loader-reveal 1s steps(3, end) infinite;

@keyframes animated-loader-reveal {
  0% {
    width: 0%;
  }
  33.333% {
    width: 33.333%;
  }
  66.666% {
    width: 66.666%;
  }
  100% {
    width: 100%;
  }
}
}
.error {
  color: var(--negative-red);
}
.loader-inline {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid color-mix(in HSL, var(--positive-green) 80%, #222);;
  border-top: 2px solid transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-left: 0.5rem;
  vertical-align: middle;
}
.autocomplete-dropdown {
  position: absolute;
  left: 0;
  right: 0;
  top: 110%;
  border: 1px solid var(--border-color);
  z-index: 10;
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 200px;
  overflow-y: auto;
  background: #fff;
  color: #222;
  width: max(100%, 500px);
}
.autocomplete-dropdown li {
  padding: 0.7rem 1rem;
  cursor: pointer;
  transition: background 0.15s;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.autocomplete-dropdown li span:first-of-type {
  flex-basis: 60%;
}
.autocomplete-dropdown li:hover {
  background: none;
}
.player-nationality {
  font-size: 0.95em;
}
.player-club {
  font-size: 0.95em;
}
.plus-btn {
  margin-left: auto;
  background: none;
  color: var(--positive-green);
  border: none;
  width: 28px;
  height: 28px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}
.plus-btn:hover {
  color: color-mix(in HSL, var(--positive-green) 80%, #222);;
  background: none;
}
.debug {
  position: absolute;
  top: 100%;
  left: 0;
  padding: 0.2rem 0.5rem;
  font-size: 0.8rem;
  z-index: 5;
}
.incoming-player,
.outgoing-player {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border-color);
}
.remove-btn {
  margin-left: auto;
  border: none;
  width: 24px;
  height: 24px;
  font-size: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}
.remove-btn:hover {
  color: #333;
}
.transfer-summary {
  margin: 4rem 0;
}
.transfer-summary h3 {
  margin-top: 0;
  margin-bottom: 1rem;
}
.summary-grid {
}
.summary-item {
  display: grid;
  grid-template-columns: 200px auto;
  align-items: center;
  font-size: 1.3em;
  font-weight: 15;
}
.summary-value {
  font-variant-numeric: tabular-nums;
  font-weight: 300;
}
.summary-value.incoming {
  color: var(--positive-green);
}
.summary-value.outgoing {
  color: var(--negative-red);
}
.summary-value.positive {
  color: var(--positive-green);
}
.summary-value.negative {
  color: var(--negative-red);
}
.squads-comparison {
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
  margin-top: 2rem;
  overflow-x: auto;
}
.squad-section {
  flex: 1;
}
.squad-section h3 {
  margin-top: 0;
}
.arrow-btn {
  background: none;
  border: none;
  color: var(--negative-red);
  cursor: pointer;
  padding: 0 0.5rem;
  border-radius: 0;
  transition: color 0.2s;
}
.arrow-btn:hover {
  color: color-mix(in HSL, var(--negative-red) 80%, #222);
  background: none;
}
.lineup-builder-section {
  margin-top: 2.5rem;
}
.formation-select {
  margin-bottom: 1.5rem;
}
.pitch {
  position: relative;
  width: 100%;
  aspect-ratio: 2/1.2;
  margin: 2rem 0;
  background: linear-gradient(180deg, #2e7d32 0%, #388e3c 100%);
  border: 2px solid #fff;
  border-radius: 8px;
  overflow: hidden;
  color: #fff;
  max-width: 1280px;
}

@media (orientation: portrait) {
  .pitch {
    aspect-ratio: 2/2.5;
}
}

.pitch::before {
  content: '';
  position: absolute;
  inset: 0;
  background:repeating-linear-gradient(to bottom, rgba(255,255,255,0.08) 0 10%, transparent 10% 20%);
  pointer-events: none;
  z-index: 1;
}
.pitch-slot {
  position: absolute;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 10vw;
  height: 70px;
}

.pitch-slot .player-chip {
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.75rem;
  margin-bottom: 0.2rem;
  text-align: center;
}
.pitch-slot .player-chip .remove-btn{
  background: none;
  color: #fff;
  position: absolute;
  top: -3px;
  right: -24px;
  border: none;
}
.pitch-slot .add-player-dropdown select {
  padding: 0;
  font-size: 0.95rem;
  text-align: center;
  background: none;
  border: none;
}
.reset-btn {
  margin-left: 1rem;
  padding: 0.3rem 1rem;
  background: #e0e0e0;
  color: #333;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  transition: background 0.2s;
}
.reset-btn:hover {
}

.back-btn {
  background: none !important;
  border: none;
  color: var(--positive-green);
  cursor: pointer;
  border-radius: 0;
  transition: color 0.2s;
  margin: 0 0 0 auto;
}
.back-btn:hover {
  color: color-mix(in HSL, var(--positive-green) 80%, #222);
  background: none !important;
}
.squad-table tr {
  height: 2.5rem;
}
.header-btn {
  background: none;
  border: none;
  font-weight: 500;
  padding: 0.4rem 1.1rem;
  cursor: pointer;
  color: inherit;
}
.header-btn:focus {
  outline: 2px solid #222;
}
.collapse-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  margin-left: 0.5rem;
  padding: 0 0.5rem;
  line-height: 1;
  font-weight: 700;
  transition: color 0.2s;
  color: inherit;
}
.collapse-btn:hover {
}
.share-tooltip {
  position: absolute;
  top: 100%;
  right: 0;
  background: #222;
  color: #fff;
  padding: 0.3rem 0.8rem;
  border-radius: 6px;
  font-size: 0.95rem;
  margin-top: 0.2rem;
  white-space: nowrap;
  z-index: 10;
  opacity: 0.95;
  pointer-events: none;
}
</style> 