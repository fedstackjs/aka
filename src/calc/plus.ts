import { Logger } from 'pino'
import {
  IRanklist,
  IRanklistParticipantColumn,
  IRanklistParticipantItem,
  IRanklistParticipantItemColumn,
  IRanklistTopstar,
  IRanklistTopstarItemMutation
} from '../client.js'
import { IRanklistSyncOptions, RanklistCalculator } from './base.js'

const reduceMethods = ['override', 'max', 'min'] as const
type ReduceMethod = (typeof reduceMethods)[number]

const totalReduceMethods = ['sum', 'max', 'min'] as const
type TotalReduceMethod = (typeof totalReduceMethods)[number]

export class PlusCalculator extends RanklistCalculator {
  topstars = 0
  warnings = ''
  participantTagWhitelist?: string[]
  participantTagBlacklist?: string[]
  problemTagWhitelist?: string[]
  problemTagBlacklist?: string[]
  problemSlugFilter?: RegExp
  problemTitleFilter?: RegExp
  scoreReduceMethod: ReduceMethod = 'override'
  totalReduceMethod: TotalReduceMethod = 'sum'
  private _reduceScore = (a: number, b: number) => b
  private _reduceTotal = (a: number, b: number) => a + b
  showOriginalScore = false
  showProblemScore = false
  showLastSubmission = false
  sameRankForSameScore = false
  submittedBefore?: number
  submittedAfter?: number

  override async loadConfig(dict: Record<string, string>): Promise<IRanklistSyncOptions> {
    const topstars = +dict.topstars
    if (!Number.isInteger(topstars) || topstars < 0 || topstars > 20) {
      this.warnings += 'topstars must be an integer between 0 and 20\n'
    } else {
      this.topstars = topstars
    }

    this._loadFilterConfig(dict)
    this._loadScoreReduceConfig(dict)
    this._loadTotalReduceConfig(dict)
    this._loadRenderConfig(dict)

    return {
      shouldSyncParticipants: true,
      shouldSyncSolutions: true
    }
  }

  private _loadRenderConfig(dict: Record<string, string>) {
    if (dict.showOriginalScore) {
      this.showOriginalScore = !!+dict.showOriginalScore
    }
    if (dict.showProblemScore) {
      this.showProblemScore = !!+dict.showProblemScore
    }
    if (dict.showLastSubmission) {
      this.showLastSubmission = !!+dict.showLastSubmission
    }
    if (dict.sameRankForSameScore) {
      this.sameRankForSameScore = !!+dict.sameRankForSameScore
    }
  }

  private _loadTotalReduceConfig(dict: Record<string, string>) {
    if (dict.totalReduceMethod) {
      if (totalReduceMethods.includes(dict.totalReduceMethod as TotalReduceMethod)) {
        this.totalReduceMethod = dict.totalReduceMethod as TotalReduceMethod
        switch (this.totalReduceMethod) {
          case 'sum':
            this._reduceTotal = (a, b) => a + b
            break
          case 'max':
            this._reduceTotal = Math.max
            break
          case 'min':
            this._reduceTotal = Math.min
            break
        }
      } else {
        this.warnings += `totalReduceMethod must be one of ${totalReduceMethods.join(', ')}\n`
      }
    }
  }

  private _loadScoreReduceConfig(dict: Record<string, string>) {
    if (dict.scoreReduceMethod) {
      if (reduceMethods.includes(dict.scoreReduceMethod as ReduceMethod)) {
        this.scoreReduceMethod = dict.scoreReduceMethod as ReduceMethod
        switch (this.scoreReduceMethod) {
          case 'override':
            this._reduceScore = (a, b) => b
            break
          case 'max':
            this._reduceScore = Math.max
            break
          case 'min':
            this._reduceScore = Math.min
            break
        }
      } else {
        this.warnings += `scoreReduceMethod must be one of ${reduceMethods.join(', ')}\n`
      }
    }
  }

  private _loadFilterConfig(dict: Record<string, string>) {
    if (dict.participantTagWhitelist) {
      this.participantTagWhitelist = dict.participantTagWhitelist.split(',')
    }
    if (dict.participantTagBlacklist) {
      this.participantTagBlacklist = dict.participantTagBlacklist.split(',')
    }
    if (dict.problemTagWhitelist) {
      this.problemTagWhitelist = dict.problemTagWhitelist.split(',')
    }
    if (dict.problemTagBlacklist) {
      this.problemTagBlacklist = dict.problemTagBlacklist.split(',')
    }
    if (dict.problemSlugFilter) {
      this.problemSlugFilter = new RegExp(dict.problemSlugFilter)
    }
    if (dict.problemTitleFilter) {
      this.problemTitleFilter = new RegExp(dict.problemTitleFilter)
    }
    if (dict.submittedBefore) {
      const submittedBefore = Date.parse(dict.submittedBefore)
      if (Number.isNaN(submittedBefore)) {
        this.warnings += 'submittedBefore is not a valid timestamp\n'
      } else {
        this.submittedBefore = submittedBefore
      }
    }
    if (dict.submittedAfter) {
      const submittedAfter = Date.parse(dict.submittedAfter)
      if (Number.isNaN(submittedAfter)) {
        this.warnings += 'submittedAfter is not a valid timestamp\n'
      } else {
        this.submittedAfter = submittedAfter
      }
    }
  }

