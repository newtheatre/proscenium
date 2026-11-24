import { festive } from '../../state'

export default { component: 'FestiveFront', appliesWhen: async () => festive.on }
