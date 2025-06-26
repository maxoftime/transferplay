import type { RequestHandler } from '@sveltejs/kit';
import axios from 'axios';
import * as cheerio from 'cheerio';

export const GET: RequestHandler = async ({ params }) => {
  const slug = params.slug ?? '';
  try {
    // The slug is the path after the domain, e.g. 'arsenal-fc/startseite/verein/11'
    // We'll reconstruct the URL
    const teamUrl = `https://www.transfermarkt.com/${slug}`;
    const teamResp = await axios.get(teamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    const $team = cheerio.load(teamResp.data);
    // Scrape basic info (name, total market value)
    const name = $team('h1[data-testid="headline"]').text().trim() || $team('h1').first().text().trim();
    const totalMarketValue = $team('a.data-header__market-value-wrapper').text().trim().replace(/\s+/g, ' ') || $team('div[data-viewport="Mannschaftswert"] .dataMarktwert').first().text().trim() || $team('div.dataMarktwert').first().text().trim();
    // Scrape squad players and values
    const players: any[] = [];
    $team('table.items tbody tr').each((i, el) => {
      const row = $team(el);
      // Nationality: first img in the nationality td
      const nationality = row.find('td.nat img').first().attr('title') || '';
      // Name: player name link
      const playerName = row.find('td.posrela a').text().trim();
      // Age: age column
      const age = row.find('td.zentriert').eq(1).text().trim();
      // Contract end: contract column (last zentriert td)
      const contractEnd = row.find('td.zentriert').last().text().trim();
      // Value: last .hauptlink td
      const playerValue = row.find('td.rechts.hauptlink').last().text().trim();
      if (playerName) {
        players.push({
          name: playerName,
          nationality,
          age,
          contractEnd,
          value: playerValue
        });
      }
    });
    return new Response(JSON.stringify({
      name,
      totalMarketValue,
      players
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Failed to fetch club data.' }), { status: 500 });
  }
}; 