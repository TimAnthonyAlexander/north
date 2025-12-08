# Consolidate DEFAULT_MODEL Constant

## Severity: Minor

## Location
- `src/ui/App.tsx` (line 57)
- `src/provider/anthropic.ts` (line 98)
- `src/commands/models.ts`

## Problem
The default model `claude-sonnet-4-20250514` is defined in at least 3 places, making updates error-prone and inconsistent.

## Solution
1. Export a single `DEFAULT_MODEL` constant from `src/commands/models.ts`
2. Import and use this constant in all other locations
3. Remove hardcoded model strings elsewhere

## Implementation Notes
In `src/commands/models.ts`, ensure:
```typescript
export const DEFAULT_MODEL = "claude-sonnet-4-20250514";
```

In `src/provider/anthropic.ts`:
```typescript
import { DEFAULT_MODEL } from "../commands/models";
// ...
const defaultModel = options?.model || DEFAULT_MODEL;
```

In `src/ui/App.tsx`:
```typescript
import { DEFAULT_MODEL } from "../commands/models";
// ...
const [currentModel, setCurrentModel] = useState<string>(DEFAULT_MODEL);
```

---

**When complete, delete this file: `rm todo/05-consolidate-default-model.md`**

