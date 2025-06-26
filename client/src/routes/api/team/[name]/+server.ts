import type { RequestHandler } from '@sveltejs/kit';
import axios from 'axios';
import * as cheerio from 'cheerio';

export const GET: RequestHandler = async ({ params }) => {
  const teamName = params.name ?? '';
  try {
    const searchUrl = `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(teamName)}`;
    const searchResp = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });
    const $search = cheerio.load(searchResp.data);
    let teams: any[] = [];
    const clubHeadline = $search('h2.content-box-headline').filter((i, el) => {
      return $search(el).text().trim().startsWith('Search results: Clubs');
    }).first();
    if (clubHeadline.length) {
      // Find the closest parent .box (or similar container)
      const clubBox = clubHeadline.closest('.box');
      let clubTable = null;
      if (clubBox.length) {
        clubTable = clubBox.find('table').first();
      }
      if (clubTable && clubTable.length) {
        $search(clubTable).find('tbody tr').each((i, el) => {
          const row = $search(el);
          // Logo is in the first td
          const logo = row.find('td.suche-vereinswappen img').attr('src');
          // Name and link are in the nested table in the second td
          const nameLink = row.find('td:nth-child(2) table.inline-table tr td.hauptlink a');
          const name = nameLink.text().trim();
          const href = nameLink.attr('href');
          let logoUrl = null;
          if (logo) {
            logoUrl = logo.startsWith('http') ? logo : 'https://www.transfermarkt.com' + logo;
          }
          if (name && href) {
            teams.push({
              name,
              url: `https://www.transfermarkt.com${href}`,
              logo: logoUrl
            });
          }
        });
      }
    }
    if (!teams.length) {
      return new Response(JSON.stringify({ error: 'No teams found on Transfermarkt.' }), { status: 404 });
    }
    return new Response(JSON.stringify(teams), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Failed to fetch team data.' }), { status: 500 });
  }
}; 