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

    return {
      shouldSyncParticipants: true,
      shouldSyncSolutions: !!this.topstars || this.scoreReduceMethod !== 'override'
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

  override async calculate(contestId: string, taskId: string): Promise<IRanklist> {
    const problems = await this._getProblems(contestId, taskId)
    const problemIdList = problems
      .sort((a, b) => a.settings.slug.localeCompare(b.settings.slug))
      .map((p) => p._id)
    const participants = await this._getParticipants(contestId)
    const participantsWithScores = participants.map(({ userId, tags, results }) => ({
      userId,
      tags,
      scores: problemIdList.map((pid) => results[pid]?.lastSolution.score ?? 0)
    }))
    if (this.scoreReduceMethod !== 'override') {
      // We need to manually calculate the scores
      const scores = new Map<string, Record<string, number>>()
      const cursor = this.db.solutions.find({ contestId, problemId: { $in: problemIdList } })
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
    }
    const participantRecords = participantsWithScores
      .map((record) => ({
        ...record,
        totalScore: record.scores.reduce((a, b) => this._reduceTotal(a, b), 0)
      }))
      .sort((a, b) => b.totalScore - a.totalScore)
      .map((record, index) => ({
        ...record,
        rank: index + 1
      }))

    participantRecords.forEach((record, index, arr) => {
      if (index > 0 && record.totalScore === arr[index - 1].totalScore) {
        record.rank = arr[index - 1].rank
      }
    })

    let topstar: IRanklistTopstar | undefined
    if (this.topstars) {
      const topstarUserIdList = participantRecords
        .slice(0, this.topstars)
        .filter((record) => record.totalScore > 0)
        .map((p) => p.userId)
      topstar = {
        list: await Promise.all(
          topstarUserIdList.map(async (userId) => {
            const solutions = await this.db.solutions
              .find({ contestId, userId, problemId: { $in: problemIdList } })
              .sort({ completedAt: 1 })
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
                score: Object.values(currentScores).reduce((a, b) => this._reduceTotal(a, b), 0),
                ts: submittedAt
              })
            }
            return { userId, mutations }
          })
        )
      }
    }

    return {
      topstar,
      participant: {
        list: participantRecords.map(
          ({ userId, rank, tags, scores, totalScore }) =>
            ({
              userId,
              rank,
              tags,
              columns: [
                ...scores.map(
                  (score) => ({ content: `${score}` }) satisfies IRanklistParticipantItemColumn
                ),
                { content: `${totalScore}` }
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
          { name: 'Total', description: 'Total Score' }
        ]
      },
      metadata: {
        generatedAt: Date.now(),
        description: 'Basic ranklist generated'
      }
    }
  }
}
