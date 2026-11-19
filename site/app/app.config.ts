// The New Theatre's colours for Nuxt UI: purple the brand, gold the limelight, ash the stage-black
// neutrals (their scales are in assets/css/nnt.css). Merged over upstream's app config.
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'purple',
      secondary: 'gold',
      neutral: 'ash',
    },
    button: {
      slots: { base: 'font-semibold' },
    },
  },
})
