## Proposal: Pure ESM + Prop Injection Dynamic Component Server (No JSX)

### Overview

This proposal describes a thin, CSP-compliant architecture for dynamically generating React components and rendering them in the browser using pure ES modules with prop-based dependency injection. It supports both **client-only prototyping using Blob URLs** and **server-hosted ES modules** for production. This approach minimizes engineering complexity, avoids JSX compilation, and allows injection of custom logic while supporting multi-tenant or theming variations.

---

### Architecture Summary

**Goal:**

* Minimal engineering surface
* CSP compliant (no eval, no Function, no unsafe-inline)
* Dynamic, server-driven or client-first UI generation
* Inject custom logic easily
* Reuse preloaded client-side components (e.g., shadcn)
* Hot-swap / versioned components
* Avoid JSX; use React.createElement directly to remove compilation step

**Pipeline:**

```
User Intention → Dynamic module (Blob or Server ES Module) → Client imports and renders with props → Browser displays UI
```

---

### Server Responsibilities (Production)

1. Convert user intention or layout definition to React.createElement calls.
2. Generate ES module directly (no JSX compilation required).
3. Serve compiled module at a real URL (e.g., `/dynamic/123.js`).

**Example Generated Module:**

```js
export default ({ Button, Radio }) => {
  return React.createElement('div', { className: 'p-4 bg-gray-100' },
    React.createElement(Button, { className: 'bg-blue-500 text-white px-4 py-2' }, 'Buy'),
    React.createElement(Radio, { className: 'mt-2' }, 'Ship')
  );
};
```

* Components are passed via props; server output remains generic.
* Server can version the module URLs for hot-swap or A/B testing.

---

### Client Responsibilities

1. Preload or provide component map:

```js
const componentMap = {
  Button: ShadcnButton,
  Radio: ShadcnRadio,
  Card: ShadcnCard,
};
```

2. Dynamically import the module (Blob or server URL):

```js
// Blob example (client-first prototyping)
const code = `export default ({ Button }) => React.createElement('div', null, React.createElement(Button, null, 'Hello'));`;
const blob = new Blob([code], { type: 'application/javascript' });
const url = URL.createObjectURL(blob);
const mod = await import(url);

// Server-hosted module (production)
// const mod = await import('/dynamic/123.js');

const Component = mod.default;
ReactDOM.createRoot(el).render(React.createElement(Component, componentMap));
```

**Notes:**

* Blob URLs allow client-only bootstrapping without a server.
* Switching to server-hosted modules is seamless — only the import URL changes.
* Props injection and component reuse remain identical.

---

### CSP Compliance

**Requirements:**

* For server-hosted modules: `script-src 'self';`
* For Blob prototypes: `script-src 'self' blob:`
* Avoid `eval`, `Function`, or inline scripts
* Client only imports real ES modules

**Optional CSP headers example:**

```
Content-Security-Policy: 
  default-src 'self';
  script-src 'self' blob:;
  style-src 'self';
  img-src 'self' data:;
  object-src 'none';
```

---

### CSS Considerations (Tailwind Compatibility)

1. **Static Class Names at Runtime**

   * Dynamic components should reuse pre-defined class strings for styling.
   * Example:

   ```js
   const componentMap = {
     Button: (props) => React.createElement('button', {
       className: 'bg-blue-500 text-white px-4 py-2 rounded',
       ...props
     })
   };
   ```

   * Multiple dynamic modules can reuse the same Button class names for consistent styling.

2. **Precompiled Tailwind CSS**

   * Include all necessary utility classes in the main app CSS.
   * Ensure that any classes used by dynamic modules exist at build time.

3. **Safelisting for Dynamic Classes**

   * If your dynamic modules require classes not present in static source files, use the `safelist` in `tailwind.config.js`:

   ```js
   module.exports = {
     content: ['./src/**/*.{js,ts,jsx,tsx}'],
     safelist: ['bg-blue-500', 'bg-green-500', 'text-white', 'p-4', 'rounded'],
   };
   ```

4. **Mapping for Variants / Theming**

   * Use a runtime mapping table for color or size variants:

   ```js
   const colors = { primary: 'bg-blue-500', secondary: 'bg-green-500' };
   React.createElement(Button, { className: colors[colorProp] }, 'Click');
   ```

   * All possible classes are known at build time → Tailwind retains the styles.

5. **No Shadow DOM Needed**

   * Standard React render tree ensures Tailwind styles apply correctly.

**Summary:**

* Tailwind CSS works seamlessly with runtime dynamic components as long as class names are static strings at runtime, reused from the precompiled CSS, or included via safelist/mapping.
* No need to switch to global CSS.

---

### Pros

* Minimal engineering layer (thin runtime, no DI/virtual module systems)
* Fully CSP compliant
* No JSX compilation required
* TypeScript compatible (server can generate typed createElement calls)
* Hot-swap/versioned modules
* Flexible: custom logic can be passed via props
* Supports multi-tenant/theming variations
* Tailwind CSS compatible with reuse of static class names
* Client-first prototyping via Blob URLs possible

### Cons / Considerations

* Components must be passed as props; cannot tree-shake unused components
* Generated modules rely on client having React runtime loaded
* Complex logic/services require careful prop injection
* Visual builder or runtime DSL is harder to implement without a schema layer
* Blob URLs are ephemeral; server-hosted modules needed for caching/versioning

---

### Optional Extensions

* Inject additional services via props (e.g., analytics, i18n, permissions)
* Versioned UI bundles for hot-swap or A/B testing
* Multi-tenant themed component maps
* Server-side caching for generated ES modules
* Type-safe component map using TypeScript interfaces

---

### Minimal Folder Structure Example

```
/ui/shadcn.js      # Client-side component registry
/dynamic/123.js     # Generated ES module from server (React.createElement)
/dynamic/versions/ # Versioned dynamic modules
```

---

### MVP Milestone Plan

**Phase 1:**

* Client-first prototyping via Blob URLs using React.createElement
* Component map injection
* Client dynamic import + render

**Phase 2:**

* Switch to server-hosted ES modules for production
* Inject custom logic/services via props
* Multi-tenant / theming support
* Hot-swap / versioning

**Phase 3 (Optional):**

* Visual builder
* LLM / AI-assisted UI generation
* Async data binding
* Advanced caching and snapshot/versioning

---

### References / Inspirations

* Retool internal component injection
* Plasmic dynamic React module generation
* Builder.io codegen model
* shadcn component library for preloaded components
