/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    // Common utility classes for LLM-generated components and YAML templates
    // These ensure classes are available at runtime even if not found in static source files
    
    // Spacing utilities (margins, padding)
    {
      pattern: /^(m|mx|my|mt|mb|ml|mr|p|px|py|pt|pb|pl|pr|gap)-(0|1|2|3|4|5|6|8|10|12|16|20|24)$/,
    },
    
    // Text utilities
    {
      pattern: /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)$/,
    },
    {
      pattern: /^text-(gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900)$/,
    },
    {
      pattern: /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/,
    },
    'font-medium',
    
    // Layout utilities
    'flex', 'flex-col', 'flex-row', 'inline-flex',
    'items-center', 'items-start', 'items-end', 'items-stretch',
    'justify-center', 'justify-start', 'justify-end', 'justify-between',
    'w-full', 'h-full', 'w-auto', 'h-auto',
    'h-9', 'h-11', 'w-10',
    
    // Background and border
    {
      pattern: /^bg-(gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900)$/,
    },
    {
      pattern: /^border-(gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900)$/,
    },
    'rounded', 'rounded-md', 'rounded-lg', 'rounded-xl',
    'border', 'border-2',
    
    // Button-specific (from ShadcnButton)
    'whitespace-nowrap',
    'ring-offset-background',
    'transition-colors',
    'focus-visible:outline-none',
    'focus-visible:ring-2',
    'focus-visible:ring-ring',
    'focus-visible:ring-offset-2',
    'disabled:pointer-events-none',
    'disabled:opacity-50',
    // Custom color utilities (required for Tailwind v4)
    'bg-primary', 'text-primary-foreground', 'hover:bg-primary/90',
    'bg-destructive', 'text-destructive-foreground', 'hover:bg-destructive/90',
    'bg-secondary', 'text-secondary-foreground', 'hover:bg-secondary/80',
    'bg-background', 'bg-accent', 'text-accent-foreground', 'hover:bg-accent',
    'bg-popover', 'text-popover-foreground',
    'border-input', 'text-primary',
    'h-10',
    'px-4',
    'py-2',
    
    // Common interactive states
    'hover:opacity-90', 'hover:opacity-80',
    'cursor-pointer',
    'transition-all',
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
}

