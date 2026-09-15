import { bar } from './bar'
import { boxOffice } from './box-office'
import { communications } from './communications'
import { gettingStarted } from './getting-started'
import { members } from './members'
import { money } from './money'
import { people } from './people'
import { rota } from './rota'
import { showNight } from './show-night'
import { spaces } from './spaces'
import { system } from './system'
import { training } from './training'
import type { Shot } from './types'

// One manifest per section of the wiki, in the order the sidebar shows them.
export const SHOTS: Shot[] = [
  ...gettingStarted,
  ...members,
  ...showNight,
  ...boxOffice,
  ...bar,
  ...spaces,
  ...rota,
  ...training,
  ...people,
  ...money,
  ...communications,
  ...system,
]
