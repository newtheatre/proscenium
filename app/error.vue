<script setup lang="ts">
import type { NuxtError } from '#app'

interface TheatreMessage {
  statusMessage: string
  message: string
}

interface ErrorMessages {
  404: TheatreMessage[]
  500: TheatreMessage[]
  default: TheatreMessage[]
}

const props = defineProps<{
  error: NuxtError
}>()

// Theatre-themed error messages
const errorMessages: ErrorMessages = {
  404: [
    {
      statusMessage: 'You\'ve wandered backstage...',
      message: 'In amongst the props, lights and wires, we couldn\'t find that for you.',
    },
    {
      statusMessage: 'The curtain\'s closed on this page',
      message: 'Looks like this scene got cut from the final production.',
    },
    {
      statusMessage: 'Wrong exit!',
      message: 'This isn\'t the stage door you\'re looking for. The show\'s happening elsewhere.',
    },
    {
      statusMessage: 'Lost in the wings?',
      message: 'We\'ve searched the entire backstage area, but that page isn\'t in the script.',
    },
  ],
  500: [
    {
      statusMessage: 'Technical difficulties!',
      message: 'The stage crew is working on it. We\'ll have the curtain up again shortly.',
    },
    {
      statusMessage: 'The spotlight\'s gone out...',
      message: 'Our technical team is rushing to replace the bulb. Please stand by.',
    },
    {
      statusMessage: 'A prop malfunction!',
      message: 'Something went wrong with the rigging. Our crew is fixing it backstage.',
    },
    {
      statusMessage: 'Intermission (unscheduled)',
      message: 'We\'re experiencing some technical issues. The show will resume momentarily.',
    },
  ],
  default: [
    {
      statusMessage: 'An unexpected plot twist!',
      message: 'Something went off-script. Our director is reviewing the situation.',
    },
    {
      statusMessage: 'The show must go on...',
      message: 'But first, we need to fix this little mishap behind the scenes.',
    },
  ],
}

/**
 * Get random theatre-themed message based on error code.
 * Uses useState to ensure SSR/client hydration compatibility.
 */
const getTheatreMessage = (errorCode: number | undefined): TheatreMessage => {
  const code = errorCode === 404 || errorCode === 500 ? errorCode : 'default'
  const messages = errorMessages[code as keyof ErrorMessages]

  // useState ensures the same random value is used on server and client
  const randomValue = useState('error-random', () => Math.random())
  const index = Math.floor(randomValue.value * messages.length)

  return messages[index]!
}

const theatreMessage = getTheatreMessage(props.error.statusCode)

// Create enhanced error object with theatre-themed messages
const enhancedError = computed(() => ({
  ...props.error,
  statusMessage: theatreMessage.statusMessage,
  message: theatreMessage.message,
}))
</script>

<template>
  <UApp>
    <AppHeader />
    <UError :error="enhancedError" />
  </UApp>
</template>
