import {
  IRanklist,
  IRanklistParticipantColumn,
  IRanklistParticipantItem,
  IRanklistParticipantItemColumn,
  IRanklistTopstar,
  IRanklistTopstarItemMutation
} from '../client.js'
import { IRanklistSyncOptions, RanklistCalculator } from './base.js'

export class AcmCalculator extends RanklistCalculator {
  topstars = 0
  warnings = ''
  startTime = 0

  override async loadConfig(dict: Record<string, string>): Promise<IRanklistSyncOptions> {
    const topstars = +dict.topstars
    if (!Number.isInteger(topstars) || topstars < 0 || topstars > 20) {
      this.warnings += 'topstars must be an integer between 0 and 20\n'
    } else {
      this.topstars = topstars
    }

    const startTime = Date.parse(dict.startTime)
    if (Number.isNaN(startTime)) {
      this.warnings += 'startTime is not a valid timestamp\n'
    } else {
      this.startTime = startTime
    }

    return {
      shouldSyncParticipants: true,
      shouldSyncSolutions: true
    }
  }

  private _renderParticipantItemColumn(
    score: number,
    solutionCount: number,
    lastSubmission: number
  ): IRanklistParticipantItemColumn {
    let html = '<div align=center>'
    if (score) {
      html += `<font color=green>+`
      if (solutionCount > 1) {
        html += `${solutionCount - 1}`
      }
      html += `</font><br><code>`
      const delay = Math.floor(Math.max(0, lastSubmission - this.startTime) / 1000 / 60)
      const hours = Math.floor(delay / 60)
      const minutes = delay % 60
      if (hours) {
        html += `${hours}h`
      }
      html += `${minutes}m</code>`
    } else if (solutionCount) {
      html += `<font color=red>-${solutionCount}</font>`
    } else {
      html += `<font color=gray>-</font>`
    }
    html += '</div>'
    return { content: html }
  }

  private _renderPenaltyColumn(penalty: number): IRanklistParticipantItemColumn {
    const format = () => {
      let str = (penalty % 1000) + 'ms'
      if (!(penalty = Math.floor(penalty / 1000))) return str
      str = (penalty % 60) + 's' + str
      if (!(penalty = Math.floor(penalty / 60))) return str
      str = (penalty % 60) + 'm' + str
      if (!(penalty = Math.floor(penalty / 60))) return str
      return penalty + 'h' + str
    }
    return { content: `\`${format()}\`` }
  }

  override async calculate(contestId: string, taskId: string, key: string): Promise<IRanklist> {
    const problems = await this.client.problems(contestId, taskId)
    problems.sort((a, b) => a.settings.slug.localeCompare(b.settings.slug))
    const problemIdList = problems.map((p) => p._id)
    const problemScoreList = problems.map((p) => p.settings.score)
    const participants = await this.db.participants.find({ contestId }).toArray()
    let participantRecords = participants
      .map(({ userId, tags, results }) => ({
        userId,
        tags,
        scores: problemIdList
          .map((pid) => results[pid]?.lastSolution.score ?? 0)
          // In ACM, you will get score only if you get full points XD
          .map((score, i) => ((score === 100 ? 100 : 0) * problemScoreList[i]) / 100),
        lastSubmitTimestamps: problemIdList.map(() => 0),
        solutionCounts: problemIdList.map(() => 0),
        penalty: 0,
        rank: 0
      }))
      .map((record) => ({
        ...record,
        totalScore: record.scores.reduce((a, b) => a + b, 0)
      }))

    // Iterate over all solutons to calculate submit timestamps
    const info = new Map<string, [Record<string, number>, Record<string, number>]>()
    const cursor = this.db.solutions.find({ contestId })
    for await (const { userId, problemId, submittedAt } of cursor) {
      const [userTimestamps, userSolutionCounts] =
        info.get(userId) ??
        info.set(userId, [Object.create(null), Object.create(null)]).get(userId)!
      userTimestamps[problemId] = Math.max(userTimestamps[problemId] ?? 0, submittedAt)
      userSolutionCounts[problemId] = (userSolutionCounts[problemId] ?? 0) + 1
    }
    for (const record of participantRecords) {
      const pair = info.get(record.userId)
      if (!pair) continue
      const [timestamps, solutionCounts] = pair
      for (let i = 0; i < problemIdList.length; ++i) {
        const problemId = problemIdList[i]
        record.lastSubmitTimestamps[i] = timestamps[problemId] ?? 0
        record.solutionCounts[i] = solutionCounts[problemId] ?? 0
        if (record.scores[i]) {
          record.penalty += Math.max(0, timestamps[problemId] - this.startTime)
        }
      }
    }

    participantRecords = participantRecords
      .sort((a, b) =>
        b.totalScore === a.totalScore ? a.penalty - b.penalty : b.totalScore - a.totalScore
      )
      .map((record, index) => ({
        ...record,
        rank: index + 1
      }))

    // Since we calculate penalty in milliseconds, we do not need to consider same rank

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
                score: problemIdList
                  .map((pid, i) => ((currentScores[pid] ?? 0) * problemScoreList[i]) / 100)
                  .reduce((a, b) => a + b, 0),
                ts: submittedAt
              })
            }
            return { userId, mutations }
          })
        )
      }
    }

    if (this.warnings) {
      this.logger.warn({ contestId, taskId, key }, this.warnings)
    }

    return {
      topstar,
      participant: {
        list: participantRecords.map(
          ({
            userId,
            rank,
            tags,
            scores,
            totalScore,
            solutionCounts,
            lastSubmitTimestamps,
            penalty
          }) =>
            ({
              userId,
              rank,
              tags,
              columns: [
                ...scores.map((score, i) =>
                  this._renderParticipantItemColumn(
                    score,
                    solutionCounts[i],
                    lastSubmitTimestamps[i]
                  )
                ),
                { content: `${totalScore}` },
                this._renderPenaltyColumn(penalty)
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
          { name: 'Penalty', description: 'Penalty Time' }
        ]
      },
      metadata: {
        generatedAt: Date.now(),
        description: 'ACM ranklist generated'
      }
    }
  }
}
