// CO-08 and rule G2: the email a new contact gets, saying who added them and for which company. Someone
// who has never signed in gets core's claim link, which signs them in once and opens Your companies.
import { siteUrl } from '#kit'
import type { Actor, UnitOfWork } from '#kit'
import { accountLabel, claimLink, notify } from '#modules/core'
import type { Company } from './companies'

interface Welcome { actor: Actor, company: Company, contactId: string, accountId: string, madeWith?: { address: string } | null }

export async function welcomeContact(unit: UnitOfWork, welcome: Welcome): Promise<void> {
  const { actor, company, contactId, accountId, madeWith } = welcome
  const claim = await claimLink(unit, accountId, madeWith)
  await notify(unit, claim ? 'companies.contact-added-claim' : 'companies.contact-added', {
    to: [{ accountId, ...madeWith ? { address: madeWith.address } : {} }],
    variables: {
      company: company.publicName ?? company.name,
      by: actor.accountId ? await accountLabel(actor.accountId) : 'The theatre',
      link: claim ?? await siteUrl('/account/companies'),
    },
    subject: ['companies.company', company.id],
    dedupeKey: `companies:contact-added:${contactId}`,
  })
}
