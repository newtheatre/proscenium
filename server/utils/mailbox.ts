// Where a development send is written instead of being sent, and the only place that path is
// spelled: the dev tools read exactly what the notification centre wrote (0013, K-124).

// Beside the database it belongs to, so a run against a throwaway hub directory does not read
// mail written for the developer's own one.
const DEV_DIR = process.env.NUXT_HUB_DIR ?? '.data'

export const MAILBOX = `${DEV_DIR}/mail`

// Named for what it is written from rather than what it becomes: `Letter` is the dev tools'
// name for a message read back out of here (`server/utils/dev.ts`).
export interface MailboxMessage {
  to: string
  from: string
  subject: string
  text: string
  attachments?: { filename: string, contentType: string, content: string }[]
}

// One plain file per message, named for the moment and the recipient.
export async function writeToMailbox(letter: MailboxMessage): Promise<void> {
  const { mkdir, writeFile } = await import('node:fs/promises')
  await mkdir(MAILBOX, { recursive: true })
  const stamp = new Date().toISOString().replaceAll(':', '-')
  await writeFile(`${MAILBOX}/${stamp}-${letter.to.replace(/[^a-z0-9]+/gi, '-')}.txt`, [
    `To: ${letter.to}`,
    `From: ${letter.from}`,
    `Subject: ${letter.subject}`,
    ...(letter.attachments ?? []).map(file => `Attachment: ${file.filename} (${file.contentType})`),
    '',
    letter.text,
    ...(letter.attachments ?? []).flatMap(file => ['', `--- ${file.filename} ---`, file.content]),
  ].join('\n'))
}
