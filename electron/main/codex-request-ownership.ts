export class CodexRequestOwnership {
  private readonly owners = new Map<string, number>()

  register(requestId: string, rendererId: number) {
    if (this.owners.has(requestId)) return false
    this.owners.set(requestId, rendererId)
    return true
  }

  release(requestId: string) {
    this.owners.delete(requestId)
  }

  isOwner(requestId: string, rendererId: number) {
    return this.owners.get(requestId) === rendererId
  }
}
