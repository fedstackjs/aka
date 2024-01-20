import {
  IRanklist,
  IRanklistParticipantColumn,
  IRanklistParticipantItem,
  IRanklistParticipantItemColumn,
  IRanklistTopstar,
  IRanklistTopstarItemMutation
} from '../client.js'
import { IRanklistSyncOptions, RanklistCalculator } from './base.js'

export class BasicCalculator extends RanklistCalculator {
  topstars = 0
  warnings = ''

  override async loadConfig(dict: Record<string, string>): Promise<IRanklistSyncOptions> {
    const topstars = +dict.topstars
    if (!Number.isInteger(topstars) || topstars < 0 || topstars > 20) {
      this.warnings += 'topstars must be an integer between 0 and 20\n'
    } else {
      this.topstars = topstars
    }

    return {
      shouldSyncParticipants: true,
      shouldSyncSolutions: !!this.topstars
    }
  }

  override async calculate(contestId: string, taskId: string): Promise<IRanklist> {
    const problems = await this.client.problems(contestId, taskId)
    const problemIdList = problems
      .sort((a, b) => a.settings.slug.localeCompare(b.settings.slug))
      .map((p) => p._id)
    const participants = await this.db.participants.find({ contestId }).toArray()
    const participantRecords = participants
      .map(({ userId, tags, results }) => ({
        userId,
        tags,
        scores: problemIdList.map((pid) => results[pid]?.lastSolution.score ?? 0)
      }))
      .map((record) => ({
        ...record,
        totalScore: record.scores.reduce((a, b) => a + b, 0)
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
              .find({ contestId, userId })
              .sort({ completedAt: 1 })
              .toArray()
            const currentScores: Record<string, number> = Object.create(null)
            const mutations: IRanklistTopstarItemMutation[] = []
            for (const { problemId, score, submittedAt } of solutions) {
              currentScores[problemId] = score
              mutations.push({
                score: Object.values(currentScores).reduce((a, b) => a + b, 0),
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