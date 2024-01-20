import ky, { type KyInstance } from 'ky'
import { version } from '../package.json' assert { type: 'json' }

export interface IAkaClientConfig {
  server: string
  runnerId: string
  runnerKey: string
}

export interface IParticipant {
  _id: string
  userId: string
  contestId: string
  tags?: string[]
  results: Record<
    string,
    {
      solutionCount: number
      lastSolutionId: string
      lastSolution: {
        score: number
        status: string
        completedAt: number
      }
    }
  >
  updatedAt: number
}

export interface ISolution {
  _id: string
  problemId: string
  userId: string
  label: string
  problemDataHash: string
  state: number
  solutionDataHash: string
  score: number
  metrics: Record<string, number>
  status: string
  message: string
  createdAt: number
  submittedAt: number
  completedAt: number
}

export interface IRanklistTopstarItemMutation {
  score: number
  ts: number
}

export interface IRanklistTopstarItem {
  userId: string
  mutations: IRanklistTopstarItemMutation[]
}

export interface IRanklistTopstar {
  list: IRanklistTopstarItem[]
}

export interface IRanklistParticipantColumn {
  name: string
  description: string
}

export interface IRanklistParticipantItemColumn {
  content: string
}

export interface IRanklistParticipantItem {
  rank: number
  userId: string
  tags?: string[]
  columns: IRanklistParticipantItemColumn[]
}

export interface IRanklistParticipant {
  columns: IRanklistParticipantColumn[]
  list: IRanklistParticipantItem[]
}

export interface IRanklistMetadata {
  generatedAt: number
  description: string
}

export interface IRanklist {
  topstar?: IRanklistTopstar
  participant: IRanklistParticipant
  metadata: IRanklistMetadata
}

export class AkaClient {
  http: KyInstance
  constructor(private config: IAkaClientConfig) {
    this.http = ky.create({
      prefixUrl: config.server,
      headers: {
        'X-AOI-Runner-Id': config.runnerId,
        'X-AOI-Runner-Key': config.runnerKey,
        'User-Agent': `Aka/${version}`
      }
    })
  }

  async poll() {
    return this.http.post('api/runner/ranklist/poll').json<{
      taskId: string
      contestId: string
      ranklists: Array<{
        key: string
        name: string
        settings: {
          showAfter?: number
          showBefore?: number
          config?: string
        }
      }>
      ranklistUpdatedAt: number
    }>()
  }

  async complete(contestId: string, taskId: string, payload: { ranklistUpdatedAt: number }) {
    return this.http
      .post(`api/runner/ranklist/task/${contestId}/${taskId}/complete`, { json: payload })
      .json<void>()
  }

  async problems(contestId: string, taskId: string) {
    return this.http.get(`api/runner/ranklist/task/${contestId}/${taskId}/problems`).json<
      Array<{
        _id: string
        title: string
        tags: string[]
        settings: {
          score: number
          slug: string
          solutionCountLimit: number
          showAfter?: number
        }
      }>
    >()
  }

  async participants(contestId: string, taskId: string, since: number, lastId: string) {
    return this.http
      .get(`api/runner/ranklist/task/${contestId}/${taskId}/participants`, {
        searchParams: {
          since,
          lastId
        }
      })
      .json<IParticipant[]>()
  }

  async solutions(contestId: string, taskId: string, since: number, lastId: string) {
    return this.http
      .get(`api/runner/ranklist/task/${contestId}/${taskId}/solutions`, {
        searchParams: {
          since,
          lastId
        }
      })
      .json<ISolution[]>()
  }

  async uploadUrls(contestId: string, taskId: string) {
    return this.http.get(`api/runner/ranklist/task/${contestId}/${taskId}/uploadUrls`).json<
      Array<{
        key: string
        url: string
      }>
    >()
  }

  async uploadRanklist(url: string, ranklist: IRanklist) {
    return ky.put(url, {
      json: ranklist
    })
  }
}
