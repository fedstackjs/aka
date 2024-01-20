import { MongoClient } from 'mongodb'
import { IParticipant, ISolution } from './client.js'

export interface IAkaDbConfig {
  mongoUrl: string
}

export class AkaDb {
  mongo
  db
  participants
  solutions

  constructor(private config: IAkaDbConfig) {
    this.mongo = new MongoClient(config.mongoUrl)
    this.db = this.mongo.db('aka')
    this.participants = this.db.collection<IParticipant & { contestId: string }>('participants')
    this.solutions = this.db.collection<ISolution & { contestId: string }>('solutions')
  }
}
