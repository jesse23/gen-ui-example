# Imports Flow Analysis

## Overview
This document explains how component imports are prepared and used in each step of the compilation flow.

---

## 1. PREPARATION PHASE: `loadImportsFromView()`

**Location:** Lines 557-595

**Process:**
1. **Extract elements** from view HTML using `extractElementNames(view)`
   - Parses HTML with DOMParser
   - Traverses DOM tree to collect all tag names
   - Returns `Set<string>` of unique tag names

2. **For each tagName:**
   - Convert to CamelCase: `toCamelCase(tagName)` → `camelName`
   - Check registry: `hasComponent(camelName)`
   - If found in registry:
     - Load component: `await loadComponent(camelName)`
     - Store in `importMap` under: `importMap[camelName]` = component
   - If NOT found: Skip (will use tagName as OOTB element)

3. **Wait for all loads** to complete with `Promise.all()`

4. **Return** `importMap: Record<string, any>`

**Key Point:** Components are stored under CamelCase keys (matching registry format). This is consistent with how imports were defined in YAML before.

---

## 2. USAGE IN INLINE/SANDBOX STRATEGY

### Step 2.1: Component Creation (`createComponent`)
**Location:** Lines 663-736

**State Management:**
```typescript
const [imports, setImports] = React.useState<Record<string, any>>({})
```

**Loading (useEffect):**
- **Line 698:** Calls `loadImportsFromView(config.view)`
- **Line 701:** Stores result in state: `setImports(imports)`
- **Dependency:** `[config.view]` - reloads when view changes

### Step 2.2: Verification (`checkImportsLoaded()`)
**Location:** Lines 601-652

**Process:**
1. Extract elements from view again
2. For each element:
   - Convert to CamelCase: `toCamelCase(tagName)` → `camelName`
   - Check if exists in registry: `hasComponent(camelName)`
   - If registered, add `camelName` to `componentsToCheck` array
3. Verify all checked components exist in `imports` map (using `camelName` keys)
4. Return `true` if all loaded, `false` otherwise

**Used at:** Line 724 - blocks rendering until components are loaded

### Step 2.3: Rendering (`renderTemplate()`)
**Location:** Lines 940-993 (inline component)

**Process:**
1. Parse view HTML with DOMParser
2. For each element node:
   - Get `tagName` (lowercase from HTML)
   - Call `resolveComponent(tagName, imports)` (Line 956 in inline component)
   - `resolveComponent()` process:
     - Converts `tagName` to CamelCase: `toCamelCase(tagName)` → `camelName`
     - Checks `imports[camelName]`:
       - If found → return component
       - If not found → return `tagName` (OOTB element)
3. Create React element with resolved component

**Key Point:** `resolveComponent()` converts tagName to CamelCase before lookup, matching the importMap key format (CamelCase).

### Step 2.4: Expression Evaluation
**Location:** Lines 1013-1036

**Note:** Components are NOT part of expression context anymore (removed in recent refactor).
- Only `data` is in context
- Components are HTML elements, not JavaScript expressions

---

## 3. USAGE IN BLOB STRATEGY

### Step 3.1: Compile-Time Analysis (`compileTemplateToJS()`)
**Location:** Lines 743-909

**Process:**
1. **Prebuild component map** (Lines 748-754):
   ```typescript
   const componentMap = new Map<string, { isRegistered: boolean; camelName: string }>()
   elementNames.forEach(tagName => {
     const camelName = toCamelCase(tagName)
     componentMap.set(tagName, { 
       isRegistered: hasComponent(camelName), 
       camelName 
     })
   })
   ```
   - Extracts elements from view
   - Converts to CamelCase
   - Checks registry at COMPILE TIME
   - Stores both registration status and camelName for code generation

2. **Generate JavaScript code** (Lines 840-844):
   ```javascript
   const componentInfo = componentMap.get(tagName)
   const component = componentInfo?.isRegistered
     ? `(imports[${JSON.stringify(componentInfo.camelName)}] || ${JSON.stringify(tagName)})`
     : JSON.stringify(tagName)
   ```
   - Uses prebuilt map to determine if component is registered
   - Generates code that references `imports[camelName]` at runtime (matching importMap format)
   - Fallback to `tagName` if not in imports

**Key Point:** Component resolution logic is baked into generated code at compile time.

### Step 3.2: Runtime Loading
**Location:** Same as INLINE/SANDBOX (Lines 698-701)

**Process:**
- The generated blob code still calls `createComponent()`
- `createComponent()` has the same `useEffect` that calls `loadImportsFromView()`
- So runtime loading is identical to INLINE/SANDBOX strategy

**Key Point:** Even though we prebuild the map at compile time, we still need to load components at runtime.

---

## 4. SUMMARY: Flow Comparison

### INLINE/SANDBOX Strategy:
```
1. Runtime: loadImportsFromView() → builds importMap (stores under camelName)
2. Runtime: checkImportsLoaded() → verifies all loaded (checks camelName)
3. Runtime: renderTemplate() → resolveComponent(tagName, imports) 
   → converts tagName to camelName → imports[camelName]
```

### BLOB Strategy:
```
1. Compile-time: Build componentMap (tagName → { isRegistered, camelName })
2. Compile-time: Generate JS code with imports[camelName] references
3. Runtime: loadImportsFromView() → builds importMap (same as INLINE, stores under camelName)
4. Runtime: Generated code uses imports[camelName] from loaded map
```

---

## 5. KEY INSIGHTS

1. **Single Source of Truth:** `loadImportsFromView()` is the ONLY place that loads components
   - Called once per component lifecycle
   - Stores components under CamelCase keys (matching registry format)
   - Consistent with how imports were defined in YAML (CamelCase)

2. **Consistent Lookup:** `resolveComponent()` converts tagName to CamelCase before lookup
   - Converts `tagName` → `camelName` using `toCamelCase()`
   - Looks up `imports[camelName]` (matches importMap key format)
   - Falls back to `tagName` for OOTB elements/web components

3. **BLOB Optimization:** Prebuilds component map at compile time
   - Knows which elements are registered components
   - Stores both registration status and camelName for code generation
   - Generates optimized code with `imports[camelName]` references
   - Still needs runtime loading (components aren't bundled)

4. **No Expression Context:** Components are NOT in expression evaluation context
   - They're HTML elements, not JavaScript variables
   - Only `data` and `actions` are in expression context

---

## 6. DESIGN DECISIONS

1. **CamelCase Storage:** Components are stored under CamelCase keys in importMap
   - Matches registry format (components registered as CamelCase)
   - Consistent with previous YAML imports format
   - Requires conversion at lookup time (tagName → camelName)

2. **Conversion at Lookup:** `resolveComponent()` converts tagName to camelName
   - HTML uses lowercase/kebab-case tag names
   - Registry uses CamelCase component names
   - Conversion bridges the gap between HTML and registry formats

3. **BLOB Still Loads at Runtime:** Even though we know components at compile time, we still load them at runtime
   - Components are dynamically imported (code splitting)
   - Not bundled into the main application
   - Runtime loading enables lazy loading and smaller initial bundle
