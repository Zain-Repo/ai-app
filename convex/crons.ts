import { cronJobs } from "convex/server"

import { internal } from "./_generated/api"

const crons = cronJobs()

// Global tombstone cleanup is bounded. Per-owner review and post-undo purges
// are invoked by account/project workflows and can safely be repeated.
crons.hourly("memory tombstone retention", { minuteUTC: 17 }, internal.memoryRetention.run, {})

export default crons
