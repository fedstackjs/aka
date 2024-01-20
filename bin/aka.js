#!/usr/bin/env node
// @ts-check

import 'dotenv/config.js'
import { Aka } from '../lib/index.js'

const ENV_PREFIX = process.env.AKA_ENV_PREFIX ?? 'AKA_'

/**
 * @template T
 * @template {[] | [T]} S
 * @param {string} key
 * @param {(value: string) => T} transform
 * @param {S} defaultValue
 * @return {T}
 */
function loadEnv(key, transform, ...defaultValue) {
  key = ENV_PREFIX + key
  if (!(key in process.env)) {
    if (defaultValue.length > 0) {
      return /** @type {T} */ (defaultValue[0])
    }
    throw new Error(`Missing env ${key}`)
  }
  const value = process.env[key]
  return transform(value ?? '')
}

const aka = new Aka({
  client: {
    server: loadEnv('SERVER', String),
    runnerId: loadEnv('RUNNER_ID', String),
    runnerKey: loadEnv('RUNNER_KEY', String)
  },
  db: {
    mongoUrl: loadEnv('MONGO_URL', String)
  }
})

aka.start()
