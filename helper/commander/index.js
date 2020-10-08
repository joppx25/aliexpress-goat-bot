'use strict';

const path                       = require('path');
const fs                         = require('fs');
const validateLoadedCommandGroup = require('./validateCommands');
const parent_dir                 = path.join(__dirname, '../../src/', 'commands');

module.exports = { registerCommands };

//
// ─── PUBLIC FUNCTIONS ───────────────────────────────────────────────────────────
//

/**
 * Register a list of commands.
 *
 * @param {Program} program
 */
function registerCommands (program) {

    const commands = loadCommands();
    for (const cmd of commands)
        registerCommand(program, cmd);
}

//
// ─── PRIVATE FUNCTIONS ──────────────────────────────────────────────────────────
//

/**
 * Load all commands.
 * Step 1: Load all files on directories same level with this index file.
 * Step 2: Filter only directories.
 * Step 3: return all Array of command lists.
 *
 * @return {Array<Array<Function>>} commands Array of command lists.
 */
function loadCommands () {
    const itemsOnThisDir = fs.readdirSync(parent_dir);
    const loadedCmds     = [];

    itemsOnThisDir
        .map(buildCmdGroupAbsPath)
        .filter(pathIsDirectory)
        .map(loadCommandGroup)
        .forEach(newCmds => loadedCmds.push(...newCmds));

    return loadedCmds;
}

/**
 * get absolute path of file and directories
 *
 * @return {string} absolute path
 */
function buildCmdGroupAbsPath (cmdGroupName) {
    return path.join(parent_dir, cmdGroupName);
}

/**
 * Check if path is directory or not.
 *
 * @return {boolean}
 */
function pathIsDirectory (absPath) {
    return fs.statSync(absPath).isDirectory();
}

/**
 * Validate and return all command list.
 *
 * @return {Array<Array<Function>>} commands Array of command lists
 */
function loadCommandGroup (cmdGroupAbsPath) {
    const cmds = require(cmdGroupAbsPath);
    validateLoadedCommandGroup(cmds);

    return cmds;
}

/**
 * Register a command that written in registry
 * read more about coercion, regex and other options on https://github.com/tj/commander.js/
 *
 * @param {Program} program
 * @param {Array<Function>} cmd command lists
 */
function registerCommand (program, cmd) {
    const { name, description, options = [] } = cmd.registry;

    const registeredCmd = program
        .command(name)
        .description(description)
        .action(cmd);

    for (const { flag, description, coercion, regex, initValue, defaultValue } of options) {
        if (coercion)
            registeredCmd.option(flag, description, coercion, initValue);
        else if (regex)
            registeredCmd.option(flag, description, regex, defaultValue);
        else
            registeredCmd.option(flag, description, defaultValue);
    }
}