  private async _getProblems(contestId: string, taskId: string) {
    let problems = await this.client.problems(contestId, taskId)
    const { problemTagWhitelist, problemTagBlacklist, problemSlugFilter, problemTitleFilter } = this
    if (problemTagWhitelist) {
      problems = problems.filter((p) => p.tags.some((t) => problemTagWhitelist.includes(t)))
    }
    if (problemTagBlacklist) {
      problems = problems.filter((p) => !p.tags.some((t) => problemTagBlacklist.includes(t)))
    }
    if (problemSlugFilter) {
      problems = problems.filter((p) => problemSlugFilter.test(p.settings.slug))
    }
    if (problemTitleFilter) {
      problems = problems.filter((p) => problemTitleFilter.test(p.title))
    }
    return problems
  }

  private async _getParticipants(contestId: string) {
    let participants = await this.db.participants.find({ contestId }).toArray()
    const { participantTagWhitelist, participantTagBlacklist } = this
    if (participantTagWhitelist) {
      participants = participants.filter(
        (p) => p.tags && p.tags.some((t) => participantTagWhitelist!.includes(t))
      )
    }
    if (participantTagBlacklist) {
      participants = participants.filter(
        (p) => !p.tags || !p.tags.some((t) => participantTagBlacklist!.includes(t))
      )
    }
    return participants
  }

  private _renderParticipantItemColumn(
    score: number,
    problemScore: number
  ): IRanklistParticipantItemColumn {
    if (this.showProblemScore) return { content: `\`${score}/${problemScore}\`` }
    return { content: `${score}` }
  }

  private _formatDate(ts: number) {
    const date = new Date(ts)
    const iso = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString()
    return iso.replace(/-/g, '').replace('T', ' ').slice(0, -1)
  }

  private _renderDate(ts: number) {
    return `\`${this._formatDate(ts)}\``
  }

  override async calculate(contestId: string, taskId: string, key: string): Promise<IRanklist> {
    const logger = this.logger.child({ contestId, taskId, key })
    logger.info('Start to calculate ranklist')

    const problems = await this._getProblems(contestId, taskId)
    problems.sort((a, b) => a.settings.slug.localeCompare(b.settings.slug))
    const problemIdList = problems.map((p) => p._id)
    const problemScoreList = problems.map((p) => p.settings.score)
    const participants = await this._getParticipants(contestId)
    const participantsWithScores = participants.map(({ userId, tags, results }) => ({
      userId,
      tags,
      scores: problemIdList.map((pid) => results[pid]?.lastSolution.score ?? 0),
      lastSubmission: 0
    }))
    logger.info(`Loaded ${problems.length} problems and ${participants.length} participants`)

    await this._calculateLastSubmission(logger, contestId, problemIdList, participantsWithScores)
    await this._calculateScores(logger, contestId, problemIdList, participantsWithScores)

    if (!this.showOriginalScore) {
      for (const participant of participantsWithScores) {
        participant.scores = participant.scores.map(
          (score, i) => (score * problemScoreList[i]) / 100
        )
      }
    }

    const participantRecords = participantsWithScores
      .map((record) => ({
        ...record,
        totalScore: (this.showOriginalScore
          ? record.scores.map((score, i) => (score * problemScoreList[i]) / 100)
          : record.scores
        ).reduce((a, b) => this._reduceTotal(a, b), 0)
      }))
      .sort((a, b) =>
        // First sort by totalScore DESC, then by updatedAt ASC
        b.totalScore === a.totalScore
          ? a.lastSubmission - b.lastSubmission
          : b.totalScore - a.totalScore
      )
      .map((record, index) => ({
        ...record,
        rank: index + 1
      }))

    if (this.sameRankForSameScore) {
      participantRecords.forEach((record, index, arr) => {
        if (index > 0 && record.totalScore === arr[index - 1].totalScore) {
          record.rank = arr[index - 1].rank
        }
      })
    }

    let topstar: IRanklistTopstar | undefined
    if (this.topstars) {
      topstar = await this._calculateTopstars(
        logger,
        participantRecords,
        contestId,
        problemIdList,
        problemScoreList
      )
    }

    const now = performance.now()
    logger.info(`Start to generate ranklist object`)

    let description = 'Ranklist generated with type `plus`\n'
    if (this.warnings) {
      this.logger.warn({ contestId, taskId, key }, `Generated with warnings:\n${this.warnings}`)
      description += `Warnings:\n\`\`\`\n${this.warnings}\`\`\``
    }

    const problemTotalScore = problemScoreList.reduce((a, b) => this._reduceTotal(a, b), 0)

    const ranklist: IRanklist = {
      topstar,
      participant: {
        list: participantRecords.map(
          ({ userId, rank, tags, scores, totalScore, lastSubmission }) =>
            ({
              userId,
              rank,
              tags,
              columns: [
                ...scores.map((score, i) =>
                  this._renderParticipantItemColumn(
                    score,
                    this.showOriginalScore ? 100 : problemScoreList[i]
                  )
                ),
                this._renderParticipantItemColumn(totalScore, problemTotalScore),
                ...(this.showLastSubmission ? [{ content: this._renderDate(lastSubmission) }] : [])
              ]
            }) satisfies IRanklistParticipantItem
        ),
        columns: [
          ...problems.map(
            ({ title, settings: { slug } }) =>
              ({
                name: slug,
                description: title
              }) satisfies IRanklistParticipantColumn
          ),
          { name: 'Total', description: 'Total Score' },
          ...(this.showLastSubmission
            ? [{ name: 'Last Submit', description: 'Last Submission Time' }]
            : [])
        ]
      },
      metadata: {
        generatedAt: Date.now(),
        description
      }
    }

    logger.info(`Generated ranklist object in ${performance.now() - now}ms`)

    return ranklist
  }

