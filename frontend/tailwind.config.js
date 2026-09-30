/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0B0F19',
          800: '#111827',
          700: '#1F2937',
          600: '#374151',
          500: '#4B5563',
        },
        brand: {
          50: '#EEF2FF',
          100: '#E0E7FF',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
        },
        ai: {
          purple: '#8B5CF6',
          cyan: '#06B6D4',
          amber: '#F59E0B',
          rose: '#F43F5E',
          emerald: '#10B981'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        // `animate-in fade-in slide-in-from-bottom-3` in the components came
        // from the tailwindcss-animate plugin, which was never installed: the
        // build emitted no CSS for any of them, so every modal and the toast
        // appeared instantly with no transition.
        //
        // Two details were needed to make these work:
        //   1. Tailwind only generates utilities under the `animate-` prefix, so
        //      the component class names became `animate-fade-in` and
        //      `animate-slide-in-from-bottom-3`. The bare `fade-in` form
        //      resolves to nothing however it is configured.
        //   2. The keyframes are prefixed `anim-`, because a keyframe sharing a
        //      name with the utility that references it makes the utility
        //      self-referential and Tailwind then emits neither.
        'fade-in': 'anim-fade-in 150ms ease-out',
        'slide-in-from-bottom-3': 'anim-slide-up 200ms ease-out',
        'zoom-in-95': 'anim-zoom-in 150ms ease-out',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 10px rgba(99, 102, 241, 0.2)' },
          '100%': { boxShadow: '0 0 25px rgba(99, 102, 241, 0.6)' },
        },
        // `animate-in fade-in slide-in-from-bottom-3` are used by the modals and
        // the toast. They came from the tailwindcss-animate plugin, which was
        // never installed, so every one of those animations was a silent no-op:
        // the build emitted no CSS for the class at all. Defined here directly
        // rather than adding a dependency for three utilities.
        //
        // The keyframes are prefixed `anim-` on purpose. Naming a keyframe the
        // same as the utility that references it makes the utility self-
        // referential, and Tailwind then emits nothing for either.
        'anim-fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'anim-slide-up': {
          from: { transform: 'translateY(0.75rem)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'anim-zoom-in': {
          from: { transform: 'scale(0.96)', opacity: '0' },
          to: { transform: 'scale(1)', opacity: '1' },
        },
      }
    },
  },
  plugins: [],
}
