import { Logger } from 'pino'
import { AkaClient } from '../client.js'
import { AkaDb } from '../db.js'
import { RanklistCalculator } from './base.js'
import { BasicCalculator } from './basic.js'
import { PlusCalculator } from './plus.js'

export const calculators = {
  basic: BasicCalculator,
  plus: PlusCalculator
}

export function getCalculator(
  db: AkaDb,
  client: AkaClient,
  logger: Logger,
  dict: Record<string, string>
): RanklistCalculator | null {
  const type = dict.type ?? 'basic'
  if (!Object.hasOwn(calculators, type)) return null
  return new calculators[type as keyof typeof calculators](db, client, logger)
}
