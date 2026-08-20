import glob
from pathlib import Path
paths = glob.glob(r"D:/Documents/projects/ai-app/src/routes/chat.*.tsx")
print('paths', paths)
if not paths:
    raise SystemExit(1)
p = Path(paths[0])
lines = p.read_text(encoding="utf-8").splitlines()
for i, line in enumerate(lines, 1):
    if any(k in line for k in ["generateImages", "ImageWorkspace", "activeProvider !== \"fal\"", "provider === \"openrouter\"", "ai_gateway", "getExecutionProviderOptions", "providerFallbackOrder"]):
        print(f"{i}:{line}")
