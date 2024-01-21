import dotenv from 'dotenv'
import { AkaClient, IAkaClientConfig } from './client.js'
import { getCalculator } from './calc/index.js'
import { AkaDb, IAkaDbConfig } from './db.js'
import { IRanklistSyncOptions } from './calc/base.js'
import { pino } from 'pino'
import { wait } from './utils.js'

export interface IAkaConfig {
  client: IAkaClientConfig
  db: IAkaDbConfig
}

export class Aka {
  client
  db
  logger

  constructor(private config: IAkaConfig) {
    this.client = new AkaClient(config.client)
    this.db = new AkaDb(config.db)
    this.logger = pino()
  }

  async syncSolutions(contestId: string, taskId: string, limit: number) {
    this.logger.info({ contestId, taskId }, `Start to sync solutions with limit=${limit}`)
    const last = await this.db.solutions.findOne(
      { contestId },
      { sort: { completedAt: -1, _id: -1 } }
    )
    let since = 0,
      lastId = '00000000-0000-0000-0000-000000000000'
    if (last) {
      since = last.completedAt
      lastId = last._id
    }
    for (;;) {
      this.logger.info({ contestId, taskId }, `Sync solutions from since=${since} lastId=${lastId}`)
      const solutions = await this.client.solutions(contestId, taskId, since, lastId)
      for (const solution of solutions) {
        await this.db.solutions.updateOne(
          { _id: solution._id },
          { $set: { ...solution, contestId } },
          { upsert: true }
        )
      }
      if (!solutions.length) {
        this.logger.info({ contestId, taskId }, `No more solutions`)
        break
      }
      since = solutions[solutions.length - 1].completedAt
      lastId = solutions[solutions.length - 1]._id
      if (since >= limit) {
        this.logger.info({ contestId, taskId }, `Reach limit=${limit}`)
        break
      }
    }
    return Math.max(since, limit)
  }

  async syncParticipants(contestId: string, taskId: string, limit: number) {
    this.logger.info({ contestId, taskId }, `Start to sync participants with limit=${limit}`)
    const last = await this.db.participants.findOne(
      { contestId },
      { sort: { updatedAt: -1, _id: -1 } }
    )
    let since = 0,
      lastId = '00000000-0000-0000-0000-000000000000'
    if (last) {
      since = last.updatedAt
      lastId = last._id
    }
    for (;;) {
      this.logger.info(
        { contestId, taskId },
        `Sync participants from since=${since} lastId=${lastId}`
      )
      const participants = await this.client.participants(contestId, taskId, since, lastId)
      for (const participant of participants) {
        await this.db.participants.updateOne(
          { _id: participant._id },
          { $set: { ...participant, contestId } },
          { upsert: true }
        )
      }
      if (!participants.length) {
        this.logger.info({ contestId, taskId }, `No more participants`)
        break
      }
      since = participants[participants.length - 1].updatedAt
      lastId = participants[participants.length - 1]._id
      if (since >= limit) {
        this.logger.info({ contestId, taskId }, `Reach limit=${limit}`)
        break
      }
    }
    return Math.max(since, limit)
  }

  async poll() {
    const { contestId, taskId, ranklistUpdatedAt, ranklists } = await this.client.poll()
    if (!contestId) return false

    this.logger.info(
      { contestId, taskId },
      `Poll ${ranklists.length} ranklists at ${ranklistUpdatedAt}`
    )

    let limit = ranklistUpdatedAt
    const configDicts = ranklists.map((r) => dotenv.parse(r.settings.config ?? ''))
    const calculators = configDicts.map((dict) =>
      getCalculator(this.db, this.client, this.logger, dict)
    )
    const syncOptions = await Promise.all(
      calculators.map(async (calc, i) => calc && (await calc.loadConfig(configDicts[i])))
    ).then((list) => list.filter((opt): opt is IRanklistSyncOptions => !!opt))
    const shouldSyncParticipants = syncOptions.some((opt) => opt.shouldSyncParticipants)
    const shouldSyncSolutions = syncOptions.some((opt) => opt.shouldSyncSolutions)
    if (shouldSyncParticipants) {
      limit = await this.syncParticipants(contestId, taskId, limit)
    }
    if (shouldSyncSolutions) {
      limit = await this.syncSolutions(contestId, taskId, limit)
    }

    this.logger.info({ contestId, taskId }, `Sync done, calculate ${ranklists.length} ranklists`)

    const urls = await this.client.uploadUrls(contestId, taskId)
    const urlDict = Object.fromEntries(urls.map(({ key, url }) => [key, url]))
    await Promise.all(
      ranklists.map(async (ranklist, index) => {
        const calculator = calculators[index]
        const url = urlDict[ranklist.key]
        if (!calculator || !url) {
          this.logger.warn({ contestId, taskId, key: ranklist.key }, `No calculator or url`)
          return
        }
        const now = performance.now()
        const result = await calculator.calculate(contestId, taskId, ranklist.key)
        this.logger.info(
          { contestId, taskId, key: ranklist.key },
          `Ranklist ${ranklist.key} calculated in ${performance.now() - now}ms`
        )
        await this.client.uploadRanklist(url, result)
      })
    )
    await this.client.complete(contestId, taskId, { ranklistUpdatedAt: limit })
    return true
  }

  async start() {
    this.logger.info(`Start to poll`)
    for (;;) {
      try {
        const success = await this.poll()
        if (!success) {
          await wait(1000)
        }
      } catch (err) {
        this.logger.error(err)
        await wait(1000)
      }
    }
  }
}
