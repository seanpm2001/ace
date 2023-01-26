/*
 * @adonisjs/ace
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { fileURLToPath } from 'node:url'
import { extname, relative } from 'node:path'
import { fsReadAll, RuntimeException } from '@poppinss/utils'

import { validateCommand } from '../helpers.js'
import type { AbstractBaseCommand, CommandMetaData, LoadersContract } from '../types.js'

const JS_MODULES = ['.js', '.cjs', '.mjs']

/**
 * Fs loader exposes the API to load commands from a directory. All files
 * ending with ".js", ".cjs", ".mjs", ".ts" and ".mts" are considered
 * as commands
 */
export class FsLoader<Command extends AbstractBaseCommand> implements LoadersContract<Command> {
  /**
   * Absolute path to directory from which to load files
   */
  #comandsDirectory: string

  /**
   * An array of loaded commands
   */
  #commands: { command: Command; filePath: string }[] = []

  constructor(comandsDirectory: string) {
    this.#comandsDirectory = comandsDirectory
  }

  /**
   * Returns a collection of commands. The command value
   * is unknown and must be validated
   */
  async #loadCommands(): Promise<Record<string, unknown>> {
    const commands: Record<string, unknown> = {}

    /**
     * Scanning all files
     */
    const commandFiles = await fsReadAll(this.#comandsDirectory, {
      pathType: 'url',
      filter: (filePath: string) => {
        const ext = extname(filePath)
        if (JS_MODULES.includes(ext)) {
          return true
        }

        if (ext === '.ts' && !filePath.endsWith('.d.ts')) {
          return true
        }

        return false
      },
    })

    /**
     * Importing files and validating the exports to have a default
     * export
     */
    for (let file of commandFiles) {
      const fileRelativeName = relative(this.#comandsDirectory, fileURLToPath(file))
      const commandFileExports = await import(file)
      if (!commandFileExports.default) {
        throw new RuntimeException(
          `Invalid command exported from "${fileRelativeName}" file. Missing export default`
        )
      }

      commands[fileRelativeName] = commandFileExports.default
    }

    return commands
  }

  /**
   * Returns the metadata of commands
   */
  async getMetaData(): Promise<(CommandMetaData & { filePath: string })[]> {
    const commandsCollection = await this.#loadCommands()

    Object.keys(commandsCollection).forEach((key) => {
      const command = commandsCollection[key]
      validateCommand<Command>(command, `"${key}" file`)
      this.#commands.push({ command, filePath: key })
    })

    return this.#commands.map(({ command, filePath }) => {
      return Object.assign({}, command.serialize(), { filePath })
    })
  }

  /**
   * Returns the command class constructor for a given command. Null
   * is returned when unable to lookup the command
   */
  async getCommand(metaData: CommandMetaData): Promise<Command | null> {
    return (
      this.#commands.find(({ command }) => command.commandName === metaData.commandName)?.command ||
      null
    )
  }
}
