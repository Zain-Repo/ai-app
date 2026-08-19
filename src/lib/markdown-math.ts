type MarkdownFence = {
  length: number
  marker: "`" | "~"
}

function countRun(value: string, start: number, character: string) {
  let cursor = start
  while (value[cursor] === character) cursor += 1
  return cursor - start
}

function getLineEnd(value: string, start: number) {
  const newline = value.indexOf("\n", start)
  return newline === -1 ? value.length : newline
}

function getNextLineStart(value: string, lineEnd: number) {
  return lineEnd < value.length ? lineEnd + 1 : lineEnd
}

function readFenceOpening(value: string, lineStart: number) {
  let cursor = lineStart
  let indentation = 0

  while (value[cursor] === " " && indentation < 4) {
    cursor += 1
    indentation += 1
  }

  if (indentation > 3 || (value[cursor] !== "`" && value[cursor] !== "~"))
    return null

  const marker = value[cursor] as MarkdownFence["marker"]
  const length = countRun(value, cursor, marker)
  if (length < 3) return null

  const lineEnd = getLineEnd(value, cursor + length)
  if (marker === "`" && value.slice(cursor + length, lineEnd).includes("`"))
    return null

  return { fence: { length, marker }, lineEnd }
}

function findFenceEnd(
  value: string,
  openingLineEnd: number,
  fence: MarkdownFence
) {
  let lineStart = getNextLineStart(value, openingLineEnd)

  while (lineStart < value.length) {
    const lineEnd = getLineEnd(value, lineStart)
    let cursor = lineStart
    let indentation = 0

    while (value[cursor] === " " && indentation < 4) {
      cursor += 1
      indentation += 1
    }

    if (indentation <= 3 && value[cursor] === fence.marker) {
      const length = countRun(value, cursor, fence.marker)
      const remainder = value.slice(cursor + length, lineEnd)
      if (length >= fence.length && /^[\t \r]*$/.test(remainder))
        return getNextLineStart(value, lineEnd)
    }

    lineStart = getNextLineStart(value, lineEnd)
  }

  return value.length
}

function findInlineCodeEnd(value: string, start: number, tickCount: number) {
  let cursor = start + tickCount

  while (cursor < value.length) {
    const nextTick = value.indexOf("`", cursor)
    if (nextTick === -1) return value.length

    const closingTickCount = countRun(value, nextTick, "`")
    if (closingTickCount === tickCount) return nextTick + closingTickCount
    cursor = nextTick + closingTickCount
  }

  return value.length
}

function isEscaped(value: string, index: number) {
  let precedingBackslashes = 0
  let cursor = index - 1

  while (cursor >= 0 && value[cursor] === "\\") {
    precedingBackslashes += 1
    cursor -= 1
  }

  return precedingBackslashes % 2 === 1
}

function findClosingDelimiter(
  value: string,
  start: number,
  delimiter: ")" | "]"
) {
  for (let cursor = start; cursor < value.length - 1; cursor += 1) {
    if (
      value[cursor] === "\\" &&
      value[cursor + 1] === delimiter &&
      !isEscaped(value, cursor)
    )
      return cursor
  }

  return -1
}

function hasTextOnLineBefore(value: string, index: number) {
  const lineStart = value.lastIndexOf("\n", index - 1) + 1
  return value.slice(lineStart, index).trim().length > 0
}

function hasTextOnLineAfter(value: string, index: number) {
  const lineEnd = getLineEnd(value, index)
  return value.slice(index, lineEnd).trim().length > 0
}

function normalizePlainText(value: string) {
  let normalized = ""
  let cursor = 0

  while (cursor < value.length) {
    const opener = value[cursor + 1]
    const isOpeningDelimiter =
      value[cursor] === "\\" &&
      (opener === "(" || opener === "[") &&
      !isEscaped(value, cursor)

    if (!isOpeningDelimiter) {
      normalized += value[cursor]
      cursor += 1
      continue
    }

    const closingDelimiter = opener === "(" ? ")" : "]"
    const closingIndex = findClosingDelimiter(
      value,
      cursor + 2,
      closingDelimiter
    )

    if (closingIndex === -1) {
      normalized += value[cursor]
      cursor += 1
      continue
    }

    const content = value.slice(cursor + 2, closingIndex)
    if (opener === "(") {
      normalized += `$${content}$`
    } else {
      const leadingBreak = hasTextOnLineBefore(value, cursor) ? "\n\n" : ""
      const trailingBreak = hasTextOnLineAfter(value, closingIndex + 2)
        ? "\n\n"
        : ""
      normalized += `${leadingBreak}$$\n${content.trim()}\n$$${trailingBreak}`
    }
    cursor = closingIndex + 2
  }

  return normalized
}

/**
 * Converts common LaTeX delimiters emitted by language models into the dollar
 * delimiters supported by Streamdown. Code spans and fenced code blocks remain
 * byte-for-byte unchanged so examples are never interpreted as live math.
 */
export function normalizeMarkdownMath(markdown: string) {
  let normalized = ""
  let plainTextStart = 0
  let cursor = 0

  while (cursor < markdown.length) {
    const isLineStart = cursor === 0 || markdown[cursor - 1] === "\n"
    const fenceOpening = isLineStart ? readFenceOpening(markdown, cursor) : null

    if (fenceOpening) {
      normalized += normalizePlainText(markdown.slice(plainTextStart, cursor))
      const fenceEnd = findFenceEnd(
        markdown,
        fenceOpening.lineEnd,
        fenceOpening.fence
      )
      normalized += markdown.slice(cursor, fenceEnd)
      cursor = fenceEnd
      plainTextStart = fenceEnd
      continue
    }

    if (markdown[cursor] === "`") {
      normalized += normalizePlainText(markdown.slice(plainTextStart, cursor))
      const tickCount = countRun(markdown, cursor, "`")
      const codeEnd = findInlineCodeEnd(markdown, cursor, tickCount)
      normalized += markdown.slice(cursor, codeEnd)
      cursor = codeEnd
      plainTextStart = codeEnd
      continue
    }

    cursor += 1
  }

  normalized += normalizePlainText(markdown.slice(plainTextStart))
  return normalized
}
