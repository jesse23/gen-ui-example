# Proposal: AI-Driven UI Generation with JSON Schema

## Overview

This proposal describes a system for generating UI from natural language prompts. The key insight: **treat components and actions as tools that AI can reason about and compose**. This turns UI generation into a tool-use problem—something AI models excel at.

---

## Core Principle

**If you treat component inputs and actions as tools, UI generation becomes an AI reasoning problem—which AI is very good at.**

The architecture is built on three concepts:

- **Components** = Tools that take structured inputs (props) and produce UI
- **Actions** = Tools that handle the UI boundary—communication with external systems (server requests, reading/writing data)
- **LLM Engine** = Reasons about which tools to use, how to compose them, and what inputs to provide

Instead of teaching AI UI-specific patterns, we leverage its natural strength in tool-use and reasoning.

---

## How It Works

**Simple Pipeline:**
```
User Prompt → AI selects tools (Components + Actions) → Validates with JSON Schema → Generates React component tree → Browser renders UI
```

**Key Design Decisions:**
- Use JSON Schema (not Zod) to describe components and actions
- Leverage existing `components.ts` registry
- Create parallel `actions.ts` registry for action definitions
- Everything is a tool for AI reasoning

---

## 1. Component Catalog

Define components using JSON Schema. Export from `services/components.ts`:

```typescript
// services/components.ts
export const componentCatalog = {
  Card: {
    props: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string', nullable: true },
      },
      required: ['title'],
    },
    hasChildren: true,
  },
  Button: {
    props: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        action: { type: 'string' },
      },
      required: ['label', 'action'],
    },
  },
};
```

**Why JSON Schema?**
- Universal standard (not TypeScript/Zod specific)
- AI models understand it well
- Language-agnostic

---

## 2. Action Catalog

Create `actions.ts` mirroring the `components.ts` structure:

```typescript
// services/actions.ts
const actionImportMap: Record<string, () => Promise<any>> = {
  submit: () => import('../actions/submit'),
  navigate: () => import('../actions/navigate'),
};

export async function loadAction(name: string): Promise<Function | null> {
  const importFn = actionImportMap[name];
  if (importFn) {
    const module = await importFn();
    return module.default || module[name] || module;
  }
  return null;
}

export function getActionNames(): string[] {
  return Object.keys(actionImportMap);
}

// Action schemas
export const actionCatalog = {
  submit: {
    params: {
      type: 'object',
      properties: {
        formId: { type: 'string' },
      },
      required: ['formId'],
    },
  },
  navigate: {
    params: {
      type: 'object',
      properties: {
        url: { type: 'string' },
      },
      required: ['url'],
    },
  },
};
```

**Action Implementation Example:**
```typescript
// actions/submit.ts
export default async function submit(params: { formId: string }) {
  // Make server request, update external system, etc.
  console.log('Submitting form:', params.formId);
}
```

---

## 3. AI Prompt Generation

Generate a system prompt that presents components and actions as tools:

```typescript
// services/uiDefGenerator.ts
import { componentCatalog } from '@/services/components';
import { actionCatalog } from '@/services/actions';

function generateCatalogPrompt() {
  const componentTools = Object.entries(componentCatalog).map(([name, def]) => ({
    name,
    description: `Component: ${name}`,
    inputSchema: def.props,
    hasChildren: def.hasChildren,
  }));

  const actionTools = Object.entries(actionCatalog).map(([name, def]) => ({
    name,
    description: `Action: ${name}`,
    inputSchema: def.params,
  }));

  return `You are a UI generation assistant. You have access to the following tools:

COMPONENTS (UI building blocks):
${JSON.stringify(componentTools, null, 2)}

ACTIONS (UI boundary - external system communication):
${JSON.stringify(actionTools, null, 2)}

Given a user's request, reason about which components and actions to use, compose them into a React component tree, and provide the correct inputs according to each tool's JSON Schema.

Generate a JSON structure using a flattened format with references...`;
}
```

---

## 4. AI Output Format

The AI generates a **flattened tree structure** where elements are stored in an `elements` object and children are referenced by key.

**Example:** Creating a contact form with name, email, and message fields:

```json
{
  "root": "card",
  "elements": {
    "card": {
      "key": "card",
      "type": "Card",
      "props": {
        "title": "Contact Us",
        "maxWidth": "md"
      },
      "children": ["name", "email", "message", "submit"]
    },
    "name": {
      "key": "name",
      "type": "Input",
      "props": {
        "label": "Name",
        "name": "name"
      }
    },
    "email": {
      "key": "email",
      "type": "Input",
      "props": {
        "label": "Email",
        "name": "email"
      }
    },
    "message": {
      "key": "message",
      "type": "Textarea",
      "props": {
        "label": "Message",
        "name": "message"
      }
    },
    "submit": {
      "key": "submit",
      "type": "Button",
      "props": {
        "label": "Send Message",
        "variant": "primary"
      }
    }
  }
}
```

