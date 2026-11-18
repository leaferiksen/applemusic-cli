/**
 * @fileoverview Help command - displays CLI usage information.
 * @module commands/help
 */

/**
 * Displays help text with all available commands and their usage.
 */
export function help(): void {
  console.log(`
🎵 Apple Music CLI

Playback:
  play                    Start playback
  pause                   Pause playback
  stop                    Stop playback
  toggle                  Toggle play/pause
  next                    Next track
  prev                    Previous track

Now Playing:
  now                     Show current track info

Volume:
  vol [0-100]             Get or set volume

Playlists:
  playlists [--limit N] [--offset N]
                          List all playlists
  playlist <name>         Play a playlist (supports spaces)
  tracks [playlist] [--limit N] [--offset N]
                          List tracks in playlist

Library:
  songs [--limit N] [--offset N]
                          List all songs in library
  search <query> [--limit N] [--offset N]
                          Search library
  song <name>             Play a song by name (supports spaces)
  albums [filter] [--limit N] [--offset N]
                          List albums, optionally filtered by name
  album <name>            Play an album by exact name, in track order
  artists [filter] [--limit N] [--offset N]
                           List artists (credits), optionally filtered
  artist <name> [album]   Play an album the artist is credited on
                          (list candidates if more than one match)

Options:
  shuffle [on|off]        Get or set shuffle
  repeat [off|one|all]    Get or set repeat

AirPlay:
  airplay [--active]      List AirPlay devices (or only the active ones)
  airplay <name>          Toggle a device on/off
  airplay <name> --on|--off|--only
                          Force on, force off, or play to that device alone

Pagination (for playlists, tracks, songs, search, albums, artists):
  --limit N, -l N         Show N results (default: 20 for search/songs, all for others)
  --offset N, -o N        Skip first N results (default: 0)

Examples:
  am playlists --limit 5
  am tracks "My Playlist" --limit 10 --offset 20
  am search "nirvana" --limit 50
  am playlist "Chill Vibes"
  am song "Come As You Are"
  am albums nirvana
  am album "Nevermind"
  am artists --limit 50
  am artist "Joseph Trapanese"
  am artist "Nirvana" "Nevermind"

  help                    Show this help
`);
}