  private async _calculateTopstars(
    logger: Logger,
    participantRecords: {
      rank: number
      totalScore: number
      userId: string
      tags: string[] | undefined
      scores: number[]
      lastSubmission: number
    }[],
    contestId: string,
    problemIdList: string[],
    problemScoreList: number[]
  ): Promise<IRanklistTopstar> {
    const now = Date.now()
    logger.info('Calculating topstars')

    const topstarUserIdList = participantRecords
      .slice(0, this.topstars)
      .filter((record) => record.totalScore > 0)
      .map((p) => p.userId)
    const topstar: IRanklistTopstar = {
      list: await Promise.all(
        topstarUserIdList.map(async (userId) => {
          const solutions = await this.db.solutions
            .find(
              {
                contestId,
                userId,
                problemId: { $in: problemIdList },
                submittedAt: {
                  $gte: this.submittedAfter,
                  $lt: this.submittedBefore
                }
              },
              { ignoreUndefined: true }
            )
            .sort({ submittedAt: 1 })
            .toArray()
          const currentScores: Record<string, number> = Object.create(null)
          const mutations: IRanklistTopstarItemMutation[] = []
          for (const { problemId, score, submittedAt } of solutions) {
            if (Object.hasOwn(currentScores, problemId)) {
              currentScores[problemId] = this._reduceScore(currentScores[problemId], score)
            } else {
              currentScores[problemId] = score
            }
            mutations.push({
              score: problemIdList
                .map((pid, i) => ((currentScores[pid] ?? 0) * problemScoreList[i]) / 100)
                .reduce((a, b) => this._reduceTotal(a, b), 0),
              ts: submittedAt
            })
          }
          return { userId, mutations }
        })
      )
    }
    logger.info(`Calculated topstars in ${Date.now() - now}ms`)
    return topstar
  }

  private async _calculateScores(
    logger: Logger,
    contestId: string,
    problemIdList: string[],
    participantsWithScores: {
      userId: string
      tags: string[] | undefined
      scores: number[]
      lastSubmission: number
    }[]
  ) {
    logger.info('Calculating scores')
    const start = performance.now()
    const scores = new Map<string, Record<string, number>>()
    const cursor = this.db.solutions.find(
      {
        contestId,
        problemId: { $in: problemIdList },
        submittedAt: {
          $gte: this.submittedAfter,
          $lt: this.submittedBefore
        }
      },
      { ignoreUndefined: true }
    )
    for await (const solution of cursor) {
      const { userId, problemId, score } = solution
      if (!scores.has(userId)) {
        scores.set(userId, Object.create(null))
      }
      const userScores = scores.get(userId)!
      if (Object.hasOwn(userScores, problemId)) {
        userScores[problemId] = this._reduceScore(userScores[problemId], score)
      } else {
        userScores[problemId] = score
      }
    }
    for (const participant of participantsWithScores) {
      const userScores = scores.get(participant.userId) ?? Object.create(null)
      participant.scores = problemIdList.map((pid) => userScores[pid] ?? 0)
    }
    logger.info(`Calculated scores in ${performance.now() - start}ms`)
  }

  private async _calculateLastSubmission(
    logger: Logger,
    contestId: string,
    problemIdList: string[],
    participantsWithScores: {
      userId: string
      tags: string[] | undefined
      scores: number[]
      lastSubmission: number
    }[]
  ) {
    logger.info('Calculating lastSubmission')
    const start = performance.now()
    const lastSubmissions = new Map<string, number>()
    const cursor = this.db.solutions.find(
      {
        contestId,
        problemId: { $in: problemIdList },
        submittedAt: {
          $gte: this.submittedAfter,
          $lt: this.submittedBefore
        }
      },
      { ignoreUndefined: true }
    )
    for await (const solution of cursor) {
      const { userId, submittedAt } = solution
      if (lastSubmissions.has(userId)) {
        lastSubmissions.set(userId, Math.max(lastSubmissions.get(userId)!, submittedAt))
      } else {
        lastSubmissions.set(userId, submittedAt)
      }
    }
    for (const participant of participantsWithScores) {
      participant.lastSubmission = lastSubmissions.get(participant.userId) ?? 0
    }
    logger.info(`Calculated lastSubmission in ${performance.now() - start}ms`)
  }
}
