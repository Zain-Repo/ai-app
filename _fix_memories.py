import io
content = io.open("convex/memories.ts", "r", encoding="utf-8").read()
content = content.replace('  referenceId: v.id(\
responseMemoryReferences\),', '  referenceId: v.id(\responseMemoryReferences\),\n  sourceType: v.optional(v.union(v.literal(\memory\), v.literal(\web\), v.literal(\project\))),\n  url: v.optional(v.string()),\n  title: v.optional(v.string()),\n  projectSourceId: v.optional(v.id(\projectSources\)),')
content = content.replace('  return {\n    referenceId: reference._id,\n    ...(reference.memoryItemId ? { memoryItemId: reference.memoryItemId } : {}),', '  return {\n    referenceId: reference._id,\n    ...(reference.sourceType ? { sourceType: reference.sourceType } : {}),\n    ...(reference.url ? { url: reference.url } : {}),\n    ...(reference.title ? { title: reference.title } : {}),\n    ...(reference.projectSourceId ? { projectSourceId: reference.projectSourceId } : {}),\n    ...(reference.memoryItemId ? { memoryItemId: reference.memoryItemId } : {}),')
io.open('convex/memories.ts', 'w', encoding='utf-8').write(content)
print('Done')
