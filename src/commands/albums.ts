/**
 * @fileoverview Album browsing and playback commands for Apple Music.
 * @module commands/albums
 */

import { osascript } from "../osascript";
import { parseArgs, getLimit, getOffset } from "../args";
import { paginate, printPaginationHint } from "../pagination";

/** Name of the temporary playlist used to play an album in track order. */
const TEMP_PLAYLIST = "am-album";

/**
 * Escapes a string for use inside an AppleScript string literal.
 *
 * @param s - Raw string
 * @returns The string with backslashes and double quotes escaped
 */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Runs an AppleScript statement that assigns a list to `theList`, and
 * returns its items as an array.
 *
 * Unlike `osascriptList`, items are joined with newlines rather than ", ",
 * so album names containing commas are not split apart.
 *
 * @param assignment - AppleScript statement that sets `theList`
 * @returns The list items, in order
 */
async function osascriptLines(assignment: string): Promise<string[]> {
  const result = await osascript(`
    ${assignment}
    set AppleScript's text item delimiters to linefeed
    set joined to theList as text
    set AppleScript's text item delimiters to ""
    return joined
  `);
  return result ? result.split("\n") : [];
}

/**
 * Returns the distinct, sorted album names in the library.
 */
async function allAlbums(): Promise<string[]> {
  const names = await osascriptLines(
    'tell application "Music" to set theList to album of every track of playlist "Library"'
  );
  return [...new Set(names.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/**
 * Returns the distinct, sorted artist credits in the library.
 *
 * These are the raw credit strings from each track's artist field, so
 * collaborations and featured artists appear as compound entries.
 */
async function allArtists(): Promise<string[]> {
  const names = await osascriptLines(
    'tell application "Music" to set theList to artist of every track of playlist "Library"'
  );
  return [...new Set(names.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/**
 * Lists albums in the library, optionally filtered by a query.
 * Supports pagination via --limit and --offset flags.
 * Default limit is 20.
 *
 * @param args - Command arguments. Positional args form an optional filter
 *               (case-insensitive substring match on the album name).
 */
export async function albums(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const query = positional.join(" ");
  const limit = getLimit(flags, 20);
  const offset = getOffset(flags);

  const all = await allAlbums();
  const matches = query
    ? all.filter(a => a.toLowerCase().includes(query.toLowerCase()))
    : all;

  if (matches.length === 0) {
    console.log(query ? `No albums for "${query}"` : "No albums found");
    return;
  }

  const page = paginate(matches, limit, offset);

  console.log(`💿 Albums${query ? ` matching "${query}"` : ""} (${page.showing}):`);
  page.items.forEach((a, i) => console.log(`   ${offset + i + 1}. ${a}`));
  printPaginationHint(page);
}

/**
 * Lists the artists in the library, optionally filtered by a query.
 * Supports pagination via --limit and --offset flags.
 * Default limit is 20.
 *
 * @param args - Command arguments. Positional args form an optional filter
 *               (case-insensitive substring match on the artist credit).
 */
export async function artists(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const query = positional.join(" ");
  const limit = getLimit(flags, 20);
  const offset = getOffset(flags);

  const all = await allArtists();
  const matches = query
    ? all.filter(a => a.toLowerCase().includes(query.toLowerCase()))
    : all;

  if (matches.length === 0) {
    console.log(query ? `No artists for "${query}"` : "No artists found");
    return;
  }

  const page = paginate(matches, limit, offset);

  console.log(`🎤 Artists${query ? ` matching "${query}"` : ""} (${page.showing}):`);
  page.items.forEach((a, i) => console.log(`   ${offset + i + 1}. ${a}`));
  printPaginationHint(page);
}

/**
 * Plays an album by exact name, in disc and track order.
 *
 * AppleScript has no play queue, so the album's tracks are copied into a
 * temporary playlist (see TEMP_PLAYLIST), which is replaced on each call.
 *
 * @param name - Exact album name
 */
async function playAlbum(name: string): Promise<void> {
  const tracks = `(every track of playlist "Library" whose album is "${esc(name)}")`;
  const get = (prop: string) =>
    `tell application "Music" to set theList to ${prop} of ${tracks}`;

  try {
    const discs = (await osascriptLines(get("disc number"))).map(Number);
    const numbers = (await osascriptLines(get("track number"))).map(Number);

    if (discs.length === 0) {
      console.log(`Album "${name}" not found`);
      return;
    }

    // 1-based positions into `tracks`, sorted by disc then track number
    const order = discs
      .map((_, i) => i)
      .sort((a, b) => discs[a] - discs[b] || numbers[a] - numbers[b])
      .map(i => i + 1);

    await osascript(`
      tell application "Music"
        set matches to ${tracks}
        if exists user playlist "${TEMP_PLAYLIST}" then delete user playlist "${TEMP_PLAYLIST}"
        set tmp to make new user playlist with properties {name:"${TEMP_PLAYLIST}"}
        set idx to {${order.join(", ")}}
        repeat with n in idx
          duplicate (item (contents of n) of matches) to tmp
        end repeat
        play tmp
      end tell
    `);
    console.log(`▶ Playing album: ${name}`);
  } catch {
    console.log(`Could not play album "${name}"`);
  }
}

/**
 * Plays an album by exact name, in disc and track order.
 *
 * @param args - Command arguments. Positional args are joined to form the album name.
 *
 * @example
 * ```ts
 * await album(['Nevermind']);
 * ```
 */
export async function album(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const name = positional.join(" ");

  if (!name) {
    console.log("Usage: am album <name>");
    return;
  }

  await playAlbum(name);
}

/**
 * Finds albums in the library where the given artist is credited on any
 * track, and plays one of them.
 *
 * The match is a case-insensitive substring search over each track's artist
 * field, so it covers primary artists, collaborations ("A & B"), featured
 * credits ("A feat. B"), and compilation credits.
 *
 * With a single matching album, it is played immediately. With several, the
 * matches are listed; pass an optional second argument to narrow the list by
 * album name, which plays when it leaves exactly one match.
 *
 * @param args - Command arguments. The first positional arg is the artist
 *               name; any remaining positional args form the optional album
 *               filter.
 *
 * @example
 * ```ts
 * await artist(['Nirvana']);
 * await artist(['Nirvana', 'Nevermind']);
 * ```
 */
export async function artist(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const name = positional[0];

  if (!name) {
    console.log("Usage: am artist <name> [album]");
    return;
  }

  const filter = positional.slice(1).join(" ").toLowerCase();

  // A no-match query throws (-1728) instead of returning an empty list.
  let matches: string[] = [];
  try {
    const names = await osascriptLines(
      `tell application "Music" to set theList to album of (every track of playlist "Library" whose artist contains "${esc(name)}")`
    );
    matches = [...new Set(names.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  } catch {
    matches = [];
  }

  if (matches.length === 0) {
    console.log(`No albums where "${name}" is credited`);
    return;
  }

  if (filter) {
    matches = matches.filter(a => a.toLowerCase().includes(filter));
    if (matches.length === 0) {
      console.log(`No credited albums contain "${filter}"`);
      return;
    }
  }

  if (matches.length === 1) {
    await playAlbum(matches[0]);
  } else {
    console.log(`Albums credited to "${name}" (${matches.length}):`);
    matches.forEach((a, i) => console.log(`   ${i + 1}. ${a}`));
    console.log(`Play one with: am artist "${name}" "<album name>"`);
  }
}