**Structure:**
- `root`: Key of the root element
- `elements`: Flat object with all elements keyed by unique identifier
- Each element has:
  - `key`: Unique identifier (used for references)
  - `type`: Component type (must match registered component)
  - `props`: Component properties (validated against JSON Schema)
  - `children`: Array of child element keys (references, not nested objects)

**Why this format?**
- Easier for AI to generate correctly (less nesting complexity)
- Prevents circular dependencies
- Easy to validate and transform into React component tree
- Supports efficient rendering and updates

---

## 5. API Route

Set up streaming API route:

```typescript
// app/api/generate/route.ts
import { streamText } from 'ai';
import { generateCatalogPrompt } from '@/services/uiDefGenerator';
import { componentCatalog } from '@/services/components';
import { actionCatalog } from '@/services/actions';

export async function POST(req: Request) {
  const { prompt } = await req.json();
  const systemPrompt = generateCatalogPrompt(componentCatalog, actionCatalog);

  const result = streamText({
    model: 'anthropic/claude-haiku-4.5',
    system: systemPrompt,
    prompt,
  });

  return new Response(result.textStream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
```

---

## 6. Renderer Integration

Use existing rendering infrastructure:

```typescript
// app/page.tsx
'use client';

import { useUIStream } from '@/hooks/useUIStream';
import { Renderer } from '@/components/Renderer';
import { getComponentNames, loadComponent } from '@/services/components';
import { getActionNames, loadAction } from '@/services/actions';

export default function Page() {
  const { tree, isLoading, generate } = useUIStream({
    endpoint: '/api/generate',
  });

  // Build component map from registry
  const componentMap = useMemo(async () => {
    const names = getComponentNames();
    const map = {};
    for (const name of names) {
      map[name] = await loadComponent(name);
    }
    return map;
  }, []);

  // Build action handlers from registry
  const actionHandlers = useMemo(async () => {
    const names = getActionNames();
    const handlers = {};
    for (const name of names) {
      handlers[name] = await loadAction(name);
    }
    return handlers;
  }, []);

  return (
    <div>
      <form onSubmit={(e) => {
        e.preventDefault();
        generate(new FormData(e.currentTarget).get('prompt'));
      }}>
        <input name="prompt" placeholder="Describe what you want..." />
        <button type="submit" disabled={isLoading}>Generate</button>
      </form>

      <Renderer 
        tree={tree} 
        componentMap={componentMap}
        actionHandlers={actionHandlers}
      />
    </div>
  );
}
```

---

## Key Advantages

### 1. **AI-Native Approach**
- Treats UI generation as a tool-use problem (AI's strength)
- JSON Schema is well-understood by AI models
- Clear contracts enable better reasoning

### 2. **Leverages Existing Infrastructure**
- Reuses `components.ts` pattern
- Parallel `actions.ts` structure for consistency
- No need to rewrite component system

### 3. **Language-Agnostic**
- JSON Schema is universal (not TypeScript/Zod specific)
- Can be consumed by any language or system
- Easier to integrate with external tools

### 4. **Separation of Concerns**
- Components = UI building blocks
- Actions = UI boundary (external system communication)
- Clear boundaries and responsibilities

### 5. **Extensibility**
- Easy to add new components (just register in `components.ts`)
- Easy to add new actions (just register in `actions.ts`)
- Schema validation ensures correctness

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Create JSON Schema definitions for existing components
- [ ] Create `actions.ts` registry structure
- [ ] Build catalog generation from registries
- [ ] Create prompt generation utility

### Phase 2: AI Integration
- [ ] Implement streaming API route
- [ ] Create system prompt with tool definitions
- [ ] Parse AI output into component tree structure
- [ ] Validate against JSON schemas

### Phase 3: Rendering
- [ ] Integrate with existing renderer
- [ ] Wire up component map from registry
- [ ] Wire up action handlers from registry
- [ ] Handle data binding and state

### Phase 4: Polish
- [ ] Error handling and validation
- [ ] Streaming UI updates
- [ ] Code export functionality
- [ ] Documentation and examples

---

## Comparison with json-render

| Aspect | json-render | This Proposal |
|--------|-------------|----------------|
| Schema Format | Zod (TypeScript) | JSON Schema (universal) |
| Component Source | Manual catalog | Auto-derived from `components.ts` |
| Actions | Defined in catalog | Separate `actions.ts` registry |
| Philosophy | UI-specific framework | Tool-use reasoning problem |
| Dependencies | @json-render/core, zod | Pure JSON Schema, existing infra |

---

## References

- [json-render Quick Start](https://json-render.dev/docs/quick-start)
- [JSON Schema Specification](https://json-schema.org/)
- Existing `components.ts` implementation
- Existing `GenUiComponent.tsx` rendering infrastructure
