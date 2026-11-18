/**
 * @fileoverview AirPlay output selection for Apple Music.
 * @module commands/airplay
 */

import { osascript } from "../osascript";
import { parseArgs } from "../args";

/** An AirPlay output device and whether Music is currently sending audio to it. */
interface Device {
  name: string;
  selected: boolean;
}

/**
 * Escapes a string for use inside an AppleScript string literal.
 */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Runs an AppleScript statement that assigns a list to `theList`, and
 * returns its items one per line (so names containing commas survive).
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

/** Returns every AirPlay device Music knows about, with its selected state. */
async function devices(): Promise<Device[]> {
  const names = await osascriptLines(
    'tell application "Music" to set theList to name of every AirPlay device'
  );
  const states = await osascriptLines(
    'tell application "Music" to set theList to selected of every AirPlay device'
  );
  return names.map((name, i) => ({ name, selected: states[i] === "true" }));
}

/** Selects or deselects one device by exact name. */
async function setSelected(name: string, on: boolean): Promise<void> {
  await osascript(
    `tell application "Music" to set selected of AirPlay device "${esc(name)}" to ${on}`
  );
}

/**
 * Lists, toggles, or sets AirPlay output devices.
 *
 * Put the device name first and flags after it, since the argument parser
 * treats the word after a flag as that flag's value.
 *
 * @param args - Command arguments:
 *   - (none)                  list all devices
 *   - `--active`              list only devices currently selected
 *   - `<name>`                toggle that device (others are left alone)
 *   - `<name> --on | --off`   force that device on or off
 *   - `<name> --only`         play to that device alone
 */
export async function airplay(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const name = positional.join(" ");
  const all = await devices();

  if (!name) {
    const shown = flags.active ? all.filter(d => d.selected) : all;
    if (shown.length === 0) {
      console.log(flags.active ? "No active AirPlay devices" : "No AirPlay devices found");
      return;
    }
    console.log(`📡 AirPlay devices${flags.active ? " (active)" : ""}:`);
    shown.forEach((d, i) => console.log(`   ${i + 1}. ${d.name}`));
    return;
  }

  const dev =
    all.find(d => d.name === name) ??
    all.find(d => d.name.toLowerCase() === name.toLowerCase());
  if (!dev) {
    console.log(`AirPlay device "${name}" not found`);
    return;
  }

  const on = flags.only || flags.on ? true : flags.off ? false : !dev.selected;

  // Select the new device before deselecting the others so audio never
  // drops to zero outputs mid-switch.
  await setSelected(dev.name, on);
  if (flags.only) {
    for (const other of all) {
      if (other.name !== dev.name && other.selected) await setSelected(other.name, false);
    }
  }
  console.log(`📡 ${dev.name}: ${on ? "on" : "off"}${flags.only ? " (only)" : ""}`);
}
