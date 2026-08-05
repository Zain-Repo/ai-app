export async function readBoundedJson(
  response: Response,
  maximumBytes: number,
  errorMessage: string
): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"))
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes)
    throw new Error(errorMessage)
  if (!response.body) throw new Error(errorMessage)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let receivedBytes = 0
  const textChunks: string[] = []
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      receivedBytes += value.byteLength
      if (receivedBytes > maximumBytes) {
        await reader.cancel()
        throw new Error(errorMessage)
      }
      textChunks.push(decoder.decode(value, { stream: true }))
    }
    textChunks.push(decoder.decode())
    return JSON.parse(textChunks.join("")) as unknown
  } catch (cause) {
    if (cause instanceof Error && cause.message === errorMessage) throw cause
    throw new Error(errorMessage)
  } finally {
    reader.releaseLock()
  }
}
