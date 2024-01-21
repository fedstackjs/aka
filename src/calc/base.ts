import { Logger } from 'pino'
import { AkaClient, IRanklist } from '../client.js'
import { AkaDb } from '../db.js'

export interface IRanklistSyncOptions {
  shouldSyncSolutions?: boolean
  shouldSyncParticipants?: boolean
}

export abstract class RanklistCalculator {
  constructor(
    protected db: AkaDb,
    protected client: AkaClient,
    protected logger: Logger
  ) {}

  abstract loadConfig(dict: Record<string, string>): Promise<IRanklistSyncOptions>
  abstract calculate(contestId: string, taskId: string, key: string): Promise<IRanklist>
}
