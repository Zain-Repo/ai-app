with open("convex/memories.ts", "r", encoding="utf-8") as f:
    content = f.read()
old = '  referenceId: v.id("responseMemoryReferences"),'
new = (
    '  referenceId: v.id("responseMemoryReferences"),' +
    '\n  sourceType: v.optional(v.union(v.literal("memory"), v.literal("web"), v.literal("project"))),' +
    '\n  url: v.optional(v.string()),' +
    '\n  title: v.optional(v.string()),' +
    '\n  projectSourceId: v.optional(v.id("projectSources")),'
)
content = content.replace(old, new)
with open("convex/memories.ts", "w", encoding="utf-8") as f:
    f.write(content)
print("Done")
