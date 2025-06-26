import type { RequestHandler } from '@sveltejs/kit';
import axios from 'axios';
import * as cheerio from 'cheerio';

export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get('q') ?? '';
  if (!query) {
    return new Response(JSON.stringify({ error: 'Missing query' }), { status: 400 });
  }
  try {
    const searchUrl = `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(query)}`;
    const searchResp = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Referer': 'https://www.transfermarkt.com/',
        'Connection': 'keep-alive'
      },
    });
    const $search = cheerio.load(searchResp.data);
    // Find the section after the h2 with 'Search results: Players'
    let players: any[] = [];
    const playerHeadline = $search('h2.content-box-headline').filter((i, el) => {
      return $search(el).text().trim().startsWith('Search results for players');
    }).first();
    if (playerHeadline.length) {
      // Find the closest parent .box (or similar container)
      const playerBox = playerHeadline.closest('.box');
      let playerTable = null;
      if (playerBox.length) {
        playerTable = playerBox.find('table').first();
      }
      if (playerTable && playerTable.length) {
        $search(playerTable).find('tbody tr').each((i, el) => {
          const row = $search(el);
          // Name: from the nested table, hauptlink
          const name = row.find('td table.inline-table td.hauptlink a').text().trim();
          // Nationality: all flag images in the 5th td
          const nationalityTds = row.find('td.zentriert').eq(4);
          const nationalities = nationalityTds.find('img.flaggenrahmen').map((i, el) => $search(el).attr('title')).get().filter(Boolean).join(', ');
          // Age: 4th td.zentriert
          const age = row.find('td.zentriert').eq(2).text().trim();
          // Club: 3rd td.zentriert, title attribute of img or text
          let club = row.find('td.zentriert').eq(1).find('img').attr('title') || row.find('td.zentriert').eq(1).text().trim();
          // Value: last .hauptlink td
          const value = row.find('td.rechts.hauptlink').last().text().trim();
          if (name) {
            players.push({ name, nationality: nationalities, age, club, value });
          }
        });
      }
    }
    if (!players.length) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    return new Response(JSON.stringify(players), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Failed to fetch player data.' }), { status: 500 });
  }
}; 